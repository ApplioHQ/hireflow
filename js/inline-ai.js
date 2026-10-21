/* Applio Studio — inline bullet AI (mockup 1).
   Click any experience/project bullet in the live preview to get a floating
   AI toolbar (Improve / Quantify / Shorten / Rewrite) anchored to it. Actions
   call window.aiImproveBullet(section, entryIdx, lineIdx, mode) in editor.js,
   which rewrites just that one line. Tagging is re-run on every preview render
   via the hook in _bindPreviewClicks. */
(function () {
  'use strict';

  var MODES = [
    { k: 'improve', label: 'Improve', primary: true },
    { k: 'quantify', label: 'Quantify' },
    { k: 'shorten', label: 'Shorten' },
    { k: 'rewrite', label: 'Rewrite' }
  ];
  var bar = null;      // the toolbar element (in the PARENT document)
  var activeLi = null; // the currently highlighted bullet

  function injectDocStyle(doc) {
    if (doc.getElementById('ai-bullet-style')) return;
    var s = doc.createElement('style');
    s.id = 'ai-bullet-style';
    s.textContent =
      '.ai-bullet{cursor:pointer;border-radius:4px;transition:background .14s ease;}' +
      '.ai-bullet:hover{background:rgba(109,77,252,.09);}' +
      '.ai-bullet-active{background:rgba(109,77,252,.12);box-shadow:0 0 0 1px rgba(109,77,252,.35);}';
    doc.head && doc.head.appendChild(s);
  }

  // Map the data model (DOM order of .t-entry = array order) to each <li>.
  function tag(doc) {
    if (!doc || !doc.body) return;
    injectDocStyle(doc);
    ['experience', 'projects'].forEach(function (sec) {
      var entries = Array.prototype.filter.call(
        doc.querySelectorAll('.t-entry'),
        function (el) { return el.getAttribute('data-hf-sec') === sec; }
      );
      entries.forEach(function (entry, ei) {
        var lis = entry.querySelectorAll('.t-bullets > li');
        Array.prototype.forEach.call(lis, function (li, li_i) {
          li.setAttribute('data-ai-sec', sec);
          li.setAttribute('data-ai-entry', ei);
          li.setAttribute('data-ai-line', li_i);
          li.classList.add('ai-bullet');
          if (!li._aiBound) {
            li._aiBound = true;
            li.addEventListener('click', function (e) { e.stopPropagation(); openBar(li); });
          }
        });
      });
    });
  }

  function clearActive() {
    if (activeLi) { activeLi.classList.remove('ai-bullet-active'); activeLi = null; }
    if (bar) { bar.remove(); bar = null; }
  }

  function openBar(li) {
    clearActive();
    activeLi = li;
    li.classList.add('ai-bullet-active');

    var sec = li.getAttribute('data-ai-sec');
    var entry = +li.getAttribute('data-ai-entry');
    var line = +li.getAttribute('data-ai-line');

    // Position over the bullet, mapping iframe coords → parent via the frame rect/scale.
    var win = li.ownerDocument.defaultView;
    var ifr = win && win.frameElement;
    if (!ifr) return;
    var ir = ifr.getBoundingClientRect();
    var scale = ir.width / (ifr.offsetWidth || ir.width) || 1;
    var r = li.getBoundingClientRect();
    var x = ir.left + r.left * scale;
    var y = ir.top + r.bottom * scale + 6;

    bar = document.createElement('div');
    bar.className = 'ai-bar';
    bar.innerHTML = MODES.map(function (m) {
      return '<button class="ai-bar-btn' + (m.primary ? ' ai-bar-primary' : '') + '" data-mode="' + m.k + '">' +
        (m.primary ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z"/></svg>' : '') +
        m.label + '</button>';
    }).join('');
    document.body.appendChild(bar);

    // Clamp within the viewport.
    var bw = bar.offsetWidth;
    if (x + bw > window.innerWidth - 10) x = Math.max(10, window.innerWidth - bw - 10);
    bar.style.left = Math.max(10, x) + 'px';
    bar.style.top = y + 'px';

    bar.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var mode = b.getAttribute('data-mode');
        clearActive();
        if (typeof window.aiImproveBullet === 'function') window.aiImproveBullet(sec, entry, line, mode);
      });
    });
  }

  // Dismiss on outside click / scroll / resize.
  document.addEventListener('mousedown', function (e) {
    if (bar && !bar.contains(e.target)) clearActive();
  }, true);
  window.addEventListener('scroll', clearActive, true);
  window.addEventListener('resize', clearActive);

  window.inlineAI = { tag: tag, clear: clearActive };
})();
