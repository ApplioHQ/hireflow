/* Applio Studio — Command palette (Phase 2).
   Cmd/Ctrl+K opens a searchable list of every editor action: jump to any
   section, run an AI tool, export, save, import, full preview, version
   history, toggle theme. Commands are built live from the DOM, so custom
   sections and whatever the editor currently exposes are always included.
   Self-contained; no network calls. */
(function () {
  'use strict';

  var STYLE = [
    '.cmdk-backdrop{position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.5);display:flex;align-items:flex-start;justify-content:center;padding:12vh 16px 16px;}',
    '.cmdk{width:100%;max-width:460px;background:var(--bg-2);border:1px solid var(--border);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:hidden;font-family:inherit;}',
    '.cmdk-search{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid var(--border);}',
    '.cmdk-search svg{width:16px;height:16px;color:var(--muted);flex:0 0 auto;}',
    '.cmdk-search input{flex:1;min-width:0;background:transparent!important;border:0!important;outline:none!important;box-shadow:none!important;color:var(--text);font-size:14px;padding:0!important;margin:0;height:auto;line-height:1.4;}',
    '.cmdk-esc{color:var(--muted);font-size:11px;border:1px solid var(--border);border-radius:5px;padding:2px 7px;}',
    '.cmdk-list{max-height:48vh;overflow:auto;padding:7px;}',
    '.cmdk-group{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:8px 9px 5px;}',
    '.cmdk-item{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:8px;cursor:pointer;color:var(--text);}',
    '.cmdk-item .cmdk-ic{width:16px;height:16px;color:var(--muted);flex:0 0 auto;display:inline-flex;}',
    '.cmdk-item .cmdk-ic svg{width:16px;height:16px;}',
    '.cmdk-item .cmdk-label{flex:1;font-size:12.5px;}',
    '.cmdk-item .cmdk-hint{color:var(--muted);font-size:11px;}',
    '.cmdk-item.sel{background:var(--bg-3);}',
    '.cmdk-item.sel .cmdk-ic,.cmdk-item.sel .cmdk-label{color:var(--accent);}',
    '.cmdk-empty{padding:18px;text-align:center;color:var(--muted);font-size:12.5px;}',
    '.cmdk-trigger{display:inline-flex;align-items:center;gap:6px;background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:5px 9px;color:var(--muted);font-size:11px;cursor:pointer;}',
    '.cmdk-trigger:hover{border-color:var(--accent);color:var(--text);}'
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

  // Build the command list fresh each open so it reflects current sections.
  function buildCommands() {
    var cmds = [];

    document.querySelectorAll('.sidebar-item[data-section]').forEach(function (el) {
      var section = el.getAttribute('data-section');
      var label = (el.textContent || section).trim().replace(/\s+/g, ' ')
        .replace(/\s*(Pro|New|Beta)\s*$/i, '');
      if (!label) return;
      var icon = el.getAttribute('data-icon') || 'doc';
      var pro = el.classList.contains('pro-item');
      cmds.push({
        group: pro || ['tailor', 'ats', 'analysis', 'modernize'].indexOf(section) > -1 ? 'AI tools' : 'Go to section',
        icon: icon, label: label, hint: pro ? 'Pro' : '',
        run: function () { el.click(); }
      });
    });

    var actions = [
      { group: 'Actions', icon: 'download', label: 'Export resume', hint: '', run: function () { location.href = 'export'; } },
      { group: 'Actions', icon: 'check', label: 'Save resume', run: function () { call(function () { saveResume(); }); } },
      { group: 'Actions', icon: 'upload', label: 'Import a resume', run: function () { call(function () { openModal('import'); }); } },
      { group: 'Actions', icon: 'doc', label: 'Full preview', run: function () { call(function () { openFullPreview(); }); } },
      { group: 'Actions', icon: 'clock', label: 'Version history', run: function () { call(function () { openModal('version'); }); } },
      { group: 'Actions', icon: 'settings', label: 'Toggle light / dark', run: function () { call(function () { toggleTheme(); }); } }
    ];
    // Keep each group contiguous so its header renders exactly once, in a
    // sensible order, even though the DOM interleaves section types.
    var ORDER = ['Go to section', 'AI tools', 'Actions'];
    var all = cmds.concat(actions);
    all.sort(function (a, b) { return ORDER.indexOf(a.group) - ORDER.indexOf(b.group); });
    return all;
  }

  var state = { open: false, all: [], view: [], sel: 0, q: '' };

  function filter(q) {
    q = q.trim().toLowerCase();
    if (!q) return state.all.slice();
    return state.all
      .map(function (c) { return { c: c, i: c.label.toLowerCase().indexOf(q) }; })
      .filter(function (x) { return x.i > -1; })
      .sort(function (a, b) { return a.i - b.i; })
      .map(function (x) { return x.c; });
  }

  function renderList() {
    var list = document.getElementById('cmdk-list');
    if (!list) return;
    if (!state.view.length) { list.innerHTML = '<div class="cmdk-empty">No matching commands</div>'; return; }
    var html = '', lastGroup = null;
    state.view.forEach(function (c, i) {
      if (c.group !== lastGroup) { html += '<div class="cmdk-group">' + c.group + '</div>'; lastGroup = c.group; }
      html += '<div class="cmdk-item' + (i === state.sel ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="cmdk-ic">' + ic(c.icon) + '</span>' +
        '<span class="cmdk-label">' + c.label + '</span>' +
        (c.hint ? '<span class="cmdk-hint">' + c.hint + '</span>' : '') +
        '</div>';
    });
    list.innerHTML = html;
    list.querySelectorAll('.cmdk-item').forEach(function (el) {
      el.addEventListener('mousemove', function () { state.sel = +el.getAttribute('data-i'); paintSel(); });
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
    var c = state.view[i != null ? i : state.sel];
    close();
    if (c) c.run();
  }

  function open() {
    if (state.open) return;
    injectStyle();
    state.all = buildCommands();
    state.q = ''; state.sel = 0; state.view = state.all.slice();

    var back = document.createElement('div');
    back.className = 'cmdk-backdrop'; back.id = 'cmdk-backdrop';
    back.innerHTML =
      '<div class="cmdk" role="dialog" aria-label="Command palette">' +
        '<div class="cmdk-search">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input id="cmdk-input" type="text" placeholder="Search actions, sections, AI tools…" autocomplete="off" spellcheck="false">' +
          '<span class="cmdk-esc">esc</span>' +
        '</div>' +
        '<div class="cmdk-list" id="cmdk-list"></div>' +
      '</div>';
    document.body.appendChild(back);
    state.open = true;
    renderList();

    var input = document.getElementById('cmdk-input');
    input.focus();
    input.addEventListener('input', function () {
      state.q = input.value; state.view = filter(state.q); state.sel = 0; renderList();
    });
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
  }

  function close() {
    var back = document.getElementById('cmdk-backdrop');
    if (back) back.remove();
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

  // Add a small ⌘K affordance to the topbar so it's discoverable.
  function mountTrigger() {
    var right = document.querySelector('.topbar-right');
    if (!right || document.getElementById('cmdk-trigger')) return;
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    var b = document.createElement('button');
    b.id = 'cmdk-trigger'; b.className = 'cmdk-trigger'; b.type = 'button';
    b.title = 'Search commands';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<span>' + (isMac ? '⌘K' : 'Ctrl K') + '</span>';
    b.addEventListener('click', open);
    // Sit at the right of the topbar, just left of the account menu.
    var acct = right.querySelector('#acct-center');
    if (acct) right.insertBefore(b, acct); else right.appendChild(b);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountTrigger);
  } else {
    mountTrigger();
  }
})();
