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

  var ICONS = {
    home:    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    builder: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    autopilot:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
    jobs:    '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    match:   '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    interview:'<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>',
    cover:   '<path d="M4 4h16v16H4z"/><path d="M22 6l-10 7L2 6"/>',
    coach:   '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    brag:    '<path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z"/>',
    days90:  '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    skill:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'
  };
  var NAV = [
    ['dashboard',   'Home',           '/dashboard',    'home'],
    ['SEP'],
    ['editor',      'Resume Builder', '/editor',       'builder'],
    ['autopilot',   'Autopilot',      '/autopilot',    'autopilot'],
    ['cover-letter','Cover Letter',   '/cover-letter', 'cover'],
    ['match',       'Best Match',     '/match',        'match'],
    ['SEP'],
    ['interview',   'Interview Prep', '/interview',    'interview'],
    ['assistant',   'Career Coach',   '/assistant',    'coach'],
    ['jobs',        'Job Tracker',    '/jobs',         'jobs'],
    ['SEP'],
    ['skill-gap',    'Skill Gap',     '/skill-gap',     'skill'],
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
