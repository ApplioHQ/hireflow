import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { contestSchedule, handleRequest, runMaintenance } from '../contest-api/src/index.js';

const BASE = 'https://api.example.test/api/art-contest';
const ORIGIN = 'https://atom-edu.org';
const GIF = new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0]);
const OPEN = new Date('2026-07-10T22:00:00Z'); // 17:00 CDT
const JUDGING = new Date('2026-07-11T00:15:00Z'); // 19:15 CDT
const DELAY = new Date('2026-07-11T01:31:00Z'); // 20:31 CDT

function makeEnv() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../contest-api/migrations/0001_initial.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../contest-api/migrations/0002_runner_up.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return sqlite.prepare(sql).get(...this.values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...this.values) }; },
        async run() { return { meta: { changes: sqlite.prepare(sql).run(...this.values).changes } }; },
        runSync() { return { meta: { changes: sqlite.prepare(sql).run(...this.values).changes } }; },
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement => statement.runSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const objects = new Map();
  const IMAGES = {
    async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
    async get(key) { return objects.has(key) ? { body: objects.get(key) } : null; },
    async delete(key) { objects.delete(key); },
  };
  const env = { DB, IMAGES, ALLOWED_ORIGIN: ORIGIN,
    JUDGING_PASSWORD: crypto.randomUUID(), SESSION_SECRET: crypto.randomUUID() };
  return { env, sqlite, objects };
}

function request(path, { method = 'GET', body, token, origin = ORIGIN, ip = '203.0.113.10' } = {}) {
  const headers = { Origin: origin, 'CF-Connecting-IP': ip };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  return new Request(`${BASE}${path}`, { method, headers, body });
}

function form(image = new File([GIF], 'art.gif', { type: 'image/gif' })) {
  const data = new FormData();
  data.set('name', 'A painter');
  data.set('image', image);
  data.set('termsAccepted', 'true');
  data.set('displayConsent', 'true');
  return data;
}

async function call(env, path, options, now = OPEN) {
  return handleRequest(request(path, options), env, now, () => now);
}

async function login(env, now = JUDGING) {
  const res = await call(env, '/judging/login', { method: 'POST', body: { password: env.JUDGING_PASSWORD } }, now);
  assert.equal(res.status, 200);
  return (await res.json()).token;
}

async function score(env, token, id, beauty, creativity, complexity, now = JUDGING) {
  return call(env, `/judging/submissions/${id}/scores`, {
    method: 'PUT', token, body: { beauty, creativity, complexity },
  }, now);
}

test('runner-up migration preserves existing submissions and historical winners', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../contest-api/migrations/0001_initial.sql', import.meta.url), 'utf8'));
  const entrantId = crypto.randomUUID();
  const winnerId = crypto.randomUUID();
  sqlite.prepare(`INSERT INTO submissions
    (id, contest_date, name, image_key, image_type, created_at, terms_version,
     terms_accepted_at, display_consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)
    .run(entrantId, '2026-07-10', 'Existing entrant', 'entries/2026-07-10/existing',
      'image/gif', OPEN.toISOString(), '2026-11-14', OPEN.toISOString());
  sqlite.prepare(`INSERT INTO winners
    (contest_date, submission_id, name, image_key, image_type, selected_at,
     terms_version, terms_accepted_at, display_consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)
    .run('2026-07-09', winnerId, 'Existing winner', 'entries/2026-07-09/winner',
      'image/gif', JUDGING.toISOString(), '2026-11-14', OPEN.toISOString());
  sqlite.exec(readFileSync(new URL('../contest-api/migrations/0002_runner_up.sql', import.meta.url), 'utf8'));
  assert.deepEqual({ ...sqlite.prepare(`SELECT name, image_key, beauty_score, creativity_score, complexity_score
    FROM submissions WHERE id = ?`).get(entrantId) }, {
    name: 'Existing entrant', image_key: 'entries/2026-07-10/existing',
    beauty_score: null, creativity_score: null, complexity_score: null,
  });
  assert.deepEqual({ ...sqlite.prepare(`SELECT name, image_key, runner_up_submission_id
    FROM winners WHERE submission_id = ?`).get(winnerId) }, {
    name: 'Existing winner', image_key: 'entries/2026-07-09/winner', runner_up_submission_id: null,
  });
});

test('Central schedule honors DST and phase boundaries', () => {
  assert.deepEqual(contestSchedule(new Date('2026-03-08T22:59:00Z')), {
    phase: 'open', contestDate: '2026-03-08',
    deadlineUtc: '2026-03-08T23:00:00.000Z', nextOpenUtc: '2026-03-09T02:30:00.000Z',
  });
  assert.equal(contestSchedule(new Date('2026-03-08T23:00:00Z')).phase, 'judging');
  assert.equal(contestSchedule(new Date('2026-03-09T00:00:00Z')).phase, 'judging');
  assert.equal(contestSchedule(new Date('2026-03-09T01:30:00Z')).phase, 'results_pending');
  assert.equal(contestSchedule(new Date('2026-03-09T02:30:00Z')).contestDate, '2026-03-09');
  assert.equal(contestSchedule(new Date('2026-11-02T00:59:00Z')).deadlineUtc, '2026-11-02T00:00:00.000Z');
  assert.equal(contestSchedule(new Date('2026-11-02T00:00:00Z')).phase, 'judging');
  assert.equal(contestSchedule(new Date('2026-11-01T23:59:00Z')).phase, 'open');
  assert.equal(contestSchedule(new Date('2026-11-02T03:30:00Z')).contestDate, '2026-11-02');
});

test('login uses signed expiring bearer tokens, explicit CORS, and rate limits', async () => {
  const { env } = makeEnv();
  const rejected = await call(env, '/judging/login', { method: 'POST', body: { password: 'wrong' } }, JUDGING);
  assert.equal(rejected.status, 401);
  const token = await login(env);
  const listed = await call(env, '/judging/submissions', { token }, JUDGING);
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(await listed.json(), { submissions: [], winnerId: null, winnerName: null,
    runnerUpId: null, runnerUpName: null });
  assert.equal((await call(env, '/judging/submissions', { token: `${token}x` }, JUDGING)).status, 401);
  assert.equal((await call(env, '/judging/submissions', { token }, new Date(JUDGING.getTime() + 8 * 3600_000))).status, 401);
  assert.equal((await call(env, '/judging/submissions', {}, JUDGING)).status, 401);
  assert.equal((await call(env, '/judging/login', { method: 'POST', origin: 'https://evil.test',
    body: { password: env.JUDGING_PASSWORD } }, JUDGING)).status, 403);
  let last;
  for (let i = 0; i < 9; i++) last = await call(env, '/judging/login', { method: 'POST', body: { password: 'wrong' } }, JUDGING);
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('Retry-After')) > 0);
});

test('uploads enforce consent, magic bytes, size, and private entrant images', async () => {
  const { env, sqlite, objects } = makeEnv();
  const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'image.svg', { type: 'image/svg+xml' });
  assert.equal((await call(env, '/submissions', { method: 'POST', body: form(svg) })).status, 415);
  const spoofed = new File([GIF], 'art.png', { type: 'image/png' });
  assert.equal((await call(env, '/submissions', { method: 'POST', body: form(spoofed) })).status, 415);
  const tooLarge = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.gif', { type: 'image/gif' });
  assert.equal((await call(env, '/submissions', { method: 'POST', body: form(tooLarge) })).status, 400);
  const missingConsent = form();
  missingConsent.set('displayConsent', 'false');
  assert.equal((await call(env, '/submissions', { method: 'POST', body: missingConsent })).status, 400);
  const oversizedRequest = new Request(`${BASE}/submissions`, { method: 'POST',
    headers: { Origin: ORIGIN, 'CF-Connecting-IP': '203.0.113.10',
      'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(9 * 1024 * 1024 + 1) },
    body: 'x' });
  assert.equal((await handleRequest(oversizedRequest, env, OPEN, () => OPEN)).status, 413);
  const submitted = await call(env, '/submissions', { method: 'POST', body: form() });
  assert.equal(submitted.status, 201);
  const { id, contestDate } = await submitted.json();
  assert.equal(contestDate, '2026-07-10');
  const consent = sqlite.prepare('SELECT terms_version, terms_accepted_at, display_consent FROM submissions WHERE id = ?').get(id);
  assert.equal(consent.terms_version, '2026-11-15-2');
  assert.equal(consent.terms_accepted_at, OPEN.toISOString());
  assert.equal(consent.display_consent, 1);
  assert.equal(objects.size, 1);
  assert.equal((await call(env, `/judging/images/${id}`, {}, OPEN)).status, 401);
  assert.equal((await call(env, `/images/${id}`, {}, OPEN)).status, 404);
  const token = await login(env);
  const listing = await (await call(env, '/judging/submissions', { token }, OPEN)).json();
  assert.equal(listing.submissions[0].imageUrl, `${BASE}/judging/images/${id}`);
  assert.equal(listing.submissions[0].scores, null);
  const privateImage = await call(env, `/judging/images/${id}`, { token }, OPEN);
  assert.equal(privateImage.status, 200);
  assert.deepEqual(new Uint8Array(await privateImage.arrayBuffer()), GIF);
  assert.equal((await call(env, '/submissions', { method: 'POST', body: form() }, JUDGING)).status, 409);
  assert.equal((await call(env, '/submissions', { method: 'POST', body: form() },
    new Date('2026-07-10T23:00:00Z'))).status, 409);
});

test('failed submission queues an orphaned private image when immediate deletion fails', async () => {
  const { env, sqlite, objects } = makeEnv();
  const prepare = env.DB.prepare;
  const deleteImage = env.IMAGES.delete;
  env.DB.prepare = (sql) => /^INSERT INTO submissions\b/.test(sql.trim())
    ? { bind() { return { async run() { throw new Error('test D1 write failure'); } }; } }
    : prepare(sql);
  env.IMAGES.delete = async () => { throw new Error('test R2 delete failure'); };
  const result = await call(env, '/submissions', { method: 'POST', body: form() });
  assert.equal(result.status, 500);
  assert.equal(objects.size, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM image_cleanup').get().count, 1);
  env.DB.prepare = prepare;
  env.IMAGES.delete = deleteImage;
  await runMaintenance(env, JUDGING);
  assert.equal(objects.size, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM image_cleanup').get().count, 0);
});

test('judge selects scored winner and runner-up atomically; archive and both images remain available', async () => {
  const { env, sqlite, objects } = makeEnv();
  const first = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const second = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const token = await login(env, DELAY);
  const before = await (await call(env, '/state', {}, DELAY)).json();
  assert.equal(before.phase, 'results_pending');
  assert.equal(before.latestWinner, null);
  assert.equal(before.latestRunnerUp, null);
  assert.equal((await call(env, '/judging/winners', { method: 'POST', token,
    body: { id: first.id, date: first.contestDate } }, DELAY)).status, 409);
  assert.equal((await score(env, token, first.id, 10, 9, 8, DELAY)).status, 200);
  assert.equal((await score(env, token, second.id, 7, 8, 9, DELAY)).status, 200);
  const chosen = await call(env, '/judging/winners', {
    method: 'POST', token, body: { id: first.id, date: first.contestDate },
  }, DELAY);
  assert.equal(chosen.status, 201);
  const { winner, runnerUp } = await chosen.json();
  assert.equal(winner.id, first.id);
  assert.equal(winner.imageUrl, `${BASE}/images/${first.id}`);
  assert.equal(runnerUp.id, second.id);
  assert.equal(runnerUp.imageUrl, `${BASE}/images/${second.id}`);
  const after = await (await call(env, '/state', {}, DELAY)).json();
  assert.deepEqual(after.latestWinner, winner);
  assert.deepEqual(after.latestRunnerUp, runnerUp);
  assert.deepEqual(after.archive, [{ ...winner, runnerUp }]);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n, 0);
  assert.equal(sqlite.prepare('SELECT display_consent FROM winners').get().display_consent, 1);
  assert.equal(sqlite.prepare('SELECT terms_version FROM winners').get().terms_version, '2026-11-15-2');
  const judged = await (await call(env, '/judging/submissions', { token }, DELAY)).json();
  assert.deepEqual(judged, { submissions: [], winnerId: first.id, winnerName: 'A painter',
    runnerUpId: second.id, runnerUpName: 'A painter' });
  assert.equal(objects.size, 2);
  const publicImage = await call(env, `/images/${first.id}`, {}, DELAY);
  assert.equal(publicImage.status, 200);
  assert.deepEqual(new Uint8Array(await publicImage.arrayBuffer()), GIF);
  assert.equal((await call(env, `/judging/images/${first.id}`, { token }, DELAY)).status, 200);
  assert.equal((await call(env, `/images/${second.id}`, {}, DELAY)).status, 200);
  assert.equal((await call(env, `/judging/images/${second.id}`, { token }, DELAY)).status, 200);
  assert.equal((await call(env, '/judging/winners', {
    method: 'POST', token, body: { id: second.id, date: second.contestDate },
  }, DELAY)).status, 409);
  assert.equal((await call(env, '/judging/winners', {
    method: 'POST', token, body: { id: second.id, date: second.contestDate },
  }, new Date('2026-07-11T02:30:00Z'))).status, 409);
});

test('scores require authentication, valid integers, and a complete slate before finalization', async () => {
  const { env, sqlite, objects } = makeEnv();
  const first = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const second = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const token = await login(env);
  assert.equal((await score(env, undefined, first.id, 5, 5, 5)).status, 401);
  for (const values of [[-1, 5, 5], [11, 5, 5], [5.5, 5, 5], ['5', 5, 5]]) {
    assert.equal((await score(env, token, first.id, ...values)).status, 400);
  }
  assert.equal((await score(env, token, first.id, 7, 8, 9, OPEN)).status, 409);
  const scored = await score(env, token, first.id, 7, 8, 9);
  assert.deepEqual(await scored.json(), { id: first.id, date: first.contestDate,
    scores: { beauty: 7, creativity: 8, complexity: 9, total: 24 } });
  const listed = await (await call(env, '/judging/submissions', { token }, JUDGING)).json();
  assert.deepEqual(listed.submissions.map(entry => entry.scores), [
    { beauty: 7, creativity: 8, complexity: 9, total: 24 }, null,
  ]);
  const incomplete = await call(env, '/judging/winners', { method: 'POST', token,
    body: { id: first.id, date: first.contestDate } }, JUDGING);
  assert.equal(incomplete.status, 409);
  assert.equal((await incomplete.json()).error.code, 'scores_incomplete');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM winners').get().n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n, 2);
  assert.equal(objects.size, 2);
  assert.equal((await score(env, token, second.id, 9, 9, 9)).status, 200);
  const lower = await call(env, '/judging/winners', { method: 'POST', token,
    body: { id: first.id, date: first.contestDate } }, JUDGING);
  assert.equal(lower.status, 409);
  assert.equal((await lower.json()).error.code, 'lower_score');
  assert.equal((await call(env, '/judging/winners', { method: 'POST', token,
    body: { id: second.id, date: second.contestDate } }, JUDGING)).status, 201);
  assert.equal((await score(env, token, first.id, 10, 10, 10)).status, 409);
});

test('every tied total blocks publication until judges save distinct scores', async () => {
  const { env, sqlite, objects } = makeEnv();
  const entries = [];
  for (let i = 0; i < 4; i++) {
    entries.push(await (await call(env, '/submissions', { method: 'POST', body: form() })).json());
  }
  const token = await login(env);
  for (const entry of entries) assert.equal((await score(env, token, entry.id, 8, 8, 8)).status, 200);
  const submit = (id) => call(env, '/judging/winners', { method: 'POST', token,
    body: { id, date: entries[0].contestDate } }, JUDGING);
  for (const change of [null, [0, 10, 10, 10], [1, 9, 9, 9]]) {
    if (change) assert.equal((await score(env, token, entries[change[0]].id, ...change.slice(1))).status, 200);
    const blocked = await submit(entries[0].id);
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).error.code, 'scores_tied');
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM winners').get().n, 0);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n, 4);
    assert.equal(objects.size, 4);
  }
  assert.equal((await score(env, token, entries[2].id, 7, 7, 7)).status, 200);
  const selected = await submit(entries[0].id);
  assert.equal(selected.status, 201);
  const { winner, runnerUp } = await selected.json();
  assert.equal(winner.id, entries[0].id);
  assert.equal(runnerUp.id, entries[1].id);
  assert.equal(objects.size, 2);
});

test('confirmation rejects a runner-up that changed after the private preview without publishing or deleting', async () => {
  const { env, sqlite, objects } = makeEnv();
  const entries = [];
  for (let i = 0; i < 3; i++) entries.push(await (await call(env, '/submissions', { method: 'POST', body: form() })).json());
  const token = await login(env);
  assert.equal((await score(env, token, entries[0].id, 10, 10, 10)).status, 200);
  assert.equal((await score(env, token, entries[1].id, 8, 8, 8)).status, 200);
  assert.equal((await score(env, token, entries[2].id, 6, 6, 6)).status, 200);
  assert.equal((await score(env, token, entries[2].id, 9, 9, 9)).status, 200);
  const stale = await call(env, '/judging/winners', { method: 'POST', token,
    body: { id: entries[0].id, date: entries[0].contestDate, expectedRunnerUpId: entries[1].id } }, JUDGING);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'selection_changed');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM winners').get().n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n, 3);
  assert.equal(objects.size, 3);
  const confirmed = await call(env, '/judging/winners', { method: 'POST', token,
    body: { id: entries[0].id, date: entries[0].contestDate, expectedRunnerUpId: entries[2].id } }, JUDGING);
  assert.equal(confirmed.status, 201);
  assert.equal((await confirmed.json()).runnerUp.id, entries[2].id);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n, 0);
  assert.equal(objects.size, 2);
});

test('one scored submission has no runner-up; pre-migration winners remain readable', async () => {
  const { env, sqlite, objects } = makeEnv();
  sqlite.prepare(`INSERT INTO winners
    (contest_date, submission_id, name, image_key, image_type, selected_at,
     terms_version, terms_accepted_at, display_consent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(
    '2026-07-09', crypto.randomUUID(), 'Historical winner', 'entries/old/winner', 'image/gif',
    '2026-07-10T01:00:00.000Z', '2026-11-14', '2026-07-09T23:00:00.000Z');
  const only = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const token = await login(env);
  assert.equal((await score(env, token, only.id, 0, 0, 0)).status, 200);
  const selected = await call(env, '/judging/winners', { method: 'POST', token,
    body: { id: only.id, date: only.contestDate, expectedRunnerUpId: null } }, JUDGING);
  assert.equal(selected.status, 201);
  assert.equal((await selected.json()).runnerUp, null);
  const state = await (await call(env, '/state', {}, JUDGING)).json();
  assert.equal(state.latestRunnerUp, null);
  assert.equal(state.archive.length, 2);
  assert.equal(state.archive[1].name, 'Historical winner');
  assert.equal(state.archive[1].runnerUp, null);
  await runMaintenance(env, new Date('2026-07-12T03:00:00Z'));
  assert.equal(objects.size, 1);
  assert.equal((await call(env, `/images/${only.id}`, {}, JUDGING)).status, 200);
});

test('a cleanup write failure rolls back selection without deleting entries or images', async () => {
  const { env, sqlite, objects } = makeEnv();
  const entries = [];
  for (let i = 0; i < 3; i++) {
    entries.push(await (await call(env, '/submissions', { method: 'POST', body: form() })).json());
  }
  const token = await login(env);
  for (let i = 0; i < entries.length; i++) {
    assert.equal((await score(env, token, entries[i].id, 10 - i, 10 - i, 10 - i)).status, 200);
  }
  sqlite.exec(`CREATE TRIGGER fail_cleanup BEFORE INSERT ON image_cleanup
    BEGIN SELECT RAISE(ABORT, 'simulated cleanup write failure'); END`);
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await call(env, '/judging/winners', { method: 'POST', token,
      body: { id: entries[0].id, date: entries[0].contestDate } }, JUDGING)).status, 500);
  } finally {
    console.error = originalError;
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM winners').get().n, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n, 3);
  assert.equal(objects.size, 3);
  sqlite.exec('DROP TRIGGER fail_cleanup');
  assert.equal((await call(env, '/judging/winners', { method: 'POST', token,
    body: { id: entries[0].id, date: entries[0].contestDate } }, JUDGING)).status, 201);
  assert.equal(objects.size, 2);
});

test('cleanup never removes an archived winner or runner-up image', async () => {
  const { env, sqlite, objects } = makeEnv();
  const first = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const second = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const token = await login(env);
  assert.equal((await score(env, token, first.id, 10, 10, 10)).status, 200);
  assert.equal((await score(env, token, second.id, 9, 9, 9)).status, 200);
  assert.equal((await call(env, '/judging/winners', { method: 'POST', token,
    body: { id: first.id, date: first.contestDate } }, JUDGING)).status, 201);
  const keys = sqlite.prepare('SELECT image_key, runner_up_image_key FROM winners').get();
  sqlite.prepare('INSERT INTO image_cleanup (image_key, created_at) VALUES (?, ?)')
    .run(keys.image_key, JUDGING.toISOString());
  sqlite.prepare('INSERT INTO image_cleanup (image_key, created_at) VALUES (?, ?)')
    .run(keys.runner_up_image_key, JUDGING.toISOString());
  await runMaintenance(env, DELAY);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM image_cleanup').get().n, 0);
  assert.equal(objects.size, 2);
  assert.equal((await call(env, `/images/${first.id}`, {}, DELAY)).status, 200);
  assert.equal((await call(env, `/images/${second.id}`, {}, DELAY)).status, 200);
});

test('judge deletion removes the private image and D1 row', async () => {
  const { env, sqlite, objects } = makeEnv();
  const { id } = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const token = await login(env);
  const result = await call(env, `/judging/submissions/${id}`, { method: 'DELETE', token }, JUDGING);
  assert.equal(result.status, 200);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n, 0);
  assert.equal(objects.size, 0);
  assert.equal((await call(env, `/judging/images/${id}`, { token }, JUDGING)).status, 404);
  await worker.scheduled(null, env);
});

test('cleanup retries failed R2 deletion and expires entries with no winner', async () => {
  const { env, sqlite, objects } = makeEnv();
  const first = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const second = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const third = await (await call(env, '/submissions', { method: 'POST', body: form() })).json();
  const token = await login(env);
  assert.equal((await score(env, token, first.id, 10, 10, 10)).status, 200);
  assert.equal((await score(env, token, second.id, 9, 9, 9)).status, 200);
  assert.equal((await score(env, token, third.id, 1, 1, 1)).status, 200);
  const originalDelete = env.IMAGES.delete;
  let failOnce = true;
  env.IMAGES.delete = async key => {
    if (failOnce) { failOnce = false; throw new Error('temporary R2 failure'); }
    await originalDelete(key);
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const chosen = await call(env, '/judging/winners', {
      method: 'POST', token, body: { id: first.id, date: first.contestDate },
    }, JUDGING);
    assert.equal(chosen.status, 201);
  } finally {
    console.error = originalError;
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM image_cleanup').get().n, 1);
  assert.equal(objects.size, 3);
  await runMaintenance(env, DELAY);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM image_cleanup').get().n, 0);
  assert.equal(objects.size, 2);

  const noWinner = await (await call(env, '/submissions', { method: 'POST', body: form() },
    new Date('2026-07-11T03:00:00Z'))).json();
  assert.equal(noWinner.contestDate, '2026-07-11');
  await runMaintenance(env, new Date('2026-07-12T03:00:00Z'));
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM submissions').get().n, 0);
  assert.equal(objects.size, 2);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM winners').get().n, 1);
});

test('submission protection limits bursts without an hourly or daily entry cap', async () => {
  const { env } = makeEnv();
  for (let i = 0; i < 10; i++) {
    assert.equal((await call(env, '/submissions', { method: 'POST', body: form() }, OPEN)).status, 201);
  }
  const burst = await call(env, '/submissions', { method: 'POST', body: form() }, OPEN);
  assert.equal(burst.status, 429);
  assert.ok(Number(burst.headers.get('Retry-After')) > 0);
  assert.equal((await call(env, '/submissions', { method: 'POST', body: form() },
    new Date(OPEN.getTime() + 60_000))).status, 201);
  assert.equal((await call(env, '/submissions', { method: 'POST', body: form() },
    new Date(OPEN.getTime() + 59 * 60_000))).status, 201);
});
