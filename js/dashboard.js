/* dashboard.js, Applio "Career Home" (the copilot dashboard).
   Orients the user before any single tool: what to do next (nudges computed from
   their pipeline + resume + profile), a pipeline snapshot, quick actions into every
   tool, an editable career profile, and a win journal. All client-side and ZERO AI, 
   nudges are heuristics over localStorage, so the "always-on copilot" feel costs
   nothing in tokens. Reads: hf_profile, hf_jobs, hf_resume. */
(function () {
  'use strict';

  var TOKEN = localStorage.getItem('hf_token');
  if (!TOKEN) { location.href = 'login'; return; }

  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';
  var DAY = 86400000;
  var PROFILE_KEY = 'hf_profile';

  // ---------- storage ----------
  function readJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function loadProfile() { var p = readJSON(PROFILE_KEY, {}); return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; }
  function saveProfile() {
    PROFILE.updatedAt = Date.now();
    if (!PROFILE.createdAt) PROFILE.createdAt = Date.now();
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); } catch (e) {}
    pushProfile();
  }
  // Cloud sync so the profile + win journal follow the user across devices.
  function pushProfile() {
    if (!API) return;
    fetch(API + '/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }, body: JSON.stringify({ profile: PROFILE }) }).catch(function () {});
  }
  function pullProfile() {
    if (!API) return Promise.resolve(false);
    return fetch(API + '/profile', { headers: { 'Authorization': 'Bearer ' + TOKEN } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.profile) { if (PROFILE.updatedAt) pushProfile(); return false; }  // seed empty cloud
        var cloud = d.profile;
        var localTs = PROFILE.updatedAt || 0, cloudTs = cloud.updatedAt || 0;
        if (cloudTs > localTs) {
          PROFILE = cloud;
          if (!Array.isArray(PROFILE.achievements)) PROFILE.achievements = [];
          try { localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); } catch (e) {}
          return true;   // adopted cloud → caller re-renders
        }
        if (localTs > cloudTs) pushProfile();   // local newer → update cloud
        return false;
      }).catch(function () { return false; });
  }
  function loadJobs() { var j = readJSON('hf_jobs', []); return Array.isArray(j) ? j : []; }
  function loadResume() { var r = readJSON('hf_resume', null); return (r && typeof r === 'object') ? r : null; }

  var PROFILE = loadProfile();
  if (!Array.isArray(PROFILE.achievements)) PROFILE.achievements = [];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function daysSince(ts) { return ts ? Math.floor((Date.now() - ts) / DAY) : Infinity; }
  function firstName() {
    var r = loadResume();
    var full = (r && r.personal && r.personal.fullName) || '';
    if (full.trim()) return full.trim().split(/\s+/)[0];
    var em = (window.CURRENT_USER && CURRENT_USER.email) || localStorage.getItem('hf_email') || '';
    return em ? em.split('@')[0] : '';
  }
  function isActivelyLooking() { return !PROFILE.searchStatus || PROFILE.searchStatus === 'active' || PROFILE.searchStatus === 'casual'; }

  // ---------- icons (inline; no dependency on a fixed icon set) ----------
  var SVG = {
    compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12l5-3"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
  };
  var TONE = { accent: 'var(--accent)', warn: '#f59e0b', neutral: '#64748b', success: '#22c55e' };

  // ---------- nudge engine (heuristics; ranked most-urgent first) ----------
  function resumeGaps(r) {
    var gaps = [];
    if (!r.personal || !r.personal.summary || !r.personal.summary.trim()) gaps.push('a summary');
    if (!Array.isArray(r.experience) || !r.experience.length) gaps.push('work experience');
    var skills = r.skills && Array.isArray(r.skills.categories) ? r.skills.categories : [];
    var anySkill = skills.some(function (c) { return c && Array.isArray(c.items) && c.items.length; });
    if (!anySkill) gaps.push('skills');
    return gaps;
  }
  function computeNudges() {
    var jobs = loadJobs(), resume = loadResume(), N = [];

    if (!PROFILE.targetRole) {
      N.push({ tone: 'accent', icon: 'compass', title: 'Set your target role', text: "Tell Applio what you're aiming for and it tailors its coaching to you.", cta: { label: 'Set up', focus: 'profile' } });
    }

    // Follow-ups: Applied/Interviewing that have gone quiet (mirrors the tracker's 7-day rule)
    jobs.filter(function (j) { return (j.status === 'Applied' || j.status === 'Interviewing') && daysSince(j.statusAt || j.addedAt) >= 7; })
      .sort(function (a, b) { return (a.statusAt || a.addedAt) - (b.statusAt || b.addedAt); })
      .slice(0, 3)
      .forEach(function (j) {
        var d = daysSince(j.statusAt || j.addedAt);
        N.push({ tone: 'warn', icon: 'clock', title: 'Follow up with ' + esc(j.company), text: "It's been " + d + ' days on “' + esc(j.title) + '”. A short nudge keeps you top of mind.', cta: { label: 'Open tracker', href: 'jobs' } });
      });

    // Upcoming interviews
    jobs.filter(function (j) { return j.status === 'Interviewing'; }).slice(0, 2).forEach(function (j) {
      N.push({ tone: 'accent', icon: 'mic', title: 'Prep for ' + esc(j.company), text: "You're interviewing for “" + esc(j.title) + '”. Run a mock interview and get scored first.', cta: { label: 'Prep now', href: 'interview' } });
    });

    // Resume state
    if (resume) {
      var gaps = resumeGaps(resume);
      if (gaps.length) {
        N.push({ tone: 'neutral', icon: 'doc', title: 'Strengthen your resume', text: 'Your resume is missing ' + gaps.join(', ') + '. Adding ' + (gaps.length > 1 ? 'these' : 'this') + ' lifts your ATS score.', cta: { label: 'Open builder', href: 'editor' } });
      } else if (resume.updatedAt && daysSince(resume.updatedAt) >= 21 && isActivelyLooking()) {
        N.push({ tone: 'neutral', icon: 'refresh', title: 'Refresh your resume', text: "It's been a while since your last edit. Add a recent win to keep it current.", cta: { label: 'Add a win', focus: 'wins' } });
      }
    } else {
      N.push({ tone: 'accent', icon: 'doc', title: 'Build your resume', text: 'Start from a template or import an existing resume in minutes.', cta: { label: 'Start', href: 'editor' } });
    }

    if (!jobs.length) {
      N.push({ tone: 'neutral', icon: 'target', title: 'Track your first application', text: 'Save the jobs you’re eyeing so Applio can nudge you on follow-ups and interviews.', cta: { label: 'Open tracker', href: 'jobs' } });
    }

    // New role landed → offer the onboarding plan. This is the key handoff: it
    // catches people right after the resume worked and turns them into returning
    // users through the whole first-90-days ramp.
    var onb = PROFILE.onboarding || {};
    var onbDone = onb.done ? Object.keys(onb.done).filter(function (k) { return onb.done[k]; }).length : 0;
    if (onb.startDate || onbDone > 0) {
      N.push({ tone: 'accent', icon: 'compass', title: 'Your first 90 days', text: 'Keep your onboarding on track, check off what you’ve done and see what’s next.', cta: { label: 'Open plan', href: 'first-90-days' } });
    } else if (jobs.some(function (j) { return j.status === 'Offer' || j.status === 'Accepted'; })) {
      N.push({ tone: 'success', icon: 'compass', title: 'Congrats on the offer, plan your first 90 days', text: 'The first three months shape how you’re seen for years. Start a 30/60/90 plan so you ramp fast and strong.', cta: { label: 'Start plan', href: 'first-90-days' } });
    }

    // Weekly win ritual, the habit that keeps a resume current between searches,
    // and the main reason to come back when you're NOT actively job hunting. Only
    // nudge people who've already logged at least one win, so we never nag newcomers.
    if ((PROFILE.achievements || []).length && !loggedThisWeek()) {
      var st = winStreak();
      N.push({ tone: 'accent', icon: 'trophy',
        title: st >= 1 ? 'Keep your ' + st + '-week streak alive' : 'Log this week’s win',
        text: st >= 1 ? 'You haven’t logged a win this week yet, one line keeps the streak, and your resume, current.' : 'What went well this week? Jot one win so it’s ready for your next resume update or performance review.',
        cta: { label: 'Log a win', focus: 'wins' } });
    }

    // Weekly goal progress
    var goal = parseInt(PROFILE.weeklyGoal, 10);
    if (goal > 0 && isActivelyLooking()) {
      var thisWeek = jobs.filter(function (j) { return daysSince(j.addedAt) < 7; }).length;
      if (thisWeek < goal) {
        N.push({ tone: 'success', icon: 'trophy', title: thisWeek + ' of ' + goal + ' applications this week', text: 'You’re ' + (goal - thisWeek) + ' away from your weekly goal. Line up your next target.', cta: { label: 'Best Match', href: 'match' } });
      }
    }
    return N;
  }

  function renderNudges() {
    var host = document.getElementById('dash-nudges');
    var N = computeNudges();
    if (!N.length) {
      host.className = '';
      host.innerHTML = '<div class="dash-allclear">You’re all caught up. Line up your next application when you’re ready.</div>';
      return;
    }
    host.className = 'dash-nudges';
    host.innerHTML = N.map(function (n) {
      var c = TONE[n.tone] || TONE.accent;
      var cta = n.cta.focus
        ? '<button class="nudge-cta" data-focus="' + n.cta.focus + '">' + esc(n.cta.label) + ' →</button>'
        : '<a class="nudge-cta" href="' + esc(n.cta.href) + '">' + esc(n.cta.label) + ' →</a>';
      return '<div class="nudge" style="--nc:' + c + ';">'
        + '<div class="nudge-ico">' + (SVG[n.icon] || SVG.target) + '</div>'
        + '<div class="nudge-body"><div class="nudge-title">' + n.title + '</div><div class="nudge-text">' + n.text + '</div></div>'
        + cta + '</div>';
    }).join('');
    host.querySelectorAll('[data-focus]').forEach(function (b) {
      b.addEventListener('click', function () { focusPanel(b.getAttribute('data-focus')); });
    });
  }

  function focusPanel(which) {
    var map = { profile: ['dash-profile', 'pf-role'], wins: ['dash-wins', 'win-input'] };
    var t = map[which]; if (!t) return;
    var panel = document.getElementById(t[0]);
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var input = document.getElementById(t[1]);
    if (input) setTimeout(function () { input.focus(); }, 350);
  }

  // ---------- pipeline ----------
  function renderPipe() {
    var jobs = loadJobs();
    var count = function (s) { return jobs.filter(function (j) { return j.status === s; }).length; };
    var tiles = [
      { label: 'Saved', n: count('Saved'), c: '#64748b' },
      { label: 'Applied', n: count('Applied'), c: '#6366f1' },
      { label: 'Interviewing', n: count('Interviewing'), c: '#f59e0b' },
      { label: 'Offers', n: count('Offer'), c: '#22c55e' },
      { label: 'This week', n: jobs.filter(function (j) { return daysSince(j.addedAt) < 7; }).length, c: 'var(--accent)' }
    ];
    document.getElementById('dash-pipe').innerHTML = tiles.map(function (t) {
      return '<a class="pipe-stat" href="jobs" style="--c:' + t.c + ';"><div class="pipe-num">' + t.n + '</div><div class="pipe-label">' + t.label + '</div></a>';
    }).join('');
  }

  // ---------- quick actions ----------
  var ACTIONS = [
    { href: 'autopilot', icon: 'target', title: 'Application Autopilot', desc: 'Paste a job → full application, ready' },
    { href: 'editor', icon: 'edit', title: 'Resume Builder', desc: 'Edit and perfect your resume' },
    { href: 'jobs', icon: 'list', title: 'Job Tracker', desc: 'Track every application' },
    { href: 'match', icon: 'gauge', title: 'Best Match', desc: 'Score your resume vs a job' },
    { href: 'interview', icon: 'mic', title: 'Interview Prep', desc: 'Practice and get scored' },
    { href: 'cover-letter', icon: 'pen', title: 'Cover Letter', desc: 'Generate a tailored letter' },
    { href: 'letters', icon: 'pen', title: 'Letter Writer', desc: 'Retirement, promotion & thank-you letters' },
    { href: 'brag-doc', icon: 'trophy', title: 'Brag Doc', desc: 'Turn your wins into a review-ready one-pager' },
    { href: 'first-90-days', icon: 'compass', title: 'First 90 Days', desc: 'Ramp fast in a new role with a 30/60/90 plan' },
    { href: 'skill-gap', icon: 'gauge', title: 'Skill Gap Coach', desc: 'See what your target role wants that you\'re missing' },
    { href: 'assistant', icon: 'chat', title: 'Career Coach', desc: 'Ask anything, anytime' }
  ];
  function renderActions() {
    document.getElementById('dash-actions').innerHTML = ACTIONS.map(function (a) {
      return '<a class="act-card" href="' + a.href + '"><span class="act-ico">' + (SVG[a.icon] || SVG.doc) + '</span>'
        + '<span><span class="act-title">' + a.title + '</span><br><span class="act-desc">' + a.desc + '</span></span></a>';
    }).join('');
  }

  // ---------- profile form ----------
  function hydrateProfileForm() {
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; };
    set('pf-role', PROFILE.targetRole);
    set('pf-seniority', PROFILE.seniority);
    set('pf-status', PROFILE.searchStatus || 'active');
    set('pf-location', PROFILE.location);
    set('pf-goal', PROFILE.weeklyGoal);
  }
  function wireProfile() {
    var btn = document.getElementById('pf-save');
    btn.addEventListener('click', function () {
      var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
      PROFILE.targetRole = val('pf-role').slice(0, 80);
      PROFILE.seniority = val('pf-seniority');
      PROFILE.searchStatus = val('pf-status') || 'active';
      PROFILE.location = val('pf-location').slice(0, 80);
      var g = parseInt(val('pf-goal'), 10);
      PROFILE.weeklyGoal = (g > 0 && g < 100) ? g : '';
      saveProfile();
      if (window.toast) toast('Profile saved', { type: 'success' });
      renderGreeting();
      renderNudges();
    });
  }

  // ---------- win journal: weekly ritual + streak ----------
  // Weeks are anchored to Mon 2024-01-01 (a Monday) so every device buckets the
  // same way regardless of timezone quirks. A "win week" is any week with >=1 win.
  var WEEK = 7 * DAY;
  var MON0 = Date.UTC(2024, 0, 1);           // Monday, Jan 1 2024
  function weekIndex(ts) { return Math.floor((ts - MON0) / WEEK); }
  function winWeekSet() {
    var s = {};
    (PROFILE.achievements || []).forEach(function (w) { if (w && w.ts) s[weekIndex(w.ts)] = 1; });
    return s;
  }
  // Consecutive weeks with a win, ending at this week (or last week if this week
  // is still empty, so the streak doesn't "break" just because it's Monday).
  function winStreak() {
    var set = winWeekSet(), now = weekIndex(Date.now());
    var start = set[now] ? now : (set[now - 1] ? now - 1 : null);
    if (start == null) return 0;
    var n = 0; while (set[start]) { n++; start--; }
    return n;
  }
  function loggedThisWeek() { return !!winWeekSet()[weekIndex(Date.now())]; }

  function renderWinRitual() {
    var host = document.getElementById('win-ritual');
    if (!host) return;
    var set = winWeekSet(), now = weekIndex(Date.now()), streak = winStreak(), here = loggedThisWeek();
    var total = (PROFILE.achievements || []).length;
    // 8-week habit strip (oldest → this week), GitHub-contribution style.
    var dots = '';
    for (var i = 7; i >= 0; i--) {
      var wk = now - i;
      var cls = set[wk] ? 'on' : '';
      if (wk === now && !set[wk]) cls = 'now';
      dots += '<span class="wr-dot ' + cls + '" title="' + (set[wk] ? 'Win logged' : 'No win') + '"></span>';
    }
    var line;
    if (!total) {
      line = '<strong>Start your win streak.</strong> Log one thing that went well, it becomes a resume bullet and review-ready proof later.';
    } else if (here) {
      line = '<strong>Logged this week ✓</strong>' + (streak > 1 ? ', ' + streak + '-week streak. Keep it going.' : ', nice. Come back next week to build a streak.');
    } else {
      line = '<strong>What went well this week?</strong> ' + (streak >= 1 ? 'Log a win to keep your ' + streak + '-week streak alive.' : 'One quick win keeps your resume current all year.');
    }
    host.className = 'win-ritual' + (here ? ' done' : '');
    host.innerHTML =
      '<div class="wr-head"><span class="wr-streak">' + (streak >= 1 ? streak + '-week streak' : 'Weekly win') + '</span>'
        + '<div class="wr-weeks">' + dots + '</div></div>'
      + '<div class="wr-line">' + line + '</div>';
  }

  function renderWins() {
    var host = document.getElementById('win-list');
    var wins = PROFILE.achievements;
    if (!wins.length) { host.innerHTML = '<li class="win-empty">No wins logged yet. The moment something goes well, jot it here so you never lose it.</li>'; return; }
    host.innerHTML = wins.map(function (w) {
      var when = w.ts ? new Date(w.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
      return '<li class="win-item" data-id="' + w.id + '"><span class="win-txt">' + esc(w.text) + '<div class="win-date">' + when + '</div><div class="win-sug" hidden></div></span>'
        + '<button class="win-polish" data-polish="' + w.id + '" title="Polish into a resume-ready bullet">Polish</button>'
        + '<button class="win-del" data-id="' + w.id + '" title="Delete" aria-label="Delete win">×</button></li>';
    }).join('');
    host.querySelectorAll('.win-del').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        PROFILE.achievements = PROFILE.achievements.filter(function (w) { return String(w.id) !== String(id); });
        saveProfile(); renderWins(); renderWinRitual();
      });
    });
    host.querySelectorAll('.win-polish').forEach(function (b) {
      b.addEventListener('click', function () { polishWin(b.getAttribute('data-polish'), b); });
    });
  }

  // AI-polish a logged win into a resume-ready bullet. Non-destructive: shows the
  // suggestion inline; the user chooses "Use this" (replaces) or "Keep mine".
  function polishWin(id, btn) {
    var w = PROFILE.achievements.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!w || !API) return;
    var li = document.querySelector('.win-item[data-id="' + id + '"]');
    var sug = li && li.querySelector('.win-sug');
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = 'Polishing…';
    var role = PROFILE.currentRole || PROFILE.targetRole || '';
    fetch(API + '/ai/win', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }, body: JSON.stringify({ text: w.text, context: { role: role } }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        btn.disabled = false; btn.textContent = 'Polish';
        if (!res.ok) { if (window.toast) toast(res.d && res.d.error ? res.d.error : 'Could not polish that one, try again.', { type: 'error' }); return; }
        var polished = (res.d && res.d.text || '').trim();
        if (!polished || polished === w.text) { if (window.toast) toast('That one already reads well.', { type: 'info' }); return; }
        if (!sug) return;
        sug.hidden = false;
        sug.innerHTML = '<div class="ws-text">' + esc(polished) + '</div><div class="ws-row"><button class="ws-use">Use this</button><button class="ws-keep">Keep mine</button></div>';
        sug.querySelector('.ws-use').onclick = function () {
          w.text = polished.slice(0, 240); saveProfile(); renderWins();
          if (window.toast) toast('Win polished', { type: 'success' });
        };
        sug.querySelector('.ws-keep').onclick = function () { sug.hidden = true; sug.innerHTML = ''; };
      })
      .catch(function () { btn.disabled = false; btn.textContent = 'Polish'; if (window.toast) toast('Network error, try again.', { type: 'error' }); });
  }
  function addWin() {
    var input = document.getElementById('win-input');
    var text = (input.value || '').trim();
    if (!text) return;
    PROFILE.achievements.unshift({ id: Date.now() + '' + Math.floor(performance.now()), ts: Date.now(), text: text.slice(0, 240) });
    if (PROFILE.achievements.length > 100) PROFILE.achievements = PROFILE.achievements.slice(0, 100);
    saveProfile();
    input.value = '';
    renderWins();
    renderWinRitual();
    if (window.toast) toast('Win logged', { type: 'success' });
  }
  function wireWins() {
    document.getElementById('win-add').addEventListener('click', addWin);
    document.getElementById('win-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') addWin(); });
  }

  // ---------- weekly-reminder email consent (opt-in) ----------
  function renderEmailPref() {
    var t = document.getElementById('win-email-toggle');
    if (t) t.classList.toggle('on', PROFILE.emailWeeklyWin === true);
  }
  function wireEmailPref() {
    var el = document.getElementById('win-emailpref');
    if (!el) return;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      PROFILE.emailWeeklyWin = !(PROFILE.emailWeeklyWin === true);
      saveProfile();               // syncs the opt-in to the cloud; the Friday cron reads it
      renderEmailPref();
      if (window.toast) toast(PROFILE.emailWeeklyWin
        ? 'Weekly reminder on, we\'ll nudge you only if you skip a week. Unsubscribe anytime.'
        : 'Weekly reminder off. We won\'t email you.', { type: 'success' });
    });
  }

  // ---------- greeting ----------
  function renderGreeting() {
    var h = new Date().getHours();
    var part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    var name = firstName();
    document.getElementById('dash-greeting').textContent = part + (name ? ', ' + name : '') + '.';
    var jobs = loadJobs();
    var active = jobs.filter(function (j) { return j.status === 'Applied' || j.status === 'Interviewing'; }).length;
    var bits = [];
    if (PROFILE.targetRole) bits.push('Targeting ' + PROFILE.targetRole);
    bits.push(active ? (active + ' active application' + (active === 1 ? '' : 's')) : 'No active applications yet');
    document.getElementById('dash-sub').textContent = bits.join(' · ') + '.';
  }

  // ---------- account center (self-contained; mirrors editor/export) ----------
  window.signOut = function () {
    ['hf_token', 'hf_email', 'hf_resume', 'hf_jobs', 'hf_jobs_ts', 'hf_ai_results', 'hf_welcome', 'hf_profile'].forEach(function (k) { localStorage.removeItem(k); });
    location.href = '/';
  };
  window.toggleAcctMenu = function (e) {
    if (e) e.stopPropagation();
    var menu = document.getElementById('acct-menu'); if (!menu) return;
    if (menu.hasAttribute('hidden')) {
      menu.removeAttribute('hidden');
      var t = document.getElementById('acct-trigger'); if (t) t.setAttribute('aria-expanded', 'true');
      document.getElementById('acct-center').classList.add('open');
    } else { closeAcctMenu(); }
  };
  window.closeAcctMenu = function () {
    var menu = document.getElementById('acct-menu'); if (!menu || menu.hasAttribute('hidden')) return;
    menu.setAttribute('hidden', '');
    var t = document.getElementById('acct-trigger'); if (t) t.setAttribute('aria-expanded', 'false');
    var c = document.getElementById('acct-center'); if (c) c.classList.remove('open');
  };
  document.addEventListener('click', function (e) {
    var c = document.getElementById('acct-center');
    if (c && !c.contains(e.target)) closeAcctMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAcctMenu(); });

  function hydrateAccount() {
    var acctEmail = (window.CURRENT_USER && CURRENT_USER.email) || localStorage.getItem('hf_email') || '';
    var initials = acctEmail ? acctEmail.trim().charAt(0).toUpperCase() : 'A';
    ['acct-avatar', 'acct-avatar-lg'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = initials; });
    var emEl = document.getElementById('acct-email'); if (emEl) emEl.textContent = acctEmail || 'Account';
    var admin = (typeof isAdmin === 'function' && isAdmin());
    var paid = (typeof isPaid === 'function' && isPaid());
    var plEl = document.getElementById('acct-plan-label');
    if (plEl) plEl.textContent = admin ? 'Admin · full access' : (paid ? ((typeof planLabel === 'function' ? planLabel() : 'Premium') + ' plan') : 'Free plan');
    var mgRow = document.getElementById('acct-manage-sub'); if (mgRow) mgRow.style.display = (paid && !admin) ? '' : 'none';
    var adRow = document.getElementById('acct-admin-console'); if (adRow) adRow.style.display = admin ? '' : 'none';
    var pill = document.getElementById('plan-pill');
    if (pill) {
      if (admin) pill.innerHTML = '<span class="pill success">Admin</span>';
      else if (paid) pill.innerHTML = '<button class="pill success" onclick="openBillingPortal()" style="cursor:pointer;">' + (typeof planLabel === 'function' ? planLabel() : 'Premium') + '</button>';
      else pill.innerHTML = '<a class="btn btn-primary btn-xs" href="pricing">Upgrade</a>';
    }
  }

  // ---------- boot ----------
  renderGreeting();
  renderNudges();
  renderPipe();
  renderActions();
  hydrateProfileForm();
  wireProfile();
  renderWins();
  renderWinRitual();
  wireWins();
  renderEmailPref();
  wireEmailPref();
  hydrateAccount();

  // Refresh identity + plan once the user record loads from the API.
  if (typeof loadCurrentUser === 'function') {
    Promise.resolve(loadCurrentUser()).then(function () { hydrateAccount(); renderGreeting(); }).catch(function () {});
  }

  // Pull the cloud profile; if it's newer than local, adopt it and re-render.
  pullProfile().then(function (adopted) {
    if (adopted) { hydrateProfileForm(); renderWins(); renderWinRitual(); renderEmailPref(); renderGreeting(); renderNudges(); }
  });

  // Pull cloud jobs; if newer, the pipeline / nudges / greeting reflect them.
  if (window.HFJobsSync) HFJobsSync.pull(function (adopted) {
    if (adopted) { renderPipe(); renderNudges(); renderGreeting(); }
  });
})();
