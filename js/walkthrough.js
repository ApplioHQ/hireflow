/* walkthrough.js, interactive guided tour of the editor. Runs ONCE after onboarding
   (or on first editor visit for already-onboarded users), spotlighting real UI elements
   with anchored tooltips so users learn where the tools are. Desktop-focused: below
   900px the rail collapses and the sidebar becomes a drawer, so the anchors aren't
   reliable, we mark it done there rather than show a broken tour. Self-contained. */
(function () {
  'use strict';
  var FLAG = 'hf_walkthrough_done';

  // Steps anchor to real elements. `find` returns the element (or null to skip a step
  // whose target isn't on the page). Order walks left-to-right, build -> optimize -> ship.
  var STEPS = [
    { find: function () { return document.querySelector('.sidebar'); }, place: 'right',
      title: 'Build your resume here', body: 'Add each part of your resume, one section at a time, on the left. It saves and previews as you go.' },
    { find: function () { return document.querySelector('.sidebar-item[data-section="ats"]'); }, place: 'right',
      title: 'Check your ATS score', body: 'Paste a job posting and see how your resume scores against the filters, and exactly what to fix.' },
    { find: function () { return document.querySelector('.sidebar-item[data-section="tailor"]'); }, place: 'right',
      title: 'Tailor to any job', body: 'Let AI rewrite your resume to match a specific job description, so every application fits.' },
    { find: function () { return document.getElementById('btn-export'); }, place: 'bottom',
      title: 'Export when you are ready', body: 'Download a clean, recruiter-ready, ATS-safe PDF in one click.' },
    { find: function () { return document.querySelector('.app-rail'); }, place: 'right',
      title: 'All your other tools', body: 'Autopilot, Cover Letter, Interview Prep, Salary Insights and more live in this rail. Hover to expand it.' }
  ];

  var i = 0, steps = [], overlay, hole, tip;

  function injectCSS() {
    if (document.getElementById('wt-css')) return;
    var css = ''
      + '#wt-overlay{position:fixed;inset:0;z-index:100000;pointer-events:auto;}'
      + '#wt-hole{position:fixed;border-radius:12px;box-shadow:0 0 0 9999px rgba(4,6,18,.74);transition:all .25s ease;pointer-events:none;outline:2px solid var(--accent,#6366f1);outline-offset:2px;}'
      + '#wt-tip{position:fixed;max-width:300px;background:#0d1130;color:var(--text,#e6e9f5);border:1px solid var(--border,#2a2f55);border-radius:14px;padding:16px 18px;box-shadow:0 20px 50px rgba(0,0,0,.5);transition:all .25s ease;z-index:100001;}'
      + '#wt-tip h4{font-size:15px;font-weight:800;margin:0 0 6px;}'
      + '#wt-tip p{font-size:13px;line-height:1.55;color:var(--muted,#9aa3c7);margin:0 0 14px;}'
      + '.wt-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;}'
      + '.wt-dots{display:flex;gap:5px;}'
      + '.wt-dot{width:6px;height:6px;border-radius:50%;background:var(--border,#2a2f55);}'
      + '.wt-dot.on{background:var(--accent,#6366f1);}'
      + '.wt-btns{display:flex;gap:8px;}'
      + '.wt-btn{border:0;border-radius:9px;font-size:13px;font-weight:700;padding:8px 16px;cursor:pointer;background:var(--accent,#6366f1);color:#fff;}'
      + '.wt-skip{background:none;color:var(--muted,#9aa3c7);font-size:12.5px;font-weight:600;border:0;cursor:pointer;padding:8px 6px;}'
      + '@media(prefers-reduced-motion:reduce){#wt-hole,#wt-tip{transition:none;}}';
    var st = document.createElement('style'); st.id = 'wt-css'; st.textContent = css;
    document.head.appendChild(st);
  }

  function done() {
    try { localStorage.setItem(FLAG, '1'); } catch (e) {}
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    document.removeEventListener('keydown', onKey);
    if (overlay) { overlay.style.opacity = '0'; setTimeout(function () { if (overlay) overlay.remove(); }, 200); }
  }

  function onKey(e) { if (e.key === 'Escape') done(); else if (e.key === 'Enter' || e.key === 'ArrowRight') next(); }

  function dots() {
    return '<div class="wt-dots">' + steps.map(function (_, n) { return '<span class="wt-dot' + (n === i ? ' on' : '') + '"></span>'; }).join('') + '</div>';
  }

  function renderTip() {
    var s = steps[i];
    var last = i === steps.length - 1;
    tip.innerHTML = '<h4>' + s.title + '</h4><p>' + s.body + '</p>'
      + '<div class="wt-foot">' + dots()
      + '<div class="wt-btns">'
      + (last ? '' : '<button class="wt-skip" data-wt="skip">Skip</button>')
      + '<button class="wt-btn" data-wt="next">' + (last ? 'Done' : 'Next') + '</button>'
      + '</div></div>';
  }

  function position() {
    var s = steps[i]; if (!s) return;
    var el = s.el;
    var r = el.getBoundingClientRect();
    var pad = 6;
    hole.style.left = (r.left - pad) + 'px';
    hole.style.top = (r.top - pad) + 'px';
    hole.style.width = (r.width + pad * 2) + 'px';
    hole.style.height = (r.height + pad * 2) + 'px';
    // Place the tooltip, preferring the step's side, then clamping into the viewport.
    var tr = tip.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight, gap = 14;
    var x, y;
    if (s.place === 'right' && r.right + gap + tr.width < vw) { x = r.right + gap; y = r.top; }
    else if (s.place === 'bottom' || r.bottom + gap + tr.height < vh) { x = r.left; y = r.bottom + gap; }
    else if (r.left - gap - tr.width > 0) { x = r.left - gap - tr.width; y = r.top; }   // left
    else { x = r.left; y = r.top - gap - tr.height; }                                    // top
    x = Math.max(12, Math.min(x, vw - tr.width - 12));
    y = Math.max(12, Math.min(y, vh - tr.height - 12));
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function show() {
    var s = steps[i];
    // Bring the target into view (sidebar items may be below the fold), then position.
    try { s.el.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) {}
    renderTip();
    // Position synchronously (reading getBoundingClientRect forces the layout we need),
    // then again shortly after in case the scrollIntoView is still settling. Not relying
    // on requestAnimationFrame, which is throttled in background/inactive tabs.
    position();
    setTimeout(position, 80);
  }

  function next() { if (i < steps.length - 1) { i++; show(); } else { done(); } }

  function start(force) {
    if (document.getElementById('wt-overlay')) return;            // already running: never stack overlays
    try { if (!force && localStorage.getItem(FLAG)) return; } catch (e) { return; }
    if (window.innerWidth < 900) { try { localStorage.setItem(FLAG, '1'); } catch (e) {} return; }  // desktop only
    // Resolve which steps have a live target right now.
    steps = STEPS.map(function (s) { var el = s.find(); return el ? Object.assign({}, s, { el: el }) : null; }).filter(Boolean);
    if (!steps.length) return;
    injectCSS();
    overlay = document.createElement('div');
    overlay.id = 'wt-overlay';
    overlay.style.transition = 'opacity .2s ease';
    overlay.innerHTML = '<div id="wt-hole"></div><div id="wt-tip"></div>';
    document.body.appendChild(overlay);
    hole = document.getElementById('wt-hole');
    tip = document.getElementById('wt-tip');
    overlay.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-wt]') : null;
      if (t) { e.preventDefault(); (t.getAttribute('data-wt') === 'next') ? next() : done(); }
    });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('keydown', onKey);
    i = 0; show();
  }

  // Public hook: onboarding calls this right after it finishes.
  window.startAppWalkthrough = function () { setTimeout(function () { start(false); }, 400); };

  // Auto-run for users who are already onboarded but haven't seen the walkthrough
  // (e.g. existing users, or someone who onboarded on another device).
  function autoRun() {
    try {
      if (!localStorage.getItem('hf_token')) return;
      if (!localStorage.getItem('hf_onboarded')) return;   // onboarding will call us when it finishes
      if (localStorage.getItem(FLAG)) return;
    } catch (e) { return; }
    setTimeout(function () { start(false); }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoRun);
  else autoRun();
})();
