/* appnav.js, one shared fix for the app topbar getting crowded. Keeps the core
   tabs flat (Home, Resume Builder, Autopilot, Admin) plus the CURRENT page's tab,
   and folds every other tool into a single "Tools ▾" dropdown. Runs on every app
   page from one file, so the nav never drifts or wraps again. Progressive: with no
   JS you still get the single-line scrollable row from styles.css.

   Under 900px the rail is hidden and this strip becomes the only nav, but it has
   ~160px to work with, less than the primary tabs alone need. Consolidating also
   un-clips the strip's overflow (so the dropdown isn't cut off), which means any
   tab left flat here spills across the topbar actions. So on narrow screens every
   tab folds into one "Menu". This re-renders on breakpoint change, a tablet that
   loads at 1024 and rotates to 768 has to fold too. */
(function () {
  'use strict';
  var tabs = document.querySelector('.app-topbar .topbar-tabs');
  if (!tabs || tabs.getAttribute('data-appnav') === '1') return;

  // Tabs that always stay visible on desktop (core loop + hub + admin).
  var PRIMARY = ['dashboard', 'editor', 'autopilot', 'admin'];
  function hrefKey(a) { return (a.getAttribute('href') || '').replace(/^\//, '').replace(/[?#].*$/, '').replace(/\.html$/, ''); }

  // Original flat order, the source of truth we restore to before each re-render.
  var links = Array.prototype.slice.call(tabs.querySelectorAll('a.topbar-tab'));
  if (!links.length) return;

  var mq = window.matchMedia('(max-width: 900px)');
  var dd = null;

  function close() {
    if (!dd) return;
    dd.classList.remove('open');
    dd.querySelector('.tb-dd-trigger').setAttribute('aria-expanded', 'false');
  }

  // Return every link to the flat strip in its original order, and drop the dropdown.
  function teardown() {
    if (!dd) return;
    links.forEach(function (a) { a.removeAttribute('role'); tabs.appendChild(a); });
    dd.remove();
    dd = null;
    tabs.classList.remove('tb-consolidated');
  }

  function build(toMenu, narrow) {
    var el = document.createElement('div');
    el.className = 'tb-dd';
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'tb-dd-trigger';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    // On mobile this dropdown IS the whole nav, so "Tools" would undersell it.
    trigger.innerHTML = (narrow ? 'Menu' : 'Tools') + ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    var menu = document.createElement('div');
    menu.className = 'tb-dd-menu';
    menu.setAttribute('role', 'menu');
    toMenu.forEach(function (a) { a.setAttribute('role', 'menuitem'); menu.appendChild(a); });
    el.appendChild(trigger);
    el.appendChild(menu);
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      el.classList.contains('open') ? close()
        : (el.classList.add('open'), trigger.setAttribute('aria-expanded', 'true'));
    });
    return el;
  }

  function render() {
    teardown();
    var narrow = mq.matches;
    var toMenu = links.filter(function (a) {
      if (narrow) return true;   // no room for anything flat down here
      return PRIMARY.indexOf(hrefKey(a)) === -1 && !a.classList.contains('active');
    });
    if (!toMenu.length) return;
    if (!narrow && toMenu.length < 2) return;   // desktop: not crowded enough to bother
    injectCSS();
    dd = build(toMenu, narrow);
    tabs.appendChild(dd);
    // Consolidated → what's left fits, so un-clip the overflow that would hide the menu.
    tabs.classList.add('tb-consolidated');
  }

  render();
  tabs.setAttribute('data-appnav', '1');

  if (mq.addEventListener) mq.addEventListener('change', render);
  else if (mq.addListener) mq.addListener(render);   // older Safari

  document.addEventListener('click', function (e) { if (dd && !dd.contains(e.target)) close(); });
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
