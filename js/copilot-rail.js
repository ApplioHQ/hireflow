/* Applio Studio — Copilot rail (Phase 1).
   Adds an ambient score ring, actionable fix chips, and a single "next best
   action" card to the top of the editor's right panel. Reads only data that
   already exists in memory (window.calculateHealthScore); makes no network
   calls. Re-renders whenever the editor refreshes the health badge. */
(function () {
  'use strict';

  function goSection(name) {
    var el = document.querySelector('.sidebar-item[data-section="' + name + '"]');
    if (el) el.click();
  }

  function scoreColor(s) {
    return s >= 75 ? 'var(--success)' : s >= 50 ? 'var(--warning)' : 'var(--danger)';
  }

  // Turn the health breakdown into concrete, clickable fixes (highest impact first).
  function deriveFixes(d) {
    var fixes = [];
    if (d.completeness < 100) {
      fixes.push({ icon: 'user', label: 'Finish your core sections', section: 'dashboard' });
    }
    if (d.bulletQuality === null) {
      fixes.push({ icon: 'briefcase', label: 'Add experience bullets', section: 'experience' });
    } else if (d.bulletQuality < 70) {
      fixes.push({ icon: 'bolt', label: 'Add metrics to your bullets', section: 'analysis' });
    }
    if (d.ats === null) {
      fixes.push({ icon: 'check', label: 'Run an ATS check', section: 'ats' });
    } else if (d.ats < 75) {
      fixes.push({ icon: 'target', label: 'Raise your ATS match', section: 'tailor' });
    }
    return fixes;
  }

  // The one highest-value action, shown as the Copilot card's primary button.
  function nextBestAction(d) {
    if (d.ats === null) return { label: 'Run an ATS check', section: 'ats' };
    if (d.bulletQuality !== null && d.bulletQuality < 70) return { label: 'Improve my bullets', section: 'analysis' };
    if (d.completeness < 100) return { label: 'Complete my resume', section: 'dashboard' };
    if (d.ats < 80) return { label: 'Tailor to a job', section: 'tailor' };
    return { label: 'Polish with AI', section: 'analysis' };
  }

  function ic(name) {
    // Reuse the editor's icon set if present; fall back to a dot.
    var set = (typeof ICONS !== 'undefined' && ICONS) ? ICONS : (window.ICONS || null);
    if (set && set[name]) return set[name];
    return '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;"></span>';
  }

  function ring(score) {
    var c = scoreColor(score), r = 24, circ = 2 * Math.PI * r;
    var off = circ * (1 - score / 100);
    return '<svg width="58" height="58" viewBox="0 0 58 58" style="display:block;flex:0 0 auto;">' +
      '<circle cx="29" cy="29" r="' + r + '" fill="none" stroke="var(--bg-1)" stroke-width="5"/>' +
      '<circle cx="29" cy="29" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="5" stroke-linecap="round"' +
      ' stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"' +
      ' transform="rotate(-90 29 29)" style="transition:stroke-dashoffset .5s ease;"/>' +
      '<text x="29" y="29" text-anchor="middle" dominant-baseline="central" font-size="17" font-weight="800" fill="var(--text)">' + score + '</text>' +
      '</svg>';
  }

  function runAction(a) {
    if (!a) return;
    if (a.qf != null && typeof qfAction === 'function') { qfAction(a.qf); return; }
    if (a.section) { goSection(a.section); return; }
    if (a.href) { location.href = a.href; return; }
  }

  function render() {
    var host = document.getElementById('copilot-rail');
    if (!host) return;

    var score, sub, chips, nba, body;

    // Prefer the editor's own health (same score + real issues as the panel we
    // replace); fall back to the cross-page completeness score elsewhere.
    if (typeof window._resumeHealth === 'function') {
      var h = window._resumeHealth();
      var issues = h.issues || [];
      score = h.score;
      sub = issues.length
        ? issues.length + ' fix' + (issues.length > 1 ? 'es' : '') + ' to raise it'
        : 'Every check passes. Ready to export';
      chips = issues.slice(0, 3).map(function (iss, i) {
        var lvl = iss.level === 'warn' ? 'warn' : 'info';
        return '<button class="cr-chip" data-qf="' + i + '">' +
          '<span class="cr-chip-ic cr-' + lvl + '">' + ic('check') + '</span>' +
          '<span>' + iss.title + '</span>' +
          '<span class="cr-chip-arrow">' + ic('arrowRight') + '</span></button>';
      }).join('');
      body = issues.length ? 'Next: ' + issues[0].title : 'Your resume looks strong. Export it or tailor it to a job.';
      nba = issues.length ? { qf: 0, label: 'Fix it' } : { section: 'tailor', label: 'Tailor to a job' };
    } else if (typeof window.calculateHealthScore === 'function') {
      var d = window.calculateHealthScore();
      var fixes = deriveFixes(d);
      score = d.score;
      sub = fixes.length ? fixes.length + ' quick fix' + (fixes.length > 1 ? 'es' : '') + ' left' : 'Looking strong';
      chips = fixes.slice(0, 3).map(function (f) {
        return '<button class="cr-chip" data-go="' + f.section + '">' +
          '<span class="cr-chip-ic cr-warn">' + ic(f.icon) + '</span>' +
          '<span>' + f.label + '</span>' +
          '<span class="cr-chip-arrow">' + ic('arrowRight') + '</span></button>';
      }).join('');
      body = 'Your best next move to get more callbacks.';
      nba = nextBestAction(d);
    } else { return; }

    host.innerHTML =
      '<div class="cr-card">' +
        '<div class="cr-score">' + ring(score) +
          '<div><div class="cr-score-t">Resume score</div><div class="cr-score-s">' + sub + '</div></div>' +
        '</div>' +
        (chips ? '<div class="cr-chips">' + chips + '</div>' : '') +
        '<div class="cr-copilot">' +
          '<div class="cr-copilot-head">' + ic('sparkle') + '<span>Copilot</span></div>' +
          '<div class="cr-copilot-body">' + body + '</div>' +
          '<button class="cr-copilot-go" data-nba="1">' + nba.label + '</button>' +
        '</div>' +
      '</div>';

    host.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { goSection(b.getAttribute('data-go')); });
    });
    host.querySelectorAll('[data-qf]').forEach(function (b) {
      b.addEventListener('click', function () { if (typeof qfAction === 'function') qfAction(+b.getAttribute('data-qf')); });
    });
    var go = host.querySelector('[data-nba]');
    if (go) go.addEventListener('click', function () { runAction(nba); });
  }
  window.renderCopilotRail = render;

  // The score + fixes now live in the topbar health-badge popover, so the editor's
  // right panel no longer carries a score card. Just keep the old inline health
  // panel hidden (the topbar badge is the single source of the score).
  function mount() {
    var old = document.getElementById('resume-health');
    if (old) old.style.display = 'none';
  }

  // Keep the rail in sync: the editor calls renderHealthBadge() after every
  // edit, so piggyback on it.
  function hook() {
    if (typeof window.renderHealthBadge === 'function' && !window.renderHealthBadge.__crHooked) {
      var orig = window.renderHealthBadge;
      var wrapped = function () { var out = orig.apply(this, arguments); render(); return out; };
      wrapped.__crHooked = true;
      window.renderHealthBadge = wrapped;
    }
  }

  function init() { mount(); hook(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
