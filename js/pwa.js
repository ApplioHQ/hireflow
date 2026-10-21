/* Applio PWA: registers the service worker and drives the custom install UI.
   - Android/Chrome: a bottom banner shown after `beforeinstallprompt`.
   - iOS Safari: a one-time hint pointing at the Share button (iOS never fires
     an install event, so we nudge instead).
   Dismissals are remembered so neither one nags. The banner is suppressed on the
   editor so it never sits over someone's work. */
(function () {
  'use strict';

  // ---- Register the service worker (every page, including the editor). ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {/* non-fatal */});
    });
  }

  var LS_INSTALL = 'applio_pwa_install_dismissed';
  var LS_IOS = 'applio_pwa_ios_dismissed';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  // Keep the prompt off the editor (and the live preview iframe) so it is never in the way.
  var path = location.pathname.toLowerCase();
  var SUPPRESS = /(^|\/)editor(\.html)?(\/|$)/.test(path) || window.top !== window.self;

  if (isStandalone() || SUPPRESS) return;

  // ---- Shared card styling, matched to the Applio dark brand. ----
  function cardShell() {
    var el = document.createElement('div');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Install Applio');
    el.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%) translateY(140%)',
      'z-index:2147483000', 'width:calc(100% - 28px)', 'max-width:420px', 'box-sizing:border-box',
      'background:#1c1c20', 'border:1px solid rgba(255,255,255,.1)', 'border-radius:16px',
      'padding:14px', 'box-shadow:0 18px 50px rgba(0,0,0,.55)',
      'font-family:-apple-system,BlinkMacSystemFont,Inter,"Segoe UI",sans-serif',
      'transition:transform .4s cubic-bezier(.22,.9,.26,1)'
    ].join(';');
    return el;
  }
  function reveal(el) { requestAnimationFrame(function () { el.style.transform = 'translateX(-50%) translateY(0)'; }); }
  function hide(el) {
    el.style.transform = 'translateX(-50%) translateY(140%)';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
  }

  // ---- Android / Chrome install banner ----
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (lsGet(LS_INSTALL)) return;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', function () {
    lsSet(LS_INSTALL, '1');
    deferredPrompt = null;
  });

  function showInstallBanner() {
    var el = cardShell();
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<img src="/icon-192.png" alt="" width="44" height="44" style="width:44px;height:44px;border-radius:11px;background:#fff;flex:0 0 auto">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="color:#fff;font-size:14px;font-weight:600">Install Applio</div>' +
          '<div style="color:rgba(255,255,255,.55);font-size:12px">Free · works offline · opens like an app</div>' +
        '</div>' +
        '<button data-x aria-label="Dismiss" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;line-height:1;cursor:pointer;padding:4px">&times;</button>' +
      '</div>' +
      '<button data-go style="width:100%;margin-top:12px;background:#6d4dfc;color:#fff;border:none;border-radius:11px;padding:11px;font-size:14px;font-weight:500;cursor:pointer">Add to home screen</button>';

    document.body.appendChild(el);
    reveal(el);

    el.querySelector('[data-x]').addEventListener('click', function () { lsSet(LS_INSTALL, '1'); hide(el); });
    el.querySelector('[data-go]').addEventListener('click', function () {
      hide(el);
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () { lsSet(LS_INSTALL, '1'); deferredPrompt = null; });
    });
  }

  // ---- iOS Safari hint ----
  function isIos() {
    var ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+
  }
  function isIosChrome() { return /CriOS/.test(navigator.userAgent); }

  // Show on ANY iOS browser: every one adds to the home screen via its Share
  // menu, so don't exclude Chrome/Firefox/etc. Keeps showing until dismissed.
  if (isIos() && !lsGet(LS_IOS)) {
    window.addEventListener('load', function () {
      setTimeout(showIosHint, 2600);
    });
  }

  function showIosHint() {
    if (isStandalone()) return;
    var el = cardShell();
    el.innerHTML =
      '<div style="display:flex;gap:11px;align-items:flex-start">' +
        '<div style="width:32px;height:32px;border-radius:9px;background:#6d4dfc;display:flex;align-items:center;justify-content:center;flex:0 0 auto">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>' +
        '</div>' +
        '<div style="flex:1;color:rgba(255,255,255,.88);font-size:13px;line-height:1.5">' +
          'Install Applio: tap ' + (isIosChrome() ? 'the <b style="color:#fff">Share</b> icon in the address bar' : '<b style="color:#fff">Share</b>') + ', then <b style="color:#fff">Add to Home Screen</b>' +
        '</div>' +
        '<button data-x aria-label="Dismiss" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;line-height:1;cursor:pointer;padding:4px">&times;</button>' +
      '</div>';
    document.body.appendChild(el);
    reveal(el);
    /* Only suppress on an explicit dismiss, so a missed hint returns next visit.
       It also stops on its own once installed (isStandalone guard above). */
    el.querySelector('[data-x]').addEventListener('click', function () { lsSet(LS_IOS, '1'); hide(el); });
  }
})();
