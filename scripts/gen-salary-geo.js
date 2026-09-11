#!/usr/bin/env node
/* Generates /salary/[role]/[city].html pages — static SEO shells that fetch live
   Adzuna salary data client-side via the Applio Worker API. Run from repo root:
   node scripts/gen-salary-geo.js
   Existing files are NOT overwritten (idempotent). */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BASE = 'https://appliohq.com';
const TODAY = new Date().toISOString().slice(0, 10);
const API = 'https://hireflow-api.pritamavuthu7.workers.dev';

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const ROLES = [
  { slug: 'software-engineer',      title: 'Software Engineer',      query: 'software engineer' },
  { slug: 'product-manager',        title: 'Product Manager',        query: 'product manager' },
  { slug: 'data-scientist',         title: 'Data Scientist',         query: 'data scientist' },
  { slug: 'data-analyst',           title: 'Data Analyst',           query: 'data analyst' },
  { slug: 'ux-designer',            title: 'UX Designer',            query: 'UX designer' },
  { slug: 'marketing-manager',      title: 'Marketing Manager',      query: 'marketing manager' },
  { slug: 'project-manager',        title: 'Project Manager',        query: 'project manager' },
  { slug: 'business-analyst',       title: 'Business Analyst',       query: 'business analyst' },
  { slug: 'financial-analyst',      title: 'Financial Analyst',      query: 'financial analyst' },
  { slug: 'registered-nurse',       title: 'Registered Nurse',       query: 'registered nurse' },
  { slug: 'devops-engineer',        title: 'DevOps Engineer',        query: 'devops engineer' },
  { slug: 'sales-representative',   title: 'Sales Representative',   query: 'sales representative' },
  { slug: 'human-resources-manager',title: 'HR Manager',             query: 'human resources manager' },
  { slug: 'accountant',             title: 'Accountant',             query: 'accountant' },
  { slug: 'graphic-designer',       title: 'Graphic Designer',       query: 'graphic designer' },
  { slug: 'operations-manager',     title: 'Operations Manager',     query: 'operations manager' },
  { slug: 'web-developer',          title: 'Web Developer',          query: 'web developer' },
  { slug: 'content-writer',         title: 'Content Writer',         query: 'content writer' },
  { slug: 'cybersecurity-analyst',  title: 'Cybersecurity Analyst',  query: 'cybersecurity analyst' },
  { slug: 'physical-therapist',     title: 'Physical Therapist',     query: 'physical therapist' },
];

const CITIES = [
  { slug: 'new-york',       name: 'New York, NY',        display: 'New York' },
  { slug: 'san-francisco',  name: 'San Francisco, CA',   display: 'San Francisco' },
  { slug: 'los-angeles',    name: 'Los Angeles, CA',     display: 'Los Angeles' },
  { slug: 'chicago',        name: 'Chicago, IL',         display: 'Chicago' },
  { slug: 'seattle',        name: 'Seattle, WA',         display: 'Seattle' },
  { slug: 'austin',         name: 'Austin, TX',          display: 'Austin' },
  { slug: 'boston',         name: 'Boston, MA',          display: 'Boston' },
  { slug: 'denver',         name: 'Denver, CO',          display: 'Denver' },
  { slug: 'atlanta',        name: 'Atlanta, GA',         display: 'Atlanta' },
  { slug: 'miami',          name: 'Miami, FL',           display: 'Miami' },
  { slug: 'dallas',         name: 'Dallas, TX',          display: 'Dallas' },
  { slug: 'washington-dc',  name: 'Washington, DC',      display: 'Washington DC' },
  { slug: 'phoenix',        name: 'Phoenix, AZ',         display: 'Phoenix' },
  { slug: 'minneapolis',    name: 'Minneapolis, MN',     display: 'Minneapolis' },
  { slug: 'portland',       name: 'Portland, OR',        display: 'Portland' },
];

function makePage(role, city) {
  const title = `${role.title} Salary in ${city.display} (${new Date().getFullYear()})`;
  const desc = `What does a ${role.title} make in ${city.display}? Live salary data: median pay, 25th and 75th percentile, and how to earn more as a ${role.title} in ${city.display}.`;
  const url = `${BASE}/salary/${role.slug}/${city.slug}`;
  const canonicalRole = `/resume-examples/${role.slug}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | Applio</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/logo.ico">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#6366f1">
<meta property="og:title" content="${esc(title)} | Applio">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://appliohq.com/logo.jpeg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} | Applio">
<meta name="twitter:description" content="${esc(desc)}">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${esc(title)}",
  "description": "${esc(desc)}",
  "url": "${url}",
  "datePublished": "${TODAY}",
  "dateModified": "${TODAY}",
  "inLanguage": "en",
  "author": { "@type": "Organization", "name": "Applio" },
  "publisher": { "@type": "Organization", "name": "Applio", "logo": { "@type": "ImageObject", "url": "https://appliohq.com/logo.jpeg" } },
  "mainEntityOfPage": "${url}"
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://appliohq.com/" },
    { "@type": "ListItem", "position": 2, "name": "Salary Insights", "item": "https://appliohq.com/salary" },
    { "@type": "ListItem", "position": 3, "name": "${esc(role.title)} Salary", "item": "https://appliohq.com/salary/${role.slug}" },
    { "@type": "ListItem", "position": 4, "name": "${esc(city.display)}", "item": "${url}" }
  ]
}
</script>
<link rel="stylesheet" href="/css/styles.css">
<link rel="stylesheet" href="/css/skeleton.css">
<script src="/js/theme.js"></script>
<style>
  .sw-wrap { max-width: 720px; margin: 0 auto; padding: 28px 20px 80px; }
  .sw-crumb { font-size: 12.5px; color: var(--muted); margin-bottom: 16px; }
  .sw-crumb a { color: var(--muted); } .sw-crumb a:hover { color: var(--accent); }
  .sw-wrap h1 { font-size: clamp(26px,5vw,36px); font-weight: 800; letter-spacing:-.6px; line-height:1.15; }
  .sw-meta { color: var(--muted); font-size: 13px; margin-top: 8px; margin-bottom: 28px; }
  .sw-card { border: 1px solid var(--border); border-radius: 14px; background: var(--bg-1); box-shadow: var(--sh-1); padding: 28px 24px; margin-bottom: 24px; }
  .sw-loading { display: flex; flex-direction: column; gap: 14px; }
  .sw-result { display: none; }
  .sw-result.show { display: block; }
  .sw-numbers { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin: 20px 0; }
  .sw-num { text-align: center; padding: 16px 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-0); }
  .sw-num-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
  .sw-num-val { font-size: 28px; font-weight: 800; letter-spacing: -.5px; }
  .sw-num-val.median { color: var(--accent); }
  .sw-range-bar { height: 8px; border-radius: 999px; background: var(--border); position: relative; margin: 8px 0; }
  .sw-range-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--accent), #818cf8); }
  .sw-range-labels { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 4px; }
  .sw-src { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 999px; margin-bottom: 12px; }
  .sw-src-live { color: #22c55e; background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.2); }
  .sw-src-est  { color: #8b5cf6; background: rgba(139,92,246,.1); border: 1px solid rgba(139,92,246,.2); }
  .sw-error { color: var(--muted); font-size: 14px; padding: 20px 0; }
  .sw-section { margin-top: 36px; }
  .sw-section h2 { font-size: 20px; font-weight: 800; letter-spacing: -.3px; margin-bottom: 12px; }
  .sw-section p, .sw-section li { font-size: 15px; line-height: 1.75; color: var(--text); }
  .sw-section ul { padding-left: 20px; } .sw-section li { margin-bottom: 8px; }
  .sw-other-cities { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px,1fr)); gap: 8px; margin-top: 12px; }
  .sw-other-cities a { display: block; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-1); font-size: 13px; font-weight: 600; text-decoration: none; color: var(--text); transition: border-color .15s; }
  .sw-other-cities a:hover { border-color: var(--accent); color: var(--accent); }
  .sw-cta { margin-top: 44px; text-align: center; padding: 32px 20px; border: 1px solid var(--border); border-radius: 14px; background: linear-gradient(180deg, rgba(99,102,241,.08), var(--bg-1)); }
  .sw-cta h2 { font-size: 20px; font-weight: 800; } .sw-cta p { color: var(--muted); margin: 8px 0 16px; font-size: 14px; }
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
<main class="sw-wrap">
  <nav class="sw-crumb">
    <a href="/">Home</a> ›
    <a href="/salary">Salary Insights</a> ›
    <a href="/salary/${role.slug}">${esc(role.title)}</a> ›
    ${esc(city.display)}
  </nav>
  <h1>${esc(role.title)} Salary in ${esc(city.display)}</h1>
  <div class="sw-meta">Live market data · Updated ${TODAY} · Applio Salary Insights</div>

  <div class="sw-card">
    <div class="sw-loading" id="sw-loading">
      <div class="sk sk-line sk-w50"></div>
      <div class="sk sk-hero sk-w75"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div class="sk sk-block"></div>
        <div class="sk sk-block"></div>
        <div class="sk sk-block"></div>
      </div>
      <div class="sk sk-bar-h sk-w100"></div>
      <div class="sk sk-line sk-w60"></div>
    </div>
    <div class="sw-result" id="sw-result">
      <div id="sw-src-badge"></div>
      <div id="sw-headline" style="font-size:15px;color:var(--muted);margin-bottom:16px;"></div>
      <div class="sw-numbers">
        <div class="sw-num">
          <div class="sw-num-label">25th Pct.</div>
          <div class="sw-num-val" id="sw-low"></div>
        </div>
        <div class="sw-num">
          <div class="sw-num-label">Median</div>
          <div class="sw-num-val median" id="sw-med"></div>
        </div>
        <div class="sw-num">
          <div class="sw-num-label">75th Pct.</div>
          <div class="sw-num-val" id="sw-high"></div>
        </div>
      </div>
      <div class="sw-range-bar">
        <div class="sw-range-fill" id="sw-fill"></div>
      </div>
      <div class="sw-range-labels">
        <span id="sw-range-lo"></span>
        <span id="sw-range-hi"></span>
      </div>
    </div>
    <div class="sw-error" id="sw-error" style="display:none">Could not load salary data. <a href="/salary">Try the full Salary Insights tool</a> for a custom lookup.</div>
  </div>

  <section class="sw-section">
    <h2>What affects a ${esc(role.title)}'s salary in ${esc(city.display)}?</h2>
    <p>Like most metros, ${esc(city.display)} salaries for ${esc(role.title)}s vary by years of experience, company size, industry, and the specific skills on your resume. Here are the biggest levers:</p>
    <ul>
      <li><strong>Years of experience</strong> — Senior and staff-level ${esc(role.title)}s typically earn 40–80% more than entry-level.</li>
      <li><strong>Company size</strong> — Large tech companies and enterprises pay a significant premium over startups and nonprofits in ${esc(city.display)}.</li>
      <li><strong>Specialized skills</strong> — Niche technical certifications or domain expertise (e.g., cloud, ML, compliance) command above-median pay.</li>
      <li><strong>Negotiation</strong> — Research shows candidates who negotiate starting salary increase lifetime earnings by $500K+. Come in with data.</li>
    </ul>
  </section>

  <section class="sw-section">
    <h2>${esc(role.title)} salary in other cities</h2>
    <div class="sw-other-cities">
${CITIES.filter(c => c.slug !== city.slug).slice(0,8).map(c =>
  `      <a href="/salary/${role.slug}/${c.slug}">${esc(c.display)}</a>`
).join('\n')}
    </div>
  </section>

  <section class="sw-section">
    <h2>How to earn more as a ${esc(role.title)} in ${esc(city.display)}</h2>
    <ul>
      <li>Tailor your resume to each job posting — Applio's ATS checker shows you exactly which keywords are missing.</li>
      <li>Use market data (like what you see above) to anchor salary negotiations at or above median.</li>
      <li>Get certifications that show up in high-paying job postings for this role.</li>
      <li>Target companies with above-market pay structures — check Levels.fyi and Glassdoor for company-level data.</li>
    </ul>
  </section>

  <div class="sw-cta">
    <h2>Land a higher-paying ${esc(role.title)} role</h2>
    <p>Build a resume that passes ATS filters and shows your measurable impact. Free to start, no credit card.</p>
    <a class="btn btn-primary" href="/login?mode=signup">Build your resume free</a>
    <div style="margin-top:10px;"><a href="${canonicalRole}" style="font-size:13px;color:var(--muted);">${esc(role.title)} resume examples →</a></div>
  </div>
</main>
<script>
(function(){
  var API = '${API}';
  var role = '${esc(role.query)}';
  var location = '${esc(city.name)}';

  function fmt(n, currency) {
    var cur = currency || 'USD';
    try { return new Intl.NumberFormat('en-US', { style:'currency', currency: cur, maximumFractionDigits:0 }).format(n); }
    catch(e) { return '$' + n.toLocaleString(); }
  }

  fetch(API + '/ai/salary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: role, location: location })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    document.getElementById('sw-loading').style.display = 'none';
    if (!d || !d.median) { throw new Error('no data'); }
    var cur = d.currency || 'USD';
    document.getElementById('sw-low').textContent  = fmt(d.low,  cur);
    document.getElementById('sw-med').textContent  = fmt(d.median, cur);
    document.getElementById('sw-high').textContent = fmt(d.high, cur);
    document.getElementById('sw-fill').style.width = '60%';
    document.getElementById('sw-range-lo').textContent = fmt(d.low, cur);
    document.getElementById('sw-range-hi').textContent = fmt(d.high, cur);
    var badge = document.getElementById('sw-src-badge');
    if (d.source === 'adzuna') {
      badge.innerHTML = '<span class="sw-src sw-src-live">● Live market data' + (d.sampleSize ? ' · ' + d.sampleSize.toLocaleString() + ' listings' : '') + '</span>';
    } else {
      badge.innerHTML = '<span class="sw-src sw-src-est">● AI estimate</span>';
    }
    document.getElementById('sw-headline').textContent =
      'Median annual salary for a ' + role + ' in ' + location + '. ' +
      (d.estimate ? 'AI estimate based on market patterns.' : 'Based on live job listing data.');
    document.getElementById('sw-result').classList.add('show');
  })
  .catch(function(){
    document.getElementById('sw-loading').style.display = 'none';
    document.getElementById('sw-error').style.display = 'block';
  });
})();
</script>
</body>
</html>`;
}

// Create salary hub page
function makeHubPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Salary Insights by Role &amp; City (${new Date().getFullYear()}) | Applio</title>
<meta name="description" content="Free live salary data for 20+ roles across 15 major US cities. Compare median pay, 25th, and 75th percentile salaries for your role.">
<link rel="canonical" href="${BASE}/salary">
<link rel="icon" href="/logo.ico">
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
<style>
  .sh-wrap { max-width: 800px; margin: 0 auto; padding: 32px 20px 80px; }
  .sh-wrap h1 { font-size: clamp(28px,5vw,40px); font-weight: 800; letter-spacing:-.6px; margin-bottom: 10px; }
  .sh-sub { color: var(--muted); font-size: 16px; margin-bottom: 36px; line-height: 1.6; }
  .sh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  .sh-card { border: 1px solid var(--border); border-radius: 12px; background: var(--bg-1); box-shadow: var(--sh-1); padding: 18px 16px; }
  .sh-card h2 { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
  .sh-card a { display: block; font-size: 13px; color: var(--muted); text-decoration: none; padding: 4px 0; border-bottom: 1px solid var(--border-soft, var(--border)); }
  .sh-card a:last-child { border-bottom: none; }
  .sh-card a:hover { color: var(--accent); }
  .sh-cta { margin-top: 48px; text-align: center; padding: 32px; border: 1px solid var(--border); border-radius: 14px; background: linear-gradient(180deg, rgba(99,102,241,.08), var(--bg-1)); }
  .sh-cta h2 { font-size: 20px; font-weight: 800; } .sh-cta p { color: var(--muted); margin: 8px 0 16px; }
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
<main class="sh-wrap">
  <h1>Salary Insights</h1>
  <p class="sh-sub">Live market data for 20 roles across 15 major US cities, powered by real job listings. Click any role + city to see median pay, 25th and 75th percentile.</p>
  <div class="sh-grid">
${ROLES.map(role => `    <div class="sh-card">
      <h2>${esc(role.title)}</h2>
${CITIES.slice(0,6).map(c => `      <a href="/salary/${role.slug}/${c.slug}">${esc(c.display)}</a>`).join('\n')}
      <a href="/salary/${role.slug}" style="font-weight:600;color:var(--accent);">All cities →</a>
    </div>`).join('\n')}
  </div>
  <div class="sh-cta">
    <h2>Negotiate with data</h2>
    <p>Know your market rate, then build a resume that earns it. Applio is free to start.</p>
    <a class="btn btn-primary" href="/login?mode=signup">Build resume free</a>
  </div>
</main>
</body>
</html>`;
}

// Make role hub (salary/[role]/index.html)
function makeRoleHubPage(role) {
  const title = `${role.title} Salary by City (${new Date().getFullYear()})`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | Applio</title>
<meta name="description" content="${esc(role.title)} salary data for every major US city. Compare median pay across cities and see what affects your earning potential.">
<link rel="canonical" href="${BASE}/salary/${role.slug}">
<link rel="icon" href="/logo.ico">
<link rel="stylesheet" href="/css/styles.css">
<script src="/js/theme.js"></script>
<style>
  .sr-wrap { max-width: 680px; margin: 0 auto; padding: 32px 20px 80px; }
  .sr-wrap h1 { font-size: clamp(26px,5vw,36px); font-weight: 800; letter-spacing:-.6px; margin-bottom: 10px; }
  .sr-sub { color: var(--muted); font-size: 15px; margin-bottom: 32px; }
  .sr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px,1fr)); gap: 10px; }
  .sr-grid a { display: block; padding: 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-1); font-size: 14px; font-weight: 600; text-decoration: none; color: var(--text); transition: border-color .15s; }
  .sr-grid a:hover { border-color: var(--accent); color: var(--accent); }
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
<main class="sr-wrap">
  <nav style="font-size:12.5px;color:var(--muted);margin-bottom:16px;">
    <a href="/" style="color:var(--muted)">Home</a> › <a href="/salary" style="color:var(--muted)">Salary Insights</a> › ${esc(role.title)}
  </nav>
  <h1>${esc(role.title)} Salary by City</h1>
  <p class="sr-sub">Select a city to see median pay, 25th and 75th percentile salaries for ${esc(role.title)}s, powered by live job listing data.</p>
  <div class="sr-grid">
${CITIES.map(c => `    <a href="/salary/${role.slug}/${c.slug}">${esc(c.display)}</a>`).join('\n')}
  </div>
</main>
</body>
</html>`;
}

// --- Generate files ---
let created = 0, skipped = 0;

function write(fp, content) {
  if (fs.existsSync(fp)) { skipped++; return; }
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content);
  created++;
}

// Hub
write(path.join(ROOT, 'salary', 'index.html'), makeHubPage());
console.log('  salary/index.html');

// Role hubs + city pages
for (const role of ROLES) {
  write(path.join(ROOT, 'salary', role.slug, 'index.html'), makeRoleHubPage(role));
  console.log(`  salary/${role.slug}/index.html`);
  for (const city of CITIES) {
    const fp = path.join(ROOT, 'salary', role.slug, `${city.slug}.html`);
    write(fp, makePage(role, city));
  }
  console.log(`  salary/${role.slug}/*.html (${CITIES.length} cities)`);
}

// Append new URLs to sitemap.xml
const SITEMAP = path.join(ROOT, 'sitemap.xml');
let sm = fs.readFileSync(SITEMAP, 'utf8');
const newUrls = [];
newUrls.push(`  <url><loc>${BASE}/salary</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
for (const role of ROLES) {
  newUrls.push(`  <url><loc>${BASE}/salary/${role.slug}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
  for (const city of CITIES) {
    newUrls.push(`  <url><loc>${BASE}/salary/${role.slug}/${city.slug}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
  }
}
const insert = newUrls.join('\n');
if (!sm.includes('/salary/')) {
  sm = sm.replace('</urlset>', insert + '\n</urlset>');
  fs.writeFileSync(SITEMAP, sm);
  console.log(`\nAdded ${newUrls.length} URLs to sitemap.xml`);
}

console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
console.log(`Total salary pages: ${1 + ROLES.length + ROLES.length * CITIES.length}`);
