(() => {
  'use strict';

  function configuredApiBase() {
    const raw = window.ATOM_CONTEST_API_BASE;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try {
      const url = new URL(raw.trim(), location.origin);
      if (!/^https?:$/.test(url.protocol) || url.search || url.hash) return null;
      if (url.pathname === '/' || url.pathname === '') url.pathname = '/api/art-contest';
      if (url.pathname.replace(/\/$/, '') !== '/api/art-contest') return null;
      return `${url.origin}/api/art-contest`;
    } catch { return null; }
  }
  const API = configuredApiBase();
  const CENTRAL = 'America/Chicago';
  const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);
  const form = $('entry-form');
  const fields = $('entry-fields');
  const fileInput = $('art-image');
  const review = $('review-panel');
  let previewUrl = null;
  let state = null;
  let submitting = false;
  let stateRequest = null;
  let lastStateAttempt = 0;

  $('yr').textContent = new Date().getFullYear();

  function setMessage(element, text, kind = 'error') {
    element.textContent = text;
    element.dataset.kind = kind;
    element.hidden = !text;
  }

  function apiError(response, body) {
    if (response.status === 401 || response.status === 403) return 'This action is not authorized.';
    if (response.status === 413) return 'That image is too large for the contest server. Choose a smaller file.';
    if (response.status === 415) return 'The contest server did not accept this image format.';
    if (response.status === 429) return 'Please wait a moment before trying again.';
    if (body && typeof body.error?.message === 'string' && body.error.message.length < 250) return body.error.message;
    return `The contest server could not complete this request (${response.status}). Please try again.`;
  }

  async function request(url, options = {}) {
    if (!API) throw new Error('The contest API has not been configured. Entries and winners are unavailable.');
    let response;
    try {
      response = await fetch(url, { cache: 'no-store', credentials: 'omit', ...options });
    } catch {
      throw new Error('The contest service is unavailable. Please try again later.');
    }
    const isJson = response.headers.get('content-type')?.includes('application/json');
    let body = null;
    if (isJson) {
      try { body = await response.json(); } catch { throw new Error('The contest server returned an unreadable response.'); }
    }
    if (!response.ok) throw new Error(apiError(response, body));
    if (!isJson && response.status !== 204) throw new Error('The contest service is unavailable. Please try again later.');
    return body;
  }

  function dateFromUtc(value) {
    if (typeof value !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/i.test(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function scheduleTime(value, timeZone) {
    const date = dateFromUtc(value);
    if (!date) return null;
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
  }

  function dayLabel(value) {
    if (typeof value !== 'string') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(`${value}T12:00:00Z`);
      if (Number.isNaN(date.getTime())) return null;
      return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
    }
    const date = dateFromUtc(value);
    return date ? new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, year: 'numeric', month: 'long', day: 'numeric' }).format(date) : null;
  }

  function safeImageUrl(value) {
    if (!API || typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, `${API}/`);
      const approved = /^\/api\/art-contest\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname);
      return url.origin === new URL(API).origin && approved && !url.search && !url.hash && /^https?:$/.test(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  function setStatus(kind, title, detail) {
    const strip = $('state-strip');
    strip.dataset.kind = kind;
    $('state-title').textContent = title;
    $('state-detail').textContent = detail;
    $('state-retry').hidden = kind !== 'error';
    $('entry-status').textContent = kind === 'open' ? 'Entries open' : kind === 'closed' ? 'Entries closed' : 'Unavailable';
  }

  function renderSchedule(data) {
    const isOpen = data.phase === 'open';
    const timestamp = isOpen ? data.deadlineUtc : data.nextOpenUtc;
    const central = scheduleTime(timestamp, CENTRAL);
    const utc = scheduleTime(timestamp, 'UTC');
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const local = localZone && localZone !== CENTRAL ? scheduleTime(timestamp, localZone) : null;
    if (central) {
      $('schedule-primary').textContent = `${isOpen ? 'Entries close' : 'Next opening'}: ${central}`;
      $('schedule-secondary').textContent = [utc ? `UTC: ${utc}` : '', local ? `Your time: ${local}` : ''].filter(Boolean).join('; ') || 'Times are shown in Central time.';
    } else {
      $('schedule-primary').textContent = isOpen ? 'Entries are open' : 'Entries are closed';
      $('schedule-secondary').textContent = 'The contest server has not published a schedule time yet.';
    }
  }

  function renderWinner(winner) {
    const image = $('winner-image');
    const url = safeImageUrl(winner?.imageUrl);
    if (!winner || !url) {
      image.hidden = true;
      image.removeAttribute('src');
      $('winner-placeholder').hidden = false;
      if (winner?.name) $('winner-name').setAttribute('data-i18n-ignore', '');
      else $('winner-name').removeAttribute('data-i18n-ignore');
      $('winner-name').textContent = winner?.name || 'Waiting for the first spotlight';
      $('winner-date').textContent = winner
        ? `${dayLabel(winner.date) || 'Selected daily winner'}, image unavailable`
        : 'The latest selected winner will appear here when the contest server has one.';
      return;
    }
    image.src = url;
    image.alt = `Artwork by ${winner.name || 'the daily winner'}`;
    image.hidden = false;
    image.onerror = () => { image.hidden = true; $('winner-placeholder').hidden = false; };
    $('winner-placeholder').hidden = true;
    if (winner.name) $('winner-name').setAttribute('data-i18n-ignore', '');
    else $('winner-name').removeAttribute('data-i18n-ignore');
    $('winner-name').textContent = winner.name || 'Daily winner';
    $('winner-date').textContent = dayLabel(winner.date) || 'Selected daily winner';
  }

  function renderRunnerUp(runnerUp) {
    const image = $('runner-image');
    const placeholder = $('runner-placeholder');
    const url = safeImageUrl(runnerUp?.imageUrl);
    image.hidden = !url;
    placeholder.hidden = !!url;
    if (url) {
      image.src = url;
      image.alt = `Runner-up artwork by ${runnerUp.name || 'an artist'}`;
      image.onerror = () => { image.hidden = true; placeholder.hidden = false; };
    } else {
      image.removeAttribute('src');
    }
    $('runner-name').toggleAttribute('data-i18n-ignore', !!runnerUp?.name);
    $('runner-name').textContent = runnerUp?.name || 'Awaiting a runner-up';
    $('runner-date').textContent = runnerUp ? dayLabel(runnerUp.date) || '' : '';
  }

  function renderArchive(archive) {
    const grid = $('archive-grid');
    grid.replaceChildren();
    const entries = Array.isArray(archive) ? archive : [];
    let count = 0;
    for (const winner of entries) {
      for (const [entry, rank] of [[winner, 'Daily winner'], [winner?.runnerUp, 'Runner-up']]) {
        const url = safeImageUrl(entry?.imageUrl);
        if (!url) continue;
        const card = document.createElement('article');
        card.className = 'archive-item';
        const image = document.createElement('img');
        image.src = url;
        image.alt = `${rank} artwork by ${entry.name || 'an artist'}`;
        image.loading = 'lazy';
        const info = document.createElement('div');
        const label = document.createElement('span');
        label.className = 'archive-rank';
        label.textContent = rank;
        const name = document.createElement('strong');
        name.setAttribute('data-i18n-ignore', '');
        const date = document.createElement('span');
        name.textContent = entry.name || 'Contest artist';
        date.textContent = dayLabel(entry.date) || '';
        info.append(label, name, date);
        card.append(image, info);
        grid.append(card);
        count++;
      }
    }
    if (!count) {
      const empty = document.createElement('p');
      empty.className = 'archive-empty';
      empty.textContent = entries.length ? 'Archived images are unavailable right now.' : 'No art has been published yet. Check back soon.';
      grid.append(empty);
    }
  }

  function loadState(force = false) {
    if (stateRequest) return stateRequest;
    if (!force && Date.now() - lastStateAttempt < 60_000) return Promise.resolve();
    lastStateAttempt = Date.now();
    stateRequest = loadStateOnce().finally(() => { stateRequest = null; });
    return stateRequest;
  }

  async function loadStateOnce() {
    fields.disabled = true;
    $('state-retry').hidden = true;
    try {
      const data = await request(`${API}/state`);
      if (!data || !['open', 'judging', 'results_pending'].includes(data.phase)
        || !Array.isArray(data.archive) || !Object.hasOwn(data, 'latestWinner')) {
        throw new Error('The contest server returned an incomplete state. Please try again later.');
      }
      state = data;
      renderSchedule(data);
      renderWinner(data.latestWinner);
      renderRunnerUp(data.latestRunnerUp || data.latestWinner?.runnerUp || null);
      renderArchive(data.archive);
      const deadline = dateFromUtc(data.deadlineUtc);
      const entriesOpen = data.phase === 'open' && (!deadline || deadline.getTime() > Date.now());
      if (entriesOpen) {
        fields.disabled = submitting;
        setStatus('open', 'Entries are open', 'Share your artwork before the deadline shown below. Review it before you submit.');
      } else {
        setStatus('closed', data.phase === 'judging' ? 'Judging is underway' : data.phase === 'results_pending' ? 'Today’s result is pending' : 'Entries are closed', 'The next opening is shown in the schedule below when available.');
        if (!review.hidden) { review.hidden = true; form.hidden = false; setMessage($('form-message'), 'Entries have closed. Please return when the next contest opens.'); }
      }
    } catch (error) {
      state = null;
      fields.disabled = true;
      review.hidden = true;
      form.hidden = false;
      $('schedule-primary').textContent = 'Live status unavailable';
      $('schedule-secondary').textContent = 'Normal daily times are listed below. The server must confirm that entries are open.';
      $('winner-name').textContent = 'Winner unavailable';
      $('winner-name').removeAttribute('data-i18n-ignore');
      $('winner-date').textContent = 'The latest winner will appear when the contest service is available.';
      $('winner-image').hidden = true;
      $('winner-image').removeAttribute('src');
      $('winner-placeholder').hidden = false;
      renderRunnerUp(null);
      $('archive-grid').innerHTML = '<p class="archive-empty">The art archive is unavailable right now.</p>';
      setStatus('error', 'Contest submissions are not available yet', error.message || 'Please try again later.');
    }
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    $('preview').hidden = true;
    $('preview-image').removeAttribute('src');
    $('review-image').removeAttribute('src');
    $('preview-file-name').textContent = '';
    $('upload-name').textContent = 'One image per entry';
  }

  fileInput.addEventListener('change', () => {
    clearPreview();
    setMessage($('form-message'), '');
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!MIME_TYPES.has(file.type)) {
      fileInput.value = '';
      setMessage($('form-message'), 'Choose a JPG, PNG, WebP, or GIF image.');
      return;
    }
    if (!file.size || file.size > MAX_IMAGE_BYTES) {
      fileInput.value = '';
      setMessage($('form-message'), 'Choose an image larger than zero bytes and no more than 8 MiB.');
      return;
    }
    previewUrl = URL.createObjectURL(file);
    const image = $('preview-image');
    image.onerror = () => {
      fileInput.value = '';
      clearPreview();
      setMessage($('form-message'), 'This image could not be previewed. Choose another file.');
    };
    image.src = previewUrl;
    $('preview-file-name').textContent = file.name;
    $('upload-name').textContent = file.name;
    $('preview').hidden = false;
  });

  $('remove-image').addEventListener('click', () => { fileInput.value = ''; clearPreview(); fileInput.click(); });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    setMessage($('form-message'), '');
    if (!state || state.phase !== 'open' || fields.disabled) return;
    const deadline = dateFromUtc(state.deadlineUtc);
    if (deadline && deadline.getTime() <= Date.now()) { loadState(true); return; }
    if (!form.reportValidity()) return;
    const name = $('artist-name').value.trim();
    const file = fileInput.files?.[0];
    if (!name || !file || !MIME_TYPES.has(file.type) || !previewUrl) {
      setMessage($('form-message'), 'Add a display name and a supported image before reviewing.');
      return;
    }
    if (!$('terms-accepted').checked || !$('display-consent').checked) {
      setMessage($('form-message'), 'Please agree to the rules and display consent before reviewing.');
      return;
    }
    $('review-name').setAttribute('data-i18n-ignore', '');
    $('review-name').textContent = name;
    $('review-filename').textContent = file.name;
    $('review-image').src = previewUrl;
    setMessage($('review-message'), '');
    form.hidden = true;
    review.hidden = false;
    review.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('edit-entry').addEventListener('click', () => {
    review.hidden = true;
    form.hidden = false;
    $('artist-name').focus();
  });

  $('confirm-submit').addEventListener('click', async () => {
    if (submitting) return;
    if (!state || state.phase !== 'open') { setMessage($('review-message'), 'Entries are not open right now.'); return; }
    const file = fileInput.files?.[0];
    const name = $('artist-name').value.trim();
    if (!name || !file || !MIME_TYPES.has(file.type) || !$('terms-accepted').checked || !$('display-consent').checked) {
      setMessage($('review-message'), 'Your entry changed. Please edit it and review again.');
      return;
    }
    const body = new FormData();
    body.append('name', name);
    body.append('image', file);
    body.append('termsAccepted', 'true');
    body.append('displayConsent', 'true');
    submitting = true;
    $('confirm-submit').disabled = true;
    $('edit-entry').disabled = true;
    setMessage($('review-message'), '');
    try {
      const result = await request(`${API}/submissions`, { method: 'POST', body });
      if (typeof result?.id !== 'string' || typeof result?.contestDate !== 'string') {
        throw new Error('The contest server did not confirm this submission. Please check with atomEDU before trying again.');
      }
      review.hidden = true;
      form.hidden = false;
      form.reset();
      clearPreview();
      setMessage($('form-message'), 'Your artwork was submitted. Thank you for sharing it!', 'success');
      await loadState(true);
      $('form-message').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      setMessage($('review-message'), error.message || 'Submission failed. Please try again.');
    } finally {
      submitting = false;
      $('confirm-submit').disabled = false;
      $('edit-entry').disabled = false;
      if (state?.phase === 'open' && review.hidden) fields.disabled = false;
    }
  });

  $('state-retry').addEventListener('click', () => loadState(true));
  window.addEventListener('beforeunload', clearPreview);
  window.setInterval(() => { if (!document.hidden) loadState(); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadState(); });
  loadState(true);
})();
