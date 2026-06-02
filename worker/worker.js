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

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// AI endpoints that require Premium/Lifetime
const PRO_AI = new Set(["tailor", "ats", "analyze", "parse", "interview", "skills", "improve"]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const cors = corsHeaders(env, req);

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    // Stripe webhook gets raw body — handle before JSON parsing
    if (path === "/stripe/webhook") {
      return handleWebhook(req, env).then(r => withCors(r, cors)).catch(e => withCors(json({ error: e.message }, e.status || 500), cors));
    }

    try {
      if (path === "/auth/signup")             return json(await signup(req, env), 200, cors);
      if (path === "/auth/login")              return json(await login(req, env), 200, cors);
      if (path === "/me")                      return json(await me(req, env), 200, cors);
      if (path === "/resume" && req.method === "GET")  return json(await getResume(req, env), 200, cors);
      if (path === "/resume" && req.method === "POST") return json(await saveResume(req, env), 200, cors);
      if (path === "/downloads/increment")     return json(await incrementDownload(req, env), 200, cors);
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
  const { email, password } = await req.json();
  if (!email || !password) throw err(400, "Email and password required");
  if (password.length < 8) throw err(400, "Password must be at least 8 characters");
  if (await getUser(env, email)) throw err(409, "Account already exists");
  const { salt, hash } = await hashPassword(password);
  const user = { email, salt, hash, createdAt: Date.now(), plan: "free", downloadsUsed: 0 };
  await putUser(env, user);
  const token = await signToken({ email, exp: Math.floor(Date.now()/1000)+86400*30 }, env.JWT_SECRET);
  return { token, email };
}
async function login(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) throw err(400, "Email and password required");
  const user = await getUser(env, email);
  if (!user) throw err(401, "Invalid email or password");
  if (!await verifyPassword(password, user.salt, user.hash)) throw err(401, "Invalid email or password");
  const token = await signToken({ email, exp: Math.floor(Date.now()/1000)+86400*30 }, env.JWT_SECRET);
  return { token, email };
}

// ============ Me ============
async function me(req, env) {
  const payload = await authenticate(req, env);
  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");
  const limit = parseInt(env.FREE_DOWNLOAD_LIMIT || "10", 10);
  return {
    email: user.email,
    plan: user.plan || "free",
    isPaid: isPaidPlan(user),
    downloadsUsed: user.downloadsUsed || 0,
    downloadLimit: limit,
    currentPeriodEnd: user.currentPeriodEnd || null,
    hasStripeCustomer: !!user.stripeCustomerId,
  };
}

// ============ Resume ============
async function saveResume(req, env) {
  const payload = await authenticate(req, env);
  const { resume } = await req.json();
  await env.HIREFLOW_KV.put(`resume:${payload.email.toLowerCase()}`, JSON.stringify(resume));
  return { ok: true };
}
async function getResume(req, env) {
  const payload = await authenticate(req, env);
  const raw = await env.HIREFLOW_KV.get(`resume:${payload.email.toLowerCase()}`);
  return { resume: raw ? JSON.parse(raw) : null };
}

// ============ Downloads ============
async function incrementDownload(req, env) {
  const payload = await authenticate(req, env);
  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");
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
  if (!r.ok) throw err(r.status, data.error?.message || "Stripe error");
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
  if (!await verifyStripeSig(body, sig, env.STRIPE_WEBHOOK_SECRET)) throw err(400, "Invalid signature");

  const event = JSON.parse(body);
  const obj = event.data.object;

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

  // Free users get NO AI features
  if (PRO_AI.has(action) && !isPaidPlan(user)) {
    throw err(402, "Upgrade to Premium to use AI features");
  }

  const body = await req.json();
  switch (action) {
    case "improve":   return aiImprove(env, body);
    case "skills":    return aiSkills(env, body);
    case "tailor":    return aiTailor(env, body);
    case "ats":       return aiATS(env, body);
    case "analyze":   return aiAnalyze(env, body);
    case "parse":     return aiParse(env, body);
    case "interview": return aiInterview(env, body);
    default: throw err(404, "Unknown AI action");
  }
}

async function runAI(env, system, user, opts = {}) {
  const res = await env.AI.run(AI_MODEL, {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_tokens: opts.max_tokens || 600,
    temperature: opts.temperature ?? 0.4,
  });
  return (res.response || "").trim();
}

async function aiImprove(env, { target, text }) {
  const sys = `You are an expert resume writer. Improve the user's content to be concise, achievement-focused, and ATS-friendly. Use strong action verbs and quantify impact when possible. Respond ONLY with the improved text — no preamble.`;
  return { text: await runAI(env, sys, `Section: ${target}\n\nContent:\n${text || "(empty)"}\n\nImprove it.`) };
}
async function aiSkills(env, { experience }) {
  const sys = `You extract resume-ready skills. Given work experience, return a comma-separated list of 10-20 relevant hard and soft skills. No explanations.`;
  return { skills: await runAI(env, sys, `Experience:\n${JSON.stringify(experience).slice(0,2000)}`) };
}
async function aiTailor(env, { jobDescription, resume }) {
  const sys = `You tailor resumes to job descriptions. Output JSON: { "summary": "<rewritten 2-3 sentence summary>", "notes": "<3 things to emphasize>" }. Only JSON.`;
  const raw = await runAI(env, sys,
    `Job description:\n${(jobDescription||'').slice(0,2000)}\n\nResume:\n${JSON.stringify(resume).slice(0,3000)}`, { max_tokens: 500 });
  const j = safeJSON(raw);
  return { text: j?.notes || raw, summary: j?.summary };
}
async function aiATS(env, { jobDescription, resume }) {
  const sys = `You are an ATS scorer. Output JSON: { "score": <0-100>, "feedback": "<2-4 bullet points>" }. Only JSON.`;
  const raw = await runAI(env, sys,
    `Job description:\n${(jobDescription||'').slice(0,1500)}\n\nResume:\n${JSON.stringify(resume).slice(0,3000)}`, { max_tokens: 400 });
  return safeJSON(raw) || { score: 50, feedback: raw };
}
async function aiAnalyze(env, { resume }) {
  const sys = `You are a career coach. Analyze the resume and give a concise critique: strengths, weaknesses, top 3 improvements. Short bullets.`;
  return { text: await runAI(env, sys, `Resume:\n${JSON.stringify(resume).slice(0,4000)}`, { max_tokens: 600 }) };
}
async function aiParse(env, { text }) {
  const sys = `You parse plain-text resumes into JSON:
{"personal":{"fullName":"","email":"","phone":"","location":"","linkedin":"","github":"","website":"","summary":""},"experience":[{"title":"","company":"","start":"","end":"","location":"","description":""}],"education":[{"school":"","degree":"","field":"","gpa":"","start":"","end":"","notes":""}],"skills":{"categories":[{"name":"All","items":[]}]},"projects":[{"name":"","role":"","tech":"","link":"","description":""}],"certifications":[{"name":"","issuer":"","date":"","url":""}],"awards":[{"name":"","issuer":"","date":"","description":""}]}
Output ONLY JSON.`;
  return { resume: safeJSON(await runAI(env, sys, text.slice(0, 4000), { max_tokens: 1500 })) };
}
async function aiInterview(env, { role, jobDescription, resume }) {
  const sys = `You are an interview coach. Generate 8 practice interview questions tailored to the role and resume. Mix behavioral and role-specific. Number each. Add a one-line tip under each.`;
  return { text: await runAI(env, sys,
    `Role: ${role}\nJD: ${(jobDescription||'').slice(0,1500)}\nResume: ${JSON.stringify(resume).slice(0,2500)}`, { max_tokens: 800 }) };
}

function safeJSON(s) {
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/); if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}
