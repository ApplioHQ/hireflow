// Shared theme management — included on every page
(function () {
  function applyTheme(light) {
    document.body.classList.toggle('light-mode', light);
    const btns = document.querySelectorAll('.theme-toggle');
    btns.forEach(function (b) {
      b.textContent = light ? '🌙 Dark' : '☀️ Light';
    });
  }

  // Apply saved theme immediately (before paint)
  const saved = localStorage.getItem('hf_theme') === 'light';
  if (saved) document.body.classList.add('light-mode');

  window.toggleTheme = function () {
    const light = !document.body.classList.contains('light-mode');
    localStorage.setItem('hf_theme', light ? 'light' : 'dark');
    applyTheme(light);
  };

  // Hydrate button labels once DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(document.body.classList.contains('light-mode'));
  });
})();
