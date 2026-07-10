/* attribution.js — one short post-signup question: "Where did you hear about
   Applio?". Shows once (flag hf_ask_attribution set at signup), posts the answer
   to /attribution (stored on the user for the admin breakdown), then never nags
   again. Self-contained: injects its own modal + styles. */
(function () {
  'use strict';
  var TOKEN = localStorage.getItem('hf_token');
  if (!TOKEN) return;
  if (localStorage.getItem('hf_ask_attribution') !== '1') return;

  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';
  var SOURCES = ['Google search', 'TikTok', 'Instagram', 'YouTube', 'LinkedIn', 'Facebook', 'Reddit', 'ChatGPT or other AI', 'Friend or colleague', 'Other'];

  function done() { try { localStorage.removeItem('hf_ask_attribution'); } catch (e) {} }
  function close() { var b = document.getElementById('attr-backdrop'); if (b) b.remove(); }

  function submit(source) {
    done();
    if (API && source) {
      fetch(API + '/attribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
        body: JSON.stringify({ source: source })
      }).catch(function () {});
    }
    close();
    if (window.toast) toast('Thanks — that helps a lot.', { type: 'success' });
  }

  function show() {
    if (document.getElementById('attr-backdrop')) return;
    if (!document.getElementById('attr-css')) {
      var st = document.createElement('style');
      st.id = 'attr-css';
      st.textContent =
        '#attr-backdrop{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(7,9,26,.6);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);}'
        + '#attr-card{width:100%;max-width:440px;background:var(--bg-1);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--sh-3);padding:24px;}'
        + '#attr-card .attr-kicker{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);}'
        + '#attr-card h3{font-size:19px;font-weight:700;margin:6px 0 4px;letter-spacing:-.3px;}'
        + '#attr-card p{color:var(--muted);font-size:13.5px;margin-bottom:16px;line-height:1.5;}'
        + '#attr-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px;}'
        + '#attr-opts button{font:inherit;font-size:13.5px;font-weight:600;text-align:left;padding:11px 13px;border-radius:var(--r-sm);background:var(--bg-2);border:1px solid var(--border);color:var(--text);cursor:pointer;transition:border-color .15s,background .15s;}'
        + '#attr-opts button:hover{border-color:var(--accent);background:var(--bg-3);}'
        + '#attr-skip{display:block;margin:16px auto 0;background:none;border:0;color:var(--muted);font:inherit;font-size:12.5px;cursor:pointer;}'
        + '#attr-skip:hover{color:var(--text);}';
      document.head.appendChild(st);
    }
    var bd = document.createElement('div');
    bd.id = 'attr-backdrop';
    bd.innerHTML = '<div id="attr-card" role="dialog" aria-modal="true" aria-labelledby="attr-title">'
      + '<div class="attr-kicker">Welcome to Applio</div>'
      + '<h3 id="attr-title">One quick question</h3>'
      + '<p>Where did you hear about Applio? It genuinely helps us know what\'s working.</p>'
      + '<div id="attr-opts">' + SOURCES.map(function (s) { return '<button type="button" data-src="' + s.replace(/"/g, '&quot;') + '">' + s + '</button>'; }).join('') + '</div>'
      + '<button id="attr-skip" type="button">Skip</button>'
      + '</div>';
    document.body.appendChild(bd);
    bd.querySelectorAll('#attr-opts button').forEach(function (b) {
      b.addEventListener('click', function () { submit(b.getAttribute('data-src')); });
    });
    document.getElementById('attr-skip').addEventListener('click', function () { done(); close(); });
    bd.addEventListener('click', function (e) { if (e.target === bd) { done(); close(); } });   // click backdrop = dismiss
  }

  // Let the page settle first so the modal reads as a deliberate, gentle prompt.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 700); });
  else setTimeout(show, 700);
})();
