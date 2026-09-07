/* appshell.js, a persistent left navigation rail for the app (VS Code / Slack style).
   Additive + robust: injects a full-height fixed icon rail on the far left and shifts
   ALL page content right by padding the <body> (so it can't be defeated by inline or
   class padding on <main>). Expands on hover to reveal labels, hides the redundant
   topbar tabs, and falls back to the topbar tabs on mobile. Include on any app page:
     <script src="/js/appshell.js"></script>
   Self-contained (injects its own CSS); only adds a body class + the rail element. */
(function () {
  'use strict';
  if (document.querySelector('.app-rail')) return;

  // Tabler icons (stroke-width 2, currentColor). Only the inner elements —
  // the rail wraps them with the <svg> element.
  var ICONS = {
    home:      '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/>',
    builder:   '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/><path d="M9 9l1 0"/><path d="M9 13l6 0"/><path d="M9 17l6 0"/>',
    autopilot: '<path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3"/><path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3"/><path d="M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    jobs:      '<path d="M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9"/><path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2"/><path d="M12 12l0 .01"/><path d="M3 13a20 20 0 0 0 18 0"/>',
    match:     '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
    interview: '<path d="M9 5a3 3 0 0 1 3 -3a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3a3 3 0 0 1 -3 -3l0 -5"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M8 21l8 0"/><path d="M12 17l0 4"/>',
    cover:     '<path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10"/><path d="M3 7l9 6l9 -6"/>',
    letter:    '<path d="M12 18h-7a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v7.5"/><path d="M3 6l9 6l9 -6"/><path d="M15 18h6"/><path d="M18 15l3 3l-3 3"/>',
    coach:     '<path d="M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1"/>',
    brag:      '<path d="M6 9a6 6 0 1 0 12 0a6 6 0 1 0 -12 0"/><path d="M12 15l3.4 5.89l1.598 -3.233l3.598 .232l-3.4 -5.889"/><path d="M6.802 12l-3.4 5.89l3.598 -.233l1.598 3.232l3.4 -5.889"/>',
    days90:    '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M16 3l0 4"/><path d="M8 3l0 4"/><path d="M4 11l16 0"/><path d="M8 15h2v2h-2l0 -2"/>',
    skill:     '<path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M7 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/>',
    salary:    '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M14.8 9a2 2 0 0 0 -1.8 -1h-2a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4h-2a2 2 0 0 1 -1.8 -1"/><path d="M12 7v10"/>'
  };
  var NAV = [
    ['dashboard',   'Home',           '/dashboard',    'home'],
    ['SEP'],
    ['editor',      'Resume Builder', '/editor',       'builder'],
    ['autopilot',   'Autopilot',      '/autopilot',    'autopilot'],
    ['cover-letter','Cover Letter',   '/cover-letter', 'cover'],
    ['letters',     'Letter Writer',  '/letters',      'letter'],
    ['match',       'Best Match',     '/match',        'match'],
    ['SEP'],
    ['interview',   'Interview Prep', '/interview',    'interview'],
    ['assistant',   'Career Coach',   '/assistant',    'coach'],
    ['jobs',        'Job Tracker',    '/jobs',         'jobs'],
    ['SEP'],
    ['skill-gap',    'Skill Gap',     '/skill-gap',     'skill'],
    ['salary',       'Salary Insights','/salary',       'salary'],
    ['brag-doc',     'Brag Doc',      '/brag-doc',      'brag'],
    ['first-90-days','First 90 Days', '/first-90-days', 'days90']
  ];

  var here = location.pathname.replace(/^\//, '').replace(/[?#].*$/, '').replace(/\.html$/, '') || 'dashboard';

  var css =
    'body.has-rail{--rail-w:60px;padding-left:var(--rail-w);}' +
    '.app-rail{position:fixed;left:0;top:0;bottom:0;z-index:70;display:flex;flex-direction:column;gap:2px;' +
      'width:var(--rail-w);background:var(--bg-1);border-right:1px solid var(--border);' +
      'padding:10px 0;overflow-x:hidden;overflow-y:auto;scrollbar-width:none;' +
      'transition:width .18s cubic-bezier(.4,0,.2,1),box-shadow .18s;}' +
    '.app-rail::-webkit-scrollbar{display:none;}' +
    '.app-rail:hover{width:220px;box-shadow:0 24px 60px rgba(0,0,0,.36);}' +
    '.rail-top{height:46px;flex-shrink:0;}' +   /* clears the topbar row so items start below it */
    '.rail-item{display:flex;align-items:center;gap:13px;height:42px;padding:0 19px;color:var(--muted);' +
      'white-space:nowrap;border-left:2px solid transparent;cursor:pointer;transition:color .14s,background .14s;}' +
    '.rail-item:hover{color:var(--text);background:var(--bg-2);}' +
    '.rail-item.active{color:var(--text);border-left-color:var(--accent);background:linear-gradient(90deg,rgba(91,84,232,.14),transparent);}' +
    '.rail-item svg{width:20px;height:20px;flex-shrink:0;}' +
    '.rail-item.active svg{color:var(--accent);}' +
    '.rail-item span{font-size:13.5px;font-weight:550;opacity:0;transform:translateX(-4px);transition:opacity .15s,transform .15s;}' +
    '.app-rail:hover .rail-item span{opacity:1;transform:none;}' +
    '.rail-sep{height:1px;margin:8px 14px;background:var(--border);}' +
    'body.has-rail .app-topbar .topbar-tabs{display:none!important;}' +
    '@media(max-width:900px){body.has-rail{padding-left:0;}.app-rail{display:none;}' +
      'body.has-rail .app-topbar .topbar-tabs{display:flex!important;}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var items = NAV.map(function (n) {
    if (n[0] === 'SEP') return '<div class="rail-sep"></div>';
    var active = n[0] === here ? ' active' : '';
    return '<a class="rail-item' + active + '" href="' + n[2] + '" title="' + n[1] + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[n[3]] + '</svg>' +
      '<span>' + n[1] + '</span></a>';
  }).join('');

  var rail = document.createElement('nav');
  rail.className = 'app-rail';
  rail.setAttribute('aria-label', 'Primary navigation');
  rail.innerHTML = '<div class="rail-top"></div>' + items;

  document.body.appendChild(rail);
  document.body.classList.add('has-rail');
})();
