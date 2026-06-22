// ============ Plan/User helpers (shared across pages) ============
const API_BASE = window.HIREFLOW_CONFIG.API_URL;
let CURRENT_USER = null;
let SYSTEM_STATUS = null;

async function loadCurrentUser() {
  const token = localStorage.getItem('hf_token');
  if (!token) return null;
  try {
    const r = await fetch(API_BASE + '/me', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    CURRENT_USER = await r.json();
    return CURRENT_USER;
  } catch { return null; }
}

function isAdmin()      { return CURRENT_USER && (CURRENT_USER.role === 'admin' || CURRENT_USER.role === 'super'); }
function isSuperAdmin() { return CURRENT_USER && CURRENT_USER.role === 'super'; }

// Check site status; if maintenance is on and user is not admin, show offline screen.
async function checkSiteStatus() {
  try {
    const r = await fetch(API_BASE + '/status');
    if (!r.ok) return null;
    SYSTEM_STATUS = await r.json();
    if (SYSTEM_STATUS.maintenance && !isAdmin()) renderOfflineScreen();
    return SYSTEM_STATUS;
  } catch { return null; }
}

function renderOfflineScreen() {
  // Bare-bones offline screen, no timing info exposed.
  document.body.innerHTML = `
    <div style="min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; text-align:center; background:#07091a; color:#e6e9f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;">
      <svg viewBox="0 0 120 100" width="180" height="150" style="margin-bottom:32px; image-rendering:pixelated;" xmlns="http://www.w3.org/2000/svg">
        <g fill="#6366f1">
          <rect x="40" y="20" width="40" height="30"/>
          <rect x="35" y="25" width="5" height="20"/>
          <rect x="80" y="25" width="5" height="20"/>
          <rect x="45" y="15" width="5" height="5"/>
          <rect x="70" y="15" width="5" height="5"/>
          <rect x="50" y="10" width="20" height="10"/>
          <rect x="35" y="50" width="50" height="25"/>
          <rect x="30" y="55" width="5" height="15"/>
          <rect x="85" y="55" width="5" height="15"/>
          <rect x="40" y="75" width="10" height="15"/>
          <rect x="70" y="75" width="10" height="15"/>
          <rect x="35" y="88" width="20" height="5"/>
          <rect x="65" y="88" width="20" height="5"/>
        </g>
        <g fill="#fff">
          <rect x="48" y="28" width="3" height="3"/>
          <rect x="54" y="28" width="3" height="3"/>
          <rect x="51" y="31" width="3" height="3"/>
          <rect x="48" y="34" width="3" height="3"/>
          <rect x="54" y="34" width="3" height="3"/>
          <rect x="63" y="28" width="3" height="3"/>
          <rect x="69" y="28" width="3" height="3"/>
          <rect x="66" y="31" width="3" height="3"/>
          <rect x="63" y="34" width="3" height="3"/>
          <rect x="69" y="34" width="3" height="3"/>
        </g>
        <rect x="58" y="2" width="4" height="8" fill="#6366f1"/>
        <rect x="55" y="0" width="10" height="3" fill="#ef4444"/>
      </svg>
      <h1 style="font-size:32px; font-weight:800; margin-bottom:10px;">Applio is offline</h1>
      <p style="color:#9aa3c7; font-size:15px; max-width:420px; line-height:1.5;">
        We'll be back soon. Hold tight, your work is safe.
      </p>
    </div>`;
  // Periodically re-check status so the page auto-recovers when maintenance ends.
  setInterval(async () => {
    try {
      const r = await fetch(API_BASE + '/status');
      const s = await r.json();
      if (!s.maintenance) location.reload();
    } catch {}
  }, 30000);
}

// Auto-redirect admin users to admin console if they land elsewhere by mistake
function redirectIfAdmin() {
  if (!CURRENT_USER || !isAdmin()) return false;
  const here = location.pathname.split('/').pop() || 'index.html';
  if (here !== 'admin.html' && here !== 'index.html' && here !== 'login.html') {
    // Don't force-redirect on every page, let them browse, but show the link prominently
    return false;
  }
  if (here === 'index.html' || here === '' || here === 'login.html') {
    location.href = 'admin.html';
    return true;
  }
  return false;
}

function isPaid() { return CURRENT_USER && CURRENT_USER.isPaid; }
function isFree() { return !isPaid(); }

// ---- Free AI trials (free users get N free uses per premium feature) ----
const FREE_AI_TRIALS = 2;
function _trialLimit() { return (CURRENT_USER && CURRENT_USER.freeAiTrials) || FREE_AI_TRIALS; }
function trialsUsed(feature) { return (CURRENT_USER && CURRENT_USER.aiTrials && CURRENT_USER.aiTrials[feature]) || 0; }
function trialsLeft(feature) { return isPaid() ? Infinity : Math.max(0, _trialLimit() - trialsUsed(feature)); }
// Can the user still use this AI feature (paid, or has trials left)?
function canUseAi(feature) { return isPaid() || trialsLeft(feature) > 0; }
function planLabel() {
  if (!CURRENT_USER) return 'Free';
  if (CURRENT_USER.plan === 'lifetime') return 'Lifetime';
  if (CURRENT_USER.plan === 'premium') return 'Premium';
  return 'Free';
}
function downloadsLeft() {
  if (!CURRENT_USER) return 0;
  if (isPaid()) return Infinity;
  return Math.max(0, (CURRENT_USER.downloadLimit || 10) - (CURRENT_USER.downloadsUsed || 0));
}

async function startCheckout(plan) {
  const token = localStorage.getItem('hf_token');
  if (!token) { location.href = 'login.html'; return; }
  try {
    const r = await fetch(API_BASE + '/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ plan })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to start checkout');
    location.href = data.url;
  } catch (e) {
    if (window.toast) toast('Could not start checkout: ' + e.message, { type: 'error' });
    else console.error(e);
  }
}

// Open Stripe Customer Portal directly (for the Manage Billing button)
async function _openStripePortal() {
  const token = localStorage.getItem('hf_token');
  try {
    const r = await fetch(API_BASE + '/stripe/portal', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed to open portal');
    location.href = data.url;
  } catch (e) {
    if (window.toast) toast('Could not open billing portal: ' + e.message, { type: 'error' });
  }
}

// Sync this account with Stripe (recover from missed webhooks)
async function syncWithStripe(closeModalFirst = true) {
  const token = localStorage.getItem('hf_token');
  if (!token) return;
  if (closeModalFirst) closeAccountModal();
  if (window.toast) toast('Syncing with Stripe…', { type: 'info', duration: 2500 });
  try {
    const r = await fetch(API_BASE + '/me/sync', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Sync failed');
    if (!data.ok) { if (window.toast) toast(data.message || 'Sync failed', { type: 'warn', duration: 4500 }); return; }
    await loadCurrentUser();
    if (window.toast) toast(data.message || 'Account synced', { type: 'success' });
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    if (window.toast) toast('Sync failed: ' + e.message, { type: 'error' });
  }
}

function closeAccountModal() {
  const m = document.getElementById('account-menu-bd');
  if (m) {
    m.classList.remove('app-dialog-bd-in');
    setTimeout(() => m.remove(), 180);
  }
}

// Account menu, clicking the crown opens this
async function openBillingPortal() {
  if (document.getElementById('account-menu-bd')) return;

  // Make sure user data is current
  if (!CURRENT_USER) await loadCurrentUser();
  if (!CURRENT_USER) { location.href = 'login.html'; return; }

  const u = CURRENT_USER;
  const plan = u.plan || 'free';
  const planName = plan === 'lifetime' ? 'Lifetime' : plan === 'premium' ? 'Premium' : 'Free';
  const renewsDate = u.currentPeriodEnd
    ? new Date(u.currentPeriodEnd * 1000).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })
    : null;

  const bd = document.createElement('div');
  bd.id = 'account-menu-bd';
  bd.className = 'app-dialog-bd';
  document.body.appendChild(bd);
  requestAnimationFrame(() => bd.classList.add('app-dialog-bd-in'));

  const rows = [
    `<div class="acct-row"><span class="acct-label">Email</span><span class="acct-value">${u.email}</span></div>`,
    `<div class="acct-row"><span class="acct-label">Plan</span><span class="acct-value"><span class="pill ${plan!=='free'?'success':''}">${planName}</span></span></div>`,
  ];
  if (renewsDate && plan === 'premium')
    rows.push(`<div class="acct-row"><span class="acct-label">Renews</span><span class="acct-value">${renewsDate}</span></div>`);
  if (plan === 'lifetime')
    rows.push(`<div class="acct-row"><span class="acct-label">Status</span><span class="acct-value">No recurring charges</span></div>`);
  if (!u.hasStripeCustomer && plan !== 'free')
    rows.push(`<div class="acct-row" style="border:1px solid var(--warning); background:rgba(245,158,11,.08); padding:10px; border-radius:8px;"><span style="font-size:12px; color:#fcd34d; line-height:1.4;">No Stripe billing record is linked yet. If you just paid, click <strong>Sync with Stripe</strong> below.</span></div>`);

  const buttons = [];
  if (u.hasStripeCustomer) {
    buttons.push(`<button class="btn btn-primary" onclick="_openStripePortal()">Manage Billing &amp; Cancel</button>`);
  }
  buttons.push(`<button class="btn btn-secondary" onclick="syncWithStripe()">Sync with Stripe</button>`);
  if (plan === 'free') buttons.push(`<button class="btn btn-primary" onclick="location.href='pricing.html'">Upgrade</button>`);
  buttons.push(`<button class="btn btn-ghost" onclick="closeAccountModal(); openFeedbackModal({context:'account_menu'})">Send Feedback</button>`);
  buttons.push(`<button class="btn btn-ghost" onclick="closeAccountModal(); signOutFromMenu()">Sign out</button>`);

  bd.innerHTML = `
    <div class="app-dialog" style="max-width: 440px;">
      <button class="modal-close" onclick="closeAccountModal()" style="position:absolute;top:14px;right:14px;color:var(--muted);font-size:18px;">×</button>
      <h3 class="app-dialog-title" style="margin-bottom:14px;">Your Account</h3>
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:18px;">${rows.join('')}</div>
      <div style="display:flex; flex-direction:column; gap:8px;">${buttons.join('')}</div>
      ${u.hasStripeCustomer ? `<p style="font-size:11px; color:var(--muted); margin-top:14px; text-align:center;">Click Manage Billing to cancel your subscription, update your card, or view invoices in Stripe.</p>` : ''}
    </div>`;

  bd.addEventListener('click', e => { if (e.target === bd) closeAccountModal(); });
}

function signOutFromMenu() {
  localStorage.removeItem('hf_token');
  localStorage.removeItem('hf_email');
  location.href = 'index.html';
}

// ============ Feedback ============
// Fire-and-forget feedback POST. Never throws / never alarms the user.
async function sendFeedback(payload) {
  const token = localStorage.getItem('hf_token');
  try {
    const r = await fetch(API_BASE + '/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return true;
  } catch (e) {
    console.warn('feedback submission failed', e);
    return false;
  }
}

// ============ Reusable feedback modal ============
// Robust feedback form: optional rating, a topic, and a free-text message.
// Available anywhere plan.js is loaded, call openFeedbackModal({ context }).
function _fbField() {
  return 'width:100%; box-sizing:border-box; padding:10px 12px; background:var(--bg-2); border:1px solid var(--border); border-radius:8px; color:var(--text); font-size:14px; font-family:inherit;';
}
function openFeedbackModal(opts = {}) {
  if (document.getElementById('feedback-modal-bd')) return;
  const context = opts.context || 'general';
  const bd = document.createElement('div');
  bd.id = 'feedback-modal-bd';
  bd.className = 'app-dialog-bd';
  bd._rating = (opts.rating === 'up' || opts.rating === 'down') ? opts.rating : null;
  document.body.appendChild(bd);
  requestAnimationFrame(() => bd.classList.add('app-dialog-bd-in'));

  const f = _fbField();
  const rateBtn = 'flex:1;cursor:pointer;background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:18px;line-height:1;';
  bd.innerHTML = `
    <div class="app-dialog" style="max-width:440px; position:relative;">
      <button class="modal-close" onclick="closeFeedbackModal()" style="position:absolute;top:14px;right:14px;color:var(--muted);font-size:18px;background:none;border:none;cursor:pointer;">×</button>
      <h3 class="app-dialog-title" style="margin-bottom:6px;">Send Feedback</h3>
      <p style="font-size:13px;color:var(--muted);margin:0 0 16px;">Tell us how Applio is working for you, every bit helps.</p>

      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:6px;">Overall experience</label>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button type="button" class="fb-rate" data-rating="up"   style="${rateBtn}">👍</button>
        <button type="button" class="fb-rate" data-rating="null" style="${rateBtn}">😐</button>
        <button type="button" class="fb-rate" data-rating="down" style="${rateBtn}">👎</button>
      </div>

      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:6px;">Topic</label>
      <select id="fb-category" style="${f} cursor:pointer; margin-bottom:16px;">
        <option value="general">General feedback</option>
        <option value="bug">Bug / something broke</option>
        <option value="feature">Feature request</option>
        <option value="ui">Design &amp; usability</option>
        <option value="other">Other</option>
      </select>

      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:6px;">Your message</label>
      <textarea id="fb-message" rows="4" placeholder="What's working, what's missing, or what went wrong…" style="${f} resize:vertical;"></textarea>

      <div id="fb-state" style="font-size:13px;min-height:18px;margin:10px 0 0;text-align:center;color:var(--muted);"></div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="btn btn-ghost" style="flex:1;" onclick="closeFeedbackModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:1;" id="fb-submit" onclick="_submitFeedbackModal('${context}')">Submit</button>
      </div>
    </div>`;

  const paint = () => {
    bd.querySelectorAll('.fb-rate').forEach(b => {
      const v = b.dataset.rating === 'null' ? null : b.dataset.rating;
      const on = v === bd._rating;
      b.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
      b.style.background = on ? 'rgba(99,102,241,.15)' : 'var(--bg-2)';
    });
  };
  bd.querySelectorAll('.fb-rate').forEach(b => {
    b.onclick = () => { bd._rating = b.dataset.rating === 'null' ? null : b.dataset.rating; paint(); };
  });
  if (bd._rating) paint();

  bd.addEventListener('click', e => { if (e.target === bd) closeFeedbackModal(); });
  document.addEventListener('keydown', _fbModalKey);
  setTimeout(() => { const t = bd.querySelector('#fb-message'); if (t) t.focus(); }, 50);
}
function _fbModalKey(e) { if (e.key === 'Escape') closeFeedbackModal(); }
function closeFeedbackModal() {
  const bd = document.getElementById('feedback-modal-bd');
  if (!bd) return;
  document.removeEventListener('keydown', _fbModalKey);
  bd.classList.remove('app-dialog-bd-in');
  setTimeout(() => bd.remove(), 180);
}
async function _submitFeedbackModal(context) {
  const bd = document.getElementById('feedback-modal-bd');
  if (!bd) return;
  const rating = bd._rating ?? null;
  const category = bd.querySelector('#fb-category').value;
  const message = bd.querySelector('#fb-message').value.trim();
  const state = bd.querySelector('#fb-state');
  const btn = bd.querySelector('#fb-submit');
  if (!message && rating === null) {
    if (state) { state.textContent = 'Add a rating or a message first.'; state.style.color = 'var(--warning)'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  await sendFeedback({ rating, category, message, context, page: location.pathname });
  if (state) { state.textContent = 'Thanks for the feedback! 🙌'; state.style.color = 'var(--success)'; }
  setTimeout(closeFeedbackModal, 1400);
}

// Toggle the ADMIN tier on/off (super-admin only). Used from the admin console.
async function setAdminAccess(enabled) {
  const token = localStorage.getItem('hf_token');
  try {
    const r = await fetch(API_BASE + '/admin/admin-access', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ enabled: !!enabled })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Failed');
    if (window.toast) toast(enabled ? 'ADMIN access enabled' : 'ADMIN access disabled', { type: 'success' });
    return data;
  } catch (e) {
    if (window.toast) toast('Failed: ' + e.message, { type: 'error' });
  }
}

// ============ Auto-boot on every page ============
// Order is important:
// 1) Load current user FIRST so isAdmin() resolves correctly.
// 2) Then run status check, admins bypass the offline screen.
// 3) Inject ADMIN CONSOLE link into topbar if admin.
async function _applioPageBoot() {
  // Skip on login.html so admins can log in even during maintenance.
  const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isLogin = here === 'login.html';

  if (localStorage.getItem('hf_token')) await loadCurrentUser();
  if (!isLogin) await checkSiteStatus();

  const tabs = document.querySelector('.topbar-tabs');
  if (tabs && isAdmin() && !document.getElementById('admin-console-link')
      && !here.endsWith('admin.html')) {
    const link = document.createElement('a');
    link.id = 'admin-console-link';
    link.href = 'admin.html';
    link.className = 'topbar-tab';
    link.style.cssText = 'background: linear-gradient(135deg, rgba(239,68,68,.18), rgba(139,92,246,.18)); border:1px solid rgba(239,68,68,.35); color:#fca5a5; font-weight:600;';
    link.innerHTML = '⚡ ADMIN CONSOLE';
    tabs.insertBefore(link, tabs.firstChild);
  }
}
// Run after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _applioPageBoot);
} else {
  _applioPageBoot();
}

// ============ Upgrade modal ============
function showUpgradeModal(reason) {
  if (document.getElementById('upgrade-modal-bd')) return;
  const reasons = {
    ai: { title: 'AI features are Premium', body: 'Tailoring, ATS scoring, AI Improve, interview prep and resume analysis are part of Premium. Upgrade to unlock everything.' },
    interview: { title: 'Interview Prep is Premium', body: 'Generate practice questions tailored to any role with AI. Upgrade to unlock.' },
    optimize: { title: 'Optimize is Premium', body: 'Tailor to Job, ATS Check, and AI Analysis are part of Premium. Upgrade to unlock.' },
    downloads: { title: 'Download limit reached', body: `You've used all 10 free downloads. Upgrade to Premium or Lifetime for unlimited downloads.` }
  };
  const r = reasons[reason] || { title: 'Upgrade to Premium', body: 'Unlock AI features, interview prep, and unlimited downloads.' };
  const bd = document.createElement('div');
  bd.id = 'upgrade-modal-bd';
  bd.className = 'modal-backdrop open';
  bd.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <button class="modal-close" onclick="closeUpgradeModal()">×</button>
      <h3 style="margin-bottom:8px;">${r.title}</h3>
      <p style="color:var(--muted); font-size:14px; margin-bottom:20px;">${r.body}</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <button class="btn btn-secondary" onclick="startCheckout('premium')" style="flex-direction:column; padding:14px; height:auto;">
          <div style="font-weight:700;">Premium</div>
          <div style="font-size:18px; font-weight:700; margin-top:4px;">$9.99<span style="font-size:12px; font-weight:400; opacity:.7;">/mo</span></div>
        </button>
        <button class="btn btn-primary" onclick="startCheckout('lifetime')" style="flex-direction:column; padding:14px; height:auto;">
          <div style="font-weight:700;">Lifetime</div>
          <div style="font-size:18px; font-weight:700; margin-top:4px;">$39.99<span style="font-size:12px; font-weight:400; opacity:.7;"> once</span></div>
        </button>
      </div>
      <div style="text-align:center; margin-top:14px;">
        <a href="pricing.html" style="font-size:12px; color:var(--muted);">See full comparison →</a>
      </div>
    </div>
  `;
  document.body.appendChild(bd);
}
function closeUpgradeModal() {
  const m = document.getElementById('upgrade-modal-bd');
  if (m) m.remove();
}
