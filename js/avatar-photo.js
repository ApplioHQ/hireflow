/* avatar-photo.js, paints the saved profile photo into the topbar avatar on app
   pages whose own scripts hydrate it with initials. Re-applies a few times so it
   wins after that hydration, and watches for later re-renders. No deps. */
(function () {
  'use strict';
  var avatar = '';
  try { avatar = (JSON.parse(localStorage.getItem('hf_profile') || '{}') || {}).avatar || ''; } catch (e) { return; }
  if (!avatar) return;

  function paint() {
    var els = document.querySelectorAll('.acct-avatar, #acct-avatar, #acct-avatar-lg');
    els.forEach(function (el) {
      if (el.querySelector && el.querySelector('img')) return;   // already has the photo
      el.innerHTML = '<img src="' + avatar + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">';
      el.style.overflow = 'hidden';
    });
  }

  function run() { paint(); setTimeout(paint, 300); setTimeout(paint, 900); setTimeout(paint, 1800); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
