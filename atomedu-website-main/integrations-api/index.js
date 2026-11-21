const BASE = '/api/integrations';
const PROVIDERS = ['drive', 'notion', 'github', 'dropbox', 'zapier'];
const MAX_BODY = 16 * 1024;
const MAX_DOWNLOAD_URL = 8192;
const MAX_DOWNLOAD_BYTES = 4096;
const MAX_ONE_SHOT_BYTES = 1800;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

class ApiError extends Error {
  constructor(status, code, reason) { super(reason); Object.assign(this, { status, code, reason }); }
}
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers },
});
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
const random = size => b64(crypto.getRandomValues(new Uint8Array(size)));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));

function originConfig(env) {
  try {
    const origin = new URL(env.ALLOWED_ORIGIN);
    if (origin.protocol !== 'https:' || origin.origin !== origin.href.replace(/\/$/, '')
      || origin.username || origin.password || origin.search || origin.hash) return null;
    return origin.origin;
  } catch { return null; }
}
function oauthConfig(env) {
  const origin = originConfig(env);
  if (!origin || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return null;
  try {
    const api = new URL(env.API_ORIGIN);
    if (api.protocol !== 'https:' || api.origin !== api.href.replace(/\/$/, '')
      || api.username || api.password || api.search || api.hash) return null;
    return { origin, api: api.origin };
  } catch { return null; }
}
function driveConfigured(env) { return Boolean(oauthConfig(env) && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET); }
function githubConfigured(env) {
  return Boolean(oauthConfig(env) && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    && typeof env.OAUTH_LIMITER?.limit === 'function');
}
function notionConfigured(env) {
  return Boolean(oauthConfig(env) && env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET
    && typeof env.OAUTH_LIMITER?.limit === 'function');
}
function notionPubliclyAvailable(env) { return notionConfigured(env) && env.NOTION_PUBLIC === 'true'; }
function downloadConfigured(env) {
  return Boolean(originConfig(env) && typeof env.DOWNLOAD_LIMITER?.limit === 'function'
    && typeof env.DOWNLOAD_BUDGET?.limit === 'function');
}
function cors(request, env) {
  const origin = originConfig(env);
  return request.headers.get('Origin') === origin && origin
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' }
    : { Vary: 'Origin' };
}
// The download URL contains its complete, intentionally public graph payload.
// Provider widgets may fetch it from a different browser origin; no credentials are sent.
const publicDownloadCors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Cache-Control, Content-Encoding, Content-Range' };
function requireOrigin(request, env) {
  const origin = originConfig(env);
  if (!origin) throw new ApiError(503, 'service_unavailable', 'missing_config');
  if (request.headers.get('Origin') !== origin) throw new ApiError(403, 'origin_forbidden', 'origin_forbidden');
  return origin;
}
function cookie(request, name) {
  const match = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] || null;
}
function cookieHeader(name, value, age) {
  return `${name}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;
}
async function key(secret) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), encoder.encode(JSON.stringify(value))));
  return `${b64(iv)}.${b64(ciphertext)}`;
}
async function open(value, secret) {
  try {
    if (!value || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
    const [nonce, data] = value.split('.');
    return JSON.parse(decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(nonce) }, await key(secret), unb64(data))));
  } catch { return null; }
}
async function session(request, env) {
  if (!oauthConfig(env)) return null;
  const data = await open(cookie(request, '__Host-atom_drive'), env.SESSION_SECRET);
  return data?.v === 1 && data.exp > Date.now() && typeof data.token === 'string' && typeof data.csrf === 'string' ? data : null;
}
function validateGraph(graph) {
  if (!record(graph) || !exactKeys(graph, ['v', 'expressions', 'viewport', 'parameters', 'equalAspect', 'xScale', 'yScale', 'gridMode']) || graph.v !== 1
    || !Array.isArray(graph.expressions) || graph.expressions.length > 24) throw new ApiError(400, 'invalid_graph', 'invalid_graph');
  const expressions = graph.expressions.map(row => {
    if (!record(row) || !exactKeys(row, ['expression', 'color', 'visible', 'imported', 'strokeWidth']) || typeof row.expression !== 'string'
      || !row.expression.trim() || row.expression.length > 256 || /[\u0000-\u001f\u007f]/.test(row.expression)
      || (row.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(row.color))
      || (row.visible !== undefined && typeof row.visible !== 'boolean')
      || (row.imported !== undefined && typeof row.imported !== 'boolean')
      || (row.strokeWidth !== undefined && (!Number.isFinite(row.strokeWidth) || row.strokeWidth < 1 || row.strokeWidth > 16)))
      throw new ApiError(400, 'invalid_graph', 'invalid_graph');
    return { expression: row.expression, ...(row.color === undefined ? {} : { color: row.color }),
      ...(row.visible === undefined ? {} : { visible: row.visible }),
      ...(row.imported === undefined ? {} : { imported: row.imported }),
      ...(row.strokeWidth === undefined ? {} : { strokeWidth: row.strokeWidth }) };
  });
  const result = { v: 1, expressions };
  if (graph.viewport !== undefined) {
    if (!record(graph.viewport) || !exactKeys(graph.viewport, ['xMin', 'xMax', 'yMin', 'yMax'])
      || !['xMin', 'xMax', 'yMin', 'yMax'].every(k => Number.isFinite(graph.viewport[k]) && Math.abs(graph.viewport[k]) <= 1e12)
      || graph.viewport.xMin >= graph.viewport.xMax || graph.viewport.yMin >= graph.viewport.yMax) throw new ApiError(400, 'invalid_graph', 'invalid_graph');
    result.viewport = graph.viewport;
  }
  if (graph.parameters !== undefined) {
    if (!record(graph.parameters) || !exactKeys(graph.parameters, ['a', 'b', 'c'])
      || !Object.values(graph.parameters).every(v => Number.isFinite(v) && Math.abs(v) <= 100)) throw new ApiError(400, 'invalid_graph', 'invalid_graph');
    result.parameters = graph.parameters;
  }
  for (const k of ['equalAspect', 'xScale', 'yScale', 'gridMode']) if (graph[k] !== undefined) {
    if (k === 'equalAspect' ? typeof graph[k] !== 'boolean'
      : k === 'gridMode' ? !['cartesian', 'polar'].includes(graph[k])
        : !['linear', 'log'].includes(graph[k])) throw new ApiError(400, 'invalid_graph', 'invalid_graph');
    result[k] = graph[k];
  }
  if (result.gridMode === 'polar' && (result.xScale === 'log' || result.yScale === 'log' || result.equalAspect === false)) throw new ApiError(400, 'invalid_graph', 'invalid_graph');
  return result;
}
async function boundedJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw new ApiError(415, 'content_type', 'application_json_required');
  const length = Number(request.headers.get('Content-Length'));
  if (length > MAX_BODY) throw new ApiError(413, 'request_too_large', 'request_too_large');
  if (!request.body) throw new ApiError(400, 'invalid_json', 'invalid_json');
  const reader = request.body.getReader();
  let size = 0; const parts = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new ApiError(413, 'request_too_large', 'request_too_large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try { const value = JSON.parse(decoder.decode(bytes)); if (!record(value)) throw Error(); return value; }
  catch { throw new ApiError(400, 'invalid_json', 'invalid_json'); }
}
async function boundedProviderJson(response, max = 8192) {
  if (!response.ok) throw new ApiError(502, 'provider_error', 'provider_error');
  const reader = response.body?.getReader(); if (!reader) throw new ApiError(502, 'provider_error', 'provider_error');
  let size = 0; const parts = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new ApiError(502, 'provider_error', 'provider_error'); } parts.push(value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(decoder.decode(bytes)); } catch { throw new ApiError(502, 'provider_error', 'provider_error'); }
}
function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
function outcomePage(title, detail, link, label = 'Open your unlisted Gist') {
  const linkMarkup = link ? `<a class="primary" href="${link}">${label}</a>` : '';
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | atomEDU</title><style>body{margin:0;background:#f7f8fa;color:#21313f;font:16px/1.55 system-ui,sans-serif}header{padding:18px 28px;background:#202d3b;color:#fff;font-weight:700;font-size:22px;letter-spacing:-.03em}main{box-sizing:border-box;max-width:560px;margin:10vh auto;padding:32px;border:1px solid #dce2e8;border-radius:14px;background:#fff;box-shadow:0 12px 40px #23334812}h1{font-size:26px;line-height:1.2;margin:0 0 12px}p{color:#586879}a{display:inline-block;margin:12px 10px 0 0;color:#245f9e;text-decoration:none;font-weight:700}.primary{padding:12px 18px;border-radius:8px;background:#245f9e;color:#fff}@media(max-width:600px){main{margin:24px 12px;padding:22px}}</style><header>atomEDU</header><main><h1>${title}</h1><p>${detail}</p>${linkMarkup}<p><a href="https://atom-edu.org/proof-lab#graph">Back to Proof Lab</a></p></main></html>`, {
    status: link ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' },
  });
}
async function githubStart(request, env) {
  if (!githubConfigured(env)) throw new ApiError(503, 'provider_unavailable', 'missing_config');
  if (request.url.length > MAX_DOWNLOAD_URL) throw new ApiError(414, 'url_too_long', 'url_too_long');
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length !== 1 || !url.searchParams.has('graph'))
    throw new ApiError(400, 'invalid_request', 'invalid_request');
  const raw = url.searchParams.get('graph');
  if (encoder.encode(raw).byteLength > MAX_ONE_SHOT_BYTES) throw new ApiError(413, 'graph_too_large', 'graph_too_large');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await env.OAUTH_LIMITER.limit({ key: ip })).success) throw new ApiError(429, 'rate_limited', 'rate_limited');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, 'invalid_graph', 'invalid_graph'); }
  const graph = validateGraph(parsed);
  if (!graph.expressions.length || encoder.encode(JSON.stringify(graph)).byteLength > MAX_ONE_SHOT_BYTES)
    throw new ApiError(400, 'invalid_graph', 'invalid_graph');
  const c = oauthConfig(env); const state = random(32);
  const pending = await seal({ v: 1, provider: 'github', state, graph, exp: Date.now() + 600000 }, env.SESSION_SECRET);
  const authorization = new URL('https://github.com/login/oauth/authorize');
  authorization.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${c.api}${BASE}/oauth/github/callback`, scope: 'gist', state }).toString();
  return new Response(null, { status: 302, headers: { Location: authorization.href,
    'Set-Cookie': cookieHeader('__Host-atom_github_pending', pending, 600),
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
async function githubCallback(request, env) {
  if (!githubConfigured(env)) throw new ApiError(503, 'provider_unavailable', 'missing_config');
  const url = new URL(request.url);
  const pending = await open(cookie(request, '__Host-atom_github_pending'), env.SESSION_SECRET);
  if (!pending || pending.v !== 1 || pending.provider !== 'github' || pending.exp < Date.now()
    || !safeEqual(pending.state, url.searchParams.get('state')) || !url.searchParams.get('code')
    || url.searchParams.has('error')) throw new ApiError(400, 'oauth_invalid', 'oauth_invalid');
  const c = oauthConfig(env);
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
      code: url.searchParams.get('code'), redirect_uri: `${c.api}${BASE}/oauth/github/callback` }),
    redirect: 'manual',
  });
  const token = await boundedProviderJson(tokenResponse);
  if (typeof token.access_token !== 'string' || token.token_type?.toLowerCase() !== 'bearer'
    || !String(token.scope || '').split(',').map(s => s.trim()).includes('gist'))
    throw new ApiError(502, 'provider_error', 'github_scope_missing');
  const upstream = await fetch('https://api.github.com/gists', {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'atomEDU-Proof-Lab' },
    body: JSON.stringify({ description: 'Graph from atomEDU Proof Lab', public: false,
      files: { 'atom-graph.json': { content: JSON.stringify({ version: 1, graph: pending.graph }, null, 2) } } }),
    redirect: 'manual',
  });
  const gist = await boundedProviderJson(upstream, 32768);
  if (upstream.status !== 201 || typeof gist.id !== 'string' || !/^[0-9a-f]{16,64}$/i.test(gist.id))
    throw new ApiError(502, 'provider_error', 'provider_error');
  const response = outcomePage('Graph saved to GitHub', 'Your graph is in an unlisted Gist. Anyone with its link can view it.', `https://gist.github.com/${gist.id}`);
  response.headers.set('Set-Cookie', cookieHeader('__Host-atom_github_pending', '', 0));
  return response;
}
async function notionStart(request, env) {
  if (!notionConfigured(env)) throw new ApiError(503, 'provider_unavailable', 'missing_config');
  if (request.url.length > MAX_DOWNLOAD_URL) throw new ApiError(414, 'url_too_long', 'url_too_long');
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length !== 2 || !url.searchParams.has('graph') || !url.searchParams.has('parent'))
    throw new ApiError(400, 'invalid_request', 'invalid_request');
  const raw = url.searchParams.get('graph');
  const parent = url.searchParams.get('parent')?.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(parent || '')) throw new ApiError(400, 'invalid_parent', 'invalid_parent');
  if (encoder.encode(raw).byteLength > MAX_ONE_SHOT_BYTES) throw new ApiError(413, 'graph_too_large', 'graph_too_large');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await env.OAUTH_LIMITER.limit({ key: ip })).success) throw new ApiError(429, 'rate_limited', 'rate_limited');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, 'invalid_graph', 'invalid_graph'); }
  const graph = validateGraph(parsed);
  if (!graph.expressions.length || encoder.encode(JSON.stringify(graph)).byteLength > MAX_ONE_SHOT_BYTES)
    throw new ApiError(400, 'invalid_graph', 'invalid_graph');
  const c = oauthConfig(env); const state = random(32);
  const pending = await seal({ v: 1, provider: 'notion', state, graph, parent, exp: Date.now() + 600000 }, env.SESSION_SECRET);
  const authorization = new URL('https://api.notion.com/v1/oauth/authorize');
  authorization.search = new URLSearchParams({ client_id: env.NOTION_CLIENT_ID,
    redirect_uri: `${c.api}${BASE}/oauth/notion/callback`, response_type: 'code', owner: 'user', state }).toString();
  return new Response(null, { status: 302, headers: { Location: authorization.href,
    'Set-Cookie': cookieHeader('__Host-atom_notion_pending', pending, 600),
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
async function notionCallback(request, env) {
  if (!notionConfigured(env)) throw new ApiError(503, 'provider_unavailable', 'missing_config');
  const url = new URL(request.url);
  const pending = await open(cookie(request, '__Host-atom_notion_pending'), env.SESSION_SECRET);
  if (!pending || pending.v !== 1 || pending.provider !== 'notion' || pending.exp < Date.now()
    || !safeEqual(pending.state, url.searchParams.get('state')) || !url.searchParams.get('code')
    || url.searchParams.has('error')) throw new ApiError(400, 'oauth_invalid', 'oauth_invalid');
  const c = oauthConfig(env);
  const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`)}` },
    body: JSON.stringify({ grant_type: 'authorization_code', code: url.searchParams.get('code'),
      redirect_uri: `${c.api}${BASE}/oauth/notion/callback` }), redirect: 'manual',
  });
  const token = await boundedProviderJson(tokenResponse);
  if (typeof token.access_token !== 'string' || !token.access_token) throw new ApiError(502, 'provider_error', 'provider_error');
  // No access or refresh token is persisted. The user may revoke the connection in Notion.
  const graphJson = JSON.stringify({ version: 1, graph: pending.graph }, null, 2).replace(/`/g, '\\u0060');
  const markdown = `# Graph from atomEDU Proof Lab\n\n\`\`\`json\n${graphJson}\n\`\`\``;
  const upstream = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Notion-Version': '2026-03-11',
      Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent: { type: 'page_id', page_id: pending.parent }, markdown, markdown_version: 'v2' }),
    redirect: 'manual',
  });
  if (upstream.status === 403 || upstream.status === 404)
    throw new ApiError(403, 'notion_page_access', 'Select the destination page during Notion authorization and make sure you can edit it.');
  const page = await boundedProviderJson(upstream, 32768);
  if (typeof page.id !== 'string' || !/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(page.id))
    throw new ApiError(502, 'provider_error', 'provider_error');
  const response = outcomePage('Graph saved to Notion', 'Your graph was added as a child page under the destination you chose.',
    `https://www.notion.so/${page.id.replace(/-/g, '')}`, 'Open your Notion page');
  response.headers.set('Set-Cookie', cookieHeader('__Host-atom_notion_pending', '', 0));
  return response;
}
function status(request, env, connected, csrf) {
  const providers = Object.fromEntries(PROVIDERS.map(name => [name, name === 'drive'
    ? { available: driveConfigured(env), connected, ...(!driveConfigured(env) ? { reason: 'missing_config' } : {}) }
    : name === 'github' ? { available: githubConfigured(env), connected: false,
      ...(!githubConfigured(env) ? { reason: 'missing_config' } : {}) }
    : name === 'notion' ? { available: notionPubliclyAvailable(env), connected: false,
      ...(!notionPubliclyAvailable(env) ? { reason: notionConfigured(env) ? 'not_launched' : 'missing_config' } : {}) }
    : { available: false, connected: false, reason: 'unsupported' }]));
  return json({ providers, download: { available: downloadConfigured(env), ...(!downloadConfigured(env) ? { reason: 'missing_config' } : {}) },
    ...(csrf ? { csrfToken: csrf } : {}) }, 200, cors(request, env));
}
async function download(request, env) {
  if (!downloadConfigured(env))
    throw new ApiError(503, 'download_unavailable', 'missing_config');
  if (request.url.length > MAX_DOWNLOAD_URL) throw new ApiError(414, 'url_too_long', 'url_too_long');
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length !== 1 || !url.searchParams.has('graph'))
    throw new ApiError(400, 'invalid_request', 'invalid_request');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await env.DOWNLOAD_LIMITER.limit({ key: ip });
  if (!success) throw new ApiError(429, 'rate_limited', 'rate_limited');
  const budget = await env.DOWNLOAD_BUDGET.limit({ key: 'public-download' });
  if (!budget.success) throw new ApiError(429, 'rate_limited', 'rate_limited');
  const raw = url.searchParams.get('graph');
  if (encoder.encode(raw).byteLength > MAX_DOWNLOAD_BYTES) throw new ApiError(413, 'graph_too_large', 'graph_too_large');
  let value;
  try { value = JSON.parse(raw); } catch { throw new ApiError(400, 'invalid_graph', 'invalid_graph'); }
  const graph = validateGraph(value);
  const content = JSON.stringify(graph);
  if (encoder.encode(content).byteLength > MAX_DOWNLOAD_BYTES) throw new ApiError(413, 'graph_too_large', 'graph_too_large');
  return new Response(content, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': 'attachment; filename="atom-graph.json"', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'",
    ...publicDownloadCors } });
}
async function start(request, env) {
  if (!driveConfigured(env)) throw new ApiError(503, 'provider_unavailable', 'missing_config');
  const c = oauthConfig(env); const state = random(32), verifier = random(32);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)));
  const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${c.api}${BASE}/oauth/drive/callback`, response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'online',
    state, code_challenge: b64(digest), code_challenge_method: 'S256' });
  const pending = await seal({ state, verifier, exp: Date.now() + 600000 }, env.SESSION_SECRET);
  return new Response(null, { status: 302, headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    'Set-Cookie': cookieHeader('__Host-atom_drive_pending', pending, 600), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
async function callback(request, env) {
  if (!driveConfigured(env)) throw new ApiError(503, 'provider_unavailable', 'missing_config');
  const url = new URL(request.url); const pending = await open(cookie(request, '__Host-atom_drive_pending'), env.SESSION_SECRET);
  if (!pending || pending.exp < Date.now() || !url.searchParams.get('state') || url.searchParams.get('state') !== pending.state
    || !url.searchParams.get('code') || url.searchParams.has('error')) throw new ApiError(400, 'oauth_invalid', 'oauth_invalid');
  const c = oauthConfig(env);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${c.api}${BASE}/oauth/drive/callback`,
      grant_type: 'authorization_code', code_verifier: pending.verifier }), redirect: 'manual' });
  const token = await boundedProviderJson(tokenResponse);
  if (typeof token.access_token !== 'string' || token.token_type?.toLowerCase() !== 'bearer'
    || !Number.isFinite(token.expires_in) || token.expires_in < 60 || token.expires_in > 86400)
    throw new ApiError(502, 'provider_error', 'provider_error');
  const ttl = Math.min(token.expires_in - 30, 3600);
  const sealed = await seal({ v: 1, token: token.access_token, csrf: random(32), exp: Date.now() + ttl * 1000 }, env.SESSION_SECRET);
  const headers = new Headers({ Location: `${c.origin}/proof-lab#graph`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  headers.append('Set-Cookie', cookieHeader('__Host-atom_drive_pending', '', 0));
  headers.append('Set-Cookie', cookieHeader('__Host-atom_drive', sealed, ttl));
  return new Response(null, { status: 302, headers });
}
async function disconnect(request, env) {
  requireOrigin(request, env);
  const auth = await session(request, env);
  if (!auth) throw new ApiError(401, 'not_connected', 'oauth_required');
  if (request.headers.get('X-CSRF-Token') !== auth.csrf) throw new ApiError(403, 'csrf_invalid', 'csrf_invalid');
  return json({ provider: 'drive', connected: false }, 200, { ...cors(request, env),
    'Set-Cookie': cookieHeader('__Host-atom_drive', '', 0) });
}
async function exportGraph(request, env) {
  requireOrigin(request, env);
  const body = await boundedJson(request);
  if (!exactKeys(body, ['provider', 'graph']) || !PROVIDERS.includes(body.provider)) throw new ApiError(400, 'invalid_request', 'invalid_request');
  if (body.provider !== 'drive') throw new ApiError(501, 'provider_unsupported', 'unsupported');
  if (!driveConfigured(env)) throw new ApiError(503, 'provider_unavailable', 'missing_config');
  const auth = await session(request, env);
  if (!auth) throw new ApiError(401, 'not_connected', 'oauth_required');
  if (request.headers.get('X-CSRF-Token') !== auth.csrf) throw new ApiError(403, 'csrf_invalid', 'csrf_invalid');
  const graph = validateGraph(body.graph);
  const boundary = `atom_${random(16)}`;
  const content = JSON.stringify(graph);
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: `atom-graph-${new Date().toISOString().slice(0, 10)}.json`, mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const upstream = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST', headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart, redirect: 'manual' });
  const result = await boundedProviderJson(upstream);
  if (typeof result.id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(result.id)) throw new ApiError(502, 'provider_error', 'provider_error');
  return json({ provider: 'drive', id: result.id, url: `https://drive.google.com/file/d/${result.id}/view` }, 201, cors(request, env));
}
export default { async fetch(request, env) {
  try {
    const url = new URL(request.url); const path = url.pathname;
    if (path === `${BASE}/status` && request.method === 'GET') {
      const allowed = request.headers.get('Origin') === originConfig(env);
      const auth = allowed ? await session(request, env) : null;
      return status(request, env, Boolean(auth && driveConfigured(env)), driveConfigured(env) ? auth?.csrf : null);
    }
    if (path === `${BASE}/download` && request.method === 'GET') return await download(request, env);
    if (path === `${BASE}/download` && request.method === 'OPTIONS') {
      if (!downloadConfigured(env)) throw new ApiError(503, 'download_unavailable', 'missing_config');
      return new Response(null, { status: 204, headers: { ...publicDownloadCors,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '600' } });
    }
    if (path === `${BASE}/oauth/drive/start` && request.method === 'GET') return await start(request, env);
    if (path === `${BASE}/oauth/drive/callback` && request.method === 'GET') return await callback(request, env);
    if (path === `${BASE}/oauth/github/start` && request.method === 'GET') return await githubStart(request, env);
    if (path === `${BASE}/oauth/github/callback` && request.method === 'GET') return await githubCallback(request, env);
    if (path === `${BASE}/oauth/notion/start` && request.method === 'GET') return await notionStart(request, env);
    if (path === `${BASE}/oauth/notion/callback` && request.method === 'GET') return await notionCallback(request, env);
    if ((path === `${BASE}/exports` || path === `${BASE}/oauth/drive/disconnect`) && request.method === 'OPTIONS') {
      requireOrigin(request, env);
      return new Response(null, { status: 204, headers: { ...cors(request, env),
        'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
        'Access-Control-Max-Age': '600' } });
    }
    if (path === `${BASE}/oauth/drive/disconnect` && request.method === 'POST') return await disconnect(request, env);
    if (path === `${BASE}/exports` && request.method === 'POST') return await exportGraph(request, env);
    return json({ error: 'not_found' }, 404, cors(request, env));
  } catch (error) {
    if (!(error instanceof ApiError)) {
      const frame = error instanceof Error ? String(error.stack || '').split('\n')[1] : '';
      const message = error instanceof Error ? String(error.message || '')
        .replace(/https?:\/\/\S+/g, '[URL]').replace(/\b[0-9a-f]{40}\b/gi, '[SECRET]')
        .replace(/(?:gh[oupsr]_|secret_)[A-Za-z0-9_]+/g, '[SECRET]').slice(0, 180) : '';
      console.error('integration_internal_error', error instanceof Error ? error.name : 'Unknown', message, frame);
    }
    return error instanceof ApiError ? json({ error: error.code, reason: error.reason }, error.status, cors(request, env))
      : json({ error: 'internal_error' }, 500, cors(request, env));
  }
} };
