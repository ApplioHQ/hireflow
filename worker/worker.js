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

// Smaller, faster: free-form writing tasks
const FAST_MODEL = "@cf/meta/llama-3.1-8b-instruct";
// Larger, better at structured output + reasoning: parse, analyze, tailor, ats
const SMART_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

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
      if (path === "/me/sync")                 return json(await syncWithStripe(req, env), 200, cors);
      if (path === "/status")                  return json(await getStatus(req, env), 200, cors);
      if (path === "/resume" && req.method === "GET")  return json(await getResume(req, env), 200, cors);
      if (path === "/resume" && req.method === "POST") return json(await saveResume(req, env), 200, cors);
      if (path === "/downloads/increment")     return json(await incrementDownload(req, env), 200, cors);
      if (path === "/stripe/checkout")         return json(await createCheckout(req, env), 200, cors);
      if (path === "/stripe/portal")           return json(await createPortal(req, env), 200, cors);
      if (path === "/admin/users")             return json(await adminListUsers(req, env), 200, cors);
      if (path === "/admin/users/delete")      return json(await adminDeleteUser(req, env), 200, cors);
      if (path === "/admin/ai-disable")        return json(await adminSetAIDisabled(req, env), 200, cors);
      if (path === "/admin/maintenance")       return json(await adminSetMaintenance(req, env), 200, cors);
      if (path === "/admin/admin-access")      return json(await adminSetAdminAccess(req, env), 200, cors);
      if (path === "/admin/analytics")         return json(await adminAnalytics(req, env), 200, cors);
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
      exp: Math.floor(Date.now()/1000) + 3600 * 8
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
      exp: Math.floor(Date.now()/1000) + 3600 * 8
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

// ============ Admin Analytics ============
async function adminAnalytics(req, env) {
  await requireAdmin(req, env);
  // Paginate through all users and compute stats
  const users = [];
  let cursor = undefined;
  while (true) {
    const page = await env.HIREFLOW_KV.list({ prefix: "user:", cursor, limit: 1000 });
    for (const key of page.keys) {
      const raw = await env.HIREFLOW_KV.get(key.name);
      if (!raw) continue;
      users.push(JSON.parse(raw));
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }

  const now = Date.now();
  const DAY = 86400000;
  const signupsByDay = {};
  let free = 0, premium = 0, lifetime = 0, totalDownloads = 0;

  users.forEach(u => {
    const plan = u.plan || 'free';
    if (plan === 'premium') premium++;
    else if (plan === 'lifetime') lifetime++;
    else free++;
    totalDownloads += u.downloadsUsed || 0;
    if (u.createdAt) {
      const d = new Date(u.createdAt).toISOString().slice(0, 10);
      signupsByDay[d] = (signupsByDay[d] || 0) + 1;
    }
  });

  // Last 30 days signups
  const last30 = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * DAY).toISOString().slice(0, 10);
    last30[d] = signupsByDay[d] || 0;
  }

  // Last 7 days
  const last7Signups = Object.entries(last30).slice(-7).reduce((a, [,v]) => a + v, 0);
  const last30Signups = Object.values(last30).reduce((a, v) => a + v, 0);

  return {
    total: users.length,
    plans: { free, premium, lifetime },
    conversionRate: users.length ? ((premium + lifetime) / users.length * 100).toFixed(1) : '0.0',
    totalDownloads,
    last7Signups,
    last30Signups,
    signupsByDay: last30,
  };
}


async function requireAdmin(req, env, requireSuper = false) {
  const payload = await authenticate(req, env);
  if (requireSuper && payload.role !== "super") throw err(403, "Super admin only");
  if (payload.role !== "admin" && payload.role !== "super") throw err(403, "Admin only");
  return payload;
}

async function adminListUsers(req, env) {
  await requireAdmin(req, env);
  const users = [];
  let _cursor = undefined;
  while (true) {
    const _page = await env.HIREFLOW_KV.list({ prefix: "user:", cursor: _cursor, limit: 1000 });
    for (const key of _page.keys) {
    const raw = await env.HIREFLOW_KV.get(key.name);
    if (!raw) continue;
    const u = JSON.parse(raw);
    users.push({
      email: u.email,
      plan: u.plan || "free",
      createdAt: u.createdAt || null,
      currentPeriodEnd: u.currentPeriodEnd || null,
      downloadsUsed: u.downloadsUsed || 0,
      hasStripeCustomer: !!u.stripeCustomerId,
      updatedAt: u.updatedAt || u.createdAt || null,
    });
  }
    if (_page.list_complete) break;
    _cursor = _page.cursor;
  }
  // Newest first
  users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { users, total: users.length };
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

  // Admin tokens have no user record — let them through
  if (isAdmin) {
    const body = await req.json();
    return await aiDispatch(env, action, body);
  }

  const user = await getUser(env, payload.email);
  if (!user) throw err(404, "User not found");

  // Free users get NO AI features
  if (PRO_AI.has(action) && !isPaidPlan(user)) {
    throw err(402, "Upgrade to Premium to use AI features");
  }

  const body = await req.json();
  return await aiDispatch(env, action, body);
}

async function aiDispatch(env, action, body) {
  switch (action) {
    case "improve":   return aiImprove(env, body);
    case "skills":    return aiSkills(env, body);
    case "tailor":    return aiTailor(env, body);
    case "ats":       return aiATS(env, body);
    case "analyze":   return aiAnalyze(env, body);
    case "parse":     return aiParse(env, body);
    case "interview":    return aiInterview(env, body);
    case "coverletter":         return aiCoverLetter(env, body);
    case "interview-feedback":  return aiInterviewFeedback(env, body);
    default: throw err(404, "Unknown AI action");
  }
}

async function runAI(env, system, user, opts = {}) {
  // Try the requested (or default) model; if it errors, fall back to the fast model.
  const wanted = opts.model || FAST_MODEL;
  const chain = wanted === FAST_MODEL ? [FAST_MODEL] : [wanted, FAST_MODEL];
  let lastErr;
  for (const model of chain) {
    try {
      const res = await env.AI.run(model, {
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        max_tokens: opts.max_tokens || 800,
        temperature: opts.temperature ?? 0.3,
      });
      const out = (res.response || "").trim();
      if (out) return out;
      lastErr = new Error(`${model} returned empty response`);
    } catch (e) {
      lastErr = e;
      console.error(`AI model ${model} failed:`, e.message || e);
    }
  }
  throw err(502, `AI model error: ${lastErr?.message || "unknown"}`);
}


function resumeToText(resume) {
  const r = resume || {};
  const p = r.personal || {};
  const lines = [];
  if (p.fullName)  lines.push(p.fullName);
  if (p.email || p.phone || p.location)
    lines.push([p.email, p.phone, p.location].filter(Boolean).join(' | '));
  if (p.summary)   lines.push('\nSUMMARY\n' + p.summary);
  if (r.experience?.length) {
    lines.push('\nEXPERIENCE');
    r.experience.forEach(e => {
      lines.push(`${e.title||''} at ${e.company||''} (${e.start||''} – ${e.end||''})`);
      if (e.description) lines.push(e.description);
    });
  }
  if (r.education?.length) {
    lines.push('\nEDUCATION');
    r.education.forEach(e => lines.push(`${e.degree||''} ${e.field||''} – ${e.school||''} (${e.end||''})`));
  }
  if (r.skills?.categories?.length) {
    lines.push('\nSKILLS');
    r.skills.categories.forEach(c => lines.push(c.items?.join(', ')||''));
  }
  if (r.certifications?.length) {
    lines.push('\nCERTIFICATIONS');
    r.certifications.forEach(c => lines.push(`${c.name||''} – ${c.issuer||''} (${c.date||c.year||''})`));
  }
  if (r.projects?.length) {
    lines.push('\nPROJECTS');
    r.projects.forEach(p => lines.push(`${p.name||''}: ${p.description||''} [${p.tech||''}]`));
  }
  return lines.join('\n').slice(0, 5000);
}

// ============ Improve writing ============
async function aiImprove(env, { target, text }) {
  if (!text || !text.trim()) {
    return { text: "Add some content first, then click AI Improve to refine it." };
  }
  const isSummary = target === "summary" || target === "personal";
  const sys = isSummary
    ? `You are an elite resume writer. Rewrite the candidate's professional summary so it:
- Is 2-3 sentences, ~40-60 words
- Opens with a strong identity statement (e.g. "Senior product designer with 7+ years…")
- Names 2-3 standout competencies with specifics
- Ends with a value statement aimed at hiring managers
- Uses active voice, no buzzwords ("synergy", "dynamic", "passionate")
- Is in third-person implied (no "I", no "you")
- Is plain text only — no markdown, no headers, no quotation marks

OUTPUT: Only the rewritten summary. Nothing else.`
    : `You are an elite resume writer. Rewrite the following ${target} content into achievement-focused bullets. Rules:
- Each bullet starts with a strong past-tense action verb (Led, Built, Shipped, Reduced, Architected, Drove, Designed, etc. — never repeat a verb)
- Each bullet shows measurable impact (%, $, time saved, scale, headcount, users)
- Keep each bullet under ~20 words
- 3-6 bullets total
- Use the • character to mark each bullet, one per line
- If the input lacks numbers, make conservative inferences from context (e.g. "led 5-person team" if they mention managing engineers); never invent specific company-private metrics
- Plain text only — no markdown bold, no headers

OUTPUT: Only the bullets, one per line, each starting with "• ". Nothing else.`;
  const out = await runAI(env, sys, `Candidate content:\n${text}\n\nRewrite it.`, { max_tokens: 500, temperature: 0.5 });
  // Strip common AI preambles
  const cleaned = out
    .replace(/^(here'?s?( is)?|sure[,!]?|certainly[,!]?|of course[,!]?)[^]*?:\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
  return { text: cleaned };
}

// ============ Suggest skills ============
async function aiSkills(env, { experience }) {
  const sys = `You extract resume-ready skills from work history.

Given the candidate's experience, return a clean comma-separated list of 12-18 skills they likely have, balanced across:
- Hard/technical skills (e.g. Python, SQL, AWS, Figma, Salesforce)
- Methodologies (e.g. Agile, A/B Testing, Customer Discovery)
- Soft skills (e.g. Cross-functional Collaboration, Stakeholder Management)

Rules:
- Infer skills from job titles AND from the described work
- Use industry-standard naming (e.g. "Project Management", not "managing projects")
- No duplicates, no generic words like "Teamwork", "Hard worker", "Detail-oriented"
- No explanations, no numbering, no preamble

OUTPUT: Just the comma-separated list. Nothing else.`;
  const raw = await runAI(env, sys,
    `Experience:\n${JSON.stringify(experience).slice(0, 3000)}`,
    { max_tokens: 250, temperature: 0.4 });
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
  const sys = `You are a resume strategist. The candidate wants to tailor their resume to a specific job posting.

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
    "<a rewritten bullet from their experience that better matches the JD>",
    "<another>",
    "<another>"
  ]
}

Rules:
- matchedKeywords: 6-10 entries the JD asks for that the resume already shows
- missingKeywords: 3-6 important JD keywords the resume is missing
- emphasize: 3 short coaching notes, each one sentence
- bulletSuggestions: 3 specific bullet rewrites grounded in the candidate's actual experience
- Never invent experience or credentials they don't have
- OUTPUT ONLY THE JSON OBJECT. No markdown fences, no preamble.`;

  const raw = await runAI(env, sys,
    `Job Description:\n${(jobDescription || '').slice(0, 3000)}\n\nCandidate Resume:\n${resumeToText(resume)}`,
    { model: SMART_MODEL, max_tokens: 900, temperature: 0.3 });
  const j = safeJSON(raw);
  if (!j) return { text: raw, summary: null };

  // Build human-readable notes blob
  const lines = [];
  if (j.matchedKeywords?.length) lines.push(`Matched keywords:\n${j.matchedKeywords.map(k => `  ✓ ${k}`).join("\n")}`);
  if (j.missingKeywords?.length) lines.push(`\nMissing keywords (add these if true):\n${j.missingKeywords.map(k => `  ✗ ${k}`).join("\n")}`);
  if (j.emphasize?.length) lines.push(`\nWhat to emphasize:\n${j.emphasize.map(e => `  • ${e}`).join("\n")}`);
  if (j.bulletSuggestions?.length) lines.push(`\nSuggested bullet rewrites:\n${j.bulletSuggestions.map(b => `  → ${b}`).join("\n")}`);
  return {
    text: lines.join("\n"),
    summary: j.summary || null,
    matchedKeywords: j.matchedKeywords || [],
    missingKeywords: j.missingKeywords || [],
    bulletSuggestions: j.bulletSuggestions || [],
    emphasize: j.emphasize || [],
  };
}

// ============ ATS check ============
async function aiATS(env, { jobDescription, resume }) {
  const resumeText = resumeToText(resume);
  const jdText     = (jobDescription || '').trim().slice(0, 3000);
  const hasJD      = jdText.length > 10;

  const sys = `You are a strict, calibrated ATS scoring engine. Use formula-driven accuracy.

${hasJD ? 'TASK: Score the resume against the provided job description.' : 'TASK: No JD provided — score against universal best-practice standards.'}

SCORING FORMULA (follow exactly):

STEP 1 — KEYWORD SCORE (weight 35%):
${hasJD
  ? `Extract every hard skill, tool, technology, certification, and role-specific term from the JD.
Count how many appear in the resume (exact or clear synonym).
keyword_score = round((matched / total_jd_keywords) * 100).`
  : `Score presence of action verbs, quantified results, and industry terminology. Penalise vague language.`}

STEP 2 — EXPERIENCE SCORE (weight 30%):
- Does seniority/years/domain match the role?
- Each bullet with a metric (%, $, number) earns full credit.
- Deduct 8 pts per vague bullet ("responsible for", "worked on"), max 40 pts.
- Deduct 5 pts per gap > 6 months.

STEP 3 — FORMAT SCORE (weight 20%):
+15 Summary exists | +15 All roles have dates | +15 Bullets used
+15 Contact info complete | +10 Consistent formatting | +10 Reasonable length.

STEP 4 — COMPLETENESS SCORE (weight 15%):
+25 each: Summary, Experience, Education, Skills. +5 each: Certifications, Projects (max +10).

FINAL SCORE = round(keywords*0.35 + experience*0.30 + formatting*0.20 + completeness*0.15)

CRITICAL: All values 0-100. No negatives. "score" MUST equal formula. wins/issues reference actual content.
OUTPUT ONLY JSON:
{
  "score": <integer 0-100>,
  "breakdown": { "keywords": <0-100>, "experience": <0-100>, "formatting": <0-100>, "completeness": <0-100> },
  "feedback": "<2-3 sentence summary of match quality and top fix>",
  "wins": ["<actual resume content strength>", "<another>", "<another>"],
  "issues": ["<specific fix with section name>", "<another>", "<another>", "<another>"],
  "missingKeywords": [${hasJD ? '"<exact JD keyword not in resume>", up to 10' : '"<keyword that would strengthen resume>", up to 6'}],
  "matchedKeywords": ["<keyword in both>", up to 10]
}`;

  const userMsg = hasJD
    ? `JOB DESCRIPTION:\n${jdText}\n\n${'─'.repeat(40)}\n\nCANDIDATE RESUME:\n${resumeText}`
    : `CANDIDATE RESUME:\n${resumeText}`;

  const raw = await runAI(env, sys, userMsg, { model: SMART_MODEL, max_tokens: 1000, temperature: 0.1 });
  const j = safeJSON(raw);
  if (!j) return { score: 50, feedback: raw, missingKeywords: [], matchedKeywords: [] };

  const clamp = v => Math.min(100, Math.max(0, Math.round(Number(v)||0)));
  const bd = j.breakdown || {};
  const keywords     = clamp(bd.keywords);
  const experience   = clamp(bd.experience);
  const formatting   = clamp(bd.formatting);
  const completeness = clamp(bd.completeness);
  const score        = clamp(keywords*0.35 + experience*0.30 + formatting*0.20 + completeness*0.15);

  const parts = [];
  if (j.feedback) parts.push(j.feedback);
  parts.push(`\nBreakdown:`);
  parts.push(`  Keywords           ${keywords}/100  (35% weight)`);
  parts.push(`  Experience         ${experience}/100  (30% weight)`);
  parts.push(`  Format & Structure ${formatting}/100  (20% weight)`);
  parts.push(`  Completeness       ${completeness}/100  (15% weight)`);
  if (j.wins?.length)            parts.push(`\nWhat's working:\n${j.wins.map(w=>`  \u2713 ${w}`).join('\n')}`);
  if (j.issues?.length)          parts.push(`\nWhat to fix:\n${j.issues.map(i=>`  \u2717 ${i}`).join('\n')}`);
  if (j.missingKeywords?.length) parts.push(`\nMissing keywords:\n${j.missingKeywords.map(k=>`  \u2192 ${k}`).join('\n')}`);
  if (j.matchedKeywords?.length) parts.push(`\nMatched keywords:\n${j.matchedKeywords.map(k=>`  \u2713 ${k}`).join('\n')}`);

  return { score, feedback: parts.join('\n'), missingKeywords: j.missingKeywords||[], matchedKeywords: j.matchedKeywords||[] };
}


// ============ Analyze ============
async function aiAnalyze(env, { resume }) {
  const sys = `You are a senior career coach and resume reviewer. The candidate uploaded their resume and wants a full critique.

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
    {"action": "<one concrete change>", "where": "<which section>", "impact": "<why it matters>"},
    {"action": "...", "where": "...", "impact": "..."},
    {"action": "...", "where": "...", "impact": "..."}
  ],
  "missingSections": ["<section the resume is missing that would help, e.g. 'Skills', 'Projects'>"]
}

Rules:
- Be specific, not generic. Always cite the actual section/role you're critiquing.
- topFixes should be the 3 highest-leverage changes, ordered by impact.
- OUTPUT ONLY THE JSON OBJECT. No markdown fences.`;

  const raw = await runAI(env, sys,
    `Candidate Resume:\n${resumeToText(resume)}`,
    { model: SMART_MODEL, max_tokens: 900, temperature: 0.3 });
  const j = safeJSON(raw);
  if (!j) return { text: raw };

  const parts = [];
  if (j.overallScore != null) parts.push(`Overall Resume Score: ${j.overallScore}/100\n`);
  if (j.summary) parts.push(j.summary);
  if (j.strengths?.length) parts.push(`\nStrengths:\n${j.strengths.map(s => `  ✓ ${s}`).join("\n")}`);
  if (j.weaknesses?.length) parts.push(`\nWeaknesses:\n${j.weaknesses.map(w => `  ✗ ${w}`).join("\n")}`);
  if (j.topFixes?.length) {
    parts.push(`\nTop 3 fixes:`);
    j.topFixes.forEach((f, i) => parts.push(`  ${i+1}. ${f.action}\n     Where: ${f.where}\n     Why: ${f.impact}`));
  }
  if (j.missingSections?.length) parts.push(`\nConsider adding:\n${j.missingSections.map(s => `  + ${s}`).join("\n")}`);
  return { text: parts.join("\n") };
}

// ============ Parse (resume import — most important!) ============
async function aiParse(env, { text }) {
  if (!text || text.trim().length < 30) {
    throw err(400, "Paste at least a few lines from your resume — 'test' isn't enough text to parse.");
  }
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
6. Don't hallucinate. If a field isn't in the text, leave it empty.
7. Don't truncate descriptions — keep all bullet content.

OUTPUT FORMAT:
- ONLY the JSON object.
- NO markdown code fences (no \`\`\`).
- NO preamble like "Here's the parsed JSON".
- Start directly with {.`;

  const raw = await runAI(env, sys,
    `Resume text:\n${text.slice(0, 8000)}`,
    { model: SMART_MODEL, max_tokens: 3500, temperature: 0.1 });
  const j = safeJSON(raw);
  return { resume: j };
}


// ============ Cover Letter ============
async function aiCoverLetter(env, { jobDescription, resume }) {
  const resumeText = resumeToText(resume);
  const jdText = (jobDescription || '').slice(0, 3000);
  const p = resume?.personal || {};

  const sys = `You are an expert career coach writing a personalized cover letter.
Write a professional, compelling cover letter for the candidate applying to this role.

RULES:
- 3-4 paragraphs, under 350 words total
- Opening: express genuine interest in the specific role/company
- Body: highlight 2-3 most relevant achievements from their resume that match the JD
- Closing: confident call to action
- Tone: professional but human — not robotic or generic
- Never start with "I am writing to apply for..."
- Use their actual name, actual job titles, and actual achievements — not placeholders
- OUTPUT ONLY THE COVER LETTER TEXT. No subject line, no address block, no explanation.`;

  const userMsg = `CANDIDATE NAME: ${p.fullName || 'The Candidate'}
CANDIDATE EMAIL: ${p.email || ''}

JOB DESCRIPTION:
${jdText}

CANDIDATE RESUME:
${resumeText}`;

  const text = await runAI(env, sys, userMsg, { model: SMART_MODEL, max_tokens: 600, temperature: 0.4 });
  return { text };
}


// ============ Interview Answer Feedback ============
async function aiInterviewFeedback(env, { question, answer }) {
  const sys = `You are a senior interview coach giving honest, specific feedback on a candidate's answer.

Score the answer 0-100 and provide actionable feedback.

Scoring:
- 85-100: Excellent — specific, structured (STAR), quantified results
- 65-84: Good — relevant but missing structure or specifics
- 45-64: Adequate — too vague, lacks examples, or off-topic
- below 45: Needs significant work

OUTPUT JSON:
{
  "score": <integer 0-100>,
  "feedback": "<3-4 sentences: what was strong, what was weak, one specific improvement with an example of how to reframe it>"
}
OUTPUT ONLY JSON.`;

  const raw = await runAI(env, sys,
    `INTERVIEW QUESTION: ${question}\n\nCANDIDATE ANSWER: ${answer}`,
    { max_tokens: 300, temperature: 0.3 });

  const j = safeJSON(raw);
  if (!j) return { score: 50, feedback: raw };
  return { score: Math.min(100, Math.max(0, Math.round(j.score||50))), feedback: j.feedback||'' };
}

// ============ Interview prep ============
async function aiInterview(env, { role, jobDescription, resume }) {
  const sys = `You are a senior interview coach. The candidate is preparing for an interview for a specific role.

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

  return { text: await runAI(env, sys,
    `Role: ${role}\n\nJob Description:\n${(jobDescription || '(none provided)').slice(0, 2000)}\n\nCandidate Resume:\n${resumeToText(resume)}`,
    { max_tokens: 1400, temperature: 0.55 }) };
}

function safeJSON(s) {
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/); if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}