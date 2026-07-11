/* gen-rb.js, generates the public /resume-builder hub + long-tail
   "resume builder for [audience]" landing pages. Content authored per-audience
   (specific, not thin). Shell mirrors the guides (styles/topbar/footer/JSON-LD). */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TODAY = '2026-07-10';

// The subagent content escaped tags as &lt; / &gt;; turn those back into real tags.
// Leave &amp; alone so ampersands stay valid HTML.
const dt = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const esc = s => String(s == null ? '' : s).replace(/&(?!amp;|lt;|gt;|quot;|#39;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const jstr = s => JSON.stringify(String(s || '')).slice(1, -1);   // safe inside a JSON-LD string

const STYLE = `
  .gd-wrap { max-width: 760px; margin: 0 auto; padding: 28px 20px 80px; }
  .gd-crumb { font-size: 12.5px; color: var(--muted); margin-bottom: 16px; }
  .gd-crumb a { color: var(--muted); } .gd-crumb a:hover { color: var(--accent); }
  .gd-wrap h1 { font-size: clamp(28px,5vw,38px); font-weight: 700; letter-spacing:-.6px; line-height:1.15; }
  .gd-meta { color: var(--muted); font-size: 13px; margin-top: 10px; }
  .gd-answer { margin: 22px 0 8px; padding: 18px 20px; border:1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--r-md); background: var(--bg-1); box-shadow: var(--sh-1); font-size: 16px; line-height: 1.65; }
  .gd-section { margin-top: 34px; }
  .gd-section h2 { font-size: 22px; font-weight: 700; letter-spacing:-.3px; margin-bottom: 12px; }
  .gd-section p, .gd-section li { color: var(--text); line-height: 1.75; font-size: 15.5px; }
  .gd-section p { margin-bottom: 12px; } .gd-section p:last-child { margin-bottom: 0; }
  .gd-section ul, .gd-section ol { padding-left: 20px; } .gd-section li { margin-bottom: 8px; }
  .gd-section a { color: var(--accent); } .gd-section a:hover { text-decoration: underline; }
  .gd-faq { margin-top: 40px; }
  .gd-faq h2 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
  .gd-faq details { border:1px solid var(--border); border-radius: var(--r-md); background: var(--bg-1); margin-bottom: 10px; box-shadow: var(--sh-1); }
  .gd-faq summary { cursor:pointer; padding: 14px 16px; font-weight: 600; list-style:none; }
  .gd-faq summary::-webkit-details-marker { display:none; }
  .gd-faq p { margin:0; padding: 0 16px 14px; color: var(--muted); line-height: 1.65; font-size: 14.5px; }
  .gd-rel { margin-top: 44px; }
  .gd-rel h2 { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
  .gd-rel a { display:block; padding: 12px 14px; border:1px solid var(--border); border-radius: var(--r-md); margin-bottom: 8px; background: var(--bg-1); box-shadow: var(--sh-1); transition: border-color var(--dur) var(--ease); }
  .gd-rel a:hover { border-color: var(--accent); }
  .rb-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
  @media (max-width:560px){ .rb-grid { grid-template-columns: 1fr; } }
  .rb-grid a { display:block; padding: 14px 16px; border:1px solid var(--border); border-radius: var(--r-md); background: var(--bg-1); box-shadow: var(--sh-1); font-weight:600; font-size:14.5px; transition: border-color var(--dur) var(--ease); }
  .rb-grid a:hover { border-color: var(--accent); }
  .gd-final { margin-top: 46px; text-align:center; padding: 34px 20px; border:1px solid var(--border); border-radius: var(--r-lg); background: linear-gradient(180deg, rgba(99,102,241,.08), var(--bg-1)); box-shadow: var(--sh-1); }
  .gd-final h2 { font-size: 22px; font-weight: 700; } .gd-final p { color: var(--muted); margin: 8px 0 16px; }`;

function faqLd(faq) {
  return `<script type="application/ld+json">\n{\n  "@context":"https://schema.org","@type":"FAQPage","mainEntity":[\n${
    faq.map(f => `    {"@type":"Question","name":"${jstr(f.q)}","acceptedAnswer":{"@type":"Answer","text":"${jstr(f.a)}"}}`).join(',\n')
  }\n  ]\n}\n</script>`;
}
function crumbLd(crumbs) {
  return `<script type="application/ld+json">\n{\n  "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[\n${
    crumbs.map((c, i) => `    {"@type":"ListItem","position":${i + 1},"name":"${jstr(c.name)}","item":"${c.url}"}`).join(',\n')
  }\n  ]\n}\n</script>`;
}

function page(p) {
  const url = `https://appliohq.com/${p.slug}`;
  const crumbs = [{ name: 'Home', url: 'https://appliohq.com/' }].concat(p.crumbParent || []).concat([{ name: p.h1, url }]);
  const sections = p.sections.map(s => `    <section class="gd-section"><h2>${esc(s.h2)}</h2>${dt(s.bodyHtml)}</section>`).join('\n');
  const rel = p.related && p.related.length
    ? `\n<div class="gd-rel"><h2>Keep going</h2>\n${p.related.map(r => `<a href="${r.href}">${esc(r.label)}</a>`).join('\n')}\n</div>` : '';
  const crumbNav = `<a href="/">Home</a> › ` + (p.crumbNav || '') + esc(p.h1);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.metaDescription)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#4f46e5">
<meta property="og:title" content="${esc(p.ogTitle || p.h1)}">
<meta property="og:description" content="${esc(p.metaDescription)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://appliohq.com/logo.jpeg">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
{
  "@context":"https://schema.org","@type":"Article",
  "headline":"${jstr(p.h1)}",
  "description":"${jstr(p.metaDescription)}",
  "url":"${url}","datePublished":"${TODAY}","dateModified":"${TODAY}","inLanguage":"en",
  "speakable":{"@type":"SpeakableSpecification","cssSelector":["h1",".gd-answer"]},
  "author":{"@type":"Organization","name":"Applio"},
  "publisher":{"@type":"Organization","name":"Applio","logo":{"@type":"ImageObject","url":"https://appliohq.com/logo.jpeg"}},
  "mainEntityOfPage":"${url}"
}
</script>
${crumbLd(crumbs)}
${faqLd(p.faq)}
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
<style>${STYLE}</style>
</head>
<body class="app-body-scroll">
<header class="app-topbar">
<a href="/" class="brand"><img src="/logo.jpeg" class="brand-logo" alt="Applio"><span>Applio</span></a>
<div class="topbar-right">
<a class="btn btn-ghost btn-sm" href="/login">Sign in</a>
<a class="btn btn-primary btn-sm" href="/login?mode=signup">Build resume free</a>
</div>
</header>
<main class="gd-wrap">
<nav class="gd-crumb">${crumbNav}</nav>
<article>
<h1>${esc(p.h1)}</h1>
<div class="gd-meta">Updated ${TODAY} · Applio</div>
<div class="gd-answer">${dt(p.answer)}</div>
${sections}
<section class="gd-faq">
<h2>Frequently asked questions</h2>
${p.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
</section>
</article>${rel}
<div class="gd-final">
<h2>${esc(p.finalTitle || 'Build a resume that gets interviews')}</h2>
<p>${esc(p.finalSub || 'Free to start, no credit card. Pick a template, import or type your details, and export a clean PDF.')}</p>
<a class="btn btn-primary" href="${(p.finalCta && p.finalCta.href) || '/login?mode=signup'}">${esc((p.finalCta && p.finalCta.label) || 'Start free →')}</a>
</div>
</main>
<script src="/js/footer.js"></script>
</body>
</html>
`;
}

// ---- shared related-link building blocks ----
const relHub = { label: 'Free Resume Builder (all templates)', href: '/resume-builder' };
const relExamples = { label: 'Resume examples by job title', href: '/resume-examples' };
const relGuides = { label: 'All resume & job-search guides', href: '/guides' };

module.exports = { page, dt, esc };
