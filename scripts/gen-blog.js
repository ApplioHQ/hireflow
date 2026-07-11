#!/usr/bin/env node
/* Generates /blog/<slug>.html posts + /blog hub + sitemap entries.
   Mirrors scripts/gen-guides.js: same header/footer/CSS, schema-rich
   (BlogPosting + Breadcrumb + Blog collection). Content is the Applio
   Substack, republished on-site so it's owned, indexable, and cross-linked.
   Run from repo root: node scripts/gen-blog.js  */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'blog');
const BASE = 'https://appliohq.com';
const SUBSTACK = 'https://appliohq.substack.com';
const TODAY = new Date().toISOString().slice(0, 10);

function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
// Pretty date: 2026-07-10 -> "July 10, 2026"
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function prettyDate(iso){ const [y,m,d] = iso.split('-').map(Number); return `${MONTHS[m-1]} ${d}, ${y}`; }
function readMins(html){ const words = html.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length; return Math.max(1, Math.round(words/200)); }

// Each post: slug, title, subtitle (dek), date (ISO), metaDesc, tag,
// intro (HTML before the first heading), sections [{h, html}].
const POSTS = [
  {
    slug:'beyond-the-resume',
    title:'Beyond the Resume: Why the Future of Job Searching Needs an AI Career Copilot',
    subtitle:'The hiring process has changed. Your career tools should too.',
    date:'2026-07-10',
    tag:'Vision',
    metaDesc:'AI can write a resume in seconds — so why is landing interviews still so hard? Why the modern job search needs an AI career copilot, not just another resume generator.',
    intro:`
      <p>Applying for jobs has never been easier, or more complicated. Artificial intelligence can generate resumes in seconds, but landing interviews still feels frustratingly difficult. The problem isn't that people need faster resume builders. The problem is that the hiring process has outgrown them.</p>
      <p>For decades, the resume has been the centerpiece of every job application. It has evolved from a typed sheet of paper to a polished digital document, but its purpose has remained the same: communicate your experience well enough to earn a conversation.</p>
      <p>Today, however, that single document carries far more responsibility than it was ever designed to handle.</p>
      <p>A resume must impress recruiters, satisfy <a href="/guides/what-is-an-ats">applicant tracking systems (ATS)</a>, highlight measurable achievements, include the right keywords, and be customized for every role, all while fitting neatly onto one or two pages. Job seekers aren't simply writing resumes anymore; they're trying to navigate an increasingly complex hiring ecosystem.</p>
      <p>As a result, the modern job search has become less about showcasing talent and more about managing an endless series of repetitive tasks.</p>`,
    sections:[
      {h:'The Hidden Cost of Every Application', html:`
        <p>Most people underestimate how much work goes into submitting a single application.</p>
        <p>Before clicking "Apply," candidates often spend time researching the company, analyzing the job description, rewriting bullet points, optimizing keywords, drafting a tailored cover letter, preparing for interviews, and organizing application materials. Multiply that process across dozens of applications, and the hours quickly become overwhelming.</p>
        <p>Ironically, this administrative workload often consumes more time than actually improving the skills employers care about.</p>
        <p>Technology was supposed to simplify this process. Instead, it fragmented it.</p>
        <p>Today's market is filled with specialized tools: one platform builds resumes, another writes cover letters, another checks ATS compatibility, another prepares interview questions, and yet another tracks applications. Each tool performs its task reasonably well, but none of them understand the bigger picture, your career.</p>`},
      {h:"Careers Aren't Built One Document at a Time", html:`
        <p>The most valuable part of any application isn't the resume itself.</p>
        <p>It's the experiences behind it.</p>
        <p>Your internships, leadership positions, side projects, volunteer work, certifications, and accomplishments don't change every time you apply for a new role. What changes is how those experiences should be presented to match a particular opportunity.</p>
        <p>Yet most software forces candidates to start from scratch with every application. Information is copied between documents, rewritten into slightly different formats, and adjusted repeatedly for different employers.</p>
        <p>This repetitive cycle creates unnecessary friction.</p>
        <p>A better system would remember who you are, preserve your career history, and intelligently adapt your experiences for each opportunity without requiring you to rebuild everything from the beginning.</p>`},
      {h:'A Different Way to Think About Career Tools', html:`
        <p>When we started building Applio, we weren't interested in creating another resume generator.</p>
        <p>There are already dozens of products capable of producing well-formatted resumes in seconds. That problem has largely been solved.</p>
        <p>The bigger opportunity lies in helping people manage their careers, not just their documents.</p>
        <p>Applio is built around the idea that your professional identity should exist as a living profile rather than a collection of disconnected files. Once your experiences, achievements, projects, and skills are organized in one place, every part of the application process becomes more intelligent.</p>
        <p>Instead of repeatedly entering the same information, you build your career profile once. From there, Applio helps transform that information into resumes, cover letters, interview preparation, and tailored applications that reflect both your background and the specific role you're pursuing.</p>
        <p>The result is less repetition and more meaningful progress.</p>`},
      {h:'AI Should Understand Context', html:`
        <p>Artificial intelligence has become remarkably good at generating text.</p>
        <p>But writing faster isn't the same as providing better guidance.</p>
        <p>The most useful AI systems understand context. They remember previous conversations, recognize patterns, and build upon existing information instead of treating every interaction as a blank slate.</p>
        <p>Your career deserves the same approach.</p>
        <p>Each internship builds upon the last. Every project develops new skills. Every interview offers lessons that improve future performance. Career growth is continuous, and the tools supporting that growth should be continuous as well.</p>
        <p>Rather than functioning as isolated utilities, career platforms should evolve alongside the people using them.</p>`},
      {h:'More Than Productivity', html:`
        <p>The real value of AI isn't measured by how quickly it can generate another document.</p>
        <p>It's measured by the time it gives back.</p>
        <p>Instead of spending hours rewriting bullet points for every application, candidates can focus on preparing for interviews, developing new skills, networking with professionals, and pursuing opportunities that genuinely align with their goals.</p>
        <p>Technology should remove administrative work, not create more of it.</p>
        <p>When repetitive tasks disappear, people gain the freedom to focus on what actually moves their careers forward.</p>`},
      {h:'Looking Ahead', html:`
        <p>The next generation of career technology won't be defined by better templates or a longer list of AI features.</p>
        <p>It will be defined by systems that understand context, reduce complexity, and help people make better decisions throughout their professional journey.</p>
        <p>That's the future we believe in at Applio.</p>
        <p>Not because resumes are becoming less important.</p>
        <p>But because careers have become much bigger than resumes.</p>
        <p>As artificial intelligence continues to reshape the way we work, the most valuable tools won't simply generate documents — they'll become trusted partners that help people navigate every stage of their careers with greater confidence and less friction.</p>`},
    ],
  },
  {
    slug:'resume-mistakes-that-cost-interviews',
    title:'The Resume Mistakes That Quietly Cost Candidates Interviews',
    subtitle:'The small resume mistakes that can quietly cost you opportunities.',
    date:'2026-07-09',
    tag:'Resume Tips',
    metaDesc:'Five resume mistakes that quietly cost candidates interviews — generic resumes, listing duties instead of impact, over-design, weak alignment, and stale content — with a fix for each.',
    intro:`
      <p>Every hiring cycle tells the same story.</p>
      <p>A recruiter opens a role and receives hundreds of applications within days. Most candidates meet at least some of the requirements. Many have similar educational backgrounds, similar technical skills, and similar years of experience.</p>
      <p>Yet only a small fraction move forward.</p>
      <p>It's tempting to assume the difference comes down to qualifications alone. In reality, the resume itself often determines whether a candidate gets a closer look.</p>
      <p>A resume is more than a summary of your work history. It's a communication tool. Its purpose is to help an employer quickly understand the value you bring and why you're a strong match for a specific role.</p>
      <p>After reviewing thousands of resumes and studying hiring trends, a few patterns consistently appear among the applications that struggle to generate interviews.</p>`,
    sections:[
      {h:'1. Generic resumes rarely perform well', html:`
        <p>One of the most common mistakes is treating a resume as a permanent document.</p>
        <p>Candidates spend hours creating a single version, then submit it to dozens of different companies with minimal changes. While this approach saves time, it rarely reflects what hiring managers are looking for.</p>
        <p>Every job description emphasizes a different combination of skills, experiences, and priorities. A marketing role may value analytics and campaign performance, while another focuses on content strategy and brand development.</p>
        <p>A strong resume adapts to those priorities.</p>
        <p><a href="/guides/how-to-tailor-resume-to-job">Tailoring a resume</a> does not mean rewriting it from scratch. It means emphasizing the experiences, projects, and accomplishments that are most relevant to the position you're applying for.</p>`},
      {h:"2. Responsibilities don't tell the full story", html:`
        <p>Many resumes describe what someone was responsible for but never explain the impact of their work.</p>
        <p>Consider these two examples.</p>
        <p class="blog-quote"><strong>Managed company social media accounts.</strong></p>
        <p>Now compare that with:</p>
        <p class="blog-quote"><strong>Developed a short-form content strategy that increased Instagram engagement by 38 percent over six months.</strong></p>
        <p>The first tells an employer what the candidate did.</p>
        <p>The second shows what the candidate achieved.</p>
        <p>Recruiters are looking for evidence of impact. Whenever possible, use measurable outcomes that demonstrate growth, efficiency, revenue, customer satisfaction, or other meaningful results.</p>`},
      {h:'3. Readability matters more than creativity', html:`
        <p>There is a growing trend toward visually complex resumes filled with icons, graphics, and elaborate layouts.</p>
        <p>While these designs may stand out, they don't always improve communication.</p>
        <p>Recruiters typically spend only a short amount of time reviewing an application before deciding whether to continue reading. During that initial review, clarity matters far more than decoration.</p>
        <p>Simple typography, consistent spacing, logical section headings, and concise bullet points make information easier to scan. A clean resume helps employers focus on your experience rather than the design itself — which is why every <a href="/resume-templates">Applio template</a> is built to stay clean and easy to parse.</p>`},
      {h:'4. Strong candidates connect their experience to the role', html:`
        <p>Hiring managers are not simply evaluating whether a candidate is qualified.</p>
        <p>They're evaluating whether the candidate is qualified for <em>this</em> position.</p>
        <p>That distinction matters.</p>
        <p>When reviewing a job description, identify the skills and experiences that appear repeatedly. Then make sure those themes are reflected naturally throughout your resume where they accurately represent your background.</p>
        <p>The goal is alignment, not keyword stuffing.</p>`},
      {h:'5. A resume should evolve with your career', html:`
        <p>Many people update their resume only when they begin searching for a new job.</p>
        <p>By that point, valuable accomplishments are often forgotten.</p>
        <p>Instead, treat your resume as a living document. Add projects, certifications, promotions, awards, and measurable achievements throughout the year. Keeping it current makes future applications significantly easier and results in a more accurate representation of your experience.</p>`},
      {h:'Looking Ahead', html:`
        <p>The hiring process continues to evolve as employers adopt new technologies and receive more applications than ever before. Candidates who communicate their experience clearly, tailor their applications thoughtfully, and focus on measurable impact consistently give themselves a stronger chance of moving forward.</p>
        <p>There is no resume that guarantees interviews, and there is no single formula for getting hired. Every company evaluates candidates differently.</p>
        <p>What remains consistent is this: the strongest resumes make it easy for employers to understand the value a candidate brings.</p>
        <p>At Applio, we're building tools to help job seekers do exactly that. From resume optimization to application tailoring and interview preparation, our mission is to make the job search more efficient so candidates can spend less time formatting documents and more time pursuing meaningful opportunities.</p>`},
    ],
  },
  {
    slug:'your-career-starts-here',
    title:'Your Career Starts Here',
    subtitle:'Resume tips, interview strategies, and AI-powered guidance for every stage of your career.',
    date:'2026-07-09',
    tag:'Welcome',
    metaDesc:'Welcome to the Applio blog — practical, actionable advice on resumes, cover letters, interviews, and AI in hiring to help you stand out and apply with confidence.',
    intro:`
      <p>Finding a job is harder than ever. Between writing resumes, tailoring every application, preparing for interviews, and navigating ATS filters, the process can quickly become overwhelming. That's why we built Applio, an AI-powered career copilot designed to help you at every step of your job search.</p>
      <p>On this blog, we'll share practical, actionable advice to help you build stronger resumes, write compelling cover letters, prepare for interviews, and stay up to date with the latest hiring trends. Whether you're applying for your first internship, searching for a full-time role, or making a career change, our goal is to help you stand out and apply with confidence.</p>
      <p>You can expect guides on resume writing, interview strategies, career growth, AI in hiring, and insights from recruiters and industry experts. Every article is designed to give you clear, useful advice you can apply immediately.</p>
      <p>Thanks for joining us. We're excited to help you build your career, one opportunity at a time.</p>`,
    sections:[],
  },
];

function bodyHTML(p){
  return (p.intro || '') + p.sections.map(s=>`
    <section class="blog-section"><h2>${esc(s.h)}</h2>${s.html}</section>`).join('');
}

function postHTML(p){
  const url = `${BASE}/blog/${p.slug}`;
  const body = bodyHTML(p);
  const mins = readMins(body);
  const ld = [
    { "@context":"https://schema.org","@type":"BlogPosting","headline":p.title,"description":p.metaDesc,
      "url":url,"datePublished":p.date,"dateModified":p.date,"inLanguage":"en",
      "image":`${BASE}/logo.jpeg`,
      "author":{"@type":"Organization","name":"Applio","url":BASE},
      "publisher":{"@type":"Organization","name":"Applio","logo":{"@type":"ImageObject","url":`${BASE}/logo.jpeg`}},
      "mainEntityOfPage":url },
    { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${BASE}/`},
      {"@type":"ListItem","position":2,"name":"Blog","item":`${BASE}/blog`},
      {"@type":"ListItem","position":3,"name":p.title,"item":url}
    ]},
  ];
  const rel = POSTS.filter(x=>x.slug!==p.slug).slice(0,3);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.title)} | Applio Blog</title>
<meta name="description" content="${esc(p.metaDesc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#6366f1">
<meta property="og:site_name" content="Applio">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.metaDesc)}">
<meta property="og:type" content="article">
<meta property="article:published_time" content="${p.date}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/logo.jpeg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.metaDesc)}">
${ld.map(o=>`<script type="application/ld+json">\n${JSON.stringify(o,null,2)}\n</script>`).join('\n')}
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
${BLOG_CSS}
</head>
<body class="app-body-scroll">
<header class="app-topbar">
  <a href="/" class="brand"><img src="/logo.jpeg" class="brand-logo" alt="Applio"><span>Applio</span></a>
  <div class="topbar-right">
    <a class="btn btn-ghost btn-sm" href="/login">Sign in</a>
    <a class="btn btn-primary btn-sm" href="/login?mode=signup">Build resume free</a>
  </div>
</header>
<main class="blog-wrap">
  <nav class="blog-crumb"><a href="/">Home</a> › <a href="/blog">Blog</a> › ${esc(p.title)}</nav>
  <article>
    <div class="blog-tag">${esc(p.tag)}</div>
    <h1>${esc(p.title)}</h1>
    <p class="blog-dek">${esc(p.subtitle)}</p>
    <div class="blog-meta">${prettyDate(p.date)} · ${mins} min read · Applio</div>
    <div class="blog-body">
      ${body}
    </div>
  </article>
  <div class="blog-final">
    <h2>Put this into practice</h2>
    <p>Build an ATS-optimized resume free with Applio and let AI tailor it to any job — then track every application in one place.</p>
    <a class="btn btn-primary" href="/login?mode=signup">Start free — no credit card</a>
  </div>
  <div class="blog-rel">
    <h2>Keep reading</h2>
    ${rel.map(r=>`<a href="/blog/${r.slug}"><span class="rt">${esc(r.title)}</span><span class="rd">${esc(r.subtitle)}</span></a>`).join('\n    ')}
  </div>
</main>
<script src="/js/footer.js"></script>
</body>
</html>`;
}

function hubHTML(){
  const url = `${BASE}/blog`;
  const sorted = POSTS.slice().sort((a,b)=> a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const ld = [
    { "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${BASE}/`},
      {"@type":"ListItem","position":2,"name":"Blog","item":url}
    ]},
    { "@context":"https://schema.org","@type":"Blog","name":"Applio Blog","url":url,
      "description":"Resume tips, interview strategies, and AI-powered guidance for every stage of your career.",
      "publisher":{"@type":"Organization","name":"Applio","logo":{"@type":"ImageObject","url":`${BASE}/logo.jpeg`}},
      "blogPost": sorted.map(p=>({"@type":"BlogPosting","headline":p.title,"description":p.metaDesc,
        "url":`${BASE}/blog/${p.slug}`,"datePublished":p.date})) }
  ];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Applio Blog — Resume & Career Advice</title>
<meta name="description" content="Resume tips, interview strategies, and AI-powered guidance for every stage of your career, from the team building Applio.">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#6366f1">
<meta property="og:site_name" content="Applio">
<meta property="og:title" content="Applio Blog — Resume & Career Advice">
<meta property="og:description" content="Resume tips, interview strategies, and AI-powered guidance for every stage of your career.">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/logo.jpeg">
<meta name="twitter:card" content="summary_large_image">
${ld.map(o=>`<script type="application/ld+json">\n${JSON.stringify(o,null,2)}\n</script>`).join('\n')}
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
${BLOG_CSS}
</head>
<body class="app-body-scroll">
<header class="app-topbar">
  <a href="/" class="brand"><img src="/logo.jpeg" class="brand-logo" alt="Applio"><span>Applio</span></a>
  <div class="topbar-right">
    <a class="btn btn-ghost btn-sm" href="/login">Sign in</a>
    <a class="btn btn-primary btn-sm" href="/login?mode=signup">Build resume free</a>
  </div>
</header>
<main class="bh-wrap">
  <div class="bh-head">
    <h1>The Applio Blog</h1>
    <p>Resume tips, interview strategies, and AI-powered guidance for every stage of your career.</p>
  </div>
  <div class="bh-list">
    ${sorted.map(p=>`<a href="/blog/${p.slug}">
      <div class="bh-tag">${esc(p.tag)} · ${prettyDate(p.date)}</div>
      <div class="bh-t">${esc(p.title)}</div>
      <div class="bh-d">${esc(p.subtitle)}</div>
    </a>`).join('\n    ')}
  </div>
  <div class="bh-sub">
    <p>Prefer email? <a href="${SUBSTACK}" rel="noopener">Subscribe on Substack</a> to get new posts in your inbox.</p>
  </div>
</main>
<script src="/js/footer.js"></script>
</body>
</html>`;
}

const BLOG_CSS = `<style>
  .blog-wrap { max-width: 720px; margin: 0 auto; padding: 28px 20px 80px; }
  .blog-crumb { font-size: 12.5px; color: var(--muted); margin-bottom: 18px; }
  .blog-crumb a { color: var(--muted); } .blog-crumb a:hover { color: var(--accent); }
  .blog-tag { display:inline-block; font-size: 11.5px; font-weight: 700; letter-spacing:.06em; text-transform:uppercase; color: var(--accent); margin-bottom: 12px; }
  .blog-wrap h1 { font-size: clamp(28px,5vw,40px); font-weight: 800; letter-spacing:-.7px; line-height:1.14; }
  .blog-dek { font-size: 18px; color: var(--muted); line-height:1.5; margin-top: 12px; }
  .blog-meta { color: var(--muted); font-size: 13px; margin-top: 14px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
  .blog-body { margin-top: 8px; }
  .blog-body p { color: var(--text); line-height: 1.8; font-size: 16.5px; margin-top: 18px; }
  .blog-body a { color: var(--accent); } .blog-body a:hover { text-decoration: underline; }
  .blog-section { margin-top: 30px; }
  .blog-section h2 { font-size: 23px; font-weight: 800; letter-spacing:-.3px; margin-bottom: 4px; line-height:1.25; }
  .blog-quote { margin: 18px 0 !important; padding: 14px 18px; border-left: 3px solid var(--accent); background: var(--bg-1); border-radius: var(--r-md); font-size: 16px !important; }
  .blog-final { margin-top: 48px; text-align:center; padding: 34px 20px; border:1px solid var(--border); border-radius: var(--r-lg); background: linear-gradient(180deg, rgba(99,102,241,.08), var(--bg-1)); box-shadow: var(--sh-1); }
  .blog-final h2 { font-size: 22px; font-weight: 800; } .blog-final p { color: var(--muted); margin: 8px auto 16px; max-width: 460px; line-height:1.6; }
  .blog-rel { margin-top: 46px; }
  .blog-rel h2 { font-size: 18px; font-weight: 800; margin-bottom: 12px; }
  .blog-rel a { display:block; padding: 14px 16px; border:1px solid var(--border); border-radius: var(--r-md); margin-bottom: 8px; background: var(--bg-1); box-shadow: var(--sh-1); transition: border-color var(--dur) var(--ease); }
  .blog-rel a:hover { border-color: var(--accent); }
  .blog-rel .rt { display:block; font-weight: 700; font-size: 15.5px; }
  .blog-rel .rd { display:block; color: var(--muted); font-size: 13.5px; margin-top: 3px; line-height:1.45; }
  .bh-wrap { max-width: 820px; margin: 0 auto; padding: 40px 20px 80px; }
  .bh-head { text-align:center; margin-bottom: 34px; }
  .bh-head h1 { font-size: clamp(30px,5vw,46px); font-weight: 800; letter-spacing:-1px; }
  .bh-head p { color: var(--muted); font-size: 17px; max-width: 580px; margin: 12px auto 0; line-height:1.6; }
  .bh-list a { display:block; padding: 22px 24px; border:1px solid var(--border); border-radius: var(--r-lg); background: var(--bg-1); margin-bottom: 14px; box-shadow: var(--sh-1), var(--hi); transition: transform var(--dur) var(--ease), border-color var(--dur) var(--ease); }
  .bh-list a:hover { transform: translateY(-2px); border-color: var(--accent); }
  .bh-tag { font-size: 11.5px; font-weight: 700; letter-spacing:.05em; text-transform:uppercase; color: var(--accent); }
  .bh-t { font-size: 20px; font-weight: 800; letter-spacing:-.3px; margin-top: 7px; line-height:1.25; }
  .bh-d { color: var(--muted); font-size: 15px; margin-top: 6px; line-height:1.55; }
  .bh-sub { text-align:center; margin-top: 30px; color: var(--muted); font-size: 14.5px; }
  .bh-sub a { color: var(--accent); }
</style>`;

// ---- write files ----
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
let written = ['/blog'];
fs.writeFileSync(path.join(OUT, 'index.html'), hubHTML());
for (const p of POSTS) { fs.writeFileSync(path.join(OUT, `${p.slug}.html`), postHTML(p)); written.push(`/blog/${p.slug}`); }

// ---- update sitemap.xml (idempotent for /blog) ----
const smPath = path.join(ROOT, 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
sm = sm.replace(/\s*<url>\s*<loc>https:\/\/appliohq\.com\/blog[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
const urls = written.map(u=>`  <url>\n    <loc>${BASE}${u}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`).join('\n');
sm = sm.replace('</urlset>', urls + '\n</urlset>');
fs.writeFileSync(smPath, sm);

console.log('Wrote ' + POSTS.length + ' blog posts + hub. Sitemap now has ' + (sm.match(/<url>/g)||[]).length + ' URLs.');
