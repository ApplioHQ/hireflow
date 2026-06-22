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
})();
