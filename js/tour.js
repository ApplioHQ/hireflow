/* tour.js, a super-short first-run guide for the editor. Three steps, shown once
   (localStorage flag), center-screen so it never fights element positioning or mobile
   layout. Each step points the user at the next high-value action: build, check ATS,
   let AI tailor. Skippable, dismissible, and self-contained (no dependencies). */
(function () {
  'use strict';
  var FLAG = 'hf_tour_done_v1';
  // Only for signed-in users on the editor, and only once.
  try {
    if (localStorage.getItem(FLAG)) return;
    if (!localStorage.getItem('hf_token')) return;   // anon users get the signup flow, not the tour
  } catch (e) { return; }

  var STEPS = [
    {
      icon: '📄',
      title: 'Welcome, let\'s get you set up',
      body: 'Start on the left: pick a template, then add your details, or import an existing resume in one click. Everything saves automatically and previews live on the right.',
      cta: 'Next'
    },
    {
      icon: '🎯',
      title: 'Check your ATS score',
      body: 'Open ATS Check in the sidebar to see how your resume scores against a real job posting, and exactly where it is weak, before you apply.',
      cta: 'Next'
    },
    {
      icon: '✦',
      title: 'Let AI do the heavy lifting',
      body: 'Paste a job into Autopilot and get a tailored resume, an ATS score, and a matching cover letter in one shot. Or tailor and improve bullets right here as you edit.',
      cta: 'Start building'
    }
  ];

  var i = 0, bd;

  function done() {
    try { localStorage.setItem(FLAG, '1'); } catch (e) {}
    if (bd) { bd.style.opacity = '0'; setTimeout(function () { if (bd) bd.remove(); }, 180); }
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') done();
    else if (e.key === 'Enter' || e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') back();
  }

  function dots() {
    return STEPS.map(function (_, n) {
      return '<span style="width:7px;height:7px;border-radius:50%;display:inline-block;margin:0 3px;background:' +
        (n === i ? 'var(--accent)' : 'var(--border)') + ';"></span>';
    }).join('');
  }

  function render() {
    var s = STEPS[i];
    bd.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" style="max-width:440px;text-align:center;position:relative;">' +
        '<button class="modal-close" aria-label="Skip" style="position:absolute;top:12px;right:14px;background:none;border:0;color:var(--muted);font-size:20px;cursor:pointer;" data-tour="skip">&times;</button>' +
        '<div style="font-size:40px;line-height:1;margin:8px 0 12px;">' + s.icon + '</div>' +
        '<h3 style="font-size:19px;font-weight:800;margin-bottom:8px;">' + s.title + '</h3>' +
        '<p style="color:var(--muted);font-size:14px;line-height:1.6;margin-bottom:18px;">' + s.body + '</p>' +
        '<div style="margin-bottom:16px;">' + dots() + '</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;">' +
          (i > 0 ? '<button class="btn btn-ghost btn-sm" data-tour="back">Back</button>' : '') +
          '<button class="btn btn-primary" data-tour="next">' + s.cta + '</button>' +
        '</div>' +
        (i === 0 ? '<div style="margin-top:12px;"><a href="#" data-tour="skip" style="color:var(--muted);font-size:12.5px;">Skip the tour</a></div>' : '') +
      '</div>';
  }

  function next() { if (i < STEPS.length - 1) { i++; render(); } else { done(); } }
  function back() { if (i > 0) { i--; render(); } }

  function start() {
    bd = document.createElement('div');
    bd.className = 'modal-backdrop open';
    bd.style.transition = 'opacity .18s ease';
    document.body.appendChild(bd);
    render();
    bd.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-tour]') : null;
      if (t) { e.preventDefault(); var a = t.getAttribute('data-tour'); if (a === 'next') next(); else if (a === 'back') back(); else done(); return; }
      if (e.target === bd) done();   // click outside dismisses
    });
    document.addEventListener('keydown', onKey);
  }

  // Give the editor a moment to render, and don't stack on top of the welcome/promo modals.
  function maybeStart() {
    if (document.getElementById('signup-prompt-bd') || document.getElementById('eb-celebrate-bd')) {
      return setTimeout(maybeStart, 1500);   // wait for a higher-priority modal to be dismissed
    }
    start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(maybeStart, 900); });
  else setTimeout(maybeStart, 900);
})();
