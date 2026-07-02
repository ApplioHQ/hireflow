// ===== HireFlow Cloudflare Worker =====
// Auth + AI + Stripe billing + plan gating
//
// Endpoints:
//   Auth:    POST /auth/signup, POST /auth/login
//   User:    GET  /me                                  → { email, plan, downloadsUsed, downloadLimit }
//   Resume:  GET  /resume,  POST /resume
//   AI:      POST /ai/{improve,skills,tailor,ats,analyze,parse,interview}  (Premium+ only except 'improve' on summary)
//   Billing: POST /stripe/checkout  { plan: "premium" | "lifetime" }  → { url }
//            POST /stripe/portal                                       → { url }
//            POST /stripe/webhook                                      (Stripe → us)
//   Usage:   POST /downloads/increment                                  → { ok, downloadsUsed, allowed }

// Fast, reliable default for short rewrites/bullets.
const FAST_MODEL = "@cf/meta/llama-3.1-8b-instruct";
// Capable model for tailoring/ATS/analysis (more reasoning, still reliable).
const SMART_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Last-resort model that is always tried if the others error or come back empty.
const FALLBACK_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// AI endpoints that require Premium/Lifetime after the free-trial allowance.
// "parse" (Resume Import) gives free users 2 free imports (FREE_AI_TRIALS), then
// paywalls, same trial system as the other AI features.
// Interview prep (questions + answer feedback) stays free for everyone.
const PRO_AI = new Set(["tailor", "ats", "analyze", "skills", "improve", "parse"]);

// Shared grounding rule prepended to every generative prompt. Keeps the model
// honest (no fabricated facts) and terse (lower output token cost).
const GROUND_RULE = `STRICT GROUNDING, read first:
- Use ONLY facts the candidate actually provided. Never invent jobs, employers, projects, tools, certifications, degrees, metrics, or achievements they did not state (e.g. don't add "Created a GitHub project" if it's not in their input).
- Never fabricate or estimate numbers (%, $, headcount, scale, dates). If the input has no metric, keep it qualitative.
- If something isn't in the input, omit it, do not guess.
- NEVER use the candidate's name. For any feedback/commentary ABOUT the resume, address the reader directly as "you"/"your" ("Your resume highlights…"), never third person ("Jane's resume…", "The candidate's resume…"). When writing resume CONTENT itself (a summary or bullet points), use standard resume voice, no name, no "I", no "you".
- Be concise: no preamble, no restating the task, no filler. Shortest output that fully answers.
- Punctuation: never use em dashes. Use commas, periods, parentheses, or colons instead, so the writing reads naturally.`;

// Structured single-line JSON logging. Makes Cloudflare logs (wrangler tail /
// dashboard) queryable instead of free-text. NEVER pass passwords, tokens, or
// Stripe secrets in `data`.
function log(level, event, data = {}) {
  const line = JSON.stringify({ level, event, timestamp: Date.now(), ...data });
  if (level === "error") console.error(line);
  else console.log(line);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const cors = corsHeaders(env, req);

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    // Liveness/readiness probe, no auth, must stay fast (<500ms).
    if (path === "/health") return withCors(await healthCheck(env), cors);

    // Stripe webhook gets raw body, handle before JSON parsing
    if (path === "/stripe/webhook") {
      return handleWebhook(req, env).then(r => withCors(r, cors)).catch(e => withCors(json({ error: e.message }, e.status || 500), cors));
    }

    try {
      if (path === "/auth/signup")             return json(await signup(req, env), 200, cors);
      if (path === "/auth/login")              return json(await login(req, env), 200, cors);
      if (path === "/me")                      return json(await me(req, env), 200, cors);
      if (path === "/me/sync")                 return json(await syncWithStripe(req, env), 200, cors);
      if (path === "/resume" && req.method === "GET")  return json(await getResume(req, env), 200, cors);
      if (path === "/resume" && req.method === "POST") return json(await saveResume(req, env), 200, cors);
      if (path === "/downloads/increment")     return json(await incrementDownload(req, env), 200, cors);
      if (path === "/feedback" && req.method === "POST") return json(await submitFeedback(req, env), 200, cors);
      if (path === "/feedback/list" && req.method === "GET") return json(await listFeedback(req, env), 200, cors);
      if (path === "/stripe/checkout")         return json(await createCheckout(req, env), 200, cors);
      if (path === "/stripe/portal")           return json(await createPortal(req, env), 200, cors);
      if (path.startsWith("/ai/"))             return json(await ai(req, env, path.slice(4)), 200, cors);
      return json({ error: "Not found" }, 404, cors);
    } catch (e) {
      return json({ error: e.message || "Error" }, e.status || 500, cors);
    }
  },
};

// ============ Helpers ============
function corsHeaders(env, req) {
  const allowed = (env.ALLOWED_ORIGIN || "*").split(",").map(s => s.trim());
  const reqOrigin = req && req.headers.get("Origin");
  let origin = "*";
  if (allowed.includes("*")) origin = "*";
  else if (reqOrigin && allowed.includes(reqOrigin)) origin = reqOrigin;
  else origin = allowed[0];
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", ...headers },
  });
}
function withCors(res, cors) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}
function err(status, message) { const e = new Error(message); e.status = status; return e; }

// ============ Rate limiting ============
// Fixed-window rate limiter backed by KV (no extra bindings). The counter and its
// window-reset timestamp are stored together; the whole entry auto-expires via
// expirationTtl. Every call increments the counter, successes count too, so the
// limit can't be bypassed by alternating valid/invalid attempts; only the passage
// of `windowSeconds` resets it. KV is eventually consistent, so this is best-effort
// throttling (good enough to blunt credential stuffing), not a hard guarantee.
// Returns true if the request is allowed, false if the limit is exceeded.
async function checkRateLimit(env, key, maxAttempts, windowSeconds) {
  const now = Date.now();
  let entry = null;
  try { entry = JSON.parse((await env.HIREFLOW_KV.get(key)) || "null"); } catch {}
  // Start a fresh window if there's no entry or the previous window has elapsed.
  if (!entry || typeof entry.resetAt !== "number" || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowSeconds * 1000 };
  }
  if (entry.count >= maxAttempts) return false;
  entry.count += 1;
  // TTL tracks the remaining window so it doesn't slide forward on each attempt.
  // KV's minimum expirationTtl is 60s; our windows (300s / 600s) are safely above it.
  const ttl = Math.max(60, Math.ceil((entry.resetAt - now) / 1000));
  await env.HIREFLOW_KV.put(key, JSON.stringify(entry), { expirationTtl: ttl });
  return true;
}

// ============ Health check ============
// Cheap probe used by uptime monitors / load balancers. Verifies KV with a tiny
// write+read and only checks that the AI binding exists (a real inference would be
// too slow/expensive for a health check). Returns 200 when healthy, 503 if degraded.
async function healthCheck(env) {
  const checks = { kv: "ok", ai: "ok" };
  try {
    await env.HIREFLOW_KV.put("health:ping", String(Date.now()), { expirationTtl: 60 });
    const v = await env.HIREFLOW_KV.get("health:ping");
    if (v == null) checks.kv = "error: read returned null";
  } catch (e) {
    checks.kv = "error: " + (e.message || "kv unavailable");
  }
  if (!env.AI) checks.ai = "error: AI binding not configured";
  const ok = checks.kv === "ok" && checks.ai === "ok";
  if (!ok) log("error", "health_degraded", { checks });
  return json({ status: ok ? "ok" : "error", timestamp: Date.now(), checks }, ok ? 200 : 503);
}

// ============ Crypto (PBKDF2 + signed token) ============
async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBuf(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password),
    { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return { salt: bufToHex(saltHex ? hexToBuf(saltHex) : salt), hash: bufToHex(new Uint8Array(bits)) };
}
async function verifyPassword(password, saltHex, hashHex) {
  const { hash } = await hashPassword(password, saltHex);
  return timingEqual(hash, hashHex);
}
function timingEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function bufToHex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
function hexToBuf(hex) { const a = new Uint8Array(hex.length/2); for (let i=0;i<a.length;i++) a[i]=parseInt(hex.substr(i*2,2),16); return a; }
function b64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64urlDecode(s) { s = s.replace(/-/g,'+').replace(/_/g,'/'); while (s.length%4) s+='='; return Uint8Array.from(atob(s), c=>c.charCodeAt(0)); }

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}
async function hmacB64Url(secret, data) { return b64url(await hmac(secret, data)); }
async function hmacHex(secret, data) { return bufToHex(await hmac(secret, data)); }

async function signToken(payload, secret) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmacB64Url(secret, body)}`;
}
async function verifyToken(token, secret) {
  if (!token || !token.includes(".")) throw err(401, "Invalid token");
  const [body, sig] = token.split(".");
  if (sig !== await hmacB64Url(secret, body)) throw err(401, "Invalid token");
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  if (payload.exp && payload.exp < Date.now()/1000) throw err(401, "Token expired");
  return payload;
}

async function authenticate(req, env) {
  const h = req.headers.get("Authorization") || "";
  const token = h.replace(/^Bearer\s+/i, "");
  return verifyToken(token, env.JWT_SECRET);
}

// ============ User helpers ============
async function getUser(env, email) {
  const raw = await env.HIREFLOW_KV.get(`user:${email.toLowerCase()}`);
  return raw ? JSON.parse(raw) : null;
}
async function putUser(env, user) {
  await env.HIREFLOW_KV.put(`user:${user.email.toLowerCase()}`, JSON.stringify(user));
}
function isPaidPlan(user) {
  if (!user) return false;
  if (user.plan === "lifetime") return true;
  if (user.plan === "premium") {
    return !user.currentPeriodEnd || user.currentPeriodEnd > Math.floor(Date.now() / 1000);
  }
  return false;
}

// ============ Auth ============
async function signup(req, env) {
  // Throttle: 3 signups per IP per 10-minute window (curbs bulk account creation).
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  if (!await checkRateLimit(env, `ratelimit:signup:${ip}`, 3, 600)) {
    log("warn", "rate_limited", { route: "signup", ip });
    throw err(429, "Too many attempts. Try again in a few minutes.");
  }
  const { email, password } = await req.json();
  if (!email || !password) throw err(400, "Email and password required");
  if (password.length < 8) throw err(400, "Password must be at least 8 characters");
  if (await getUser(env, email)) { log("warn", "signup_conflict", { email }); throw err(409, "Account already exists"); }
  const { salt, hash } = await hashPassword(password);
  const user = { email, salt, hash, createdAt: Date.now(), plan: "free", downloadsUsed: 0 };
  await putUser(env, user);
  const token = await signToken({ email, exp: Math.floor(Date.now()/1000)+86400*30 }, env.JWT_SECRET);
  return { token, email };
}
async function login(req, env) {
  // Throttle: 5 attempts per IP per 5-minute window. Counts every attempt (success
  // or failure) so alternating valid/invalid credentials can't bypass the limit.
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  if (!await checkRateLimit(env, `ratelimit:login:${ip}`, 5, 300)) {
    log("warn", "rate_limited", { route: "login", ip });
    throw err(429, "Too many attempts. Try again in a few minutes.");
  }
  const { email, password } = await req.json();
  if (!email || !password) throw err(400, "Email and password required");
  const user = await getUser(env, email);
  if (!user) { log("warn", "login_failed", { email, reason: "no_user" }); throw err(401, "Invalid email or password"); }
  if (!await verifyPassword(password, user.salt, user.hash)) {
    log("warn", "login_failed", { email, reason: "bad_password" });
    throw err(401, "Invalid email or password");
  }
  const token = await signToken({ email, exp: Math.floor(Date.now()/1000)+86400*30 }, env.JWT_SECRET);
  return { token, email };
}

// ============ Me ============
async function me(req, env) {
  const payload = await authenticate(req, env);
  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");
  await maybeResetDownloads(env, user);
  const limit = parseInt(env.FREE_DOWNLOAD_LIMIT || "10", 10);
  const adminEmail = (env.ADMIN_EMAIL || "").toLowerCase();
  return {
    email: user.email,
    plan: user.plan || "free",
    isPaid: isPaidPlan(user),
    isAdmin: !!adminEmail && (user.email || "").toLowerCase() === adminEmail,
    downloadsUsed: user.downloadsUsed || 0,
    downloadLimit: limit,
    downloadsResetAt: user.downloadsResetAt || null,
    currentPeriodEnd: user.currentPeriodEnd || null,
    hasStripeCustomer: !!user.stripeCustomerId,
    aiTrials: user.aiTrials || {},
    freeAiTrials: parseInt(env.FREE_AI_TRIALS || "2", 10),
  };
}

// ============ Resume ============
async function saveResume(req, env) {
  const payload = await authenticate(req, env);
  const { resume } = await req.json();
  // Reject missing/invalid payloads. JSON.stringify(undefined) is `undefined`,
  // which KV would store as the literal string "undefined" and brick every
  // subsequent GET /resume (JSON.parse fails). Arrays/primitives aren't valid
  // resume documents either.
  if (resume === null || typeof resume !== "object" || Array.isArray(resume)) {
    throw err(400, "Missing or invalid resume");
  }
  await env.HIREFLOW_KV.put(`resume:${payload.email.toLowerCase()}`, JSON.stringify(resume));
  return { ok: true };
}
async function getResume(req, env) {
  const payload = await authenticate(req, env);
  const raw = await env.HIREFLOW_KV.get(`resume:${payload.email.toLowerCase()}`);
  if (!raw) return { resume: null };
  // Tolerate a corrupt/legacy value instead of 500ing the editor on load.
  try { return { resume: JSON.parse(raw) }; }
  catch (e) { log("warn", "resume_parse_failed", { email: payload.email }); return { resume: null }; }
}

// ============ Downloads ============
// Unix timestamp (seconds) for 00:00 UTC on the first day of next month.
function firstOfNextMonthUnix() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return Math.floor(next.getTime() / 1000);
}
// Reset the monthly download allowance when the reset date has passed.
// Mutates and persists the user record so the limit feels like a monthly
// allowance rather than a permanent lifetime cap.
async function maybeResetDownloads(env, user) {
  const now = Math.floor(Date.now() / 1000);
  if (!user.downloadsResetAt) {
    user.downloadsResetAt = firstOfNextMonthUnix();
    await putUser(env, user);
  } else if (now > user.downloadsResetAt) {
    user.downloadsUsed = 0;
    user.downloadsResetAt = firstOfNextMonthUnix();
    await putUser(env, user);
  }
}
async function incrementDownload(req, env) {
  const payload = await authenticate(req, env);
  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");
  await maybeResetDownloads(env, user);
  const limit = parseInt(env.FREE_DOWNLOAD_LIMIT || "10", 10);
  const paid = isPaidPlan(user);
  const used = user.downloadsUsed || 0;
  if (!paid && used >= limit) {
    return { ok: false, downloadsUsed: used, allowed: false, message: "Download limit reached" };
  }
  user.downloadsUsed = used + 1;
  await putUser(env, user);
  return { ok: true, downloadsUsed: user.downloadsUsed, allowed: true };
}

// ============ Feedback ============
async function submitFeedback(req, env) {
  const payload = await authenticate(req, env);
  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");
  const body = await req.json();
  const rating = body.rating === "up" || body.rating === "down" ? body.rating : null;
  const message = String(body.message || "").slice(0, 2000);
  const category = String(body.category || "").slice(0, 60);
  const context = String(body.context || "");
  const page = String(body.page || "");
  const timestamp = Date.now();
  const record = {
    rating, message, category, context, page,
    email: user.email,
    plan: user.plan || "free",
    timestamp,
  };
  await env.HIREFLOW_KV.put(`feedback:${timestamp}:${user.email.toLowerCase()}`, JSON.stringify(record));
  return { ok: true };
}

// Admin-only: read all submitted feedback. Gated by the ADMIN_EMAIL env var.
async function listFeedback(req, env) {
  const payload = await authenticate(req, env);
  const adminEmail = (env.ADMIN_EMAIL || "").toLowerCase();
  if (!adminEmail || (payload.email || "").toLowerCase() !== adminEmail) {
    throw err(403, "Admin access required");
  }
  const list = await env.HIREFLOW_KV.list({ prefix: "feedback:", limit: 1000 });
  const items = [];
  for (const k of list.keys) {
    const raw = await env.HIREFLOW_KV.get(k.name);
    if (!raw) continue;
    try { items.push(JSON.parse(raw)); } catch {}
  }
  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return { feedback: items, count: items.length };
}

// ============ Stripe ============
async function stripeCall(env, method, path, body) {
  const opts = {
    method,
    headers: {
      "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (body) opts.body = formEncode(body);
  const r = await fetch(`https://api.stripe.com${path}`, opts);
  const data = await r.json();
  if (!r.ok) {
    // Log the real provider error for debugging, but never surface provider name
    // or raw provider text to the user.
    log("error", "payment_api_error", { status: r.status, detail: data.error?.message || "unknown" });
    throw err(r.status >= 500 ? 502 : 400, "Payment service is temporarily unavailable. Please try again.");
  }
  return data;
}
function formEncode(obj, prefix) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (typeof v === "object") parts.push(formEncode(v, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return parts.join("&");
}

async function createCheckout(req, env) {
  const payload = await authenticate(req, env);
  const { plan } = await req.json();
  if (plan !== "premium" && plan !== "lifetime") throw err(400, "Invalid plan");
  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");

  const isLifetime = plan === "lifetime";
  const priceId = isLifetime ? env.LIFETIME_PRICE_ID : env.PREMIUM_PRICE_ID;
  const site = env.SITE_URL || "https://appliohq.com";

  const params = {
    "mode": isLifetime ? "payment" : "subscription",
    "success_url": `${site}/success.html?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    "cancel_url": `${site}/pricing.html`,
    "client_reference_id": user.email,
    "metadata[email]": user.email,
    "metadata[plan]": plan,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
  };
  if (user.stripeCustomerId) params["customer"] = user.stripeCustomerId;
  else params["customer_email"] = user.email;

  const session = await stripeCall(env, "POST", "/v1/checkout/sessions", params);
  return { url: session.url };
}

// Reconcile this user's account with Stripe (for cases where the webhook
// didn't fire or failed signature verification). Looks up the Stripe customer
// by email and pulls plan info from there.
async function syncWithStripe(req, env) {
  const payload = await authenticate(req, env);
  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");

  // 1) Find the Stripe customer with matching email
  const search = await stripeCall(env, "GET",
    `/v1/customers?email=${encodeURIComponent(user.email)}&limit=1`);
  if (!search.data || !search.data.length) {
    return { ok: false, message: "We couldn't find a matching billing record. If you just paid, use the same email you checked out with." };
  }
  const customer = search.data[0];
  user.stripeCustomerId = customer.id;
  await env.HIREFLOW_KV.put(`stripeCustomer:${customer.id}`, user.email);

  // 2) Look for an active subscription (Premium)
  const subs = await stripeCall(env, "GET",
    `/v1/subscriptions?customer=${customer.id}&status=active&limit=1`);
  if (subs.data && subs.data.length) {
    const sub = subs.data[0];
    user.plan = "premium";
    user.stripeSubscriptionId = sub.id;
    user.currentPeriodEnd = sub.current_period_end;
    user.updatedAt = Date.now();
    await putUser(env, user);
    return {
      ok: true,
      linked: true,
      plan: "premium",
      hasStripeCustomer: true,
      currentPeriodEnd: sub.current_period_end,
      message: "Synced, Premium subscription active",
    };
  }

  // 3) Look for completed one-time checkout sessions (Lifetime)
  const sessions = await stripeCall(env, "GET",
    `/v1/checkout/sessions?customer=${customer.id}&limit=20`);
  const lifetimeSession = (sessions.data || []).find(
    s => s.payment_status === "paid" && s.mode === "payment"
  );
  if (lifetimeSession) {
    user.plan = "lifetime";
    user.currentPeriodEnd = null;
    user.updatedAt = Date.now();
    await putUser(env, user);
    return { ok: true, linked: true, plan: "lifetime", hasStripeCustomer: true, message: "Synced, Lifetime access active" };
  }

  // 4) Customer exists but no active subscription or paid one-time
  user.updatedAt = Date.now();
  await putUser(env, user);
  return {
    ok: true,
    linked: true,
    plan: user.plan || "free",
    hasStripeCustomer: true,
    message: "Your account is linked, but we don't see an active plan yet. If you just paid, wait ~30 seconds and try again.",
  };
}

async function createPortal(req, env) {
  const payload = await authenticate(req, env);
  const user = await getUser(env, payload.email);
  if (!user || !user.stripeCustomerId) throw err(400, "No billing customer found");
  const site = env.SITE_URL || "https://appliohq.com";
  const session = await stripeCall(env, "POST", "/v1/billing_portal/sessions", {
    "customer": user.stripeCustomerId,
    "return_url": `${site}/editor.html`,
  });
  return { url: session.url };
}

// ============ Stripe Webhook ============
async function handleWebhook(req, env) {
  const sig = req.headers.get("Stripe-Signature");
  const body = await req.text();
  if (!sig) throw err(400, "Missing signature");
  // Verify signature BEFORE the idempotency check so unverified requests can't
  // pollute the dedup store with arbitrary event IDs.
  if (!await verifyStripeSig(body, sig, env.STRIPE_WEBHOOK_SECRET)) {
    log("warn", "stripe_webhook_invalid_signature", {});
    throw err(400, "Invalid signature");
  }

  const event = JSON.parse(body);
  const obj = event.data.object;

  // Idempotency: Stripe retries deliver the same event.id. If we've already
  // processed it, 200 immediately so Stripe stops retrying, don't reapply.
  const dedupeKey = `stripe_event:${event.id}`;
  if (await env.HIREFLOW_KV.get(dedupeKey)) {
    log("info", "stripe_webhook_duplicate", { id: event.id, type: event.type });
    return json({ received: true });
  }
  log("info", "stripe_webhook", { id: event.id, type: event.type });

  switch (event.type) {
    case "checkout.session.completed": {
      const email = obj.client_reference_id || obj.metadata?.email || obj.customer_email;
      const plan = obj.metadata?.plan || (obj.mode === "subscription" ? "premium" : "lifetime");
      if (!email) break;
      const user = await getUser(env, email);
      if (!user) break;
      user.plan = plan;
      user.stripeCustomerId = obj.customer;
      if (plan === "premium" && obj.subscription) {
        user.stripeSubscriptionId = obj.subscription;
        // Fetch subscription to get period end
        try {
          const sub = await stripeCall(env, "GET", `/v1/subscriptions/${obj.subscription}`);
          user.currentPeriodEnd = sub.current_period_end;
        } catch {}
      } else if (plan === "lifetime") {
        user.currentPeriodEnd = null;
      }
      user.updatedAt = Date.now();
      await putUser(env, user);
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const email = await emailFromCustomerId(env, obj.customer);
      if (!email) break;
      const user = await getUser(env, email);
      if (!user) break;
      user.currentPeriodEnd = obj.current_period_end;
      user.stripeSubscriptionId = obj.id;
      if (obj.status === "active" || obj.status === "trialing") user.plan = "premium";
      await putUser(env, user);
      break;
    }
    case "customer.subscription.deleted": {
      const email = await emailFromCustomerId(env, obj.customer);
      if (!email) break;
      const user = await getUser(env, email);
      if (!user) break;
      // Only downgrade if currently premium (lifetime stays)
      if (user.plan === "premium") {
        user.plan = "free";
        user.currentPeriodEnd = null;
      }
      await putUser(env, user);
      break;
    }
  }

  // Mark this event processed so retries (or duplicate deliveries) are skipped.
  // 30-day TTL: Stripe doesn't retry beyond that window, so the key can expire.
  await env.HIREFLOW_KV.put(dedupeKey, JSON.stringify({ processedAt: Date.now() }), {
    expirationTtl: 60 * 60 * 24 * 30,
  });
  return json({ received: true });
}

async function emailFromCustomerId(env, customerId) {
  if (!customerId) return null;
  // Check our reverse-index in KV (set on checkout)
  const idx = await env.HIREFLOW_KV.get(`stripeCustomer:${customerId}`);
  if (idx) return idx;
  // Fallback: ask Stripe for the customer's email
  try {
    const cust = await stripeCall(env, "GET", `/v1/customers/${customerId}`);
    if (cust.email) {
      await env.HIREFLOW_KV.put(`stripeCustomer:${customerId}`, cust.email);
      return cust.email;
    }
  } catch {}
  return null;
}

async function verifyStripeSig(body, sigHeader, secret) {
  // Stripe-Signature: t=TIMESTAMP,v1=SIG,v1=SIG,...
  const parts = sigHeader.split(",").reduce((m, p) => {
    const [k, v] = p.split("=");
    if (!m[k]) m[k] = [];
    m[k].push(v);
    return m;
  }, {});
  const t = parts.t?.[0];
  const sigs = parts.v1 || [];
  if (!t || !sigs.length) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  for (const s of sigs) if (timingEqual(s, expected)) return true;
  return false;
}

// ============ AI (gated by plan) ============
async function ai(req, env, action) {
  const payload = await authenticate(req, env);
  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");

  // Free users get a limited number of free trials per AI feature, then it paywalls.
  let trial = null;
  if (PRO_AI.has(action) && !isPaidPlan(user)) {
    const limit = parseInt(env.FREE_AI_TRIALS || "2", 10);
    const used = (user.aiTrials && user.aiTrials[action]) || 0;
    if (used >= limit) {
      throw err(402, "You've used your free trials for this feature. Upgrade to Premium for unlimited.");
    }
    trial = { action, used, limit };
  }

  const body = await req.json();
  let result;
  switch (action) {
    case "improve":   result = await aiImprove(env, body); break;
    case "skills":    result = await aiSkills(env, body); break;
    case "tailor":    result = await aiTailor(env, body); break;
    case "ats":       result = await aiATS(env, body); break;
    case "analyze":   result = await aiAnalyze(env, body); break;
    case "parse":     result = await aiParse(env, body); break;
    case "interview": result = await aiInterview(env, body); break;
    case "interview-feedback": result = await aiInterviewFeedback(env, body); break;
    default: throw err(404, "Unknown AI action");
  }

  // Don't charge a trial for a no-op guard result (e.g. empty input → a
  // "add some content first" message), only for real generated output.
  const noCharge = result && typeof result === "object" && result._noCharge;
  if (result && typeof result === "object") delete result._noCharge;

  // Consume one free trial only after the action did real work.
  if (trial && !noCharge) {
    user.aiTrials = user.aiTrials || {};
    user.aiTrials[trial.action] = trial.used + 1;
    await putUser(env, user);
    if (result && typeof result === "object") {
      result._trial = {
        feature: trial.action,
        used: user.aiTrials[trial.action],
        limit: trial.limit,
        remaining: Math.max(0, trial.limit - user.aiTrials[trial.action]),
      };
    }
  }
  return result;
}

async function runAI(env, system, user, opts = {}) {
  // Build an ordered, de-duplicated chain so every call always has at least one
  // reliable fallback, even when the requested model IS the fast model.
  const wanted = opts.model || FAST_MODEL;
  const chain = [...new Set([wanted, FAST_MODEL, FALLBACK_MODEL])];
  let lastErr;
  for (const model of chain) {
    // One retry per model: empty responses are often transient.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await env.AI.run(model, {
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          max_tokens: opts.max_tokens || 600,
          temperature: opts.temperature ?? 0.3,
        });
        // Different models return different shapes, normalize to a string.
        let out = res?.response;
        if (typeof out !== "string") {
          out =
            (typeof res?.response?.response === "string" && res.response.response) ||
            (typeof res?.response?.content === "string" && res.response.content) ||
            (typeof res?.choices?.[0]?.message?.content === "string" && res.choices[0].message.content) ||
            (typeof res?.result?.response === "string" && res.result.response) ||
            "";
        }
        // Reasoning models emit <think>…</think> blocks, strip them.
        out = String(out || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (out) return out;
        lastErr = new Error(`${model} returned empty response`);
        log("warn", "ai_model_empty", { model, attempt });
        // retry the same model once before moving on
      } catch (e) {
        lastErr = e;
        log("error", "ai_model_failed", { model, attempt, error: e.message || String(e) });
        break; // hard error, don't retry the same model, move to the next
      }
    }
  }
  log("error", "ai_unavailable", { detail: lastErr?.message || "unknown" });
  throw err(502, "The AI is temporarily unavailable. Please try again in a moment.");
}

// ============ Improve writing ============
async function aiImprove(env, { target, text }) {
  if (!text || !text.trim()) {
    return { text: "Add some content first, then click AI Improve to refine it.", _noCharge: true };
  }
  const isSummary = target === "summary" || target === "personal";
  const sys = isSummary
    ? `${GROUND_RULE}

You are an elite resume writer. Rewrite the candidate's professional summary using only what they wrote:
- 2-3 sentences, ~40-60 words
- Opens with a strong identity statement (e.g. "Senior product designer with 7+ years…"), only if that seniority/role is in the input
- Names 2-3 competencies that appear in the input
- Active voice, third-person implied (no "I"/"you"), no buzzwords
- Plain text only, no markdown, headers, or quotes

OUTPUT: Only the rewritten summary. Nothing else.`
    : `${GROUND_RULE}

You are an elite resume writer. Rewrite the following ${target} content into achievement-focused bullets:
- Each bullet starts with a strong past-tense action verb (never repeat a verb)
- Keep ONLY metrics already in the input; if there are none, stay qualitative, never add fake numbers
- Each bullet under ~20 words; 3-5 bullets
- Mark each bullet with "• ", one per line
- Plain text only

OUTPUT: Only the bullets, one per line, each starting with "• ". Nothing else.`;
  const out = await runAI(env, sys, `Candidate content:\n${text}\n\nRewrite it.`, { max_tokens: 350, temperature: 0.4 });
  // Strip common AI preambles
  const cleaned = out
    .replace(/^(here'?s?( is)?|sure[,!]?|certainly[,!]?|of course[,!]?)[^]*?:\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
  return { text: cleaned };
}

// ============ Suggest skills ============
async function aiSkills(env, { experience }) {
  const sys = `${GROUND_RULE}

You extract resume-ready skills from work history. Return a comma-separated list of 10-15 skills the candidate clearly demonstrates, drawn only from their stated titles and described work (hard skills, methodologies, relevant soft skills).
- Only skills evidenced by the input, do not add tools/technologies they never mention
- Industry-standard naming (e.g. "Project Management", not "managing projects")
- No duplicates, no generic filler ("Teamwork", "Hard worker")

OUTPUT: Just the comma-separated list. Nothing else.`;
  const raw = await runAI(env, sys,
    `Experience:\n${JSON.stringify(experience).slice(0, 3000)}`,
    { max_tokens: 180, temperature: 0.3 });
  // Strip preambles and quotation marks
  const cleaned = raw
    .replace(/^[^a-z]*here[^:]*:\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .split("\n")[0]
    .trim();
  return { skills: cleaned };
}

// ============ Tailor to job ============
async function aiTailor(env, { jobDescription, resume }) {
  const sys = `${GROUND_RULE}

You are a resume strategist. The candidate wants to tailor their resume to a specific job posting.

Analyze the job description and the candidate's resume, then output STRICT JSON in exactly this shape:

{
  "summary": "<2-3 sentence professional summary, rewritten to mirror the language of the JD while staying truthful to the candidate's actual experience. ~40-60 words. No 'I'. No buzzwords.>",
  "matchedKeywords": ["<keyword 1>", "<keyword 2>", "..."],
  "missingKeywords": ["<important JD keyword the resume doesn't mention>", "..."],
  "emphasize": [
    "<short, actionable note: 'Lead with your AWS migration work, JD heavily emphasizes cloud infra'>",
    "<another note>",
    "<another note>"
  ],
  "bulletSuggestions": [
    "<a rewritten bullet from their experience that better matches the JD>",
    "<another>",
    "<another>"
  ]
}

Rules:
- matchedKeywords: 6-10 entries the JD asks for that the resume already shows
- missingKeywords: 3-6 important JD keywords the resume is missing
- emphasize: 3 short coaching notes, each one sentence
- bulletSuggestions: 3 rewrites built ONLY from experience already in the resume, reworded for the JD, never new claims
- missingKeywords are gaps to flag, NOT permission to invent that experience
- OUTPUT ONLY THE JSON OBJECT. No markdown fences, no preamble.`;

  const raw = await runAI(env, sys,
    `Job Description:\n${(jobDescription || '').slice(0, 3000)}\n\nCandidate Resume:\n${JSON.stringify(resume).slice(0, 4000)}`,
    { model: SMART_MODEL, max_tokens: 700, temperature: 0.3 });
  const j = safeJSON(raw);
  if (!j) return { text: raw, summary: null };

  // Build human-readable notes blob
  const lines = [];
  if (j.matchedKeywords?.length) lines.push(`Matched keywords:\n${j.matchedKeywords.map(k => `  ✓ ${k}`).join("\n")}`);
  if (j.missingKeywords?.length) lines.push(`\nMissing keywords (add these if true):\n${j.missingKeywords.map(k => `  ✗ ${k}`).join("\n")}`);
  if (j.emphasize?.length) lines.push(`\nWhat to emphasize:\n${j.emphasize.map(e => `  • ${e}`).join("\n")}`);
  if (j.bulletSuggestions?.length) lines.push(`\nSuggested bullet rewrites:\n${j.bulletSuggestions.map(b => `  → ${b}`).join("\n")}`);
  return { text: lines.join("\n"), summary: j.summary };
}

// ============ Deterministic ATS scoring (explainable, model-independent) ============
// Real ATS rank on objective signals, not vibes: keyword coverage against the job,
// parseable structure, completeness, and quantified impact. We compute those in code
// so the score is consistent, defensible, and works even when the model is down; the
// model is then used only to add qualitative narrative on top of the fixed numbers.
const ATS_STOPWORDS = new Set("a an the and or but for nor of to in on at by with from as is are was were be been being this that these those you your our we they it its their will would can could should may might must do does did have has had not no if then than so into over under more most very who whom which what when where why how about after again all also any because before between both during each few here own same some too up out off down only just via per etc using use used uses including include includes work works working role roles team teams ability strong excellent good great new ideal candidate join help build builds building plus years year experience experienced required preferred responsibilities requirements skills".split(/\s+/));
const ATS_SKILL_PHRASES = ["project management","machine learning","data analysis","customer service","product management","software development","web development","cloud computing","ci/cd","unit testing","data science","user experience","quality assurance","business development","social media","supply chain","financial analysis","problem solving","time management","public speaking","team leadership","stakeholder management","continuous integration","rest api","version control"];
const ATS_SKILL_WORDS = new Set("python java javascript typescript react angular vue node nodejs go golang rust ruby php swift kotlin scala sql nosql postgres postgresql mysql mongodb redis aws azure gcp kubernetes docker terraform linux git github graphql html css sass tailwind django flask spring express rails kafka spark hadoop tableau excel powerpoint salesforce sap jira figma photoshop seo marketing sales accounting finance leadership communication analytics agile scrum devops cybersecurity nursing teaching".split(/\s+/));
const ATS_ACTION_VERBS = new Set("led managed built created developed designed launched delivered drove increased decreased reduced improved grew scaled owned shipped implemented architected automated optimized streamlined coordinated directed founded established mentored trained negotiated analyzed researched produced generated achieved exceeded won spearheaded oversaw migrated rebuilt refactored deployed".split(/\s+/));

function _atsNorm(s){ return String(s == null ? "" : s).toLowerCase(); }
function _atsResumeText(resume){
  if (!resume || typeof resume !== "object") return "";
  const parts = [];
  const p = resume.personal || {}; parts.push(p.summary, p.fullName, p.location);
  (resume.experience || []).forEach(e => parts.push(e.title, e.company, e.description));
  (resume.education || []).forEach(e => parts.push(e.school, e.degree, e.field, e.notes));
  ((resume.skills && resume.skills.categories) || []).forEach(c => parts.push((c.items || []).join(" ")));
  (resume.projects || []).forEach(e => parts.push(e.name, e.tech, e.description));
  ["certifications","awards","leadership","volunteer","publications"].forEach(k =>
    (resume[k] || []).forEach(e => parts.push(Object.values(e || {}).join(" "))));
  return _atsNorm(parts.filter(Boolean).join("  "));
}
function _atsBullets(resume){
  const out = [];
  ((resume && resume.experience) || []).forEach(e =>
    String(e.description || "").split(/\n+/).forEach(line => {
      const t = line.replace(/^[•*\-▪→●\s]+/, "").trim();
      if (t) out.push(t);
    }));
  return out;
}
function _atsExtractKeywords(jd){
  const text = _atsNorm(jd);
  if (!text.trim()) return [];
  const found = new Map();
  for (const ph of ATS_SKILL_PHRASES) if (text.includes(ph)) found.set(ph, true);
  const words = text.match(/[a-z][a-z0-9+.#/]{1,}/g) || [];
  const freq = new Map();
  for (const raw of words) {
    // Strip edge sentence punctuation ("engineer." → "engineer") while keeping
    // internal marks intact ("node.js", "ci/cd").
    const w = raw.replace(/^[.\-/_]+|[.\-/_]+$/g, "");
    if (w.length < 2 || ATS_STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
    if (ATS_SKILL_WORDS.has(w)) found.set(w, true);
  }
  const ranked = [...freq.entries()].filter(([w]) => w.length >= 3).sort((a, b) => b[1] - a[1]);
  for (const [w] of ranked) { if (found.size >= 22) break; if (!found.has(w)) found.set(w, true); }
  return [...found.keys()].slice(0, 22);
}
function _atsScore(jobDescription, resume){
  const rtext = _atsResumeText(resume);
  const hasJD = !!(jobDescription && String(jobDescription).trim().length >= 20);
  const kws = hasJD ? _atsExtractKeywords(jobDescription) : [];
  const matched = [], missing = [];
  for (const k of kws) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const present = k.includes(" ") ? rtext.includes(k)
      : new RegExp("(^|[^a-z0-9])" + esc + "([^a-z0-9]|$)").test(rtext);
    (present ? matched : missing).push(k);
  }
  const skillItems = ((resume && resume.skills && resume.skills.categories) || [])
    .reduce((n, c) => n + ((c.items || []).length), 0);
  const kwScore = (hasJD && kws.length)
    ? Math.round(100 * matched.length / kws.length)
    : Math.max(0, Math.min(100, skillItems * 8));

  const p = (resume && resume.personal) || {};
  const exp = (resume && resume.experience) || [];
  const datedRoles = exp.filter(e => (e.start || e.end)).length;
  const bullets = _atsBullets(resume);
  const fmtChecks = [
    !!p.email, !!(p.phone || p.linkedin), exp.length >= 1,
    exp.length ? datedRoles / exp.length >= 0.5 : false,
    bullets.length >= 3, !!p.summary, bullets.length <= 40,
  ];
  const fmtScore = Math.round(100 * fmtChecks.filter(Boolean).length / fmtChecks.length);

  const compChecks = [
    !!p.summary, exp.length >= 1, ((resume && resume.education) || []).length >= 1,
    skillItems >= 3,
    (((resume && resume.projects) || []).length + ((resume && resume.certifications) || []).length) >= 1,
  ];
  const compScore = Math.round(100 * compChecks.filter(Boolean).length / compChecks.length);

  const quantified = bullets.filter(b => /\d/.test(b)).length;
  const actionStarts = bullets.filter(b => ATS_ACTION_VERBS.has((b.split(/\s+/)[0] || "").toLowerCase().replace(/[^a-z]/g, ""))).length;
  const bulletsPerRole = exp.length ? bullets.length / exp.length : 0;
  const quantRatio = bullets.length ? quantified / bullets.length : 0;
  const actionRatio = bullets.length ? actionStarts / bullets.length : 0;
  const expScore = Math.round(100 * (
    0.40 * Math.min(1, bulletsPerRole / 3) +
    0.35 * Math.min(1, quantRatio / 0.4) +
    0.25 * Math.min(1, actionRatio / 0.6)
  ));

  const w = hasJD ? { kw: .35, exp: .30, fmt: .15, comp: .20 } : { kw: .10, exp: .45, fmt: .20, comp: .25 };
  const score = Math.max(0, Math.min(100, Math.round(kwScore * w.kw + expScore * w.exp + fmtScore * w.fmt + compScore * w.comp)));
  return {
    score, hasJD,
    breakdown: { keywords: kwScore, experience: expScore, formatting: fmtScore, completeness: compScore },
    matchedKeywords: matched, missingKeywords: missing,
    signals: { bullets: bullets.length, quantRatio, actionRatio, bulletsPerRole, datedRoles, roles: exp.length, skillItems, hasSummary: !!p.summary, hasEducation: ((resume && resume.education) || []).length >= 1 },
  };
}
function _atsSynthNarrative(det){
  const s = det.signals, b = det.breakdown, wins = [], issues = [];
  const totalKw = det.matchedKeywords.length + det.missingKeywords.length;
  if (det.hasJD && det.matchedKeywords.length) wins.push(`Matches ${det.matchedKeywords.length} of ${totalKw} key terms from the job description`);
  if (s.quantRatio >= 0.4) wins.push(`${Math.round(s.quantRatio * 100)}% of your bullet points include measurable results`);
  if (s.actionRatio >= 0.6) wins.push(`Most bullet points start with a strong action verb`);
  if (b.completeness >= 80) wins.push(`All the core sections are present and filled in`);
  if (det.hasJD && det.missingKeywords.length) issues.push(`Add these terms from the posting where they truly apply to you: ${det.missingKeywords.slice(0, 6).join(", ")}`);
  if (s.bullets && s.quantRatio < 0.4) issues.push(`Only ${Math.round(s.quantRatio * 100)}% of bullet points include numbers, add metrics like %, $, time saved, or scale`);
  if (s.roles && s.bulletsPerRole < 3) issues.push(`Add more detail to your roles, aim for 3 to 5 bullet points each`);
  if (!s.hasSummary) issues.push(`Add a short professional summary at the top`);
  if (!s.hasEducation) issues.push(`Add an education section`);
  if (s.roles && s.datedRoles < s.roles) issues.push(`Add start and end dates to every role`);
  if (!wins.length) wins.push(`You have a solid starting point to build on`);
  if (!issues.length) issues.push(`Tighten the wording and keep the focus on your most relevant, recent experience`);
  const labels = { keywords: "keyword match", experience: "experience detail", formatting: "formatting", completeness: "completeness" };
  const ordered = Object.entries(b).sort((a, c) => c[1] - a[1]);
  const best = ordered[0], worst = ordered[ordered.length - 1];
  const feedback = `Your strongest area is ${labels[best[0]]} (${best[1]} out of 100); the biggest opportunity is ${labels[worst[0]]} (${worst[1]} out of 100). ${det.score >= 70 ? "You're close, a few targeted tweaks will get this submission-ready." : "Work through the fixes below to make this more competitive."}`;
  return { feedback, wins: wins.slice(0, 3), issues: issues.slice(0, 4) };
}

// ============ ATS check ============
async function aiATS(env, { jobDescription, resume }) {
  // Authoritative, explainable score computed in code, consistent run to run and
  // available even if the model is unavailable.
  const det = _atsScore(jobDescription, resume);
  const base = _atsSynthNarrative(det);
  // Best-effort qualitative polish from the model. The numbers are already fixed;
  // the model only rewrites the narrative, and we fall back to the computed copy
  // if it's unavailable or returns nothing usable.
  let nice = null;
  try {
    const sys = `${GROUND_RULE}

You are a sharp, encouraging resume coach. You are given a candidate's resume, the job description, and an ALREADY-COMPUTED ATS analysis (scores + matched/missing keywords). Do NOT invent or change any numbers. Write narrative that is consistent with the analysis and references real resume content. Output STRICT JSON:
{ "feedback": "<2-3 sentence summary of what's working and the top opportunity>", "wins": ["<specific strength>", "<another>", "<another>"], "issues": ["<specific, actionable fix naming the section>", "<another>", "<another>"] }
OUTPUT ONLY THE JSON OBJECT. No markdown fences.`;
    const raw = await runAI(env, sys,
      `Computed breakdown: ${JSON.stringify(det.breakdown)}\nMatched keywords: ${det.matchedKeywords.join(", ") || "(none)"}\nMissing keywords: ${det.missingKeywords.join(", ") || "(none)"}\n\nJob Description:\n${(jobDescription || "(none provided, judge against general best practices)").slice(0, 2000)}\n\nCandidate Resume:\n${JSON.stringify(resume).slice(0, 3500)}`,
      { model: SMART_MODEL, max_tokens: 500, temperature: 0.3 });
    nice = safeJSON(raw);
  } catch (e) { /* model unavailable, computed narrative is used */ }

  return {
    score: det.score,
    breakdown: det.breakdown,
    feedback: (nice && typeof nice.feedback === "string" && nice.feedback.trim()) ? nice.feedback : base.feedback,
    wins: (nice && Array.isArray(nice.wins) && nice.wins.length) ? nice.wins.slice(0, 3) : base.wins,
    issues: (nice && Array.isArray(nice.issues) && nice.issues.length) ? nice.issues.slice(0, 4) : base.issues,
    matchedKeywords: det.matchedKeywords,
    missingKeywords: det.missingKeywords,
  };
}

// ============ Analyze ============
async function aiAnalyze(env, { resume }) {
  const sys = `${GROUND_RULE}

You are a senior career coach giving a sharp, specific resume critique. Judge ONLY what's in the resume; improve existing content, never invent accomplishments.

Output STRICT JSON:
{
  "overallScore": <integer 0-100>,
  "summary": "<exactly 2 sentences: the single biggest strength, then the single most important thing holding this resume back>",
  "strengths": [
    "<a concrete strength that names the exact section/role/bullet it comes from>",
    "<another>",
    "<another>"
  ],
  "weaknesses": [
    "<a specific, fixable weakness that names the section, e.g. 'Acme bullets describe duties, not measurable results'>",
    "<another>",
    "<another>"
  ],
  "topFixes": [
    {
      "action": "<one concrete change in imperative voice>",
      "where": "<exact section or role>",
      "impact": "<short phrase on why it moves the needle>",
      "priority": "high" | "medium",
      "example": "<OPTIONAL: if a specific weak line can be fixed, rewrite THAT actual line into a stronger version using ONLY facts already present; omit this field entirely when not applicable>"
    }
  ],
  "missingSections": ["<a section that would strengthen this resume, e.g. 'Skills', 'Projects'>"]
}

Scoring rubric, calibrate honestly:
- 90-100: recruiter-ready, quantified results, strong structure, no gaps
- 75-89: solid, minor tightening needed
- 60-74: workable but generic, duties over impact, few metrics
- 40-59: weak, vague bullets, missing sections, little quantification
- below 40: needs a rebuild

Rules:
- Give 3 strengths, 3 weaknesses, and 3 topFixes ordered by impact (highest first).
- Every strength/weakness MUST reference a real part of THIS resume, never generic advice like "add more keywords".
- Mark only the 1-2 highest-leverage fixes as "high"; the rest "medium".
- In an "example" rewrite, sharpen wording only, never add fake numbers, tools, or claims.
- OUTPUT ONLY THE JSON OBJECT. No markdown fences.`;

  const raw = await runAI(env, sys,
    `Candidate Resume:\n${JSON.stringify(resume).slice(0, 5000)}`,
    { model: SMART_MODEL, max_tokens: 850, temperature: 0.3 });
  const j = safeJSON(raw);
  // If parsing fails, hand the raw text to the client (it can still extract/format it).
  if (!j) return { text: raw };
  // Return structured fields directly so the client always renders the rich cards.
  return {
    overallScore: typeof j.overallScore === "number" ? j.overallScore : null,
    summary: j.summary || "",
    strengths: Array.isArray(j.strengths) ? j.strengths : [],
    weaknesses: Array.isArray(j.weaknesses) ? j.weaknesses : [],
    topFixes: Array.isArray(j.topFixes) ? j.topFixes : [],
    missingSections: Array.isArray(j.missingSections) ? j.missingSections : [],
  };
}

// ============ Parse (resume import, most important!) ============
async function aiParse(env, { text }) {
  if (!text || text.trim().length < 30) {
    throw err(400, "Paste at least a few lines from your resume, 'test' isn't enough text to parse.");
  }
  const sys = `You are an expert resume parser. The user pasted plain text from a resume (could be from a PDF copy-paste, so formatting may be messy, line breaks in odd places, bullet markers like •, *, -, ▪, →, or no markers, dates in any format).

Extract everything into this EXACT JSON schema. Fill every field you can confidently extract. Use "" for unknown strings and [] for empty arrays.

SCHEMA:
{
  "personal": {
    "fullName": "<full name from top of resume>",
    "email": "<email address>",
    "phone": "<phone number, keep original format>",
    "location": "<city, state OR city, country>",
    "linkedin": "<linkedin URL or username>",
    "github": "<github URL or username>",
    "website": "<personal website URL>",
    "summary": "<professional summary / objective / about section, kept verbatim>"
  },
  "experience": [
    {
      "title": "<job title>",
      "company": "<company name>",
      "start": "<start date, e.g. 'Jan 2022' or '2022'>",
      "end": "<end date or 'Present'>",
      "location": "<city, state or 'Remote'>",
      "description": "<all bullets joined with newlines, each starting with '• '>"
    }
  ],
  "education": [
    {
      "school": "<school name>",
      "degree": "<degree type, B.S., M.S., Ph.D., B.A., etc.>",
      "field": "<major / field of study>",
      "gpa": "<GPA if mentioned>",
      "start": "<start year>",
      "end": "<end year or graduation year>",
      "notes": "<honors, thesis, relevant coursework>"
    }
  ],
  "skills": {
    "categories": [
      {"name": "All", "items": ["<skill 1>", "<skill 2>", "..."]}
    ]
  },
  "projects": [
    {
      "name": "<project name>",
      "role": "<role/title>",
      "tech": "<tech stack, comma-separated>",
      "link": "<URL>",
      "description": "<what the project did, key outcomes>"
    }
  ],
  "certifications": [
    {"name": "<cert name>", "issuer": "<issuing org>", "date": "<date>", "url": "<credential URL>"}
  ],
  "awards": [
    {"name": "<award name>", "issuer": "<issuing org>", "date": "<date>", "description": "<short description>"}
  ],
  "leadership": [
    {"role": "<role>", "org": "<organization>", "start": "<date>", "end": "<date>", "description": "<what you did>"}
  ],
  "volunteer": [
    {"role": "<role>", "org": "<organization>", "start": "<date>", "end": "<date>", "description": "<what you did>"}
  ],
  "publications": [
    {"title": "<title>", "venue": "<journal/conference>", "date": "<date>", "url": "<URL>", "abstract": ""}
  ]
}

CRITICAL RULES:
1. Section detection: identify sections by their headers (e.g. "EXPERIENCE", "WORK HISTORY", "Professional Experience" → experience). Common synonyms:
   - Experience: Work Experience, Professional Experience, Employment, Work History, Career
   - Education: Academic Background, Schooling
   - Skills: Technical Skills, Core Competencies, Technologies, Proficiencies
   - Projects: Personal Projects, Side Projects, Notable Projects
   - Leadership: Activities, Extracurriculars, Leadership Experience
   - Volunteer: Community Service, Volunteer Work
2. Bullet extraction: detect bullets by markers (•, *, -, ▪, →, ●) OR by short paragraph breaks. Strip the original marker; output as "• <text>" joined by "\\n".
3. Dates: keep the original format. If you see "May 2022 - Present", set start="May 2022", end="Present".
4. Name + contact: usually the first 1-5 lines of the resume.
5. Skills: extract every listed skill, comma/pipe/bullet separated. Put all under one category "All" unless the resume explicitly groups them.
6. Don't hallucinate. If a field isn't in the text, leave it empty.
7. Don't truncate descriptions, keep all bullet content.

OUTPUT FORMAT:
- ONLY the JSON object.
- NO markdown code fences (no \`\`\`).
- NO preamble like "Here's the parsed JSON".
- Start directly with {.`;

  const raw = await runAI(env, sys,
    `Resume text:\n${text.slice(0, 8000)}`,
    { model: SMART_MODEL, max_tokens: 3500, temperature: 0.1 });
  const j = safeJSON(raw);
  // Don't spend a free import if we couldn't actually parse anything out.
  if (!j) return { resume: null, _noCharge: true };
  return { resume: j };
}

// ============ Interview prep ============
async function aiInterview(env, { role, jobDescription, resume }) {
  const sys = `${GROUND_RULE}

You are a senior interview coach. The candidate is preparing for an interview for a specific role. Tips may reference only experience actually in their resume.

Generate 10 high-quality practice interview questions, mixing:
- 3 behavioral (STAR-friendly: "Tell me about a time you…")
- 4 role-specific / technical
- 2 situational / hypothetical
- 1 closing / motivational

Format EXACTLY like this (no markdown, no JSON, plain text):

[Behavioral]
1. <Question>
   Tip: <One-line strategic tip, what they're really testing, what to emphasize from the candidate's resume>

2. <Question>
   Tip: <Tip>

3. <Question>
   Tip: <Tip>

[Role-Specific]
4. <Question>
   Tip: <Tip>

5. <Question>
   Tip: <Tip>

6. <Question>
   Tip: <Tip>

7. <Question>
   Tip: <Tip>

[Situational]
8. <Question>
   Tip: <Tip>

9. <Question>
   Tip: <Tip>

[Closing]
10. <Question>
    Tip: <Tip>

Rules:
- Questions should reference specifics from the candidate's actual resume when natural
- Tips should mention which resume bullet/experience to lean on for the answer
- Avoid generic questions like "What's your greatest weakness?", interviewers ask sharper questions today
- No preamble. Start directly with "[Behavioral]".`;

  return { text: await runAI(env, sys,
    `Role: ${role}\n\nJob Description:\n${(jobDescription || '(none provided)').slice(0, 2000)}\n\nCandidate Resume:\n${JSON.stringify(resume).slice(0, 3500)}`,
    { max_tokens: 1100, temperature: 0.5 }) };
}

// ============ Interview answer feedback ============
async function aiInterviewFeedback(env, { question, answer }) {
  if (!answer || answer.trim().length < 10) {
    return { score: 0, feedback: "Write a fuller answer (a few sentences) and try again.", _noCharge: true };
  }
  const sys = `${GROUND_RULE}

You are an interview coach scoring a practice answer. Output STRICT JSON:
{
  "score": <integer 0-100>,
  "feedback": "<2-4 short sentences: what worked, what to improve, and one concrete tweak. Reference the STAR method (Situation, Task, Action, Result) where relevant.>"
}
Score on structure, specificity, and impact. Address the reader as "you". OUTPUT ONLY THE JSON.`;
  const raw = await runAI(env, sys,
    `Question:\n${String(question || '').slice(0, 600)}\n\nMy answer:\n${String(answer).slice(0, 1500)}`,
    { max_tokens: 320, temperature: 0.3 });
  const j = safeJSON(raw);
  if (!j) return { score: 60, feedback: raw };
  return { score: j.score ?? 60, feedback: j.feedback || "" };
}

function safeJSON(s) {
  if (s == null) return null;
  // Strip markdown code fences (```json … ```) the model sometimes wraps output in.
  const str = String(s).replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(str); } catch {}
  // Fall back to the first {...} block (handles trailing prose / preamble).
  const m = str.match(/\{[\s\S]*\}/); if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}
