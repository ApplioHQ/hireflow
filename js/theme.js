// Shared theme management, works in <head> because we target <html>, not <body>
(function () {
  function applyTheme(light) {
    document.documentElement.classList.toggle('light-mode', light);
    // Text-label toggle buttons (export, jobs, interview, pricing, admin)
    document.querySelectorAll('.theme-toggle').forEach(function (b) {
      b.textContent = light ? '🌙 Dark' : '☀️ Light';
    });
    // Icon-only button (editor topbar)
    var sun  = document.getElementById('theme-icon-sun');
    var moon = document.getElementById('theme-icon-moon');
    if (sun)  sun.style.display  = light ? 'none' : '';
    if (moon) moon.style.display = light ? ''     : 'none';
  }

  // Apply immediately, <html> exists even in <head>
  var savedLight = localStorage.getItem('hf_theme') === 'light';
  if (savedLight) document.documentElement.classList.add('light-mode');

  window.toggleTheme = function () {
    var light = !document.documentElement.classList.contains('light-mode');
    localStorage.setItem('hf_theme', light ? 'light' : 'dark');
    applyTheme(light);
  };

  // Hydrate button labels/icons once DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(document.documentElement.classList.contains('light-mode'));
  });

  // ── Anonymous page-view beacon (no PII, no cookies) ──
  // Fires once per load on the live site only (never localhost/preview, so tests
  // and dev don't inflate the count). Powers the traffic metric in the admin panel.
  //   nv=1 -> first ever view from this browser (unique visitor)
  //   nd=1 -> first view from this browser today
  try {
    if (/(^|\.)appliohq\.com$/.test(location.hostname)) {
      var _t = new Date().toISOString().slice(0, 10);
      var _nv = localStorage.getItem('hf_seen') ? '0' : '1';
      var _nd = localStorage.getItem('hf_pv_day') === _t ? '0' : '1';
      localStorage.setItem('hf_seen', '1');
      localStorage.setItem('hf_pv_day', _t);
      var _pv = 'https://hireflow-api.pritamavuthu7.workers.dev/pageview?nv=' + _nv + '&nd=' + _nd;
      if (navigator.sendBeacon) navigator.sendBeacon(_pv);
      else fetch(_pv, { method: 'POST', keepalive: true, mode: 'no-cors' }).catch(function () {});
    }
  } catch (e) {}
})();
