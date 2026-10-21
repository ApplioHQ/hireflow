/* guide-enhance.js, shared layout upgrade for guide-style content pages (guides,
   cover-letter examples, "resume builder for X" pages). Widens the narrow centered
   column and adds a sticky sidebar (table of contents, build CTA, free tools, related
   links). Injects its own CSS since these pages carry per-file inline styles. Guards
   so it never double-builds and skips pages that already have a sidebar. */
(function () {
  'use strict';
  var wrap = document.querySelector('main.gd-wrap');
  if (!wrap || wrap.classList.contains('gx-wide')) return;
  if (document.querySelector('.rx-side, .gx-side')) return;   // another enhancer already built one
  var art = wrap.querySelector('article');
  if (!art) return;

  if (!document.getElementById('gx-style')) {
    var st = document.createElement('style');
    st.id = 'gx-style';
    st.textContent =
      '.gd-wrap.gx-wide{max-width:1120px;}'
      + '.gx-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:44px;align-items:start;}'
      + '.gx-main{min-width:0;}'
      + '.gx-side{position:sticky;top:20px;display:flex;flex-direction:column;gap:14px;}'
      + '.gx-card{background:var(--bg-1);border:1px solid var(--border);border-radius:14px;padding:16px 18px;}'
      + '.gx-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;margin-bottom:10px;}'
      + '.gx-toc{display:flex;flex-direction:column;}'
      + '.gx-toc a{font-size:13px;color:var(--muted);text-decoration:none;padding:5px 0 5px 12px;border-left:2px solid var(--border);transition:color .15s,border-color .15s;line-height:1.35;}'
      + '.gx-toc a:hover{color:var(--text);border-color:var(--accent);}'
      + '.gx-cta{background:linear-gradient(180deg,rgba(109,77,252,.1),var(--bg-1));text-align:center;}'
      + '.gx-cta-h{font-weight:700;font-size:14px;margin-bottom:4px;line-height:1.3;}'
      + '.gx-cta-s{font-size:12px;color:var(--muted);margin-bottom:11px;}'
      + '.gx-cta .btn{width:100%;}'
      + '.gx-links{display:flex;flex-direction:column;gap:9px;}'
      + '.gx-links a{font-size:13px;color:var(--accent);text-decoration:none;}'
      + '.gx-links a:hover{text-decoration:underline;}'
      + '@media(max-width:980px){.gd-wrap.gx-wide{max-width:760px;}.gx-layout{grid-template-columns:1fr;gap:0;}.gx-side{position:static;margin-top:16px;}.gx-side .gx-toc-card{display:none;}}';
    document.head.appendChild(st);
  }

  var slug = function (s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var heads = Array.prototype.slice.call(art.querySelectorAll('.gd-section > h2, .gd-faq > h2'));
  var toc = heads.map(function (h) {
    var sec = h.closest('.gd-section') || h.closest('.gd-faq');
    if (!sec) return null;
    if (!sec.id) sec.id = 'gx-' + slug(h.textContent).slice(0, 40);
    var label = h.textContent.trim();
    return { id: sec.id, label: label.length > 30 ? label.slice(0, 28) + '…' : label };
  }).filter(Boolean);

  var rel = [];
  Array.prototype.slice.call(document.querySelectorAll('.gd-rel a')).forEach(function (a) {
    if (rel.length < 5) rel.push({ href: a.getAttribute('href'), text: a.textContent.trim() });
  });

  var side = document.createElement('aside');
  side.className = 'gx-side';
  side.innerHTML =
    (toc.length >= 3 ? '<div class="gx-card gx-toc-card"><div class="gx-label">On this page</div><nav class="gx-toc" aria-label="On this page">' + toc.map(function (t) { return '<a href="#' + t.id + '">' + t.label + '</a>'; }).join('') + '</nav></div>' : '')
    + '<div class="gx-card gx-cta"><div class="gx-cta-h">Build an ATS-ready resume free</div><div class="gx-cta-s">Score it against any job in seconds.</div><a class="btn btn-primary" href="/login?mode=signup">Build resume free</a></div>'
    + '<div class="gx-card"><div class="gx-label">Free tools</div><div class="gx-links"><a href="/ats-checker">Free ATS checker &rarr;</a><a href="/resume-templates">Resume templates &rarr;</a><a href="/resume-examples">Resume examples &rarr;</a></div></div>'
    + (rel.length ? '<div class="gx-card"><div class="gx-label">Keep reading</div><div class="gx-links">' + rel.map(function (r) { return '<a href="' + r.href + '">' + r.text + '</a>'; }).join('') + '</div></div>' : '');

  var layout = document.createElement('div'); layout.className = 'gx-layout';
  var main = document.createElement('div'); main.className = 'gx-main';
  art.parentNode.insertBefore(layout, art);
  main.appendChild(art);
  layout.appendChild(main);
  layout.appendChild(side);
  wrap.classList.add('gx-wide');
})();
