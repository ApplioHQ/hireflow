/* autopilot.js, Application Autopilot: one job description in, a full application
   packet out (fit verdict + tailored resume + cover letter + missing keywords).
   Calls the single /ai/autopilot endpoint, which orchestrates the tuned ATS, Tailor,
   and Cover Letter analyses server-side. Free and unlocked for everyone. */
(function () {
  'use strict';

  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';
  var TOKEN = localStorage.getItem('hf_token');
  var IS_ANON = !TOKEN; if (IS_ANON && window.initAnonTopbar) initAnonTopbar();

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
      els.resumeNote.innerHTML = ICON('alert','ico ico-sm') + ' <a href="editor">Build a resume</a> first';
      els.resumeNote.classList.remove('ap-rp-ok');
      return false;
    }
    var nm = resumeName(r);
    els.resumeNote.innerHTML = '<span class="ap-rp-ok">' + ICON('check','ico ico-sm') + '</span> Resume loaded' + (nm ? ' (' + esc(nm) + ')' : '') + ' <a href="editor">Edit</a>';
    return true;
  }

  // ---------- run ----------
  function setLoading(on) {
    els.run.disabled = on;
    els.loading.classList.toggle('show', on);
    if (on) { els.run.textContent = 'Running...'; }
    else if (typeof ICON === 'function') { els.run.innerHTML = ICON('sparkle') + ' <span>Run Autopilot</span>'; }
    else { els.run.textContent = 'Run Autopilot'; }
  }

  els.run.addEventListener('click', run);
  function run() {
    if (IS_ANON) { if (window.promptSignup) promptSignup('run Application Autopilot on your resume'); return; }
    var jd = (els.jd.value || '').trim();
    if (jd.length < 40) { if (window.toast) toast('Paste the full job description first', { type: 'warn' }); els.jd.focus(); return; }
    var resume = readResume();
    if (!resume || !Object.keys(resume).length) { refreshResumeNote(); if (window.toast) toast('Build your resume first', { type: 'warn' }); return; }

    setLoading(true);
    if (typeof skeleton === 'function') {
      els.results.innerHTML = '<div class="ap-scorecard">' + skeleton('card') + '</div><div class="ap-content">' + skeleton('letter') + '</div>';
      els.results.classList.add('show');
    } else {
      els.results.classList.remove('show');
    }
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

  // ---------- free taste (client-side fit check, zero AI) ----------
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
  function runFree(jd, resume) {
    if (!window.AtsEngine || typeof window.AtsEngine.score !== 'function') { renderUpgrade(); return; }
    var s = window.AtsEngine.score(resumeToText(resume), jd) || {};
    var score = typeof s.score === 'number' ? s.score : null;
    var verdict = score == null ? 'stretch' : score >= 75 ? 'apply' : score >= 55 ? 'stretch' : 'skip';
    var label = score == null ? 'Assessed' : score >= 75 ? 'Strong fit, apply' : score >= 55 ? 'Worth a shot, a few gaps to close' : 'Long shot, close the gaps first';
    var bd = s.breakdown || {};
    var packet = {
      fit: { score: score, verdict: verdict, label: label },
      ats: { score: score, breakdown: { keywords: bd.keywords, experience: bd.impact, formatting: bd.formatting, completeness: bd.completeness }, feedback: '', wins: [], issues: [] },
      tailor: null, matchedKeywords: s.matchedKeywords || [], missingKeywords: s.missingKeywords || [], coverLetter: null,
      failed: {}, _free: true
    };
    render(packet);
  }

  // ---------- render ----------
  var VC = { apply: '#22c55e', stretch: '#f59e0b', skip: '#ef4444' };
  function ringColor(v) { return VC[v] || 'var(--accent)'; }

  // ---------- ATS match: before -> projected-after ----------
  function _resumeToText(r) {
    if (!r || typeof r !== 'object') return '';
    var p = r.personal || {}, out = [];
    out.push([p.fullName, p.email, p.phone, p.location, p.linkedin, p.github, p.website].filter(Boolean).join(' '));
    if (p.summary) out.push('Summary\n' + p.summary);
    if ((r.experience || []).length) { out.push('Experience'); r.experience.forEach(function (e) { out.push([e.title, e.company, e.location].filter(Boolean).join(' ')); if (e.description) out.push(e.description); }); }
    if ((r.projects || []).length) { out.push('Projects'); r.projects.forEach(function (e) { out.push([e.name, e.tech].filter(Boolean).join(' ')); if (e.description) out.push(e.description); }); }
    if ((r.education || []).length) { out.push('Education'); r.education.forEach(function (e) { out.push([e.degree, e.field, e.school, e.description].filter(Boolean).join(' ')); }); }
    var cats = (r.skills && r.skills.categories) || [];
    if (cats.length) { out.push('Skills'); cats.forEach(function (c) { if ((c.items || []).length) out.push((c.label ? c.label + ': ' : '') + c.items.join(', ')); }); }
    return out.filter(Boolean).join('\n');
  }
  function _atsImprove(resume, d, jd) {
    if (!window.AtsEngine || !resume || !jd || jd.length < 20 || !d.tailor) return null;
    try {
      var after = structuredClone(resume);
      if (d.tailor.summary && d.tailor.summary.trim()) { after.personal = after.personal || {}; after.personal.summary = d.tailor.summary.trim(); }
      _applyTailoredBullets(after, d.tailor.bulletSuggestions || []);
      var b = AtsEngine.score(_resumeToText(resume), jd).score;
      var a = AtsEngine.score(_resumeToText(after), jd).score;
      if (typeof b !== 'number' || typeof a !== 'number') return null;
      return { before: b, after: Math.max(a, b) };
    } catch (e) { return null; }
  }

  function render(d) {
    var _imp = _atsImprove(readResume(), d, (els.jd.value || '').trim());
    var left = scorecardHTML(d, _imp);
    var right = contentHTML(d, _imp);
    els.results.innerHTML = '<div class="ap-scorecard">' + left + '</div><div class="ap-content">' + right + '</div>';
    els.results.classList.add('show');
    wireActions(d);
    // animate the ring
    var f = document.getElementById('ap-ring-fill');
    if (f && d.fit && typeof d.fit.score === 'number') {
      var C = 2 * Math.PI * 38;
      requestAnimationFrame(function () { f.style.strokeDashoffset = String(C * (1 - d.fit.score / 100)); });
    }
    var fails = d.failed || {};
    if (fails.ats || fails.tailor || fails.cover) {
      var miss = []; if (fails.ats) miss.push('fit score'); if (fails.tailor) miss.push('resume tailoring'); if (fails.cover) miss.push('cover letter');
      var note = document.createElement('div'); note.className = 'ap-fail';
      note.textContent = 'The ' + miss.join(' and ') + ' couldn\'t be generated this time, try running again.';
      els.results.querySelector('.ap-content').insertBefore(note, els.results.querySelector('.ap-content').firstChild);
    }
  }

  // ---------- left scorecard ----------
  function scorecardHTML(d, imp) {
    var parts = [];
    parts.push(verdictCard(d, imp));
    parts.push(keywordsCard(d));
    return parts.join('');
  }

  function verdictCard(d, imp) {
    var fit = d.fit || {}, ats = d.ats || {};
    var score = typeof fit.score === 'number' ? fit.score : null;
    var col = ringColor(fit.verdict);
    var C = 2 * Math.PI * 38;
    var ring = score == null ? '' :
      '<div class="ap-ring"><svg viewBox="0 0 100 100" width="72" height="72">'
      + '<circle cx="50" cy="50" r="38" fill="none" stroke="var(--border)" stroke-width="7"/>'
      + '<circle id="ap-ring-fill" cx="50" cy="50" r="38" fill="none" stroke="' + col + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" transform="rotate(-90 50 50)" style="transition:stroke-dashoffset .8s var(--ease-out,.4s)"/>'
      + '</svg><div class="ap-ring-num" style="color:' + col + ';">' + score + '</div></div>';
    var bars = '';
    if (ats.breakdown && typeof ats.breakdown === 'object') {
      bars = '<div class="ap-bars">' + [['keywords', 'Keyword match'], ['experience', 'Experience'], ['formatting', 'Formatting'], ['completeness', 'Completeness']].map(function (p) {
        var v = ats.breakdown[p[0]]; if (typeof v !== 'number') v = 0;
        var bc = v >= 75 ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444';
        return '<div><div class="ap-bar-row"><span class="label">' + p[1] + '</span><span class="value">' + v + '</span></div><div class="ap-bar-track"><div class="ap-bar-fill" style="width:' + Math.max(0, Math.min(100, v)) + '%;background:' + bc + ';"></div></div></div>';
      }).join('') + '</div>';
    }
    var deltaHTML = '';
    if (imp && typeof imp.before === 'number' && typeof imp.after === 'number') {
      var delta = imp.after - imp.before;
      deltaHTML = '<div class="ap-ats-delta">'
        + '<span class="ap-ats-num" style="color:var(--muted);">' + imp.before + '</span>'
        + '<span class="ap-ats-arrow">&rarr;</span>'
        + '<span class="ap-ats-num" style="color:#22c55e;">' + imp.after + '</span>'
        + (delta > 0 ? '<span class="ap-ats-badge">+' + delta + '</span>' : '')
        + '</div>';
    }
    return '<div class="ap-card"><h2>Fit verdict</h2>'
      + '<div class="ap-verdict">' + ring
      + '<div class="ap-verdict-text"><div class="ap-verdict-label" style="color:' + col + ';">' + esc(fit.label || 'Assessed') + '</div>'
      + (ats.feedback ? '<div class="ap-verdict-why">' + esc(ats.feedback) + '</div>' : '') + '</div></div>'
      + bars + deltaHTML + '</div>';
  }

  function keywordsCard(d) {
    var matched = (d.tailor && d.tailor.matchedKeywords) || d.matchedKeywords || [];
    var missing = d.missingKeywords || [];
    if (!matched.length && !missing.length) return '';
    var matchedHTML = '';
    if (matched.length) {
      matchedHTML = '<button class="ap-kw-matched" id="ap-kw-toggle" type="button">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
        + matched.length + ' matched keywords</button>'
        + '<div class="ap-kw-expanded" id="ap-kw-expanded">' + matched.map(function (k) { return '<span class="ap-chip ap-chip-ok">' + esc(k) + '</span>'; }).join('') + '</div>';
    }
    var missingHTML = missing.length
      ? '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Missing (' + missing.length + ')</div>'
        + '<div>' + missing.map(function (k) { return '<span class="ap-chip ap-chip-no">' + esc(k) + '</span>'; }).join('') + '</div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.4;">Add these where genuinely true for you.</div>'
      : '';
    return '<div class="ap-card"><h2>Keywords</h2>' + missingHTML + matchedHTML + '</div>';
  }

  // ---------- right content column ----------
  function contentHTML(d, imp) {
    var parts = [];
    // Apply-all bar
    var hasChanges = d.tailor && (d.tailor.summary || (d.tailor.bulletSuggestions && d.tailor.bulletSuggestions.length));
    if (hasChanges) {
      var bullets = (d.tailor.bulletSuggestions || []).filter(function (b) { return b && b.after; });
      var what = (d.tailor.summary && bullets.length) ? 'summary + ' + bullets.length + ' bullet' + (bullets.length === 1 ? '' : 's')
               : (d.tailor.summary ? 'summary' : bullets.length + ' bullet' + (bullets.length === 1 ? '' : 's'));
      parts.push('<div class="ap-apply-bar">'
        + '<div><div class="ap-ab-text">Apply changes to your resume</div><div class="ap-ab-sub">' + what + ' tailored for this job</div></div>'
        + '<button class="btn btn-primary btn-sm" id="ap-apply-tailor">' + (typeof ICON === 'function' ? ICON('check','ico ico-sm') : '') + ' Apply all</button>'
        + '<a class="btn btn-ghost btn-sm" href="editor">Open editor</a>'
        + '</div>');
    }
    if (d.tailor) parts.push(tailorCard(d.tailor));
    if (d.coverLetter) parts.push(coverCard(d.coverLetter));
    parts.push(saveCard(d));
    return parts.join('');
  }

  function tailorCard(t) {
    var body = '';
    if (t.summary) {
      body += '<div class="ap-sec-hd">' + (typeof ICON === 'function' ? ICON('file-text','ico ico-sm') : '') + ' Tailored summary</div>'
        + '<div class="ap-sec-sub">Rewritten to match the job\'s language</div>'
        + '<div class="ap-diff"><div class="ap-diff-label ap-diff-label-new">Tailored</div><div class="ap-diff-after" id="ap-new-summary">' + esc(t.summary) + '</div></div>';
    }
    var bullets = (t.bulletSuggestions || []).filter(function (b) { return b && b.after; });
    if (bullets.length) {
      body += '<div class="ap-sec-hd" style="margin-top:16px;">' + (typeof ICON === 'function' ? ICON('list','ico ico-sm') : '') + ' Bullet rewrites</div>'
        + '<div class="ap-sec-sub">Your original on the left, tailored on the right</div>';
      body += bullets.map(function (b) {
        return '<div class="ap-bullet-diff">'
          + (b.before ? '<div class="ap-bullet-side ap-bullet-old">' + esc(b.before) + '</div>' : '<div class="ap-bullet-side ap-bullet-old" style="color:var(--muted);font-style:italic;">New bullet</div>')
          + '<div class="ap-bullet-side ap-bullet-new">' + esc(b.after) + '</div></div>';
      }).join('');
    }
    if (t.emphasize && t.emphasize.length) {
      body += '<div style="margin-top:14px;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px;">What to emphasize</div><ul class="ap-list">'
        + t.emphasize.map(function (e) { return '<li><span class="arrow">&rarr;</span><span>' + esc(e) + '</span></li>'; }).join('') + '</ul>';
    }
    return '<div class="ap-card">' + body + '</div>';
  }

  function coverCard(text) {
    return '<div class="ap-card">'
      + '<div class="ap-sec-hd">' + (typeof ICON === 'function' ? ICON('mail','ico ico-sm') : '') + ' Cover letter</div>'
      + '<div class="ap-sec-sub">Grounded in your real experience</div>'
      + '<div class="ap-cover" id="ap-cover-text">' + esc(text) + '</div>'
      + '<div class="ap-actions"><button class="btn btn-secondary btn-sm" id="ap-copy-cover">' + (typeof ICON === 'function' ? ICON('copy','ico ico-sm') : '') + ' Copy</button>'
      + '<a class="btn btn-ghost btn-sm" href="cover-letter">Refine in Cover Letter Maker</a></div></div>';
  }

  function saveCard(d) {
    return '<div class="ap-card"><div class="ap-next">'
      + '<div class="ap-next-icon">' + (typeof ICON === 'function' ? ICON('briefcase') : '') + '</div>'
      + '<div class="ap-next-text"><div class="ap-next-title">Save to Job Tracker</div><div class="ap-next-sub">Track this application and get follow-up reminders</div></div>'
      + '<button class="btn btn-primary btn-sm" id="ap-save-job">' + (typeof ICON === 'function' ? ICON('plus','ico ico-sm') : '') + ' Save</button>'
      + '</div></div>';
  }

  function renderUpgrade() {
    els.results.innerHTML = '<div class="ap-card"><h3>Couldn\'t run Autopilot</h3>'
      + '<p>Something went wrong running the full packet. Please try again in a moment.</p></div>';
    els.results.classList.add('show');
  }

  // ---------- apply tailored content to the saved resume ----------
  function _normLine(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/^\s*[•\-\*•▪›→◦●·]\s*/, '')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function _toks(s) { return _normLine(s).split(' ').filter(function (w) { return w.length > 2; }); }
  function _jaccard(a, b) {
    var ta = _toks(a), tb = _toks(b); if (!ta.length || !tb.length) return 0;
    var sa = {}; ta.forEach(function (w) { sa[w] = 1; });
    var sb = {}, inter = 0; tb.forEach(function (w) { if (!sb[w]) { sb[w] = 1; if (sa[w]) inter++; } });
    var uni = Object.keys(sa).length + Object.keys(sb).length - inter;
    return uni ? inter / uni : 0;
  }
  function _applyTailoredBullets(resume, suggestions) {
    if (!resume || !Array.isArray(resume.experience) || !Array.isArray(suggestions)) return 0;
    var used = {}, applied = 0;
    suggestions.forEach(function (sug) {
      if (!sug || !sug.after) return;
      var probe = (sug.before && sug.before.trim()) ? sug.before : sug.after;
      var best = null, bestScore = 0;
      resume.experience.forEach(function (exp, ei) {
        String(exp.description || '').split('\n').forEach(function (line, li) {
          var key = ei + ':' + li;
          if (used[key] || !line.trim()) return;
          var sc = _jaccard(probe, line);
          if (sc > bestScore) { bestScore = sc; best = { ei: ei, li: li, key: key }; }
        });
      });
      if (best && bestScore >= 0.45) {
        var exp = resume.experience[best.ei];
        var lines = String(exp.description || '').split('\n');
        var marker = (lines[best.li].match(/^\s*[•\-\*•▪›→◦●·]\s*/) || [''])[0];
        lines[best.li] = marker + sug.after;
        exp.description = lines.join('\n');
        used[best.key] = true; applied++;
      }
    });
    return applied;
  }

  // ---------- actions ----------
  function wireActions(d) {
    // Keywords toggle
    var kwToggle = document.getElementById('ap-kw-toggle');
    if (kwToggle) kwToggle.addEventListener('click', function () {
      var exp = document.getElementById('ap-kw-expanded');
      if (exp) { exp.classList.toggle('show'); this.classList.toggle('open'); }
    });

    var applyBtn = document.getElementById('ap-apply-tailor');
    if (applyBtn) applyBtn.addEventListener('click', function () {
      var r = readResume(); if (!r) return;
      var changed = [];
      var el = document.getElementById('ap-new-summary');
      if (el && el.textContent.trim()) { r.personal = r.personal || {}; r.personal.summary = el.textContent.trim(); changed.push('summary'); }
      var sug = (d.tailor && d.tailor.bulletSuggestions) || [];
      var n = _applyTailoredBullets(r, sug);
      if (n) changed.push(n + ' bullet' + (n === 1 ? '' : 's'));
      if (!changed.length) { if (window.toast) toast('Nothing matched to apply, edit in the editor instead.', { type: 'warn' }); return; }
      r.updatedAt = Date.now();
      try { localStorage.setItem('hf_resume', JSON.stringify(r)); } catch (e) { if (window.toast) toast('Could not save', { type: 'error' }); return; }
      applyBtn.textContent = 'Applied'; applyBtn.disabled = true;
      var unmatched = sug.length - n;
      var msg = 'Applied ' + changed.join(' + ') + '.' + (unmatched > 0 ? ' ' + unmatched + ' rewrite' + (unmatched === 1 ? '' : 's') + " didn't auto-match, add " + (unmatched === 1 ? 'it' : 'them') + ' in the editor.' : ' Open the editor to export.');
      if (window.toast) toast(msg, { type: unmatched > 0 ? 'warn' : 'success' });
    });

    var copyBtn = document.getElementById('ap-copy-cover');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var el = document.getElementById('ap-cover-text'); if (!el) return;
      navigator.clipboard.writeText(el.textContent).then(function () {
        copyBtn.textContent = 'Copied'; setTimeout(function () { copyBtn.innerHTML = (typeof ICON === 'function' ? ICON('copy','ico ico-sm') : '') + ' Copy'; }, 2000);
      }).catch(function () { if (window.toast) toast('Copy failed', { type: 'error' }); });
    });

    var saveBtn = document.getElementById('ap-save-job');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var role = (els.role.value || '').trim(), company = (els.company.value || '').trim();
      if (!role && !company) { if (window.toast) toast('Add a role and company above to save this job', { type: 'warn' }); return; }
      var jobs; try { jobs = JSON.parse(localStorage.getItem('hf_jobs') || '[]'); if (!Array.isArray(jobs)) jobs = []; } catch (e) { jobs = []; }
      var now = Date.now();
      jobs.unshift({ id: now, addedAt: now, statusAt: now, title: role || 'Role', company: company || 'Company', location: '', status: 'Saved',
        jd: (els.jd.value || '').trim().slice(0, 8000),
        notes: 'Added by Autopilot' + (d.fit && typeof d.fit.score === 'number' ? ' - fit ' + d.fit.score + '/100' : '') });
      try { localStorage.setItem('hf_jobs', JSON.stringify(jobs)); if (window.HFJobsSync) HFJobsSync.push(); } catch (e) { if (window.toast) toast('Could not save', { type: 'error' }); return; }
      saveBtn.textContent = 'Saved'; saveBtn.disabled = true;
      if (window.toast) toast('Saved to Job Tracker', { type: 'success' });
    });
  }

  // ---------- account center ----------
  window.signOut = function () { ['hf_token', 'hf_email', 'hf_resume', 'hf_jobs', 'hf_jobs_ts', 'hf_ai_results', 'hf_welcome', 'hf_profile'].forEach(function (k) { localStorage.removeItem(k); }); location.href = '/'; };
  window.toggleAcctMenu = function (e) { if (e) e.stopPropagation(); var m = document.getElementById('acct-menu'); if (!m) return; if (m.hasAttribute('hidden')) { m.removeAttribute('hidden'); var t = document.getElementById('acct-trigger'); if (t) t.setAttribute('aria-expanded', 'true'); document.getElementById('acct-center').classList.add('open'); } else { closeAcctMenu(); } };
  window.closeAcctMenu = function () { var m = document.getElementById('acct-menu'); if (!m || m.hasAttribute('hidden')) return; m.setAttribute('hidden', ''); var t = document.getElementById('acct-trigger'); if (t) t.setAttribute('aria-expanded', 'false'); var c = document.getElementById('acct-center'); if (c) c.classList.remove('open'); };
  document.addEventListener('click', function (e) { var c = document.getElementById('acct-center'); if (c && !c.contains(e.target)) closeAcctMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAcctMenu(); });
  function hydrateAccount() {
    var email = (window.CURRENT_USER && CURRENT_USER.email) || localStorage.getItem('hf_email') || '';
    var initials = email ? email.trim().charAt(0).toUpperCase() : 'A';
    ['acct-avatar', 'acct-avatar-lg'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = initials; });
    var emEl = document.getElementById('acct-email'); if (emEl) emEl.textContent = email || 'Account';
    var admin = (typeof isAdmin === 'function' && isAdmin());
    var plEl = document.getElementById('acct-plan-label'); if (plEl) plEl.textContent = admin ? 'Admin - full access' : 'Everything free';
    var mg = document.getElementById('acct-manage-sub'); if (mg) mg.style.display = 'none';
    var pill = document.getElementById('plan-pill');
    if (pill) pill.innerHTML = admin ? '<span class="pill success">Admin</span>' : '';
  }

  // ---------- boot ----------
  refreshResumeNote();
  hydrateAccount();
  if (typeof loadCurrentUser === 'function') { Promise.resolve(loadCurrentUser()).then(hydrateAccount).catch(function () {}); }
})();
