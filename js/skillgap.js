/* skillgap.js — Skill Gap Coach. Compares a target role against the skills already
   on the user's resume (hf_resume) and shows the highest-impact missing ones via the
   grounded /ai/skill-gap endpoint. Never claims the user has a skill they don't. */
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

  var resume = readJSON('hf_resume', null) || {};
  var profile = readJSON('hf_profile', {}) || {};

  // Flatten the resume's skills into a plain list for the comparison.
  function currentSkills() {
    var out = [];
    var cats = (resume.skills && resume.skills.categories) || [];
    cats.forEach(function (c) { if (c && Array.isArray(c.items)) c.items.forEach(function (i) { if (i) out.push(String(i)); }); });
    return out;
  }
  // A short context string (recent titles + summary) so the AI judges seniority/domain.
  function resumeContext() {
    var bits = [];
    if (resume.personal && resume.personal.summary) bits.push(resume.personal.summary);
    (resume.experience || []).slice(0, 3).forEach(function (e) {
      if (e && (e.title || e.company)) bits.push([e.title, e.company].filter(Boolean).join(' at '));
    });
    return bits.join('. ').slice(0, 1800);
  }
  function defaultRole() {
    if (profile.targetRole) return profile.targetRole;
    if (profile.currentRole) return profile.currentRole;
    var e = (resume.experience || [])[0];
    return (e && e.title) || '';
  }

  var out = document.getElementById('sg-out');

  function analyze(useJD) {
    var role = (document.getElementById('sg-role').value || '').trim();
    var jd = useJD ? (document.getElementById('sg-jd').value || '').trim() : '';
    if (useJD && !jd) { if (window.toast) toast('Paste a job description first.', { type: 'warn' }); return; }
    if (!useJD && !role) { if (window.toast) toast('Enter the role you\'re targeting first.', { type: 'warn' }); return; }
    // Persist the target role so other tools + the dashboard stay in sync.
    if (role && profile.targetRole !== role) {
      profile.targetRole = role; profile.updatedAt = Date.now();
      try { localStorage.setItem('hf_profile', JSON.stringify(profile)); } catch (e) {}
      if (API) fetch(API + '/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }, body: JSON.stringify({ profile: profile }) }).catch(function () {});
    }
    var btnId = useJD ? 'sg-run-jd' : 'sg-run';
    var restore = useJD ? 'Analyze this posting' : 'Find my gaps';
    var btn = document.getElementById(btnId);
    btn.disabled = true; btn.textContent = 'Analyzing…';
    out.innerHTML = '<div class="sg-status">' + (useJD ? 'Comparing your resume against this job posting…' : 'Comparing your resume against what ' + esc(role) + ' roles expect…') + '</div>';
    var body = { role: role, skills: currentSkills(), context: resumeContext() };
    if (jd) body.jobDescription = jd;
    fetch(API + '/ai/skill-gap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        btn.disabled = false; btn.textContent = restore;
        if (!res.ok) { out.innerHTML = '<div class="sg-empty"><h2>Couldn\'t analyze that</h2><p>' + esc((res.d && res.d.error) || 'Please try again in a moment.') + '</p></div>'; return; }
        render(role, res.d || {}, !!jd);
      })
      .catch(function () { btn.disabled = false; btn.textContent = restore; out.innerHTML = '<div class="sg-empty"><h2>Network error</h2><p>Please try again.</p></div>'; });
  }

  function render(role, data, isJD) {
    var missing = Array.isArray(data.missing) ? data.missing : [];
    var relevant = Array.isArray(data.relevant) ? data.relevant : [];
    var forWhat = isJD ? 'this posting' : (esc(role) + ' roles');
    if (!missing.length) {
      out.innerHTML = '<div class="sg-empty"><h2>No obvious gaps found</h2>'
        + '<p>' + (isJD ? 'Your resume already covers the key skills this posting asks for. Tailor your bullets to match its language in the <a href="match" style="color:var(--accent);font-weight:600;">Best Match</a> tool.'
          : 'Your resume already covers the core skills for ' + esc(role) + '. Paste a specific job posting above for a sharper, job-specific comparison.') + '</p></div>';
      return;
    }
    var html = '';
    if (relevant.length) {
      html += '<div class="sg-block"><h2>Skills you already show</h2>'
        + '<div class="sg-sub">' + (isJD ? 'On your resume and asked for in this posting — lead with these.' : 'These are on your resume and fit a ' + esc(role) + ' — keep them front and center.') + '</div>'
        + '<div class="sg-chips">' + relevant.map(function (s) { return '<span class="sg-chip">' + esc(s) + '</span>'; }).join('') + '</div></div>';
    }
    html += '<div class="sg-block"><h2>Gaps to close</h2>'
      + '<div class="sg-sub">' + (isJD ? 'The most important skills this posting asks for that aren\'t on your resume yet.' : 'The highest-impact skills ' + esc(role) + ' roles expect that aren\'t on your resume yet.') + '</div>'
      + missing.map(function (m, i) {
        return '<div class="sg-gap"><div class="sg-num">' + (i + 1) + '</div><div><div class="sg-skill">' + esc(m.skill) + '</div>'
          + (m.why ? '<div class="sg-why">' + esc(m.why) + '</div>' : '') + '</div></div>';
      }).join('') + '</div>';
    html += '<div class="sg-cta"><strong>What to do with this:</strong> for any skill you actually have, add it in the '
      + '<a href="editor">Resume Builder</a> so recruiters and ATS filters catch it' + (isJD ? ' when you apply' : '') + '. Treat the rest as your learning shortlist. '
      + 'Never list a skill you can\'t back up in an interview.</div>';
    out.innerHTML = html;
  }

  document.getElementById('sg-run').addEventListener('click', function () { analyze(false); });
  document.getElementById('sg-run-jd').addEventListener('click', function () { analyze(true); });
  document.getElementById('sg-role').addEventListener('keydown', function (e) { if (e.key === 'Enter') analyze(false); });

  // ---- One-click gap check on a job from the tracker ----
  var trackedJobs = [];
  function populateJobs(list) {
    var jobs = (list || []).filter(function (j) { return j && (j.title || j.company); });
    trackedJobs = jobs;
    var sel = document.getElementById('sg-job'), pick = document.getElementById('sg-jobpick');
    if (!sel || !pick) return;
    if (!jobs.length) { pick.style.display = 'none'; maybeDeepLink(); return; }
    sel.innerHTML = '<option value="">Pick a tracked job…</option>' + jobs.map(function (j, i) {
      return '<option value="' + i + '">' + esc((j.title || 'Role') + (j.company ? ' · ' + j.company : '')) + (j.jd && j.jd.trim() ? '  (posting saved)' : '') + '</option>';
    }).join('');
    pick.style.display = '';
    maybeDeepLink();
  }
  function selectJob(j) {
    if (!j) return;
    var hint = document.getElementById('sg-jobpick-hint');
    if (j.title) document.getElementById('sg-role').value = j.title;
    if (j.jd && j.jd.trim()) {
      document.getElementById('sg-jd-wrap').open = true;
      document.getElementById('sg-jd').value = j.jd;
      if (hint) hint.textContent = 'Analyzing against this saved posting.';
      analyze(true);
    } else {
      if (hint) hint.textContent = 'No posting saved for this job — analyzing by role. Add the job description in the tracker for a posting-specific check.';
      analyze(false);
    }
  }
  document.getElementById('sg-job').addEventListener('change', function () { selectJob(trackedJobs[+this.value]); });

  // Deep link from a Job Tracker card: /skill-gap?job=<id> auto-selects & analyzes it.
  var _deepJobId = (function () { try { return new URLSearchParams(location.search).get('job'); } catch (e) { return null; } })();
  var _deepDone = false;
  function maybeDeepLink() {
    if (_deepDone || !_deepJobId) return;
    for (var i = 0; i < trackedJobs.length; i++) {
      if (String(trackedJobs[i].id) === String(_deepJobId)) {
        _deepDone = true;
        var sel = document.getElementById('sg-job'); if (sel) sel.value = String(i);
        selectJob(trackedJobs[i]);
        return;
      }
    }
  }
  function loadTrackedJobs() {
    var local = readJSON('hf_jobs', []);
    populateJobs(Array.isArray(local) ? local : []);
    if (!API) return;
    fetch(API + '/jobs', { headers: { 'Authorization': 'Bearer ' + TOKEN } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.jobs)) populateJobs(d.jobs); })
      .catch(function () {});
  }
  loadTrackedJobs();

  // Prefill the target role and, if we have one + a resume, auto-run once — unless
  // a ?job= deep link is present (that takes over and analyzes the specific job).
  var pre = defaultRole();
  if (pre) document.getElementById('sg-role').value = pre;
  if (pre && !_deepJobId) {
    if (currentSkills().length) analyze();
    else out.innerHTML = '<div class="sg-empty"><h2>Add your skills first</h2><p>Your resume has no skills listed yet. Add them in the <a href="editor" style="color:var(--accent);font-weight:600;">Resume Builder</a>, then come back for a gap analysis.</p></div>';
  }
})();
