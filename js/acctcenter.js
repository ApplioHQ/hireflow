/* acctcenter.js, one shared account dropdown for the older app pages (job tracker,
   interview prep, best match, cover letter, career coach, feedback, admin) that still
   had a plain "Sign out" button. Injects the same account center the editor/dashboard
   use into .topbar-right, wires it, and hydrates identity + plan from plan.js. Skips
   any page that already has an .acct-center. Requires plan.js + theme.js loaded first. */
(function () {
  'use strict';
  var right = document.querySelector('.app-topbar .topbar-right');
  if (!right || right.querySelector('.acct-center')) return;

  // Keep the health badge; drop the old theme-toggle + sign-out buttons.
  Array.prototype.slice.call(right.children).forEach(function (el) {
    if (el.id === 'health-badge') return;
    el.remove();
  });

  var ICO = {
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
  };
  var ctx = (location.pathname.split('/').pop() || 'app').replace('.html', '') || 'app';
  right.insertAdjacentHTML('beforeend',
    '<div class="acct-center" id="acct-center">'
    + '<button class="acct-trigger" id="acct-trigger" type="button" onclick="toggleAcctMenu(event)" aria-haspopup="true" aria-expanded="false" aria-label="Account center" title="Account">'
    + '<span class="acct-avatar" id="acct-avatar">A</span>'
    + '<svg class="acct-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>'
    + '</button>'
    + '<div class="acct-menu" id="acct-menu" role="menu" hidden>'
    + '<div class="acct-head"><div class="acct-avatar acct-avatar-lg" id="acct-avatar-lg">A</div>'
    + '<div class="acct-head-text"><div class="acct-email" id="acct-email">Account</div><div class="acct-plan" id="acct-plan-label"></div></div></div>'
    + '<div class="acct-sep"></div>'
    + '<div class="acct-row acct-row-static"><span class="acct-row-label">Plan</span><span id="plan-pill"></span></div>'
    + '<button class="acct-row acct-row-btn" type="button" role="menuitem" onclick="toggleTheme()"><span class="acct-row-label">Appearance</span><span class="acct-row-val theme-toggle"></span></button>'
    + '<button class="acct-row acct-row-btn" id="acct-admin-console" type="button" role="menuitem" style="display:none;color:#fca5a5;" onclick="closeAcctMenu(); location.href=\'admin\';"><span class="acct-row-main"><span class="acct-row-icon">' + ICO.admin + '</span>Admin Console</span></button>'
    + '<button class="acct-row acct-row-btn" id="acct-manage-sub" type="button" role="menuitem" style="display:none;" onclick="closeAcctMenu(); if(typeof openBillingPortal===\'function\')openBillingPortal();"><span class="acct-row-main"><span class="acct-row-icon">' + ICO.card + '</span>Manage / cancel subscription</span></button>'
    + '<div class="acct-sep"></div>'
    + '<button class="acct-row acct-row-btn" type="button" role="menuitem" onclick="if(typeof openFeedbackModal===\'function\')openFeedbackModal({context:\'' + ctx + '\'}); closeAcctMenu();"><span class="acct-row-main"><span class="acct-row-icon">' + ICO.chat + '</span>Feedback</span></button>'
    + '<button class="acct-row acct-row-btn acct-row-danger" type="button" role="menuitem" onclick="signOut()"><span class="acct-row-main"><span class="acct-row-icon">' + ICO.out + '</span>Sign out</span></button>'
    + '</div></div>');

  // Initial theme label (theme.js keeps it in sync on every toggle thereafter).
  var light = document.documentElement.classList.contains('light-mode');
  var tt = document.querySelector('#acct-menu .theme-toggle');
  if (tt) tt.textContent = light ? '🌙 Dark' : '☀️ Light';

  // Behavior (define only if a page's own script hasn't already).
  if (typeof window.toggleAcctMenu !== 'function') window.toggleAcctMenu = function (e) {
    if (e) e.stopPropagation();
    var m = document.getElementById('acct-menu'); if (!m) return;
    if (m.hasAttribute('hidden')) { m.removeAttribute('hidden'); var t = document.getElementById('acct-trigger'); if (t) t.setAttribute('aria-expanded', 'true'); document.getElementById('acct-center').classList.add('open'); }
    else { closeAcctMenu(); }
  };
  if (typeof window.closeAcctMenu !== 'function') window.closeAcctMenu = function () {
    var m = document.getElementById('acct-menu'); if (!m || m.hasAttribute('hidden')) return;
    m.setAttribute('hidden', ''); var t = document.getElementById('acct-trigger'); if (t) t.setAttribute('aria-expanded', 'false');
    var c = document.getElementById('acct-center'); if (c) c.classList.remove('open');
  };
  // Canonical sign-out (clears every synced key so no data leaks between accounts).
  window.signOut = function () {
    ['hf_token', 'hf_email', 'hf_resume', 'hf_jobs', 'hf_jobs_ts', 'hf_profile', 'hf_ai_results', 'hf_welcome'].forEach(function (k) { localStorage.removeItem(k); });
    location.href = '/';
  };
  document.addEventListener('click', function (e) { var c = document.getElementById('acct-center'); if (c && !c.contains(e.target)) closeAcctMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAcctMenu(); });

  function hydrate() {
    var email = (window.CURRENT_USER && CURRENT_USER.email) || localStorage.getItem('hf_email') || '';
    var initials = email ? email.trim().charAt(0).toUpperCase() : 'A';
    ['acct-avatar', 'acct-avatar-lg'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = initials; });
    var em = document.getElementById('acct-email'); if (em) em.textContent = email || 'Account';
    var admin = (typeof isAdmin === 'function' && isAdmin());
    var paid = (typeof isPaid === 'function' && isPaid());
    var pl = document.getElementById('acct-plan-label'); if (pl) pl.textContent = admin ? 'Admin · full access' : (paid ? ((typeof planLabel === 'function' ? planLabel() : 'Premium') + ' plan') : 'Free plan');
    var mg = document.getElementById('acct-manage-sub'); if (mg) mg.style.display = (paid && !admin) ? '' : 'none';
    var ad = document.getElementById('acct-admin-console'); if (ad) ad.style.display = admin ? '' : 'none';
    var pill = document.getElementById('plan-pill');
    if (pill) pill.innerHTML = admin ? '<span class="pill success">Admin</span>' : (paid ? '<button class="pill success" onclick="if(typeof openBillingPortal===\'function\')openBillingPortal();" style="cursor:pointer;">' + (typeof planLabel === 'function' ? planLabel() : 'Premium') + '</button>' : '<a class="btn btn-primary btn-xs" href="pricing">Upgrade</a>');
  }
  hydrate();
  if (typeof loadCurrentUser === 'function') Promise.resolve(loadCurrentUser()).then(hydrate).catch(function () {});
})();
