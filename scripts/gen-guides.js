#!/usr/bin/env node
/* Generates /guides/<slug>.html articles + hub + sitemap entries.
   Answer-first, ATS-focused, schema-rich (Article + FAQPage + HowTo + Breadcrumb).
   Run from repo root: node scripts/gen-guides.js  */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'guides');
const BASE = 'https://appliohq.com';
const TODAY = new Date().toISOString().slice(0, 10);

function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

// Each guide: slug, title, metaDesc, kw, answer (the quotable 2-3 sentence lede),
// updated, sections [{h, html}], steps (optional HowTo), faq [{q,a}].
const G = [
  {
    slug:'what-is-an-ats',
    title:'What Is an ATS? Applicant Tracking Systems Explained',
    metaDesc:'An ATS (Applicant Tracking System) is software that collects and filters résumés before a recruiter reads them. Learn how it works, why ~70% of résumés get filtered out, and how to get past it.',
    kw:'what is an ATS',
    answer:'An <strong>Applicant Tracking System (ATS)</strong> is software that employers use to collect, sort, and filter job applications before a human recruiter reviews them. When you apply online, your résumé is parsed into a database and ranked against the job description; roughly 70% of résumés are screened out at this stage, usually for missing keywords or unparseable formatting.',
    sections:[
      {h:'How an ATS works', html:'<p>When you submit a résumé, the ATS parses it into structured fields (name, work history, skills, education), then matches that data against the job requirements. Recruiters search and filter the database by keyword, years of experience, title, and location. If your résumé is hard to parse or lacks the right keywords, it ranks low or never surfaces.</p>'},
      {h:'Why résumés get rejected by an ATS', html:'<ul><li><strong>Missing keywords</strong> — the skills and titles in the job description aren\'t in your résumé.</li><li><strong>Unparseable formatting</strong> — tables, columns, text boxes, images, or headers/footers confuse the parser.</li><li><strong>Non-standard section headings</strong> — creative labels instead of "Experience," "Education," "Skills."</li><li><strong>No measurable results</strong> — vague duties instead of quantified achievements.</li></ul>'},
      {h:'How to get past an ATS', html:'<p>Mirror the exact keywords in the job posting, use standard section headings, keep a single-column layout with real selectable text, start bullets with action verbs, and quantify your impact. You can score any résumé against a job description with <a href="/ats-checker">Applio\'s free ATS checker</a>.</p>'},
    ],
    faq:[
      {q:'Do all companies use an ATS?', a:'Most mid-size and large employers use an ATS, and the majority of Fortune 500 companies do. Even many small companies use one through their job-board or recruiting software.'},
      {q:'Can an ATS read PDFs?', a:'Modern ATS software reads text-based PDFs well. Avoid scanned or image-based PDFs, and make sure your text is selectable rather than an image.'},
      {q:'How do I know if my résumé is ATS-friendly?', a:'Paste your résumé and the job description into a free ATS checker. It scores keyword match, formatting, and completeness and shows exactly what to fix.'},
    ],
  },
  {
    slug:'how-to-pass-ats',
    title:'How to Make Your Resume ATS-Friendly (and Pass the Filters)',
    metaDesc:'A step-by-step guide to making your résumé ATS-friendly: keywords, formatting, section headings, and quantified bullets. Includes a free ATS score check.',
    kw:'how to make resume ATS friendly',
    answer:'To make your résumé ATS-friendly, mirror the keywords in the job description, use standard section headings (Experience, Education, Skills), keep a single-column layout with real selectable text, start each bullet with an action verb, and quantify your results. Then score it against the job with a free ATS checker before applying.',
    steps:[
      {name:'Mirror the job description keywords', text:'Pull the exact skills, tools, and titles from the posting and work the relevant ones naturally into your summary, skills, and bullets.'},
      {name:'Use standard section headings', text:'Label sections "Experience," "Education," and "Skills" so the parser maps them correctly.'},
      {name:'Keep formatting simple', text:'Avoid tables, columns, text boxes, images, and headers/footers. Use one clean column of selectable text.'},
      {name:'Lead bullets with action verbs and numbers', text:'Start with verbs like Led, Built, Increased, and quantify impact (%, $, time, scale).'},
      {name:'Score it before you apply', text:'Run your résumé and the job description through a free ATS checker and fix the missing keywords it flags.'},
    ],
    sections:[
      {h:'What ATS-friendly actually means', html:'<p>ATS-friendly means the software can (1) parse every line of your résumé into the right fields and (2) match it to the job. It is less about beating the machine and more about not tripping it. A clean template plus the right keywords does both. See <a href="/guides/what-is-an-ats">what an ATS is</a> for the background.</p>'},
      {h:'Formatting rules that matter most', html:'<ul><li>One column, no tables or text boxes.</li><li>Standard fonts, real text (never an image of text).</li><li>Standard headings; contact info in the body, not the header/footer.</li><li>Save as a text-based PDF unless the posting asks for .docx.</li></ul>'},
    ],
    faq:[
      {q:'How many keywords should I include?', a:'Focus on the most repeated and most important skills and titles in the posting. Include them where they are true for you; never keyword-stuff or list skills you don\'t have.'},
      {q:'Are columns really bad for ATS?', a:'Multi-column layouts can cause parsers to read across columns and scramble your content. A single-column layout is the safest choice.'},
      {q:'PDF or Word for ATS?', a:'A text-based PDF is safe for most modern systems and preserves your layout. Use .docx only if the application specifically requests it.'},
    ],
  },
  {
    slug:'how-to-tailor-resume-to-job',
    title:'How to Tailor Your Resume to a Job Description',
    metaDesc:'Tailoring your résumé to each job can dramatically raise your response rate. Learn a fast, repeatable method to match keywords and rewrite bullets for any posting.',
    kw:'how to tailor resume to job description',
    answer:'To tailor your résumé to a job, read the posting for its most-repeated skills, tools, and responsibilities, then mirror that language in your summary, skills, and bullet points — emphasizing the experience most relevant to that role. Tailoring beats a generic résumé because both the ATS and the recruiter are matching you against that specific description.',
    steps:[
      {name:'Extract the key requirements', text:'List the skills, tools, and responsibilities the posting repeats or lists first. These are your target keywords.'},
      {name:'Match and reorder your content', text:'Move the most relevant experience and bullets to the top and cut or shorten what doesn\'t apply.'},
      {name:'Rewrite bullets in the job\'s language', text:'Use the posting\'s exact terms (e.g., "stakeholder management," "A/B testing") where they honestly describe your work.'},
      {name:'Update your summary and skills', text:'Rewrite your headline/summary to speak to this role and put matching skills near the top.'},
      {name:'Check the match', text:'Score the tailored résumé against the posting to confirm you covered the important keywords.'},
    ],
    sections:[
      {h:'Why tailoring works', html:'<p>A generic résumé is optimized for no one. Tailoring aligns your résumé with the exact keywords the ATS ranks on and the exact priorities the recruiter is scanning for, so you clear the filter and read as an obvious fit. You don\'t rewrite everything — you re-emphasize.</p>'},
      {h:'Do it in seconds with AI', html:'<p>Applio\'s <strong>Tailor to Job</strong> feature reads a job description and rewrites your bullets, keywords, and summary to match — grounded only in your real experience, never inventing facts. <a href="/login?mode=signup">Try it free</a>.</p>'},
    ],
    faq:[
      {q:'Should I really tailor my résumé for every job?', a:'Tailor for every role you genuinely want. At minimum, match the summary, skills, and top bullets to each posting — it meaningfully raises response rates.'},
      {q:'Isn\'t tailoring just keyword stuffing?', a:'No. Tailoring means honestly re-emphasizing relevant experience in the job\'s language. Keyword stuffing means adding skills you don\'t have, which backfires in interviews.'},
      {q:'How long should tailoring take?', a:'Manually, 10–20 minutes per role. With an AI tailoring tool, a first draft takes seconds and you refine from there.'},
    ],
  },
  {
    slug:'how-many-bullet-points-per-job',
    title:'How Many Bullet Points Should a Resume Have Per Job?',
    metaDesc:'A practical rule for résumé bullet points: how many per job, how long each should be, and how to write ones that pass ATS and impress recruiters.',
    kw:'how many bullet points per job on a resume',
    answer:'Use about 3–6 bullet points for your most recent and relevant roles, and 2–3 for older or less relevant ones. Each bullet should be one to two lines, start with an action verb, and quantify the result. Quality and relevance matter far more than the exact count.',
    sections:[
      {h:'The general rule', html:'<ul><li><strong>Current/most relevant role:</strong> 4–6 bullets.</li><li><strong>Mid-history roles:</strong> 3–4 bullets.</li><li><strong>Older or less relevant roles:</strong> 2–3 bullets.</li><li><strong>Roles 10+ years old:</strong> 1–2 bullets, or group them.</li></ul>'},
      {h:'What makes a strong bullet', html:'<p>Start with an action verb, describe what you did, and end with a measurable result: <em>"Increased trial-to-paid conversion 22% by redesigning the onboarding flow."</em> Numbers make bullets credible and quotable — both for recruiters and for AI screening.</p>'},
      {h:'Keep it to one page (usually)', html:'<p>For most candidates with under ~10 years of experience, aim for one page. Trim weak bullets before adding a second page. A <a href="/resume-templates/compact">compact template</a> helps fit strong content cleanly.</p>'},
    ],
    faq:[
      {q:'Is it OK to have just one bullet for a job?', a:'Yes, for older or less relevant roles. One strong, quantified bullet is better than three vague ones.'},
      {q:'Should every bullet have a number?', a:'Aim for a number in most bullets, but not all. Where you can\'t quantify, show scope or outcome (e.g., "for a 12-person team," "adopted company-wide").'},
      {q:'How long should each bullet be?', a:'One to two lines. If a bullet runs to three lines, split it or tighten the wording.'},
    ],
  },
  {
    slug:'how-to-write-resume-summary',
    title:'How to Write a Resume Summary (With Examples)',
    metaDesc:'A résumé summary is a 2–3 sentence pitch at the top of your résumé. Learn the formula, when to use one, and see examples that get recruiters to keep reading.',
    kw:'how to write a resume summary',
    answer:'A résumé summary is a 2–3 sentence pitch at the top of your résumé that states who you are, your most relevant strengths, and the value you bring to the target role. Write it last, tailor it to each job, and lead with your title, years of experience, and one or two quantified wins.',
    sections:[
      {h:'The summary formula', html:'<p><strong>[Title + years] + [core strengths relevant to the role] + [one or two quantified achievements].</strong> Example: <em>"Product manager with 6 years in B2B SaaS, specializing in growth and onboarding. Led experiments that lifted activation 30% and drove $2M in new ARR."</em></p>'},
      {h:'Summary vs. objective', html:'<p>Use a <strong>summary</strong> (what you offer) if you have experience. Use an <strong>objective</strong> (what you want) only when changing careers or with little history — and even then, frame it around the employer\'s needs.</p>'},
      {h:'Tailor it every time', html:'<p>Your summary is the most-read part of your résumé, so it should mirror each job\'s priorities and keywords. Applio\'s AI can rewrite it per posting in seconds. <a href="/login?mode=signup">Start free</a>.</p>'},
    ],
    faq:[
      {q:'Do I need a summary on my résumé?', a:'It\'s optional but recommended for experienced candidates. A tailored summary frames your fit before the recruiter reaches your experience.'},
      {q:'How long should a résumé summary be?', a:'Two to three sentences, or 30–60 words. Any longer and recruiters skim past it.'},
      {q:'Should I write my summary first or last?', a:'Write it last. Once your experience and skills are on the page, it\'s much easier to distill your strongest pitch.'},
    ],
  },
  {
    slug:'best-resume-format',
    title:'The Best Resume Format in 2026 (Chronological vs. Functional)',
    metaDesc:'Which résumé format should you use? Compare chronological, functional, and combination formats, and learn which is most ATS-friendly for your situation.',
    kw:'best resume format',
    answer:'For almost everyone, the best résumé format is <strong>reverse-chronological</strong>: your most recent role first, in a single-column layout with standard headings. It is the format recruiters expect and the one Applicant Tracking Systems parse most reliably. Use a functional or combination format only in specific cases like major career changes or employment gaps.',
    sections:[
      {h:'The three formats', html:'<ul><li><strong>Reverse-chronological</strong> — work history newest-first. Best for most people and most ATS-friendly.</li><li><strong>Functional</strong> — organized by skills, downplaying dates. Can help with big gaps or pivots, but recruiters and ATS often distrust it.</li><li><strong>Combination</strong> — a skills summary on top of a chronological history. A reasonable middle ground for career changers.</li></ul>'},
      {h:'Formatting for ATS', html:'<p>Whatever structure you choose, keep one column, standard headings, real selectable text, and no tables or images. See <a href="/guides/how-to-pass-ats">how to make your résumé ATS-friendly</a> for the full checklist.</p>'},
      {h:'Pick a proven template', html:'<p>You don\'t have to build formatting from scratch. Every <a href="/resume-templates">Applio template</a> uses a clean, ATS-safe reverse-chronological structure you can customize.</p>'},
    ],
    faq:[
      {q:'Is a functional résumé bad?', a:'It\'s not inherently bad, but many recruiters and ATS systems handle it poorly because it hides dates. Prefer chronological or combination unless you have a strong reason.'},
      {q:'What format is best for a career change?', a:'A combination format lets you lead with transferable skills while still showing a chronological history, which reassures recruiters.'},
      {q:'One column or two?', a:'One column. Two-column layouts can scramble when an ATS parses them.'},
    ],
  },
];

function howToLD(g){
  if (!g.steps) return null;
  return { "@context":"https://schema.org","@type":"HowTo","name":g.title,
    "step": g.steps.map((s,i)=>({"@type":"HowToStep","position":i+1,"name":s.name,"text":s.text})) };
}

function articleHTML(g){
  const url = `${BASE}/guides/${g.slug}`;
  const ld = [
    { "@context":"https://schema.org","@type":"Article","headline":g.title,"description":g.metaDesc,
      "url":url,"datePublished":TODAY,"dateModified":TODAY,"inLanguage":"en",
      "author":{"@type":"Organization","name":"Applio"},
      "publisher":{"@type":"Organization","name":"Applio","logo":{"@type":"ImageObject","url":`${BASE}/logo.jpeg`}},
      "mainEntityOfPage":url },
    { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${BASE}/`},
      {"@type":"ListItem","position":2,"name":"Guides","item":`${BASE}/guides`},
      {"@type":"ListItem","position":3,"name":g.title,"item":url}
    ]},
    { "@context":"https://schema.org","@type":"FAQPage","mainEntity":g.faq.map(f=>(
      {"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}}))},
  ];
  const ht = howToLD(g); if (ht) ld.push(ht);
  const rel = G.filter(x=>x.slug!==g.slug).slice(0,3);
  const stepsHTML = g.steps ? `
  <section class="gd-section">
    <h2>Step-by-step</h2>
    <ol class="gd-steps">
      ${g.steps.map(s=>`<li><strong>${esc(s.name)}.</strong> ${esc(s.text)}</li>`).join('\n      ')}
    </ol>
  </section>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(g.title)} | Applio</title>
<meta name="description" content="${esc(g.metaDesc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#6366f1">
<meta property="og:title" content="${esc(g.title)}">
<meta property="og:description" content="${esc(g.metaDesc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/logo.jpeg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(g.title)}">
<meta name="twitter:description" content="${esc(g.metaDesc)}">
${ld.map(o=>`<script type="application/ld+json">\n${JSON.stringify(o,null,2)}\n</script>`).join('\n')}
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
<style>
  .gd-wrap { max-width: 760px; margin: 0 auto; padding: 28px 20px 80px; }
  .gd-crumb { font-size: 12.5px; color: var(--muted); margin-bottom: 16px; }
  .gd-crumb a { color: var(--muted); } .gd-crumb a:hover { color: var(--accent); }
  .gd-wrap h1 { font-size: clamp(28px,5vw,38px); font-weight: 800; letter-spacing:-.6px; line-height:1.15; }
  .gd-meta { color: var(--muted); font-size: 13px; margin-top: 10px; }
  .gd-answer { margin: 22px 0 8px; padding: 18px 20px; border:1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--r-md); background: var(--bg-1); box-shadow: var(--sh-1); font-size: 16px; line-height: 1.65; }
  .gd-section { margin-top: 34px; }
  .gd-section h2 { font-size: 22px; font-weight: 800; letter-spacing:-.3px; margin-bottom: 12px; }
  .gd-section p, .gd-section li { color: var(--text); line-height: 1.75; font-size: 15.5px; }
  .gd-section ul, .gd-section ol { padding-left: 20px; } .gd-section li { margin-bottom: 8px; }
  .gd-section a { color: var(--accent); } .gd-section a:hover { text-decoration: underline; }
  .gd-steps li { margin-bottom: 12px; }
  .gd-faq { margin-top: 40px; }
  .gd-faq h2 { font-size: 22px; font-weight: 800; margin-bottom: 12px; }
  .gd-faq details { border:1px solid var(--border); border-radius: var(--r-md); background: var(--bg-1); margin-bottom: 10px; box-shadow: var(--sh-1); }
  .gd-faq summary { cursor:pointer; padding: 14px 16px; font-weight: 600; list-style:none; }
  .gd-faq summary::-webkit-details-marker { display:none; }
  .gd-faq p { margin:0; padding: 0 16px 14px; color: var(--muted); line-height: 1.65; font-size: 14.5px; }
  .gd-rel { margin-top: 44px; }
  .gd-rel h2 { font-size: 18px; font-weight: 800; margin-bottom: 12px; }
  .gd-rel a { display:block; padding: 12px 14px; border:1px solid var(--border); border-radius: var(--r-md); margin-bottom: 8px; background: var(--bg-1); box-shadow: var(--sh-1); transition: border-color var(--dur) var(--ease); }
  .gd-rel a:hover { border-color: var(--accent); }
  .gd-final { margin-top: 46px; text-align:center; padding: 34px 20px; border:1px solid var(--border); border-radius: var(--r-lg); background: linear-gradient(180deg, rgba(99,102,241,.08), var(--bg-1)); box-shadow: var(--sh-1); }
  .gd-final h2 { font-size: 22px; font-weight: 800; } .gd-final p { color: var(--muted); margin: 8px 0 16px; }
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
<main class="gd-wrap">
  <nav class="gd-crumb"><a href="/">Home</a> › <a href="/guides">Guides</a> › ${esc(g.title)}</nav>
  <article>
    <h1>${esc(g.title)}</h1>
    <div class="gd-meta">Updated ${TODAY} · Applio</div>
    <div class="gd-answer">${g.answer}</div>
    ${stepsHTML}
    ${g.sections.map(s=>`<section class="gd-section"><h2>${esc(s.h)}</h2>${s.html}</section>`).join('\n    ')}
    <section class="gd-faq">
      <h2>Frequently asked questions</h2>
      ${g.faq.map(f=>`<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n      ')}
    </section>
  </article>
  <div class="gd-rel">
    <h2>Related guides</h2>
    ${rel.map(r=>`<a href="/guides/${r.slug}">${esc(r.title)}</a>`).join('\n    ')}
  </div>
  <div class="gd-final">
    <h2>Put this into practice</h2>
    <p>Build an ATS-optimized résumé free with Applio and let AI tailor it to any job.</p>
    <a class="btn btn-primary" href="/login?mode=signup">Start free — no credit card</a>
  </div>
</main>
<script src="/js/footer.js"></script>
</body>
</html>`;
}

function hubHTML(){
  const url = `${BASE}/guides`;
  const ld = [
    { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${BASE}/`},
      {"@type":"ListItem","position":2,"name":"Guides","item":url}
    ]},
    { "@context":"https://schema.org","@type":"CollectionPage","name":"Resume & Job Search Guides","url":url,
      "description":"Practical, ATS-focused guides on writing résumés, passing Applicant Tracking Systems, and landing more interviews.",
      "hasPart": G.map(g=>({"@type":"Article","headline":g.title,"url":`${BASE}/guides/${g.slug}`})) }
  ];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Resume & Job Search Guides | Applio</title>
<meta name="description" content="Practical, ATS-focused guides: how to pass an ATS, tailor your résumé, write bullet points and summaries, and choose the best résumé format.">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#6366f1">
<meta property="og:title" content="Resume & Job Search Guides | Applio">
<meta property="og:description" content="ATS-focused guides to help you write a better résumé and land more interviews.">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/logo.jpeg">
<meta name="twitter:card" content="summary_large_image">
${ld.map(o=>`<script type="application/ld+json">\n${JSON.stringify(o,null,2)}\n</script>`).join('\n')}
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
<style>
  .gh-wrap { max-width: 820px; margin: 0 auto; padding: 40px 20px 80px; }
  .gh-head { text-align:center; margin-bottom: 34px; }
  .gh-head h1 { font-size: clamp(30px,5vw,44px); font-weight: 800; letter-spacing:-1px; }
  .gh-head p { color: var(--muted); font-size: 17px; max-width: 600px; margin: 12px auto 0; line-height:1.6; }
  .gh-list a { display:block; padding: 20px 22px; border:1px solid var(--border); border-radius: var(--r-lg); background: var(--bg-1); margin-bottom: 12px; box-shadow: var(--sh-1), var(--hi); transition: transform var(--dur) var(--ease), border-color var(--dur) var(--ease); }
  .gh-list a:hover { transform: translateY(-2px); border-color: var(--accent); }
  .gh-list .t { font-size: 18px; font-weight: 700; }
  .gh-list .d { color: var(--muted); font-size: 14px; margin-top: 5px; line-height:1.5; }
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
<main class="gh-wrap">
  <div class="gh-head">
    <h1>Resume & Job Search Guides</h1>
    <p>Practical, no-fluff guides on writing résumés that pass Applicant Tracking Systems and land more interviews.</p>
  </div>
  <div class="gh-list">
    ${G.map(g=>`<a href="/guides/${g.slug}"><div class="t">${esc(g.title)}</div><div class="d">${esc(g.metaDesc)}</div></a>`).join('\n    ')}
  </div>
</main>
<script src="/js/footer.js"></script>
</body>
</html>`;
}

// ---- write files ----
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
let written = ['/guides'];
fs.writeFileSync(path.join(OUT, 'index.html'), hubHTML());
for (const g of G) { fs.writeFileSync(path.join(OUT, `${g.slug}.html`), articleHTML(g)); written.push(`/guides/${g.slug}`); }

// ---- update sitemap.xml (idempotent for /guides) ----
const smPath = path.join(ROOT, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
sm = sm.replace(/\s*<url>\s*<loc>https:\/\/appliohq\.com\/guides[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
const urls = written.map(u=>`  <url>\n    <loc>${BASE}${u}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`).join('\n');
sm = sm.replace('</urlset>', urls + '\n</urlset>');
fs.writeFileSync(smPath, sm);

console.log('Wrote ' + G.length + ' guides + hub. Sitemap now has ' + (sm.match(/<url>/g)||[]).length + ' URLs.');
