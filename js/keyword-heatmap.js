/* Keyword Heatmap — highlights matched ATS keywords on the resume preview
   and surfaces missing ones as a banner. Pure DOM, no dependencies.
   Usage:
     keywordHeatmap.apply(iframeDoc, matchedKeywords, missingKeywords)
     keywordHeatmap.clear(iframeDoc)
     keywordHeatmap.legend()  // returns HTML string                        */
(function () {
  'use strict';

  var STYLE_ID = 'kw-heat-style';
  var BANNER_ID = 'kw-heat-banner';
  var MARK_CLASS = 'kw-heat';
  var CSS =
    '.kw-heat{border-radius:2px;padding:0 1px;mix-blend-mode:multiply;}' +
    '.kw-matched{background:rgba(74,222,128,.28);box-shadow:0 0 0 1px rgba(74,222,128,.45);}' +
    '#' + BANNER_ID + '{position:sticky;top:0;z-index:90;background:#fef2f2;border-bottom:1px solid #fca5a5;padding:6px 10px;font:500 11px/1.4 -apple-system,BlinkMacSystemFont,Inter,"Segoe UI",sans-serif;color:#991b1b;display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;}' +
    '#' + BANNER_ID + ' b{font-weight:700;white-space:nowrap;}' +
    '.kw-miss-chip{display:inline-block;background:#fee2e2;color:#b91c1c;border:1px dashed #fca5a5;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;white-space:nowrap;}';

  function injectStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    var s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function removeStyle(doc) {
    var s = doc.getElementById(STYLE_ID);
    if (s) s.remove();
  }

  function escRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function buildPattern(keyword) {
    var esc = escRx(keyword);
    if (keyword.indexOf(' ') !== -1) return new RegExp('(' + esc + ')', 'gi');
    return new RegExp('(?<![a-zA-Z0-9])(' + esc + ')(?![a-zA-Z0-9])', 'gi');
  }

  function highlightTextNode(node, pattern) {
    var text = node.nodeValue;
    var match, parts = [], last = 0;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) parts.push({ text: text.slice(last, match.index), mark: false });
      parts.push({ text: match[1], mark: true });
      last = pattern.lastIndex;
    }
    if (!parts.length) return false;
    if (last < text.length) parts.push({ text: text.slice(last), mark: false });

    var frag = node.ownerDocument.createDocumentFragment();
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].mark) {
        var m = node.ownerDocument.createElement('mark');
        m.className = MARK_CLASS + ' kw-matched';
        m.textContent = parts[i].text;
        frag.appendChild(m);
      } else {
        frag.appendChild(node.ownerDocument.createTextNode(parts[i].text));
      }
    }
    node.parentNode.replaceChild(frag, node);
    return true;
  }

  function walkAndHighlight(doc, keywords) {
    if (!keywords || !keywords.length) return;
    var patterns = keywords.map(function (kw) { return buildPattern(kw); });
    var body = doc.body;
    if (!body) return;

    for (var p = 0; p < patterns.length; p++) {
      var walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          var par = n.parentNode;
          if (!par) return NodeFilter.FILTER_REJECT;
          var tag = par.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (var i = 0; i < nodes.length; i++) highlightTextNode(nodes[i], patterns[p]);
    }
  }

  function showMissingBanner(doc, missing) {
    var old = doc.getElementById(BANNER_ID);
    if (old) old.remove();
    if (!missing || !missing.length) return;
    var banner = doc.createElement('div');
    banner.id = BANNER_ID;
    banner.innerHTML = '<b>Missing from your resume:</b> ' +
      missing.map(function (k) {
        return '<span class="kw-miss-chip">' + k.replace(/[<>&"]/g, function (c) {
          return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
        }) + '</span>';
      }).join(' ');
    var body = doc.body;
    if (body && body.firstChild) body.insertBefore(banner, body.firstChild);
    else if (body) body.appendChild(banner);
  }

  function apply(doc, matched, missing) {
    if (!doc) return;
    clear(doc);
    injectStyle(doc);
    walkAndHighlight(doc, matched);
    showMissingBanner(doc, missing);
  }

  function clear(doc) {
    if (!doc || !doc.body) return;
    var marks = doc.querySelectorAll('mark.' + MARK_CLASS);
    for (var i = marks.length - 1; i >= 0; i--) {
      var mark = marks[i];
      var parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    }
    var banner = doc.getElementById(BANNER_ID);
    if (banner) banner.remove();
    removeStyle(doc);
  }

  function legend() {
    return '<div style="display:flex;align-items:center;gap:12px;font-size:12px;margin:8px 0;">' +
      '<span style="display:flex;align-items:center;gap:4px;">' +
        '<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:rgba(74,222,128,.28);box-shadow:0 0 0 1px rgba(74,222,128,.45);"></span>' +
        '<span>Matched</span></span>' +
      '<span style="display:flex;align-items:center;gap:4px;">' +
        '<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#fee2e2;border:1px dashed #fca5a5;"></span>' +
        '<span>Missing</span></span>' +
    '</div>';
  }

  window.keywordHeatmap = { apply: apply, clear: clear, legend: legend };
})();
