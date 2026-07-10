/* autopilot.js — Application Autopilot: one job description in, a full application
   packet out (fit verdict + tailored resume + cover letter + missing keywords).
   Calls the single /ai/autopilot endpoint, which orchestrates the tuned ATS, Tailor,
   and Cover Letter analyses server-side. Premium feature (backend enforces gating). */
(function () {
  'use strict';

  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';
  var TOKEN = localStorage.getItem('hf_token');
  if (!TOKEN) { location.href = 'login'; return; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function readResume() { try { var r = JSON.parse(localStorage.getItem('hf_resume') || 'null'); return (r && typeof r === 'object') ? r : null; } catch (e) { return null; } }
  function resumeName(r) { return (r && r.personal && r.personal.fullName) || ''; }

  var els = {
    jd: document.getElementById('ap-jd'),
    role: document.getElementById('ap-role'),
    company: document.getElementById('ap-company'),
    tone: document.getElementById('ap-tone'),
    run: document.getElementById('ap-run'),
    loading: document.getElementById('ap-loading'),
    results: document.getElementById('ap-results'),
    resumeNote: document.getElementById('ap-resume-note')
  };

  // ---------- resume presence note ----------
  function refreshResumeNote() {
    var r = readResume();
    if (!r || !Object.keys(r).length) {
      els.resumeNote.innerHTML = '⚠ No résumé found. <a href="editor">Build or import your résumé</a> first — Autopilot tailors it to the job.';
      return false;
    }
    var nm = resumeName(r);
    els.resumeNote.innerHTML = '✓ Using your saved résumé' + (nm ? ' (<strong>' + esc(nm) + '</strong>)' : '') + '. <a href="editor">Edit</a>';
    return true;
  }

  // ---------- run ----------
  function setLoading(on) {
    els.run.disabled = on;
    els.loading.classList.toggle('show', on);
    els.run.textContent = on ? 'Running…' : 'Run Autopilot →';
  }

  els.run.addEventListener('click', run);
  function run() {
    var jd = (els.jd.value || '').trim();
    if (jd.length < 40) { if (window.toast) toast('Paste the full job description first', { type: 'warn' }); els.jd.focus(); return; }
    var resume = readResume();
    if (!resume || !Object.keys(resume).length) { refreshResumeNote(); if (window.toast) toast('Build your résumé first', { type: 'warn' }); return; }

    // Premium gate (backend also enforces): give a clean upsell instead of a wasted call.
    var admin = (typeof isAdmin === 'function' && isAdmin());
    var paid = (typeof isPaid === 'function' && isPaid());
    if (!paid && !admin) { renderUpgrade(); els.results.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }

    setLoading(true);
    els.results.classList.remove('show');
    fetch(API + '/ai/autopilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify({ jobDescription: jd.slice(0, 8000), resume: resume, tone: els.tone.value, role: (els.role.value || '').trim(), company: (els.company.value || '').trim() })
    }).then(function (r) {
      if (r.status === 402) { renderUpgrade(); return null; }
      if (r.status === 429) { return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error || "You've hit today's AI limit. Try again tomorrow."); }); }
      if (!r.ok) { return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error || 'Autopilot failed (' + r.status + ')'); }); }
      return r.json();
    }).then(function (data) {
      if (data) { render(data); els.results.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }).catch(function (e) {
      if (window.toast) toast(e.message || 'Something went wrong. Please try again.', { type: 'error', duration: 4500 });
    }).finally(function () { setLoading(false); });
  }

  // ---------- render ----------
  var VC = { apply: '#22c55e', stretch: '#f59e0b', skip: '#ef4444' };
  function ringColor(v) { return VC[v] || 'var(--accent)'; }

  function render(d) {
    var parts = [];
    parts.push(verdictCard(d));
    if (d.missingKeywords && d.missingKeywords.length) parts.push(keywordsCard(d));
    if (d.tailor) parts.push(tailorCard(d.tailor));
    if (d.coverLetter) parts.push(coverCard(d.coverLetter));
    parts.push(saveCard(d));
    els.results.innerHTML = parts.join('');
    els.results.classList.add('show');
    wireActions(d);
    // animate the ring
    var f = document.getElementById('ap-ring-fill');
    if (f && d.fit && typeof d.fit.score === 'number') {
      var C = 2 * Math.PI * 42;
      requestAnimationFrame(function () { f.style.strokeDashoffset = String(C * (1 - d.fit.score / 100)); });
    }
    var fails = d.failed || {};
    if (fails.ats || fails.tailor || fails.cover) {
      var miss = []; if (fails.ats) miss.push('fit score'); if (fails.tailor) miss.push('résumé tailoring'); if (fails.cover) miss.push('cover letter');
      var note = document.createElement('div'); note.className = 'ap-fail';
      note.textContent = '⚠ The ' + miss.join(' and ') + ' couldn\'t be generated this time — try running again.';
      els.results.insertBefore(note, els.results.firstChild);
    }
  }

  function verdictCard(d) {
    var fit = d.fit || {}, ats = d.ats || {};
    var score = typeof fit.score === 'number' ? fit.score : null;
    var col = ringColor(fit.verdict);
    var C = 2 * Math.PI * 42;
    var ring = score == null ? '' :
      '<div class="ap-ring"><svg viewBox="0 0 100 100" width="96" height="96">'
      + '<circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" stroke-width="8"/>'
      + '<circle id="ap-ring-fill" cx="50" cy="50" r="42" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" transform="rotate(-90 50 50)"/>'
      + '</svg><div class="ap-ring-num" style="color:' + col + ';">' + score + '</div></div>';
    var bars = '';
    if (ats.breakdown && typeof ats.breakdown === 'object') {
      bars = '<div class="ap-bars">' + [['keywords', 'Keyword match'], ['experience', 'Experience'], ['formatting', 'Formatting'], ['completeness', 'Completeness']].map(function (p) {
        var v = ats.breakdown[p[0]]; if (typeof v !== 'number') v = 0;
        var bc = v >= 75 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444';
        return '<div><div style="display:flex;justify-content:space-between;font-size:12.5px;"><span style="color:var(--muted);">' + p[1] + '</span><span style="font-weight:700;">' + v + '</span></div><div class="ap-bar-track"><div class="ap-bar-fill" style="width:' + Math.max(0, Math.min(100, v)) + '%;background:' + bc + ';"></div></div></div>';
      }).join('') + '</div>';
    }
    return '<div class="ap-card"><h2>Fit verdict</h2>'
      + '<div class="ap-verdict">' + ring
      + '<div class="ap-verdict-text"><div class="ap-verdict-label" style="color:' + col + ';">' + esc(fit.label || 'Assessed') + '</div>'
      + (ats.feedback ? '<div class="ap-verdict-why">' + esc(ats.feedback) + '</div>' : '') + '</div></div>'
      + bars + '</div>';
  }

  function keywordsCard(d) {
    var matched = (d.tailor && d.tailor.matchedKeywords) || [];
    var missing = d.missingKeywords || [];
    return '<div class="ap-card"><h2>Keywords</h2><div class="ap-card-sub">Add the missing ones where they\'re genuinely true for you.</div>'
      + (matched.length ? '<div style="font-weight:700;font-size:13px;margin-bottom:4px;">Already matched</div>' + matched.map(function (k) { return '<span class="ap-chip ap-chip-ok">' + esc(k) + '</span>'; }).join('') : '')
      + '<div style="font-weight:700;font-size:13px;margin:14px 0 4px;">Missing</div>' + missing.map(function (k) { return '<span class="ap-chip ap-chip-no">' + esc(k) + '</span>'; }).join('')
      + '</div>';
  }

  function tailorCard(t) {
    var body = '';
    if (t.summary) {
      body += '<div style="font-weight:700;font-size:13px;margin-bottom:6px;">Tailored summary</div>'
        + '<div class="ap-diff"><div class="ap-diff-after" id="ap-new-summary">' + esc(t.summary) + '</div></div>'
        + '<div class="ap-actions" style="margin-bottom:16px;"><button class="btn btn-secondary btn-sm" id="ap-apply-summary">Apply to my résumé</button></div>';
    }
    if (t.bulletSuggestions && t.bulletSuggestions.length) {
      body += '<div style="font-weight:700;font-size:13px;margin:6px 0 8px;">Bullet rewrites</div>';
      body += t.bulletSuggestions.map(function (b) {
        return '<div class="ap-diff">' + (b.before ? '<div class="ap-diff-before">' + esc(b.before) + '</div>' : '') + '<div class="ap-diff-after">' + esc(b.after) + '</div></div>';
      }).join('');
    }
    if (t.emphasize && t.emphasize.length) {
      body += '<div style="font-weight:700;font-size:13px;margin:14px 0 8px;">What to emphasize</div><ul class="ap-list">'
        + t.emphasize.map(function (e) { return '<li><span style="color:var(--accent);">→</span><span>' + esc(e) + '</span></li>'; }).join('') + '</ul>';
    }
    return '<div class="ap-card"><h2>Tailored résumé</h2><div class="ap-card-sub">Grounded only in your real experience — nothing invented.</div>' + body + '</div>';
  }

  function coverCard(text) {
    return '<div class="ap-card"><h2>Cover letter</h2>'
      + '<div class="ap-cover" id="ap-cover-text">' + esc(text) + '</div>'
      + '<div class="ap-actions"><button class="btn btn-secondary btn-sm" id="ap-copy-cover">Copy cover letter</button>'
      + '<a class="btn btn-ghost btn-sm" href="cover-letter">Refine in Cover Letter Maker</a></div></div>';
  }

  function saveCard(d) {
    return '<div class="ap-card"><h2>Next step</h2><div class="ap-card-sub">Track this application so Autopilot can remind you to follow up.</div>'
      + '<div class="ap-actions"><button class="btn btn-primary btn-sm" id="ap-save-job">Save to Job Tracker</button>'
      + '<a class="btn btn-ghost btn-sm" href="jobs">Open tracker</a></div></div>';
  }

  function renderUpgrade() {
    els.results.innerHTML = '<div class="ap-card ap-upgrade"><h3>Application Autopilot is a Premium feature</h3>'
      + '<p>Upgrade to run the full one-shot flow: fit verdict, tailored résumé, and a cover letter for every job.</p>'
      + '<a class="btn btn-primary" href="pricing">See plans</a></div>';
    els.results.classList.add('show');
  }

  // ---------- actions ----------
  function wireActions(d) {
    var applyBtn = document.getElementById('ap-apply-summary');
    if (applyBtn) applyBtn.addEventListener('click', function () {
      var r = readResume(); if (!r) return;
      var el = document.getElementById('ap-new-summary'); if (!el) return;
      r.personal = r.personal || {}; r.personal.summary = el.textContent; r.updatedAt = Date.now();
      try { localStorage.setItem('hf_resume', JSON.stringify(r)); } catch (e) { if (window.toast) toast('Could not save', { type: 'error' }); return; }
      applyBtn.textContent = '✓ Applied'; applyBtn.disabled = true;
      if (window.toast) toast('Summary applied to your résumé', { type: 'success' });
    });

    var copyBtn = document.getElementById('ap-copy-cover');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var el = document.getElementById('ap-cover-text'); if (!el) return;
      navigator.clipboard.writeText(el.textContent).then(function () {
        copyBtn.textContent = '✓ Copied'; setTimeout(function () { copyBtn.textContent = 'Copy cover letter'; }, 2000);
      }).catch(function () { if (window.toast) toast('Copy failed', { type: 'error' }); });
    });

    var saveBtn = document.getElementById('ap-save-job');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var role = (els.role.value || '').trim(), company = (els.company.value || '').trim();
      if (!role && !company) { if (window.toast) toast('Add a role and company above to save this job', { type: 'warn' }); return; }
      var jobs; try { jobs = JSON.parse(localStorage.getItem('hf_jobs') || '[]'); if (!Array.isArray(jobs)) jobs = []; } catch (e) { jobs = []; }
      var now = Date.now();
      jobs.unshift({ id: now, addedAt: now, statusAt: now, title: role || 'Role', company: company || 'Company', location: '', status: 'Saved',
        notes: 'Added by Autopilot' + (d.fit && typeof d.fit.score === 'number' ? ' · fit ' + d.fit.score + '/100' : '') });
      try { localStorage.setItem('hf_jobs', JSON.stringify(jobs)); } catch (e) { if (window.toast) toast('Could not save', { type: 'error' }); return; }
      saveBtn.textContent = '✓ Saved to tracker'; saveBtn.disabled = true;
      if (window.toast) toast('Saved to Job Tracker', { type: 'success' });
    });
  }

  // ---------- account center (self-contained, mirrors dashboard) ----------
  window.signOut = function () { ['hf_token', 'hf_email', 'hf_resume', 'hf_jobs', 'hf_ai_results', 'hf_welcome', 'hf_profile'].forEach(function (k) { localStorage.removeItem(k); }); location.href = '/'; };
  window.toggleAcctMenu = function (e) { if (e) e.stopPropagation(); var m = document.getElementById('acct-menu'); if (!m) return; if (m.hasAttribute('hidden')) { m.removeAttribute('hidden'); var t = document.getElementById('acct-trigger'); if (t) t.setAttribute('aria-expanded', 'true'); document.getElementById('acct-center').classList.add('open'); } else { closeAcctMenu(); } };
  window.closeAcctMenu = function () { var m = document.getElementById('acct-menu'); if (!m || m.hasAttribute('hidden')) return; m.setAttribute('hidden', ''); var t = document.getElementById('acct-trigger'); if (t) t.setAttribute('aria-expanded', 'false'); var c = document.getElementById('acct-center'); if (c) c.classList.remove('open'); };
  document.addEventListener('click', function (e) { var c = document.getElementById('acct-center'); if (c && !c.contains(e.target)) closeAcctMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAcctMenu(); });
  function hydrateAccount() {
    var email = (window.CURRENT_USER && CURRENT_USER.email) || localStorage.getItem('hf_email') || '';
    var initials = email ? email.trim().charAt(0).toUpperCase() : 'A';
    ['acct-avatar', 'acct-avatar-lg'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = initials; });
    var emEl = document.getElementById('acct-email'); if (emEl) emEl.textContent = email || 'Account';
    var admin = (typeof isAdmin === 'function' && isAdmin()), paid = (typeof isPaid === 'function' && isPaid());
    var plEl = document.getElementById('acct-plan-label'); if (plEl) plEl.textContent = admin ? 'Admin · full access' : (paid ? ((typeof planLabel === 'function' ? planLabel() : 'Premium') + ' plan') : 'Free plan');
    var mg = document.getElementById('acct-manage-sub'); if (mg) mg.style.display = (paid && !admin) ? '' : 'none';
    var pill = document.getElementById('plan-pill');
    if (pill) pill.innerHTML = admin ? '<span class="pill success">Admin</span>' : (paid ? '<span class="pill success">' + (typeof planLabel === 'function' ? planLabel() : 'Premium') + '</span>' : '<a class="btn btn-primary btn-xs" href="pricing">Upgrade</a>');
  }

  // ---------- boot ----------
  refreshResumeNote();
  hydrateAccount();
  if (typeof loadCurrentUser === 'function') { Promise.resolve(loadCurrentUser()).then(hydrateAccount).catch(function () {}); }
})();
