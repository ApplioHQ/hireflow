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

// Smaller, faster: free-form writing tasks.
// NOTE: the old "@cf/meta/llama-3.1-8b-instruct" was DEPRECATED by Cloudflare on
// 2026-05-30 (error 5028), which broke every AI call. Use the current model ids.
const FAST_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
// Larger, better at structured output + reasoning: parse, analyze, tailor, ats.
const SMART_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

// Shared anti-hallucination directive, prepended to every generative AI prompt so the
// model can never fabricate facts the candidate didn't actually provide. This is the
// single most important guardrail for output quality/trust.
const GROUNDING = `GROUNDING — the most important rule, overrides everything else if in conflict:
Use ONLY facts explicitly present in the candidate's input. Never invent, assume, infer, or embellish. Do NOT add numbers, percentages, dollar amounts, metrics, dates, job titles, company names, team sizes, technologies, tools, degrees, certifications, or achievements that are not clearly stated in the input. If a specific detail (like a metric) is missing, keep the statement qualitative, never fabricate one. When unsure whether something is supported, leave it out. Accurate and modest always beats impressive and false.
Never use em dashes; use commas, periods, or parentheses instead.`;

// AI endpoints that require Premium/Lifetime
// Note: "parse" (resume import) is intentionally NOT here — importing is free for everyone.
const PRO_AI = new Set(["tailor", "ats", "analyze", "interview", "skills", "improve", "assistant", "autopilot"]);
// Career Coach (assistant) is Premium/Lifetime only — it is in PRO_AI above and the
// frontend shows a Premium gate to free users. Cover letters give a small free taste.
const FREE_COVER_LETTERS = 2;
// Per-account daily AI call caps — a soft backstop against runaway usage/abuse
// driving up Workers AI cost. Deliberately far above what a genuine user does in a
// day (free users can only reach parse / interview / summary-improve; paid do heavier
// tailoring). Admins bypass entirely. Approximate (KV, eventually consistent) by design.
const FREE_AI_DAILY = 50;
const PAID_AI_DAILY = 400;

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

    // One-click email unsubscribe (public, HTML response, token-verified — no login).
    if (path === "/unsubscribe") {
      return handleUnsubscribe(url, env).catch(() => new Response("Something went wrong.", { status: 500, headers: { "Content-Type": "text/html" } }));
    }

    try {
      if (path === "/auth/signup")             return json(await signup(req, env), 200, cors);
      if (path === "/auth/login")              return json(await login(req, env), 200, cors);
      if (path === "/me")                      return json(await me(req, env), 200, cors);
      if (path === "/me/sync")                 return json(await syncWithStripe(req, env), 200, cors);
      if (path === "/status")                  return json(await getStatus(req, env), 200, cors);
      if (path === "/resume" && req.method === "GET")  return json(await getResume(req, env), 200, cors);
      if (path === "/resume" && req.method === "POST") return json(await saveResume(req, env), 200, cors);
      if (path === "/profile" && req.method === "GET")  return json(await getProfile(req, env), 200, cors);
      if (path === "/profile" && req.method === "POST") return json(await saveProfile(req, env), 200, cors);
      if (path === "/attribution" && req.method === "POST") return json(await saveAttribution(req, env), 200, cors);
      if (path === "/jobs" && req.method === "GET")  return json(await getJobs(req, env), 200, cors);
      if (path === "/jobs" && req.method === "POST") return json(await saveJobs(req, env), 200, cors);
      if (path === "/downloads/increment")     return json(await incrementDownload(req, env), 200, cors);
      if (path === "/stripe/checkout")         return json(await createCheckout(req, env), 200, cors);
      if (path === "/stripe/portal")           return json(await createPortal(req, env), 200, cors);
      if (path === "/feedback" && req.method === "POST")     return json(await saveFeedback(req, env), 200, cors);
      if (path === "/feedback/list" && req.method === "GET") return json(await listFeedback(req, env), 200, cors);
      if (path === "/admin/analytics")         return json(await adminAnalytics(req, env), 200, cors);
      if (path === "/admin/users")             return json(await adminListUsers(req, env), 200, cors);
      if (path === "/admin/users/delete")      return json(await adminDeleteUser(req, env), 200, cors);
      if (path === "/admin/ai-disable")        return json(await adminSetAIDisabled(req, env), 200, cors);
      if (path === "/admin/maintenance")       return json(await adminSetMaintenance(req, env), 200, cors);
      if (path === "/admin/admin-access")      return json(await adminSetAdminAccess(req, env), 200, cors);
      if (path === "/admin/test-win-nudge")    return json(await adminTestWinNudge(req, env), 200, cors);
      if (path.startsWith("/ai/"))             return json(await ai(req, env, path.slice(4)), 200, cors);
      return json({ error: "Not found" }, 404, cors);
    } catch (e) {
      return json({ error: e.message || "Error" }, e.status || 500, cors);
    }
  },

  // Cron (Fridays 16:00 UTC, see wrangler.toml). Weekly "log your win" nudge.
  // Fully inert until env.RESEND_API_KEY is configured.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runWeeklyWinNudge(env).catch(() => {}));
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
// Baseline security headers for every API response. This is a JSON auth API:
// responses must never be sniffed, framed, cached by intermediaries, or leak a referrer.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS, ...headers },
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
  const payload = await verifyToken(token, env.JWT_SECRET);
  // Immediately revoke admin sessions if super disabled the ADMIN tier
  if (payload.role === "admin") {
    const adminDisabled = await env.HIREFLOW_KV.get("system:admin_disabled");
    if (adminDisabled === "1") throw err(401, "Invalid token");
  }
  return payload;
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

  // SUPER admin: both email and password are secret env vars
  if (env.SUPERADMIN_EMAIL && env.SUPERADMIN_PASSWORD
      && email === env.SUPERADMIN_EMAIL
      && timingEqual(password, env.SUPERADMIN_PASSWORD)) {
    const token = await signToken({
      email: env.SUPERADMIN_EMAIL,
      role: "super",
      exp: Math.floor(Date.now()/1000) + 3600 * 24 * 7   // 7 days (super has no kill switch, keep tighter)
    }, env.JWT_SECRET);
    return { token, email: env.SUPERADMIN_EMAIL, role: "super" };
  }

  // Regular ADMIN: literal "ADMIN" username + secret password
  // Blocked if super-admin has disabled the ADMIN tier.
  if (email === "ADMIN" && env.ADMIN_PASSWORD
      && timingEqual(password, env.ADMIN_PASSWORD)) {
    const adminDisabled = await env.HIREFLOW_KV.get("system:admin_disabled");
    if (adminDisabled === "1") throw err(401, "Invalid email or password");
    const token = await signToken({
      email: "ADMIN",
      role: "admin",
      exp: Math.floor(Date.now()/1000) + 3600 * 24 * 30   // 30 days (revocable anytime via the ADMIN-tier kill switch)
    }, env.JWT_SECRET);
    return { token, email: "ADMIN", role: "admin" };
  }

  // Normal user lookup
  const user = await getUser(env, email);
  if (!user) throw err(401, "Invalid email or password");
  if (!await verifyPassword(password, user.salt, user.hash)) throw err(401, "Invalid email or password");
  const token = await signToken({ email, exp: Math.floor(Date.now()/1000)+86400*30 }, env.JWT_SECRET);
  return { token, email };
}

// ============ Me ============
async function me(req, env) {
  const payload = await authenticate(req, env);

  // Admin tokens don't have a real user record
  if (payload.role === "admin" || payload.role === "super") {
    return {
      email: payload.email,
      plan: "premium",
      isPaid: true,
      role: payload.role,
      downloadsUsed: 0,
      downloadLimit: 999999,
      currentPeriodEnd: null,
      hasStripeCustomer: false,
    };
  }

  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");
  const limit = parseInt(env.FREE_DOWNLOAD_LIMIT || "10", 10);
  return {
    email: user.email,
    plan: user.plan || "free",
    isPaid: isPaidPlan(user),
    role: null,
    downloadsUsed: user.downloadsUsed || 0,
    downloadLimit: limit,
    currentPeriodEnd: user.currentPeriodEnd || null,
    hasStripeCustomer: !!user.stripeCustomerId,
  };
}

// ============ System status (public — no auth needed) ============
async function getStatus(req, env) {
  const now = Math.floor(Date.now()/1000);
  const aiUntil = parseInt(await env.HIREFLOW_KV.get("system:ai_disabled_until") || "0", 10);
  const maintUntil = parseInt(await env.HIREFLOW_KV.get("system:maintenance_until") || "0", 10);
  const adminDisabled = (await env.HIREFLOW_KV.get("system:admin_disabled")) === "1";
  return {
    aiDisabled: aiUntil > now,
    aiDisabledUntil: aiUntil > now ? aiUntil : null,
    maintenance: maintUntil > now,
    maintenanceUntil: maintUntil > now ? maintUntil : null,
    adminEnabled: !adminDisabled,
    now,
  };
}

// ============ Admin endpoints ============
async function requireAdmin(req, env, requireSuper = false) {
  const payload = await authenticate(req, env);
  if (requireSuper && payload.role !== "super") throw err(403, "Super admin only");
  if (payload.role !== "admin" && payload.role !== "super") throw err(403, "Admin only");
  return payload;
}

// Read every user record from KV. Lists all keys (paginated), then fetches the
// values in PARALLEL batches — one sequential get() per user does not scale (a few
// hundred users would exceed the Worker's wall-time budget and the admin request
// would hang). Batching keeps it fast and bounded. One corrupt record is skipped.
async function _readAllUserRecords(env) {
  const keys = [];
  let cursor;
  do {
    const page = await env.HIREFLOW_KV.list({ prefix: "user:", cursor });
    for (const k of page.keys) keys.push(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const users = [];
  const BATCH = 60;
  for (let i = 0; i < keys.length; i += BATCH) {
    const raws = await Promise.all(keys.slice(i, i + BATCH).map(name => env.HIREFLOW_KV.get(name)));
    for (const raw of raws) {
      if (!raw) continue;
      let u; try { u = JSON.parse(raw); } catch { continue; }
      users.push(u);
    }
  }
  return users;
}

async function adminListUsers(req, env) {
  await requireAdmin(req, env);
  const records = await _readAllUserRecords(env);
  const users = records.map(u => ({
    email: u.email,
    plan: u.plan || "free",
    createdAt: u.createdAt || null,
    currentPeriodEnd: u.currentPeriodEnd || null,
    downloadsUsed: u.downloadsUsed || 0,
    hasStripeCustomer: !!u.stripeCustomerId,
    updatedAt: u.updatedAt || u.createdAt || null,
  }));
  users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));   // newest first
  return { users, total: users.length };
}

// Aggregate user stats for the admin dashboard. Available to admin + super.
async function adminAnalytics(req, env) {
  await requireAdmin(req, env);
  const now = Date.now();
  const DAY = 86400000;

  const plans = { free: 0, premium: 0, lifetime: 0 };
  let total = 0, totalDownloads = 0;
  let signupsToday = 0, last7Signups = 0, last30Signups = 0, prev7Signups = 0;
  let activeSubs = 0, stripeLinked = 0, everDownloaded = 0, dormant = 0;
  const todayStr = new Date(now).toISOString().slice(0, 10);

  // Pre-seed the last 30 UTC days to 0 so the sparkline is continuous.
  const signupsByDay = {};
  for (let i = 29; i >= 0; i--) {
    signupsByDay[new Date(now - i * DAY).toISOString().slice(0, 10)] = 0;
  }

  // Read all user records in parallel batches (fast + bounded), then aggregate.
  const attribution = {};
  const records = await _readAllUserRecords(env);
  for (const u of records) {
    total++;
    if (u.attribution) attribution[u.attribution] = (attribution[u.attribution] || 0) + 1;
    const plan = (u.plan === "premium" || u.plan === "lifetime") ? u.plan : "free";
    plans[plan]++;
    const dl = Number(u.downloadsUsed) || 0;
    totalDownloads += dl;
    if (dl > 0) everDownloaded++;
    if (u.stripeCustomerId) stripeLinked++;
    // Active paid: lifetime never expires; premium counts if its period end is in the future.
    if (plan === "lifetime") activeSubs++;
    else if (plan === "premium" && (Number(u.currentPeriodEnd) || 0) * 1000 > now) activeSubs++;
    const created = Number(u.createdAt) || 0;
    if (created) {
      const age = now - created;
      if (new Date(created).toISOString().slice(0, 10) === todayStr) signupsToday++;
      if (age <= 7 * DAY)  last7Signups++;
      else if (age <= 14 * DAY) prev7Signups++;
      if (age <= 30 * DAY) last30Signups++;
      const day = new Date(created).toISOString().slice(0, 10);
      if (day in signupsByDay) signupsByDay[day]++;
    }
    // Dormant: joined more than 7 days ago and never downloaded anything.
    if (created && now - created > 7 * DAY && dl === 0) dormant++;
  }

  const paid = plans.premium + plans.lifetime;
  const conversionRate = total ? Math.round((paid / total) * 1000) / 10 : 0;
  const avgDownloads = total ? Math.round((totalDownloads / total) * 10) / 10 : 0;
  const activationRate = total ? Math.round((everDownloaded / total) * 1000) / 10 : 0;
  // Week-over-week signup momentum (last 7d vs the 7 days before that).
  const signupTrend = prev7Signups ? Math.round(((last7Signups - prev7Signups) / prev7Signups) * 100) : (last7Signups ? 100 : 0);

  return {
    total, plans, conversionRate, totalDownloads, avgDownloads,
    signupsToday, last7Signups, last30Signups, prev7Signups, signupTrend,
    activeSubs, stripeLinked, everDownloaded, activationRate, dormant,
    signupsByDay, attribution,
  };
}

async function adminDeleteUser(req, env) {
  await requireAdmin(req, env, true);
  const { email } = await req.json();
  if (!email) throw err(400, "Email required");
  const key = email.toLowerCase();
  await env.HIREFLOW_KV.delete(`user:${key}`);
  await env.HIREFLOW_KV.delete(`resume:${key}`);
  return { ok: true, email };
}

async function adminSetAIDisabled(req, env) {
  await requireAdmin(req, env, true);
  const { minutes } = await req.json();
  const m = parseInt(minutes, 10);
  if (m && m > 0) {
    const until = Math.floor(Date.now()/1000) + (m * 60);
    await env.HIREFLOW_KV.put("system:ai_disabled_until", String(until));
    return { ok: true, aiDisabledUntil: until };
  }
  await env.HIREFLOW_KV.delete("system:ai_disabled_until");
  return { ok: true, aiDisabledUntil: null };
}

async function adminSetMaintenance(req, env) {
  await requireAdmin(req, env, true);
  const { minutes } = await req.json();
  const m = parseInt(minutes, 10);
  if (m && m > 0) {
    const until = Math.floor(Date.now()/1000) + (m * 60);
    await env.HIREFLOW_KV.put("system:maintenance_until", String(until));
    return { ok: true, maintenanceUntil: until };
  }
  await env.HIREFLOW_KV.delete("system:maintenance_until");
  return { ok: true, maintenanceUntil: null };
}

async function adminSetAdminAccess(req, env) {
  await requireAdmin(req, env, true);
  const { enabled } = await req.json();
  if (enabled === false) {
    await env.HIREFLOW_KV.put("system:admin_disabled", "1");
  } else {
    await env.HIREFLOW_KV.delete("system:admin_disabled");
  }
  return { ok: true, adminEnabled: enabled !== false };
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

// ============ Career profile (dashboard: goals, target role, win journal) ============
// Small per-user document that makes the copilot "know you" across devices. Kept
// separate from the resume so the dashboard can sync it independently.
async function getProfile(req, env) {
  const payload = await authenticate(req, env);
  const raw = await env.HIREFLOW_KV.get(`profile:${payload.email.toLowerCase()}`);
  return { profile: raw ? JSON.parse(raw) : null };
}
async function saveProfile(req, env) {
  const payload = await authenticate(req, env);
  const body = await req.json().catch(() => ({}));
  const profile = body && typeof body.profile === "object" && body.profile ? body.profile : {};
  // Guard against runaway size (the win journal is capped client-side, but be safe).
  const str = JSON.stringify(profile);
  if (str.length > 60000) throw err(413, "Profile too large");
  await env.HIREFLOW_KV.put(`profile:${payload.email.toLowerCase()}`, str);
  return { ok: true };
}

// ============ Signup attribution ("where did you hear about us?") ============
// Stored on the user record so the admin analytics can aggregate the breakdown.
async function saveAttribution(req, env) {
  const payload = await authenticate(req, env);
  const body = await req.json().catch(() => ({}));
  const source = String(body.source || "").trim().slice(0, 40);
  if (!source) return { ok: false };
  const user = await getUser(env, payload.email).catch(() => null);
  if (user) { user.attribution = source; user.attributionAt = Date.now(); await putUser(env, user); }
  return { ok: true };
}

// ============ Job tracker (cross-device sync of the application pipeline) ============
// Stored as { jobs:[...], updatedAt } so the client can do last-write-wins.
async function getJobs(req, env) {
  const payload = await authenticate(req, env);
  const raw = await env.HIREFLOW_KV.get(`jobs:${payload.email.toLowerCase()}`);
  return raw ? JSON.parse(raw) : { jobs: null, updatedAt: 0 };
}
async function saveJobs(req, env) {
  const payload = await authenticate(req, env);
  const body = await req.json().catch(() => ({}));
  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  const doc = { jobs, updatedAt: body.updatedAt || Date.now() };
  const str = JSON.stringify(doc);
  if (str.length > 200000) throw err(413, "Too many jobs to sync");
  await env.HIREFLOW_KV.put(`jobs:${payload.email.toLowerCase()}`, str);
  return { ok: true };
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
    "success_url": `${site}/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
    "cancel_url": `${site}/pricing`,
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
    return { ok: false, message: "No Stripe customer found for " + user.email + ". If you paid, make sure the same email was used at checkout." };
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
      message: "Synced — Premium subscription active",
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
    return { ok: true, linked: true, plan: "lifetime", hasStripeCustomer: true, message: "Synced — Lifetime access active" };
  }

  // 4) Customer exists but no active subscription or paid one-time
  user.updatedAt = Date.now();
  await putUser(env, user);
  return {
    ok: true,
    linked: true,
    plan: user.plan || "free",
    hasStripeCustomer: true,
    message: "Customer linked, but no active subscription found. If you just paid, wait ~30 seconds and try again.",
  };
}

async function createPortal(req, env) {
  const payload = await authenticate(req, env);
  const user = await getUser(env, payload.email);
  if (!user || !user.stripeCustomerId) throw err(400, "No billing customer found");
  const site = env.SITE_URL || "https://appliohq.com";
  const session = await stripeCall(env, "POST", "/v1/billing_portal/sessions", {
    "customer": user.stripeCustomerId,
    "return_url": `${site}/editor`,
  });
  return { url: session.url };
}

// ============ Stripe Webhook ============
async function handleWebhook(req, env) {
  const sig = req.headers.get("Stripe-Signature");
  const body = await req.text();
  if (!sig) throw err(400, "Missing signature");
  if (!await verifyStripeSig(body, sig, env.STRIPE_WEBHOOK_KEY)) throw err(400, "Invalid signature");

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
  // Reject events outside Stripe's recommended 5-minute tolerance so a captured,
  // validly-signed request body can't be replayed later. Stripe re-signs each
  // delivery attempt with a fresh timestamp, so legitimate retries are unaffected.
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  for (const s of sigs) if (timingEqual(s, expected)) return true;
  return false;
}

// ============ AI (gated by plan + global kill switch) ============
async function ai(req, env, action) {
  const payload = await authenticate(req, env);

  // Admin/super bypass plan and global-disable checks
  const isAdmin = payload.role === "admin" || payload.role === "super";

  // Global AI kill switch — return a generic error so users don't learn it was disabled on purpose.
  if (!isAdmin) {
    const aiUntil = parseInt(await env.HIREFLOW_KV.get("system:ai_disabled_until") || "0", 10);
    if (aiUntil > Math.floor(Date.now()/1000)) {
      throw err(503, "Service temporarily unavailable. Please try again later.");
    }
  }

  // Read the request body once (req.json() can only be consumed a single time).
  const body = await req.json();

  // Admin tokens have no user record — let them through
  if (isAdmin) {
    return await aiDispatch(env, action, body);
  }

  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");
  const paid = isPaidPlan(user);

  // Free for everyone (matches the pricing page + in-app copy): resume import
  // (parse), interview prep, and "AI Improve" on the summary. Every other PRO_AI
  // action requires Premium.
  const freeForAll = action === "parse" || action === "interview" ||
    (action === "improve" && (body.target === "summary" || body.target === "personal"));
  if (PRO_AI.has(action) && !paid && !freeForAll) {
    throw err(402, "Upgrade to Premium to use AI features");
  }

  // Career Coach (assistant) is Premium-only — enforced by the PRO_AI gate above.

  // Per-account daily AI cap: soft cost/abuse guard. Count is per UTC day, expires
  // after 2 days, and is checked/incremented per request. Failures are fail-open
  // (a KV hiccup never blocks a legit call). Real users never approach these caps.
  const rlDay = new Date().toISOString().slice(0, 10);
  const rlKey = `airate:${(payload.email || "").toLowerCase()}:${rlDay}`;
  const rlUsed = parseInt(await env.HIREFLOW_KV.get(rlKey).catch(() => "0") || "0", 10);
  const rlCap = paid ? PAID_AI_DAILY : FREE_AI_DAILY;
  if (rlUsed >= rlCap) {
    throw err(429, paid
      ? "You've reached today's AI usage limit. It resets at midnight UTC — sorry for the interruption."
      : "You've reached today's free AI limit. Upgrade to Premium for a much higher limit, or come back tomorrow.");
  }
  const bumpRate = () => env.HIREFLOW_KV
    .put(rlKey, String(rlUsed + 1), { expirationTtl: 172800 }).catch(() => {});

  // Cover Letter Maker: free users get a couple of letters as a taste, then must
  // upgrade. Counted only on a SUCCESSFUL generation. Paid users are unlimited.
  if (action === "cover-letter" && !paid) {
    const used = user.coverLettersUsed || 0;
    if (used >= FREE_COVER_LETTERS) {
      throw err(402, "You've used your free cover letters. Upgrade to Premium for unlimited cover letters.");
    }
    await bumpRate();
    const result = await aiDispatch(env, action, body);
    user.coverLettersUsed = used + 1;
    await putUser(env, user);
    return { ...result, freeRemaining: Math.max(0, FREE_COVER_LETTERS - user.coverLettersUsed) };
  }

  await bumpRate();
  return await aiDispatch(env, action, body);
}

// ============ Feedback ============
// Stored as feedback:<ts>:<email> so the admin inbox can list newest-first.
async function saveFeedback(req, env) {
  const payload = await authenticate(req, env);
  const body = await req.json().catch(() => ({}));
  const user = await getUser(env, payload.email).catch(() => null);
  const ts = Date.now();
  const email = (payload.email || "unknown").toLowerCase();
  const record = {
    ts,
    email,
    plan: (user && user.plan) || "free",
    rating: body.rating === "up" || body.rating === "down" ? body.rating : "none",
    message: String(body.message || "").slice(0, 4000),
    context: String(body.context || "").slice(0, 200),
    page: String(body.page || "").slice(0, 200),
  };
  await env.HIREFLOW_KV.put(`feedback:${ts}:${email}`, JSON.stringify(record));
  return { ok: true };
}

async function listFeedback(req, env) {
  await requireAdmin(req, env);
  const list = await env.HIREFLOW_KV.list({ prefix: "feedback:", limit: 1000 });
  const feedback = [];
  for (const k of list.keys) {
    const raw = await env.HIREFLOW_KV.get(k.name);
    if (!raw) continue;
    try { feedback.push(JSON.parse(raw)); } catch {}
  }
  feedback.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return { feedback };
}

// ============ Weekly "log your win" email nudge (cron-driven) ============
// Retention loop: if someone who has used the Win Journal hasn't logged a win in a
// week, send ONE gentle prompt. Fully inert until env.RESEND_API_KEY is set.
// Respects unsubscribes and never emails the same person more than ~weekly.
const WIN_NUDGE_MAX_SENDS = 200;   // per run — bounds cost + protects sender reputation
const WIN_NUDGE_SCAN_CAP = 3000;   // profiles scanned per run

// Short, stable, unguessable per-email unsubscribe token derived from JWT_SECRET.
async function winUnsubToken(env, email) {
  return (await hmacHex(env.JWT_SECRET || "x", "winunsub:" + email.toLowerCase())).slice(0, 32);
}

function unsubPage(title, msg) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${title}</title>`
    + `<div style="font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:12vh auto;padding:0 24px;color:#111;text-align:center;">`
    + `<div style="font-weight:800;font-size:20px;margin-bottom:8px;">${title}</div>`
    + `<p style="color:#555;">${msg}</p>`
    + `<p style="margin-top:24px;"><a href="https://appliohq.com/dashboard" style="color:#4f46e5;font-weight:600;">Back to Applio &rarr;</a></p></div>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function handleUnsubscribe(url, env) {
  const email = (url.searchParams.get("e") || "").toLowerCase().trim();
  const token = url.searchParams.get("t") || "";
  if (!email || !token) return unsubPage("Invalid link", "This unsubscribe link is missing information.");
  const good = await winUnsubToken(env, email);
  if (token.length !== good.length || token !== good) return unsubPage("Invalid link", "This unsubscribe link isn't valid. If you keep getting emails, just reply and we'll remove you.");
  await env.HIREFLOW_KV.put(`winmail_off:${email}`, "1");
  // Also clear the in-app opt-in so the dashboard toggle reflects the unsubscribe.
  try {
    const raw = await env.HIREFLOW_KV.get(`profile:${email}`);
    if (raw) { const p = JSON.parse(raw); if (p && p.emailWeeklyWin) { p.emailWeeklyWin = false; await env.HIREFLOW_KV.put(`profile:${email}`, JSON.stringify(p)); } }
  } catch { /* non-critical */ }
  return unsubPage("You're unsubscribed", "You won't get the weekly win reminder anymore. You can still turn them back on from your dashboard.");
}

// Admin-only: fire one nudge email on demand to confirm delivery works, without
// waiting for the weekly cron. Bypasses all eligibility rules (it's a raw send test).
async function adminTestWinNudge(req, env) {
  await requireAdmin(req, env);
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw err(400, "Provide a valid email address");
  if (!env.RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY is not set on the worker." };
  const res = await sendWinNudgeEmail(env, email, 3);
  return res.ok
    ? { ok: true, email, from: env.MAIL_FROM || "Applio <noreply@appliohq.com>" }
    : { ok: false, error: "Resend rejected it: " + (res.error || ("HTTP " + res.status)) + " (from: " + (env.MAIL_FROM || "Applio <noreply@appliohq.com>") + ")" };
}

async function runWeeklyWinNudge(env) {
  if (!env.RESEND_API_KEY) return { ok: false, reason: "email not configured" };
  const now = Date.now();
  const WEEK = 7 * 86400000;
  let cursor, scanned = 0, sent = 0;
  do {
    const list = await env.HIREFLOW_KV.list({ prefix: "profile:", cursor, limit: 1000 });
    cursor = list.list_complete ? null : list.cursor;
    for (const k of list.keys) {
      if (scanned >= WIN_NUDGE_SCAN_CAP || sent >= WIN_NUDGE_MAX_SENDS) { cursor = null; break; }
      scanned++;
      const email = k.name.slice("profile:".length);
      if (!email || !email.includes("@")) continue;
      if (await env.HIREFLOW_KV.get(`winmail_off:${email}`)) continue;   // hard opt-out (unsubscribe link)
      if (await env.HIREFLOW_KV.get(`winmail_last:${email}`)) continue;  // emailed within the weekly window
      let profile;
      try { profile = JSON.parse(await env.HIREFLOW_KV.get(k.name) || "null"); } catch { continue; }
      if (!profile || profile.emailWeeklyWin !== true) continue;   // OPT-IN required — only email users who explicitly turned reminders on
      const wins = Array.isArray(profile.achievements) ? profile.achievements : [];
      if (!wins.length) continue;                          // (belt-and-suspenders: need a win to nudge about anyway)
      const lastWin = wins.reduce((m, w) => Math.max(m, (w && w.ts) || 0), 0);
      if (lastWin && now - lastWin < WEEK) continue;       // logged one recently — leave them be
      if ((await sendWinNudgeEmail(env, email, wins.length)).ok) {
        sent++;
        await env.HIREFLOW_KV.put(`winmail_last:${email}`, String(now), { expirationTtl: 561600 }); // ~6.5 days
      }
    }
  } while (cursor);
  return { ok: true, scanned, sent };
}

async function sendWinNudgeEmail(env, email, winCount) {
  const from = env.MAIL_FROM || "Applio <noreply@appliohq.com>";
  const unsub = `https://hireflow-api.pritamavuthu7.workers.dev/unsubscribe?e=${encodeURIComponent(email)}&t=${await winUnsubToken(env, email)}`;
  const addr = env.MAILING_ADDRESS || "";
  const dash = "https://appliohq.com/dashboard";
  const brag = "https://appliohq.com/brag-doc";

  // Rotate the subject line week to week so it stays fresh in a crowded inbox.
  const SUBJECTS = [
    "What did you get done this week?",
    "Don't let this week's wins slip away",
    "2 minutes now saves you hours at resume time",
    "Quick — what went well this week?",
  ];
  const subject = SUBJECTS[Math.floor(Date.now() / (7 * 86400000)) % SUBJECTS.length];

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f8;">
  <div style="font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:36px 26px;color:#20242e;background:#ffffff;">
    <div style="font-weight:800;font-size:20px;color:#4f46e5;letter-spacing:-.3px;margin-bottom:26px;">Applio</div>

    <p style="font-size:21px;font-weight:700;color:#0f172a;line-height:1.35;margin:0 0 16px;">Before the week gets away from you&nbsp;— what went well?</p>

    <p style="margin:0 0 16px;color:#3a4150;">When it's finally time to update your resume or ask for a raise, hardly anyone can remember what they actually did months ago. The fix is almost embarrassingly simple: <strong>jot down one win a week, while it's fresh.</strong></p>

    <p style="margin:0 0 10px;color:#3a4150;">Think back on this week — did you&hellip;</p>
    <ul style="margin:0 0 22px;padding-left:22px;color:#3a4150;">
      <li style="margin-bottom:5px;">ship or wrap up something?</li>
      <li style="margin-bottom:5px;">hit a number, or nudge one in the right direction?</li>
      <li style="margin-bottom:5px;">unblock a teammate or fix something painful?</li>
      <li>pick up a new tool, or get handed something bigger?</li>
    </ul>
    <p style="margin:0 0 26px;color:#3a4150;">Any one of those counts. Logging it takes about 30 seconds.</p>

    <p style="margin:0 0 28px;"><a href="${dash}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 24px;border-radius:8px;">Log this week's win &rarr;</a></p>

    <p style="margin:0 0 4px;color:#3a4150;">Here's the payoff: every win you log becomes a ready-to-use resume bullet and hard proof for your next review, promotion case, or raise — and it all compiles into a <a href="${brag}" style="color:#4f46e5;">one-page brag doc</a> the moment you need it. Miss the week and the memory's usually gone for good.</p>

    <p style="margin:24px 0 0;color:#3a4150;">See you next week,<br>The Applio team</p>

    <hr style="border:0;border-top:1px solid #e9ebf1;margin:30px 0 14px;">
    <p style="color:#9aa0ad;font-size:12px;line-height:1.6;margin:0;">You're getting this because you use Applio's Win Journal. It's one short email a week, and only when you haven't logged a win. <a href="${unsub}" style="color:#9aa0ad;">Unsubscribe anytime</a>.${addr ? "<br>" + addr : ""}</p>
  </div></body></html>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject, html }),
    });
    if (r.ok) return { ok: true };
    let detail = "";
    try { const j = await r.json(); detail = j.message || j.error || JSON.stringify(j); }
    catch { detail = (await r.text().catch(() => "")) || `HTTP ${r.status}`; }
    return { ok: false, status: r.status, error: detail };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

async function aiDispatch(env, action, body) {
  switch (action) {
    case "improve":   return aiImprove(env, body);
    case "win":       return aiWin(env, body);
    case "skills":    return aiSkills(env, body);
    case "skill-gap": return aiSkillGap(env, body);
    case "tailor":    return aiTailor(env, body);
    case "ats":       return aiATS(env, body);
    case "analyze":   return aiAnalyze(env, body);
    case "parse":     return aiParse(env, body);
    case "interview": return aiInterview(env, body);
    case "interview-feedback": return aiInterviewFeedback(env, body);
    case "cover-letter": return aiCoverLetter(env, body);
    case "assistant": return aiAssistant(env, body);
    case "autopilot": return aiAutopilot(env, body);
    default: throw err(404, "Unknown AI action");
  }
}

// Extract the generated text from a Workers AI response, robust to model shape.
// Older Llama models returned { response: "text" }; newer ones (e.g. Llama 4 Scout)
// can return response as an object/array or use OpenAI-style choices. Never assume
// it's a string, calling .trim() on a non-string was what broke every AI call.
function _aiText(res) {
  if (res == null) return "";
  if (typeof res === "string") return res;
  const asText = (v) => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map((p) => (typeof p === "string" ? p : (p && (p.text || p.content)) || "")).join("");
    if (v && typeof v === "object") return v.text || v.content || v.response || "";
    return "";
  };
  // Common Workers AI fields, then OpenAI-compatible shape.
  let t = asText(res.response) || asText(res.result && res.result.response) || asText(res.result) || asText(res.output_text);
  if (!t && Array.isArray(res.choices) && res.choices[0]) {
    const c = res.choices[0].message ? res.choices[0].message.content : res.choices[0].text;
    t = asText(c);
  }
  return typeof t === "string" ? t : "";
}

async function runAI(env, system, user, opts = {}) {
  // Try the requested (or default) model; if it errors, fall back to the fast model.
  const wanted = opts.model || FAST_MODEL;
  // Always try the other model as a fallback too, so a single deprecated/failing
  // model id can never take down every AI feature (as the 2026-05-30 deprecation did).
  const other = wanted === FAST_MODEL ? SMART_MODEL : FAST_MODEL;
  const chain = [wanted, other];
  const payload = {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_tokens: opts.max_tokens || 800,
    temperature: opts.temperature ?? 0.3,
  };
  // Only route through AI Gateway when a REAL gateway id is configured. The
  // placeholder "default" usually does NOT correspond to an existing gateway, and
  // a missing/broken gateway makes EVERY AI call fail. Calling Workers AI directly
  // is strictly safer (you only lose gateway caching/analytics), so we skip it.
  const gwId = env.AI_GATEWAY_ID && env.AI_GATEWAY_ID !== "default" ? env.AI_GATEWAY_ID : null;
  let lastErr;
  for (const model of chain) {
    // If a gateway is configured, try via the gateway first, then retry the same
    // model DIRECTLY, so a gateway outage can never take down all AI.
    const attempts = gwId ? [{ gateway: { id: gwId } }, {}] : [{}];
    for (const runOpts of attempts) {
      try {
        const res = await env.AI.run(model, payload, runOpts);
        const out = _aiText(res).trim();
        if (out) return out;
        // Empty: log the shape once so an unexpected response format is diagnosable.
        try { console.error(`${model} empty/unknown response shape:`, JSON.stringify(res).slice(0, 300)); } catch (_) {}
        lastErr = new Error(`${model} returned empty response`);
      } catch (e) {
        lastErr = e;
        console.error(`AI model ${model} failed${runOpts.gateway ? " (via gateway)" : " (direct)"}:`, e.message || e);
      }
    }
  }
  // 429 / quota / neuron / limit → the account's Workers AI allowance is exhausted;
  // surface that distinctly so the UI can say "limit reached", not "busy, try again".
  const msg = (lastErr && (lastErr.message || String(lastErr))) || "unknown";
  if (/429|quota|neuron|limit|exceeded|too many/i.test(msg)) {
    throw err(429, `AI usage limit reached: ${msg}`);
  }
  throw err(502, `AI model error: ${msg}`);
}

// Multi-turn variant of runAI: takes a full messages array (system + conversation).
async function runAIChat(env, messages, opts = {}) {
  const wanted = opts.model || FAST_MODEL;
  const other = wanted === FAST_MODEL ? SMART_MODEL : FAST_MODEL;
  const chain = [wanted, other];
  const payload = { messages, max_tokens: opts.max_tokens || 700, temperature: opts.temperature ?? 0.4 };
  const gwId = env.AI_GATEWAY_ID && env.AI_GATEWAY_ID !== "default" ? env.AI_GATEWAY_ID : null;
  let lastErr;
  for (const model of chain) {
    const attempts = gwId ? [{ gateway: { id: gwId } }, {}] : [{}];
    for (const runOpts of attempts) {
      try {
        const res = await env.AI.run(model, payload, runOpts);
        const out = _aiText(res).trim();
        if (out) return out;
        lastErr = new Error(`${model} returned empty response`);
      } catch (e) { lastErr = e; console.error(`AI chat ${model} failed:`, e.message || e); }
    }
  }
  const msg = (lastErr && (lastErr.message || String(lastErr))) || "unknown";
  if (/429|quota|neuron|limit|exceeded|too many/i.test(msg)) throw err(429, `AI usage limit reached: ${msg}`);
  throw err(502, `AI model error: ${msg}`);
}

// runAI + JSON parse, with ONE stricter retry if the first reply doesn't parse
// (covers prose wrappers, code fences, and truncation). Returns { obj, raw };
// obj is null only if both attempts fail, so callers keep their existing fallback.
async function runAIJSON(env, system, user, opts = {}) {
  const raw = await runAI(env, system, user, opts);
  let obj = safeJSON(raw);
  if (obj != null) return { obj, raw };
  const strictSys = system + `\n\nCRITICAL: Respond with ONLY the JSON value — no prose, no explanation, no markdown code fences. Start with { or [ and return complete, valid JSON. Do not stop early.`;
  const raw2 = await runAI(env, strictSys, user, {
    ...opts,
    max_tokens: Math.min(4096, Math.round((opts.max_tokens || 800) * 1.35)),
    temperature: Math.min(opts.temperature ?? 0.2, 0.1),
  });
  obj = safeJSON(raw2);
  return obj != null ? { obj, raw: raw2 } : { obj: null, raw };
}

// Response cache for deterministic, expensive AI calls (same input → same output).
// Keyed by SHA-256 of (namespace + input), stored in KV with a short TTL. Fail-open:
// any KV hiccup just falls through to a live AI call, never an error.
async function _aiCacheKey(ns, input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ns + "\u0000" + input));
  return "aicache:" + ns + ":" + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
async function aiCacheGet(env, ns, input) {
  try { const hit = await env.HIREFLOW_KV.get(await _aiCacheKey(ns, input)); return hit ? JSON.parse(hit) : null; }
  catch (_) { return null; }
}
async function aiCachePut(env, ns, input, out, ttl = 3600) {
  try { if (out != null) await env.HIREFLOW_KV.put(await _aiCacheKey(ns, input), JSON.stringify(out), { expirationTtl: ttl }); }
  catch (_) {}
}

// ============ Career assistant (conversational copilot) ============
async function aiAssistant(env, { messages, resume }) {
  const history = (Array.isArray(messages) ? messages : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-12)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== "user") {
    throw err(400, "Send a message to the assistant.");
  }
  const resumeCtx = resume && Object.keys(resume).length
    ? JSON.stringify(resume).slice(0, 5000)
    : "(the user hasn't built a resume yet — encourage them to start one in the Resume Builder)";
  const sys = `${GROUNDING}

You are Applio's AI career assistant, a sharp, encouraging career coach for job seekers.
You help with: resume feedback and rewrites, tailoring to a job, interview prep, job-search strategy, cover letters, LinkedIn, career direction, and salary/negotiation.

Style:
- Concise and direct. Short paragraphs and bullet points, never walls of text.
- Warm and motivating, but honest. No fluff, no restating the question.
- Ground every answer in the user's actual resume below; reference their real roles/skills.
- If asked to write or rewrite something, output the finished text.
- If a question needs info you don't have, ask ONE focused follow-up.
- If a question is unrelated to careers/jobs, gently steer back.
- Point users to Applio's tools when relevant (Resume Builder, AI Tailor, ATS Check, Analysis, Interview Prep, Best Match, Job Tracker).

The user's current resume (JSON):
${resumeCtx}`;
  const reply = await runAIChat(env, [{ role: "system", content: sys }, ...history],
    { model: SMART_MODEL, max_tokens: 700, temperature: 0.35 });
  return { reply };
}

// ============ Improve writing ============
async function aiImprove(env, { target, text, context }) {
  if (!text || !text.trim()) {
    return { text: "Add some content first, then click AI Improve to refine it." };
  }
  const isSummary = target === "summary" || target === "personal";
  const ctx = context || {};
  // Role/company context makes bullets relevant to the actual position instead of generic.
  const role = String(ctx.role || "").slice(0, 120);
  const company = String(ctx.company || "").slice(0, 120);
  const roleLine = role
    ? `CONTEXT: This content is for the role "${role}"${company ? ` at ${company}` : ""}. Make every line clearly relevant to that role and the seniority it implies.`
    : "";

  const body = isSummary
    ? `You are an elite executive resume writer. Rewrite the candidate's professional summary into a sharp, recruiter-facing pitch.
${roleLine}

WRITE IT SO IT:
- Is 2-3 sentences, 40-60 words MAX — tight, zero filler.
- Opens with a strong identity statement: "[Title/role] with [X years / core domain]…" using only facts in the input.
- Names 2-3 standout, specific strengths (skills, domains, or scope) — concrete nouns, not adjectives.
- Ends with the value the candidate brings to a hiring manager for this kind of role.
- Active voice; third-person implied (no "I", no "you").
- BANNED buzzwords: "results-driven", "dynamic", "passionate", "synergy", "self-starter", "team player", "detail-oriented", "hard-working", "go-getter".
- Preserves the candidate's real facts — never invent titles, numbers, employers, or achievements.
- Plain text only — no markdown, no headers, no quotation marks.

Before answering, silently check: under 60 words? no banned buzzword? no invented fact? Fix any that fail.

OUTPUT: Only the rewritten summary. Nothing else.`
    : `You are an elite executive resume writer. Rewrite the ${target} content into tight, achievement-focused bullets a top recruiter would love.
${roleLine}

Every bullet follows the impact formula:  [strong action verb] + [what you did] + [the measurable result or scope].

HARD RULES — follow exactly:
- Output 3-6 bullets, one per line, each starting with "• ".
- Each bullet is ONE sentence, 12-20 words. Never a second sentence or trailing "which…" clause.
- Begin each bullet with a DISTINCT strong past-tense verb (Led, Built, Shipped, Reduced, Designed, Drove, Architected, Launched, Cut, Scaled, Automated, Negotiated). Never reuse a verb.
- Lead with impact. Include a metric (%, $, time, scale, users, headcount) ONLY if present in or directly implied by the input. NEVER invent numbers.
- Keep real facts; prefer concrete outcomes over stacked adjectives.
- BANNED openers/phrases (never use): "Responsible for", "Worked on", "Helped", "Assisted with", "Tasked with", "Duties included", "Successfully", "In order to", "Various", "Leveraged", "Utilized", "Spearheaded".
- Plain text only. No markdown, no headers, no preamble, no closing remarks.

Before answering, silently self-check each bullet: unique strong verb? one sentence, ≤20 words? no banned phrase? no invented number? Fix any that fail.

EXAMPLES (weak input → strong bullet):
  "Responsible for the website and worked on making it faster."
    → "• Rebuilt the marketing site in Next.js, cutting page load time 40%."
  "Helped the sales team with reports and did some analysis to find trends."
    → "• Built weekly sales dashboards in SQL, surfacing trends that lifted quota attainment."
  "Managed engineers and shipped features."
    → "• Led a team of engineers to ship three core features across two product launches."

OUTPUT: Only the bullets, one per line, each starting with "• ". Nothing else.`;
  const sys = GROUNDING + "\n\n" + body;
  // Stronger model + low temperature + tight token budget so the AI stays accurate and
  // can't ramble into fabricated paragraphs.
  const opts = isSummary
    ? { model: SMART_MODEL, max_tokens: 240, temperature: 0.3 }
    : { model: SMART_MODEL, max_tokens: 360, temperature: 0.25 };
  const out = await runAI(env, sys, `Candidate content:\n${text}\n\nRewrite it.`, opts);
  let cleaned = out
    .replace(/^(here'?s?( is)?|sure[,!]?|certainly[,!]?|of course[,!]?)[^]*?:\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
  // For bullets, enforce format + strip banned openers in CODE so a chatty model can
  // never slip fluff past us: one tight sentence per bullet, ≤20 words, distinct verbs.
  if (!isSummary) cleaned = _tightenBullets(cleaned);
  return { text: cleaned };
}

// ============ Polish one win-journal note into a resume-ready bullet ============
// Free for all (it drives the win-logging habit and shows AI value). Grounded so
// it never invents facts — it only rewrites what the user actually wrote.
async function aiWin(env, { text, context }) {
  if (!text || !text.trim()) return { text: "" };
  const role = String((context && context.role) || "").slice(0, 120);
  const roleLine = role ? `CONTEXT: this is for a "${role}" role — keep it relevant to that.\n` : "";
  const sys = GROUNDING + `

You are an elite resume writer. Turn the candidate's rough note about something they accomplished into ONE polished, achievement-focused resume bullet.
${roleLine}HARD RULES:
- Output EXACTLY one bullet, starting with "• ".
- One sentence, 12-20 words, leading with a strong past-tense verb (Led, Built, Shipped, Reduced, Designed, Drove, Launched, Cut, Scaled, Automated, Improved).
- Lead with impact. Keep any real metric from the note; NEVER invent numbers, tools, names, dates, or scope that aren't in the note.
- No buzzwords (results-driven, dynamic, passionate, team player, detail-oriented, hard-working).
- Plain text only — output only the bullet, nothing else.`;
  const out = await runAI(env, sys, `Rough note:\n${text}\n\nPolish it into one bullet.`, { model: SMART_MODEL, max_tokens: 90, temperature: 0.25 });
  const bullet = (_tightenBullets(out).split("\n")[0] || "").replace(/^•\s*/, "").trim();
  return { text: bullet || text.trim() };
}

// Backstop that guarantees concise bullets regardless of model output: strips list
// markers/markdown, keeps only the first sentence of each bullet (trailing sentences
// are almost always padding), hard-caps ~20 words, and limits to 6 bullets.
// Weak/filler openers to strip so a bullet always leads with a strong verb.
const _WEAK_OPENERS = /^(responsible for|worked on|tasked with|assisted with|assisted in|helped to|helped with|helped|duties included|in charge of|was |were |involved in|participated in|successfully )/i;
function _tightenBullets(out) {
  const lines = out.split("\n").map(l => l.trim()).filter(Boolean);
  const bullets = [];
  const usedVerbs = new Set();
  for (const line of lines) {
    let s = line.replace(/^\s*(?:[••*\-]+|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim();
    if (!s) continue;
    // Strip a weak/filler opener and re-capitalize what remains (leads with the real action).
    let prev;
    do { prev = s; s = s.replace(_WEAK_OPENERS, "").trim(); } while (s !== prev && _WEAK_OPENERS.test(s));
    if (!s) continue;
    const m = s.match(/^(.*?[.!?])(?:\s+\S[^]*)?$/);      // keep first sentence only
    if (m) s = m[1].trim();
    const words = s.split(/\s+/);
    if (words.length > 20) s = words.slice(0, 20).join(" ").replace(/[,;:]+$/, "") + ".";
    if (!/[.!?]$/.test(s)) s += ".";
    s = s.charAt(0).toUpperCase() + s.slice(1);
    // De-duplicate the leading verb so bullets don't all start with the same word.
    const verb = s.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
    if (verb && usedVerbs.has(verb) && bullets.length) continue;
    if (verb) usedVerbs.add(verb);
    bullets.push("• " + s);
    if (bullets.length >= 6) break;
  }
  return bullets.length ? bullets.join("\n") : out;
}

// ============ Suggest skills ============
async function aiSkills(env, { experience }) {
  const cacheKey = JSON.stringify(experience || {}).slice(0, 3000);
  const cached = await aiCacheGet(env, "skills", cacheKey);
  if (cached) return cached;
  const sys = GROUNDING + "\n\n" + `You extract resume-ready skills that are DEMONSTRATED in the candidate's work history.

Return a clean comma-separated list of 10-16 skills, each one directly evidenced by the described work — a tool they clearly used, a methodology they clearly applied, or a responsibility they clearly held.

Rules:
- Only include a skill if the experience gives real evidence for it. Do NOT list skills just because they are common for the job title. When in doubt, leave it out.
- Use the candidate's own tools/technologies verbatim; never swap in adjacent tools they didn't mention (e.g. don't add "Kubernetes" just because they mention Docker).
- Use industry-standard naming (e.g. "Project Management", not "managing projects").
- No duplicates. No generic filler like "Teamwork", "Hard worker", "Detail-oriented".
- No explanations, no numbering, no preamble.

OUTPUT: Just the comma-separated list. Nothing else.`;
  const raw = await runAI(env, sys,
    `Experience:\n${JSON.stringify(experience).slice(0, 3000)}`,
    { model: SMART_MODEL, max_tokens: 250, temperature: 0.15 });
  // Strip preambles and quotation marks
  const cleaned = raw
    .replace(/^[^a-z]*here[^:]*:\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .split("\n")[0]
    .trim();
  const out = { skills: cleaned };
  await aiCachePut(env, "skills", cacheKey, cleaned ? out : null, 86400);
  return out;
}

// ============ Skill-gap coach ============
// Compares a target role against the skills already on the resume and surfaces the
// highest-impact missing skills. Free (drives the career-copilot loop). Grounded:
// "relevant" must be verbatim from the user's own list; it never invents skills the
// candidate has, and frames gaps as "verify you have it / learn it", not "claim it".
async function aiSkillGap(env, { role, skills, context, jobDescription }) {
  const target = String(role || "").trim().slice(0, 120);
  const jd = String(jobDescription || "").trim().slice(0, 6000);
  if (!target && !jd) return { missing: [], relevant: [], note: "no-input" };
  const have = Array.isArray(skills) ? skills.map(s => String(s || "").slice(0, 60)).filter(Boolean).slice(0, 80) : [];
  const ctx = String(context || "").slice(0, 1800);
  const cacheKey = ((jd ? "jd" : "role") + "|" + target + "|" + have.join(",") + "|" + (jd ? jd.slice(0, 1600) : ctx)).slice(0, 2400);
  const cached = await aiCacheGet(env, "skillgap", cacheKey);
  if (cached) return cached;

  const shape = `Return STRICT JSON only, no markdown, in exactly this shape:
{
  "missing": [ { "skill": "<short skill or tool name>", "why": "<one concise sentence on why it matters>" } ],
  "relevant": [ "<the candidate's CURRENT skills that fit, verbatim from their list>" ]
}`;
  let sys, user;
  if (jd) {
    // Posting-specific: draw requirements ONLY from the pasted job description (real
    // text the user provided), so nothing is invented about what the job wants.
    sys = GROUNDING + "\n\n" + `You are an expert recruiter and ATS analyst. Compare a candidate's current resume skills against a SPECIFIC job posting, and surface the most important skills/tools/qualifications the POSTING requires that are MISSING from the candidate's skills.

${shape}

Rules:
- Draw "missing" ONLY from skills/requirements that actually appear in the job posting text below AND are not already in the candidate's current skills. NEVER invent a requirement the posting doesn't state.
- Order by how central each is to the posting. 6-10 items.
- Each "skill" is a concrete tool, technology, methodology, or credential the posting names — never a vague trait.
- "why" is one short sentence on how the posting uses or requires it.
- "relevant" contains ONLY the candidate's CURRENT skills (verbatim) that the posting also asks for.`;
    user = `JOB POSTING:
${jd}

CANDIDATE'S CURRENT RESUME SKILLS: ${have.length ? have.join(", ") : "(none listed)"}

Return the JSON.`;
  } else {
    sys = GROUNDING + "\n\n" + `You are an expert technical recruiter and career coach. Compare a candidate's TARGET ROLE against the skills currently listed on their resume, and surface the highest-impact skills/tools that strong candidates for that role usually have but that are MISSING from their list.

${shape}

Rules:
- 6-10 "missing" items, most-important first. Each "skill" is a concrete tool, technology, methodology, or credential — never a vague trait like "communication".
- A skill is "missing" only if it's commonly expected for the role AND not already in the candidate's current skills. Never repeat something already listed.
- "relevant" contains ONLY skills the candidate actually listed (verbatim) — never invent skills they didn't provide.
- Match the seniority implied by the role. Be realistic and specific.
- "why" is one short plain sentence, no fluff.`;
    user = `TARGET ROLE: ${target}
CURRENT RESUME SKILLS: ${have.length ? have.join(", ") : "(none listed)"}
RESUME CONTEXT: ${ctx || "(none)"}

Return the JSON.`;
  }
  const raw = await runAI(env, sys, user, { model: SMART_MODEL, max_tokens: 750, temperature: 0.3 });
  let data = null;
  try { data = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); }
  catch { const m = raw.match(/\{[\s\S]*\}/); if (m) { try { data = JSON.parse(m[0]); } catch {} } }
  if (!data || !Array.isArray(data.missing)) return { missing: [], relevant: have.slice(0, 20) };
  const out = {
    missing: data.missing.filter(x => x && x.skill).slice(0, 10).map(x => ({ skill: String(x.skill).slice(0, 60), why: String(x.why || "").slice(0, 200) })),
    relevant: Array.isArray(data.relevant) ? data.relevant.map(s => String(s).slice(0, 60)).filter(Boolean).slice(0, 20) : [],
  };
  await aiCachePut(env, "skillgap", cacheKey, out.missing.length ? out : null, 86400);
  return out;
}

// ============ Tailor to job ============
async function aiTailor(env, { jobDescription, resume }) {
  const sys = GROUNDING + "\n\n" + `You are a resume strategist. The candidate wants to tailor their resume to a specific job posting.

Analyze the job description and the candidate's resume, then output STRICT JSON in exactly this shape:

{
  "summary": "<2-3 sentence professional summary, rewritten to mirror the language of the JD while staying truthful to the candidate's actual experience. ~40-60 words. No 'I'. No buzzwords.>",
  "matchedKeywords": ["<keyword 1>", "<keyword 2>", "..."],
  "missingKeywords": ["<important JD keyword the resume doesn't mention>", "..."],
  "emphasize": [
    "<short, actionable note: 'Lead with your AWS migration work — JD heavily emphasizes cloud infra'>",
    "<another note>",
    "<another note>"
  ],
  "bulletSuggestions": [
    {"before": "<the candidate's original bullet, close to as written>", "after": "<the rewritten, JD-aligned version at the Strong bar>"},
    {"before": "...", "after": "..."},
    {"before": "...", "after": "..."}
  ]
}

Calibrate bulletSuggestions to THIS quality bar (rewrite the candidate's own bullets this way):
  Weak:   "Responsible for managing the deployment process and helping the team."
  Strong: "Owned CI/CD for 12 services, cutting deploy time 45% and incidents 30%."
Every strong bullet: past-tense action verb + specific scope + a quantified result, mirroring the JD's language, using ONLY facts the candidate actually stated.

Rules:
- matchedKeywords: 6-10 entries the JD asks for that the resume already shows
- missingKeywords: 3-6 important JD keywords the resume is missing (exact JD terminology)
- emphasize: 3 short coaching notes, each one sentence
- bulletSuggestions: 3 specific bullet rewrites grounded in the candidate's actual experience, at the "Strong" bar above
- Never invent experience, employers, tools, or metrics they don't have. If a bullet has no number, keep it qualitative rather than fabricating one.
- OUTPUT ONLY THE JSON OBJECT. No markdown fences, no preamble.`;

  const { obj: j, raw } = await runAIJSON(env, sys,
    `Job Description:\n${(jobDescription || '').slice(0, 4000)}\n\nCandidate Resume:\n${JSON.stringify(resume).slice(0, 7000)}`,
    { model: SMART_MODEL, max_tokens: 1400, temperature: 0.2 });
  if (!j) return { text: raw, summary: null };

  const matchedKeywords = Array.isArray(j.matchedKeywords) ? j.matchedKeywords : [];
  const missingKeywords = Array.isArray(j.missingKeywords) ? j.missingKeywords : [];
  const emphasize = Array.isArray(j.emphasize) ? j.emphasize : [];
  // Normalize bullets to {before, after}; tolerate the model returning plain strings.
  const bulletSuggestions = (Array.isArray(j.bulletSuggestions) ? j.bulletSuggestions : [])
    .map(b => typeof b === "string" ? { before: "", after: b } : { before: b.before || "", after: b.after || "" })
    .filter(b => b.after);

  // Legacy text blob so an older frontend still renders something sensible.
  const lines = [];
  if (matchedKeywords.length) lines.push(`Matched keywords:\n${matchedKeywords.map(k => `  ✓ ${k}`).join("\n")}`);
  if (missingKeywords.length) lines.push(`\nMissing keywords (add these if true):\n${missingKeywords.map(k => `  ✗ ${k}`).join("\n")}`);
  if (emphasize.length) lines.push(`\nWhat to emphasize:\n${emphasize.map(e => `  • ${e}`).join("\n")}`);
  if (bulletSuggestions.length) lines.push(`\nSuggested bullet rewrites:\n${bulletSuggestions.map(b => `  → ${b.after}`).join("\n")}`);

  return { text: lines.join("\n"), summary: j.summary || null, matchedKeywords, missingKeywords, emphasize, bulletSuggestions };
}

// ============ ATS check ============
async function aiATS(env, { jobDescription, resume }) {
  const cacheKey = (jobDescription || '').slice(0, 4000) + "\u0000" + JSON.stringify(resume || {}).slice(0, 7000);
  const cached = await aiCacheGet(env, "ats", cacheKey);
  if (cached) return cached;
  const sys = GROUNDING + "\n\n" + `You are an ATS (Applicant Tracking System) and resume scoring expert.

Score the candidate's resume against the job description (or generic best practices if no JD). Be honest and specific. Output STRICT JSON:

{
  "score": <integer 0-100>,
  "breakdown": {
    "keywords": <0-100>,
    "experience": <0-100>,
    "formatting": <0-100>,
    "completeness": <0-100>
  },
  "feedback": "<concise summary of what's working and what's not, 2-3 sentences>",
  "wins": ["<specific thing the resume does well>", "<another>", "<another>"],
  "issues": ["<specific weakness — name the section and what to fix>", "<another>", "<another>", "<another>"],
  "missingKeywords": ["<keyword from JD missing from resume>", "<another>"]
}

Scoring rubric — compute each sub-score 0-100, then score = the WEIGHTED sum:
- keywords (30%): exact-match coverage of the JD's required skills/titles/tools. A missing must-have keyword is a hard penalty.
- experience (30%): does the described experience actually match the role's level and responsibilities?
- formatting (20%): ATS-safe structure (standard section headers, no tables/columns/images, real dates, parseable).
- completeness (20%): contact info, all core sections present, quantified bullets.
Band check: 90-100 ready to submit · 70-89 minor tweaks · 50-69 significant work · <50 major gaps.
Be strict and consistent: the SAME resume must always get the SAME score.

Rules:
- score is the weighted overall from the rubric above (not a plain average)
- wins/issues must reference specific resume content, not generic advice
- missingKeywords: list the exact JD terms absent from the resume, most important first
- If no JD provided, score against general resume best practices (action verbs, quantification, brevity, ATS-safe formatting, completeness)
- OUTPUT ONLY THE JSON OBJECT. No markdown fences.`;

  const { obj: j, raw } = await runAIJSON(env, sys,
    `Job Description:\n${(jobDescription || '(no JD provided, score against general best practices)').slice(0, 4000)}\n\nCandidate Resume:\n${JSON.stringify(resume).slice(0, 7000)}`,
    { model: SMART_MODEL, max_tokens: 1100, temperature: 0 });
  if (!j) return { score: 50, feedback: raw };

  // Return STRUCTURED output so the frontend can render bars, cards, and chips
  // instead of a flat text blob. `feedback` stays as the short prose summary only.
  const out = {
    score: j.score ?? 50,
    breakdown: (j.breakdown && typeof j.breakdown === "object") ? {
      keywords: j.breakdown.keywords,
      experience: j.breakdown.experience,
      formatting: j.breakdown.formatting,
      completeness: j.breakdown.completeness,
    } : null,
    feedback: typeof j.feedback === "string" ? j.feedback : "",
    wins: Array.isArray(j.wins) ? j.wins.slice(0, 6) : [],
    issues: Array.isArray(j.issues) ? j.issues.slice(0, 6) : [],
    missingKeywords: Array.isArray(j.missingKeywords) ? j.missingKeywords.slice(0, 12) : [],
  };
  await aiCachePut(env, "ats", cacheKey, out, 86400);
  return out;
}

// ============ Analyze ============
async function aiAnalyze(env, { resume }) {
  const cacheKey = JSON.stringify(resume || {}).slice(0, 9000);
  const cached = await aiCacheGet(env, "analyze", cacheKey);
  if (cached) return cached;
  const sys = GROUNDING + "\n\n" + `You are a senior career coach and resume reviewer. The candidate uploaded their resume and wants a full critique.

Output STRICT JSON:

{
  "overallScore": <0-100>,
  "summary": "<2-3 sentence overall impression>",
  "strengths": [
    "<specific strength, referencing a section or bullet from the resume>",
    "<another>",
    "<another>"
  ],
  "weaknesses": [
    "<specific weakness with a section name, e.g. 'Experience bullets at Acme lack metrics'>",
    "<another>",
    "<another>"
  ],
  "topFixes": [
    {"action": "<one concrete change>", "where": "<which section>", "impact": "<why it matters>", "priority": "high|medium|low", "example": "<a concrete rewritten line the candidate can paste in>"},
    {"action": "...", "where": "...", "impact": "...", "priority": "...", "example": "..."},
    {"action": "...", "where": "...", "impact": "...", "priority": "...", "example": "..."}
  ],
  "missingSections": ["<section the resume is missing that would help, e.g. 'Skills', 'Projects'>"]
}

Score with this rubric (compute each 0-100, then overallScore = the weighted sum):
- Impact & metrics (35%): do bullets quantify results (%, $, scale, time), or are they duty lists?
- Relevance & keywords (25%): does it target real roles with the right terminology?
- Clarity & writing (20%): strong action verbs, concise, no filler ("responsible for", "worked on").
- Completeness & structure (20%): all key sections present, logical order, no gaps.
Be a tough but fair reviewer: a generic duties-based resume scores 40-60, not 80.

Rules:
- Be specific, not generic. Always cite the actual section/role you're critiquing (name the company/bullet).
- topFixes should be the 3 highest-leverage changes, ordered by impact. Set "priority" and give an "example" rewrite for each.
- Example rewrites must be paste-ready and grounded in the candidate's real content, never invented facts/metrics.
- OUTPUT ONLY THE JSON OBJECT. No markdown fences.`;

  const { obj: j, raw } = await runAIJSON(env, sys,
    `Candidate Resume:\n${JSON.stringify(resume).slice(0, 9000)}`,
    { model: SMART_MODEL, max_tokens: 2000, temperature: 0.1 });
  // Return the STRUCTURED object so the frontend renders the polished score ring +
  // Strengths / Weaknesses / Top Fixes cards. If the model didn't return valid JSON,
  // hand back the raw text and let the frontend's tolerant parser recover it.
  if (!j) return { text: raw };
  const out = {
    overallScore: j.overallScore,
    summary: j.summary,
    strengths: Array.isArray(j.strengths) ? j.strengths : [],
    weaknesses: Array.isArray(j.weaknesses) ? j.weaknesses : [],
    topFixes: Array.isArray(j.topFixes) ? j.topFixes : [],
    missingSections: Array.isArray(j.missingSections) ? j.missingSections : [],
  };
  await aiCachePut(env, "analyze", cacheKey, out, 86400);
  return out;
}

// ============ Parse (resume import — most important!) ============
async function aiParse(env, { text }) {
  if (!text || text.trim().length < 30) {
    throw err(400, "Paste at least a few lines from your resume — 'test' isn't enough text to parse.");
  }
  const cached = await aiCacheGet(env, "parse", text.slice(0, 8000));
  if (cached) return cached;
  const sys = `You are an expert resume parser. The user pasted plain text from a resume (could be from a PDF copy-paste, so formatting may be messy — line breaks in odd places, bullet markers like •, *, -, ▪, →, or no markers, dates in any format).

Extract everything into this EXACT JSON schema. Fill every field you can confidently extract. Use "" for unknown strings and [] for empty arrays.

SCHEMA:
{
  "personal": {
    "fullName": "<full name from top of resume>",
    "email": "<email address>",
    "phone": "<phone number — keep original format>",
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
      "start": "<start date — e.g. 'Jan 2022' or '2022'>",
      "end": "<end date or 'Present'>",
      "location": "<city, state or 'Remote'>",
      "description": "<all bullets joined with newlines, each starting with '• '>"
    }
  ],
  "education": [
    {
      "school": "<school name>",
      "degree": "<degree type — B.S., M.S., Ph.D., B.A., etc.>",
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
6. NEVER hallucinate or embellish. Copy the candidate's wording; do not rewrite, improve, or invent. If a field is not clearly in the text, leave it empty ("") — never guess a value, date, title, company, or metric.
7. Don't truncate descriptions — keep all bullet content.

OUTPUT FORMAT:
- ONLY the JSON object.
- NO markdown code fences (no \`\`\`).
- NO preamble like "Here's the parsed JSON".
- Start directly with {.`;

  const { obj: j } = await runAIJSON(env, sys,
    `Resume text:\n${text.slice(0, 8000)}`,
    { model: SMART_MODEL, max_tokens: 3500, temperature: 0.1 });
  const out = { resume: j };
  // Parsing is deterministic (temp 0.1): the same pasted text always yields the same
  // structure, so cache for a week to eliminate repeat imports of the same resume.
  await aiCachePut(env, "parse", text.slice(0, 8000), j ? out : null, 604800);
  return out;
}

// ============ Interview prep ============
async function aiInterview(env, { role, jobDescription, resume }) {
  const cacheKey = String(role || '').slice(0, 200) + "\u0000" +
    (jobDescription || '').slice(0, 2000) + "\u0000" + JSON.stringify(resume || {}).slice(0, 3500);
  const cached = await aiCacheGet(env, "interview", cacheKey);
  if (cached) return cached;
  const sys = GROUNDING + "\n\n" + `You are a senior interview coach. The candidate is preparing for an interview for a specific role.

Generate 10 high-quality practice interview questions, mixing:
- 3 behavioral (STAR-friendly: "Tell me about a time you…")
- 4 role-specific / technical
- 2 situational / hypothetical
- 1 closing / motivational

Format EXACTLY like this (no markdown, no JSON, plain text):

[Behavioral]
1. <Question>
   Tip: <One-line strategic tip — what they're really testing, what to emphasize from the candidate's resume>

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
- Avoid generic questions like "What's your greatest weakness?" — interviewers ask sharper questions today
- No preamble. Start directly with "[Behavioral]".`;

  const out = { text: await runAI(env, sys,
    `Role: ${role}\n\nJob Description:\n${(jobDescription || '(none provided)').slice(0, 2000)}\n\nCandidate Resume:\n${JSON.stringify(resume).slice(0, 3500)}`,
    { model: SMART_MODEL, max_tokens: 1400, temperature: 0.35 }) };
  // Short TTL: dedupes accidental double-submits / refreshes / back-navigation (the
  // real waste) without locking the user into one question set for long.
  await aiCachePut(env, "interview", cacheKey, out.text ? out : null, 3600);
  return out;
}

// ============ Interview answer feedback (scored) ============
async function aiInterviewFeedback(env, { question, answer, role }) {
  const sys = `You are a senior interview coach scoring a candidate's practice answer. Be honest, specific, and encouraging. Output STRICT JSON:

{
  "score": <integer 0-100>,
  "breakdown": {
    "structure": <0-100>,
    "impact": <0-100>,
    "clarity": <0-100>
  },
  "strengths": ["<specific thing the answer did well>", "<another>"],
  "improvements": ["<specific, actionable fix>", "<another>"],
  "feedback": "<2-3 sentence overall summary>"
}

Scoring rubric — compute each sub-score 0-100, then score = the WEIGHTED sum:
- structure (35%): does it follow STAR (Situation, Task, Action, Result) or otherwise tell a clear, complete story?
- impact (35%): are there concrete, quantified results and evidence of ownership?
- clarity (30%): is it concise, specific, and easy to follow (not rambling or vague)?
Band check: 90-100 excellent · 70-89 strong with minor gaps · 50-69 needs work · <50 major gaps.
Be strict and consistent: the SAME answer must always get the SAME score.

Rules:
- strengths/improvements must reference the candidate's ACTUAL words, not generic advice
- if the answer is empty or off-topic, score low and say why
- OUTPUT ONLY THE JSON OBJECT. No markdown fences.`;

  const { obj: j, raw } = await runAIJSON(env, sys,
    `Interview question:\n${String(question || '').slice(0, 800)}\n\nRole: ${String(role || 'the target role').slice(0, 120)}\n\nCandidate's answer:\n${String(answer || '').slice(0, 3000)}`,
    { model: SMART_MODEL, max_tokens: 700, temperature: 0.1 });
  if (!j) return { score: 50, feedback: raw };

  const parts = [];
  if (j.feedback) parts.push(j.feedback);
  if (j.breakdown) {
    parts.push(`\nBreakdown:`);
    parts.push(`  Structure (STAR): ${j.breakdown.structure}/100`);
    parts.push(`  Impact & results: ${j.breakdown.impact}/100`);
    parts.push(`  Clarity: ${j.breakdown.clarity}/100`);
  }
  if (j.strengths?.length) parts.push(`\nWhat's working:\n${j.strengths.map(s => `  ✓ ${s}`).join("\n")}`);
  if (j.improvements?.length) parts.push(`\nHow to improve:\n${j.improvements.map(i => `  → ${i}`).join("\n")}`);
  return { score: j.score ?? 50, feedback: parts.join("\n"), breakdown: j.breakdown || null };
}

// ============ Cover letter generator ============
async function aiCoverLetter(env, { role, company, jobDescription, tone, highlights, resume }) {
  const toneMap = {
    professional: "polished and professional",
    enthusiastic: "warm and enthusiastic, while staying professional",
    confident:    "confident and direct, leading with impact",
    warm:         "warm, personable, and genuine",
  };
  const toneDesc = toneMap[tone] || toneMap.professional;
  const name = (resume && (resume.name || (resume.personal && resume.personal.name))) || "";

  const sys = GROUNDING + "\n\n" + `You are an expert cover-letter writer. Write a complete, ready-to-send cover letter for the candidate, grounded ONLY in their real resume — never invent employers, titles, degrees, or metrics that aren't supported by the resume.

Requirements:
- Tone: ${toneDesc}.
- Length: 250-350 words, 3-4 short paragraphs.
- Structure: (1) a specific hook that connects the candidate to THIS role/company, (2) 1-2 paragraphs of evidence — concrete achievements and skills from the resume that map to the job's needs, with real numbers where the resume has them, (3) a confident closing with a call to action.
- Address it to "Dear Hiring Manager," unless a name is clearly provided.
- Sign off with "Sincerely," followed by the candidate's name${name ? ` (${name})` : ""}.
- Mirror the most important keywords and priorities from the job description naturally.
- NO placeholders or brackets like [Company] or [Your achievement] — use the real details provided; if a detail is unknown, write around it gracefully.
- Plain text only. No markdown, no headings, no preamble like "Here's your cover letter". Output ONLY the letter.`;

  const userMsg = [
    `Target role: ${role || "(not specified)"}`,
    `Company: ${company || "(not specified)"}`,
    highlights ? `Candidate wants to emphasize: ${String(highlights).slice(0, 600)}` : "",
    `\nJob description:\n${(jobDescription || "(none provided — infer needs from the role title and resume)").slice(0, 3500)}`,
    `\nCandidate resume (ground everything in this):\n${JSON.stringify(resume || {}).slice(0, 6000)}`,
  ].filter(Boolean).join("\n");

  const out = await runAI(env, sys, userMsg, { model: SMART_MODEL, max_tokens: 900, temperature: 0.3 });
  const cleaned = out
    .replace(/^(here'?s?( is)?|sure[,!]?|certainly[,!]?|of course[,!]?)[^]*?:\s*/i, "")
    .trim();
  return { text: cleaned };
}

// ============ Application Autopilot ============
// The flagship one-shot flow: given a job description + the user's resume, produce a
// complete application packet. Reuses the already-tuned ATS, Tailor, and Cover Letter
// analyses, run in PARALLEL, then derives an apply/stretch/skip verdict. Fail-soft:
// any sub-analysis that errors comes back null so the rest of the packet still lands.
// Cached as a unit so re-running the same job is free.
async function aiAutopilot(env, { jobDescription, resume, tone, role, company }) {
  if (!jobDescription || jobDescription.trim().length < 40) {
    throw err(400, "Paste the job description (at least a few lines) so Autopilot has something to work with.");
  }
  if (!resume || typeof resume !== "object" || !Object.keys(resume).length) {
    throw err(400, "Build or import your resume first — Autopilot tailors it to the job.");
  }
  const cacheKey = (jobDescription || "").slice(0, 4000) + "\u0000" +
    JSON.stringify(resume || {}).slice(0, 7000) + "\u0000" + (tone || "") + "\u0000" +
    (role || "") + "\u0000" + (company || "");
  const cached = await aiCacheGet(env, "autopilot", cacheKey);
  if (cached) return cached;

  const [atsR, tailorR, coverR] = await Promise.allSettled([
    aiATS(env, { jobDescription, resume }),
    aiTailor(env, { jobDescription, resume }),
    aiCoverLetter(env, { role: role || "", company: company || "", jobDescription, tone, resume }),
  ]);
  const ats    = atsR.status === "fulfilled" ? atsR.value : null;
  const tailor = tailorR.status === "fulfilled" ? tailorR.value : null;
  const cover  = coverR.status === "fulfilled" ? coverR.value : null;

  // Verdict from the ATS score: strong fit / worth a shot / long shot.
  const score = ats && typeof ats.score === "number" ? ats.score : null;
  let verdict = "stretch", label = "Worth a shot";
  if (score != null) {
    if (score >= 75)      { verdict = "apply";   label = "Strong fit — apply"; }
    else if (score >= 55) { verdict = "stretch"; label = "Worth a shot — a few gaps to close"; }
    else                  { verdict = "skip";    label = "Long shot — only if you can close the gaps"; }
  }

  const dedupe = (arr) => [...new Set((arr || []).filter(k => typeof k === "string" && k.trim()))];
  const missingKeywords = dedupe([...(ats && ats.missingKeywords || []), ...(tailor && tailor.missingKeywords || [])]).slice(0, 12);

  const out = {
    fit: { score, verdict, label },
    ats: ats ? { score: ats.score, breakdown: ats.breakdown, feedback: ats.feedback, wins: ats.wins || [], issues: ats.issues || [] } : null,
    tailor: tailor ? {
      summary: tailor.summary || null,
      matchedKeywords: tailor.matchedKeywords || [],
      emphasize: tailor.emphasize || [],
      bulletSuggestions: tailor.bulletSuggestions || [],
    } : null,
    missingKeywords,
    coverLetter: cover ? cover.text : null,
    failed: { ats: atsR.status === "rejected", tailor: tailorR.status === "rejected", cover: coverR.status === "rejected" },
  };
  // Only cache when at least one analysis succeeded (don't lock in a total failure).
  if (ats || tailor || cover) await aiCachePut(env, "autopilot", cacheKey, out, 86400);
  return out;
}

// Robustly pull a JSON value out of a model reply. Handles: clean JSON, ```json
// fences, prose wrappers, arrays as well as objects, and trailing-comma / truncation
// damage. Returns null only if nothing salvageable parses.
function safeJSON(s) {
  if (typeof s !== "string" || !s.trim()) return null;
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);   // strip a code fence if present
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch {}
  // Locate the first JSON value (object or array) and depth-scan to its match.
  const oi = t.indexOf("{"), ai = t.indexOf("[");
  const start = oi < 0 ? ai : (ai < 0 ? oi : Math.min(oi, ai));
  if (start < 0) return null;
  const open = t[start], close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { end = i; break; } }
  }
  const cand = end > start ? t.slice(start, end + 1) : t.slice(start);   // truncated → keep the rest
  const tryParse = (x) => { try { return JSON.parse(x); } catch { return undefined; } };
  let v = tryParse(cand);
  if (v !== undefined) return v;
  v = tryParse(cand.replace(/,\s*([}\]])/g, "$1"));                       // repair trailing commas
  if (v !== undefined) return v;
  return null;
}