/* Applio Studio — slim icon sidebar (mockup 1).
   Adds the `app-slim` class to the editor shell so the sidebar collapses to an
   icon rail on desktop (the CSS is gated to >=901px, so the mobile overlay keeps
   full labels). Labels become hover tooltips; completion checks become corner
   badges. Pure presentation — the sidebar items and their click handlers are
   untouched. */
(function () {
  'use strict';
  function apply() {
    var shell = document.querySelector('.app-shell-inner');
    if (shell) shell.classList.add('app-slim');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
