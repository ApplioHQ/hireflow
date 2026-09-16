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
          var _h = new URL(_r).hostname.replace(/^www\./,'');
          if (/chat\.openai\.com|chatgpt\.com/.test(_h)) _ch='ai:chatgpt';
          else if (/claude\.ai/.test(_h)) _ch='ai:claude';
          else if (/perplexity\.ai/.test(_h)) _ch='ai:perplexity';
          else if (/gemini\.google\.com|bard\.google\.com/.test(_h)) _ch='ai:gemini';
          else if (/copilot\.microsoft\.com/.test(_h)) _ch='ai:copilot';
          else if (/you\.com/.test(_h)) _ch='ai:you';
          else if (/google\.\w/.test(_h)) _ch='search:google';
          else if (/bing\.com/.test(_h)) _ch='search:bing';
          else if (/duckduckgo\.com/.test(_h)) _ch='search:duckduckgo';
          else if (/yahoo\.com/.test(_h)) _ch='search:yahoo';
          else if (/t\.co|twitter\.com|x\.com/.test(_h)) _ch='social:twitter';
          else if (/facebook\.com|l\.facebook\.com|fb\.com/.test(_h)) _ch='social:facebook';
          else if (/instagram\.com|l\.instagram\.com/.test(_h)) _ch='social:instagram';
          else if (/reddit\.com|old\.reddit\.com/.test(_h)) _ch='social:reddit';
          else if (/linkedin\.com|lnkd\.in/.test(_h)) _ch='social:linkedin';
          else if (/tiktok\.com/.test(_h)) _ch='social:tiktok';
          else if (/youtube\.com|youtu\.be/.test(_h)) _ch='social:youtube';
          else if (/threads\.net/.test(_h)) _ch='social:threads';
          else if (/github\.com/.test(_h)) _ch='ref:github';
          else if (/producthunt\.com/.test(_h)) _ch='ref:producthunt';
          else if (/news\.ycombinator\.com/.test(_h)) _ch='ref:hackernews';
          else if (/appliohq\.com/.test(_h)) _ch='internal';
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
