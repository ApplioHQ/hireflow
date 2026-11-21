const BASE = '/api/art-contest';
const ZONE = 'America/Chicago';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 1024 * 1024;
const MAX_JSON_BYTES = 4096;
const TOKEN_SECONDS = 8 * 60 * 60;
const TERMS_VERSION = '2026-11-15-2';
const encoder = new TextEncoder();
const chicagoClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

class ApiError extends Error {
  constructor(status, code, message, retryAfter = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function parts(date) {
  return Object.fromEntries(chicagoClock.formatToParts(date)
    .filter(({ type }) => ['year', 'month', 'day', 'hour', 'minute'].includes(type))
    .map(({ type, value }) => [type, Number(value)]));
}

function dayString({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function nextDay(day) {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return next.toISOString().slice(0, 10);
}

function localToUtc(day, hour, minute = 0) {
  const [year, month, date] = day.split('-').map(Number);
  // These evening hours are never in the DST transition gap or overlap.
  for (const offsetHours of [5, 6]) {
    const candidate = new Date(Date.UTC(year, month - 1, date, hour + offsetHours, minute));
    const local = parts(candidate);
    if (dayString(local) === day && local.hour === hour && local.minute === minute) {
      return candidate.toISOString();
    }
  }
  throw new Error('Cannot resolve Chicago contest time');
}

export function contestSchedule(now = new Date()) {
  const local = parts(now);
  const today = dayString(local);
  const minutes = local.hour * 60 + local.minute;
  const phase = minutes < 18 * 60 ? 'open'
    : minutes < 20 * 60 + 30 ? 'judging'
      : minutes < 21 * 60 + 30 ? 'results_pending' : 'open';
  const contestDate = minutes >= 21 * 60 + 30 ? nextDay(today) : today;
  return {
    phase,
    contestDate,
    deadlineUtc: localToUtc(contestDate, 18),
    nextOpenUtc: localToUtc(minutes >= 21 * 60 + 30 ? nextDay(today) : today, 21, 30),
  };
}

function response(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...extra },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  return origin && origin === env.ALLOWED_ORIGIN
    ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
    : { 'Vary': 'Origin' };
}

function checkOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== env.ALLOWED_ORIGIN) {
    throw new ApiError(403, 'origin_forbidden', 'Origin is not allowed');
  }
}

async function boundedBody(request, maxBytes) {
  const length = request.headers.get('Content-Length');
  if (length && Number(length) > maxBytes) throw new ApiError(413, 'request_too_large', 'Request is too large');
  if (!request.body) throw new ApiError(400, 'empty_body', 'Request body is required');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, 'request_too_large', 'Request is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function jsonBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    throw new ApiError(415, 'content_type', 'Expected JSON');
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, MAX_JSON_BYTES)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'invalid_json', 'Invalid JSON object');
  }
}

function imageType(bytes) {
  const b = bytes;
  if (b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) return 'image/png';
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (b.length >= 6 && ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...b.slice(0, 6)))) return 'image/gif';
  return null;
}

function equalBytes(a, b) {
  if (a.length === b.length && typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(a, b);
  }
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

function requireSecrets(env) {
  if (!env.JUDGING_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new ApiError(503, 'not_configured', 'Judging secrets are not configured');
  }
}

async function rateLimit(request, env, now, kind, windowSeconds, maximum) {
  requireSecrets(env);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `${kind}:${base64url(await hmac(env.SESSION_SECRET, ip))}`;
  const seconds = Math.floor(now.getTime() / 1000);
  const bucket = Math.floor(seconds / windowSeconds) * windowSeconds;
  const row = await env.DB.prepare(`INSERT INTO rate_limits (key, bucket, attempts) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET bucket = excluded.bucket,
    attempts = CASE WHEN rate_limits.bucket = excluded.bucket THEN rate_limits.attempts + 1 ELSE 1 END
    RETURNING attempts`).bind(key, bucket).first();
  if (row.attempts > maximum) {
    throw new ApiError(429, 'rate_limited', 'Too many requests', bucket + windowSeconds - seconds);
  }
}

async function login(request, env, now) {
  requireSecrets(env);
  await rateLimit(request, env, now, 'login', 15 * 60, 10);
  const { password } = await jsonBody(request);
  if (typeof password !== 'string' || password.length > 1024) throw new ApiError(400, 'invalid_password', 'Invalid password');
  const [given, expected] = await Promise.all([digest(password), digest(env.JUDGING_PASSWORD)]);
  if (!equalBytes(given, expected)) throw new ApiError(401, 'invalid_credentials', 'Invalid credentials');
  const expiresAt = new Date(now.getTime() + TOKEN_SECONDS * 1000).toISOString();
  const payload = base64url(encoder.encode(JSON.stringify({ v: 1, exp: Math.floor(now.getTime() / 1000) + TOKEN_SECONDS,
    nonce: crypto.randomUUID() })));
  return { token: `${payload}.${base64url(await hmac(env.SESSION_SECRET, payload))}`, expiresAt };
}

async function requireAdmin(request, env, now) {
  requireSecrets(env);
  const match = /^Bearer ([A-Za-z0-9_-]{1,600}\.[A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '');
  if (!match) throw new ApiError(401, 'unauthorized', 'Bearer token required');
  const [payload, signature] = match[1].split('.');
  try {
    if (!equalBytes(fromBase64url(signature), await hmac(env.SESSION_SECRET, payload))) throw new Error('signature');
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    if (claims.v !== 1 || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(now.getTime() / 1000)) throw new Error('expired');
  } catch {
    throw new ApiError(401, 'unauthorized', 'Invalid or expired token');
  }
}

function publicWinner(row, origin) {
  return { id: row.submission_id, date: row.contest_date, name: row.name,
    imageUrl: `${origin}${BASE}/images/${row.submission_id}`, selectedAt: row.selected_at };
}

function publicRunnerUp(row, origin) {
  if (!row.runner_up_submission_id || row.runner_up_display_consent !== 1) return null;
  return { id: row.runner_up_submission_id, date: row.contest_date, name: row.runner_up_name,
    imageUrl: `${origin}${BASE}/images/${row.runner_up_submission_id}`, selectedAt: row.selected_at };
}

function publicSubmission(row, origin) {
  return { id: row.id, date: row.contest_date, name: row.name,
    imageUrl: `${origin}${BASE}/judging/images/${row.id}`, submittedAt: row.created_at,
    scores: row.beauty_score === null ? null : {
      beauty: row.beauty_score, creativity: row.creativity_score, complexity: row.complexity_score,
      total: row.beauty_score + row.creativity_score + row.complexity_score,
    } };
}

async function state(env, now, origin) {
  const schedule = contestSchedule(now);
  const { results } = await env.DB.prepare(`SELECT contest_date, submission_id, name, selected_at,
    runner_up_submission_id, runner_up_name, runner_up_display_consent
    FROM winners WHERE display_consent = 1 ORDER BY contest_date DESC`).all();
  const archive = results.map(row => {
    const winner = publicWinner(row, origin);
    const runnerUp = publicRunnerUp(row, origin);
    return { ...winner, runnerUp };
  });
  return { ...schedule, latestWinner: results[0] ? publicWinner(results[0], origin) : null,
    latestRunnerUp: results[0] ? publicRunnerUp(results[0], origin) : null, archive };
}

async function submit(request, env, now, currentTime) {
  const schedule = contestSchedule(now);
  if (schedule.phase !== 'open') throw new ApiError(409, 'submissions_closed', 'Submissions are closed');
  await rateLimit(request, env, now, 'submission', 60, 10);
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get('Content-Type') || '')) {
    throw new ApiError(415, 'content_type', 'Expected multipart form data');
  }
  const body = await boundedBody(request, MAX_REQUEST_BYTES);
  let form;
  try {
    form = await new Request('https://contest.invalid/', {
      method: 'POST', headers: { 'Content-Type': request.headers.get('Content-Type') }, body,
    }).formData();
  } catch {
    throw new ApiError(400, 'invalid_multipart', 'Invalid multipart form data');
  }
  if ([...form.keys()].some(key => !['name', 'image', 'termsAccepted', 'displayConsent'].includes(key))
    || ['name', 'image', 'termsAccepted', 'displayConsent'].some(key => form.getAll(key).length !== 1)) {
    throw new ApiError(400, 'invalid_fields', 'Expected one of each required field');
  }
  const name = form.get('name');
  const file = form.get('image');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new ApiError(400, 'invalid_name', 'Name must be 1 to 60 characters');
  }
  if (form.get('termsAccepted') !== 'true' || form.get('displayConsent') !== 'true') {
    throw new ApiError(400, 'consent_required', 'Rules, age 13+, and public winner display consent are required');
  }
  if (!file || typeof file.size !== 'number' || typeof file.arrayBuffer !== 'function'
    || file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(400, 'invalid_image', 'Image must be 1 byte to 8 MiB');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type || file.type !== type) {
    throw new ApiError(415, 'invalid_image_type', 'Image must be PNG, JPEG, WebP, or GIF with matching bytes');
  }
  const id = crypto.randomUUID();
  const key = `entries/${schedule.contestDate}/${id}`;
  await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: type } });
  try {
    const checkedAt = currentTime();
    const checkedSchedule = contestSchedule(checkedAt);
    if (checkedSchedule.contestDate !== schedule.contestDate || checkedSchedule.phase !== 'open') {
      throw new ApiError(409, 'submissions_closed', 'Submissions are closed');
    }
    const result = await env.DB.prepare(`INSERT INTO submissions
      (id, contest_date, name, image_key, image_type, created_at, terms_version, terms_accepted_at, display_consent)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1 WHERE ? < ?`)
      .bind(id, schedule.contestDate, name.trim(), key, type, checkedAt.toISOString(), TERMS_VERSION,
        checkedAt.toISOString(), Math.floor(checkedAt.getTime() / 1000),
        Math.floor(Date.parse(schedule.deadlineUtc) / 1000)).run();
    if (result.meta.changes !== 1) throw new ApiError(409, 'submissions_closed', 'Submissions are closed');
  } catch (error) {
    try {
      await env.IMAGES.delete(key);
    } catch (cleanupError) {
      // The upload was never accepted. Keep its private object on the retry
      // queue if possible instead of masking the original submission error.
      try {
        await env.DB.prepare('INSERT OR IGNORE INTO image_cleanup (image_key, created_at) VALUES (?, ?)')
          .bind(key, currentTime().toISOString()).run();
      } catch (queueError) {
        console.error(JSON.stringify({ event: 'orphan_cleanup_queue_failed', message: String(queueError) }));
      }
      console.error(JSON.stringify({ event: 'orphan_image_delete_failed', message: String(cleanupError) }));
    }
    throw error;
  }
  return { id, contestDate: schedule.contestDate, submittedAt: currentTime().toISOString() };
}

async function imageResponse(env, key, type) {
  const object = await env.IMAGES.get(key);
  if (!object) throw new ApiError(404, 'image_not_found', 'Image not found');
  return new Response(object.body, { headers: { 'Content-Type': type, 'Content-Disposition': 'inline',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function drainCleanup(env, limit = 100) {
  const { results } = await env.DB.prepare('SELECT image_key FROM image_cleanup ORDER BY created_at LIMIT ?').bind(limit).all();
  for (const row of results) {
    try {
      const retained = await env.DB.prepare(`SELECT 1 FROM winners
        WHERE image_key = ? OR runner_up_image_key = ? LIMIT 1`)
        .bind(row.image_key, row.image_key).first();
      if (retained) {
        await env.DB.prepare('DELETE FROM image_cleanup WHERE image_key = ?').bind(row.image_key).run();
        continue;
      }
      await env.IMAGES.delete(row.image_key);
      await env.DB.prepare('DELETE FROM image_cleanup WHERE image_key = ?').bind(row.image_key).run();
    } catch (error) {
      console.error(JSON.stringify({ event: 'image_cleanup_failed', message: String(error) }));
    }
  }
  return results.length;
}

export async function runMaintenance(env, now = new Date()) {
  const currentDate = contestSchedule(now).contestDate;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO image_cleanup (image_key, created_at)
      SELECT image_key, ? FROM submissions WHERE contest_date < ?`).bind(now.toISOString(), currentDate),
    env.DB.prepare('DELETE FROM submissions WHERE contest_date < ?').bind(currentDate),
  ]);
  await drainCleanup(env, 500);
  await env.DB.prepare('DELETE FROM rate_limits WHERE bucket < ?')
    .bind(Math.floor(now.getTime() / 1000) - 2 * 60 * 60).run();
}

async function deleteSubmission(env, id) {
  const row = await env.DB.prepare('SELECT id FROM submissions WHERE id = ?').bind(id).first();
  if (!row) throw new ApiError(404, 'submission_not_found', 'Submission not found');
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO image_cleanup (image_key, created_at) SELECT image_key, ? FROM submissions WHERE id = ?').bind(new Date().toISOString(), id),
    env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id),
  ]);
  try { await drainCleanup(env); }
  catch (error) { console.error(JSON.stringify({ event: 'image_cleanup_query_failed', message: String(error) })); }
  return { deleted: true };
}

async function scoreSubmission(env, id, scores, currentTime) {
  const scoredAt = currentTime();
  const schedule = contestSchedule(scoredAt);
  if (!['judging', 'results_pending'].includes(schedule.phase)) {
    throw new ApiError(409, 'judging_closed', 'Scoring is only available 18:00–21:30 Chicago time for today');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError(400, 'invalid_id', 'Invalid submission ID');
  }
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)
    || Object.keys(scores).sort().join(',') !== 'beauty,complexity,creativity'
    || !['beauty', 'creativity', 'complexity'].every(key => Number.isInteger(scores[key]) && scores[key] >= 0 && scores[key] <= 10)) {
    throw new ApiError(400, 'invalid_scores', 'Beauty, creativity, and complexity must be integers from 0 to 10');
  }
  const result = await env.DB.prepare(`UPDATE submissions SET beauty_score = ?, creativity_score = ?, complexity_score = ?
    WHERE id = ? AND contest_date = ? AND NOT EXISTS
      (SELECT 1 FROM winners WHERE contest_date = ?)`)
    .bind(scores.beauty, scores.creativity, scores.complexity, id, schedule.contestDate, schedule.contestDate).run();
  if (result.meta.changes !== 1) {
    if (await env.DB.prepare('SELECT 1 FROM winners WHERE contest_date = ?').bind(schedule.contestDate).first()) {
      throw new ApiError(409, 'winner_exists', 'Results are already final for this date');
    }
    throw new ApiError(404, 'submission_not_found', 'Submission not found for this date');
  }
  return { id, date: schedule.contestDate, scores: { ...scores,
    total: scores.beauty + scores.creativity + scores.complexity } };
}

async function selectWinner(env, id, date, currentTime, origin, expectedRunnerUpId, enforcePreview) {
  const selectedAt = currentTime();
  const schedule = contestSchedule(selectedAt);
  if (!['judging', 'results_pending'].includes(schedule.phase) || date !== schedule.contestDate) {
    throw new ApiError(409, 'judging_closed', 'Winner selection is only available 18:00–21:30 Chicago time for today');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, 'invalid_id', 'Invalid submission ID');
  if (await env.DB.prepare('SELECT submission_id FROM winners WHERE contest_date = ?').bind(date).first()) {
    throw new ApiError(409, 'winner_exists', 'A winner already exists for this date');
  }
  const candidate = await env.DB.prepare(`SELECT id AS submission_id, contest_date, name,
    beauty_score + creativity_score + complexity_score AS total
    FROM submissions WHERE id = ? AND contest_date = ? AND display_consent = 1`)
    .bind(id, date).first();
  if (!candidate) throw new ApiError(404, 'submission_not_found', 'Submission not found for this date');
  const unscored = await env.DB.prepare(`SELECT 1 FROM submissions WHERE contest_date = ?
    AND (beauty_score IS NULL OR creativity_score IS NULL OR complexity_score IS NULL) LIMIT 1`).bind(date).first();
  if (unscored) throw new ApiError(409, 'scores_incomplete', 'Score every submission before selecting a winner');
  const tied = await env.DB.prepare(`SELECT 1 FROM submissions WHERE contest_date = ?
    GROUP BY beauty_score + creativity_score + complexity_score HAVING COUNT(*) > 1 LIMIT 1`)
    .bind(date).first();
  if (tied) throw new ApiError(409, 'scores_tied', 'Resolve all tied total scores before submitting results');
  const highest = await env.DB.prepare(`SELECT MAX(beauty_score + creativity_score + complexity_score) AS total
    FROM submissions WHERE contest_date = ?`).bind(date).first();
  if (candidate.total !== highest.total) throw new ApiError(409, 'lower_score', 'Winner must have the highest total score');
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO winners
        (contest_date, submission_id, name, image_key, image_type, selected_at, terms_version,
         terms_accepted_at, display_consent, runner_up_submission_id, runner_up_name,
         runner_up_image_key, runner_up_image_type, runner_up_terms_version,
         runner_up_terms_accepted_at, runner_up_display_consent)
        SELECT chosen.contest_date, chosen.id, chosen.name, chosen.image_key, chosen.image_type, ?,
          chosen.terms_version, chosen.terms_accepted_at, chosen.display_consent,
          second.id, second.name, second.image_key, second.image_type, second.terms_version,
          second.terms_accepted_at, second.display_consent
        FROM submissions AS chosen
        LEFT JOIN submissions AS second ON second.id = (
          SELECT id FROM submissions WHERE contest_date = ? AND id <> chosen.id AND display_consent = 1
          ORDER BY beauty_score + creativity_score + complexity_score DESC, created_at ASC, id ASC LIMIT 1)
        WHERE chosen.id = ? AND chosen.contest_date = ? AND chosen.display_consent = 1
          AND chosen.beauty_score IS NOT NULL AND chosen.creativity_score IS NOT NULL
          AND chosen.complexity_score IS NOT NULL
          AND chosen.beauty_score + chosen.creativity_score + chosen.complexity_score =
            (SELECT MAX(beauty_score + creativity_score + complexity_score) FROM submissions WHERE contest_date = ?)
          AND NOT EXISTS (SELECT 1 FROM submissions WHERE contest_date = ?
            AND (beauty_score IS NULL OR creativity_score IS NULL OR complexity_score IS NULL))
          AND NOT EXISTS (SELECT 1 FROM submissions WHERE contest_date = ?
            GROUP BY beauty_score + creativity_score + complexity_score HAVING COUNT(*) > 1)
          AND (? = 0 OR COALESCE(second.id, '') = ?)
          AND NOT EXISTS (SELECT 1 FROM winners WHERE contest_date = ?)`)
        .bind(selectedAt.toISOString(), date, id, date, date, date, date,
          enforcePreview ? 1 : 0, expectedRunnerUpId || '', date),
      env.DB.prepare(`INSERT OR IGNORE INTO image_cleanup (image_key, created_at)
        SELECT image_key, ? FROM submissions WHERE contest_date = ? AND id <> ?
        AND id <> COALESCE((SELECT runner_up_submission_id FROM winners WHERE contest_date = ?), '')
        AND EXISTS (SELECT 1 FROM winners WHERE contest_date = ? AND submission_id = ?)`)
        .bind(selectedAt.toISOString(), date, id, date, date, id),
      env.DB.prepare(`DELETE FROM submissions WHERE contest_date = ?
        AND EXISTS (SELECT 1 FROM winners WHERE contest_date = ? AND submission_id = ?)`)
        .bind(date, date, id),
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error))) throw new ApiError(409, 'winner_exists', 'A winner already exists for this date');
    throw error;
  }
  if (results[0].meta.changes !== 1) throw new ApiError(409, 'selection_changed', 'Scores or submissions changed; review and retry');
  try { await drainCleanup(env); }
  catch (error) { console.error(JSON.stringify({ event: 'image_cleanup_query_failed', message: String(error) })); }
  const selected = await env.DB.prepare(`SELECT contest_date, submission_id, name, selected_at,
    runner_up_submission_id, runner_up_name, runner_up_display_consent FROM winners WHERE contest_date = ?`)
    .bind(date).first();
  return { winner: publicWinner(selected, origin), runnerUp: publicRunnerUp(selected, origin) };
}

export async function handleRequest(request, env, now = new Date(), currentTime = () => new Date()) {
  const headers = corsHeaders(request, env);
  try {
    if (!env.DB || !env.IMAGES || !env.ALLOWED_ORIGIN) throw new ApiError(503, 'not_configured', 'Contest bindings are not configured');
    const url = new URL(request.url);
    const origin = url.origin;
    const path = url.pathname.replace(/\/$/, '');
    if (path !== BASE && !path.startsWith(`${BASE}/`)) throw new ApiError(404, 'not_found', 'Not found');
    if (request.method === 'OPTIONS') {
      checkOrigin(request, env);
      return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' } });
    }
    if (request.method !== 'GET') checkOrigin(request, env);
    const subpath = path.slice(BASE.length);
    if (request.method === 'GET' && subpath === '/state') return response(await state(env, now, origin), 200, headers);
    if (request.method === 'POST' && subpath === '/submissions') return response(await submit(request, env, now, currentTime), 201, headers);
    if (request.method === 'POST' && subpath === '/judging/login') return response(await login(request, env, now), 200, headers);
    if (request.method === 'GET' && subpath === '/judging/submissions') {
      await requireAdmin(request, env, now);
      const contestDate = contestSchedule(now).contestDate;
      const { results } = await env.DB.prepare(`SELECT id, contest_date, name, created_at,
        beauty_score, creativity_score, complexity_score FROM submissions
        WHERE contest_date = ? ORDER BY created_at ASC`).bind(contestDate).all();
      const winner = await env.DB.prepare(`SELECT submission_id, name, runner_up_submission_id, runner_up_name
        FROM winners WHERE contest_date = ?`).bind(contestDate).first();
      return response({ submissions: results.map(row => publicSubmission(row, origin)),
        winnerId: winner?.submission_id || null, winnerName: winner?.name || null,
        runnerUpId: winner?.runner_up_submission_id || null,
        runnerUpName: winner?.runner_up_name || null }, 200, headers);
    }
    const adminImage = /^\/judging\/images\/([0-9a-f-]+)$/i.exec(subpath);
    if (request.method === 'GET' && adminImage) {
      await requireAdmin(request, env, now);
      const row = await env.DB.prepare(`SELECT image_key, image_type FROM submissions WHERE id = ?
        UNION ALL SELECT image_key, image_type FROM winners WHERE submission_id = ?
        UNION ALL SELECT runner_up_image_key AS image_key, runner_up_image_type AS image_type
        FROM winners WHERE runner_up_submission_id = ? LIMIT 1`)
        .bind(adminImage[1], adminImage[1], adminImage[1]).first();
      if (!row) throw new ApiError(404, 'submission_not_found', 'Submission not found');
      const image = await imageResponse(env, row.image_key, row.image_type);
      for (const [key, value] of Object.entries(headers)) image.headers.set(key, value);
      return image;
    }
    const adminDelete = /^\/judging\/submissions\/([0-9a-f-]+)$/i.exec(subpath);
    if (request.method === 'DELETE' && adminDelete) {
      await requireAdmin(request, env, now);
      return response(await deleteSubmission(env, adminDelete[1]), 200, headers);
    }
    const adminScore = /^\/judging\/submissions\/([0-9a-f-]+)\/scores$/i.exec(subpath);
    if (request.method === 'PUT' && adminScore) {
      await requireAdmin(request, env, now);
      return response(await scoreSubmission(env, adminScore[1], await jsonBody(request), currentTime), 200, headers);
    }
    if (request.method === 'POST' && subpath === '/judging/winners') {
      await requireAdmin(request, env, now);
      const body = await jsonBody(request);
      const { id, date, expectedRunnerUpId } = body;
      if (typeof id !== 'string' || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new ApiError(400, 'invalid_winner', 'Expected id and date (YYYY-MM-DD)');
      }
      if (Object.hasOwn(body, 'expectedRunnerUpId') && expectedRunnerUpId !== null
        && (typeof expectedRunnerUpId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedRunnerUpId))) {
        throw new ApiError(400, 'invalid_runner_up', 'Expected runner-up ID or null');
      }
      return response(await selectWinner(env, id, date, currentTime, origin,
        expectedRunnerUpId, Object.hasOwn(body, 'expectedRunnerUpId')), 201, headers);
    }
    const winnerImage = /^\/images\/([0-9a-f-]+)$/i.exec(subpath);
    if (request.method === 'GET' && winnerImage) {
      const row = await env.DB.prepare(`SELECT image_key, image_type FROM winners
        WHERE submission_id = ? AND display_consent = 1
        UNION ALL SELECT runner_up_image_key AS image_key, runner_up_image_type AS image_type
        FROM winners WHERE runner_up_submission_id = ? AND runner_up_display_consent = 1 LIMIT 1`)
        .bind(winnerImage[1], winnerImage[1]).first();
      if (!row) throw new ApiError(404, 'winner_not_found', 'Winner not found');
      const image = await imageResponse(env, row.image_key, row.image_type);
      for (const [key, value] of Object.entries(headers)) image.headers.set(key, value);
      return image;
    }
    throw new ApiError(404, 'not_found', 'Not found');
  } catch (error) {
    if (!(error instanceof ApiError)) console.error(JSON.stringify({ event: 'contest_api_error', message: String(error) }));
    const apiError = error instanceof ApiError ? error : new ApiError(500, 'internal_error', 'Internal error');
    return response({ error: { code: apiError.code, message: apiError.message } }, apiError.status,
      apiError.retryAfter ? { ...headers, 'Retry-After': String(apiError.retryAfter) } : headers);
  }
}

export default {
  fetch(request, env) { return handleRequest(request, env); },
  async scheduled(_event, env) { await runMaintenance(env); },
};
