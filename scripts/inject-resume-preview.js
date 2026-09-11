#!/usr/bin/env node
/* Injects a live rendered resume preview iframe into existing resume-examples pages.
   Idempotent: skips pages that already have the preview. Run from repo root:
   node scripts/inject-resume-preview.js */
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.cwd(), 'resume-examples');

// Map slug → template id + role-specific filler overrides
const ROLE_MAP = {
  'software-engineer':           { tpl: 'faang',        title: 'Software Engineer' },
  'web-developer':               { tpl: 'jake',         title: 'Web Developer' },
  'devops-engineer':             { tpl: 'mit',          title: 'DevOps Engineer' },
  'data-scientist':              { tpl: 'deedy',        title: 'Data Scientist' },
  'data-analyst':                { tpl: 'cascade',      title: 'Data Analyst' },
  'data-engineer':               { tpl: 'faang',        title: 'Data Engineer' },
  'cybersecurity-analyst':       { tpl: 'mit',          title: 'Cybersecurity Analyst' },
  'ux-designer':                 { tpl: 'creative',     title: 'UX Designer' },
  'graphic-designer':            { tpl: 'slate',        title: 'Graphic Designer' },
  'interior-designer':           { tpl: 'timeline',     title: 'Interior Designer' },
  'content-writer':              { tpl: 'compact',      title: 'Content Writer' },
  'product-manager':             { tpl: 'consulting',   title: 'Product Manager' },
  'project-manager':             { tpl: 'executive',    title: 'Project Manager' },
  'business-analyst':            { tpl: 'wharton',      title: 'Business Analyst' },
  'marketing-manager':           { tpl: 'consulting',   title: 'Marketing Manager' },
  'operations-manager':          { tpl: 'professional', title: 'Operations Manager' },
  'human-resources-manager':     { tpl: 'elegant',      title: 'HR Manager' },
  'supply-chain-manager':        { tpl: 'classic',      title: 'Supply Chain Manager' },
  'sales-representative':        { tpl: 'sales',        title: 'Sales Representative' },
  'sales-marketing':             { tpl: 'sales',        title: 'Sales & Marketing Specialist' },
  'accountant':                  { tpl: 'wharton',      title: 'Accountant' },
  'financial-analyst':           { tpl: 'consulting',   title: 'Financial Analyst' },
  'financial-advisor':           { tpl: 'executive',    title: 'Financial Advisor' },
  'registered-nurse':            { tpl: 'healthcare',   title: 'Registered Nurse' },
  'medical-assistant':           { tpl: 'healthcare',   title: 'Medical Assistant' },
  'dental-hygienist':            { tpl: 'healthcare',   title: 'Dental Hygienist' },
  'physical-therapist':          { tpl: 'healthcare',   title: 'Physical Therapist' },
  'pharmacy-technician':         { tpl: 'classic',      title: 'Pharmacy Technician' },
  'teacher':                     { tpl: 'professional', title: 'Teacher' },
  'social-worker':               { tpl: 'twocolumn',    title: 'Social Worker' },
  'paralegal':                   { tpl: 'executive',    title: 'Paralegal' },
  'real-estate-agent':           { tpl: 'sales',        title: 'Real Estate Agent' },
  'event-planner':               { tpl: 'timeline',     title: 'Event Planner' },
  'administrative-assistant':    { tpl: 'minimal',      title: 'Administrative Assistant' },
  'executive-assistant':         { tpl: 'ivory',        title: 'Executive Assistant' },
  'mechanical-engineer':         { tpl: 'ats',          title: 'Mechanical Engineer' },
  'civil-engineer':              { tpl: 'ats',          title: 'Civil Engineer' },
  'electrician':                 { tpl: 'ats',          title: 'Electrician' },
  'bartender':                   { tpl: 'compact',      title: 'Bartender' },
  'customer-service-representative': { tpl: 'minimal',  title: 'Customer Service Representative' },
  'business-finance':            { tpl: 'wharton',      title: 'Business Finance Analyst' },
  'college-student':             { tpl: 'stanford',     title: 'College Student' },
  'entry-level':                 { tpl: 'harvard',      title: 'Entry Level Professional' },
  'internship':                  { tpl: 'modern',       title: 'Intern' },
  'healthcare':                  { tpl: 'healthcare',   title: 'Healthcare Professional' },
  'technology':                  { tpl: 'faang',        title: 'Technology Professional' },
};

const PREVIEW_CSS = `
  .rp-section { margin: 36px 0; }
  .rp-section h2 { font-size: 22px; font-weight: 800; letter-spacing:-.3px; margin-bottom: 14px; }
  .rp-frame-outer { position: relative; width: 100%; max-width: 680px; aspect-ratio: 8.5/11; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 28px rgba(0,0,0,.18), 0 0 0 1px var(--border); }
  .rp-frame-inner { position: absolute; top: 0; left: 0; width: 816px; height: 1056px; border: none; transform-origin: top left; }
  .rp-cta-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
  .rp-cta-note { font-size: 13px; color: var(--muted); }`;

const PREVIEW_SCRIPT = (slug, tpl, roleTitle) => `<script src="/js/templates.js"></script>
<script>
(function(){
  var outer = document.getElementById('rp-outer-${slug}');
  if (!outer || typeof renderTemplate !== 'function') return;
  var frame = document.getElementById('rp-frame-${slug}');
  var FILLER = {
    personal: {
      fullName: 'Alex Carter', email: 'alex.carter@example.com', phone: '(415) 555-0123',
      location: 'San Francisco, CA', linkedin: 'linkedin.com/in/alexcarter',
      github: 'github.com/alexcarter', website: 'alexcarter.dev',
      summary: 'Experienced ${roleTitle} with a track record of delivering measurable results. Skilled at cross-functional collaboration, data-driven decision-making, and shipping high-impact work on time.'
    },
    experience: [
      { title: 'Senior ${roleTitle}', company: 'Northwind', start: '2022', end: 'Present', location: 'Remote',
        description: '\\u2022 Led key initiatives that improved team output by 35% and reduced delivery time by 20%\\n\\u2022 Collaborated with 6 cross-functional stakeholders to ship 3 major projects on time and under budget\\n\\u2022 Mentored 2 junior team members, both promoted within 18 months' },
      { title: '${roleTitle}', company: 'Lumen Labs', start: '2019', end: '2022', location: 'San Francisco, CA',
        description: '\\u2022 Owned end-to-end delivery of 12 projects with 100% on-time completion rate\\n\\u2022 Improved key process efficiency by 28% through systematic analysis and tooling changes\\n\\u2022 Recognized as top performer two consecutive years' },
      { title: 'Junior ${roleTitle}', company: 'Bright Studio', start: '2018', end: '2019', location: 'Remote',
        description: '\\u2022 Supported 8 client engagements and contributed to proposals worth $2M+\\n\\u2022 Reduced reporting time by 40% by automating weekly status updates' }
    ],
    education: [{ school: 'UC Berkeley', degree: 'B.S.', field: 'Business Administration', gpa: '3.7', start: '2014', end: '2018' }],
    skills: { categories: [{ name: 'Core Skills', items: ['Project Management','Data Analysis','Communication','Problem Solving','Leadership'] }, { name: 'Tools', items: ['Excel','Slack','Notion','Jira','Google Suite'] }] },
    projects: [], certifications: [], awards: [], leadership: [], volunteer: [], publications: []
  };
  try {
    var html = renderTemplate('${tpl}', FILLER, false, null);
    writeResumeFrame(frame, html, 816);
  } catch(e) { console.warn('preview render failed', e); }
  function fit() {
    var w = outer.clientWidth;
    frame.style.transform = 'scale(' + (w / 816) + ')';
  }
  fit();
  window.addEventListener('resize', fit);
})();
</script>`;

function buildPreviewHTML(slug, tpl, roleTitle) {
  return `
    <section class="gd-section rp-section">
      <h2>${roleTitle} resume example</h2>
      <div class="rp-frame-outer" id="rp-outer-${slug}">
        <iframe class="rp-frame-inner" id="rp-frame-${slug}" scrolling="no"></iframe>
      </div>
      <div class="rp-cta-row">
        <a class="btn btn-primary" href="/login?mode=signup&template=${tpl}">Use this template free</a>
        <span class="rp-cta-note">No credit card · Export PDF instantly</span>
      </div>
    </section>`;
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
let updated = 0, skipped = 0;

for (const file of files) {
  const slug = file.replace('.html', '');
  const role = ROLE_MAP[slug];
  if (!role) { skipped++; continue; }

  const fp = path.join(DIR, file);
  let html = fs.readFileSync(fp, 'utf8');

  if (html.includes('rp-frame-outer') || html.includes('rp-section')) {
    skipped++;
    continue;
  }

  // Inject CSS into existing <style> block
  html = html.replace('</style>', PREVIEW_CSS + '\n</style>');

  // Inject preview section right after the gd-answer div
  const previewHTML = buildPreviewHTML(slug, role.tpl, role.title);
  html = html.replace(
    /(<\/div>\s*\n\s*<section class="gd-section">)/,
    previewHTML + '\n    $1'
  );

  // Inject script before </body>
  const script = PREVIEW_SCRIPT(slug, role.tpl, role.title);
  html = html.replace('</body>', script + '\n</body>');

  fs.writeFileSync(fp, html);
  updated++;
  console.log('  updated:', file);
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
