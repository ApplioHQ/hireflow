/* onboarding.js, mandatory first-run flow for new users.
   Full-screen, immersive, un-skippable. Four questionnaire screens then a required
   import-or-build step, before the user ever sees the editor. Triggers only when
   localStorage has no `hf_onboarded`, and only for a signed-in user. Replaces the old
   skippable welcome modal and the three-step tooltip tour. Self-contained. */
(function () {
  'use strict';
  try {
    if (localStorage.getItem('hf_onboarded')) return;      // existing / finished users: never show
    if (!localStorage.getItem('hf_token')) return;         // must be signed in
  } catch (e) { return; }

  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';
  var TOKEN = null;
  try { TOKEN = localStorage.getItem('hf_token'); } catch (e) {}

  var answers = { stage: '', challenge: '', heardFrom: '' };
  var step = 0;                 // 0..4 (5 screens: welcome, 3 questions, import)
  var TOTAL = 5;

  var QUESTIONS = {
    1: { key: 'stage', title: 'Where are you in your job search?', options: ['Actively applying now', 'Starting to look', 'Preparing for future opportunities', 'Just exploring'] },
    2: { key: 'challenge', title: "What's your biggest challenge?", options: ['Getting past ATS filters', 'Writing strong bullets', 'Tailoring to each job', 'Interview preparation', 'Starting from scratch'] },
    3: { key: 'heardFrom', title: 'How did you hear about Applio?', options: ['TikTok', 'Product Hunt', 'Google', 'Friend or colleague', 'Other'] },
  };

  function injectCSS() {
    if (document.getElementById('onb-css')) return;
    var css = ''
      + '#onb-overlay{position:fixed;inset:0;z-index:99999;background:#07091a;color:var(--text,#e6e9f5);overflow:hidden;display:flex;flex-direction:column;font-family:inherit;}'
      + '.onb-prog{height:4px;background:rgba(255,255,255,.08);flex-shrink:0;}'
      + '.onb-prog-fill{height:100%;background:var(--accent,#6366f1);width:20%;transition:width .3s ease;}'
      + '.onb-viewport{flex:1;overflow:hidden;position:relative;}'
      + '.onb-track{display:flex;height:100%;width:500%;transition:transform .25s ease;}'
      + '.onb-screen{width:20%;height:100%;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;box-sizing:border-box;text-align:center;}'
      + '.onb-inner{width:100%;max-width:620px;}'
      + '.onb-logo{width:56px;height:56px;border-radius:15px;margin:0 auto 22px;display:block;box-shadow:0 12px 34px rgba(99,102,241,.4);}'
      + '.onb-h1{font-size:clamp(26px,5vw,38px);font-weight:800;letter-spacing:-.5px;margin:0 0 10px;}'
      + '.onb-tag{color:var(--muted,#9aa3c7);font-size:16px;margin:0 0 32px;}'
      + '.onb-q{font-size:clamp(22px,4vw,30px);font-weight:800;letter-spacing:-.3px;margin:0 0 6px;}'
      + '.onb-sub{color:var(--muted,#9aa3c7);font-size:14px;margin:0 0 26px;}'
      + '.onb-cards{display:flex;flex-direction:column;gap:12px;text-align:left;}'
      + '.onb-card{display:flex;align-items:center;gap:14px;padding:18px 20px;border-radius:14px;background:#0d1130;border:1.5px solid var(--border,#2a2f55);cursor:pointer;transition:border-color .15s,background .15s,transform .1s;font-size:16px;font-weight:600;color:var(--text,#e6e9f5);}'
      + '.onb-card:hover{border-color:var(--accent,#6366f1);}'
      + '.onb-card:active{transform:scale(.99);}'
      + '.onb-card.sel{border-color:var(--accent,#6366f1);background:rgba(99,102,241,.12);}'
      + '.onb-check{margin-left:auto;width:22px;height:22px;border-radius:50%;border:2px solid var(--border,#2a2f55);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;}'
      + '.onb-card.sel .onb-check{background:var(--accent,#6366f1);border-color:var(--accent,#6366f1);}'
      + '.onb-nav{display:flex;gap:12px;justify-content:center;margin-top:30px;}'
      + '.onb-btn{border:0;border-radius:12px;font-size:16px;font-weight:700;padding:14px 30px;cursor:pointer;transition:opacity .15s,transform .1s;background:var(--accent,#6366f1);color:#fff;}'
      + '.onb-btn:disabled{opacity:.4;cursor:not-allowed;}'
      + '.onb-btn:not(:disabled):active{transform:scale(.98);}'
      + '.onb-btn.ghost{background:transparent;border:1.5px solid var(--border,#2a2f55);color:var(--text,#e6e9f5);}'
      + '.onb-build{display:grid;grid-template-columns:1fr 1fr;gap:18px;text-align:left;margin-top:6px;}'
      + '.onb-bcard{padding:26px 24px;border-radius:18px;background:#0d1130;border:1.5px solid var(--border,#2a2f55);display:flex;flex-direction:column;gap:10px;}'
      + '.onb-bcard.primary{border-color:var(--accent,#6366f1);background:rgba(99,102,241,.08);transform:scale(1.02);}'
      + '.onb-bico{width:44px;height:44px;color:var(--accent,#6366f1);}'
      + '.onb-bt{font-size:19px;font-weight:800;}'
      + '.onb-bd{color:var(--muted,#9aa3c7);font-size:14px;line-height:1.55;flex:1;}'
      + '.onb-ta{width:100%;box-sizing:border-box;min-height:220px;margin-top:8px;padding:14px 16px;background:#0d1130;border:1.5px solid var(--border,#2a2f55);border-radius:14px;color:var(--text,#e6e9f5);font-size:14px;line-height:1.55;font-family:inherit;resize:vertical;}'
      + '.onb-ta:focus{outline:none;border-color:var(--accent,#6366f1);}'
      + '@media(max-width:768px){.onb-build{grid-template-columns:1fr;}.onb-bcard.primary{transform:none;}}';
    var st = document.createElement('style'); st.id = 'onb-css'; st.textContent = css;
    document.head.appendChild(st);
  }

  var overlay, track, progFill;

  function iconBuilder() { return '<svg class="onb-bico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'; }
  function iconFresh() { return '<svg class="onb-bico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>'; }
  function check() { return '<span class="onb-check"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>'; }

  function questionScreen(n) {
    var q = QUESTIONS[n];
    var cards = q.options.map(function (opt, i) {
      var sel = answers[q.key] === opt ? ' sel' : '';
      return '<div class="onb-card' + sel + '" data-q="' + q.key + '" data-opt="' + i + '">' + opt + check() + '</div>';
    }).join('');
    var canNext = !!answers[q.key];
    return '<div class="onb-inner">'
      + '<h2 class="onb-q">' + q.title + '</h2>'
      + '<p class="onb-sub">This tailors Applio to you. One tap.</p>'
      + '<div class="onb-cards" data-cards="' + q.key + '">' + cards + '</div>'
      + '<div class="onb-nav"><button class="onb-btn" data-next ' + (canNext ? '' : 'disabled') + '>Next</button></div>'
      + '</div>';
  }

  function buildScreenHTML() {
    return '<div class="onb-inner" id="onb-build-inner">'
      + '<h2 class="onb-q">Let\'s build your resume</h2>'
      + '<p class="onb-sub">Pick one to get started. This is the fun part.</p>'
      + '<div class="onb-build">'
      +   '<div class="onb-bcard primary">' + iconBuilder()
      +     '<div class="onb-bt">Import existing resume</div>'
      +     '<div class="onb-bd">Paste your resume text and AI fills everything in seconds.</div>'
      +     '<button class="onb-btn" data-import>Import resume</button>'
      +   '</div>'
      +   '<div class="onb-bcard">' + iconFresh()
      +     '<div class="onb-bt">Start from scratch</div>'
      +     '<div class="onb-bd">Fill in your details section by section.</div>'
      +     '<button class="onb-btn ghost" data-fresh>Start fresh</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }

  function importViewHTML(prefill) {
    return '<div class="onb-inner">'
      + '<h2 class="onb-q">Paste your resume</h2>'
      + '<p class="onb-sub">Copy the text from your existing resume. AI reads it and fills every section.</p>'
      + '<textarea class="onb-ta" id="onb-import-ta" placeholder="Paste your resume text here...">' + (prefill || '') + '</textarea>'
      + '<div class="onb-nav">'
      +   '<button class="onb-btn ghost" data-import-back>Back</button>'
      +   '<button class="onb-btn" data-analyze>Analyze with AI</button>'
      + '</div>'
      + '</div>';
  }

  function screenHTML(n) {
    if (n === 0) {
      return '<div class="onb-inner">'
        + '<img class="onb-logo" src="/logo.jpeg" alt="Applio">'
        + '<h1 class="onb-h1">Welcome to Applio</h1>'
        + '<p class="onb-tag">Your AI career copilot</p>'
        + '<div class="onb-nav"><button class="onb-btn" data-next>Get started</button></div>'
        + '</div>';
    }
    if (n >= 1 && n <= 3) return questionScreen(n);
    return buildScreenHTML();
  }

  function render() {
    track.innerHTML = [0, 1, 2, 3, 4].map(function (n) {
      return '<section class="onb-screen">' + screenHTML(n) + '</section>';
    }).join('');
    goTo(step, true);
  }

  function goTo(n, instant) {
    step = n;
    if (instant) track.style.transition = 'none';
    track.style.transform = 'translateX(-' + (n * 20) + '%)';
    if (instant) requestAnimationFrame(function () { track.style.transition = ''; });
    progFill.style.width = ((n + 1) / TOTAL * 100) + '%';
  }

  function selectOption(key, optIdx) {
    var q = Object.values(QUESTIONS).find(function (x) { return x.key === key; });
    answers[key] = q.options[optIdx];
    // Update the cards + enable Next within the current screen only.
    var screen = track.children[step];
    screen.querySelectorAll('[data-cards="' + key + '"] .onb-card').forEach(function (c, i) {
      c.classList.toggle('sel', i === optIdx);
    });
    var nx = screen.querySelector('[data-next]'); if (nx) nx.disabled = false;
  }

  function finishQuestionnaire() {
    // Persist locally + fire-and-forget to the worker (never block on it).
    try { localStorage.setItem('hf_onboarding_answers', JSON.stringify(answers)); } catch (e) {}
    if (API && TOKEN) {
      fetch(API + '/onboarding-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
        body: JSON.stringify({ answers: answers })
      }).catch(function () {});
    }
    goTo(4);   // to the import/build step
  }

  function finish(goPersonal) {
    try { localStorage.setItem('hf_onboarded', '1'); } catch (e) {}
    if (overlay) { overlay.style.transition = 'opacity .2s'; overlay.style.opacity = '0'; setTimeout(function () { if (overlay) overlay.remove(); }, 210); }
    document.documentElement.style.overflow = '';
    if (goPersonal && typeof goSection === 'function') { try { goSection('personal'); } catch (e) {} }
  }

  function showImportView() {
    var prefill = '';
    try { prefill = localStorage.getItem('hf_pending_import') || ''; localStorage.removeItem('hf_pending_import'); } catch (e) {}
    var buildScreen = track.children[4];
    buildScreen.innerHTML = importViewHTML(prefill);
    var ta = document.getElementById('onb-import-ta'); if (ta) ta.focus();
  }

  function showBuildChoice() {
    track.children[4].innerHTML = buildScreenHTML();
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-next],[data-opt],[data-import],[data-fresh],[data-analyze],[data-import-back]') : null;
    if (!t) return;
    if (t.hasAttribute('data-opt')) { selectOption(t.getAttribute('data-q'), +t.getAttribute('data-opt')); return; }
    if (t.hasAttribute('data-next')) {
      if (step === 3) return finishQuestionnaire();   // last question -> save + go to import
      if (step < 3) return goTo(step + 1);
      return;
    }
    if (t.hasAttribute('data-import')) { showImportView(); return; }
    if (t.hasAttribute('data-import-back')) { showBuildChoice(); return; }
    if (t.hasAttribute('data-fresh')) { finish(true); return; }        // start fresh -> Personal Info
    if (t.hasAttribute('data-analyze')) {
      var ta = document.getElementById('onb-import-ta');
      var text = ta ? ta.value : '';
      if (!text.trim()) { if (typeof toast === 'function') toast('Paste your resume text first', { type: 'warn' }); return; }
      t.disabled = true; t.textContent = 'Analyzing...';
      Promise.resolve(typeof importResume === 'function' ? importResume(text) : false).then(function (ok) {
        if (ok) { finish(true); }                    // success -> drop into editor on Personal Info
        else { t.disabled = false; t.textContent = 'Analyze with AI'; }
      });
      return;
    }
  }

  function start() {
    injectCSS();
    overlay = document.createElement('div');
    overlay.id = 'onb-overlay';
    overlay.innerHTML = '<div class="onb-prog"><div class="onb-prog-fill" id="onb-prog-fill"></div></div>'
      + '<div class="onb-viewport"><div class="onb-track" id="onb-track"></div></div>';
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';
    track = document.getElementById('onb-track');
    progFill = document.getElementById('onb-prog-fill');
    render();
    overlay.addEventListener('click', onClick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
