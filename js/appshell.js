/* appshell.js, a persistent bottom dock for the app (macOS style).
   A vanilla port of the 21st.dev Apple-style dock: the panel grows on hover, each
   item magnifies by its distance from the cursor, and a label floats above the
   hovered item. Applio has no build step, so framer-motion's spring is reproduced
   here with the same constants rather than imported.

   Additive + robust: injects a fixed dock centred on the bottom edge and pads the
   <body> so nothing hides behind it. Include on any app page:
     <script src="/js/appshell.js"></script>
   Self-contained (injects its own CSS); only adds a body class + the dock element. */
(function () {
  'use strict';
  if (document.querySelector('.app-dock')) return;

  // Tabler icons (stroke-width 2, currentColor). Only the inner elements, the dock
  // wraps them with the <svg> element.
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
    ['dashboard',    'Home',            '/dashboard',     'home'],
    ['editor',       'Resume Builder',  '/editor',        'builder'],
    ['autopilot',    'Autopilot',       '/autopilot',     'autopilot'],
    ['cover-letter', 'Cover Letter',    '/cover-letter',  'cover'],
    ['letters',      'Letter Writer',   '/letters',       'letter'],
    ['match',        'Best Match',      '/match',         'match'],
    ['interview',    'Interview Prep',  '/interview',     'interview'],
    ['assistant',    'Career Coach',    '/assistant',     'coach'],
    ['jobs',         'Job Tracker',     '/jobs',          'jobs'],
    ['skill-gap',    'Skill Gap',       '/skill-gap',     'skill'],
    ['salary',       'Salary Insights', '/salary',        'salary'],
    ['brag-doc',     'Brag Doc',        '/brag-doc',      'brag'],
    ['first-90-days','First 90 Days',   '/first-90-days', 'days90']
  ];
  var here = location.pathname.replace(/^\//, '').replace(/[?#].*$/, '').replace(/\.html$/, '') || 'dashboard';

  // Dock geometry, matching the reference component exactly.
  var PANEL_H = 64;          // collapsed panel height
  var MAGNIFICATION = 80;    // widest an item gets under the cursor
  var BASE_W = 40;           // resting item width
  var DISTANCE = 150;        // cursor range over which magnification falls off
  var DOCK_H = Math.max(128, MAGNIFICATION + MAGNIFICATION / 2 + 4);
  // framer-motion spring: { mass: 0.1, stiffness: 150, damping: 12 }. Overdamped
  // (damping 12 > critical 2*sqrt(150*0.1) = 7.75), so it settles without overshoot.
  var MASS = 0.1, STIFFNESS = 150, DAMPING = 12;

  var css =
    'body.has-dock{padding-bottom:88px;}' +
    // Wrapper pins the dock to the bottom edge; the reference uses bottom-2 (8px).
    '.app-dock{position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:70;max-width:100%;' +
      'pointer-events:none;}' +
    // Scroll container (mx-2 flex max-w-full items-end overflow-x-auto). overflow-y
    // is deliberately left visible (the reference never sets it): the panel below
    // is pinned to a fixed height, so a magnified item is taller than the panel and
    // has to overflow upward, past its rounded top edge, to produce the "pops out
    // of the dock" look. Clipping the y-axis here would hide that entirely.
    '.dock-scroll{margin:0 8px;display:flex;align-items:flex-end;max-width:100%;overflow-x:auto;' +
      'scrollbar-width:none;scroll-snap-type:x proximity;pointer-events:auto;}' +
    '.dock-scroll::-webkit-scrollbar{display:none;}' +
    // Panel (mx-auto flex w-fit gap-4 rounded-2xl px-4 + demo's items-end pb-3).
    // height is fixed at PANEL_H, never animated (only the scroll container's height
    // springs open) -- that mismatch between a growing item and a static panel is
    // exactly what makes the magnified icon spill out above the bar.
    '.dock-panel{margin:0 auto;display:flex;align-items:flex-end;gap:16px;width:-moz-fit-content;width:fit-content;' +
      'height:64px;border-radius:16px;padding:0 16px 12px;background:#171717;border:1px solid transparent;}' +
    // Item (relative inline-flex items-center justify-center aspect-square rounded-full).
    '.dock-item{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;' +
      'aspect-ratio:1;border-radius:9999px;background:#262626;color:#d4d4d4;text-decoration:none;' +
      'scroll-snap-align:center;min-width:24px;min-height:24px;}' +
    '.dock-item:focus-visible{outline:2px solid var(--accent,#6d4dfc);outline-offset:3px;}' +
    // The icon is half the item width, so it grows with the magnification.
    '.dock-icon{display:flex;align-items:center;justify-content:center;}' +
    '.dock-icon svg{width:100%;height:100%;display:block;}' +
    // Label (absolute -top-6 left-1/2 rounded-md border px-2 py-0.5 text-xs).
    '.dock-label{position:absolute;top:-24px;left:50%;width:-moz-fit-content;width:fit-content;white-space:pre;' +
      'border-radius:6px;border:1px solid #171717;background:#262626;color:#fff;padding:2px 8px;' +
      'font-size:12px;line-height:16px;opacity:0;transform:translateX(-50%);pointer-events:none;}' +
    '.dock-item:hover .dock-label,.dock-item:focus-visible .dock-label{opacity:1;transform:translateX(-50%) translateY(-10px);}' +
    // Light theme uses the reference's light palette; Applio switches via html.light-mode.
    'html.light-mode .dock-panel{background:#f9fafb;}' +
    'html.light-mode .dock-item{background:#e5e7eb;color:#525252;}' +
    'html.light-mode .dock-label{background:#f3f4f6;border-color:#e5e7eb;color:#404040;}' +
    // Current page: tint the icon only, so the dock's geometry is untouched. Must
    // follow (and match the specificity of) the light-mode rule above, which also
    // sets colour and would otherwise win in light mode.
    '.dock-item[aria-current="page"],html.light-mode .dock-item[aria-current="page"]{color:var(--accent,#6d4dfc);}' +
    // Touch targets below 44px are hard to hit, and coarse pointers never magnify.
    '@media(pointer:coarse){.dock-item{min-width:44px;min-height:44px;}}' +
    '@media(prefers-reduced-motion:no-preference){.dock-label{transition:opacity .2s,transform .2s;}}' +
    // Forced colors replaces background, so lean on system colors and a real border.
    '@media(forced-colors:active){.dock-panel,.dock-item,.dock-label{border-color:ButtonText;}' +
      '.dock-item{color:ButtonText;}.dock-item[aria-current="page"]{color:Highlight;}}' +
    // The per-page .topbar-tabs are superseded by this dock. One source of nav.
    'body.has-dock .app-topbar .topbar-tabs{display:none!important;}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var items = NAV.map(function (n) {
    var current = n[0] === here ? ' aria-current="page"' : '';
    return '<a class="dock-item" href="' + n[2] + '" aria-label="' + n[1] + '"' + current + '>' +
      '<span class="dock-label" aria-hidden="true">' + n[1] + '</span>' +
      '<span class="dock-icon">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n[3]] + '</svg>' +
      '</span></a>';
  }).join('');

  // A <nav> of links, not the reference's role="toolbar" of role="button" divs:
  // these navigate, so they belong in the tab order as real links.
  var dock = document.createElement('nav');
  dock.className = 'app-dock';
  dock.setAttribute('aria-label', 'Primary');
  dock.innerHTML = '<div class="dock-scroll"><div class="dock-panel">' + items + '</div></div>';
  document.body.appendChild(dock);
  document.body.classList.add('has-dock');

  var scroll = dock.querySelector('.dock-scroll');
  var panel = dock.querySelector('.dock-panel');
  var nodes = [].slice.call(dock.querySelectorAll('.dock-item'));

  // One spring per animated value: the scroll container's height plus each item's width.
  function spring(value) { return { x: value, v: 0, target: value }; }
  var heightSpring = spring(PANEL_H);
  var widths = nodes.map(function () { return spring(BASE_W); });
  var icons = nodes.map(function (el) { return el.querySelector('.dock-icon'); });

  var mouseX = Infinity;
  var hovering = false;
  var running = false;
  var lastT = 0;

  // Magnification curve, matching useTransform's clamped 3-point interpolation:
  // [-DISTANCE, 0, DISTANCE] -> [BASE_W, MAGNIFICATION, BASE_W].
  function widthFor(el) {
    if (!hovering || mouseX === Infinity) return BASE_W;
    var r = el.getBoundingClientRect();
    var d = mouseX - r.x - r.width / 2;
    if (d <= -DISTANCE || d >= DISTANCE) return BASE_W;
    var t = 1 - Math.abs(d) / DISTANCE;
    return BASE_W + (MAGNIFICATION - BASE_W) * t;
  }

  function advance(s, h) {
    var a = (-STIFFNESS * (s.x - s.target) - DAMPING * s.v) / MASS;
    s.v += a * h;
    s.x += s.v * h;
    if (Math.abs(s.x - s.target) < 0.01 && Math.abs(s.v) < 0.05) { s.x = s.target; s.v = 0; return false; }
    return true;
  }

  // Retarget on pointer events only, never per frame. Magnifying an item moves its
  // own centre, so recomputing every frame feeds that shift back into the distance
  // and the springs settle well short of MAGNIFICATION. framer-motion derives the
  // distance from mouseX, so it recomputes exactly when the pointer moves.
  function retarget() {
    heightSpring.target = hovering ? DOCK_H : PANEL_H;
    for (var i = 0; i < nodes.length; i++) widths[i].target = widthFor(nodes[i]);
  }

  function frame(now) {
    var dt = lastT ? Math.min((now - lastT) / 1000, 0.064) : 0.016;
    lastT = now;
    // Sub-step the integrator: a stiff spring at a low mass is unstable on long frames.
    var steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    var h = dt / steps;

    var moving = false;
    for (var s = 0; s < steps; s++) {
      if (advance(heightSpring, h)) moving = true;
      for (var j = 0; j < widths.length; j++) if (advance(widths[j], h)) moving = true;
    }

    scroll.style.height = heightSpring.x + 'px';
    for (var k = 0; k < nodes.length; k++) {
      nodes[k].style.width = widths[k].x + 'px';
      icons[k].style.width = widths[k].x / 2 + 'px';
      icons[k].style.height = widths[k].x / 2 + 'px';
    }

    if (moving) requestAnimationFrame(frame);
    else { running = false; lastT = 0; }
  }
  function start() { if (!running) { running = true; lastT = 0; requestAnimationFrame(frame); } }

  // Magnification is a pointer affordance: only wire it where hover really exists,
  // and leave it off entirely when the user asks for reduced motion.
  var canHover = window.matchMedia('(hover: hover)').matches;
  var wantsMotion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (canHover && wantsMotion) {
    // clientX pairs with getBoundingClientRect's viewport coordinates; the original
    // reads pageX against the same rect, which drifts once the page scrolls sideways.
    panel.addEventListener('mousemove', function (e) { hovering = true; mouseX = e.clientX; retarget(); start(); });
    panel.addEventListener('mouseleave', function () { hovering = false; mouseX = Infinity; retarget(); start(); });
  }

  // Resting layout, so the dock is correct before any pointer movement.
  scroll.style.height = PANEL_H + 'px';
  nodes.forEach(function (el, i) {
    el.style.width = BASE_W + 'px';
    icons[i].style.width = BASE_W / 2 + 'px';
    icons[i].style.height = BASE_W / 2 + 'px';
  });

  // Keep the current page in view when the dock overflows a narrow viewport.
  var active = dock.querySelector('.dock-item[aria-current="page"]');
  if (active && scroll.scrollWidth > scroll.clientWidth) {
    scroll.scrollLeft = active.offsetLeft - (scroll.clientWidth - active.offsetWidth) / 2;
  }
})();
