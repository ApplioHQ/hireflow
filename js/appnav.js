/* appnav.js, one shared fix for the app topbar getting crowded. Keeps the core
   tabs flat (Home, Resume Builder, Autopilot, Admin) plus the CURRENT page's tab,
   and folds every other tool into a single "Tools ▾" dropdown. Runs on every app
   page from one file, so the nav never drifts or wraps again. Progressive: with no
   JS you still get the single-line scrollable row from styles.css. */
(function () {
  'use strict';
  var tabs = document.querySelector('.app-topbar .topbar-tabs');
  if (!tabs || tabs.getAttribute('data-appnav') === '1') return;

  // Tabs that always stay visible (core loop + hub + admin).
  var PRIMARY = ['dashboard', 'editor', 'autopilot', 'admin'];
  function hrefKey(a) { return (a.getAttribute('href') || '').replace(/^\//, '').replace(/[?#].*$/, '').replace(/\.html$/, ''); }

  var links = Array.prototype.slice.call(tabs.querySelectorAll('a.topbar-tab'));
  // Move to dropdown: everything that isn't primary and isn't the active tab.
  var toMenu = links.filter(function (a) {
    return PRIMARY.indexOf(hrefKey(a)) === -1 && !a.classList.contains('active');
  });
  if (toMenu.length < 2) { tabs.setAttribute('data-appnav', '1'); return; } // not crowded enough to bother

  injectCSS();

  var dd = document.createElement('div');
  dd.className = 'tb-dd';
  var trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tb-dd-trigger';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = 'Tools <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  var menu = document.createElement('div');
  menu.className = 'tb-dd-menu';
  menu.setAttribute('role', 'menu');

  toMenu.forEach(function (a) { a.setAttribute('role', 'menuitem'); menu.appendChild(a); });
  dd.appendChild(trigger);
  dd.appendChild(menu);
  tabs.appendChild(dd);
  // Consolidated → tabs fit, so un-clip the overflow that would otherwise hide the menu.
  tabs.classList.add('tb-consolidated');
  tabs.setAttribute('data-appnav', '1');

  function open() { dd.classList.add('open'); trigger.setAttribute('aria-expanded', 'true'); }
  function close() { dd.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); }
  trigger.addEventListener('click', function (e) { e.stopPropagation(); dd.classList.contains('open') ? close() : open(); });
  document.addEventListener('click', function (e) { if (!dd.contains(e.target)) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  function injectCSS() {
    if (document.getElementById('tb-dd-css')) return;
    var css = ''
      + '.topbar-tabs.tb-consolidated{overflow:visible;}'
      + '.tb-dd{position:relative;flex-shrink:0;}'
      + '.tb-dd-trigger{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:7px;border:0;background:none;cursor:pointer;font:inherit;font-size:13px;font-weight:500;color:var(--muted);white-space:nowrap;transition:background .15s,color .15s;}'
      + '.tb-dd-trigger:hover,.tb-dd.open .tb-dd-trigger{background:var(--bg-2);color:var(--text);}'
      + '.tb-dd-trigger svg{width:12px;height:12px;opacity:.8;transition:transform .2s;}'
      + '.tb-dd.open .tb-dd-trigger svg{transform:rotate(180deg);}'
      + '.tb-dd-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:196px;background:var(--bg-1);border:1px solid var(--border);border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.35);padding:6px;display:none;flex-direction:column;gap:2px;z-index:300;}'
      + '.tb-dd.open .tb-dd-menu{display:flex;}'
      + '.tb-dd-menu a.topbar-tab{display:block;padding:9px 12px;border-radius:8px;white-space:nowrap;font-size:13.5px;}'
      + '.tb-dd-menu a.topbar-tab.active{background:var(--bg-2);color:var(--text);}';
    var st = document.createElement('style');
    st.id = 'tb-dd-css';
    st.textContent = css;
    document.head.appendChild(st);
  }
})();
