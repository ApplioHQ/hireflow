// Shared theme management, works in <head> because we target <html> not <body>
(function () {
  // SVG icons for theme toggle
  var SUN_ICON = '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  var MOON_ICON = '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function applyTheme(light) {
    document.documentElement.classList.toggle('light-mode', light);
    // Update all theme toggles (both full and icon-only variants)
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      var iconEl = btn.querySelector('.icon');
      var labelEl = btn.querySelector('.label');
      if (iconEl) {
        iconEl.innerHTML = light ? SUN_ICON : MOON_ICON;
      }
      if (labelEl) {
        labelEl.textContent = light ? 'Light' : 'Dark';
      }
      // Update aria-label for accessibility
      btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    });
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
    if (/(^|\\.)appliohq\\.com$/.test(location.hostname)) {
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

  // Capture ?ref= referral code so it survives navigation to the signup page
  try {
    var _ref = new URLSearchParams(location.search).get('ref');
    if (_ref) localStorage.setItem('hf_ref', _ref.trim().toUpperCase().slice(0, 6));
  } catch (e) {}

  // ── First-touch attribution (once per browser, stored in hf_attr) ──
  try {
    if (!localStorage.getItem('hf_attr')) {
      var _r = document.referrer || '';
      var _p = new URLSearchParams(location.search);
      var _utm = {};
      ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){
        var v = _p.get(k); if (v) _utm[k] = v.slice(0,100);
      });
      var _cid = {};
      ['gclid','fbclid','msclkid','ttclid'].forEach(function(k){
        var v = _p.get(k); if (v) _cid[k] = v.slice(0,200);
      });
      var _ch = 'direct';
      if (_r) {
        try {
          var _h = new URL(_r).hostname.replace(/^www\\./,'');
          if (/chat\\.openai\\.com|chatgpt\\.com/.test(_h)) _ch='ai:chatgpt';
          else if (/claude\\.ai/.test(_h)) _ch='ai:claude';
          else if (/perplexity\\.ai/.test(_h)) _ch='ai:perplexity';
          else if (/gemini\\.google\\.com|bard\\.google\\.com/.test(_h)) _ch='ai:gemini';
          else if (/copilot\\.microsoft\\.com/.test(_h)) _ch='ai:copilot';
          else if (/you\\.com/.test(_h)) _ch='ai:you';
          else if (/google\\.\\w/.test(_h)) _ch='search:google';
          else if (/bing\\.com/.test(_h)) _ch='search:bing';
          else if (/duckduckgo\\.com/.test(_h)) _ch='search:duckduckgo';
          else if (/yahoo\\.com/.test(_h)) _ch='search:yahoo';
          else if (/t\\.co|twitter\\.com|x\\.com/.test(_h)) _ch='social:twitter';
          else if (/facebook\\.com|l\\.facebook\\.com|fb\\.com/.test(_h)) _ch='social:facebook';
          else if (/instagram\\.com|l\\.instagram\\.com/.test(_h)) _ch='social:instagram';
          else if (/reddit\\.com|old\\.reddit\\.com/.test(_h)) _ch='social:reddit';
          else if (/linkedin\\.com|lnkd\\.in/.test(_h)) _ch='social:linkedin';
          else if (/tiktok\\.com/.test(_h)) _ch='social:tiktok';
          else if (/youtube\\.com|youtu\\.be/.test(_h)) _ch='social:youtube';
          else if (/threads\\.net/.test(_h)) _ch='social:threads';
          else if (/github\\.com/.test(_h)) _ch='ref:github';
          else if (/producthunt\\.com/.test(_h)) _ch='ref:producthunt';
          else if (/news\\.ycombinator\\.com/.test(_h)) _ch='ref:hackernews';
          else if (/appliohq\\.com/.test(_h)) _ch='internal';
          else _ch='ref:'+_h;
        } catch(e){ _ch='ref:unknown'; }
      }
      if (_utm.utm_source) _ch = _utm.utm_source + (_utm.utm_medium ? ':'+_utm.utm_medium : '');
      localStorage.setItem('hf_attr', JSON.stringify({
        ch:_ch, ref:_r.slice(0,500), lp:location.pathname,
        utm:Object.keys(_utm).length?_utm:undefined,
        cid:Object.keys(_cid).length?_cid:undefined,
        t:Date.now()
      }));
    }
  } catch(e){}
})();