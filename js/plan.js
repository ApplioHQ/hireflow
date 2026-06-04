// ============ Plan/User helpers (shared across pages) ============
const API_BASE = window.HIREFLOW_CONFIG.API_URL;
let CURRENT_USER = null;

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

function isPaid() { return CURRENT_USER && CURRENT_USER.isPaid; }
function isFree() { return !isPaid(); }
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

// Account menu — clicking the crown opens this
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
