// ============ Resume Health Score Badge ============
// Self-contained: works on editor.html (where `resume`, countFilled() and
// _scoreBullet() exist) AND on jobs/interview (reads localStorage only).
// NEVER makes network requests — it only reads already-cached/local data.
(function () {
  function _resume() {
    if (typeof resume !== 'undefined' && resume) return resume;
    try { return JSON.parse(localStorage.getItem('hf_resume') || '{}'); } catch { return {}; }
  }
  function _cachedAts() {
    // In-memory cache (editor) first, then the localStorage mirror.
    if (typeof AI_RESULTS !== 'undefined' && AI_RESULTS && AI_RESULTS.ats && typeof AI_RESULTS.ats.score === 'number') {
      return AI_RESULTS.ats.score;
    }
    try {
      const c = JSON.parse(localStorage.getItem('hf_ai_results') || 'null');
      if (c && c.ats && typeof c.ats.score === 'number') return c.ats.score;
    } catch {}
    return null;
  }
  function _completeness(r) {
    if (typeof countFilled === 'function') { try { return countFilled().score; } catch {} }
    const p = r.personal || {};
    let done = 0;
    if (p.fullName && p.email) done++;
    if ((r.experience || []).length) done++;
    if ((r.education || []).length) done++;
    if (((r.skills && r.skills.categories) || []).some(c => (c.items || []).length)) done++;
    if ((r.projects || []).length) done++;
    return done / 5;
  }
  function _bulletScore(text) {
    if (typeof _scoreBullet === 'function') { try { return _scoreBullet(text); } catch {} }
    // Fallback heuristic mirroring _scoreBullet's shape.
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return 0;
    let sum = 0;
    lines.forEach(l => {
      let v = 0;
      if (/\b(led|built|shipped|drove|designed|reduced|grew|managed|created|launched|improved|architected)\b/i.test(l)) v += 30;
      if (/\d/.test(l)) v += 35;
      if (l.length >= 40) v += 20; else if (l.length >= 20) v += 10;
      sum += Math.min(100, v + 15);
    });
    return sum / lines.length;
  }
  function _bulletQuality(r) {
    const texts = [];
    (r.experience || []).forEach(e => { if (e && e.description) texts.push(e.description); });
    (r.projects || []).forEach(p => { if (p && p.description) texts.push(p.description); });
    if (!texts.length) return null;
    const scores = texts.map(_bulletScore);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  function calculateHealthScore() {
    const r = _resume();
    const completeness = _completeness(r) * 100;      // 0-100
    const bq = _bulletQuality(r);                       // 0-100 or null
    const ats = _cachedAts();                           // 0-100 or null
    let wC = 0.4, wB = 0.3, wA = 0.3;
    if (bq === null)  { wC += wB; wB = 0; }
    if (ats === null) { wC += wA; wA = 0; }
    const score = completeness * wC + (bq || 0) * wB + (ats || 0) * wA;
    return {
      score: Math.round(score),
      completeness: Math.round(completeness),
      bulletQuality: bq === null ? null : Math.round(bq),
      ats: ats === null ? null : Math.round(ats),
    };
  }
  window.calculateHealthScore = calculateHealthScore;

  function _color(s) { return s >= 75 ? 'var(--success)' : s >= 50 ? 'var(--warning)' : 'var(--danger)'; }
  function _miniBar(label, val, note) {
    const has = val !== null;
    const c = has ? _color(val) : 'var(--muted)';
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <span style="color:var(--text);">${label}</span>
        <span style="color:${c};font-weight:700;">${has ? val : 'N/A'}</span>
      </div>
      <div style="height:5px;background:var(--bg-1);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${has ? val : 0}%;background:${c};border-radius:3px;transition:width .4s;"></div>
      </div>
      ${note ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">${note}</div>` : ''}
    </div>`;
  }

  function _closePopover() {
    const p = document.getElementById('health-popover');
    if (p) p.remove();
    document.removeEventListener('click', _outside, true);
  }
  function _outside(e) {
    const p = document.getElementById('health-popover');
    const b = document.getElementById('health-badge');
    if (p && !p.contains(e.target) && b && !b.contains(e.target)) _closePopover();
  }
  function _togglePopover() {
    if (document.getElementById('health-popover')) { _closePopover(); return; }
    const d = calculateHealthScore();
    const badge = document.getElementById('health-badge');
    if (!badge) return;
    const pop = document.createElement('div');
    pop.id = 'health-popover';
    pop.style.cssText = 'position:absolute;top:calc(100% + 8px);right:0;z-index:300;width:250px;background:var(--bg-2);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.4);padding:14px;';
    pop.innerHTML =
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:22px;font-weight:800;color:${_color(d.score)};line-height:1;">${d.score}</span>
        <span style="font-size:12px;color:var(--muted);">Resume Health</span>
      </div>` +
      _miniBar('Completeness', d.completeness) +
      _miniBar('Bullet Quality', d.bulletQuality, d.bulletQuality === null ? 'Add experience bullets to score this' : '') +
      _miniBar('ATS Match', d.ats, d.ats === null ? 'Not checked yet — run a check' : '') +
      `<a href="editor.html#dashboard" style="display:block;text-align:center;margin-top:8px;font-size:12px;font-weight:600;color:var(--accent);text-decoration:none;">View Dashboard →</a>`;
    badge.appendChild(pop);
    setTimeout(() => document.addEventListener('click', _outside, true), 0);
  }

  function renderHealthBadge() {
    const slot = document.getElementById('health-badge');
    if (!slot) return;
    const d = calculateHealthScore();
    const c = _color(d.score);
    const r = 12, circ = 2 * Math.PI * r;
    const off = circ * (1 - d.score / 100);
    const wasOpen = !!document.getElementById('health-popover');
    slot.style.cssText = 'position:relative;display:inline-flex;align-items:center;cursor:pointer;';
    slot.title = 'Resume Health: ' + d.score + '/100';
    slot.innerHTML =
      `<svg width="28" height="28" viewBox="0 0 28 28" style="display:block;">
        <circle cx="14" cy="14" r="${r}" fill="none" stroke="var(--bg-1)" stroke-width="3"/>
        <circle cx="14" cy="14" r="${r}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"
          stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
          transform="rotate(-90 14 14)" style="transition:stroke-dashoffset .5s ease;"/>
        <text x="14" y="14" text-anchor="middle" dominant-baseline="central"
          font-size="9" font-weight="700" fill="var(--text)">${d.score}</text>
      </svg>`;
    slot.onclick = (e) => { e.stopPropagation(); _togglePopover(); };
    if (wasOpen) { _closePopover(); _togglePopover(); }
  }
  window.renderHealthBadge = renderHealthBadge;

  // Auto-render on pages that include the slot (jobs/interview rely on this).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHealthBadge);
  } else {
    renderHealthBadge();
  }
})();
