/* onboarding.js, mandatory first-run flow for new users.
   Full-screen, immersive. Seven screens: welcome, 3 questions, import/build,
   paste job description, match results. Triggers only when localStorage has no
   `hf_onboarded` and the user is signed in. */
(function () {
  'use strict';
  try {
    if (localStorage.getItem('hf_onboarded')) return;
    if (!localStorage.getItem('hf_token')) return;
  } catch (e) { return; }

  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';
  var TOKEN = null;
  try { TOKEN = localStorage.getItem('hf_token'); } catch (e) {}

  var answers = { stage: '', challenge: '', heardFrom: '' };
  var step = 0;
  var TOTAL = 7;
  var STEP_PCT = 100 / TOTAL;

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
      + '.onb-prog-fill{height:100%;background:var(--accent,#6366f1);width:' + STEP_PCT + '%;transition:width .3s ease;}'
      + '.onb-viewport{flex:1;overflow:hidden;position:relative;}'
      + '.onb-track{display:flex;height:100%;width:' + (TOTAL * 100) + '%;transition:transform .25s ease;}'
      + '.onb-screen{width:' + STEP_PCT + '%;height:100%;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:40px 24px;box-sizing:border-box;text-align:center;}'
      + '.onb-inner{width:100%;max-width:620px;margin:auto 0;}'
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
      // Match results styles
      + '.onb-match{display:flex;flex-direction:column;align-items:center;gap:16px;margin-top:8px;}'
      + '.onb-ring{position:relative;width:120px;height:120px;}'
      + '.onb-ring svg{display:block;}'
      + '.onb-ring-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800;}'
      + '.onb-verdict-label{font-size:20px;font-weight:800;text-align:center;}'
      + '.onb-verdict-why{color:var(--muted,#9aa3c7);font-size:13.5px;text-align:center;margin-top:2px;line-height:1.5;max-width:460px;}'
      + '.onb-bars{display:grid;grid-template-columns:1fr 1fr;gap:8px 22px;width:100%;margin-top:8px;text-align:left;}'
      + '.onb-bar-row{}'
      + '.onb-bar-hd{display:flex;justify-content:space-between;font-size:12.5px;}'
      + '.onb-bar-hd span:first-child{color:var(--muted,#9aa3c7);}'
      + '.onb-bar-hd span:last-child{font-weight:700;}'
      + '.onb-bar-track{height:6px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden;margin-top:4px;}'
      + '.onb-bar-fill{height:100%;border-radius:4px;transition:width .6s ease;}'
      + '.onb-kw{text-align:left;width:100%;margin-top:8px;}'
      + '.onb-kw-title{font-size:13px;font-weight:700;margin-bottom:6px;}'
      + '.onb-chip{display:inline-block;font-size:11.5px;padding:3px 10px;border-radius:99px;margin:3px 4px 0 0;}'
      + '.onb-chip-ok{background:rgba(34,197,94,.14);color:#4ade80;border:1px solid rgba(34,197,94,.3);}'
      + '.onb-chip-no{background:rgba(148,163,184,.14);color:#94a3b8;border:1px solid rgba(148,163,184,.25);}'
      + '.onb-feedback{text-align:left;width:100%;margin-top:8px;}'
      + '.onb-feedback h4{font-size:13px;font-weight:700;margin:8px 0 6px;}'
      + '.onb-fb-list{list-style:none;padding:0;margin:0;}'
      + '.onb-fb-list li{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.5;margin-bottom:5px;color:var(--muted,#9aa3c7);}'
      + '.onb-skip{background:none;border:none;color:var(--muted,#9aa3c7);font-size:14px;cursor:pointer;text-decoration:underline;padding:4px;}'
      + '.onb-skip:hover{color:var(--text,#e6e9f5);}'
      + '.onb-jd-role-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;}'
      + '.onb-jd-input{width:100%;box-sizing:border-box;padding:12px 14px;background:#0d1130;border:1.5px solid var(--border,#2a2f55);border-radius:12px;color:var(--text,#e6e9f5);font-size:14px;font-family:inherit;}'
      + '.onb-jd-input:focus{outline:none;border-color:var(--accent,#6366f1);}'
      + '@media(max-width:768px){.onb-build{grid-template-columns:1fr;}.onb-bcard.primary{transform:none;}.onb-jd-role-row{grid-template-columns:1fr;}}'
      + '@media(max-width:520px){.onb-bars{grid-template-columns:1fr;}}';
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

  function jdScreenHTML() {
    return '<div class="onb-inner">'
      + '<h2 class="onb-q">See how your resume scores</h2>'
      + '<p class="onb-sub">Paste any job posting you\'re interested in. Applio scores your resume against it instantly.</p>'
      + '<textarea class="onb-ta" id="onb-jd-ta" placeholder="Paste the job description here..."></textarea>'
      + '<div class="onb-jd-role-row">'
      +   '<input class="onb-jd-input" id="onb-jd-role" type="text" placeholder="Role (optional)" maxlength="120">'
      +   '<input class="onb-jd-input" id="onb-jd-company" type="text" placeholder="Company (optional)" maxlength="120">'
      + '</div>'
      + '<div class="onb-nav">'
      +   '<button class="onb-btn" data-run-match>See my score →</button>'
      + '</div>'
      + '<div class="onb-nav" style="margin-top:4px;">'
      +   '<button class="onb-skip" data-skip-match>Skip for now</button>'
      + '</div>'
      + '</div>';
  }

  function resultsPlaceholderHTML() {
    return '<div class="onb-inner" id="onb-results-inner"></div>';
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
    if (n === 4) return buildScreenHTML();
    if (n === 5) return jdScreenHTML();
    if (n === 6) return resultsPlaceholderHTML();
    return '';
  }

  function render() {
    track.innerHTML = [];
    for (var i = 0; i < TOTAL; i++) {
      track.innerHTML += '<section class="onb-screen">' + screenHTML(i) + '</section>';
    }
    goTo(step, true);
  }

  function goTo(n, instant) {
    step = n;
    if (instant) track.style.transition = 'none';
    track.style.transform = 'translateX(-' + (n * STEP_PCT) + '%)';
    if (instant) requestAnimationFrame(function () { track.style.transition = ''; });
    progFill.style.width = ((n + 1) / TOTAL * 100) + '%';
  }

  function selectOption(key, optIdx) {
    var q = Object.values(QUESTIONS).find(function (x) { return x.key === key; });
    answers[key] = q.options[optIdx];
    var screen = track.children[step];
    screen.querySelectorAll('[data-cards="' + key + '"] .onb-card').forEach(function (c, i) {
      c.classList.toggle('sel', i === optIdx);
    });
    var nx = screen.querySelector('[data-next]'); if (nx) nx.disabled = false;
  }

  function finishQuestionnaire() {
    try { localStorage.setItem('hf_onboarding_answers', JSON.stringify(answers)); } catch (e) {}
    if (API && TOKEN) {
      fetch(API + '/onboarding-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
        body: JSON.stringify({ answers: answers })
      }).catch(function () {});
    }
    goTo(4);
  }

  function finish(goPersonal) {
    try { localStorage.setItem('hf_onboarded', '1'); } catch (e) {}
    if (overlay) { overlay.style.transition = 'opacity .2s'; overlay.style.opacity = '0'; setTimeout(function () { if (overlay) overlay.remove(); }, 210); }
    document.documentElement.style.overflow = '';
    if (goPersonal && typeof goSection === 'function') { try { goSection('personal'); } catch (e) {} }
    if (typeof window.startAppWalkthrough === 'function') window.startAppWalkthrough();
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

  // ── Resume-to-text for ATS scoring ──
  function resumeToText(r) {
    var out = [], p = r.personal || {};
    if (p.fullName) out.push(p.fullName);
    if (p.summary) out.push(p.summary);
    (r.experience || []).forEach(function (e) { out.push([e.title, e.company].filter(Boolean).join(' ')); if (e.description) out.push(e.description); });
    (r.education || []).forEach(function (e) { out.push([e.degree, e.field, e.school].filter(Boolean).join(' ')); });
    ((r.skills && r.skills.categories) || []).forEach(function (c) { if (c.items && c.items.length) out.push(c.items.join(', ')); });
    (r.projects || []).forEach(function (pr) { out.push([pr.name, pr.tech, pr.description].filter(Boolean).join(' ')); });
    return out.join('\n');
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  // ── Run the match ──
  function runMatch() {
    var ta = document.getElementById('onb-jd-ta');
    var jd = ta ? (ta.value || '').trim() : '';
    if (jd.length < 40) { if (typeof toast === 'function') toast('Paste the full job description first', { type: 'warn' }); if (ta) ta.focus(); return; }

    var resume;
    try { resume = JSON.parse(localStorage.getItem('hf_resume') || 'null'); } catch (e) { resume = null; }
    if (!resume) { finish(true); return; }

    var roleEl = document.getElementById('onb-jd-role');
    var compEl = document.getElementById('onb-jd-company');
    var role = roleEl ? roleEl.value.trim() : '';
    var company = compEl ? compEl.value.trim() : '';

    // Store the JD info for the results screen
    _matchJD = jd;
    _matchRole = role;
    _matchCompany = company;

    if (!window.AtsEngine || typeof window.AtsEngine.score !== 'function') {
      // ATS engine not loaded, skip to finish
      finish(true);
      return;
    }

    var text = resumeToText(resume);
    var result = window.AtsEngine.score(text, jd);
    goTo(6);
    renderMatchResults(result);
  }

  var _matchJD = '', _matchRole = '', _matchCompany = '';

  function scoreColor(s) { return s >= 75 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#ef4444'; }

  function renderMatchResults(r) {
    var host = document.getElementById('onb-results-inner');
    if (!host) return;

    var score = r.score;
    var col = scoreColor(score);
    var verdict = score >= 75 ? 'Strong fit' : score >= 55 ? 'Worth a shot' : 'Some gaps to close';
    var verdictSub = score >= 75
      ? 'Your resume already covers most of what this job asks for.'
      : score >= 55
        ? 'You\'re close. A few tweaks could push you over the line.'
        : 'There are some mismatches, but Applio can help you close the gap.';

    var C = 2 * Math.PI * 42;

    // Score ring
    var ring = '<div class="onb-ring"><svg viewBox="0 0 100 100" width="120" height="120">'
      + '<circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>'
      + '<circle id="onb-ring-fill" cx="50" cy="50" r="42" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" transform="rotate(-90 50 50)" style="transition:stroke-dashoffset .8s ease;"/>'
      + '</svg><div class="onb-ring-num" style="color:' + col + ';">' + score + '</div></div>';

    // Breakdown bars
    var bd = r.breakdown || {};
    var bars = [['keywords', 'Keyword match'], ['formatting', 'Formatting'], ['impact', 'Impact'], ['completeness', 'Completeness']];
    var barsHTML = '<div class="onb-bars">' + bars.map(function (b) {
      var v = bd[b[0]]; if (typeof v !== 'number') v = 0;
      var bc = scoreColor(v);
      return '<div class="onb-bar-row"><div class="onb-bar-hd"><span>' + b[1] + '</span><span>' + v + '</span></div>'
        + '<div class="onb-bar-track"><div class="onb-bar-fill" style="width:0%;background:' + bc + ';" data-target="' + v + '"></div></div></div>';
    }).join('') + '</div>';

    // Keywords
    var kwHTML = '';
    var matched = r.matchedKeywords || [], missing = r.missingKeywords || [];
    if (matched.length || missing.length) {
      kwHTML = '<div class="onb-kw">';
      if (matched.length) {
        kwHTML += '<div class="onb-kw-title">Matched</div>' + matched.map(function (k) { return '<span class="onb-chip onb-chip-ok">' + esc(k) + '</span>'; }).join('');
      }
      if (missing.length) {
        kwHTML += '<div class="onb-kw-title" style="margin-top:12px;">Missing</div>' + missing.slice(0, 10).map(function (k) { return '<span class="onb-chip onb-chip-no">' + esc(k) + '</span>'; }).join('');
      }
      kwHTML += '</div>';
    }

    // Feedback
    var fbHTML = '<div class="onb-feedback">';
    if (r.wins && r.wins.length) {
      fbHTML += '<h4 style="color:#4ade80;">What you\'re doing well</h4><ul class="onb-fb-list">' + r.wins.map(function (w) { return '<li><span style="color:#4ade80;flex-shrink:0;">✓</span><span>' + esc(w) + '</span></li>'; }).join('') + '</ul>';
    }
    if (r.issues && r.issues.length) {
      fbHTML += '<h4 style="color:#f59e0b;">What to improve</h4><ul class="onb-fb-list">' + r.issues.map(function (w) { return '<li><span style="color:#f59e0b;flex-shrink:0;">→</span><span>' + esc(w) + '</span></li>'; }).join('') + '</ul>';
    }
    fbHTML += '</div>';

    // CTAs
    var saveCTA = (_matchRole || _matchCompany)
      ? '<button class="onb-btn" data-save-match>Save this job &amp; start building →</button>'
      : '<button class="onb-btn" data-finish-match>Start building your resume →</button>';

    var ctaHTML = '<div class="onb-nav" style="margin-top:20px;">' + saveCTA + '</div>';
    if (_matchRole || _matchCompany) {
      ctaHTML += '<div class="onb-nav" style="margin-top:4px;"><button class="onb-skip" data-finish-match>Skip saving</button></div>';
    }

    host.innerHTML = '<h2 class="onb-q">Your match score</h2>'
      + '<div class="onb-match">'
      + ring
      + '<div class="onb-verdict-label" style="color:' + col + ';">' + verdict + '</div>'
      + '<div class="onb-verdict-why">' + verdictSub + '</div>'
      + barsHTML
      + kwHTML
      + fbHTML
      + '</div>'
      + ctaHTML;

    // Animate ring
    requestAnimationFrame(function () {
      var fill = document.getElementById('onb-ring-fill');
      if (fill) fill.style.strokeDashoffset = String(C * (1 - score / 100));
      // Animate bars
      host.querySelectorAll('.onb-bar-fill').forEach(function (el) {
        el.style.width = el.getAttribute('data-target') + '%';
      });
    });
  }

  function saveMatchJob() {
    var role = _matchRole || 'Role';
    var company = _matchCompany || 'Company';
    var jobs;
    try { jobs = JSON.parse(localStorage.getItem('hf_jobs') || '[]'); if (!Array.isArray(jobs)) jobs = []; } catch (e) { jobs = []; }
    var now = Date.now();
    jobs.unshift({
      id: now, addedAt: now, statusAt: now,
      title: role, company: company, location: '', status: 'Saved',
      jd: _matchJD.slice(0, 8000),
      notes: 'Added during onboarding'
    });
    try {
      localStorage.setItem('hf_jobs', JSON.stringify(jobs));
      if (window.HFJobsSync) HFJobsSync.push();
    } catch (e) {}
    if (typeof toast === 'function') toast('Saved to Job Tracker', { type: 'success' });
    finish(true);
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-next],[data-opt],[data-import],[data-fresh],[data-analyze],[data-import-back],[data-run-match],[data-skip-match],[data-save-match],[data-finish-match]') : null;
    if (!t) return;
    if (t.hasAttribute('data-opt')) { selectOption(t.getAttribute('data-q'), +t.getAttribute('data-opt')); return; }
    if (t.hasAttribute('data-next')) {
      if (step === 3) return finishQuestionnaire();
      if (step < 3) return goTo(step + 1);
      return;
    }
    if (t.hasAttribute('data-import')) { showImportView(); return; }
    if (t.hasAttribute('data-import-back')) { showBuildChoice(); return; }
    if (t.hasAttribute('data-fresh')) { finish(true); return; }
    if (t.hasAttribute('data-analyze')) {
      var ta = document.getElementById('onb-import-ta');
      var text = ta ? ta.value : '';
      if (!text.trim()) { if (typeof toast === 'function') toast('Paste your resume text first', { type: 'warn' }); return; }
      t.disabled = true; t.textContent = 'Analyzing...';
      Promise.resolve(typeof importResume === 'function' ? importResume(text) : false).then(function (ok) {
        if (ok) {
          // Resume imported — show the JD step instead of finishing
          goTo(5);
          var jdTa = document.getElementById('onb-jd-ta');
          if (jdTa) setTimeout(function () { jdTa.focus(); }, 300);
        } else {
          t.disabled = false; t.textContent = 'Analyze with AI';
        }
      });
      return;
    }
    if (t.hasAttribute('data-run-match')) { runMatch(); return; }
    if (t.hasAttribute('data-skip-match')) { finish(true); return; }
    if (t.hasAttribute('data-save-match')) { saveMatchJob(); return; }
    if (t.hasAttribute('data-finish-match')) { finish(true); return; }
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
