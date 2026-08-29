#!/usr/bin/env node
/* Generates root-level competitor-alternative pages (e.g. /rezi-alternative) + a hub,
   and updates sitemap.xml. Captures "[competitor] alternative" search + AI-citation
   intent. Content is FACTUAL and FAIR: it states each competitor's genuine positioning,
   includes a "what they do well" section, and dates the comparison, never fabricated
   claims or disparagement (which hurts trust and rankings). Applio rows are concrete
   and verifiable. Run from repo root:  node scripts/gen-compare.js */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BASE = 'https://appliohq.com';
const TODAY = new Date().toISOString().slice(0, 10);
const MONTH = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

// Feature rows compared. Each competitor gives its own cell text (kept general and
// non-defamatory). Applio cells are concrete and true.
const ROWS = [
  { label: 'Free ATS score against a job posting', applio: 'Yes, free, no sign-up' },
  { label: 'Build and export a real resume for free', applio: 'Yes, 10 free PDF downloads, no card' },
  { label: 'AI tailoring to a specific job', applio: 'Yes' },
  { label: 'Cover letter generator', applio: 'Yes' },
  { label: 'AI interview prep (practice + feedback)', applio: 'Yes, free' },
  { label: 'Career tools beyond the resume', applio: 'Skill Gap, Brag Doc, First 90 Days, Salary Insights' },
  { label: 'Watermark-free export on every plan', applio: 'Yes' },
  { label: 'Price to unlock all AI writing', applio: '$4.99/mo, or $39.99 once (lifetime)' },
];

const C = [
  {
    slug: 'rezi-alternative', name: 'Rezi',
    meta: 'Looking for a Rezi alternative? Applio is a free, ATS-focused AI resume builder with a free ATS checker, AI tailoring, and career tools. Compare Applio vs Rezi.',
    lede: 'Applio is a strong free alternative to Rezi for anyone who wants an ATS-optimized resume without paying up front. Like Rezi, Applio focuses on getting past Applicant Tracking Systems, but it adds a free ATS checker (no sign-up), free resume building and export, AI tailoring, and career tools that go beyond the resume.',
    positioning: 'Rezi is a well-known AI resume builder centered on ATS optimization, with a keyword-focused editor and its own ATS score. It offers a limited free plan and a paid subscription (and a lifetime option) to unlock its full AI and unlimited use.',
    cells: {
      'Free ATS score against a job posting': 'Built-in ATS score (account-based)',
      'Build and export a real resume for free': 'Free plan with limits',
      'AI tailoring to a specific job': 'Yes (paid AI credits/plan)',
      'Cover letter generator': 'Yes',
      'AI interview prep (practice + feedback)': 'Limited / not the focus',
      'Career tools beyond the resume': 'Primarily resume + cover letter',
      'Watermark-free export on every plan': 'Depends on plan',
      'Price to unlock all AI writing': 'Subscription or lifetime (see their site)'
    },
    goodAt: 'Rezi is a solid, focused tool if you want an ATS-first editor with real-time keyword feedback and do not mind a paid plan for full AI. Its ATS score and keyword targeting are its strengths.',
    faq: [
      { q: 'Is Applio a good free Rezi alternative?', a: 'Yes. Applio lets you build and export a resume for free and check your ATS score against any job posting without signing up, then unlock all AI writing for a low monthly or one-time price. It also adds interview prep and career tools Rezi does not focus on.' },
      { q: 'Is Applio free and Rezi paid?', a: 'Applio is free to build and export a resume (10 downloads, no credit card) and free to check your ATS score. Both tools charge to unlock unlimited AI writing; Applio offers a $39.99 one-time lifetime option in addition to a monthly plan.' },
      { q: 'Does Applio have an ATS score like Rezi?', a: 'Yes. Applio scores your resume against a specific job description and lists the exact missing keywords and fixes, and the checker is free with no sign-up.' }
    ]
  },
  {
    slug: 'teal-alternative', name: 'Teal',
    meta: 'Looking for a Teal alternative? Applio is a free AI resume builder with a free ATS checker, AI tailoring, cover letters, and career tools. Compare Applio vs Teal.',
    lede: 'Applio is a focused free alternative to Teal for building a strong, ATS-ready resume. Teal is known for its Chrome extension and job-application tracker; Applio keeps a built-in job tracker but leads with a free ATS checker, AI tailoring, and one-click application tools that turn a job posting into a tailored resume and cover letter.',
    positioning: 'Teal is a popular career platform built around a Chrome extension and a job-application tracker, with a resume builder and AI features. Its deeper AI and some resume features sit behind a Teal+ subscription.',
    cells: {
      'Free ATS score against a job posting': 'Match score in-app',
      'Build and export a real resume for free': 'Free plan with limits',
      'AI tailoring to a specific job': 'Yes (Teal+ for full AI)',
      'Cover letter generator': 'Yes (Teal+)',
      'AI interview prep (practice + feedback)': 'Not the focus',
      'Career tools beyond the resume': 'Job tracker + Chrome extension',
      'Watermark-free export on every plan': 'Depends on plan',
      'Price to unlock all AI writing': 'Subscription (see their site)'
    },
    goodAt: 'Teal is excellent if your priority is capturing and tracking lots of job listings from around the web via its Chrome extension and keeping everything organized in one board. Its tracker and browser workflow are its standout features.',
    faq: [
      { q: 'Is Applio a good free Teal alternative?', a: 'Yes, especially if you want AI resume tailoring and a free ATS check without a subscription. Applio includes a job tracker too, plus interview prep and career tools, and its core building and ATS scoring are free.' },
      { q: 'Does Applio have a job tracker like Teal?', a: 'Yes. Applio has a built-in job tracker to save postings and track application status. Teal leans more on its Chrome extension for capturing listings; Applio focuses on turning a posting into a tailored resume and cover letter.' },
      { q: 'Is Applio cheaper than Teal?', a: 'Applio is free to build and export a resume and to check your ATS score. To unlock all AI writing, Applio offers a $4.99/month plan or a $39.99 one-time lifetime option; check Teal\'s site for its current pricing.' }
    ]
  },
  {
    slug: 'zety-alternative', name: 'Zety',
    meta: 'Looking for a Zety alternative? Applio is a free AI resume builder with a free ATS checker, AI tailoring, and no download paywall surprises. Compare Applio vs Zety.',
    lede: 'Applio is a genuinely free alternative to Zety. Zety is known for its polished templates and resume examples, but downloading often requires a paid subscription. Applio lets you build and export a real resume for free, check your ATS score with no sign-up, and use AI to tailor your resume to any job.',
    positioning: 'Zety is a widely used resume builder with a large template and examples library and a guided editor. It typically operates on a trial-then-subscription model, and exporting or downloading generally requires a paid plan.',
    cells: {
      'Free ATS score against a job posting': 'Not a core feature',
      'Build and export a real resume for free': 'Download usually needs a paid plan',
      'AI tailoring to a specific job': 'Content suggestions',
      'Cover letter generator': 'Yes (paid)',
      'AI interview prep (practice + feedback)': 'Not the focus',
      'Career tools beyond the resume': 'Templates + examples library',
      'Watermark-free export on every plan': 'Paid plan',
      'Price to unlock all AI writing': 'Subscription (see their site)'
    },
    goodAt: 'Zety has a large, well-designed template and examples library and a friendly step-by-step editor, which many people find easy to start with.',
    faq: [
      { q: 'Is Applio really free, unlike Zety?', a: 'Yes. Applio lets you build and export a resume for free (10 downloads, no credit card) and check your ATS score with no sign-up. Zety generally requires a paid plan to download your finished resume.' },
      { q: 'Does Applio have resume examples and templates like Zety?', a: 'Yes. Applio has 18 ATS-friendly templates and a growing library of resume examples by job title, all usable for free.' },
      { q: 'Is Applio a good Zety alternative for ATS?', a: 'Yes. Applio adds a free ATS checker that scores your resume against a specific job and lists the missing keywords, which is a stronger ATS focus than Zety\'s template-first approach.' }
    ]
  }
];

function pageHTML(c){
  const title = `${c.name} Alternative: Applio (Free AI Resume Builder)`;
  const url = `${BASE}/${c.slug}`;
  const ld = [
    { "@context":"https://schema.org","@type":"Article","headline":title,"description":c.meta,"url":url,
      "datePublished":TODAY,"dateModified":TODAY,"inLanguage":"en","author":{"@type":"Organization","name":"Applio"},
      "publisher":{"@type":"Organization","name":"Applio","logo":{"@type":"ImageObject","url":`${BASE}/logo.jpeg`}},"mainEntityOfPage":url },
    { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${BASE}/`},
      {"@type":"ListItem","position":2,"name":"Compare","item":`${BASE}/compare`},
      {"@type":"ListItem","position":3,"name":`${c.name} Alternative`,"item":url} ]},
    { "@context":"https://schema.org","@type":"FAQPage","mainEntity":c.faq.map(f=>(
      {"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}})) }
  ];
  const rows = ROWS.map(r=>`<tr><td>${esc(r.label)}</td><td class="cmp-us">${esc(r.applio)}</td><td>${esc(c.cells[r.label]||'-')}</td></tr>`).join('\n        ');
  const others = C.filter(x=>x.slug!==c.slug);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | Applio</title>
<meta name="description" content="${esc(c.meta)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#6366f1">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(c.meta)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/logo.jpeg">
<meta name="twitter:card" content="summary_large_image">
${ld.map(o=>`<script type="application/ld+json">\n${JSON.stringify(o,null,2)}\n</script>`).join('\n')}
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
<style>
  .cmp-wrap { max-width: 820px; margin: 0 auto; padding: 28px 20px 80px; }
  .cmp-crumb { font-size: 12.5px; color: var(--muted); margin-bottom: 16px; }
  .cmp-crumb a { color: var(--muted); } .cmp-crumb a:hover { color: var(--accent); }
  .cmp-wrap h1 { font-size: clamp(26px,5vw,36px); font-weight: 800; letter-spacing:-.5px; line-height:1.15; }
  .cmp-meta { color: var(--muted); font-size: 13px; margin-top: 10px; }
  .cmp-answer { margin: 20px 0 8px; padding: 18px 20px; border:1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--r-md); background: var(--bg-1); font-size: 16px; line-height: 1.65; }
  .cmp-section { margin-top: 34px; }
  .cmp-section h2 { font-size: 22px; font-weight: 800; letter-spacing:-.3px; margin-bottom: 12px; }
  .cmp-section p, .cmp-section li { color: var(--text); line-height: 1.7; font-size: 15.5px; }
  .cmp-table-wrap { overflow-x:auto; }
  table.cmp { width:100%; border-collapse: collapse; font-size: 14px; margin-top: 8px; min-width: 480px; }
  table.cmp th, table.cmp td { text-align:left; padding: 11px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
  table.cmp thead th { font-size: 12px; text-transform: uppercase; letter-spacing:.05em; color: var(--muted); background: var(--bg-2); }
  table.cmp td.cmp-us { color: var(--accent); font-weight: 650; }
  table.cmp th.cmp-us { color: var(--accent); }
  .cmp-note { font-size: 11.5px; color: var(--muted); margin-top: 10px; line-height:1.5; }
  .cmp-faq { margin-top: 40px; } .cmp-faq h2 { font-size: 22px; font-weight: 800; margin-bottom: 12px; }
  .cmp-faq details { border:1px solid var(--border); border-radius: var(--r-md); background: var(--bg-1); margin-bottom: 10px; }
  .cmp-faq summary { cursor:pointer; padding: 14px 16px; font-weight: 600; list-style:none; }
  .cmp-faq summary::-webkit-details-marker { display:none; }
  .cmp-faq p { margin:0; padding: 0 16px 14px; color: var(--muted); line-height: 1.65; font-size: 14.5px; }
  .cmp-rel { margin-top: 44px; } .cmp-rel h2 { font-size: 18px; font-weight: 800; margin-bottom: 12px; }
  .cmp-rel a { display:block; padding: 12px 14px; border:1px solid var(--border); border-radius: var(--r-md); margin-bottom: 8px; background: var(--bg-1); }
  .cmp-rel a:hover { border-color: var(--accent); }
  .cmp-final { margin-top: 46px; text-align:center; padding: 34px 20px; border:1px solid var(--border); border-radius: var(--r-lg); background: linear-gradient(180deg, rgba(99,102,241,.08), var(--bg-1)); }
  .cmp-final h2 { font-size: 22px; font-weight: 800; } .cmp-final p { color: var(--muted); margin: 8px auto 16px; max-width: 460px; }
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
<main class="cmp-wrap">
  <nav class="cmp-crumb"><a href="/">Home</a> › <a href="/compare">Compare</a> › ${esc(c.name)} Alternative</nav>
  <article>
    <h1>${esc(c.name)} Alternative: Applio</h1>
    <div class="cmp-meta">Updated ${esc(MONTH)} · Applio</div>
    <div class="cmp-answer">${esc(c.lede)}</div>

    <section class="cmp-section">
      <h2>Applio vs ${esc(c.name)} at a glance</h2>
      <div class="cmp-table-wrap">
      <table class="cmp">
        <thead><tr><th>Feature</th><th class="cmp-us">Applio</th><th>${esc(c.name)}</th></tr></thead>
        <tbody>
        ${rows}
        </tbody>
      </table>
      </div>
      <p class="cmp-note">Comparison reflects each product's general positioning as of ${esc(MONTH)}. Competitor features and pricing change, always check ${esc(c.name)}'s own site for the latest.</p>
    </section>

    <section class="cmp-section">
      <h2>Why choose Applio</h2>
      <ul>
        <li><strong>Free where it counts.</strong> Build and export a real resume for free (no credit card), and check your ATS score against any job with no sign-up.</li>
        <li><strong>ATS-first.</strong> Applio scores your resume against a specific posting and lists the exact missing keywords and fixes.</li>
        <li><strong>More than a resume.</strong> AI tailoring, cover letters, interview prep, and career tools (Skill Gap, Brag Doc, First 90 Days, Salary Insights) in one place.</li>
        <li><strong>Honest AI.</strong> Applio's AI is grounded in your real experience, it never invents job titles, employers, numbers, or skills.</li>
        <li><strong>No download paywall surprises.</strong> Watermark-free export on every plan, with a one-time lifetime option if you want all AI features forever.</li>
      </ul>
    </section>

    <section class="cmp-section">
      <h2>What ${esc(c.name)} does well</h2>
      <p>${esc(c.goodAt)} Applio and ${esc(c.name)} both aim to help you land interviews, this page is to help you pick the right fit for how you work.</p>
    </section>

    <section class="cmp-faq">
      <h2>Frequently asked questions</h2>
      ${c.faq.map(f=>`<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n      ')}
    </section>
  </article>

  <div class="cmp-final">
    <h2>Try Applio free</h2>
    <p>Build an ATS-optimized resume, check your score against any job, and let AI tailor it, free to start, no credit card.</p>
    <a class="btn btn-primary" href="/login?mode=signup">Build my resume free</a>
  </div>

  <div class="cmp-rel">
    <h2>More comparisons</h2>
    ${others.map(o=>`<a href="/${o.slug}">Applio vs ${esc(o.name)}</a>`).join('\n    ')}
    <a href="/ats-checker">Free ATS resume checker</a>
    <a href="/guides/best-free-resume-builder">Best free resume builder</a>
  </div>
</main>
<script src="/js/footer.js"></script>
</body>
</html>`;
}

function hubHTML(){
  const url = `${BASE}/compare`;
  const ld = [
    { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${BASE}/`},
      {"@type":"ListItem","position":2,"name":"Compare","item":url} ]}
  ];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Applio vs Rezi, Teal & Zety: Free Resume Builder Comparison | Applio</title>
<meta name="description" content="How Applio compares to Rezi, Teal, and Zety: a free ATS checker, free resume building and export, AI tailoring, and career tools. Pick the right resume builder.">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<meta name="theme-color" content="#6366f1">
<meta property="og:title" content="Applio vs Rezi, Teal & Zety | Applio">
<meta property="og:description" content="Compare Applio to Rezi, Teal, and Zety, free ATS checker, free export, AI tailoring, and career tools.">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/logo.jpeg">
${ld.map(o=>`<script type="application/ld+json">\n${JSON.stringify(o,null,2)}\n</script>`).join('\n')}
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
<style>
  .ch-wrap { max-width: 820px; margin: 0 auto; padding: 40px 20px 80px; }
  .ch-head { text-align:center; margin-bottom: 30px; }
  .ch-head h1 { font-size: clamp(28px,5vw,40px); font-weight: 800; letter-spacing:-.8px; }
  .ch-head p { color: var(--muted); font-size: 16px; max-width: 600px; margin: 12px auto 0; line-height: 1.6; }
  .ch-grid { display:grid; grid-template-columns: repeat(auto-fill,minmax(240px,1fr)); gap: 14px; }
  .ch-grid a { display:block; padding: 22px 24px; border:1px solid var(--border); border-radius: var(--r-lg); background: var(--bg-1); box-shadow: var(--sh-1); transition: transform var(--dur) var(--ease), border-color var(--dur) var(--ease); }
  .ch-grid a:hover { transform: translateY(-2px); border-color: var(--accent); }
  .ch-t { font-size: 18px; font-weight: 800; } .ch-d { color: var(--muted); font-size: 13.5px; margin-top: 5px; }
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
<main class="ch-wrap">
  <div class="ch-head">
    <h1>Applio vs the alternatives</h1>
    <p>Honest comparisons to help you pick a resume builder. Applio is free to build, export, and score against any job, with AI and career tools when you want them.</p>
  </div>
  <div class="ch-grid">
    ${C.map(c=>`<a href="/${c.slug}"><div class="ch-t">Applio vs ${esc(c.name)}</div><div class="ch-d">A free ${esc(c.name)} alternative, compared</div></a>`).join('\n    ')}
  </div>
</main>
<script src="/js/footer.js"></script>
</body>
</html>`;
}

// ---- write files ----
let written = ['/compare'];
fs.writeFileSync(path.join(ROOT, 'compare.html'), hubHTML());
for (const c of C) { fs.writeFileSync(path.join(ROOT, `${c.slug}.html`), pageHTML(c)); written.push(`/${c.slug}`); }

// ---- update sitemap.xml (idempotent for these slugs) ----
const smPath = path.join(ROOT, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
const slugs = ['compare', ...C.map(c=>c.slug)];
slugs.forEach(s => {
  sm = sm.replace(new RegExp(`\\s*<url>\\s*<loc>https://appliohq\\.com/${s}</loc>[\\s\\S]*?</url>`, 'g'), '');
});
const urls = written.map(u=>`  <url>\n    <loc>${BASE}${u}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n');
sm = sm.replace('</urlset>', urls + '\n</urlset>');
fs.writeFileSync(smPath, sm);

console.log('Wrote ' + C.length + ' comparison pages + hub. Sitemap now has ' + (sm.match(/<url>/g)||[]).length + ' URLs.');
