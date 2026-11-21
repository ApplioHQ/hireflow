import test from 'node:test';
import assert from 'node:assert/strict';
import { DRIVE_SCOPE, requestDriveAccessToken, uploadGraphToDrive } from '../graph/google-drive.js';

const graph = { expressions: [{ expression: 'y=x^2', color: '#123456', visible: true }],
  viewport: { xMin: -10, xMax: 10, yMin: -5, yMax: 5 } };

test('Drive token flow asks only for drive.file from the user click', async () => {
  let request, config;
  const google = { accounts: { oauth2: {
    initTokenClient(value) { config = value; return { requestAccessToken(value) { request = value;
      config.callback({ access_token: 'temporary-token', scope: DRIVE_SCOPE }); } }; },
    hasGrantedAllScopes(response, scope) { assert.equal(scope, DRIVE_SCOPE); return response.scope === DRIVE_SCOPE; },
  } } };
  const tokenPromise = requestDriveAccessToken(google, 'public-client-id');
  assert.deepEqual(request, { prompt: '' });
  assert.equal(config.client_id, 'public-client-id');
  assert.equal(config.scope, DRIVE_SCOPE);
  assert.equal(await tokenPromise, 'temporary-token');
});

test('Drive token flow refuses missing scope or closed popup', async () => {
  const google = { accounts: { oauth2: {
    initTokenClient(config) { return { requestAccessToken() { config.callback({ access_token: 'wrong-token', scope: 'openid' }); } }; },
    hasGrantedAllScopes() { return false; },
  } } };
  await assert.rejects(requestDriveAccessToken(google, 'public-client-id'), /permission was not granted/);
  assert.throws(() => requestDriveAccessToken(null, 'public-client-id'), /not ready/);
});

test('Drive upload sends only validated graph JSON to the fixed Google endpoint', async () => {
  let calls = 0;
  const result = await uploadGraphToDrive(graph, 'temporary-token', async (url, init) => {
    calls++;
    assert.equal(url, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.Authorization, 'Bearer temporary-token');
    assert.match(init.headers['Content-Type'], /^multipart\/related; boundary=atom_/);
    assert.match(init.body, /atom-graph-\d{4}-\d{2}-\d{2}\.json/);
    assert.match(init.body, /y=x\^2/);
    assert.doesNotMatch(init.body, /temporary-token/);
    return Response.json({ id: 'file_123' });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { id: 'file_123', url: 'https://drive.google.com/file/d/file_123/view' });
});

test('Drive upload rejects empty graphs and unconfirmed responses', async () => {
  await assert.rejects(uploadGraphToDrive({ expressions: [] }, 'temporary-token', () => { throw Error('must not call'); }), /Add a graph/);
  await assert.rejects(uploadGraphToDrive(graph, '', () => { throw Error('must not call'); }), /token is required/);
  await assert.rejects(uploadGraphToDrive(graph, 'temporary-token', async () => Response.json({ error: 'denied' }, { status: 403 })), /HTTP 403/);
  await assert.rejects(uploadGraphToDrive(graph, 'temporary-token', async () => Response.json({ id: '../../evil' })), /did not confirm/);
});
