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
  const $ = (id) => document.getElementById(id);
  let token = '';
  let busy = false;
  let imageRun = 0;
  let imageController = null;
  const imageObjects = new Set();
  let currentEntries = [];
  let currentPhase = '';
  let preview = null;

  function centralToday() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function dateLabel(value) {
    if (!validDate(value)) return value || '-';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
  }

  function safeImageUrl(value) {
    if (!API || typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, `${API}/`);
      const approved = /^\/api\/art-contest\/judging\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname);
      return url.origin === new URL(API).origin && approved && !url.search && !url.hash && /^https?:$/.test(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  function setMessage(element, text, kind = 'error') {
    element.textContent = text;
    element.dataset.kind = kind;
    element.hidden = !text;
  }

  async function request(path, options = {}, authorized = false) {
    if (!API) throw new Error('The contest API has not been configured. Judging is unavailable.');
    if (authorized && !token) throw new Error('Sign in to judge this contest.');
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        cache: 'no-store',
        credentials: 'omit',
        ...options,
        headers: { ...(authorized ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
      });
    } catch {
      throw new Error('The judging service is unavailable. Please try again later.');
    }
    const json = response.headers.get('content-type')?.includes('application/json');
    let body = null;
    if (json) {
      try { body = await response.json(); } catch { throw new Error('The judging server returned an unreadable response.'); }
    }
    if (response.status === 401 || response.status === 403) {
      const error = new Error(authorized ? 'Your judging session expired or is not authorized. Sign in again.' : 'The password was not accepted by the contest server.');
      error.unauthorized = authorized;
      throw error;
    }
    if (!response.ok) {
      const message = typeof body?.error?.message === 'string' && body.error.message.length < 250 ? body.error.message : `The judging server could not complete this request (${response.status}).`;
      throw new Error(message);
    }
    if (!json && response.status !== 204) throw new Error('The judging service is unavailable. Please try again later.');
    return body;
  }

  function setBusy(value) {
    busy = value;
    for (const id of ['login-button', 'load-date', 'refresh-judging', 'sign-out']) $(id).disabled = value;
    $('submit-scores').disabled = value;
    $('confirm-results').disabled = value;
    $('submission-list').querySelectorAll('button').forEach((button) => { button.disabled = value || button.dataset.locked === 'true'; });
  }

  function revokeImages() {
    imageRun++;
    imageController?.abort();
    imageController = null;
    for (const url of imageObjects) URL.revokeObjectURL(url);
    imageObjects.clear();
  }

  async function loadPrivateImage(value, image, placeholder, run, signal) {
    const url = safeImageUrl(value);
    if (!url) { placeholder.textContent = 'Image unavailable'; return; }
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store', signal });
      if (response.status === 401 || response.status === 403) {
        if (run === imageRun) signOut('Your judging session expired. Sign in again.');
        return;
      }
      if (!response.ok || !/^image\/(png|jpeg|webp|gif)(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Image unavailable');
      const blob = await response.blob();
      if (signal.aborted || run !== imageRun) return;
      const objectUrl = URL.createObjectURL(blob);
      imageObjects.add(objectUrl);
      image.onerror = () => { image.hidden = true; placeholder.hidden = false; placeholder.textContent = 'Image could not be displayed'; };
      image.src = objectUrl;
      image.hidden = false;
      placeholder.hidden = true;
    } catch {
      if (!signal.aborted && run === imageRun) placeholder.textContent = 'Image unavailable';
    }
  }

  function clearEntries(message) {
    closePreview();
    revokeImages();
    currentEntries = [];
    currentPhase = '';
    $('judge-submit-bar').hidden = true;
    $('summary-date').textContent = '-';
    $('summary-count').textContent = '-';
    $('summary-winner').textContent = '-';
    $('summary-runner-up').textContent = '-';
    $('list-caption').textContent = message;
    $('submission-list').replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'judge-empty';
    empty.textContent = message;
    $('submission-list').append(empty);
  }

  function signOut(message = '') {
    token = '';
    $('judge-password').value = '';
    $('dashboard').hidden = true;
    $('login-panel').hidden = false;
    setMessage($('dashboard-message'), '');
    setMessage($('login-message'), message);
    clearEntries('Sign in to view submissions.');
  }

  function formatSubmittedDate(value) {
    if (typeof value !== 'string') return 'Date unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    return new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, month: 'short', day: 'numeric' }).format(date);
  }

  function tiedTotals(entries) {
    const counts = new Map();
    for (const entry of entries) {
      const total = entry.scores?.total;
      if (Number.isInteger(total)) counts.set(total, (counts.get(total) || 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([total]) => total));
  }

  function renderEntries(data, requestedDate, phase) {
    if (!data || !Array.isArray(data.submissions)) throw new Error('The judging server returned an incomplete list of submissions.');
    const submissions = data.submissions;
    for (const entry of submissions) {
      if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string' || entry.date !== requestedDate) {
        throw new Error('The judging server returned an invalid submission.');
      }
    }
    const allScored = submissions.length > 0 && submissions.every((entry) => Number.isInteger(entry.scores?.total));
    const tied = tiedTotals(submissions);
    currentEntries = submissions;
    currentPhase = phase;
    $('judge-submit-bar').hidden = !allScored || !!data.winnerId || !['judging', 'results_pending'].includes(phase);
    $('judge-submit-bar').dataset.tied = tied.size ? 'true' : 'false';
    $('judge-submit-bar').querySelector('p').textContent = tied.size
      ? 'Tied totals are highlighted in red. Review and save different scores before submitting.'
      : 'All entries are scored. Results stay private until you confirm.';
    revokeImages();
    imageController = new AbortController();
    const run = imageRun;
    $('summary-date').textContent = dateLabel(requestedDate);
    $('summary-count').textContent = String(submissions.length);
    const winner = submissions.find((entry) => String(entry.id) === String(data.winnerId));
    $('summary-winner').toggleAttribute('data-i18n-ignore', typeof data.winnerName === 'string' && !!data.winnerName);
    $('summary-winner').textContent = typeof data.winnerName === 'string' && data.winnerName
      ? data.winnerName : winner ? winner.name : data.winnerId === null ? 'Not selected' : 'Status not provided';
    $('summary-runner-up').toggleAttribute('data-i18n-ignore', !!data.runnerUpName);
    $('summary-runner-up').textContent = data.runnerUpName || 'Not selected';
    $('list-caption').textContent = `${submissions.length} ${submissions.length === 1 ? 'entry' : 'entries'} for ${dateLabel(requestedDate)}`;
    const list = $('submission-list');
    list.replaceChildren();
    if (!submissions.length) {
      const empty = document.createElement('p');
      empty.className = 'judge-empty';
      empty.textContent = data.winnerName ? 'No submissions remain for this date. The selected winner is shown above.' : 'No submissions for this date.';
      list.append(empty);
      return;
    }
    for (const entry of submissions) {
      const card = document.createElement('article');
      card.className = 'judge-card';
      const isWinner = String(entry.id) === String(data.winnerId);
      const isRunnerUp = String(entry.id) === String(data.runnerUpId);
      if (isWinner) card.classList.add('is-winner');
      if (isRunnerUp) card.classList.add('is-runner-up');
      const image = document.createElement('img');
      image.className = 'judge-image';
      image.alt = `Submission by ${entry.name}`;
      image.hidden = true;
      const placeholder = document.createElement('div');
      placeholder.className = 'judge-image-placeholder';
      placeholder.textContent = 'Loading private image…';
      card.append(image, placeholder);
      loadPrivateImage(entry.imageUrl, image, placeholder, run, imageController.signal);
      const body = document.createElement('div');
      body.className = 'judge-card-body';
      const top = document.createElement('div');
      top.className = 'judge-card-top';
      const title = document.createElement('h3');
      title.setAttribute('data-i18n-ignore', '');
      title.textContent = entry.name;
      top.append(title);
      if (isWinner) {
        const badge = document.createElement('span');
        badge.textContent = 'WINNER ✳';
        top.append(badge);
      } else if (isRunnerUp) {
        const badge = document.createElement('span');
        badge.textContent = 'RUNNER-UP';
        top.append(badge);
      }
      const meta = document.createElement('p');
      meta.textContent = `Submitted ${formatSubmittedDate(entry.submittedAt)}`;
      const scoreForm = document.createElement('form');
      scoreForm.className = 'score-form';
      scoreForm.addEventListener('input', () => { $('judge-submit-bar').hidden = true; });
      const scoreInputs = {};
      for (const criterion of ['beauty', 'creativity', 'complexity']) {
        const label = document.createElement('label');
        label.textContent = `${criterion[0].toUpperCase()}${criterion.slice(1)} / 10`;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '10';
        input.step = '1';
        input.required = true;
        input.value = Number.isInteger(entry.scores?.[criterion]) ? String(entry.scores[criterion]) : '';
        input.disabled = !!data.winnerId || !['judging', 'results_pending'].includes(phase);
        label.append(input);
        scoreForm.append(label);
        scoreInputs[criterion] = input;
      }
      const total = document.createElement('span');
      total.className = 'score-total';
      total.textContent = Number.isInteger(entry.scores?.total) ? `Total: ${entry.scores.total} / 30` : 'Not scored yet';
      if (tied.has(entry.scores?.total)) {
        total.classList.add('is-tied');
        total.setAttribute('aria-label', `Tied total: ${entry.scores.total} out of 30`);
        total.title = 'This total is tied with another entry. Review and save scores before submitting.';
      }
      const scoreButton = document.createElement('button');
      scoreButton.type = 'submit';
      scoreButton.textContent = 'Save scores';
      scoreButton.disabled = !!data.winnerId || !['judging', 'results_pending'].includes(phase);
      scoreForm.append(scoreButton);
      scoreForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!scoreForm.reportValidity()) return;
        const scores = Object.fromEntries(Object.entries(scoreInputs).map(([key, input]) => [key, Number(input.value)]));
        if (Object.values(scores).some((score) => !Number.isInteger(score) || score < 0 || score > 10)) {
          setMessage($('dashboard-message'), 'Enter whole-number scores from 0 to 10 in all three categories.');
          return;
        }
        changeEntry(`/judging/submissions/${encodeURIComponent(entry.id)}/scores`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scores),
        }, `Scores saved for ${entry.name}.`, (result) => result?.scores?.total === scores.beauty + scores.creativity + scores.complexity);
      });
      const actions = document.createElement('div');
      actions.className = 'judge-card-actions';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-entry';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete submission by ${entry.name}`);
      remove.addEventListener('click', () => deleteEntry(entry, requestedDate));
      actions.append(total, remove);
      body.append(top, meta, scoreForm, actions);
      card.append(body);
      list.append(card);
    }
  }

  async function loadEntries(syncDate = false) {
    if (!token || busy) return false;
    setBusy(true);
    setMessage($('dashboard-message'), 'Loading entries from the contest server…', 'info');
    clearEntries('Loading submissions…');
    try {
      const state = await request('/state');
      if (!validDate(state?.contestDate)) throw new Error('The contest server did not provide a valid live date.');
      if (syncDate || !$('contest-date').value) $('contest-date').value = state.contestDate;
      const date = $('contest-date').value;
      if (!validDate(date)) throw new Error('Choose a valid contest date.');
      if (date !== state.contestDate) {
        setMessage($('dashboard-message'), `The judging API only provides the live contest date, ${dateLabel(state.contestDate)}. Choose that date or select Sync live date.`, 'info');
        clearEntries('This date is not available from the judging API.');
        return false;
      }
      const data = await request('/judging/submissions', {}, true);
      renderEntries(data, date, state.phase);
      $('login-panel').hidden = true;
      $('dashboard').hidden = false;
      setMessage($('dashboard-message'), '');
      return true;
    } catch (error) {
      if (error.unauthorized) signOut(error.message);
      else {
        setMessage($('dashboard').hidden ? $('login-message') : $('dashboard-message'), error.message || 'The judging service is unavailable.');
        clearEntries('Submissions are unavailable.');
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeEntry(path, options, success, validate) {
    if (busy || !token) return;
    setBusy(true);
    setMessage($('dashboard-message'), 'Saving your change on the contest server…', 'info');
    try {
      const result = await request(path, options, true);
      if (validate && !validate(result)) throw new Error('The contest server did not confirm the change. Please refresh before trying again.');
      setBusy(false);
      const refreshed = await loadEntries(true);
      if (refreshed) setMessage($('dashboard-message'), success, 'success');
      else if (token) setMessage($('dashboard-message'), `${success} The list could not be refreshed; select Sync live date.`, 'info');
    } catch (error) {
      if (error.unauthorized) signOut(error.message);
      else setMessage($('dashboard-message'), error.message || 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function shortDate(date) {
    const [year, month, day] = date.split('-');
    return `${month}/${day}/${year}`;
  }

  function scoreSnapshot(entries) {
    return JSON.stringify(entries.map(({ id, scores }) => [id, scores?.beauty, scores?.creativity, scores?.complexity])
      .sort((left, right) => left[0].localeCompare(right[0])));
  }

  function rankEntries(entries) {
    return [...entries].sort((left, right) => right.scores.total - left.scores.total
      || String(left.submittedAt).localeCompare(String(right.submittedAt))
      || left.id.localeCompare(right.id));
  }

  function closePreview() {
    preview = null;
    if ($('results-dialog').open) $('results-dialog').close();
    for (const id of ['preview-winner-image', 'preview-runner-image']) {
      $(id).hidden = true;
      $(id).removeAttribute('src');
    }
  }

  async function openPreview() {
    if (busy || !token || $('judge-submit-bar').hidden || !['judging', 'results_pending'].includes(currentPhase)) return;
    if (tiedTotals(currentEntries).size) {
      setMessage($('dashboard-message'), 'Resolve all tied total scores before submitting results');
      return;
    }
    setBusy(true);
    try {
      const data = await request('/judging/submissions', {}, true);
      if (data.winnerId || scoreSnapshot(data.submissions) !== scoreSnapshot(currentEntries)) {
        setBusy(false);
        await loadEntries(true);
        setMessage($('dashboard-message'), 'The scores or entries changed. Review the updated list before submitting.');
        return;
      }
      if (!data.submissions.length || data.submissions.some((entry) => !Number.isInteger(entry.scores?.total))) {
        throw new Error('Save scores for every entry before submitting.');
      }
      if (tiedTotals(data.submissions).size) throw new Error('Resolve all tied total scores before submitting results');
      const [winner, runnerUp] = rankEntries(data.submissions);
      preview = { date: $('contest-date').value, winner, runnerUp, snapshot: scoreSnapshot(data.submissions) };
      $('results-date').textContent = dateLabel(preview.date);
      $('preview-winner-name').textContent = winner.name;
      $('preview-winner-name').setAttribute('data-i18n-ignore', '');
      $('preview-winner-score').textContent = `${winner.scores.total} / 30 points`;
      $('preview-runner-card').hidden = !runnerUp;
      if (runnerUp) {
        $('preview-runner-name').textContent = runnerUp.name;
        $('preview-runner-name').setAttribute('data-i18n-ignore', '');
        $('preview-runner-score').textContent = `${runnerUp.scores.total} / 30 points`;
      }
      setMessage($('results-message'), '');
      $('results-dialog').showModal();
      if (imageController) {
        const run = imageRun;
        loadPrivateImage(winner.imageUrl, $('preview-winner-image'), $('preview-winner-placeholder'), run, imageController.signal);
        if (runnerUp) loadPrivateImage(runnerUp.imageUrl, $('preview-runner-image'), $('preview-runner-placeholder'), run, imageController.signal);
      }
    } catch (error) {
      if (error.unauthorized) signOut(error.message);
      else setMessage($('dashboard-message'), error.message || 'Could not review results.');
    } finally {
      setBusy(false);
    }
  }

  async function publishResults() {
    if (!preview || busy) return;
    setBusy(true);
    setMessage($('results-message'), 'Checking the final scores...', 'info');
    const selected = preview;
    try {
      const latest = await request('/judging/submissions', {}, true);
      if (latest.winnerId || scoreSnapshot(latest.submissions) !== selected.snapshot) {
        closePreview();
        setBusy(false);
        await loadEntries(true);
        setMessage($('dashboard-message'), 'The scores or entries changed. Review the updated list before confirming.');
        return;
      }
      if (tiedTotals(latest.submissions).size) {
        closePreview();
        setBusy(false);
        await loadEntries(true);
        setMessage($('dashboard-message'), 'Resolve all tied total scores before submitting results');
        return;
      }
      setMessage($('results-message'), 'Publishing the confirmed results...', 'info');
      const result = await request('/judging/winners', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.winner.id, date: selected.date, expectedRunnerUpId: selected.runnerUp?.id || null }) }, true);
      closePreview();
      setBusy(false);
      await loadEntries(true);
      if (result?.winner?.id !== selected.winner.id || (result?.runnerUp?.id || null) !== (selected.runnerUp?.id || null)) {
        setMessage($('dashboard-message'), 'Results were published, but the final places differ from the preview. Review the live archive.');
      } else {
        setMessage($('dashboard-message'), 'Winner and runner-up published. Other submissions were removed.', 'success');
      }
    } catch (error) {
      if (error.unauthorized) signOut(error.message);
      else setMessage($('results-message'), error.message || 'Results could not be published. Nothing was released.');
    } finally {
      setBusy(false);
    }
  }

  function deleteEntry(entry, date) {
    if (!window.confirm(`Permanently delete ${entry.name}'s submission for ${shortDate(date)}? This cannot be undone.`)) return;
    changeEntry(`/judging/submissions/${encodeURIComponent(entry.id)}`, { method: 'DELETE' }, 'The submission was deleted by the contest server.', (result) => result?.deleted === true);
  }

  $('contest-date').value = centralToday();
  clearEntries('Sign in to view submissions.');
  if (!API) {
    $('login-button').disabled = true;
    setMessage($('login-message'), 'The contest API has not been configured. Judging is unavailable.');
  }
  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !API) return;
    const apiUrl = new URL(API);
    if (apiUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(apiUrl.hostname)) {
      setMessage($('login-message'), 'Judging requires an HTTPS API connection.');
      return;
    }
    const enteredPassword = $('judge-password').value;
    $('judge-password').value = '';
    setBusy(true);
    setMessage($('login-message'), 'Checking password with the contest server…', 'info');
    try {
      const result = await request('/judging/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: enteredPassword }) });
      if (typeof result?.token !== 'string' || !result.token) throw new Error('The judging server did not issue a valid session.');
      token = result.token;
      $('login-panel').hidden = true;
      $('dashboard').hidden = false;
      setMessage($('login-message'), '');
      setBusy(false);
      await loadEntries(true);
    } catch (error) {
      token = '';
      setMessage($('login-message'), error.message || 'Judging sign-in failed.');
    } finally {
      setBusy(false);
    }
  });
  $('load-date').addEventListener('click', () => loadEntries(false));
  $('refresh-judging').addEventListener('click', () => loadEntries(true));
  $('submit-scores').addEventListener('click', openPreview);
  $('confirm-results').addEventListener('click', publishResults);
  $('cancel-results').addEventListener('click', closePreview);
  $('results-dialog').addEventListener('close', () => { preview = null; });
  $('sign-out').addEventListener('click', () => signOut('Signed out of this page.'));
  window.addEventListener('pagehide', () => { token = ''; closePreview(); revokeImages(); });
})();
