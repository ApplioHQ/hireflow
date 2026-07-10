/* bragdoc.js — compiles the user's Win Journal (hf_profile.achievements) into a
   printable "brag doc": accomplishments grouped by month over a chosen range.
   Read-only, zero AI, no fabrication — it only formats what the user logged. */
(function () {
  'use strict';
  var TOKEN = localStorage.getItem('hf_token');
  if (!TOKEN) { location.href = 'login'; return; }
  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';

  window.signOut = function () {
    ['hf_token', 'hf_email', 'hf_resume', 'hf_jobs', 'hf_jobs_ts', 'hf_ai_results', 'hf_welcome', 'hf_profile'].forEach(function (k) { localStorage.removeItem(k); });
    location.href = '/';
  };

  function readJSON(key, fb) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fb : v; } catch (e) { return fb; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  var PROFILE = readJSON('hf_profile', {}) || {};
  if (!PROFILE || typeof PROFILE !== 'object') PROFILE = {};

  function wins() { return Array.isArray(PROFILE.achievements) ? PROFILE.achievements.filter(function (w) { return w && w.text; }) : []; }

  function identity() {
    var resume = readJSON('hf_resume', null);
    var name = (resume && resume.personal && resume.personal.fullName) || PROFILE.name || '';
    if (!name) { var em = localStorage.getItem('hf_email') || ''; name = em ? em.split('@')[0] : 'Your name'; }
    var role = '';
    if (resume && Array.isArray(resume.experience) && resume.experience.length) {
      var e = resume.experience[0];
      role = [e.title, e.company].filter(Boolean).join(' · ');
    }
    if (!role) role = PROFILE.currentRole || PROFILE.targetRole || '';
    return { name: name, role: role };
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function monthKey(ts) { var d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); }
  function monthLabel(k) { return MONTHS[k % 12] + ' ' + Math.floor(k / 12); }

  function rangeStart(days) { return days > 0 ? Date.now() - days * 86400000 : 0; }

  function grouped(days) {
    var start = rangeStart(days);
    var inRange = wins().filter(function (w) { return (w.ts || 0) >= start; });
    // Undated wins (legacy) still count — bucket them under "Earlier".
    var byMonth = {}, undated = [];
    inRange.forEach(function (w) {
      if (w.ts) { var k = monthKey(w.ts); (byMonth[k] = byMonth[k] || []).push(w); }
      else undated.push(w);
    });
    var keys = Object.keys(byMonth).map(Number).sort(function (a, b) { return b - a; });
    var groups = keys.map(function (k) { return { label: monthLabel(k), items: byMonth[k] }; });
    if (undated.length) groups.push({ label: 'Earlier', items: undated });
    return { groups: groups, count: inRange.length };
  }

  function rangeLabel(days) {
    return days === '90' || days === 90 ? 'Last 90 days'
      : days === '180' || days === 180 ? 'Last 6 months'
      : days === '365' || days === 365 ? 'Last 12 months' : 'All time';
  }

  function render() {
    var days = parseInt(document.getElementById('bd-range').value, 10) || 0;
    var g = grouped(days);
    var id = identity();
    var out = document.getElementById('bd-out');
    var countEl = document.getElementById('bd-count');
    countEl.textContent = g.count ? g.count + ' win' + (g.count === 1 ? '' : 's') : '';

    if (!wins().length) {
      out.innerHTML = '<div class="bd-empty"><h2>No wins logged yet</h2>'
        + '<p style="margin-bottom:16px;">Your brag doc builds itself from your Win Journal. Log accomplishments as they happen — one line each — and they\'ll appear here, grouped by month and ready for review season.</p>'
        + '<a class="btn btn-primary" href="dashboard">Go log your first win →</a></div>';
      return;
    }
    if (!g.count) {
      out.innerHTML = '<div class="bd-empty"><h2>Nothing in this range</h2><p>You have wins logged, but none in the ' + esc(rangeLabel(days).toLowerCase()) + '. Try a wider range.</p></div>';
      return;
    }
    var body = g.groups.map(function (grp) {
      return '<div class="bd-group"><h2>' + esc(grp.label) + '</h2><ul>'
        + grp.items.map(function (w) { return '<li>' + esc(w.text) + '</li>'; }).join('')
        + '</ul></div>';
    }).join('');
    out.innerHTML = '<div class="bd-sheet" id="bd-sheet">'
      + '<h1>' + esc(id.name) + '</h1>'
      + (id.role ? '<div class="bd-role">' + esc(id.role) + '</div>' : '')
      + '<div class="bd-range-label">Accomplishments · ' + esc(rangeLabel(days)) + '</div>'
      + '<div class="bd-rule"></div>'
      + body
      + '<div class="bd-foot">Compiled with Applio · appliohq.com</div>'
      + '</div>';
  }

  function plainText() {
    var days = parseInt(document.getElementById('bd-range').value, 10) || 0;
    var g = grouped(days), id = identity();
    var lines = [id.name];
    if (id.role) lines.push(id.role);
    lines.push('Accomplishments — ' + rangeLabel(days));
    lines.push('');
    g.groups.forEach(function (grp) {
      lines.push(grp.label.toUpperCase());
      grp.items.forEach(function (w) { lines.push('• ' + w.text); });
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  function wire() {
    document.getElementById('bd-range').addEventListener('change', render);
    document.getElementById('bd-print').addEventListener('click', function () { window.print(); });
    document.getElementById('bd-copy').addEventListener('click', function () {
      var txt = plainText();
      var done = function () { if (window.toast) toast('Brag doc copied to clipboard', { type: 'success' }); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done);
      else { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); }
    });
  }

  // Pull the freshest cloud profile (win journal follows the user across devices),
  // then render. Falls back to whatever is in localStorage if the fetch fails.
  function pullThenRender() {
    if (!API) { render(); return; }
    fetch(API + '/profile', { headers: { 'Authorization': 'Bearer ' + TOKEN } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.profile && typeof d.profile === 'object') {
          var cloud = d.profile;
          // Adopt cloud if it's newer or local is empty.
          if (!PROFILE.updatedAt || (cloud.updatedAt && cloud.updatedAt >= PROFILE.updatedAt)) {
            PROFILE = cloud;
            try { localStorage.setItem('hf_profile', JSON.stringify(PROFILE)); } catch (e) {}
          }
        }
        render();
      })
      .catch(function () { render(); });
  }

  wire();
  pullThenRender();
})();
