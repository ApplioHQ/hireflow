/* Applio Studio -- Command palette.
   Cmd/Ctrl+K opens a searchable list of every editor action: jump to any
   section, run an AI tool, export, save, import, full preview, version
   history, toggle theme. Commands are built live from the DOM, so custom
   sections and whatever the editor currently exposes are always included.
   Self-contained; no network calls. */
(function () {
  'use strict';

  var STYLE = [
    '.cmdk-backdrop{position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:12vh 16px 16px;opacity:0;transition:opacity .18s ease;}',
    '.cmdk-backdrop.in{opacity:1;}',
    '.cmdk{width:100%;max-width:480px;background:var(--bg-1);border:1px solid var(--border);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:hidden;font-family:inherit;transform:translateY(8px) scale(.98);transition:transform .2s cubic-bezier(.2,.8,.2,1);}',
    '.cmdk-backdrop.in .cmdk{transform:none;}',
    '.cmdk-search{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid var(--border);}',
    '.cmdk-search svg{width:16px;height:16px;color:var(--muted);flex:0 0 auto;}',
    '.cmdk-search input{flex:1;min-width:0;background:transparent!important;border:0!important;outline:none!important;box-shadow:none!important;color:var(--text);font-size:14px;padding:0!important;margin:0;height:auto;line-height:1.4;}',
    '.cmdk-esc{color:var(--muted);font-size:11px;border:1px solid var(--border);border-radius:5px;padding:2px 7px;flex-shrink:0;}',
    '.cmdk-list{max-height:48vh;overflow:auto;padding:7px;scroll-behavior:smooth;}',
    '.cmdk-group{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:8px 9px 5px;}',
    '.cmdk-item{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:8px;cursor:pointer;color:var(--text);transition:background .08s;}',
    '.cmdk-item .cmdk-ic{width:16px;height:16px;color:var(--muted);flex:0 0 auto;display:inline-flex;}',
    '.cmdk-item .cmdk-ic svg{width:16px;height:16px;}',
    '.cmdk-item .cmdk-label{flex:1;font-size:12.5px;}',
    '.cmdk-item .cmdk-label mark{background:transparent;color:var(--accent);font-weight:700;}',
    '.cmdk-item .cmdk-hint{color:var(--muted);font-size:11px;display:inline-flex;align-items:center;gap:3px;}',
    '.cmdk-kbd{font-size:10px;font-family:inherit;padding:1px 5px;border:1px solid var(--border);border-radius:4px;background:var(--bg-2);color:var(--muted);line-height:1.4;}',
    '.cmdk-item.sel{background:var(--bg-2);}',
    '.cmdk-item.sel .cmdk-ic,.cmdk-item.sel .cmdk-label{color:var(--accent);}',
    '.cmdk-empty{padding:18px;text-align:center;color:var(--muted);font-size:12.5px;}',
    '.cmdk-foot{display:flex;align-items:center;gap:12px;padding:8px 14px;border-top:1px solid var(--border);font-size:11px;color:var(--muted);}',
    '.cmdk-foot span{display:inline-flex;align-items:center;gap:4px;}',
    '.cmdk-trigger{display:inline-flex;align-items:center;gap:7px;background:transparent;border:1px solid var(--border);border-radius:9px;padding:7px 12px;color:var(--text);font-size:12.5px;font-weight:500;line-height:1;cursor:pointer;height:34px;box-sizing:border-box;transition:background .14s,border-color .14s;}',
    '.cmdk-trigger:hover{background:var(--bg-2);border-color:var(--border-strong);}',
    '.cmdk-trigger.active{background:var(--bg-2);border-color:var(--accent);color:var(--text);}',
    '@media (prefers-reduced-motion:reduce){.cmdk-backdrop,.cmdk{transition:none;}}'
  ].join('');

  function injectStyle() {
    if (document.getElementById('cmdk-style')) return;
    var s = document.createElement('style');
    s.id = 'cmdk-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function ic(name) {
    var set = (typeof ICONS !== 'undefined' && ICONS) ? ICONS : (window.ICONS || null);
    if (set && set[name]) return set[name];
    return '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;"></span>';
  }

  function call(fn) { try { return fn(); } catch (e) {} }

  var isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  var MOD = isMac ? '&#8984;' : 'Ctrl';

  function buildCommands() {
    var cmds = [];

    document.querySelectorAll('.sidebar-item[data-section]').forEach(function (el) {
      var section = el.getAttribute('data-section');
      var label = (el.textContent || section).trim().replace(/\s+/g, ' ')
        .replace(/\s*(Pro|New|Beta)\s*$/i, '');
      if (!label) return;
      var icon = el.getAttribute('data-icon') || 'doc';
      var isAiTool = ['tailor', 'ats', 'analysis', 'modernize'].indexOf(section) > -1;
      cmds.push({
        group: isAiTool ? 'AI tools' : 'Go to section',
        icon: icon, label: label, hint: '',
        run: function () { el.click(); }
      });
    });

    var actions = [
      { group: 'Actions', icon: 'download', label: 'Export resume', hint: '', run: function () { location.href = 'export'; } },
      { group: 'Actions', icon: 'check', label: 'Save resume', hint: MOD + '+S', run: function () { call(function () { saveResume(); }); } },
      { group: 'Actions', icon: 'upload', label: 'Import a resume', hint: '', run: function () { call(function () { openModal('import'); }); } },
      { group: 'Actions', icon: 'doc', label: 'Full preview', hint: '', run: function () { call(function () { openFullPreview(); }); } },
      { group: 'Actions', icon: 'clock', label: 'Version history', hint: '', run: function () { call(function () { openModal('version'); }); } },
      { group: 'Actions', icon: 'settings', label: 'Toggle light / dark', hint: '', run: function () { call(function () { toggleTheme(); }); } }
    ];
    var ORDER = ['Go to section', 'AI tools', 'Actions'];
    var all = cmds.concat(actions);
    all.sort(function (a, b) { return ORDER.indexOf(a.group) - ORDER.indexOf(b.group); });
    return all;
  }

  // Fuzzy match: returns a score (lower = better, -1 = no match) and
  // an array of matched char indices for highlighting.
  function fuzzy(query, text) {
    var q = query.toLowerCase(), t = text.toLowerCase();
    var qi = 0, ti = 0, indices = [], score = 0, lastMatch = -1;
    while (qi < q.length && ti < t.length) {
      if (t[ti] === q[qi]) {
        indices.push(ti);
        if (lastMatch > -1) score += (ti - lastMatch - 1);
        if (ti > 0 && (t[ti - 1] === ' ' || t[ti - 1] === '/')) score -= 2;
        lastMatch = ti;
        qi++;
      }
      ti++;
    }
    if (qi < q.length) return { score: -1, indices: [] };
    return { score: score, indices: indices };
  }

  function highlight(text, indices) {
    if (!indices.length) return esc(text);
    var out = '', set = {};
    indices.forEach(function (i) { set[i] = 1; });
    for (var i = 0; i < text.length; i++) {
      if (set[i]) out += '<mark>' + esc(text[i]) + '</mark>';
      else out += esc(text[i]);
    }
    return out;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  var state = { open: false, all: [], view: [], sel: 0, q: '' };

  function filter(q) {
    q = q.trim();
    if (!q) return state.all.map(function (c) { return { c: c, hl: null }; });
    return state.all
      .map(function (c) { var f = fuzzy(q, c.label); return { c: c, score: f.score, hl: f.indices }; })
      .filter(function (x) { return x.score > -1; })
      .sort(function (a, b) { return a.score - b.score; })
      .map(function (x) { return { c: x.c, hl: x.hl }; });
  }

  function renderList() {
    var list = document.getElementById('cmdk-list');
    if (!list) return;
    if (!state.view.length) { list.innerHTML = '<div class="cmdk-empty">No matching commands</div>'; return; }
    var html = '', lastGroup = null;
    state.view.forEach(function (item, i) {
      var c = item.c;
      if (c.group !== lastGroup) { html += '<div class="cmdk-group">' + c.group + '</div>'; lastGroup = c.group; }
      var labelHtml = item.hl ? highlight(c.label, item.hl) : esc(c.label);
      var hintHtml = c.hint ? '<span class="cmdk-hint"><span class="cmdk-kbd">' + c.hint + '</span></span>' : '';
      html += '<div class="cmdk-item' + (i === state.sel ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="cmdk-ic">' + ic(c.icon) + '</span>' +
        '<span class="cmdk-label">' + labelHtml + '</span>' +
        hintHtml +
        '</div>';
    });
    list.innerHTML = html;
    list.querySelectorAll('.cmdk-item').forEach(function (el) {
      el.addEventListener('mousemove', function () {
        var idx = +el.getAttribute('data-i');
        if (state.sel !== idx) { state.sel = idx; paintSel(); }
      });
      el.addEventListener('click', function () { runSel(+el.getAttribute('data-i')); });
    });
    scrollSel();
  }

  function paintSel() {
    document.querySelectorAll('.cmdk-item').forEach(function (el) {
      el.classList.toggle('sel', +el.getAttribute('data-i') === state.sel);
    });
  }
  function scrollSel() {
    var el = document.querySelector('.cmdk-item.sel');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function runSel(i) {
    var item = state.view[i != null ? i : state.sel];
    close();
    if (item) item.c.run();
  }

  function open() {
    if (state.open) return;
    injectStyle();
    state.all = buildCommands();
    state.q = ''; state.sel = 0; state.view = filter('');

    var back = document.createElement('div');
    back.className = 'cmdk-backdrop'; back.id = 'cmdk-backdrop';
    back.innerHTML =
      '<div class="cmdk" role="dialog" aria-label="Command palette">' +
        '<div class="cmdk-search">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input id="cmdk-input" type="text" placeholder="Search actions, sections, AI tools..." autocomplete="off" spellcheck="false">' +
          '<span class="cmdk-esc">esc</span>' +
        '</div>' +
        '<div class="cmdk-list" id="cmdk-list"></div>' +
        '<div class="cmdk-foot">' +
          '<span><span class="cmdk-kbd">&uarr;&darr;</span> navigate</span>' +
          '<span><span class="cmdk-kbd">&crarr;</span> select</span>' +
          '<span><span class="cmdk-kbd">esc</span> close</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(back);
    state.open = true;
    renderList();

    requestAnimationFrame(function () { back.classList.add('in'); });

    var input = document.getElementById('cmdk-input');
    input.focus();
    input.addEventListener('input', function () {
      state.q = input.value; state.view = filter(state.q); state.sel = 0; renderList();
    });
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
  }

  function close() {
    var back = document.getElementById('cmdk-backdrop');
    if (back) {
      back.classList.remove('in');
      setTimeout(function () { back.remove(); }, 200);
    }
    state.open = false;
  }

  window.openCommandPalette = open;

  document.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); state.open ? close() : open(); return; }
    if (!state.open) return;
    if (k === 'escape') { e.preventDefault(); close(); }
    else if (k === 'arrowdown') { e.preventDefault(); state.sel = Math.min(state.sel + 1, state.view.length - 1); paintSel(); scrollSel(); }
    else if (k === 'arrowup') { e.preventDefault(); state.sel = Math.max(state.sel - 1, 0); paintSel(); scrollSel(); }
    else if (k === 'enter') { e.preventDefault(); runSel(); }
  });

  function mountTrigger() {
    var right = document.querySelector('.topbar-right');
    if (!right || document.getElementById('cmdk-trigger')) return;
    injectStyle();
    var b = document.createElement('button');
    b.id = 'cmdk-trigger'; b.className = 'cmdk-trigger'; b.type = 'button';
    b.title = 'Search commands';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<span>' + (isMac ? '⌘K' : 'Ctrl K') + '</span>';
    b.addEventListener('click', open);
    var anchor = right.querySelector('#btn-import') || right.querySelector('#acct-center');
    if (anchor) right.insertBefore(b, anchor); else right.appendChild(b);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountTrigger);
  } else {
    mountTrigger();
  }
})();
