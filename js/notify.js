// ============ Applio in-page notifications ============
// Replaces native alert(), confirm(), and ad-hoc toasts.
//
// API:
//   toast(message, { type, duration })           → bottom-right slide-in
//   notify({ title, body, copyable })            → center modal w/ OK
//   confirmDialog({ title, body, confirmText, cancelText, danger })  → Promise<bool>

(function () {
  function ensureContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  function iconFor(type) {
    const set = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>',
      warn:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 22h20z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/></svg>',
      info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12" y2="8"/></svg>'
    };
    return set[type] || set.info;
  }

  window.toast = function (message, opts = {}) {
    const type = opts.type || 'success';
    const duration = opts.duration ?? 2400;
    const c = ensureContainer();
    const el = document.createElement('div');
    el.className = `app-toast app-toast-${type}`;
    el.innerHTML = `<span class="app-toast-ico">${iconFor(type)}</span><span class="app-toast-msg"></span>`;
    el.querySelector('.app-toast-msg').textContent = message;
    c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('app-toast-in'));
    setTimeout(() => {
      el.classList.remove('app-toast-in');
      el.classList.add('app-toast-out');
      setTimeout(() => el.remove(), 250);
    }, duration);
  };

  function buildBackdrop() {
    const bd = document.createElement('div');
    bd.className = 'app-dialog-bd';
    document.body.appendChild(bd);
    requestAnimationFrame(() => bd.classList.add('app-dialog-bd-in'));
    return bd;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  window.notify = function ({ title, body, copyable } = {}) {
    return new Promise(resolve => {
      const bd = buildBackdrop();
      bd.innerHTML = `
        <div class="app-dialog">
          ${title ? `<h3 class="app-dialog-title"></h3>` : ''}
          ${body ? `<div class="app-dialog-body"></div>` : ''}
          <div class="app-dialog-actions">
            ${copyable ? `<button class="btn btn-secondary" data-act="copy">Copy</button>` : ''}
            <button class="btn btn-primary" data-act="ok">OK</button>
          </div>
        </div>`;
      if (title) bd.querySelector('.app-dialog-title').textContent = title;
      if (body) bd.querySelector('.app-dialog-body').textContent = body;

      const close = () => {
        bd.classList.remove('app-dialog-bd-in');
        setTimeout(() => { bd.remove(); resolve(); }, 180);
      };
      bd.querySelector('[data-act="ok"]').onclick = close;
      bd.addEventListener('click', e => { if (e.target === bd) close(); });
      if (copyable) {
        bd.querySelector('[data-act="copy"]').onclick = async () => {
          try { await navigator.clipboard.writeText(body); window.toast('Copied to clipboard', { type: 'success' }); }
          catch { window.toast('Copy failed', { type: 'error' }); }
        };
      }
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter') { close(); document.removeEventListener('keydown', onKey); }
      });
    });
  };

  window.confirmDialog = function ({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    return new Promise(resolve => {
      const bd = buildBackdrop();
      bd.innerHTML = `
        <div class="app-dialog">
          ${title ? `<h3 class="app-dialog-title"></h3>` : ''}
          ${body ? `<p class="app-dialog-body"></p>` : ''}
          <div class="app-dialog-actions">
            <button class="btn btn-ghost" data-act="cancel"></button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="confirm"></button>
          </div>
        </div>`;
      if (title) bd.querySelector('.app-dialog-title').textContent = title;
      if (body) bd.querySelector('.app-dialog-body').textContent = body;
      bd.querySelector('[data-act="cancel"]').textContent = cancelText;
      bd.querySelector('[data-act="confirm"]').textContent = confirmText;

      const finish = (val) => {
        bd.classList.remove('app-dialog-bd-in');
        setTimeout(() => { bd.remove(); resolve(val); }, 180);
      };
      bd.querySelector('[data-act="confirm"]').onclick = () => finish(true);
      bd.querySelector('[data-act="cancel"]').onclick = () => finish(false);
      bd.addEventListener('click', e => { if (e.target === bd) finish(false); });
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { finish(false); document.removeEventListener('keydown', onKey); }
        else if (e.key === 'Enter') { finish(true); document.removeEventListener('keydown', onKey); }
      });
    });
  };
})();

// ============ AI Loading overlay ============
// aiLoading(message), shows a full-screen spinner with a message
// aiLoadingDone(), removes it
// Both are safe to call multiple times; only one overlay exists at a time.

window.aiLoading = function (message) {
  // Remove any existing overlay first (safety)
  const existing = document.getElementById('ai-loading-overlay');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'ai-loading-overlay';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999',
    'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center', 'gap:18px',
    'background:rgba(7,9,26,.72)',
    'backdrop-filter:blur(6px)',
    '-webkit-backdrop-filter:blur(6px)',
    'animation:aiOverlayIn .18s ease both',
  ].join(';');

  el.innerHTML = `
    <style>
      @keyframes aiOverlayIn { from { opacity:0 } to { opacity:1 } }
      @keyframes aiSpinRing  { to { transform: rotate(360deg) } }
      @keyframes aiPulseText { 0%,100% { opacity:.6 } 50% { opacity:1 } }
    </style>
    <div style="
      width:56px; height:56px; position:relative;
      display:flex; align-items:center; justify-content:center;
    ">
      <!-- Outer spinning ring -->
      <svg viewBox="0 0 56 56" style="
        position:absolute; inset:0; width:100%; height:100%;
        animation: aiSpinRing 1.1s linear infinite;
      ">
        <circle cx="28" cy="28" r="24"
          fill="none" stroke="rgba(99,102,241,.25)" stroke-width="4"/>
        <circle cx="28" cy="28" r="24"
          fill="none" stroke="#6366f1" stroke-width="4"
          stroke-linecap="round"
          stroke-dasharray="36 113"
          stroke-dashoffset="0"/>
      </svg>
      <!-- Sparkle icon in centre -->
      <svg viewBox="0 0 24 24" width="22" height="22"
        fill="none" stroke="#a5b4fc" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>
      </svg>
    </div>
    <div style="
      font-size:14px; font-weight:500; color:#e6e9f5; letter-spacing:.01em;
      animation: aiPulseText 1.8s ease-in-out infinite;
      max-width:260px; text-align:center; line-height:1.5;
    " id="ai-loading-msg"></div>`;

  el.querySelector('#ai-loading-msg').textContent = message || 'AI is thinking…';
  document.body.appendChild(el);
};

window.aiLoadingDone = function () {
  const el = document.getElementById('ai-loading-overlay');
  if (!el) return;
  el.style.animation = 'aiOverlayIn .15s ease reverse both';
  setTimeout(() => el.remove(), 150);
};