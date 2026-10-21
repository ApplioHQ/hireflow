/* Applio Studio — document focus layout (mockup 1).
   Turns the editor into [slim sidebar][form][BIG document][copilot rail] so the
   resume is the large central canvas you edit inline. Non-destructive: it only
   widens the document column and relocates the copilot rail into its own column;
   the form (#main) and its rendering are untouched. Toggleable (default on),
   desktop only. */
(function () {
  'use strict';
  var KEY = 'applio_focus_mode';
  var btn = null;

  function shell() { return document.querySelector('.app-shell-inner'); }
  function enabled() { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } } // default on

  function railCol() {
    var rc = document.getElementById('focus-rail');
    if (!rc) {
      rc = document.createElement('aside');
      rc.id = 'focus-rail';
      rc.className = 'focus-rail';
      shell().appendChild(rc);
    }
    return rc;
  }

  function reflow() { setTimeout(function () { if (typeof window.renderPreview === 'function') window.renderPreview(); }, 80); }

  function on() {
    var s = shell(); if (!s) return;
    s.classList.add('focus-mode');
    var rail = document.getElementById('copilot-rail');
    if (rail) railCol().appendChild(rail);          // copilot rail -> its own column
    else setTimeout(on, 120);                        // rail not mounted yet; retry once
    reflow();
  }

  function off() {
    var s = shell(); if (!s) return;
    s.classList.remove('focus-mode');
    var rail = document.getElementById('copilot-rail');
    var rp = document.querySelector('.right-panel');
    if (rail && rp) rp.insertBefore(rail, rp.firstChild);   // copilot rail back to the panel
    reflow();
  }

  function setMode(v) {
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {}
    if (v) on(); else off();
    if (btn) { btn.classList.toggle('active', v); btn.setAttribute('aria-pressed', v ? 'true' : 'false'); }
  }

  function mountBtn() {
    var right = document.querySelector('.topbar-right');
    if (!right || document.getElementById('focus-toggle')) return;
    btn = document.createElement('button');
    btn.id = 'focus-toggle';
    btn.className = 'cmdk-trigger';
    btn.type = 'button';
    btn.title = 'Toggle document focus mode';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg><span>Focus</span>';
    btn.addEventListener('click', function () { setMode(!shell().classList.contains('focus-mode')); });
    // Place Focus just before ⌘K, both to the LEFT of import/save/export.
    var anchor = right.querySelector('#cmdk-trigger') || right.querySelector('#btn-import') || right.querySelector('#acct-center');
    if (anchor) right.insertBefore(btn, anchor); else right.appendChild(btn);
    btn.classList.toggle('active', enabled());
  }

  function init() {
    mountBtn();
    if (enabled()) on();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
