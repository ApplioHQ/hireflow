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
    ['hf_resume', 'hf_jobs', 'hf_ai_results', 'hf_welcome'].forEach(k => localStorage.removeItem(k));
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
    // Admin / super-admin → admin console; regular users → editor
    location.href = (data.role === 'admin' || data.role === 'super') ? 'admin.html' : 'editor.html';
  } catch (err) {
    setMsg('signin','error', err.message);
  }
});

document.getElementById('form-signup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (f.get('password') !== f.get('confirm')) {
    return setMsg('signup','error','Passwords do not match');
  }
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
    location.href = 'editor.html';
  } catch (err) {
    setMsg('signup','error', err.message);
  }
});
