// Skeleton loader presets — call skeleton(preset, opts) to get HTML for the
// most common loading shapes across the app. Pair with css/skeleton.css.
//
// Presets:
//   'result'   — big-number result card (ATS score, salary median, etc.)
//   'analysis' — bulleted analysis / recommendation list
//   'chat'     — 1-3 chat message bubbles with avatars
//   'letter'   — a paragraph of body copy (cover letter, brag doc, 90-day plan)
//   'cards'    — a grid of N cards (jobs, matches, skill gaps)
//   'form'     — labeled input rows (autopilot, apply flow)
//   'chart'    — a bar/pie placeholder
//
// Usage:
//   container.innerHTML = skeleton('result');
//   container.innerHTML = skeleton('cards', { count: 6 });
(function () {
  function line(w) { return '<span class="sk sk-line sk-w' + (w || 100) + '"></span>'; }
  function lineLg(w) { return '<span class="sk sk-line-lg sk-w' + (w || 100) + '"></span>'; }
  function pill(w) { return '<span class="sk sk-pill" style="width:' + (w || 130) + 'px"></span>'; }

  var PRESETS = {
    // Result card: header row (title + status pill) → hero number → range bar →
    // section label → 3 bullets. Mirrors ATS score / salary / resume-analysis.
    result: function () {
      return '<div class="sk-wrap" role="status" aria-label="Loading result">'
        + '<div class="sk-row sk-between sk-row-top">'
        +   '<div class="sk-col">'
        +     lineLg(55) + line(38)
        +   '</div>'
        +   pill(120)
        + '</div>'
        + '<span class="sk sk-hero sk-w60"></span>'
        + line(46)
        + '<span class="sk sk-bar-h"></span>'
        + '<div class="sk-row" style="gap:40px;">'
        +   '<span class="sk sk-line" style="width:50px;"></span>'
        +   '<span class="sk sk-line" style="width:50px;"></span>'
        +   '<span class="sk sk-line" style="width:50px;"></span>'
        + '</div>'
        + line(40)
        + line(95) + line(85) + line(70)
        + line(40)
        + '<span class="sk sk-block sk-w100"></span>'
        + '</div>';
    },

    // Analysis: section heading + 5 bullets, repeated 2x.
    analysis: function () {
      var section = line(35)
        + line(95) + line(88) + line(72) + line(90) + line(60);
      return '<div class="sk-wrap" role="status" aria-label="Loading analysis">'
        + section + '<div style="height:8px"></div>' + section
        + '</div>';
    },

    // Chat: N message bubbles with avatars.
    chat: function (opts) {
      var n = (opts && opts.count) || 2;
      var msgs = '';
      for (var i = 0; i < n; i++) {
        var widths = i % 2 === 0 ? [90, 75, 60] : [80, 65];
        var lines = widths.map(function (w) { return line(w); }).join('');
        msgs += '<div class="sk-msg"><span class="sk sk-avatar"></span>'
          + '<div class="sk-bubble">' + lines + '</div></div>';
      }
      return '<div class="sk-wrap" role="status" aria-label="Loading messages">' + msgs + '</div>';
    },

    // Letter/prose: title + 3 paragraphs.
    letter: function () {
      var para = line(95) + line(90) + line(85) + line(70);
      return '<div class="sk-wrap" role="status" aria-label="Loading document">'
        + lineLg(50)
        + '<div style="height:6px"></div>'
        + para + '<div style="height:8px"></div>'
        + para + '<div style="height:8px"></div>'
        + para
        + '</div>';
    },

    // Grid of cards.
    cards: function (opts) {
      var n = (opts && opts.count) || 6;
      var cols = (opts && opts.cols) || 3;
      var wrap = '';
      for (var i = 0; i < n; i++) {
        wrap += '<div style="display:flex;flex-direction:column;gap:10px;">'
          + '<span class="sk sk-card"></span>'
          + line(80) + line(60)
          + '</div>';
      }
      return '<div class="sk-grid-' + cols + '" role="status" aria-label="Loading">' + wrap + '</div>';
    },

    // Form: N labeled input rows.
    form: function (opts) {
      var n = (opts && opts.count) || 4;
      var rows = '';
      for (var i = 0; i < n; i++) {
        rows += '<div class="sk-col" style="gap:6px;">'
          + line(25)
          + '<span class="sk sk-block-lg"></span>'
          + '</div>';
      }
      return '<div class="sk-wrap" role="status" aria-label="Loading form">' + rows + '</div>';
    },

    // Chart placeholder.
    chart: function () {
      return '<div class="sk-wrap" role="status" aria-label="Loading chart">'
        + lineLg(35)
        + '<span class="sk sk-block-lg sk-w100" style="height:220px;"></span>'
        + '<div class="sk-row" style="justify-content:center;gap:22px;">'
        +   pill(80) + pill(80) + pill(80)
        + '</div>'
        + '</div>';
    }
  };

  window.skeleton = function (name, opts) {
    var fn = PRESETS[name];
    return fn ? fn(opts || {}) : PRESETS.analysis();
  };
})();
