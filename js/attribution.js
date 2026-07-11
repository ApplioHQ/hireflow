/* attribution.js, one-time post-signup prompt (flag hf_ask_attribution set at
   signup). Two quick steps in a single modal:
     1) "Where did you hear about Applio?"  → POST /attribution
     2) "Want a weekly reminder to log your wins?" → sets profile.emailWeeklyWin
        (opt-in; the Friday cron only emails users who say yes here or via the
        dashboard toggle). Shows once, then never nags again. Self-contained. */
(function () {
  'use strict';
  var TOKEN = localStorage.getItem('hf_token');
  if (!TOKEN) return;
  if (localStorage.getItem('hf_ask_attribution') !== '1') return;

  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';
  var SOURCES = ['Google search', 'TikTok', 'Instagram', 'YouTube', 'LinkedIn', 'Facebook', 'Reddit', 'ChatGPT or other AI', 'Friend or colleague', 'Other'];

  function done() { try { localStorage.removeItem('hf_ask_attribution'); } catch (e) {} }
  function close() { var b = document.getElementById('attr-backdrop'); if (b) b.remove(); }

  // Step 1 answer: record where they came from, then advance to the email opt-in.
  function submitSource(source) {
    if (API && source) {
      fetch(API + '/attribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
        body: JSON.stringify({ source: source })
      }).catch(function () {});
    }
    showStep2();
  }

  // Step 2 answer: store the email opt-in on the profile (merged, cloud-synced).
  function submitConsent(yes) {
    var p = {};
    try { p = JSON.parse(localStorage.getItem('hf_profile') || '{}') || {}; } catch (e) { p = {}; }
    if (typeof p !== 'object' || Array.isArray(p)) p = {};
    p.emailWeeklyWin = !!yes;
    p.updatedAt = Date.now();
    try { localStorage.setItem('hf_profile', JSON.stringify(p)); } catch (e) {}
    if (API) fetch(API + '/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify({ profile: p })
    }).catch(function () {});
    done(); close();
    if (window.toast) toast(yes ? 'Done, we\'ll send one short weekly nudge. Unsubscribe anytime.' : 'No problem, no emails from us. You can turn them on later in your dashboard.', { type: 'success' });
  }

  function ensureCss() {
    if (document.getElementById('attr-css')) return;
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
      + '#attr-consent{display:flex;flex-direction:column;gap:9px;}'
      + '#attr-consent button{font:inherit;font-size:14px;font-weight:600;padding:12px 15px;border-radius:var(--r-sm);cursor:pointer;transition:transform .12s,box-shadow .12s,background .15s,border-color .15s;}'
      + '#attr-consent .attr-yes{background:var(--accent);border:1px solid var(--accent);color:#fff;box-shadow:0 4px 14px rgba(99,102,241,.3);}'
      + '#attr-consent .attr-yes:hover{transform:translateY(-1px);}'
      + '#attr-consent .attr-no{background:var(--bg-2);border:1px solid var(--border);color:var(--text);}'
      + '#attr-consent .attr-no:hover{border-color:var(--accent);}'
      + '#attr-skip{display:block;margin:16px auto 0;background:none;border:0;color:var(--muted);font:inherit;font-size:12.5px;cursor:pointer;}'
      + '#attr-skip:hover{color:var(--text);}'
      + '.attr-fineprint{font-size:11.5px;color:var(--muted);text-align:center;margin-top:14px;}';
    document.head.appendChild(st);
  }

  function show() {
    if (document.getElementById('attr-backdrop')) return;
    ensureCss();
    var bd = document.createElement('div');
    bd.id = 'attr-backdrop';
    bd.innerHTML = '<div id="attr-card" role="dialog" aria-modal="true" aria-labelledby="attr-title"></div>';
    document.body.appendChild(bd);
    // Backdrop click dismisses everything (counts as declining, safe default: no email).
    bd.addEventListener('click', function (e) { if (e.target === bd) { done(); close(); } });
    showStep1();
  }

  function showStep1() {
    var card = document.getElementById('attr-card');
    if (!card) return;
    card.innerHTML = '<div class="attr-kicker">Welcome to Applio</div>'
      + '<h3 id="attr-title">One quick question</h3>'
      + '<p>Where did you hear about Applio? It genuinely helps us know what\'s working.</p>'
      + '<div id="attr-opts">' + SOURCES.map(function (s) { return '<button type="button" data-src="' + s.replace(/"/g, '&quot;') + '">' + s + '</button>'; }).join('') + '</div>'
      + '<button id="attr-skip" type="button">Skip</button>';
    card.querySelectorAll('#attr-opts button').forEach(function (b) {
      b.addEventListener('click', function () { submitSource(b.getAttribute('data-src')); });
    });
    document.getElementById('attr-skip').addEventListener('click', showStep2);   // still ask the consent question
  }

  function showStep2() {
    var card = document.getElementById('attr-card');
    if (!card) return;
    card.innerHTML = '<div class="attr-kicker">Stay on track</div>'
      + '<h3 id="attr-title">Want a weekly nudge?</h3>'
      + '<p>Once a week we can email you a quick reminder to log a win, the habit that keeps your resume current and builds a brag doc for reviews and raises. Only if you skip a week, and you can unsubscribe anytime.</p>'
      + '<div id="attr-consent">'
      + '<button type="button" class="attr-yes">Yes, send me a weekly reminder</button>'
      + '<button type="button" class="attr-no">No thanks</button>'
      + '</div>'
      + '<div class="attr-fineprint">You can change this anytime in your dashboard.</div>';
    card.querySelector('.attr-yes').addEventListener('click', function () { submitConsent(true); });
    card.querySelector('.attr-no').addEventListener('click', function () { submitConsent(false); });
  }

  // Let the page settle first so the modal reads as a deliberate, gentle prompt.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 700); });
  else setTimeout(show, 700);
})();
