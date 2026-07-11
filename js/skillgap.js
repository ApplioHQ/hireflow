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

  function analyze() {
    var role = (document.getElementById('sg-role').value || '').trim();
    if (!role) { if (window.toast) toast('Enter the role you\'re targeting first.', { type: 'warn' }); return; }
    // Persist the target role so other tools + the dashboard stay in sync.
    if (profile.targetRole !== role) {
      profile.targetRole = role; profile.updatedAt = Date.now();
      try { localStorage.setItem('hf_profile', JSON.stringify(profile)); } catch (e) {}
      if (API) fetch(API + '/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }, body: JSON.stringify({ profile: profile }) }).catch(function () {});
    }
    var btn = document.getElementById('sg-run');
    btn.disabled = true; btn.textContent = 'Analyzing…';
    out.innerHTML = '<div class="sg-status">Comparing your resume against what ' + esc(role) + ' roles expect…</div>';
    fetch(API + '/ai/skill-gap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify({ role: role, skills: currentSkills(), context: resumeContext() })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        btn.disabled = false; btn.textContent = 'Find my gaps';
        if (!res.ok) { out.innerHTML = '<div class="sg-empty"><h2>Couldn\'t analyze that</h2><p>' + esc((res.d && res.d.error) || 'Please try again in a moment.') + '</p></div>'; return; }
        render(role, res.d || {});
      })
      .catch(function () { btn.disabled = false; btn.textContent = 'Find my gaps'; out.innerHTML = '<div class="sg-empty"><h2>Network error</h2><p>Please try again.</p></div>'; });
  }

  function render(role, data) {
    var missing = Array.isArray(data.missing) ? data.missing : [];
    var relevant = Array.isArray(data.relevant) ? data.relevant : [];
    if (!missing.length) {
      out.innerHTML = '<div class="sg-empty"><h2>No obvious gaps found</h2>'
        + '<p>Your resume already covers the core skills for ' + esc(role) + '. Add a target job description in <a href="match" style="color:var(--accent);font-weight:600;">Best Match</a> for a sharper, posting-specific comparison.</p></div>';
      return;
    }
    var html = '';
    if (relevant.length) {
      html += '<div class="sg-block"><h2>Skills you already show</h2>'
        + '<div class="sg-sub">These are on your resume and fit a ' + esc(role) + ' — keep them front and center.</div>'
        + '<div class="sg-chips">' + relevant.map(function (s) { return '<span class="sg-chip">' + esc(s) + '</span>'; }).join('') + '</div></div>';
    }
    html += '<div class="sg-block"><h2>Gaps to close</h2>'
      + '<div class="sg-sub">The highest-impact skills ' + esc(role) + ' roles expect that aren\'t on your resume yet.</div>'
      + missing.map(function (m, i) {
        return '<div class="sg-gap"><div class="sg-num">' + (i + 1) + '</div><div><div class="sg-skill">' + esc(m.skill) + '</div>'
          + (m.why ? '<div class="sg-why">' + esc(m.why) + '</div>' : '') + '</div></div>';
      }).join('') + '</div>';
    html += '<div class="sg-cta"><strong>What to do with this:</strong> for any skill you actually have, add it in the '
      + '<a href="editor">Resume Builder</a> so recruiters and ATS filters catch it. Treat the rest as your learning shortlist — the fastest way to become a stronger ' + esc(role) + ' candidate. '
      + 'Never list a skill you can\'t back up in an interview.</div>';
    out.innerHTML = html;
  }

  document.getElementById('sg-run').addEventListener('click', analyze);
  document.getElementById('sg-role').addEventListener('keydown', function (e) { if (e.key === 'Enter') analyze(); });

  // Prefill the target role and, if we have one + a resume, auto-run once.
  var pre = defaultRole();
  if (pre) {
    document.getElementById('sg-role').value = pre;
    if (currentSkills().length) analyze();
    else out.innerHTML = '<div class="sg-empty"><h2>Add your skills first</h2><p>Your resume has no skills listed yet. Add them in the <a href="editor" style="color:var(--accent);font-weight:600;">Resume Builder</a>, then come back for a gap analysis.</p></div>';
  }
})();
