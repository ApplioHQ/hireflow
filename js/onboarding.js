/* onboarding.js -- mandatory first-run flow for new users.
   Full-screen, immersive. Eight screens: welcome, search stage, target role,
   company/current role, experience level, location, import resume, summary.
   Triggers ONLY on first-time signup via hf_onboard_new flag. */
(function () {
  'use strict';
  try {
    if (!localStorage.getItem('hf_token')) return;
    if (localStorage.getItem('hf_onboarded')) return;
    if (localStorage.getItem('hf_onboard_new') !== '1') return;
    localStorage.removeItem('hf_onboard_new');
  } catch (e) { return; }

  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';
  var TOKEN = null;
  try { TOKEN = localStorage.getItem('hf_token'); } catch (e) {}

  var TOTAL = 8;
  var step = 0;
  var data = {};
  var overlay, track, progFill, dotsEl;

  var STAGE_MAP = {
    'Actively applying': 'active',
    'Starting to look': 'casual',
    'Preparing for later': 'passive',
    'Just exploring': 'exploring'
  };
  var EXP_MAP = {
    '0-2': 'entry',
    '3-5': 'mid',
    '6-10': 'senior',
    '10+': 'expert'
  };


  var ICONS = {
    rocket: '<path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3"/><path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3"/><path d="M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    send: '<path d="M10 14l11 -11"/><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"/>',
    eye: '<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/>',
    calendar: '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/>',
    compass: '<path d="M8 16l2 -6l6 -2l-2 6l-6 2"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/>',
    clock: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 7v5l3 3"/>',
    upload: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 9l5 -5l5 5"/><path d="M12 4l0 12"/>',
    filePlus: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/><path d="M12 11l0 6"/><path d="M9 14l6 0"/>',
    briefcase: '<path d="M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9"/><path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2"/><path d="M12 12l0 .01"/><path d="M3 13a20 20 0 0 0 18 0"/>',
    mapPin: '<path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0"/>',
    arrowRight: '<path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>'
  };

  function ico(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>';
  }

  function injectCSS() {
    if (document.getElementById('onb-css')) return;
    var css = ''
      + '#onb-overlay{position:fixed;inset:0;z-index:99999;background:#07091a;color:#e6e9f5;overflow:hidden;display:flex;flex-direction:column;font-family:var(--font-display,Sora),-apple-system,BlinkMacSystemFont,sans-serif;}'
      + '.onb-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none;}'
      + '.onb-orb{position:absolute;border-radius:50%;mix-blend-mode:screen;filter:blur(80px);opacity:.3;}'
      + '.onb-o1{width:340px;height:340px;background:radial-gradient(circle,#6d4dfc,transparent 70%);top:-80px;left:-60px;animation:onbD1 19s ease-in-out infinite;}'
      + '.onb-o2{width:280px;height:280px;background:radial-gradient(circle,#8370ff,transparent 70%);bottom:-40px;right:-40px;animation:onbD2 23s ease-in-out infinite;}'
      + '.onb-o3{width:200px;height:200px;background:radial-gradient(circle,#5a3ce8,transparent 70%);top:40%;left:50%;animation:onbD3 27s ease-in-out infinite;}'
      + '@keyframes onbD1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(30px,20px) scale(1.1)}}'
      + '@keyframes onbD2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-20px,-30px) scale(1.15)}}'
      + '@keyframes onbD3{0%,100%{transform:translate(0,0) scale(.9)}50%{transform:translate(-40px,20px) scale(1.05)}}'
      + '.onb-dots-pat{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px);background-size:24px 24px;mask-image:radial-gradient(ellipse at 50% 40%,black 10%,transparent 65%);opacity:.5;}'
      + '.onb-prog{position:relative;z-index:3;height:4px;background:rgba(255,255,255,.05);flex-shrink:0;}'
      + '.onb-prog-fill{height:100%;background:linear-gradient(90deg,#5a3ce8,#8370ff);transition:width .5s cubic-bezier(.22,1,.36,1);border-radius:0 2px 2px 0;}'
      + '.onb-dots{display:flex;gap:8px;justify-content:center;padding:18px 0 0;position:relative;z-index:3;}'
      + '.onb-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.12);transition:all .3s ease;}'
      + '.onb-dot.on{background:#6d4dfc;box-shadow:0 0 8px rgba(109,77,252,.5);}'
      + '.onb-dot.dn{background:rgba(109,77,252,.35);}'
      + '.onb-body{display:flex;flex:1;position:relative;z-index:2;overflow:hidden;}'
      + '.onb-left{flex:1;display:flex;flex-direction:column;justify-content:center;overflow:hidden;position:relative;}'
      + '.onb-screen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:48px;opacity:0;pointer-events:none;transform:translateY(16px);transition:opacity .4s cubic-bezier(.22,1,.36,1),transform .4s cubic-bezier(.22,1,.36,1);overflow-y:auto;}'
      + '.onb-screen.on{opacity:1;pointer-events:auto;transform:none;}'
      + '.onb-inner{width:100%;max-width:520px;}'
      + '.onb-label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#8a73f8;margin-bottom:10px;}'
      + '.onb-h{font-size:clamp(24px,3vw,32px);font-weight:700;letter-spacing:-.02em;line-height:1.3;margin:0 0 8px;}'
      + '.onb-sub{font-size:15px;color:#9a9aa2;line-height:1.55;margin:0 0 28px;}'
      + '.onb-logo{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#5a3ce8,#8370ff);display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 0 0 0 rgba(109,77,252,.4);animation:onbPulse 2s ease infinite;}'
      + '.onb-logo svg{width:26px;height:26px;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none;}'
      + '@keyframes onbPulse{0%,100%{box-shadow:0 0 0 0 rgba(109,77,252,.4)}50%{box-shadow:0 0 0 12px rgba(109,77,252,0)}}'
      + '.onb-pill{display:inline-flex;align-items:center;gap:8px;background:rgba(109,77,252,.1);border:1px solid rgba(109,77,252,.22);border-radius:20px;padding:7px 16px;font-size:13px;font-weight:600;color:#c2b8fd;margin-bottom:26px;}'
      + '.onb-pill svg{width:15px;height:15px;}'
      + '.onb-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;}'
      + '.onb-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px 16px;cursor:pointer;transition:all .2s cubic-bezier(.4,0,.2,1);}'
      + '.onb-card:hover{border-color:rgba(109,77,252,.4);background:rgba(109,77,252,.06);}'
      + '.onb-card.sel{border-color:#6d4dfc;background:rgba(109,77,252,.12);transform:scale(1.015);box-shadow:0 0 20px rgba(109,77,252,.15);}'
      + '.onb-card-ico{color:#8a73f8;margin-bottom:8px;}'
      + '.onb-card-ico svg{width:24px;height:24px;}'
      + '.onb-card-t{font-size:15px;font-weight:600;}'
      + '.onb-card-d{font-size:12px;color:#9a9aa2;margin-top:4px;}'
      + '.onb-inp{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:13px 16px;color:#e6e9f5;font-size:15px;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s;margin-bottom:14px;}'
      + '.onb-inp:focus{border-color:#6d4dfc;box-shadow:0 0 0 3px rgba(109,77,252,.2);}'
      + '.onb-inp::placeholder{color:#555;}'
      + '.onb-btn{display:inline-flex;align-items:center;gap:8px;background:#6d4dfc;color:#fff;border:none;border-radius:12px;padding:14px 32px;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:all .2s;}'
      + '.onb-btn:hover{background:#8370ff;transform:translateY(-1px);box-shadow:0 8px 24px rgba(109,77,252,.3);}'
      + '.onb-btn:disabled{opacity:.35;cursor:default;transform:none;box-shadow:none;}'
      + '.onb-btn:not(:disabled):active{transform:scale(.98);}'
      + '.onb-skip{background:none;border:none;color:#9a9aa2;font-size:13px;font-weight:600;cursor:pointer;padding:8px 0;font-family:inherit;}'
      + '.onb-skip:hover{color:#e6e9f5;}'
      + '.onb-nav{display:flex;align-items:center;gap:14px;margin-top:4px;}'
      + '.onb-exp{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;}'
      + '.onb-ec{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:20px 16px;cursor:pointer;text-align:center;transition:all .2s;}'
      + '.onb-ec:hover{border-color:rgba(109,77,252,.4);background:rgba(109,77,252,.06);}'
      + '.onb-ec.sel{border-color:#6d4dfc;background:rgba(109,77,252,.12);transform:scale(1.015);box-shadow:0 0 20px rgba(109,77,252,.15);}'
      + '.onb-ec-n{font-size:24px;font-weight:800;color:#8a73f8;}'
      + '.onb-ec-l{font-size:12px;color:#9a9aa2;margin-top:3px;}'
      + '.onb-import{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;}'
      + '.onb-ic{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:26px 16px;cursor:pointer;text-align:center;transition:all .2s;}'
      + '.onb-ic:hover{border-color:rgba(109,77,252,.4);}'
      + '.onb-ic.pri{border-color:rgba(109,77,252,.3);background:rgba(109,77,252,.06);}'
      + '.onb-ic.sel{border-color:#6d4dfc;background:rgba(109,77,252,.12);transform:scale(1.02);box-shadow:0 0 20px rgba(109,77,252,.12);}'
      + '.onb-ic-ico{color:#8a73f8;margin-bottom:8px;}'
      + '.onb-ic-ico svg{width:30px;height:30px;}'
      + '.onb-ic-t{font-size:15px;font-weight:700;margin-bottom:4px;}'
      + '.onb-ic-d{font-size:12px;color:#9a9aa2;}'
      + '.onb-ta{width:100%;box-sizing:border-box;height:180px;max-height:180px;overflow-y:auto;padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#e6e9f5;font-size:14px;line-height:1.55;font-family:inherit;resize:none;outline:none;transition:border-color .2s;margin-bottom:12px;}'
      + '.onb-ta:focus{border-color:#6d4dfc;}'
      + '.onb-sum{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:18px 22px;margin-bottom:24px;}'
      + '.onb-sr{display:flex;justify-content:space-between;padding:8px 0;font-size:14px;}'
      + '.onb-sr span:first-child{color:#9a9aa2;}'
      + '.onb-sr span:last-child{font-weight:600;}'
      + '.onb-sr+.onb-sr{border-top:1px solid rgba(255,255,255,.06);}'
      + '.onb-cf{position:absolute;width:6px;height:6px;border-radius:50%;pointer-events:none;opacity:0;}'
      + '@keyframes onbCF{0%{opacity:1;transform:translateY(0) rotate(0)}100%{opacity:0;transform:translateY(200px) rotate(720deg)}}'
      + '@media(prefers-reduced-motion:reduce){.onb-orb,.onb-logo{animation:none;}.onb-screen{transition:opacity .15s;transform:none!important;}}'
      + '@media(max-width:768px){.onb-screen{padding:32px 20px;}.onb-cards,.onb-exp,.onb-import{grid-template-columns:1fr 1fr;}}';
    var st = document.createElement('style'); st.id = 'onb-css'; st.textContent = css;
    document.head.appendChild(st);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function updateDots() {
    if (!dotsEl) return;
    var h = '';
    for (var i = 0; i < TOTAL; i++) h += '<div class="onb-dot ' + (i === step ? 'on' : i < step ? 'dn' : '') + '"></div>';
    dotsEl.innerHTML = h;
  }

  function goTo(n) {
    var prev = overlay.querySelector('.onb-screen.on');
    if (prev) prev.classList.remove('on');
    step = n;
    var next = overlay.querySelector('[data-s="' + n + '"]');
    if (next) next.classList.add('on');
    if (progFill) progFill.style.width = ((n + 1) / TOTAL * 100) + '%';
    updateDots();
    if (n === 7) buildSummary();
  }

  // Screen 0: Welcome
  function s0() {
    return '<div class="onb-inner">'
      + '<div class="onb-logo">' + ico('rocket') + '</div>'
      + '<h1 class="onb-h">Let\'s set up your career copilot</h1>'
      + '<p class="onb-sub">We\'ll personalize your tools, templates, and AI suggestions based on where you are in your career.</p>'
      + '<div class="onb-pill">' + ico('clock') + ' Takes about 90 seconds</div><br>'
      + '<button class="onb-btn" data-go="1">Let\'s go <span style="margin-left:4px">&rarr;</span></button>'
      + '</div>';
  }

  // Screen 1: Job search stage
  function s1() {
    var cards = [
      ['send', 'Actively applying', 'Sending apps this week'],
      ['eye', 'Starting to look', 'Browsing, not committed'],
      ['calendar', 'Preparing for later', 'Building my toolkit now'],
      ['compass', 'Just exploring', 'Curious what\'s here']
    ];
    return '<div class="onb-inner">'
      + '<div class="onb-label">Step 1 of 7</div>'
      + '<h2 class="onb-h">Where are you in your job search?</h2>'
      + '<p class="onb-sub">This shapes which tools we surface first.</p>'
      + '<div class="onb-cards">' + cards.map(function (c) {
        var sel = data.stage === c[1] ? ' sel' : '';
        return '<div class="onb-card' + sel + '" data-pick="stage" data-val="' + esc(c[1]) + '">'
          + '<div class="onb-card-ico">' + ico(c[0]) + '</div>'
          + '<div class="onb-card-t">' + esc(c[1]) + '</div>'
          + '<div class="onb-card-d">' + esc(c[2]) + '</div></div>';
      }).join('') + '</div>'
      + '<button class="onb-btn" data-go="2"' + (data.stage ? '' : ' disabled') + '>Continue</button>'
      + '</div>';
  }

  // Screen 2: Target role
  function s2() {
    return '<div class="onb-inner">'
      + '<div class="onb-label">Step 2 of 7</div>'
      + '<h2 class="onb-h">What role are you targeting?</h2>'
      + '<p class="onb-sub">This powers salary insights, skill-gap analysis, and interview prep -- all tuned to your exact role.</p>'
      + '<input class="onb-inp" id="onb-role" placeholder="e.g. Senior Product Manager" value="' + esc(data.targetRole || '') + '">'
      + '<button class="onb-btn" id="onb-b2" data-go="3"' + (data.targetRole ? '' : ' disabled') + '>Continue</button>'
      + '</div>';
  }

  // Screen 3: Company + current role
  function s3() {
    return '<div class="onb-inner">'
      + '<div class="onb-label">Step 3 of 7</div>'
      + '<h2 class="onb-h">Where do you work now?</h2>'
      + '<p class="onb-sub">Current context helps the AI write better bullets and tailor suggestions.</p>'
      + '<input class="onb-inp" id="onb-company" placeholder="Company name" value="' + esc(data.company || '') + '">'
      + '<input class="onb-inp" id="onb-currentRole" placeholder="Current or most recent title" value="' + esc(data.currentRole || '') + '">'
      + '<div class="onb-nav"><button class="onb-btn" data-go="4">Continue</button><button class="onb-skip" data-go="4">Skip this step</button></div>'
      + '</div>';
  }

  // Screen 4: Experience level
  function s4() {
    var levels = [['0-2', 'Entry level'], ['3-5', 'Mid level'], ['6-10', 'Senior'], ['10+', 'Expert']];
    return '<div class="onb-inner">'
      + '<div class="onb-label">Step 4 of 7</div>'
      + '<h2 class="onb-h">Years of experience?</h2>'
      + '<p class="onb-sub">Calibrates salary benchmarks and seniority framing.</p>'
      + '<div class="onb-exp">' + levels.map(function (l) {
        var sel = data.exp === l[0] ? ' sel' : '';
        return '<div class="onb-ec' + sel + '" data-pick="exp" data-val="' + l[0] + '"><div class="onb-ec-n">' + l[0] + '</div><div class="onb-ec-l">' + l[1] + '</div></div>';
      }).join('') + '</div>'
      + '<button class="onb-btn" data-go="5"' + (data.exp ? '' : ' disabled') + '>Continue</button>'
      + '</div>';
  }

  // Screen 5: Location
  function s5() {
    return '<div class="onb-inner">'
      + '<div class="onb-label">Step 5 of 7</div>'
      + '<h2 class="onb-h">Where are you based?</h2>'
      + '<p class="onb-sub">Unlocks salary insights benchmarked to your city.</p>'
      + '<input class="onb-inp" id="onb-location" placeholder="e.g. San Francisco, CA" value="' + esc(data.location || '') + '">'
      + '<div class="onb-nav"><button class="onb-btn" data-go="6">Continue</button><button class="onb-skip" data-go="6">Skip this step</button></div>'
      + '</div>';
  }

  // Screen 6: Import resume
  function s6() {
    return '<div class="onb-inner">'
      + '<div class="onb-label">Step 6 of 7</div>'
      + '<h2 class="onb-h">Bring your resume to life</h2>'
      + '<p class="onb-sub">Import what you have, or start fresh -- AI helps either way.</p>'
      + '<div class="onb-import">'
      +   '<div class="onb-ic pri' + (data.importChoice === 'import' ? ' sel' : '') + '" data-pick="importChoice" data-val="import"><div class="onb-ic-ico">' + ico('upload') + '</div><div class="onb-ic-t">Import resume</div><div class="onb-ic-d">Paste text or upload</div></div>'
      +   '<div class="onb-ic' + (data.importChoice === 'fresh' ? ' sel' : '') + '" data-pick="importChoice" data-val="fresh"><div class="onb-ic-ico">' + ico('filePlus') + '</div><div class="onb-ic-t">Start fresh</div><div class="onb-ic-d">Build from scratch</div></div>'
      + '</div>'
      + '<div id="onb-import-area" style="display:none;">'
      +   '<textarea class="onb-ta" id="onb-import-ta" rows="6" placeholder="Paste your resume text here..."></textarea>'
      +   '<button class="onb-btn" id="onb-analyze-btn" data-analyze>Analyze with AI</button>'
      + '</div>'
      + '<button class="onb-btn" id="onb-b6" data-go="7"' + (data.importChoice ? '' : ' disabled') + ' style="' + (data.importChoice === 'import' ? 'display:none' : '') + '">Continue</button>'
      + '</div>';
  }

  // Screen 7: Summary
  function s7() {
    return '<div class="onb-inner">'
      + '<div class="onb-label">All set</div>'
      + '<h2 class="onb-h">Your workspace is ready</h2>'
      + '<p class="onb-sub">Here\'s what we personalized for you:</p>'
      + '<div class="onb-sum" id="onb-sum"></div>'
      + '<button class="onb-btn" data-finish>Start building <span style="margin-left:4px">&rarr;</span></button>'
      + '</div>';
  }

  function buildSummary() {
    var el = document.getElementById('onb-sum');
    if (!el) return;
    var rows = [
      ['Search stage', data.stage],
      ['Target role', data.targetRole],
      ['Company', data.company],
      ['Current role', data.currentRole],
      ['Experience', data.exp ? data.exp + ' years' : null],
      ['Location', data.location],
      ['Resume', data.importChoice === 'import' ? 'Imported' : data.importChoice === 'fresh' ? 'Starting fresh' : null]
    ];
    el.innerHTML = rows.filter(function (r) { return r[1]; }).map(function (r) {
      return '<div class="onb-sr"><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></div>';
    }).join('');
    confetti();
  }

  function confetti() {
    var cols = ['#6d4dfc', '#8370ff', '#5a3ce8', '#c2b8fd', '#a594ff'];
    for (var i = 0; i < 25; i++) {
      var d = document.createElement('div');
      d.className = 'onb-cf';
      d.style.left = (20 + Math.random() * 60) + '%';
      d.style.top = '35%';
      d.style.width = d.style.height = (4 + Math.random() * 4) + 'px';
      d.style.background = cols[Math.floor(Math.random() * cols.length)];
      d.style.animation = 'onbCF ' + (1.2 + Math.random() * .6) + 's ease-out ' + (Math.random() * .5) + 's forwards';
      overlay.appendChild(d);
    }
  }

  function captureInputs() {
    var r = document.getElementById('onb-role');
    if (r && r.value.trim()) data.targetRole = r.value.trim();
    var c = document.getElementById('onb-company');
    if (c && c.value.trim()) data.company = c.value.trim();
    var cr = document.getElementById('onb-currentRole');
    if (cr && cr.value.trim()) data.currentRole = cr.value.trim();
    var loc = document.getElementById('onb-location');
    if (loc && loc.value.trim()) data.location = loc.value.trim();
  }

  function saveToProfile() {
    var profile;
    try { profile = JSON.parse(localStorage.getItem('hf_profile') || '{}'); } catch (e) { profile = {}; }
    if (data.stage && STAGE_MAP[data.stage]) profile.searchStatus = STAGE_MAP[data.stage];
    if (data.targetRole) profile.targetRole = data.targetRole;
    if (data.company) profile.company = data.company;
    if (data.currentRole) profile.currentRole = data.currentRole;
    if (data.exp && EXP_MAP[data.exp]) profile.seniority = EXP_MAP[data.exp];
    if (data.location) profile.location = data.location;
    profile.updatedAt = Date.now();
    try { localStorage.setItem('hf_profile', JSON.stringify(profile)); } catch (e) {}
    if (typeof window.pushProfile === 'function') {
      try { window.pushProfile(); } catch (e) {}
    }
  }

  function sendAnswers() {
    var answers = {
      stage: data.stage || '',
      targetRole: data.targetRole || '',
      company: data.company || '',
      currentRole: data.currentRole || '',
      seniority: (data.exp && EXP_MAP[data.exp]) || '',
      location: data.location || '',
      importChoice: data.importChoice || ''
    };
    try { localStorage.setItem('hf_onboarding_answers', JSON.stringify(answers)); } catch (e) {}
    if (API && TOKEN) {
      fetch(API + '/onboarding-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
        body: JSON.stringify({ answers: answers })
      }).catch(function () {});
    }
  }

  function finish() {
    captureInputs();
    saveToProfile();
    sendAnswers();
    try { localStorage.setItem('hf_onboarded', '1'); } catch (e) {}
    if (overlay) { overlay.style.transition = 'opacity .2s'; overlay.style.opacity = '0'; setTimeout(function () { if (overlay) overlay.remove(); }, 210); }
    document.documentElement.style.overflow = '';
    if (typeof goSection === 'function') { try { goSection('personal'); } catch (e) {} }
    if (typeof window.startAppWalkthrough === 'function') window.startAppWalkthrough();
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-go],[data-pick],[data-analyze],[data-finish]') : null;
    if (!t) return;

    if (t.hasAttribute('data-pick')) {
      var key = t.getAttribute('data-pick');
      var val = t.getAttribute('data-val');
      data[key] = val;
      var parent = t.parentNode;
      if (parent) {
        parent.querySelectorAll('[data-pick="' + key + '"]').forEach(function (c) {
          c.classList.toggle('sel', c === t);
        });
      }
      // Enable the continue button on the current screen
      var screen = t.closest('.onb-screen');
      if (screen) {
        var btn = screen.querySelector('.onb-btn[data-go]');
        if (btn) btn.disabled = false;
      }
      // Import choice: show/hide textarea
      if (key === 'importChoice') {
        var area = document.getElementById('onb-import-area');
        var b6 = document.getElementById('onb-b6');
        if (val === 'import') {
          if (area) area.style.display = '';
          if (b6) b6.style.display = 'none';
          var ta = document.getElementById('onb-import-ta');
          if (ta) setTimeout(function () { ta.focus(); }, 100);
        } else {
          if (area) area.style.display = 'none';
          if (b6) { b6.style.display = ''; b6.disabled = false; }
        }
      }
      return;
    }

    if (t.hasAttribute('data-analyze')) {
      var ta = document.getElementById('onb-import-ta');
      var text = ta ? ta.value : '';
      if (!text.trim()) {
        if (typeof toast === 'function') toast('Paste your resume text first', { type: 'warn' });
        return;
      }
      t.disabled = true; t.textContent = 'Analyzing...';
      Promise.resolve(typeof importResume === 'function' ? importResume(text) : false).then(function (ok) {
        if (ok) {
          goTo(7);
        } else {
          t.disabled = false; t.textContent = 'Analyze with AI';
        }
      });
      return;
    }

    if (t.hasAttribute('data-go')) {
      if (t.disabled) return;
      captureInputs();
      var target = +t.getAttribute('data-go');
      goTo(target);
      return;
    }

    if (t.hasAttribute('data-finish')) {
      finish();
      return;
    }
  }

  function onInput(e) {
    var el = e.target;
    if (el.id === 'onb-role') {
      data.targetRole = el.value.trim();
      var b2 = document.getElementById('onb-b2');
      if (b2) b2.disabled = !data.targetRole;
    }
  }

  function start() {
    injectCSS();
    overlay = document.createElement('div');
    overlay.id = 'onb-overlay';
    overlay.innerHTML = ''
      + '<div class="onb-bg"><div class="onb-orb onb-o1"></div><div class="onb-orb onb-o2"></div><div class="onb-orb onb-o3"></div><div class="onb-dots-pat"></div></div>'
      + '<div class="onb-prog"><div class="onb-prog-fill" id="onb-prog-fill" style="width:12.5%"></div></div>'
      + '<div class="onb-dots" id="onb-dots"></div>'
      + '<div class="onb-body">'
      +   '<div class="onb-left">'
      +     '<div class="onb-screen on" data-s="0">' + s0() + '</div>'
      +     '<div class="onb-screen" data-s="1">' + s1() + '</div>'
      +     '<div class="onb-screen" data-s="2">' + s2() + '</div>'
      +     '<div class="onb-screen" data-s="3">' + s3() + '</div>'
      +     '<div class="onb-screen" data-s="4">' + s4() + '</div>'
      +     '<div class="onb-screen" data-s="5">' + s5() + '</div>'
      +     '<div class="onb-screen" data-s="6">' + s6() + '</div>'
      +     '<div class="onb-screen" data-s="7">' + s7() + '</div>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';

    progFill = document.getElementById('onb-prog-fill');
    dotsEl = document.getElementById('onb-dots');
    updateDots();

    overlay.addEventListener('click', onClick);
    overlay.addEventListener('input', onInput);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
