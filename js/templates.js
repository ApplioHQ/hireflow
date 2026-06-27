// ============ Resume Template Renderers ============
// Each template renders the same data into a unique formal style.
// mini=true returns compact preview, mini=false returns full export view.
// Customize options (font, spacing, margins, section toggles) all apply.

const TEMPLATE_DEFS = [
  { id: 'consulting',   name: 'Consulting' },
  { id: 'faang',        name: 'FAANG' },
  { id: 'modern',       name: 'Modern' },
  { id: 'classic',      name: 'Classic' },
  { id: 'creative',     name: 'Creative' },
  { id: 'minimal',      name: 'Minimal' },
  { id: 'professional', name: 'Professional' },
  { id: 'tech',         name: 'Tech' },
  { id: 'executive',    name: 'Executive' },
  { id: 'compact',      name: 'Compact' },
  { id: 'elegant',      name: 'Elegant' },
  { id: 'onyx',         name: 'Onyx' },
  { id: 'slate',        name: 'Slate' },
];

const SAMPLE = {
  personal: {
    fullName: 'Your Name',
    email: 'name@email.com',
    phone: '(555) 123-4567',
    location: 'City, ST',
    linkedin: 'linkedin.com/in/you',
    github: 'github.com/you',
    website: '',
    summary: 'Results-driven professional with experience delivering measurable impact across cross-functional teams.'
  },
  experience: [
    { title: 'Senior Role', company: 'Company Name', start: '2022', end: 'Present', location: 'Remote',
      description: '• Led initiative resulting in 30% growth\n• Managed team of 8 across product launches' },
    { title: 'Previous Role', company: 'Earlier Co.', start: '2019', end: '2022', location: 'NYC',
      description: '• Built and shipped flagship feature used by 10K+ customers' }
  ],
  education: [{ school: 'University Name', degree: 'B.S.', field: 'Computer Science', gpa: '3.8', start: '2015', end: '2019' }],
  skills: { categories: [{ name:'All', items: ['Leadership','Strategy','Python','React','Communication'] }] },
  projects: [{ name: 'Project Name', tech: 'React, Node', description: 'Short summary of impact.' }],
};

const FONT_STACKS = {
  'Inter':     'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  'Helvetica': '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Georgia':   'Georgia, "Times New Roman", serif',
  'Times':     '"Times New Roman", Times, serif'
};
const SPACE_MULT  = { compact: 0.65, medium: 1.0, relaxed: 1.4 };
const MARGIN_MULT = { Narrow:  0.7,  Normal: 1.0, Wide:    1.35 };

function esc(s) { return String(s==null?'':s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// Build inline style for the root template div, sets CSS vars used inside.
function customizeStyleAttr(customize, marginsKey) {
  const c = customize || {};
  const font = FONT_STACKS[c.font];
  const space = SPACE_MULT[c.spacing] ?? 1.0;
  const margin = MARGIN_MULT[marginsKey] ?? 1.0;
  const parts = [`--app-space:${space}`, `--app-margin:${margin}`];
  if (font) {
    // Font stacks contain quoted multi-word names (e.g. "Segoe UI", "Times New Roman").
    // This string is injected into a double-quoted style="" attribute, so any double
    // quote would prematurely close the attribute and break the font. Swap to single
    // quotes (valid CSS) so the font actually registers in the preview and export.
    const safeFont = font.replace(/"/g, "'");
    parts.push(`--app-font:${safeFont}`, `font-family:${safeFont}`);
  }
  return parts.join(';');
}

// Filter out sections the user has toggled off in Customize.
function applySectionToggles(safe) {
  const s = safe.customize?.sections || {};
  const kill = key => { if (s[key] === false) safe[key] = Array.isArray(safe[key]) ? [] : { categories: [] }; };
  ['experience','education','skills','projects','certifications','awards','leadership','volunteer','publications'].forEach(kill);
  return safe;
}

function withFallback(resume, mini, marginsKey) {
  const r = resume || {};
  const empty = { fullName:'', email:'', phone:'', location:'', linkedin:'', github:'', website:'', summary:'' };
  const safe = {
    personal: Object.assign({}, empty, r.personal || {}),
    experience: Array.isArray(r.experience) ? r.experience : [],
    education: Array.isArray(r.education) ? r.education : [],
    skills: (r.skills && Array.isArray(r.skills.categories)) ? r.skills : { categories: [] },
    projects: Array.isArray(r.projects) ? r.projects : [],
    certifications: Array.isArray(r.certifications) ? r.certifications : [],
    awards: Array.isArray(r.awards) ? r.awards : [],
    leadership: Array.isArray(r.leadership) ? r.leadership : [],
    volunteer: Array.isArray(r.volunteer) ? r.volunteer : [],
    publications: Array.isArray(r.publications) ? r.publications : [],
    customize: r.customize || {},
    template: r.template || 'modern',
    _marginsKey: marginsKey
  };
  if (mini) {
    if (!safe.personal.fullName) safe.personal = Object.assign({}, SAMPLE.personal);
    if (!safe.experience.length)  safe.experience  = SAMPLE.experience;
    if (!safe.education.length)   safe.education   = SAMPLE.education;
    if (!safe.skills.categories.length) safe.skills = SAMPLE.skills;
    if (!safe.projects.length)    safe.projects    = SAMPLE.projects;
  }
  return applySectionToggles(safe);
}

// ============ Bullet engine ============
// Impact metrics worth emphasising: money, %, multipliers, magnitudes, and
// counts paired with a unit (or any 2+ digit number).
const _METRIC_RE = /(\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|million|billion)?\+?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|x\b|k\b|m\b|bn\b|million|billion|hours?|hrs?|days?|weeks?|months?|years?|users?|customers?|clients?|people|engineers?|products?|teams?|markets?|tickets?|accounts?)|\b\d{2,}\b)/gi;
// Bold metrics without breaking HTML entities: mark on raw text, escape, then
// swap the sentinels for real <strong> tags.
function metricBold(rawText) {
  const marked = String(rawText == null ? '' : rawText).replace(_METRIC_RE, '\x01$1\x02');
  return esc(marked).replace(/\x01/g, '<strong>').replace(/\x02/g, '</strong>');
}
// Turn a free-text description into professional markup: a real <ul> with
// hanging indents (multi-line / bulleted), or a clean paragraph (single line).
function bulletHTML(text) {
  const raw = String(text || '');
  if (!raw.trim()) return '';
  const lines = raw.split('\n').map(l => l.replace(/^\s*[•\-*–▪◦·]\s*/, '').trim()).filter(Boolean);
  if (!lines.length) return '';
  const hadBullets = /(^|\n)\s*[•\-*–▪◦·]\s+/.test(raw);
  if (lines.length === 1 && !hadBullets) {
    return `<div class="t-entry-desc">${metricBold(lines[0])}</div>`;
  }
  return `<ul class="t-bullets">${lines.map(l => `<li>${metricBold(l)}</li>`).join('')}</ul>`;
}

// ============ Section block builders ============
function expBlocks(exp) {
  return (exp||[]).map(e => {
    // 3-tier hierarchy: bold role on its own line, company + location beneath.
    const sub = [e.company, e.location].filter(Boolean).map(esc).join(' · ');
    return `
    <div class="t-entry">
      <div class="t-entry-head"><span class="t-entry-title">${esc(e.title)}</span><span class="t-entry-date">${esc(e.start)} – ${esc(e.end)}</span></div>
      ${sub ? `<div class="t-entry-sub">${sub}</div>` : ''}
      ${bulletHTML(e.description)}
    </div>`;
  }).join('');
}
function eduBlocks(edu) {
  return (edu||[]).map(e => `
    <div class="t-entry">
      <div class="t-entry-head"><span class="t-entry-title">${esc(e.school)}</span><span class="t-entry-date">${esc(e.start)} – ${esc(e.end)}</span></div>
      <div class="t-entry-sub">${esc(e.degree)} ${esc(e.field)}${e.gpa?' · GPA '+esc(e.gpa):''}</div>
    </div>`).join('');
}
function projBlocks(proj) {
  return (proj||[]).map(p => `
    <div class="t-entry">
      <div class="t-entry-head"><span class="t-entry-title">${esc(p.name)}</span><span class="t-entry-date">${esc(p.tech||'')}</span></div>
      ${bulletHTML(p.description)}
    </div>`).join('');
}
function listBlocks(items, fields) {
  return (items||[]).map(it => `<div class="t-entry"><div class="t-entry-head"><span class="t-entry-title">${esc(it[fields[0]])} ${it[fields[1]]?'· '+esc(it[fields[1]]):''}</span><span class="t-entry-date">${esc(it[fields[2]]||'')}</span></div>${bulletHTML(it.description)}</div>`).join('');
}
function skillsLine(skills) {
  return esc((skills?.categories||[]).flatMap(c=>c.items).join(' · '));
}

// ============ Reorderable body sections ============
// The user can reorder these in Customize (e.g. Skills before Experience). Summary
// stays pinned at the top (handled by each template's header), so it's not listed.
const BODY_SECTION_ORDER = ['experience','education','skills','projects','certifications','awards','leadership','volunteer','publications'];
// Sections that live in the MAIN column of two-column templates (skills + education
// are rendered in those templates' sidebars, so they don't participate there).
const MAIN_COLUMN_KEYS = ['experience','projects','certifications','awards','leadership','volunteer','publications'];
const SECTION_DEF = {
  experience:     { title: 'Experience',     html: r => r.experience.length ? expBlocks(r.experience) : '' },
  education:      { title: 'Education',       html: r => r.education.length ? eduBlocks(r.education) : '' },
  skills:         { title: 'Skills',          html: (r, cls) => skillsLine(r.skills) ? `<div class="${cls || 'summary'}">${skillsLine(r.skills)}</div>` : '' },
  projects:       { title: 'Projects',        html: r => r.projects.length ? projBlocks(r.projects) : '' },
  certifications: { title: 'Certifications',  html: r => r.certifications.length ? listBlocks(r.certifications, ['name','issuer','date']) : '' },
  awards:         { title: 'Awards',          html: r => r.awards.length ? listBlocks(r.awards, ['name','issuer','date']) : '' },
  leadership:     { title: 'Leadership',      html: r => r.leadership.length ? listBlocks(r.leadership, ['role','org','end']) : '' },
  volunteer:      { title: 'Volunteer',       html: r => r.volunteer.length ? listBlocks(r.volunteer, ['role','org','end']) : '' },
  publications:   { title: 'Publications',    html: r => r.publications.length ? listBlocks(r.publications, ['title','venue','date']) : '' },
};
// Section keys in the user's chosen order: honor customize.sectionOrder, then
// append any sections it doesn't mention (so new sections still appear), drop
// unknown keys.
function sectionKeysInOrder(r) {
  const saved = (r.customize && Array.isArray(r.customize.sectionOrder)) ? r.customize.sectionOrder : [];
  const seen = new Set(), out = [];
  for (const k of saved) if (SECTION_DEF[k] && !seen.has(k)) { out.push(k); seen.add(k); }
  for (const k of BODY_SECTION_ORDER) if (!seen.has(k)) out.push(k);
  return out;
}
// Render the reorderable sections (each <h2>Title</h2> + content), skipping empties.
// opts: { only:[keys], titleTag:'h2'|'h3', titles:{key:override}, titleTransform:fn, skillsClass }
function orderedBody(r, opts) {
  opts = opts || {};
  const tag = opts.titleTag || 'h2';
  const titles = opts.titles || {};
  const xform = opts.titleTransform || (s => s);
  return sectionKeysInOrder(r)
    .filter(k => !opts.only || opts.only.includes(k))
    .map(k => {
      const inner = SECTION_DEF[k].html(r, opts.skillsClass);
      return inner ? `<${tag}>${xform(titles[k] || SECTION_DEF[k].title)}</${tag}>${inner}` : '';
    }).join('');
}

// ============ TEMPLATES ============
// Each template's CSS uses var(--app-font) (falls back to its native font),
// var(--app-space, 1) for inter-section/entry gaps, and
// var(--app-margin, 1) for outer page padding.

function tModern(r, accent) {
  const c = accent || '#4f46e5';
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-modern { font-family: var(--app-font); color: #1f2937; height: 100%; }
      .t-modern .header { background: linear-gradient(135deg, ${c}, ${c}cc); color: #fff; padding: calc(6% * var(--app-margin, 1)) calc(7% * var(--app-margin, 1)) calc(5% * var(--app-margin, 1)); }
      .t-modern .name { font-size: 200%; font-weight: 700; letter-spacing: -.02em; margin-bottom: 2%; }
      .t-modern .contact { font-size: 80%; opacity: .92; display:flex; flex-wrap:wrap; gap: 2.5%; }
      .t-modern .body { padding: calc(5% * var(--app-margin, 1)) calc(7% * var(--app-margin, 1)); }
      .t-modern h2 { color: ${c}; font-size: 110%; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; margin: calc(4% * var(--app-space, 1)) 0 calc(2% * var(--app-space, 1)); border-bottom: 1px solid ${c}33; padding-bottom: 1%; }
      .t-modern .t-entry { margin-bottom: calc(3% * var(--app-space, 1)); }
      .t-modern .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 95%; }
      .t-modern .t-entry-sub { color: #4b5563; font-style: italic; font-size: 85%; }
      .t-modern .t-entry-desc { font-size: 88%; margin-top: 1%; }
      .t-modern .summary { font-size: 88%; }
    </style>
    <div class="t-modern" style="${st}">
      <div class="header">
        <div class="name">${esc(p.fullName)}</div>
        <div class="contact">
          ${p.email?`<span>${esc(p.email)}</span>`:''}
          ${p.phone?`<span>${esc(p.phone)}</span>`:''}
          ${p.location?`<span>${esc(p.location)}</span>`:''}
          ${p.linkedin?`<span>${esc(p.linkedin)}</span>`:''}
        </div>
      </div>
      <div class="body">
        ${p.summary?`<h2>Summary</h2><div class="summary">${esc(p.summary)}</div>`:''}
        ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
        ${r.education.length?`<h2>Education</h2>${eduBlocks(r.education)}`:''}
        ${skillsLine(r.skills)?`<h2>Skills</h2><div class="summary">${skillsLine(r.skills)}</div>`:''}
        ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
        ${r.certifications.length?`<h2>Certifications</h2>${listBlocks(r.certifications,['name','issuer','date'])}`:''}
        ${r.awards.length?`<h2>Awards</h2>${listBlocks(r.awards,['name','issuer','date'])}`:''}
        ${r.leadership.length?`<h2>Leadership</h2>${listBlocks(r.leadership,['role','org','end'])}`:''}
      </div>
    </div>`;
}

function tClassic(r, accent) {
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-classic { font-family: var(--app-font); color: #1a1a1a; padding: calc(5% * var(--app-margin, 1)) calc(7% * var(--app-margin, 1)); height: 100%; }
      .t-classic .name { font-size: 240%; font-weight: 700; text-align: center; letter-spacing: .02em; margin-bottom: 2%; }
      .t-classic .contact { text-align: center; font-size: 85%; padding-bottom: 3%; border-bottom: 2px solid #1a1a1a; margin-bottom: 4%; }
      .t-classic h2 { font-size: 110%; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; text-align: center; margin: calc(4% * var(--app-space, 1)) 0 calc(2% * var(--app-space, 1)); border-bottom: 1px solid #1a1a1a; padding-bottom: 1%; }
      .t-classic .t-entry { margin-bottom: calc(3% * var(--app-space, 1)); }
      .t-classic .t-entry-head { display:flex; justify-content:space-between; font-weight: 700; font-size: 95%; }
      .t-classic .t-entry-sub { font-style: italic; font-size: 88%; }
      .t-classic .t-entry-desc { font-size: 90%; margin-top: 1%; }
      .t-classic .summary { font-size: 90%; text-align: justify; }
    </style>
    <div class="t-classic" style="${st}">
      <div class="name">${esc(p.fullName)}</div>
      <div class="contact">${[p.email,p.phone,p.location,p.linkedin].filter(Boolean).map(esc).join(' | ')}</div>
      ${p.summary?`<h2>Professional Summary</h2><div class="summary">${esc(p.summary)}</div>`:''}
      ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
      ${r.education.length?`<h2>Education</h2>${eduBlocks(r.education)}`:''}
      ${skillsLine(r.skills)?`<h2>Skills</h2><div class="summary">${skillsLine(r.skills)}</div>`:''}
      ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
      ${r.certifications.length?`<h2>Certifications</h2>${listBlocks(r.certifications,['name','issuer','date'])}`:''}
    </div>`;
}

function tCreative(r, accent) {
  const c = accent || '#ec4899';
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-creative { font-family: var(--app-font); color: #1f2937; height: 100%; display: grid; grid-template-columns: 35% 65%; }
      .t-creative .sidebar { background: ${c}; color: #fff; padding: calc(5% * var(--app-margin, 1)) calc(6% * var(--app-margin, 1)); }
      .t-creative .name { font-size: 180%; font-weight: 700; line-height: 1.1; margin-bottom: 5%; }
      .t-creative .sidebar h3 { font-size: 90%; text-transform: uppercase; letter-spacing: .12em; margin: calc(6% * var(--app-space, 1)) 0 2%; opacity: .9; }
      .t-creative .sidebar .item { font-size: 80%; margin-bottom: 1%; opacity: .95; }
      .t-creative .main { padding: calc(5% * var(--app-margin, 1)) calc(6% * var(--app-margin, 1)); }
      .t-creative h2 { color: ${c}; font-size: 110%; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; margin: calc(4% * var(--app-space, 1)) 0 calc(2% * var(--app-space, 1)); }
      .t-creative h2:first-child { margin-top: 0; }
      .t-creative .t-entry { margin-bottom: calc(3% * var(--app-space, 1)); padding-left: 3%; border-left: 2px solid ${c}44; }
      .t-creative .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 92%; }
      .t-creative .t-entry-sub { color: #4b5563; font-style: italic; font-size: 82%; }
      .t-creative .t-entry-desc { font-size: 86%; margin-top: 1%; }
      .t-creative .summary { font-size: 88%; }
    </style>
    <div class="t-creative" style="${st}">
      <div class="sidebar">
        <div class="name">${esc(p.fullName)}</div>
        <h3>Contact</h3>
        ${p.email?`<div class="item">${esc(p.email)}</div>`:''}
        ${p.phone?`<div class="item">${esc(p.phone)}</div>`:''}
        ${p.location?`<div class="item">${esc(p.location)}</div>`:''}
        ${p.linkedin?`<div class="item">${esc(p.linkedin)}</div>`:''}
        ${skillsLine(r.skills)?`<h3>Skills</h3><div class="item">${skillsLine(r.skills)}</div>`:''}
        ${r.education.length?`<h3>Education</h3>${r.education.map(e=>`<div class="item"><strong>${esc(e.school)}</strong><br>${esc(e.degree)} ${esc(e.field)}</div>`).join('')}`:''}
      </div>
      <div class="main">
        ${p.summary?`<h2>About</h2><div class="summary">${esc(p.summary)}</div>`:''}
        ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
        ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
        ${r.certifications.length?`<h2>Certifications</h2>${listBlocks(r.certifications,['name','issuer','date'])}`:''}
      </div>
    </div>`;
}

function tMinimal(r, accent) {
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-minimal { font-family: var(--app-font); color: #2c2c2c; padding: calc(7% * var(--app-margin, 1)) calc(8% * var(--app-margin, 1)); height: 100%; font-weight: 300; }
      .t-minimal .name { font-size: 220%; font-weight: 200; letter-spacing: .01em; margin-bottom: 1.5%; }
      .t-minimal .contact { font-size: 80%; color: #888; display:flex; gap: 4%; flex-wrap: wrap; margin-bottom: 5%; padding-bottom: 4%; border-bottom: 1px solid #e5e5e5; }
      .t-minimal h2 { font-size: 80%; font-weight: 500; text-transform: uppercase; letter-spacing: .25em; color: #888; margin: calc(5% * var(--app-space, 1)) 0 calc(2.5% * var(--app-space, 1)); }
      .t-minimal .t-entry { margin-bottom: calc(3.5% * var(--app-space, 1)); }
      .t-minimal .t-entry-head { display:flex; justify-content:space-between; font-weight: 500; font-size: 95%; }
      .t-minimal .t-entry-sub { color: #888; font-size: 82%; margin-top: .5%; }
      .t-minimal .t-entry-desc { font-size: 88%; margin-top: 1%; color: #444; }
      .t-minimal .summary { font-size: 90%; color: #444; }
    </style>
    <div class="t-minimal" style="${st}">
      <div class="name">${esc(p.fullName)}</div>
      <div class="contact">${[p.email,p.phone,p.location,p.linkedin].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ')}</div>
      ${p.summary?`<h2>Summary</h2><div class="summary">${esc(p.summary)}</div>`:''}
      ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
      ${r.education.length?`<h2>Education</h2>${eduBlocks(r.education)}`:''}
      ${skillsLine(r.skills)?`<h2>Skills</h2><div class="summary">${skillsLine(r.skills)}</div>`:''}
      ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
    </div>`;
}

function tProfessional(r, accent) {
  const c = accent || '#0f766e';
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-professional { font-family: var(--app-font); color: #1f2937; height: 100%; display: grid; grid-template-columns: 32% 68%; }
      .t-professional .sidebar { background: ${c}; color: #fff; padding: calc(6% * var(--app-margin, 1)) calc(5% * var(--app-margin, 1)); }
      .t-professional .name { font-size: 160%; font-weight: 700; line-height: 1.15; margin-bottom: 4%; }
      .t-professional .sidebar h3 { font-size: 85%; text-transform: uppercase; letter-spacing: .12em; margin: calc(5% * var(--app-space, 1)) 0 2%; padding-bottom: 1%; border-bottom: 1px solid rgba(255,255,255,.3); }
      .t-professional .sidebar .item { font-size: 78%; margin-bottom: 1%; opacity: .95; }
      .t-professional .main { padding: calc(6% * var(--app-margin, 1)) calc(5% * var(--app-margin, 1)); }
      .t-professional h2 { color: ${c}; font-size: 105%; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; margin: calc(4% * var(--app-space, 1)) 0 calc(2% * var(--app-space, 1)); padding-bottom: 1%; border-bottom: 2px solid ${c}; }
      .t-professional h2:first-child { margin-top: 0; }
      .t-professional .t-entry { margin-bottom: calc(3% * var(--app-space, 1)); }
      .t-professional .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 92%; }
      .t-professional .t-entry-sub { color: #4b5563; font-size: 82%; }
      .t-professional .t-entry-desc { font-size: 86%; margin-top: 1%; }
      .t-professional .summary { font-size: 88%; }
    </style>
    <div class="t-professional" style="${st}">
      <div class="sidebar">
        <div class="name">${esc(p.fullName)}</div>
        <h3>Contact</h3>
        ${p.email?`<div class="item">${esc(p.email)}</div>`:''}
        ${p.phone?`<div class="item">${esc(p.phone)}</div>`:''}
        ${p.location?`<div class="item">${esc(p.location)}</div>`:''}
        ${p.linkedin?`<div class="item">${esc(p.linkedin)}</div>`:''}
        ${skillsLine(r.skills)?`<h3>Core Skills</h3><div class="item">${skillsLine(r.skills)}</div>`:''}
        ${r.education.length?`<h3>Education</h3>${r.education.map(e=>`<div class="item"><strong>${esc(e.school)}</strong><br>${esc(e.degree)} ${esc(e.field)}</div>`).join('')}`:''}
      </div>
      <div class="main">
        ${p.summary?`<h2>Professional Summary</h2><div class="summary">${esc(p.summary)}</div>`:''}
        ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
        ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
        ${r.certifications.length?`<h2>Certifications</h2>${listBlocks(r.certifications,['name','issuer','date'])}`:''}
        ${r.awards.length?`<h2>Awards</h2>${listBlocks(r.awards,['name','issuer','date'])}`:''}
      </div>
    </div>`;
}

function tTech(r, accent) {
  const c = accent || '#0ea5e9';
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-tech { font-family: var(--app-font); color: #e5e7eb; background: #0f172a; padding: calc(5% * var(--app-margin, 1)) calc(6% * var(--app-margin, 1)); height: 100%; }
      .t-tech .prompt { color: ${c}; font-size: 85%; margin-bottom: 1%; }
      .t-tech .header { display:flex; justify-content:space-between; align-items:flex-end; padding-bottom: 3%; border-bottom: 1px solid #334155; margin-bottom: 4%; }
      .t-tech .name { font-size: 200%; font-weight: 700; color: #fff; letter-spacing: -.01em; }
      .t-tech .contact { font-size: 78%; color: #94a3b8; text-align: right; }
      .t-tech .contact div { margin-bottom: 1%; }
      .t-tech h2 { color: ${c}; font-size: 100%; font-weight: 700; margin: calc(4% * var(--app-space, 1)) 0 calc(2% * var(--app-space, 1)); }
      .t-tech h2::before { content: "// "; opacity: .6; }
      .t-tech .t-entry { margin-bottom: calc(3% * var(--app-space, 1)); }
      .t-tech .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; color: #fff; font-size: 92%; }
      .t-tech .t-entry-sub { color: #94a3b8; font-size: 80%; }
      .t-tech .t-entry-desc { font-size: 84%; margin-top: 1%; color: #cbd5e1; }
      .t-tech .summary { font-size: 86%; color: #cbd5e1; }
    </style>
    <div class="t-tech" style="${st}">
      <div class="prompt">~/resume</div>
      <div class="header">
        <div class="name">${esc(p.fullName)}</div>
        <div class="contact">
          ${p.email?`<div>${esc(p.email)}</div>`:''}
          ${p.phone?`<div>${esc(p.phone)}</div>`:''}
          ${p.location?`<div>${esc(p.location)}</div>`:''}
          ${p.github?`<div>${esc(p.github)}</div>`:''}
        </div>
      </div>
      ${p.summary?`<h2>summary</h2><div class="summary">${esc(p.summary)}</div>`:''}
      ${r.experience.length?`<h2>experience</h2>${expBlocks(r.experience)}`:''}
      ${skillsLine(r.skills)?`<h2>skills</h2><div class="summary">${skillsLine(r.skills)}</div>`:''}
      ${r.projects.length?`<h2>projects</h2>${projBlocks(r.projects)}`:''}
      ${r.education.length?`<h2>education</h2>${eduBlocks(r.education)}`:''}
    </div>`;
}

function tExecutive(r, accent) {
  const c = accent || '#7c2d12';
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-executive { font-family: var(--app-font); color: #1a1a1a; background: #faf7f2; padding: calc(6% * var(--app-margin, 1)) calc(7% * var(--app-margin, 1)); height: 100%; border: 4px double ${c}; }
      .t-executive .name { font-size: 240%; font-weight: 600; color: ${c}; text-align: center; letter-spacing: .02em; margin-bottom: 1%; }
      .t-executive .subtitle { text-align: center; font-size: 80%; letter-spacing: .25em; text-transform: uppercase; color: #6b5a4a; margin-bottom: 4%; padding-bottom: 4%; border-bottom: 1px solid ${c}66; }
      .t-executive .contact { text-align: center; font-size: 82%; margin-bottom: 4%; font-style: italic; }
      .t-executive h2 { color: ${c}; font-size: 115%; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; text-align: center; margin: calc(4% * var(--app-space, 1)) 0 calc(2% * var(--app-space, 1)); }
      .t-executive .t-entry { margin-bottom: calc(3% * var(--app-space, 1)); }
      .t-executive .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 95%; }
      .t-executive .t-entry-sub { font-style: italic; font-size: 86%; color: #6b5a4a; }
      .t-executive .t-entry-desc { font-size: 90%; margin-top: 1%; }
      .t-executive .summary { font-size: 92%; text-align: justify; font-style: italic; }
    </style>
    <div class="t-executive" style="${st}">
      <div class="name">${esc(p.fullName)}</div>
      <div class="subtitle">Curriculum Vitae</div>
      <div class="contact">${[p.email,p.phone,p.location].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ')}</div>
      ${p.summary?`<h2>Profile</h2><div class="summary">${esc(p.summary)}</div>`:''}
      ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
      ${r.education.length?`<h2>Education</h2>${eduBlocks(r.education)}`:''}
      ${skillsLine(r.skills)?`<h2>Competencies</h2><div class="summary">${skillsLine(r.skills)}</div>`:''}
      ${r.awards.length?`<h2>Honors &amp; Awards</h2>${listBlocks(r.awards,['name','issuer','date'])}`:''}
    </div>`;
}

function tCompact(r, accent) {
  const c = accent || '#374151';
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-compact { font-family: var(--app-font); color: #1a1a1a; padding: calc(4% * var(--app-margin, 1)) calc(5% * var(--app-margin, 1)); height: 100%; font-size: 95%; line-height: 1.25; }
      .t-compact .name { font-size: 180%; font-weight: 800; letter-spacing: -.01em; margin-bottom: 1%; color: ${c}; }
      .t-compact .contact { font-size: 78%; color: #555; margin-bottom: 3%; padding-bottom: 2%; border-bottom: 1.5px solid ${c}; }
      .t-compact h2 { font-size: 90%; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: ${c}; margin: calc(2.5% * var(--app-space, 1)) 0 calc(1.2% * var(--app-space, 1)); }
      .t-compact .t-entry { margin-bottom: calc(1.8% * var(--app-space, 1)); }
      .t-compact .t-entry-head { display:flex; justify-content:space-between; font-weight: 700; font-size: 88%; }
      .t-compact .t-entry-sub { font-style: italic; font-size: 78%; color: #555; }
      .t-compact .t-entry-desc { font-size: 80%; margin-top: .3%; }
      .t-compact .summary { font-size: 82%; }
    </style>
    <div class="t-compact" style="${st}">
      <div class="name">${esc(p.fullName)}</div>
      <div class="contact">${[p.email,p.phone,p.location,p.linkedin].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ')}</div>
      ${p.summary?`<div class="summary">${esc(p.summary)}</div>`:''}
      ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
      ${r.education.length?`<h2>Education</h2>${eduBlocks(r.education)}`:''}
      ${skillsLine(r.skills)?`<h2>Skills</h2><div class="summary">${skillsLine(r.skills)}</div>`:''}
      ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
      ${r.certifications.length?`<h2>Certifications</h2>${listBlocks(r.certifications,['name','issuer','date'])}`:''}
    </div>`;
}

function tElegant(r, accent) {
  const c = accent || '#7c3aed';
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-elegant { font-family: var(--app-font); color: #2c2c2c; padding: calc(7% * var(--app-margin, 1)) calc(8% * var(--app-margin, 1)); height: 100%; }
      .t-elegant .subtitle { text-align: center; font-size: 75%; letter-spacing: .35em; text-transform: uppercase; color: #888; margin-bottom: 2%; }
      .t-elegant .name { font-size: 260%; font-weight: 400; color: ${c}; text-align: center; letter-spacing: .01em; line-height: 1; margin-bottom: 2%; }
      .t-elegant .name-dash { text-align: center; margin: 1% 0 4%; }
      .t-elegant .name-dash::before { content: "·"; color: ${c}; font-size: 200%; }
      .t-elegant .contact { text-align: center; font-size: 82%; margin-bottom: 5%; padding-bottom: 4%; border-bottom: 1px solid ${c}44; }
      .t-elegant h2 { color: ${c}; font-size: 105%; font-weight: 600; text-transform: uppercase; letter-spacing: .15em; text-align: center; margin: calc(5% * var(--app-space, 1)) 0 calc(2% * var(--app-space, 1)); }
      .t-elegant .t-entry { margin-bottom: calc(3% * var(--app-space, 1)); }
      .t-elegant .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 95%; }
      .t-elegant .t-entry-sub { font-style: italic; font-size: 86%; color: #666; }
      .t-elegant .t-entry-desc { font-size: 88%; margin-top: 1%; font-style: italic; color: #444; }
      .t-elegant .summary { font-size: 90%; font-style: italic; text-align: center; color: #444; }
    </style>
    <div class="t-elegant" style="${st}">
      <div class="subtitle">Curriculum Vitae</div>
      <div class="name">${esc(p.fullName)}</div>
      <div class="name-dash"></div>
      <div class="contact">${[p.email,p.phone,p.location].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ')}</div>
      ${p.summary?`<h2>Profile</h2><div class="summary">${esc(p.summary)}</div>`:''}
      ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
      ${r.education.length?`<h2>Education</h2>${eduBlocks(r.education)}`:''}
      ${skillsLine(r.skills)?`<h2>Skills</h2><div class="summary">${skillsLine(r.skills)}</div>`:''}
      ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
    </div>`;
}

function tOnyx(r, accent) {
  const c = accent || '#6366f1';
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  const skills = (r.skills.categories || []).flatMap(cat => cat.items);
  return `
    <style>
      .t-onyx { font-family: var(--app-font); color: #1f2937; height: 100%; display: grid; grid-template-columns: 34% 66%; }
      .t-onyx .rail { background: #1e2433; color: #e5e7eb; padding: calc(6% * var(--app-margin,1)) calc(6% * var(--app-margin,1)); }
      .t-onyx .name { font-size: 160%; font-weight: 700; line-height: 1.12; color: #fff; margin-bottom: 2%; }
      .t-onyx .role { font-size: 78%; color: ${c}; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 6%; }
      .t-onyx .rail h3 { font-size: 76%; text-transform: uppercase; letter-spacing: .14em; color: ${c}; margin: calc(6% * var(--app-space,1)) 0 3%; }
      .t-onyx .rail .item { font-size: 79%; margin-bottom: 1.5%; color: #cbd5e1; word-break: break-word; }
      .t-onyx .chip { display:inline-block; font-size: 75%; background: rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); border-radius: 6px; padding: 1.5% 4%; margin: 0 1.5% 1.5% 0; }
      .t-onyx .main { padding: calc(6% * var(--app-margin,1)) calc(6% * var(--app-margin,1)); }
      .t-onyx h2 { color: #111827; font-size: 106%; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; border-bottom: 2px solid ${c}; padding-bottom: 1%; margin: calc(4% * var(--app-space,1)) 0 calc(2% * var(--app-space,1)); }
      .t-onyx h2:first-child { margin-top: 0; }
      .t-onyx .t-entry { margin-bottom: calc(3% * var(--app-space,1)); }
      .t-onyx .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 92%; }
      .t-onyx .t-entry-sub { color: #4b5563; font-style: italic; font-size: 82%; }
      .t-onyx .t-entry-desc { font-size: 86%; margin-top: 1%; }
      .t-onyx .summary { font-size: 87%; }
    </style>
    <div class="t-onyx" style="${st}">
      <div class="rail">
        <div class="name">${esc(p.fullName)}</div>
        ${r.experience[0] && r.experience[0].title ? `<div class="role">${esc(r.experience[0].title)}</div>` : ''}
        <h3>Contact</h3>
        ${p.email?`<div class="item">${esc(p.email)}</div>`:''}
        ${p.phone?`<div class="item">${esc(p.phone)}</div>`:''}
        ${p.location?`<div class="item">${esc(p.location)}</div>`:''}
        ${p.linkedin?`<div class="item">${esc(p.linkedin)}</div>`:''}
        ${p.github?`<div class="item">${esc(p.github)}</div>`:''}
        ${p.website?`<div class="item">${esc(p.website)}</div>`:''}
        ${skills.length?`<h3>Skills</h3>${skills.map(s=>`<span class="chip">${esc(s)}</span>`).join('')}`:''}
        ${r.education.length?`<h3>Education</h3>${r.education.map(e=>`<div class="item"><strong style="color:#fff;">${esc(e.school)}</strong><br>${esc(e.degree)} ${esc(e.field)}${e.end?` · ${esc(e.end)}`:''}</div>`).join('')}`:''}
      </div>
      <div class="main">
        ${p.summary?`<h2>Summary</h2><div class="summary">${esc(p.summary)}</div>`:''}
        ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
        ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
        ${r.certifications.length?`<h2>Certifications</h2>${listBlocks(r.certifications,['name','issuer','date'])}`:''}
        ${r.awards.length?`<h2>Awards</h2>${listBlocks(r.awards,['name','issuer','date'])}`:''}
      </div>
    </div>`;
}

function tSlate(r, accent) {
  const c = accent || '#0ea5e9';
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-slate { font-family: var(--app-font); color: #1f2937; height: 100%; }
      .t-slate .hd { background: #0f172a; color: #fff; padding: calc(5% * var(--app-margin,1)) calc(7% * var(--app-margin,1)); display:flex; justify-content:space-between; align-items:flex-end; gap: 4%; }
      .t-slate .name { font-size: 195%; font-weight: 800; letter-spacing: -.01em; line-height: 1; }
      .t-slate .role { font-size: 80%; color: ${c}; letter-spacing: .06em; text-transform: uppercase; margin-top: 2.5%; }
      .t-slate .hd-contact { font-size: 76%; color: #cbd5e1; text-align: right; line-height: 1.7; white-space: nowrap; }
      .t-slate .body { padding: calc(4% * var(--app-margin,1)) calc(7% * var(--app-margin,1)); }
      .t-slate h2 { color: ${c}; font-size: 100%; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; margin: calc(4% * var(--app-space,1)) 0 calc(1.5% * var(--app-space,1)); padding-left: 2.5%; border-left: 3px solid ${c}; }
      .t-slate h2:first-child { margin-top: 0; }
      .t-slate .t-entry { margin-bottom: calc(2.6% * var(--app-space,1)); padding-left: 2.5%; }
      .t-slate .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 93%; }
      .t-slate .t-entry-sub { color: #4b5563; font-style: italic; font-size: 82%; }
      .t-slate .t-entry-desc { font-size: 86%; margin-top: 1%; }
      .t-slate .summary { font-size: 88%; padding-left: 2.5%; }
      .t-slate .skills { padding-left: 2.5%; font-size: 87%; }
    </style>
    <div class="t-slate" style="${st}">
      <div class="hd">
        <div>
          <div class="name">${esc(p.fullName)}</div>
          ${r.experience[0] && r.experience[0].title ? `<div class="role">${esc(r.experience[0].title)}</div>` : ''}
        </div>
        <div class="hd-contact">${[p.email,p.phone,p.location,p.linkedin].filter(Boolean).map(esc).join('<br>')}</div>
      </div>
      <div class="body">
        ${p.summary?`<h2>Summary</h2><div class="summary">${esc(p.summary)}</div>`:''}
        ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
        ${skillsLine(r.skills)?`<h2>Skills</h2><div class="skills">${skillsLine(r.skills)}</div>`:''}
        ${r.education.length?`<h2>Education</h2>${eduBlocks(r.education)}`:''}
        ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
        ${r.certifications.length?`<h2>Certifications</h2>${listBlocks(r.certifications,['name','issuer','date'])}`:''}
      </div>
    </div>`;
}

// Joined, separated contact line shared by the flagship templates.
function _contactLine(p, sep) {
  return [p.email, p.phone, p.location, p.linkedin, p.website].filter(Boolean).map(esc).join(sep);
}

// ===== Flagship: Consulting (serif, McKinsey / Harvard OCS style) =====
// Centered serif name, all-caps tracked section headers with hairline rules,
// no colour, dense-but-airy. Models the highest-signal consulting/finance format.
function tConsulting(r, accent) {
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-consulting { font-family: var(--app-font, Georgia, 'Times New Roman', serif); color:#1a1a1a; height:100%;
        padding: calc(6% * var(--app-margin,1)) calc(8% * var(--app-margin,1)); line-height:1.34; }
      .t-consulting .name { text-align:center; font-size:212%; font-weight:700; letter-spacing:.01em; }
      .t-consulting .contact { text-align:center; font-size:85%; color:#333; margin-top:1.4%; }
      .t-consulting h2 { font-size:97%; font-weight:700; text-transform:uppercase; letter-spacing:.15em;
        margin: calc(4.6% * var(--app-space,1)) 0 calc(1.6% * var(--app-space,1)); padding-bottom:.7%; border-bottom:1px solid #1a1a1a; }
      .t-consulting .t-entry { margin-bottom: calc(2.6% * var(--app-space,1)); }
      .t-consulting .t-entry-head { display:flex; justify-content:space-between; align-items:baseline; font-weight:700; font-size:98%; }
      .t-consulting .t-entry-date { font-weight:400; font-style:italic; font-size:90%; white-space:nowrap; padding-left:4%; }
      .t-consulting .t-entry-sub { font-style:italic; font-size:91%; color:#333; }
      .t-consulting .summary { font-size:95%; text-align:justify; }
    </style>
    <div class="t-consulting" style="${st}">
      <div class="name">${esc(p.fullName)}</div>
      <div class="contact">${_contactLine(p, '&nbsp;&nbsp;•&nbsp;&nbsp;')}</div>
      ${p.summary?`<h2>Summary</h2><div class="summary">${esc(p.summary)}</div>`:''}
      ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
      ${r.education.length?`<h2>Education</h2>${eduBlocks(r.education)}`:''}
      ${skillsLine(r.skills)?`<h2>Skills</h2><div class="summary">${skillsLine(r.skills)}</div>`:''}
      ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
      ${r.leadership.length?`<h2>Leadership</h2>${listBlocks(r.leadership,['role','org','end'])}`:''}
      ${r.certifications.length?`<h2>Certifications</h2>${listBlocks(r.certifications,['name','issuer','date'])}`:''}
      ${r.awards.length?`<h2>Awards</h2>${listBlocks(r.awards,['name','issuer','date'])}`:''}
    </div>`;
}

// ===== Flagship: FAANG (clean sans, "Google XYZ" style) =====
// Left-aligned grotesque, one restrained accent on name/headers, metric-bolded
// bullets (via the shared engine), single-line skills strip. ATS-friendly.
function tFaang(r, accent) {
  const c = accent || '#2563eb';
  const p = r.personal;
  const st = customizeStyleAttr(r.customize, r._marginsKey);
  return `
    <style>
      .t-faang { font-family: var(--app-font, 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); color:#202124; height:100%;
        padding: calc(5.5% * var(--app-margin,1)) calc(7% * var(--app-margin,1)); line-height:1.35; }
      .t-faang .name { font-size:202%; font-weight:800; letter-spacing:-.02em; color:#111; }
      .t-faang .contact { font-size:84%; color:#5f6368; margin-top:1.1%; }
      .t-faang h2 { font-size:88%; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:${c};
        margin: calc(4.2% * var(--app-space,1)) 0 calc(1.7% * var(--app-space,1)); }
      .t-faang h2::after { content:''; display:block; height:1.5px; background:${c}2e; margin-top:.7%; }
      .t-faang .t-entry { margin-bottom: calc(2.8% * var(--app-space,1)); }
      .t-faang .t-entry-head { display:flex; justify-content:space-between; align-items:baseline; font-weight:700; font-size:96%; color:#111; }
      .t-faang .t-entry-date { font-weight:500; color:#5f6368; font-size:88%; white-space:nowrap; padding-left:4%; }
      .t-faang .t-entry-sub { font-size:88%; color:#5f6368; }
      .t-faang .summary { font-size:90%; color:#3c4043; }
    </style>
    <div class="t-faang" style="${st}">
      <div class="name">${esc(p.fullName)}</div>
      <div class="contact">${_contactLine(p, '&nbsp;·&nbsp;')}</div>
      ${p.summary?`<h2>Summary</h2><div class="summary">${esc(p.summary)}</div>`:''}
      ${r.experience.length?`<h2>Experience</h2>${expBlocks(r.experience)}`:''}
      ${skillsLine(r.skills)?`<h2>Skills</h2><div class="summary">${skillsLine(r.skills)}</div>`:''}
      ${r.projects.length?`<h2>Projects</h2>${projBlocks(r.projects)}`:''}
      ${r.education.length?`<h2>Education</h2>${eduBlocks(r.education)}`:''}
      ${r.certifications.length?`<h2>Certifications</h2>${listBlocks(r.certifications,['name','issuer','date'])}`:''}
      ${r.awards.length?`<h2>Awards</h2>${listBlocks(r.awards,['name','issuer','date'])}`:''}
      ${r.leadership.length?`<h2>Leadership</h2>${listBlocks(r.leadership,['role','org','end'])}`:''}
    </div>`;
}

const TEMPLATE_RENDERERS = {
  consulting: tConsulting, faang: tFaang,
  modern: tModern, classic: tClassic, creative: tCreative, minimal: tMinimal,
  professional: tProfessional, tech: tTech, executive: tExecutive,
  compact: tCompact, elegant: tElegant, onyx: tOnyx, slate: tSlate
};

// Public API: render any template
// renderTemplate(templateId, resume, mini, accent, marginsKey?)
// Shared across every template + the export iframe: clean hanging-indent bullet
// lists with emphasised metrics. Inherits colour from the template root so it
// works on both light and dark templates.
const SHARED_TEMPLATE_CSS = `<style>
.t-bullets { list-style: none; margin: .4em 0 0; padding: 0; font-size: .92em; line-height: 1.42; }
.t-bullets li { position: relative; padding-left: 1.05em; margin-bottom: .28em; }
.t-bullets li:last-child { margin-bottom: 0; }
.t-bullets li::before { content: '•'; position: absolute; left: .12em; top: 0; opacity: .65; }
.t-bullets strong { font-weight: 700; }
</style>`;

function renderTemplate(templateId, resume, mini, accent, marginsKey) {
  const fn = TEMPLATE_RENDERERS[templateId] || tModern;
  const data = withFallback(resume, mini, marginsKey);
  return SHARED_TEMPLATE_CSS + fn(data, accent);
}

// ============ Isolated iframe rendering ============
// Templates emit <style> blocks with class rules that can bleed into a host
// page. Rendering them inside an iframe document keeps them fully isolated.
// One US-Letter page is 816×1056px at 96dpi; A4 is 794px wide.
function resumeDocHTML(bodyHTML, pageWidth) {
  const w = pageWidth || 816;
  const pageSize = w > 800 ? 'letter' : 'A4';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  html, body { margin:0; padding:0; background:#fff; color:#111;
    font-family:-apple-system,BlinkMacSystemFont,Inter,"Segoe UI",Roboto,sans-serif;
    /* Force background colours/gradients (template headers, sidebars) to print
       instead of being stripped by the browser's "economy" print default. */
    -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { width:${w}px;
    /* Print-grade typography: crisp rendering, real kerning/ligatures, and
       lining tabular figures so date ranges align like a typeset resume. */
    -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
    text-rendering:optimizeLegibility; font-kerning:normal;
    font-feature-settings:"kern" 1,"liga" 1,"tnum" 1,"lnum" 1;
    font-variant-numeric: lining-nums tabular-nums; }
  * { box-sizing:border-box; }
  @page { size:${pageSize}; margin:0; }
  /* Two-page support: don't split an entry across the page break, and keep a
     section heading with its content. */
  .t-entry { break-inside:avoid; page-break-inside:avoid; }
  h2, h3, h4 { break-after:avoid; page-break-after:avoid; }
</style></head><body>${bodyHTML}</body></html>`;
}

// Write resume body HTML into an iframe in fully isolated fashion.
// Returns the iframe's document.
function writeResumeFrame(frame, bodyHTML, pageWidth) {
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(resumeDocHTML(bodyHTML, pageWidth));
  doc.close();
  return doc;
}