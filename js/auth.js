// Auth flow, talks to the Cloudflare Worker.
const API = window.HIREFLOW_CONFIG.API_URL;

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
  if (!r.ok) throw new Error(data.error || 'Request failed');
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
    localStorage.setItem('hf_token', data.token);
    localStorage.setItem('hf_email', data.email);
    localStorage.setItem('hf_welcome', '1'); // first-time welcome screen
    location.href = 'editor.html';
  } catch (err) {
    setMsg('signup','error', err.message);
  }
});
