#!/usr/bin/env node
/* Generates /resume-templates/<id>.html landing pages + hub + sitemap entries.
   Run from repo root: node scratchpad/gen-template-pages.js  */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'resume-templates');
const BASE = 'https://appliohq.com';

// Per-template SEO copy. name/cat mirror TEMPLATE_DEFS in js/templates.js.
const T = [
  { id:'harvard', name:'Harvard', cat:'Students', kw:'Harvard resume template',
    tagline:'The clean, centered, serif format used in the Harvard Business School resume guide.',
    bestFor:['Students and new grads','MBA and graduate applications','Consulting and finance internships','Anyone who wants a timeless, no-frills look'],
    why:'A centered name, full-width ruled section headers, and a classic serif typeface make this the most widely recommended academic format. It is deliberately plain so recruiters and ATS parsers focus on your content, not the design.' },
  { id:'stanford', name:'Stanford', cat:'Students', kw:'Stanford resume template',
    tagline:'An airy, left-aligned, sans-serif layout with generous whitespace.',
    bestFor:['Students and early-career candidates','Tech, product, and design roles','Anyone who prefers a modern minimalist look'],
    why:'Bold left-aligned name, letter-spaced section labels, and open spacing give a modern, confident feel while staying completely ATS-parseable.' },
  { id:'modern', name:'Modern', cat:'Students', kw:'modern resume template',
    tagline:'A contemporary two-tone header with a color accent bar.',
    bestFor:['Students and career switchers','Marketing, product, and startup roles','Anyone who wants a pop of color without clutter'],
    why:'A colored header block draws the eye to your name and title while the body stays clean and scannable.' },
  { id:'minimal', name:'Minimal', cat:'Students', kw:'minimalist resume template',
    tagline:'Pure typography, no rules or color, maximum readability.',
    bestFor:['Students and academics','Roles that value substance over style','Anyone submitting to strict ATS systems'],
    why:'Nothing but well-set type and spacing, so every applicant tracking system parses it perfectly.' },
  { id:'consulting', name:'Consulting', cat:'Business', kw:'consulting resume template',
    tagline:'The structured, results-forward format favored by MBB firms.',
    bestFor:['Management consulting applications (McKinsey, BCG, Bain)','MBA candidates','Strategy and operations roles'],
    why:'Tight structure, clear section hierarchy, and room for quantified impact match exactly what consulting recruiters scan for.' },
  { id:'executive', name:'Executive', cat:'Business', kw:'executive resume template',
    tagline:'A commanding senior-leadership layout with prominent titles.',
    bestFor:['Directors, VPs, and C-suite candidates','Senior managers','Board and advisory roles'],
    why:'Emphasizes titles, scope, and outcomes so senior leadership reads at a glance.' },
  { id:'professional', name:'Professional', cat:'Business', kw:'professional resume template',
    tagline:'A polished corporate header with a subtle accent line.',
    bestFor:['Corporate and operations roles','Finance, HR, and project management','Anyone in a traditional industry'],
    why:'A refined header and conservative body signal reliability and fit for corporate environments.' },
  { id:'classic', name:'Classic', cat:'Business', kw:'classic resume template',
    tagline:'A timeless single-column format that never goes out of style.',
    bestFor:['Any industry or seniority','Traditional and government applications','Anyone who wants a safe, proven layout'],
    why:'A straightforward single column keeps the focus on experience and is universally accepted by ATS.' },
  { id:'elegant', name:'Elegant', cat:'Business', kw:'elegant resume template',
    tagline:'A refined dark header with graceful typography.',
    bestFor:['Client-facing and brand roles','Hospitality, law, and real estate','Anyone who wants understated sophistication'],
    why:'A tasteful dark header adds personality while the body stays formal and easy to scan.' },
  { id:'ivory', name:'Ivory', cat:'Business', kw:'sidebar resume template',
    tagline:'A clean two-column layout with a soft light-gray sidebar.',
    bestFor:['Corporate, product, and operations roles','Marketing, HR, and finance','Anyone who wants a modern two-column look that stays conservative'],
    why:'A light sidebar holds your contact, skills, and education while the main column leads with impact — the polished two-column format most modern resumes use, kept fully ATS-parseable with real, selectable text.' },
  { id:'jake', name:"Jake's Resume", cat:'Technology', kw:"Jake's resume template",
    tagline:'The single-page engineering favorite: centered name, pipe-separated contact, ruled sections.',
    bestFor:['Software engineers and CS students','New-grad and internship applications','Anyone who wants the popular LaTeX look without LaTeX'],
    why:'Inspired by the widely shared engineering resume, it packs experience, projects, and skills into one clean, ATS-friendly page.' },
  { id:'faang', name:'FAANG', cat:'Technology', kw:'FAANG resume template',
    tagline:'A metrics-first layout built for big-tech hiring bars.',
    bestFor:['Software, data, and ML engineers','Big-tech and high-growth startup roles','Anyone optimizing for impact and scale'],
    why:'Leads with quantified impact and technical depth, mirroring how big-tech recruiters and ATS rank candidates.' },
  { id:'deedy', name:'Deedy', cat:'Technology', kw:'Deedy resume template',
    tagline:'The iconic two-column engineering résumé with a name banner and skills sidebar.',
    bestFor:['Software engineers and CS students','New-grad and internship applications','Anyone who wants the popular two-column tech layout'],
    why:'Modeled on the widely shared Deedy résumé: a bold name banner over a narrow Education and Skills column beside a wide Experience column. Distinctive yet single-page and ATS-parseable with real, selectable text.' },
  { id:'creative', name:'Creative', cat:'Creative', kw:'creative resume template',
    tagline:'An expressive layout with color and personality, still recruiter-safe.',
    bestFor:['Designers, marketers, and content creators','Agencies and startups','Anyone in a visual field'],
    why:'Adds visual character without breaking the parseable structure ATS systems need.' },
  { id:'slate', name:'Slate', cat:'Creative', kw:'slate resume template',
    tagline:'A cool, sidebar-style layout with a modern palette.',
    bestFor:['Designers and product people','Portfolio-driven roles','Anyone who wants a sidebar for skills'],
    why:'A sidebar organizes skills and contact info while the main column tells your story.' },
  { id:'onyx', name:'Onyx', cat:'Creative', kw:'onyx resume template',
    tagline:'A bold dark-accent header with striking contrast.',
    bestFor:['Creative and brand roles','Standout applications','Anyone who wants a confident first impression'],
    why:'High contrast makes your name and headline pop while keeping the body readable.' },
  { id:'compact', name:'Compact', cat:'Creative', kw:'compact resume template',
    tagline:'A dense, efficient layout that fits more on one page.',
    bestFor:['Experienced candidates with a lot to say','Roles requiring one-page resumes','Anyone consolidating a long history'],
    why:'Tight spacing fits more experience per page without sacrificing readability.' },
  { id:'timeline', name:'Timeline', cat:'Creative', kw:'timeline resume template',
    tagline:'A single-column layout where every role is a milestone on a vertical timeline.',
    bestFor:['Candidates with a clear career progression','Design, product, and startup roles','Anyone who wants a distinctive but ATS-safe format'],
    why:'A continuous rail with a dot at each role turns your history into a visual timeline that stands out, while staying single-column with selectable text so applicant tracking systems parse it cleanly.' },
];

const byId = Object.fromEntries(T.map(t => [t.id, t]));

function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

function faqs(t){
  return [
    { q:`Is the ${t.name} resume template free?`,
      a:`Yes. You can build a resume with the ${t.name} template completely free in Applio, customize the colors and fonts, and download it. No credit card is required to start.` },
    { q:`Is the ${t.name} template ATS-friendly?`,
      a:`Yes. The ${t.name} template uses a clean, single-flow structure with standard section headings, so Applicant Tracking Systems can parse every line. Applio also includes a free ATS checker to score your resume against any job.` },
    { q:`Who should use the ${t.name} resume template?`,
      a:`${t.bestFor.slice(0,3).join(', ')}. ${t.why}` },
    { q:`Can I customize the ${t.name} template?`,
      a:`Absolutely. In the Applio editor you can change the accent color, fonts, spacing, and section order, then export to PDF, HTML, or plain text.` },
  ];
}

function related(t){
  return T.filter(x => x.cat === t.cat && x.id !== t.id).slice(0,3);
}

function pageHTML(t){
  const url = `${BASE}/resume-templates/${t.id}`;
  // Avoid "Jake's Resume Resume Template" when the name already ends in "Resume"
  const label = /resume$/i.test(t.name) ? `${t.name} Template` : `${t.name} Resume Template`;
  const title = `${label} — Free & ATS-Friendly | Applio`;
  const desc = `${t.tagline} Build a ${t.name} resume free with Applio: customize colors and fonts, keep it ATS-friendly, and export to PDF. No sign-up to start.`;
  const fq = faqs(t);
  const rel = related(t);
  const ld = [
    { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${BASE}/`},
      {"@type":"ListItem","position":2,"name":"Resume Templates","item":`${BASE}/resume-templates`},
      {"@type":"ListItem","position":3,"name":`${t.name} Template`,"item":url}
    ]},
    { "@context":"https://schema.org","@type":"FAQPage","mainEntity":fq.map(f=>(
      {"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}}))},
    { "@context":"https://schema.org","@type":"WebPage","name":title,"url":url,"description":desc,
      "isPartOf":{"@type":"WebSite","name":"Applio","url":`${BASE}/`},
      "about":{"@type":"CreativeWork","name":`${t.name} resume template`} }
  ];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#6366f1">
<meta property="og:title" content="${esc(label)} — Free & ATS-Friendly">
<meta property="og:description" content="${esc(t.tagline)} Build it free with Applio and export to PDF.">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/logo.jpeg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(label)} — Free & ATS-Friendly">
<meta name="twitter:description" content="${esc(t.tagline)} Build it free with Applio.">
<meta name="twitter:image" content="${BASE}/logo.jpeg">
${ld.map(o=>`<script type="application/ld+json">\n${JSON.stringify(o,null,2)}\n</script>`).join('\n')}
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
<style>
  .tp-wrap { max-width: 1000px; margin: 0 auto; padding: 28px 20px 80px; }
  .tp-crumb { font-size: 12.5px; color: var(--muted); margin-bottom: 18px; }
  .tp-crumb a { color: var(--muted); } .tp-crumb a:hover { color: var(--accent); }
  .tp-hero { display: grid; grid-template-columns: 1.05fr 1fr; gap: 32px; align-items: center; }
  @media (max-width: 800px) { .tp-hero { grid-template-columns: 1fr; } }
  .tp-cat { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
  .tp-hero h1 { font-size: clamp(28px, 5vw, 40px); font-weight: 800; letter-spacing: -1px; line-height: 1.1; }
  .tp-lede { color: var(--muted); font-size: 16px; line-height: 1.6; margin: 14px 0 22px; }
  .tp-cta { display: flex; gap: 12px; flex-wrap: wrap; }
  .tp-preview { position: relative; border-radius: var(--r-lg); overflow: hidden; box-shadow: var(--sh-3), var(--hi); border: 1px solid var(--border); aspect-ratio: 8.5/11; background:#fff; }
  .tp-preview iframe { position:absolute; top:0; left:0; width:816px; height:1056px; border:0; transform-origin: top left; }
  .tp-section { margin-top: 56px; }
  .tp-section h2 { font-size: 24px; font-weight: 800; letter-spacing: -.4px; margin-bottom: 14px; }
  .tp-best { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
  @media (max-width: 620px){ .tp-best { grid-template-columns: 1fr; } }
  .tp-best li { display:flex; gap:10px; align-items:flex-start; color: var(--text); font-size: 14.5px; }
  .tp-best li::before { content:"✓"; color: var(--success); font-weight: 800; }
  .tp-body p { color: var(--muted); line-height: 1.75; font-size: 15.5px; margin-bottom: 12px; }
  .tp-faq details { border:1px solid var(--border); border-radius: var(--r-md); background: var(--bg-1); margin-bottom: 10px; box-shadow: var(--sh-1); }
  .tp-faq summary { cursor:pointer; padding: 14px 16px; font-weight: 600; list-style:none; }
  .tp-faq summary::-webkit-details-marker { display:none; }
  .tp-faq p { margin:0; padding: 0 16px 14px; color: var(--muted); line-height: 1.65; font-size: 14.5px; }
  .tp-rel { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
  @media (max-width: 620px){ .tp-rel { grid-template-columns: 1fr; } }
  .tp-rel a { display:block; padding: 16px; border:1px solid var(--border); border-radius: var(--r-md); background: var(--bg-1); box-shadow: var(--sh-1), var(--hi); transition: transform var(--dur) var(--ease), border-color var(--dur) var(--ease); }
  .tp-rel a:hover { transform: translateY(-2px); border-color: var(--accent); }
  .tp-rel .n { font-weight: 700; } .tp-rel .d { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .tp-final { margin-top: 60px; text-align:center; padding: 40px 20px; border:1px solid var(--border); border-radius: var(--r-lg); background: linear-gradient(180deg, rgba(99,102,241,.08), var(--bg-1)); box-shadow: var(--sh-1); }
  .tp-final h2 { font-size: 26px; font-weight: 800; }
  .tp-final p { color: var(--muted); margin: 8px 0 18px; }
</style>
</head>
<body class="app-body-scroll">
<header class="app-topbar">
  <a href="/" class="brand"><img src="/logo.jpeg" class="brand-logo" alt="Applio"><span>Applio</span></a>
  <div class="topbar-right">
    <a class="btn btn-ghost btn-sm" href="/login">Sign in</a>
    <a class="btn btn-primary btn-sm" href="/login?mode=signup&tpl=${t.id}">Use this template free</a>
  </div>
</header>

<main class="tp-wrap">
  <nav class="tp-crumb"><a href="/">Home</a> › <a href="/resume-templates">Resume Templates</a> › ${esc(t.name)}</nav>

  <section class="tp-hero">
    <div>
      <div class="tp-cat">${esc(t.cat)} · Free template</div>
      <h1>${esc(label)}</h1>
      <p class="tp-lede">${esc(t.tagline)} Build it free with Applio, customize the colors and fonts, keep it ATS-friendly, and export to PDF in one click.</p>
      <div class="tp-cta">
        <a class="btn btn-primary" href="/login?mode=signup&tpl=${t.id}">Use this template free →</a>
        <a class="btn btn-secondary" href="/ats-checker">Check your ATS score</a>
      </div>
    </div>
    <div class="tp-preview" id="tp-preview"><iframe id="tp-frame" scrolling="no" title="${esc(t.name)} resume template preview"></iframe></div>
  </section>

  <section class="tp-section">
    <h2>Best for</h2>
    <ul class="tp-best">${t.bestFor.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>
  </section>

  <section class="tp-section tp-body">
    <h2>Why the ${esc(t.name)} template works</h2>
    <p>${esc(t.why)}</p>
    <p>Every Applio template is built to pass Applicant Tracking Systems: standard section headings, a clean single flow, and real selectable text (never an image), so recruiters' software reads every line. Around 70% of resumes are filtered out before a human sees them, so a parseable layout like this one matters as much as what you write.</p>
  </section>

  <section class="tp-section tp-faq">
    <h2>${esc(t.name)} template — FAQ</h2>
    ${fq.map(f=>`<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </section>

  <section class="tp-section">
    <h2>Related ${esc(t.cat.toLowerCase())} templates</h2>
    <div class="tp-rel">
      ${rel.map(r=>`<a href="/resume-templates/${r.id}"><div class="n">${esc(r.name)}</div><div class="d">${esc(r.tagline)}</div></a>`).join('\n      ')}
    </div>
  </section>

  <section class="tp-final">
    <h2>Build your ${esc(t.name)} resume free</h2>
    <p>Pick the ${esc(t.name)} template, add your experience, and let Applio's AI tailor it to any job.</p>
    <a class="btn btn-primary" href="/login?mode=signup&tpl=${t.id}">Start free — no credit card</a>
  </section>
</main>

<script src="/js/icons.js"></script>
<script src="/js/templates.js"></script>
<script>
  (function(){
    try {
      var frame = document.getElementById('tp-frame');
      var html = renderTemplate('${t.id}', {}, true, '#6366f1');
      writeResumeFrame(frame, html, 816);
      function fit(){ var w = document.getElementById('tp-preview').clientWidth; frame.style.transform = 'scale(' + (w/816) + ')'; }
      fit(); window.addEventListener('resize', fit);
    } catch(e){ document.getElementById('tp-preview').style.display='none'; }
  })();
</script>
<script src="/js/footer.js"></script>
</body>
</html>`;
}

function hubHTML(){
  const url = `${BASE}/resume-templates`;
  const cats = ['Students','Business','Technology','Creative'];
  const ld = [
    { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${BASE}/`},
      {"@type":"ListItem","position":2,"name":"Resume Templates","item":url}
    ]},
    { "@context":"https://schema.org","@type":"CollectionPage","name":"Free Resume Templates","url":url,
      "description":`${T.length} free, ATS-friendly resume templates you can customize and download.`,
      "hasPart": T.map(t=>({"@type":"CreativeWork","name":`${t.name} resume template`,"url":`${BASE}/resume-templates/${t.id}`})) }
  ];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${T.length} Free ATS-Friendly Resume Templates | Applio</title>
<meta name="description" content="Browse ${T.length} free, ATS-friendly resume templates — Harvard, Stanford, Jake's Resume, FAANG, Consulting and more. Customize colors and fonts and export to PDF, no sign-up to start.">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#6366f1">
<meta property="og:title" content="${T.length} Free ATS-Friendly Resume Templates | Applio">
<meta property="og:description" content="Harvard, Stanford, Jake's Resume, FAANG, Consulting and more — free and ATS-friendly.">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/logo.jpeg">
<meta name="twitter:card" content="summary_large_image">
${ld.map(o=>`<script type="application/ld+json">\n${JSON.stringify(o,null,2)}\n</script>`).join('\n')}
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
<style>
  .th-wrap { max-width: 1080px; margin: 0 auto; padding: 40px 20px 80px; }
  .th-head { text-align:center; margin-bottom: 40px; }
  .th-head h1 { font-size: clamp(30px,5vw,44px); font-weight: 800; letter-spacing:-1px; }
  .th-head p { color: var(--muted); font-size: 17px; max-width: 640px; margin: 12px auto 0; line-height:1.6; }
  .th-cat { font-size: 12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin: 34px 0 14px; display:flex; align-items:center; gap:10px; }
  .th-cat::after { content:""; flex:1; height:1px; background: var(--border); }
  .th-grid { display:grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
  @media (max-width: 900px){ .th-grid { grid-template-columns: repeat(2,1fr);} }
  @media (max-width: 520px){ .th-grid { grid-template-columns: 1fr;} }
  .th-card { display:block; border:1px solid var(--border); border-radius: var(--r-lg); overflow:hidden; background: var(--bg-1); box-shadow: var(--sh-1), var(--hi); transition: transform var(--dur) var(--ease), border-color var(--dur) var(--ease); }
  .th-card:hover { transform: translateY(-3px); border-color: var(--accent); }
  .th-thumb { position:relative; aspect-ratio: 5/4; overflow:hidden; background:#fff; border-bottom:1px solid var(--border); }
  .th-thumb iframe { position:absolute; top:0; left:0; width:816px; height:1056px; border:0; transform-origin: top left; }
  .th-foot { padding: 12px 14px; }
  .th-foot .n { font-weight:700; }
  .th-foot .d { color: var(--muted); font-size:12.5px; margin-top:3px; line-height:1.45; }
</style>
</head>
<body class="app-body-scroll">
<header class="app-topbar">
  <a href="/" class="brand"><img src="/logo.jpeg" class="brand-logo" alt="Applio"><span>Applio</span></a>
  <div class="topbar-right">
    <a class="btn btn-ghost btn-sm" href="/login">Sign in</a>
    <a class="btn btn-primary btn-sm" href="/login?mode=signup">Build resume free</a>
  </div>
</header>
<main class="th-wrap">
  <div class="th-head">
    <h1>Free Resume Templates</h1>
    <p>${T.length} professional, ATS-friendly resume templates. Pick one, customize the colors and fonts, and export to PDF — free, no sign-up to start.</p>
  </div>
  ${cats.map(c=>`
  <div class="th-cat">${c}</div>
  <div class="th-grid">
    ${T.filter(t=>t.cat===c).map(t=>`
    <a class="th-card" href="/resume-templates/${t.id}">
      <div class="th-thumb"><iframe scrolling="no" data-tpl="${t.id}" title="${esc(t.name)} preview"></iframe></div>
      <div class="th-foot"><div class="n">${esc(t.name)}</div><div class="d">${esc(t.tagline)}</div></div>
    </a>`).join('')}
  </div>`).join('')}
</main>
<script src="/js/icons.js"></script>
<script src="/js/templates.js"></script>
<script>
  (function(){
    document.querySelectorAll('iframe[data-tpl]').forEach(function(frame){
      try {
        var html = renderTemplate(frame.getAttribute('data-tpl'), {}, true, '#6366f1');
        writeResumeFrame(frame, html, 816);
        var thumb = frame.parentElement;
        function fit(){ frame.style.transform = 'scale(' + (thumb.clientWidth/816) + ')'; }
        fit(); window.addEventListener('resize', fit);
      } catch(e){}
    });
  })();
</script>
<script src="/js/footer.js"></script>
</body>
</html>`;
}

// ---- write files ----
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
let written = [];
for (const t of T) { fs.writeFileSync(path.join(OUT, `${t.id}.html`), pageHTML(t)); written.push(`/resume-templates/${t.id}`); }
fs.writeFileSync(path.join(OUT, 'index.html'), hubHTML());
written.unshift('/resume-templates');

// ---- update sitemap.xml ----
const smPath = path.join(ROOT, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
const today = new Date().toISOString().slice(0,10);
const urls = written.map(u=>`  <url>\n    <loc>${BASE}${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`).join('\n');
// remove any prior template URLs to stay idempotent
sm = sm.replace(/\s*<url>\s*<loc>https:\/\/appliohq\.com\/resume-templates[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
sm = sm.replace('</urlset>', urls + '\n</urlset>');
fs.writeFileSync(smPath, sm);

console.log('Wrote ' + (T.length) + ' template pages + hub. Sitemap now lists:');
console.log([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]).join('\n'));
