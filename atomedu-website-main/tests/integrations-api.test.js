import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../integrations-api/index.js';

const API = 'https://integrations.atom-edu.org';
const SITE = 'https://atom-edu.org';
const ENV = { API_ORIGIN: API, ALLOWED_ORIGIN: SITE, SESSION_SECRET: 'a-secret-longer-than-thirty-two-characters-for-tests',
  GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret' };
const graph = { v: 1, expressions: [{ expression: 'y=x^2', color: '#123456', visible: true }],
  viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 } };
const req = (path, options = {}) => new Request(`${API}/api/integrations${path}`, options);
const invoke = (path, options = {}, env = ENV) => worker.fetch(req(path, options), env);
const cookieValue = (response, name) => response.headers.getSetCookie().find(c => c.startsWith(`${name}=`))?.split(';')[0];


async function connect(t) {
  const start = await invoke('/oauth/drive/start');
  assert.equal(start.status, 302);
  const auth = new URL(start.headers.get('Location'));
  assert.equal(auth.origin, 'https://accounts.google.com');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  const pending = cookieValue(start, '__Host-atom_drive_pending');
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(init.body.get('client_secret'), ENV.GOOGLE_CLIENT_SECRET);
    assert.ok(init.body.get('code_verifier'));
    return Response.json({ access_token: 'user-token', token_type: 'Bearer', expires_in: 3600 });
  };
  t.after(() => { globalThis.fetch = previous; });
  const callback = await invoke(`/oauth/drive/callback?code=abc&state=${auth.searchParams.get('state')}`,
    { headers: { Cookie: pending } });
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('Location'), `${SITE}/proof-lab#graph`);
  assert.doesNotMatch(callback.headers.get('Location'), /token|code=/);
  return cookieValue(callback, '__Host-atom_drive');
}

test('status enumerates providers and distinguishes config from connection', async () => {
  const response = await invoke('/status', { headers: { Origin: SITE } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.providers.drive, { available: true, connected: false });
  for (const name of ['dropbox', 'zapier'])
    assert.deepEqual(body.providers[name], { available: false, connected: false, reason: 'unsupported' });
  assert.deepEqual(body.providers.github, { available: false, connected: false, reason: 'missing_config' });
  assert.deepEqual(body.providers.notion, { available: false, connected: false, reason: 'missing_config' });
  assert.equal(body.csrfToken, undefined);
  const absent = await (await invoke('/status', { headers: { Origin: SITE } }, { ...ENV, GOOGLE_CLIENT_SECRET: undefined })).json();
  assert.deepEqual(absent.providers.drive, { available: false, connected: false, reason: 'missing_config' });
});

test('missing config cannot start OAuth or export; unsupported providers are explicit', async () => {
  const missing = { ...ENV, GOOGLE_CLIENT_SECRET: undefined };
  assert.deepEqual(await (await invoke('/oauth/drive/start', {}, missing)).json(),
    { error: 'provider_unavailable', reason: 'missing_config' });
  const post = provider => ({ method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, graph }) });
  const drive = await invoke('/exports', post('drive'), missing);
  assert.equal(drive.status, 503);
  const notion = await invoke('/exports', post('notion'));
  assert.equal(notion.status, 501);
  assert.deepEqual(await notion.json(), { error: 'provider_unsupported', reason: 'unsupported' });
});

test('state mismatch rejects callback without exchanging a code', async () => {
  const start = await invoke('/oauth/drive/start');
  const previous = globalThis.fetch; globalThis.fetch = () => { throw Error('unexpected upstream call'); };
  try {
    const response = await invoke('/oauth/drive/callback?code=abc&state=wrong',
      { headers: { Cookie: cookieValue(start, '__Host-atom_drive_pending') } });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'oauth_invalid', reason: 'oauth_invalid' });
  } finally { globalThis.fetch = previous; }
});

test('connected export requires exact origin and CSRF, then uploads to fixed Drive API', async t => {
  const sessionCookie = await connect(t);
  const get = await invoke('/status', { headers: { Origin: SITE, Cookie: sessionCookie } });
  const status = await get.json();
  assert.equal(status.providers.drive.connected, true);
  assert.ok(status.csrfToken);
  assert.equal(get.headers.get('Access-Control-Allow-Origin'), SITE);
  const post = (origin, csrf) => ({ method: 'POST', headers: { Origin: origin, Cookie: sessionCookie,
    'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ provider: 'drive', graph }) });
  assert.equal((await invoke('/exports', post('https://evil.example', status.csrfToken))).status, 403);
  assert.equal((await invoke('/exports', post(SITE, 'wrong'))).status, 403);
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink');
    assert.equal(init.headers.Authorization, 'Bearer user-token');
    assert.match(init.body, /y=x\^2/);
    return Response.json({ id: 'file_123' });
  };
  t.after(() => { globalThis.fetch = previous; });
  const exported = await invoke('/exports', post(SITE, status.csrfToken));
  assert.equal(exported.status, 201);
  assert.deepEqual(await exported.json(), { provider: 'drive', id: 'file_123', url: 'https://drive.google.com/file/d/file_123/view' });
});

test('rejects oversized, malformed, and unauthenticated requests before provider calls', async () => {
  const base = { method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json' } };
  assert.equal((await invoke('/exports', { ...base, body: 'x'.repeat(16385) })).status, 413);
  assert.equal((await invoke('/exports', { ...base, body: '{' })).status, 400);
  assert.equal((await invoke('/exports', { ...base, body: JSON.stringify({ provider: 'drive', graph }) })).status, 401);
  const preflight = await invoke('/exports', { method: 'OPTIONS', headers: { Origin: SITE } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Content-Type, X-CSRF-Token');
  assert.equal((await invoke('/exports', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('disconnect clears only the user cookie and requires CSRF', async t => {
  const sessionCookie = await connect(t);
  const status = await (await invoke('/status', { headers: { Origin: SITE, Cookie: sessionCookie } })).json();
  const headers = { Origin: SITE, Cookie: sessionCookie, 'X-CSRF-Token': status.csrfToken };
  assert.equal((await invoke('/oauth/drive/disconnect', { method: 'POST', headers: { ...headers, 'X-CSRF-Token': 'bad' } })).status, 403);
  const response = await invoke('/oauth/drive/disconnect', { method: 'POST', headers });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { provider: 'drive', connected: false });
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
});

test('valid session still rejects graph fields outside bounded schema', async t => {
  const sessionCookie = await connect(t);
  const status = await (await invoke('/status', { headers: { Origin: SITE, Cookie: sessionCookie } })).json();
  const response = await invoke('/exports', { method: 'POST', headers: { Origin: SITE, Cookie: sessionCookie,
    'Content-Type': 'application/json', 'X-CSRF-Token': status.csrfToken },
    body: JSON.stringify({ provider: 'drive', graph: { ...graph, destinationUrl: 'https://evil.example' } }) });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_graph', reason: 'invalid_graph' });
});

test('public download returns bounded JSON with attachment headers and provider CORS', async () => {
  const env = { ...ENV, DOWNLOAD_LIMITER: { async limit({ key }) { assert.equal(key, '203.0.113.4'); return { success: true }; } },
    DOWNLOAD_BUDGET: { async limit({ key }) { assert.equal(key, 'public-download'); return { success: true }; } } };
  const path = `/download?graph=${encodeURIComponent(JSON.stringify(graph))}`;
  const response = await invoke(path, { headers: { Origin: SITE, 'CF-Connecting-IP': '203.0.113.4' } }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), graph);
  assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="atom-graph.json"');
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Range');
  assert.match(response.headers.get('Access-Control-Expose-Headers'), /Content-Range/);
  const preflight = await invoke('/download', { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Headers': 'range' } }, env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Range');
  const providerFetch = await invoke(path, {}, { ...env, DOWNLOAD_LIMITER: { async limit() { return { success: true }; } } });
  assert.equal(providerFetch.status, 200);
  assert.equal(providerFetch.headers.get('Access-Control-Allow-Origin'), '*');
  const status = await (await invoke('/status', {}, env)).json();
  assert.deepEqual(status.download, { available: true });
});

test('download fails closed without limiter and enforces query, payload, and rate limits', async () => {
  const path = `/download?graph=${encodeURIComponent(JSON.stringify(graph))}`;
  const unavailable = await invoke(path);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: 'download_unavailable', reason: 'missing_config' });
  const limited = { ...ENV, DOWNLOAD_LIMITER: { async limit() { return { success: false }; } }, DOWNLOAD_BUDGET: { async limit() { return { success: true }; } } };
  assert.equal((await invoke(path, {}, limited)).status, 429);
  const budgetLimited = { ...limited, DOWNLOAD_LIMITER: { async limit() { return { success: true }; } },
    DOWNLOAD_BUDGET: { async limit() { return { success: false }; } } };
  assert.equal((await invoke(path, {}, budgetLimited)).status, 429);
  const env = { ...ENV, DOWNLOAD_LIMITER: { async limit() { return { success: true }; } }, DOWNLOAD_BUDGET: { async limit() { return { success: true }; } } };
  assert.equal((await invoke(`${path}&url=https://evil.example`, {}, env)).status, 400);
  assert.equal((await invoke('/download?graph=%7B', {}, env)).status, 400);
  assert.equal((await invoke(`/download?graph=${encodeURIComponent(JSON.stringify({ ...graph, destinationUrl: 'https://evil.example' }))}`, {}, env)).status, 400);
  assert.equal((await invoke(`/download?graph=${'x'.repeat(8200)}`, {}, env)).status, 414);
  assert.equal((await invoke(`/download?graph=${encodeURIComponent(JSON.stringify({ v: 1, expressions: [{ expression: 'x'.repeat(257) }] }))}`, {}, env)).status, 400);
});

test('read-only download and CORS work without OAuth configuration', async () => {
  const env = { ALLOWED_ORIGIN: SITE,
    DOWNLOAD_LIMITER: { async limit() { return { success: true }; } },
    DOWNLOAD_BUDGET: { async limit() { return { success: true }; } } };
  const path = `/download?graph=${encodeURIComponent(JSON.stringify(graph))}`;
  const statusResponse = await invoke('/status', { headers: { Origin: SITE } }, env);
  const status = await statusResponse.json();
  assert.deepEqual(status.download, { available: true });
  assert.deepEqual(status.providers.drive, { available: false, connected: false, reason: 'missing_config' });
  assert.equal(statusResponse.headers.get('Access-Control-Allow-Origin'), SITE);
  const response = await invoke(path, { headers: { Origin: SITE } }, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), graph);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  const other = await invoke(path, { headers: { Origin: 'https://evil.example' } }, env);
  assert.equal(other.status, 200);
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await invoke('/oauth/drive/start', {}, env)).status, 503);
});

test('download requires a valid exact HTTPS frontend origin', async () => {
  const env = { ALLOWED_ORIGIN: 'https://atom-edu.org/other',
    DOWNLOAD_LIMITER: { async limit() { throw Error('must not use limiter'); } },
    DOWNLOAD_BUDGET: { async limit() { throw Error('must not use budget'); } } };
  const status = await (await invoke('/status', { headers: { Origin: SITE } }, env)).json();
  assert.deepEqual(status.download, { available: false, reason: 'missing_config' });
  const response = await invoke(`/download?graph=${encodeURIComponent(JSON.stringify(graph))}`, {}, env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('download preserves graph drawing metadata without private fields', async () => {
  const env = { ALLOWED_ORIGIN: SITE,
    DOWNLOAD_LIMITER: { async limit() { return { success: true }; } },
    DOWNLOAD_BUDGET: { async limit() { return { success: true }; } } };
  const styled = { ...graph, expressions: [{ expression: 'y=x', imported: true, strokeWidth: 2.2, color: '#abcdef' }] };
  const response = await invoke(`/download?graph=${encodeURIComponent(JSON.stringify(styled))}`, {}, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), styled);
  const injected = { ...styled, expressions: [{ ...styled.expressions[0], privateToken: 'secret' }] };
  assert.equal((await invoke(`/download?graph=${encodeURIComponent(JSON.stringify(injected))}`, {}, env)).status, 400);
});

const GH_ENV = { ...ENV, GITHUB_CLIENT_ID: 'test-github-client', GITHUB_CLIENT_SECRET: 'test-github-secret',
  OAUTH_LIMITER: { async limit() { return { success: true }; } } };
const githubPath = `/oauth/github/start?graph=${encodeURIComponent(JSON.stringify(graph))}`;

test('GitHub one-shot export requires config and a bounded, nonempty graph', async () => {
  assert.equal((await invoke(githubPath)).status, 503);
  const status = await (await invoke('/status', {}, GH_ENV)).json();
  assert.deepEqual(status.providers.github, { available: true, connected: false });
  assert.equal((await invoke('/oauth/github/start?graph=%7B', {}, GH_ENV)).status, 400);
  assert.equal((await invoke('/oauth/github/start?graph=%7B%22v%22%3A1%2C%22expressions%22%3A%5B%5D%7D', {}, GH_ENV)).status, 400);
  const oversized = { ...graph, expressions: [{ expression: 'y=x' + ' '.repeat(1900) }] };
  assert.equal((await invoke(`/oauth/github/start?graph=${encodeURIComponent(JSON.stringify(oversized))}`, {}, GH_ENV)).status, 413);
  assert.equal((await invoke(`${githubPath}&redirect=https://evil.example`, {}, GH_ENV)).status, 400);
});

test('GitHub OAuth uses exact callback, gist-only scope, encrypted state, and one unlisted Gist', async () => {
  const start = await invoke(githubPath, { headers: { 'CF-Connecting-IP': '203.0.113.8' } }, GH_ENV);
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get('Location'));
  assert.equal(authorize.origin, 'https://github.com');
  assert.equal(authorize.pathname, '/login/oauth/authorize');
  assert.equal(authorize.searchParams.get('scope'), 'gist');
  assert.equal(authorize.searchParams.get('redirect_uri'), `${API}/api/integrations/oauth/github/callback`);
  const pending = cookieValue(start, '__Host-atom_github_pending');
  assert.match(pending, /^__Host-atom_github_pending=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(pending, /y=x|secret/);
  const previous = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(init.redirect, 'manual');
    if (calls === 1) {
      assert.equal(url, 'https://github.com/login/oauth/access_token');
      assert.equal(init.method, 'POST');
      const payload = JSON.parse(init.body);
      assert.equal(payload.client_secret, GH_ENV.GITHUB_CLIENT_SECRET);
      assert.equal(payload.redirect_uri, `${API}/api/integrations/oauth/github/callback`);
      return Response.json({ access_token: 'gh-token', token_type: 'bearer', scope: 'gist' });
    }
    assert.equal(url, 'https://api.github.com/gists');
    assert.equal(init.headers.Authorization, 'Bearer gh-token');
    const payload = JSON.parse(init.body);
    assert.equal(payload.public, false);
    assert.equal(JSON.parse(payload.files['atom-graph.json'].content).graph.expressions[0].expression, 'y=x^2');
    return Response.json({ id: '1234567890abcdef1234567890abcdef' }, { status: 201 });
  };
  try {
    const mismatch = await invoke('/oauth/github/callback?code=abc&state=wrong', { headers: { Cookie: pending } }, GH_ENV);
    assert.equal(mismatch.status, 400);
    assert.equal(calls, 0);
    const callback = await invoke(`/oauth/github/callback?code=abc&state=${authorize.searchParams.get('state')}`,
      { headers: { Cookie: pending } }, GH_ENV);
    assert.equal(callback.status, 200);
    const html = await callback.text();
    assert.match(html, /https:\/\/gist\.github\.com\/1234567890abcdef1234567890abcdef/);
    assert.match(html, /unlisted Gist/);
    assert.doesNotMatch(html, /gh-token|test-github-secret/);
    assert.match(callback.headers.get('Set-Cookie'), /Max-Age=0/);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = previous; }
});

test('GitHub rejects missing gist permission before creating anything', async () => {
  const start = await invoke(githubPath, {}, GH_ENV);
  const authorize = new URL(start.headers.get('Location'));
  const pending = cookieValue(start, '__Host-atom_github_pending');
  const previous = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ access_token: 'wrong-scope', token_type: 'bearer', scope: 'read:user' }); };
  try {
    const response = await invoke(`/oauth/github/callback?code=abc&state=${authorize.searchParams.get('state')}`,
      { headers: { Cookie: pending } }, GH_ENV);
    assert.equal(response.status, 502);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; }
});

const NOTION_ENV = { ...ENV, NOTION_CLIENT_ID: 'test-notion-client', NOTION_CLIENT_SECRET: 'test-notion-secret', NOTION_PUBLIC: 'true',
  OAUTH_LIMITER: { async limit() { return { success: true }; } } };
const notionParent = '41acb18b29318005a7c3e7921315848e';
const notionPath = `/oauth/notion/start?graph=${encodeURIComponent(JSON.stringify(graph))}&parent=${notionParent}`;

test('Notion one-shot export requires config, a chosen parent page, and a bounded graph', async () => {
  assert.equal((await invoke(notionPath)).status, 503);
  const hidden = await (await invoke('/status', {}, { ...NOTION_ENV, NOTION_PUBLIC: 'false' })).json();
  assert.deepEqual(hidden.providers.notion, { available: false, connected: false, reason: 'not_launched' });
  const status = await (await invoke('/status', {}, NOTION_ENV)).json();
  assert.deepEqual(status.providers.notion, { available: true, connected: false });
  assert.equal((await invoke(notionPath.replace(notionParent, 'bad'), {}, NOTION_ENV)).status, 400);
  assert.equal((await invoke(`${notionPath}&extra=1`, {}, NOTION_ENV)).status, 400);
  assert.equal((await invoke('/oauth/notion/start?graph=%7B%7D&parent=' + notionParent, {}, NOTION_ENV)).status, 400);
});

test('Notion OAuth creates a child page only under the selected destination and never returns tokens', async () => {
  const start = await invoke(notionPath, {}, NOTION_ENV);
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get('Location'));
  assert.equal(authorize.origin, 'https://api.notion.com');
  assert.equal(authorize.pathname, '/v1/oauth/authorize');
  assert.equal(authorize.searchParams.get('owner'), 'user');
  assert.equal(authorize.searchParams.get('response_type'), 'code');
  assert.equal(authorize.searchParams.get('redirect_uri'), `${API}/api/integrations/oauth/notion/callback`);
  const pending = cookieValue(start, '__Host-atom_notion_pending');
  assert.doesNotMatch(pending, /y=x|test-notion-secret/);
  const previous = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(init.redirect, 'manual');
    if (calls === 1) {
      assert.equal(url, 'https://api.notion.com/v1/oauth/token');
      assert.equal(atob(init.headers.Authorization.slice(6)), 'test-notion-client:test-notion-secret');
      assert.equal(JSON.parse(init.body).redirect_uri, `${API}/api/integrations/oauth/notion/callback`);
      return Response.json({ access_token: 'notion-token', refresh_token: 'never-persisted' });
    }
    assert.equal(url, 'https://api.notion.com/v1/pages');
    assert.equal(init.headers.Authorization, 'Bearer notion-token');
    assert.equal(init.headers['Notion-Version'], '2026-03-11');
    const payload = JSON.parse(init.body);
    assert.deepEqual(payload.parent, { type: 'page_id', page_id: notionParent });
    assert.equal(payload.markdown_version, 'v2');
    assert.match(payload.markdown, /y=x\^2/);
    return Response.json({ id: 'e824a498-b288-4f66-9340-a9db762ba6f4' });
  };
  try {
    assert.equal((await invoke('/oauth/notion/callback?code=abc&state=wrong', { headers: { Cookie: pending } }, NOTION_ENV)).status, 400);
    assert.equal(calls, 0);
    const response = await invoke(`/oauth/notion/callback?code=abc&state=${authorize.searchParams.get('state')}`,
      { headers: { Cookie: pending } }, NOTION_ENV);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /https:\/\/www\.notion\.so\/e824a498b2884f669340a9db762ba6f4/);
    assert.doesNotMatch(html, /notion-token|never-persisted/);
    assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = previous; }
});

test('Notion refuses to create a page when the chosen parent was not authorized', async () => {
  const start = await invoke(notionPath, {}, NOTION_ENV);
  const authorize = new URL(start.headers.get('Location'));
  const pending = cookieValue(start, '__Host-atom_notion_pending');
  const previous = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1 ? Response.json({ access_token: 'short-lived-token' }) : Response.json({ code: 'restricted_resource' }, { status: 403 });
  };
  try {
    const response = await invoke(`/oauth/notion/callback?code=abc&state=${authorize.searchParams.get('state')}`,
      { headers: { Cookie: pending } }, NOTION_ENV);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'notion_page_access',
      reason: 'Select the destination page during Notion authorization and make sure you can edit it.' });
    assert.equal(calls, 2);
  } finally { globalThis.fetch = previous; }
});
