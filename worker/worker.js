// ===== HireFlow Cloudflare Worker =====
// Endpoints:
//   POST /auth/signup   { email, password }   -> { token, email }
//   POST /auth/login    { email, password }   -> { token, email }
//   GET  /resume                              -> { resume }
//   POST /resume        { resume }            -> { ok }
//   POST /ai/improve    { target, text }      -> { text }
//   POST /ai/skills     { experience }        -> { skills }
//   POST /ai/tailor     { jobDescription, resume } -> { text, summary }
//   POST /ai/ats        { jobDescription, resume } -> { score, feedback }
//   POST /ai/analyze    { resume }            -> { text }
//   POST /ai/parse      { text }              -> { resume }
//   POST /ai/interview  { role, jobDescription, resume } -> { text }

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = corsHeaders(env);

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      const path = url.pathname;
      if (path === "/auth/signup") return json(await signup(req, env), 200, cors);
      if (path === "/auth/login")  return json(await login(req, env), 200, cors);
      if (path === "/resume" && req.method === "GET")  return json(await getResume(req, env), 200, cors);
      if (path === "/resume" && req.method === "POST") return json(await saveResume(req, env), 200, cors);
      if (path.startsWith("/ai/")) return json(await ai(req, env, path.slice(4)), 200, cors);
      return json({ error: "Not found" }, 404, cors);
    } catch (e) {
      return json({ error: e.message || "Error" }, e.status || 500, cors);
    }
  },
};

// ============ CORS ============
function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
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
function err(status, message) { const e = new Error(message); e.status = status; return e; }

// ============ Crypto helpers (PBKDF2 + HMAC JWT-ish token) ============
async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBuf(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password),
    { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return {
    salt: bufToHex(saltHex ? hexToBuf(saltHex) : salt),
    hash: bufToHex(new Uint8Array(bits)),
  };
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
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}
async function signToken(payload, secret) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}
async function verifyToken(token, secret) {
  if (!token || !token.includes(".")) throw err(401, "Invalid token");
  const [body, sig] = token.split(".");
  const expected = await hmac(secret, body);
  if (sig !== expected) throw err(401, "Invalid token");
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  if (payload.exp && payload.exp < Date.now()/1000) throw err(401, "Token expired");
  return payload;
}

async function authenticate(req, env) {
  const h = req.headers.get("Authorization") || "";
  const token = h.replace(/^Bearer\s+/i, "");
  return verifyToken(token, env.JWT_SECRET);
}

// ============ Auth ============
async function signup(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) throw err(400, "Email and password required");
  if (password.length < 8) throw err(400, "Password must be at least 8 characters");
  const key = `user:${email.toLowerCase()}`;
  const existing = await env.HIREFLOW_KV.get(key);
  if (existing) throw err(409, "Account already exists");
  const { salt, hash } = await hashPassword(password);
  await env.HIREFLOW_KV.put(key, JSON.stringify({ email, salt, hash, createdAt: Date.now() }));
  const token = await signToken({ email, exp: Math.floor(Date.now()/1000)+86400*30 }, env.JWT_SECRET);
  return { token, email };
}
async function login(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) throw err(400, "Email and password required");
  const raw = await env.HIREFLOW_KV.get(`user:${email.toLowerCase()}`);
  if (!raw) throw err(401, "Invalid email or password");
  const user = JSON.parse(raw);
  const ok = await verifyPassword(password, user.salt, user.hash);
  if (!ok) throw err(401, "Invalid email or password");
  const token = await signToken({ email, exp: Math.floor(Date.now()/1000)+86400*30 }, env.JWT_SECRET);
  return { token, email };
}

// ============ Resume storage ============
async function saveResume(req, env) {
  const user = await authenticate(req, env);
  const { resume } = await req.json();
  await env.HIREFLOW_KV.put(`resume:${user.email.toLowerCase()}`, JSON.stringify(resume));
  return { ok: true };
}
async function getResume(req, env) {
  const user = await authenticate(req, env);
  const raw = await env.HIREFLOW_KV.get(`resume:${user.email.toLowerCase()}`);
  return { resume: raw ? JSON.parse(raw) : null };
}

// ============ AI ============
async function ai(req, env, action) {
  await authenticate(req, env);
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
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: opts.max_tokens || 600,
    temperature: opts.temperature ?? 0.4,
  });
  return (res.response || "").trim();
}

async function aiImprove(env, { target, text }) {
  const sys = `You are an expert resume writer. Improve the user's content to be concise, achievement-focused, and ATS-friendly. Use strong action verbs and quantify impact when possible. Respond ONLY with the improved text — no preamble.`;
  const out = await runAI(env, sys, `Section: ${target}\n\nContent:\n${text || "(empty)"}\n\nImprove it.`);
  return { text: out };
}

async function aiSkills(env, { experience }) {
  const sys = `You extract resume-ready skills. Given work experience, return a comma-separated list of 10-20 relevant hard and soft skills. No explanations, just the list.`;
  const out = await runAI(env, sys, `Experience:\n${JSON.stringify(experience).slice(0,2000)}`);
  return { skills: out };
}

async function aiTailor(env, { jobDescription, resume }) {
  const sys = `You tailor resumes to job descriptions. Output a JSON object: { "summary": "<rewritten professional summary, 2-3 sentences>", "notes": "<bullet list of 3 things to emphasize>" }. Only output JSON.`;
  const user = `Job description:\n${(jobDescription||'').slice(0,2000)}\n\nResume:\n${JSON.stringify(resume).slice(0,3000)}`;
  const raw = await runAI(env, sys, user, { max_tokens: 500 });
  const j = safeJSON(raw);
  return { text: j?.notes || raw, summary: j?.summary };
}

async function aiATS(env, { jobDescription, resume }) {
  const sys = `You are an ATS (Applicant Tracking System) scorer. Output JSON: { "score": <0-100>, "feedback": "<2-4 short bullet points on keyword coverage, formatting, and gaps>" }. Only JSON.`;
  const raw = await runAI(env, sys,
    `Job description:\n${(jobDescription||'').slice(0,1500)}\n\nResume:\n${JSON.stringify(resume).slice(0,3000)}`,
    { max_tokens: 400 });
  const j = safeJSON(raw) || { score: 50, feedback: raw };
  return j;
}

async function aiAnalyze(env, { resume }) {
  const sys = `You are a career coach. Analyze the resume and give a concise critique covering: strengths, weaknesses, top 3 improvements. Use short bullet points.`;
  const out = await runAI(env, sys, `Resume:\n${JSON.stringify(resume).slice(0,4000)}`, { max_tokens: 600 });
  return { text: out };
}

async function aiParse(env, { text }) {
  const sys = `You parse plain-text resumes into structured JSON with this shape:
{
  "personal": {"fullName":"","email":"","phone":"","location":"","linkedin":"","github":"","website":"","summary":""},
  "experience": [{"title":"","company":"","start":"","end":"","location":"","description":""}],
  "education": [{"school":"","degree":"","field":"","gpa":"","start":"","end":"","notes":""}],
  "skills": {"categories":[{"name":"All","items":[]}]},
  "projects": [{"name":"","role":"","tech":"","link":"","description":""}],
  "certifications": [{"name":"","issuer":"","date":"","url":""}],
  "awards": [{"name":"","issuer":"","date":"","description":""}]
}
Output ONLY the JSON. If a field is missing, leave it empty.`;
  const raw = await runAI(env, sys, text.slice(0, 4000), { max_tokens: 1500 });
  const j = safeJSON(raw);
  return { resume: j };
}

async function aiInterview(env, { role, jobDescription, resume }) {
  const sys = `You are an interview coach. Generate 8 practice interview questions tailored to the role and the candidate's resume. Mix behavioral and role-specific. Number each. Add a one-line tip under each.`;
  const out = await runAI(env, sys,
    `Role: ${role}\nJD: ${(jobDescription||'').slice(0,1500)}\nResume: ${JSON.stringify(resume).slice(0,2500)}`,
    { max_tokens: 800 });
  return { text: out };
}

function safeJSON(s) {
  try { return JSON.parse(s); } catch {}
  // try to pull a JSON object out of the string
  const m = s.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}
