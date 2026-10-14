/* resume-example-enhance.js, progressive UI upgrades shared by every resume-example
   page (no per-file content changes). Adds quick-fact chips to the hero, a section
   nav, one-tap copy on summary examples, and a "copy all" on the bullet list.
   Pure DOM enhancement with guards, so a page missing a piece just skips it. */
(function () {
  'use strict';
  var article = document.querySelector('.gd-wrap article');
  if (!article) return;

  function svg(paths, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var ICO_COPY = '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
  var ICO_CHECK = '<polyline points="20 6 9 17 4 12"/>';
  var ICO_COIN = '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.5a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3H14"/>';
  var ICO_DL = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';

  function copyText(btn, text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
      var old = btn.innerHTML;
      btn.innerHTML = svg(ICO_CHECK);
      setTimeout(function () { btn.innerHTML = old; }, 1500);
    }).catch(function () {});
  }

  /* 1) Quick-fact chips in the hero */
  var heroInner = document.querySelector('.gd-hero .gd-hero-inner') || document.querySelector('.gd-hero');
  if (heroInner && !heroInner.querySelector('.rx-facts')) {
    var facts = document.createElement('div');
    facts.className = 'rx-facts';
    facts.innerHTML =
      '<span class="rx-fact">' + svg(ICO_CHECK) + ' ATS-friendly</span>'
      + '<span class="rx-fact">' + svg(ICO_COIN) + ' Free, no sign-up</span>'
      + '<span class="rx-fact">' + svg(ICO_DL) + ' PDF export</span>';
    heroInner.appendChild(facts);
  }

  /* 2) Section nav from the example page's section headings */
  var slug = function (s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var secs = Array.prototype.slice.call(article.querySelectorAll('.gd-section > h2, .gd-faq > h2'));
  if (secs.length >= 3 && !article.querySelector('.rx-nav')) {
    var nav = document.createElement('nav');
    nav.className = 'rx-nav';
    nav.setAttribute('aria-label', 'On this page');
    secs.forEach(function (h) {
      var sec = h.parentElement;
      if (!sec.id) sec.id = 'rx-' + slug(h.textContent).slice(0, 40);
      var label = h.textContent.replace(/\s*resume\s*/i, ' ').replace(/\bexamples?\b/i, '').trim() || h.textContent.trim();
      var a = document.createElement('a');
      a.href = '#' + sec.id;
      a.textContent = label.length > 22 ? label.slice(0, 20) + '…' : label;
      nav.appendChild(a);
    });
    article.insertBefore(nav, article.firstChild);
  }

  /* 3) Copy button on each summary example block */
  article.querySelectorAll('.gd-example').forEach(function (ex) {
    if (ex.querySelector('.rx-copy')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rx-copy rx-copy-abs';
    btn.setAttribute('aria-label', 'Copy this example');
    btn.innerHTML = svg(ICO_COPY);
    btn.addEventListener('click', function () { copyText(btn, ex.textContent.trim()); });
    ex.appendChild(btn);
  });

  /* 4) "Copy all" on the bullet-point section */
  secs.forEach(function (h) {
    if (!/bullet/i.test(h.textContent)) return;
    var sec = h.parentElement;
    var ul = sec.querySelector('ul');
    if (!ul || sec.querySelector('.rx-copy')) return;
    var wrap = document.createElement('div');
    wrap.className = 'rx-sec-head';
    h.parentNode.insertBefore(wrap, h);
    wrap.appendChild(h);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rx-copy rx-copy-inline';
    btn.innerHTML = svg(ICO_COPY) + '<span>Copy all</span>';
    btn.addEventListener('click', function () {
      var text = Array.prototype.map.call(ul.querySelectorAll('li'), function (li) { return '• ' + li.textContent.trim(); }).join('\n');
      copyText(btn, text);
      btn.querySelector('span') && (btn.querySelector('span').textContent = 'Copied');
      setTimeout(function () { var s = btn.querySelector('span'); if (s) s.textContent = 'Copy all'; }, 1500);
    });
    wrap.appendChild(btn);
  });

  /* 5) Skills "copy all" */
  secs.forEach(function (h) {
    if (!/skill/i.test(h.textContent)) return;
    var sec = h.parentElement;
    var chips = sec.querySelector('.gd-chips');
    if (!chips || sec.querySelector('.rx-copy')) return;
    var wrap = document.createElement('div');
    wrap.className = 'rx-sec-head';
    h.parentNode.insertBefore(wrap, h);
    wrap.appendChild(h);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rx-copy rx-copy-inline';
    btn.innerHTML = svg(ICO_COPY) + '<span>Copy all</span>';
    btn.addEventListener('click', function () {
      var text = Array.prototype.map.call(chips.querySelectorAll('.gd-chip'), function (c) { return c.textContent.trim(); }).join(', ');
      copyText(btn, text);
      var s = btn.querySelector('span'); if (s) { s.textContent = 'Copied'; setTimeout(function () { s.textContent = 'Copy all'; }, 1500); }
    });
    wrap.appendChild(btn);
  });

  /* 6) Bullet cards: highlight metrics + copy each bullet */
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  var METRIC = /(\$\s?\d[\d.,]*\+?[KMB]?|\d[\d.,]*\s?%|\b\d[\d.,]*\+|\b\d[\d.,]*x\b|\b\d[\d.,]*[KMB]\b)/g;
  function highlight(text) { return esc(text).replace(METRIC, '<span class="rx-hl">$1</span>'); }
  secs.forEach(function (h) {
    if (!/bullet/i.test(h.textContent)) return;
    var bsec = h.closest('.gd-section') || h.parentElement;
    bsec.querySelectorAll('ul > li').forEach(function (li) {
      if (li.classList.contains('rx-bul')) return;
      var txt = li.textContent.trim();
      var span = document.createElement('span');
      span.className = 'rx-bul-txt';
      span.innerHTML = highlight(txt);
      li.innerHTML = '';
      li.appendChild(span);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rx-copy rx-bul-copy';
      b.setAttribute('aria-label', 'Copy this bullet');
      b.innerHTML = svg(ICO_COPY);
      b.addEventListener('click', function () { copyText(b, txt); });
      li.appendChild(b);
      li.classList.add('rx-bul');
    });
  });

  /* 7) Best-template section -> card with a clear CTA */
  secs.forEach(function (h) {
    if (!/template/i.test(h.textContent)) return;
    var sec = h.closest('.gd-section') || h.parentElement;
    var p = sec.querySelector('p');
    if (!p || sec.querySelector('.rx-tpl-card')) return;
    var a = sec.querySelector('a[href*="editor"], a[href*="login"], a[href*="mode=signup"]');
    var href = (a && a.getAttribute('href')) || '/login?mode=signup';
    var card = document.createElement('div');
    card.className = 'rx-tpl-card';
    p.parentNode.insertBefore(card, p);
    card.appendChild(p);
    var cta = document.createElement('a');
    cta.className = 'btn btn-primary';
    cta.href = href;
    cta.textContent = 'Use this template free';
    card.appendChild(cta);
  });

  /* 8) Wider layout: wrap the article in a two-column grid with a sticky sidebar
     (table of contents, build CTA, salary link, related roles). Fills the dead
     space and adds internal links. */
  (function buildSidebar() {
    var wrap = document.querySelector('main.gd-wrap');
    if (!wrap || wrap.classList.contains('rx-wide')) return;
    var art = wrap.querySelector('article');
    if (!art) return;

    var h1 = document.querySelector('.gd-hero h1') || document.querySelector('h1');
    var role = h1 ? h1.textContent.replace(/\s*resume example.*$/i, '').trim() : '';
    var roleLc = role ? role.toLowerCase() : 'resume';

    var toc = secs.map(function (h) {
      var sec = h.closest('.gd-section') || h.closest('.gd-faq');
      if (!sec) return null;
      if (!sec.id) sec.id = 'rx-' + slug(h.textContent).slice(0, 40);
      var label = h.textContent.replace(/\s*resume\s*/i, ' ').replace(/\bexamples?\b/i, '').trim() || h.textContent.trim();
      return { id: sec.id, label: label.length > 26 ? label.slice(0, 24) + '…' : label };
    }).filter(Boolean);

    var rel = [];
    document.querySelectorAll('.gd-rel a[href*="/resume-examples/"]').forEach(function (a) {
      if (rel.length < 4) rel.push({ href: a.getAttribute('href'), text: a.textContent.replace(/\s*resume example.*$/i, '').trim() });
    });

    var side = document.createElement('aside');
    side.className = 'rx-side';
    side.innerHTML =
      (toc.length >= 3 ? '<div class="rx-side-card rx-toc-card"><div class="rx-side-label">On this page</div><nav class="rx-toc" aria-label="On this page">' + toc.map(function (t) { return '<a href="#' + t.id + '">' + t.label + '</a>'; }).join('') + '</nav></div>' : '')
      + '<div class="rx-side-card rx-side-cta"><div class="rx-side-cta-h">Build your ' + roleLc + ' resume free</div><a class="btn btn-primary" href="/login?mode=signup">Use this template free</a></div>'
      + '<div class="rx-side-card"><div class="rx-side-label">Salary</div><a class="rx-side-link" href="/salary">See ' + roleLc + ' salaries &rarr;</a></div>'
      + (rel.length ? '<div class="rx-side-card"><div class="rx-side-label">Related roles</div><div class="rx-rel-links">' + rel.map(function (r) { return '<a href="' + r.href + '">' + r.text + ' &rarr;</a>'; }).join('') + '</div></div>' : '');

    var layout = document.createElement('div'); layout.className = 'rx-layout';
    var main = document.createElement('div'); main.className = 'rx-main';
    art.parentNode.insertBefore(layout, art);
    main.appendChild(art);
    layout.appendChild(main);
    layout.appendChild(side);
    wrap.classList.add('rx-wide');
  })();

  /* 9) Two-column hero: move the live resume preview up beside the title + CTAs.
     Runs before the per-page iframe-fit script, so the preview fits its new,
     narrower column on first render. Falls back to single column if anything
     is missing. */
  (function buildTwoColHero() {
    var heroInner = document.querySelector('.gd-hero .gd-hero-inner');
    if (!heroInner || heroInner.classList.contains('rx-hero2')) return;
    var rpSection = document.querySelector('.gd-answer .rp-section') || document.querySelector('.rp-section');
    if (!rpSection) return;
    var frameOuter = rpSection.querySelector('.rp-frame-outer');
    if (!frameOuter) return;

    var ctaRow = rpSection.querySelector('.rp-cta-row');
    var primaryHref = 'editor', primaryText = 'Use this template free';
    var ep = ctaRow && ctaRow.querySelector('a');
    if (ep) { primaryHref = ep.getAttribute('href') || primaryHref; primaryText = ep.textContent.trim() || primaryText; }

    var left = document.createElement('div'); left.className = 'rx-hero-left';
    var right = document.createElement('div'); right.className = 'rx-hero-right';

    // Move the existing hero contents (crumb, h1, meta, fact chips) into the left column.
    while (heroInner.firstChild) left.appendChild(heroInner.firstChild);

    // CTAs on the left (secondary styled for the dark hero).
    var cta = document.createElement('div');
    cta.className = 'rx-hero-cta';
    cta.innerHTML = '<a class="btn btn-primary" href="' + primaryHref + '">' + (primaryText || 'Use this template free') + '</a>'
      + '<a class="btn" href="/ats-checker" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.28);color:#fff;">Check your ATS score</a>';
    var facts = left.querySelector('.rx-facts');
    if (facts) left.insertBefore(cta, facts); else left.appendChild(cta);

    // Right column: the preview, minus its old heading + cta row, with a peek fade + label.
    var rpH2 = rpSection.querySelector('h2'); if (rpH2) rpH2.remove();
    if (ctaRow) ctaRow.remove();
    var fade = document.createElement('div'); fade.className = 'rx-fade';
    frameOuter.appendChild(fade);
    var label = document.createElement('span'); label.className = 'rx-live'; label.textContent = 'Live preview';
    right.appendChild(frameOuter);
    right.appendChild(label);
    rpSection.parentNode && rpSection.remove();

    heroInner.classList.add('rx-hero2');
    heroInner.appendChild(left);
    heroInner.appendChild(right);

    // Nudge the per-page fit() in case it measured before the move settled.
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 120);
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 500);
  })();
})();
