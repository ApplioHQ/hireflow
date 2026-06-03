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

async function openBillingPortal() {
  const token = localStorage.getItem('hf_token');
  if (!token) return;

  // If we know there's no Stripe customer yet, don't even try — show a clean menu.
  if (CURRENT_USER && !CURRENT_USER.hasStripeCustomer) {
    if (window.notify) {
      await window.notify({
        title: `${planLabel()} plan — ${CURRENT_USER.email}`,
        body: `Your account doesn't have a Stripe billing record yet. This happens if the plan was activated manually (without going through Stripe checkout). To manage subscription details, complete a real checkout from the pricing page first.`
      });
      location.href = 'pricing.html';
    }
    return;
  }

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
    else console.error(e);
  }
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
