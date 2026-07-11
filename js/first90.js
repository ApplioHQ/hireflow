/* first90.js, a 30/60/90-day onboarding plan for a new role. State lives in
   hf_profile.onboarding (cloud-synced via /profile), so it follows the user and
   sits alongside their win journal. Zero AI; all client-side. */
(function () {
  'use strict';
  var TOKEN = localStorage.getItem('hf_token');
  if (!TOKEN) { location.href = 'login'; return; }
  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';

  window.signOut = function () {
    ['hf_token', 'hf_email', 'hf_resume', 'hf_jobs', 'hf_jobs_ts', 'hf_ai_results', 'hf_welcome', 'hf_profile'].forEach(function (k) { localStorage.removeItem(k); });
    location.href = '/';
  };

  function readJSON(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  var PROFILE = readJSON('hf_profile', {}) || {};
  if (!PROFILE || typeof PROFILE !== 'object') PROFILE = {};
  function ob() {
    if (!PROFILE.onboarding || typeof PROFILE.onboarding !== 'object') PROFILE.onboarding = {};
    var o = PROFILE.onboarding;
    if (!o.done || typeof o.done !== 'object') o.done = {};
    if (!o.custom || typeof o.custom !== 'object') o.custom = { p1: [], p2: [], p3: [] };
    ['p1', 'p2', 'p3'].forEach(function (k) { if (!Array.isArray(o.custom[k])) o.custom[k] = []; });
    if (!o.people || typeof o.people !== 'object') o.people = {};
    return o;
  }

  function save() {
    PROFILE.updatedAt = Date.now();
    try { localStorage.setItem('hf_profile', JSON.stringify(PROFILE)); } catch (e) {}
    if (API) fetch(API + '/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }, body: JSON.stringify({ profile: PROFILE }) }).catch(function () {});
  }

  var PHASES = [
    { key: 'p1', title: 'First 30 days', sub: 'Learn & connect', tasks: [
      { id: 'p1a', label: 'Ask your manager what success looks like at 30, 60, and 90 days' },
      { id: 'p1b', label: 'Map your team and key partners; set up intro chats with each' },
      { id: 'p1c', label: 'Learn the tools, systems, and docs you\'ll use every day' },
      { id: 'p1d', label: 'Understand how your team\'s work is measured, the metrics that matter' },
      { id: 'p1e', label: 'Read recent projects, roadmaps, and past decisions or postmortems' },
      { id: 'p1f', label: 'Identify your go-to person for each area, and one peer to lean on' },
      { id: 'p1g', label: 'Write down early questions and friction, you\'ll never see them this freshly again' }
    ] },
    { key: 'p2', title: 'Days 31–60', sub: 'Contribute', tasks: [
      { id: 'p2a', label: 'Take full ownership of a first project or workstream' },
      { id: 'p2b', label: 'Ship an early, visible win that helps the team' },
      { id: 'p2c', label: 'Give your manager a 30-day reflection: what\'s clear, what isn\'t' },
      { id: 'p2d', label: 'Build relationships beyond your immediate team' },
      { id: 'p2e', label: 'Start logging accomplishments in your Win Journal as you go' },
      { id: 'p2f', label: 'Ask for feedback on your first deliverables' }
    ] },
    { key: 'p3', title: 'Days 61–90', sub: 'Deliver & set direction', tasks: [
      { id: 'p3a', label: 'Deliver a meaningful result you\'re genuinely proud of' },
      { id: 'p3b', label: 'Propose one improvement you\'re uniquely positioned to see' },
      { id: 'p3c', label: 'Align with your manager on goals for the next quarter' },
      { id: 'p3d', label: 'Ask for a formal 90-day feedback conversation' },
      { id: 'p3e', label: 'Document your onboarding notes for the next new hire' },
      { id: 'p3f', label: 'Set your development goals and growth path' }
    ] }
  ];
  var PEOPLE = [
    { id: 'mgr', label: 'Your manager' },
    { id: 'skip', label: 'Your skip-level (manager\'s manager)' },
    { id: 'team', label: 'Every immediate teammate' },
    { id: 'xfn', label: 'Key cross-functional partners' },
    { id: 'buddy', label: 'A mentor or onboarding buddy' },
    { id: 'aspire', label: 'Someone in a role you aspire to' }
  ];
  var QUESTIONS = [
    'What does success look like for me at 30, 60, and 90 days?',
    'What are the most important metrics for our team right now?',
    'How do you like to communicate, and how often should we sync?',
    'Who should I make sure to build a relationship with early?',
    'What\'s a realistic quick win I could target in my first month?',
    'What are the biggest challenges facing the team this year?',
    'Is there anything about how you like to work that I should know?'
  ];

  function allTaskIds() {
    var ids = [];
    PHASES.forEach(function (p) {
      p.tasks.forEach(function (t) { ids.push(t.id); });
      ob().custom[p.key].forEach(function (c) { ids.push(c.id); });
    });
    return ids;
  }

  function renderPhases() {
    var o = ob(), grid = document.getElementById('n90-grid');
    var activeKey = activePhaseKey();
    grid.innerHTML = PHASES.map(function (p) {
      var customs = o.custom[p.key];
      var all = p.tasks.concat(customs);
      var doneN = all.filter(function (t) { return o.done[t.id]; }).length;
      var rows = all.map(function (t) {
        var isCustom = customs.indexOf(t) !== -1;
        var checked = !!o.done[t.id];
        return '<li class="n90-task' + (checked ? ' checked' : '') + '">'
          + '<input type="checkbox" data-tid="' + t.id + '"' + (checked ? ' checked' : '') + '>'
          + '<label data-tid="' + t.id + '">' + esc(t.label) + '</label>'
          + (isCustom ? '<button class="t-del" data-del="' + p.key + ':' + t.id + '" title="Remove">×</button>' : '')
          + '</li>';
      }).join('');
      return '<div class="n90-phase' + (p.key === activeKey ? ' active' : '') + '">'
        + '<h3>' + p.title + '</h3><div class="ph-sub">' + p.sub + '</div>'
        + '<div class="ph-count">' + doneN + ' / ' + all.length + ' done</div>'
        + '<ul class="n90-tasks">' + rows + '</ul>'
        + '<div class="n90-add"><input type="text" placeholder="Add your own…" data-add="' + p.key + '" maxlength="140"><button data-addbtn="' + p.key + '">Add</button></div>'
        + '</div>';
    }).join('');
    wirePhases();
    renderProgress();
  }

  function wirePhases() {
    var grid = document.getElementById('n90-grid');
    grid.querySelectorAll('input[type="checkbox"][data-tid]').forEach(function (cb) {
      cb.addEventListener('change', function () { toggle(cb.getAttribute('data-tid'), cb.checked); });
    });
    grid.querySelectorAll('.t-del').forEach(function (b) {
      b.addEventListener('click', function () { var parts = b.getAttribute('data-del').split(':'); removeCustom(parts[0], parts[1]); });
    });
    grid.querySelectorAll('[data-addbtn]').forEach(function (b) {
      b.addEventListener('click', function () { addCustom(b.getAttribute('data-addbtn')); });
    });
    grid.querySelectorAll('[data-add]').forEach(function (inp) {
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') addCustom(inp.getAttribute('data-add')); });
    });
  }

  function toggle(id, on) { ob().done[id] = !!on; save(); renderPhases(); }
  function addCustom(pk) {
    var inp = document.querySelector('[data-add="' + pk + '"]');
    var text = (inp.value || '').trim();
    if (!text) return;
    ob().custom[pk].push({ id: 'c' + Date.now().toString(36) + Math.floor(performance.now()), label: text.slice(0, 140) });
    save(); renderPhases();
  }
  function removeCustom(pk, id) {
    var o = ob();
    o.custom[pk] = o.custom[pk].filter(function (t) { return t.id !== id; });
    delete o.done[id];
    save(); renderPhases();
  }

  function renderProgress() {
    var o = ob(), ids = allTaskIds();
    var done = ids.filter(function (id) { return o.done[id]; }).length;
    var pct = ids.length ? Math.round(done / ids.length * 100) : 0;
    document.getElementById('n90-prog-bar').style.width = pct + '%';
    document.getElementById('n90-prog-label').textContent = done + ' of ' + ids.length + ' done · ' + pct + '%';
  }

  // Which phase is "current" based on days since start (for the highlight).
  function daysIn() {
    var o = ob();
    if (!o.startDate) return null;
    var start = new Date(o.startDate + 'T00:00:00');
    if (isNaN(start)) return null;
    return Math.floor((Date.now() - start.getTime()) / 86400000);
  }
  function activePhaseKey() {
    var d = daysIn();
    if (d == null) return null;
    if (d < 0) return null;
    if (d <= 30) return 'p1';
    if (d <= 60) return 'p2';
    return 'p3';
  }
  function renderDayBadge() {
    var d = daysIn(), el = document.getElementById('n90-day');
    if (d == null) { el.innerHTML = 'Day <span>, set a start date</span>'; return; }
    if (d < 0) { el.innerHTML = 'Starts in ' + (-d) + ' day' + (-d === 1 ? '' : 's'); return; }
    if (d > 90) { el.innerHTML = 'Day 90+ <span>· ramp complete</span>'; return; }
    el.innerHTML = 'Day ' + d + ' <span>of 90</span>';
  }

  function renderRefs() {
    document.getElementById('n90-people').innerHTML = PEOPLE.map(function (p) {
      var checked = !!ob().people[p.id];
      return '<li class="n90-task' + (checked ? ' checked' : '') + '"><input type="checkbox" data-pid="' + p.id + '"' + (checked ? ' checked' : '') + '><label data-pid="' + p.id + '">' + esc(p.label) + '</label></li>';
    }).join('');
    document.getElementById('n90-people').querySelectorAll('input[data-pid]').forEach(function (cb) {
      cb.addEventListener('change', function () { ob().people[cb.getAttribute('data-pid')] = cb.checked; save(); renderRefs(); });
    });
    document.getElementById('n90-questions').innerHTML = QUESTIONS.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('');
  }

  function hydrateSetup() {
    var o = ob();
    var role = document.getElementById('n90-role'), comp = document.getElementById('n90-company'), start = document.getElementById('n90-start');
    // Prefill role/company from the resume if not set yet.
    if (!o.role) { var r = readJSON('hf_resume', null); if (r && r.experience && r.experience[0]) { o.role = r.experience[0].title || ''; o.company = r.experience[0].company || ''; } }
    role.value = o.role || ''; comp.value = o.company || ''; start.value = o.startDate || '';
    role.addEventListener('input', function () { ob().role = role.value.trim(); save(); });
    comp.addEventListener('input', function () { ob().company = comp.value.trim(); save(); });
    start.addEventListener('change', function () { ob().startDate = start.value; save(); renderDayBadge(); renderPhases(); });
  }

  function renderAll() { hydrateSetup(); renderDayBadge(); renderPhases(); renderRefs(); }

  // Pull the freshest cloud profile first, then render.
  if (API) {
    fetch(API + '/profile', { headers: { 'Authorization': 'Bearer ' + TOKEN } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.profile && typeof d.profile === 'object') {
          if (!PROFILE.updatedAt || (d.profile.updatedAt && d.profile.updatedAt >= PROFILE.updatedAt)) {
            PROFILE = d.profile;
            try { localStorage.setItem('hf_profile', JSON.stringify(PROFILE)); } catch (e) {}
          }
        }
        renderAll();
      })
      .catch(renderAll);
  } else { renderAll(); }
})();
