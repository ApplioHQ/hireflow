// Auth flow, talks to the Cloudflare Worker.
const API = window.HIREFLOW_CONFIG.API_URL;

// Account-scoped data lives in global localStorage keys (resume/jobs/AI cache).
// When a DIFFERENT account signs in, wipe the previous account's local copy so it
// never leaks into the new session (the editor then re-hydrates from that
// account's own cloud copy). Same-account re-login keeps the local working copy.
function _switchAccountIfNeeded(newEmail) {
  const prev = (localStorage.getItem('hf_email') || '').toLowerCase();
  const next = (newEmail || '').toLowerCase();
  if (prev !== next) {
    ['hf_resume', 'hf_jobs', 'hf_jobs_ts', 'hf_profile', 'hf_ai_results', 'hf_welcome'].forEach(k => localStorage.removeItem(k));
  }
}

function showView(v) {
  document.getElementById('view-signin').style.display = v === 'signin' ? '' : 'none';
  document.getElementById('view-signup').style.display = v === 'signup' ? '' : 'none';
}

function setMsg(formId, type, text) {
  const el = document.getElementById('msg-' + formId);
  el.className = 'auth-msg ' + type;
  el.textContent = text;
}

async function apiPost(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

// Where to land after auth. Resumes whatever a guest was trying to do before we
// asked them to sign up (e.g. clicked Export) so signing up completes the action
// instead of dumping them on a blank editor.
function _afterAuthDest(role, fallback) {
  if (role === 'admin' || role === 'super') return 'admin';
  let after = '';
  try { after = localStorage.getItem('hf_after_signup') || ''; localStorage.removeItem('hf_after_signup'); } catch (e) {}
  if (after === 'export') return 'export';
  if (localStorage.getItem('hf_pending_import')) return 'editor';
  return fallback;
}

document.getElementById('form-signin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    setMsg('signin','success','Signing in…');
    const data = await apiPost('/auth/login', {
      email: f.get('email'),
      password: f.get('password')
    });
    _switchAccountIfNeeded(data.email);
    localStorage.setItem('hf_token', data.token);
    localStorage.setItem('hf_email', data.email);
    // Admin / super-admin → admin console; regular users → the Career Home dashboard.
    // A pending import (from the ATS checker funnel) must land in the editor, which
    // is where that import gets consumed.
    location.href = _afterAuthDest(data.role, 'dashboard');
  } catch (err) {
    setMsg('signin','error', err.message);
  }
});

document.getElementById('form-signup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    setMsg('signup','success','Creating account…');
    const data = await apiPost('/auth/signup', {
      email: f.get('email'),
      password: f.get('password')
    });
    _switchAccountIfNeeded(data.email);
    localStorage.setItem('hf_token', data.token);
    localStorage.setItem('hf_email', data.email);
    localStorage.setItem('hf_welcome', '1'); // first-time welcome screen
    localStorage.setItem('hf_ask_attribution', '1'); // one-time "where did you hear about us?"
    location.href = _afterAuthDest(data.role, 'editor');
  } catch (err) {
    setMsg('signup','error', err.message);
  }
});
