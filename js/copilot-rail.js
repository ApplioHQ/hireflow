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

  function render() {
    var host = document.getElementById('copilot-rail');
    if (!host || typeof window.calculateHealthScore !== 'function') return;
    var d = window.calculateHealthScore();
    var fixes = deriveFixes(d);
    var nba = nextBestAction(d);

    var sub = fixes.length
      ? fixes.length + ' quick fix' + (fixes.length > 1 ? 'es' : '') + ' left'
      : 'Looking strong — ready to export';

    var chips = fixes.slice(0, 3).map(function (f) {
      return '<button class="cr-chip" data-go="' + f.section + '">' +
        '<span class="cr-chip-ic">' + ic(f.icon) + '</span>' +
        '<span>' + f.label + '</span>' +
        '<span class="cr-chip-arrow">' + ic('arrowRight') + '</span>' +
        '</button>';
    }).join('');

    host.innerHTML =
      '<div class="cr-card">' +
        '<div class="cr-score">' + ring(d.score) +
          '<div><div class="cr-score-t">Resume score</div><div class="cr-score-s">' + sub + '</div></div>' +
        '</div>' +
        (chips ? '<div class="cr-chips">' + chips + '</div>' : '') +
        '<div class="cr-copilot">' +
          '<div class="cr-copilot-head">' + ic('sparkle') + '<span>Copilot</span></div>' +
          '<div class="cr-copilot-body">Your best next move to get more callbacks.</div>' +
          '<button class="cr-copilot-go" data-go="' + nba.section + '">' + nba.label + '</button>' +
        '</div>' +
      '</div>';

    host.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { goSection(b.getAttribute('data-go')); });
    });
  }
  window.renderCopilotRail = render;

  // Mount the host as the first child of the right panel, then render.
  function mount() {
    var rp = document.querySelector('.right-panel');
    if (!rp || document.getElementById('copilot-rail')) return;
    var host = document.createElement('div');
    host.id = 'copilot-rail';
    rp.insertBefore(host, rp.firstChild);
    render();
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
