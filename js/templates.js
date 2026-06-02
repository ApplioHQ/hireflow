// ============ Resume Template Renderers ============
// Each template has a unique formal style. mini=true returns a compact preview
// (used in template grid + live sidebar). mini=false returns full export view.

const TEMPLATE_DEFS = [
  { id: 'modern',       name: 'Modern' },
  { id: 'classic',      name: 'Classic' },
  { id: 'creative',     name: 'Creative' },
  { id: 'minimal',      name: 'Minimal' },
  { id: 'professional', name: 'Professional' },
  { id: 'tech',         name: 'Tech' },
  { id: 'executive',    name: 'Executive' },
  { id: 'compact',      name: 'Compact' },
  { id: 'elegant',      name: 'Elegant' },
];

// Sample data for previews when no real resume exists
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

function esc(s) { return String(s==null?'':s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// Always returns a fully-populated resume object so templates never crash.
// If mini=true AND the user hasn't filled anything in, fall back to sample data.
function withFallback(resume, mini) {
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
    template: r.template || 'modern'
  };
  if (mini) {
    if (!safe.personal.fullName) safe.personal = Object.assign({}, SAMPLE.personal);
    if (!safe.experience.length)  safe.experience  = SAMPLE.experience;
    if (!safe.education.length)   safe.education   = SAMPLE.education;
    if (!safe.skills.categories.length) safe.skills = SAMPLE.skills;
    if (!safe.projects.length)    safe.projects    = SAMPLE.projects;
  }
  return safe;
}

// Common section data builders for each template
function expBlocks(exp) {
  return (exp||[]).map(e => `
    <div class="t-entry">
      <div class="t-entry-head"><span class="t-entry-title">${esc(e.title)} · ${esc(e.company)}</span><span class="t-entry-date">${esc(e.start)} – ${esc(e.end)}</span></div>
      <div class="t-entry-sub">${esc(e.location||'')}</div>
      <div class="t-entry-desc">${esc(e.description||'').replace(/\n/g,'<br>')}</div>
    </div>`).join('');
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
      <div class="t-entry-desc">${esc(p.description||'')}</div>
    </div>`).join('');
}
function listBlocks(items, fields) {
  return (items||[]).map(it => `<div class="t-entry"><div class="t-entry-head"><span class="t-entry-title">${esc(it[fields[0]])} ${it[fields[1]]?'· '+esc(it[fields[1]]):''}</span><span class="t-entry-date">${esc(it[fields[2]]||'')}</span></div>${it.description?`<div class="t-entry-desc">${esc(it.description)}</div>`:''}</div>`).join('');
}
function skillsLine(skills) {
  return esc((skills?.categories||[]).flatMap(c=>c.items).join(' · '));
}

// ============ TEMPLATES ============

function tModern(r, accent) {
  const c = accent || '#4f46e5';
  const p = r.personal;
  return `
    <style>
      .t-modern { font-family: Inter, -apple-system, sans-serif; color: #1f2937; height: 100%; }
      .t-modern .header { background: linear-gradient(135deg, ${c}, ${c}cc); color: #fff; padding: 6% 7% 5%; }
      .t-modern .name { font-size: 200%; font-weight: 700; letter-spacing: -.02em; margin-bottom: 2%; }
      .t-modern .contact { font-size: 80%; opacity: .92; display:flex; flex-wrap:wrap; gap: 2.5%; }
      .t-modern .body { padding: 5% 7%; }
      .t-modern h2 { color: ${c}; font-size: 110%; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; margin: 4% 0 2%; border-bottom: 1px solid ${c}33; padding-bottom: 1%; }
      .t-modern .t-entry { margin-bottom: 3%; }
      .t-modern .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 95%; }
      .t-modern .t-entry-sub { color: #6b7280; font-style: italic; font-size: 85%; }
      .t-modern .t-entry-desc { font-size: 88%; margin-top: 1%; }
      .t-modern .summary { font-size: 88%; }
    </style>
    <div class="t-modern">
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
  return `
    <style>
      .t-classic { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; padding: 5% 7%; height: 100%; }
      .t-classic .name { font-size: 240%; font-weight: 700; text-align: center; letter-spacing: .02em; margin-bottom: 2%; }
      .t-classic .contact { text-align: center; font-size: 85%; padding-bottom: 3%; border-bottom: 2px solid #1a1a1a; margin-bottom: 4%; }
      .t-classic h2 { font-size: 110%; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; text-align: center; margin: 4% 0 2%; border-bottom: 1px solid #1a1a1a; padding-bottom: 1%; }
      .t-classic .t-entry { margin-bottom: 3%; }
      .t-classic .t-entry-head { display:flex; justify-content:space-between; font-weight: 700; font-size: 95%; }
      .t-classic .t-entry-sub { font-style: italic; font-size: 88%; }
      .t-classic .t-entry-desc { font-size: 90%; margin-top: 1%; }
      .t-classic .summary { font-size: 90%; text-align: justify; }
    </style>
    <div class="t-classic">
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
  return `
    <style>
      .t-creative { font-family: Inter, sans-serif; color: #1f2937; height: 100%; display: grid; grid-template-columns: 35% 65%; }
      .t-creative .sidebar { background: ${c}; color: #fff; padding: 5% 6%; }
      .t-creative .name { font-size: 180%; font-weight: 700; line-height: 1.1; margin-bottom: 5%; }
      .t-creative .sidebar h3 { font-size: 90%; text-transform: uppercase; letter-spacing: .12em; margin: 6% 0 2%; opacity: .9; }
      .t-creative .sidebar .item { font-size: 80%; margin-bottom: 1%; opacity: .95; }
      .t-creative .main { padding: 5% 6%; }
      .t-creative h2 { color: ${c}; font-size: 110%; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; margin: 4% 0 2%; }
      .t-creative h2:first-child { margin-top: 0; }
      .t-creative .t-entry { margin-bottom: 3%; padding-left: 3%; border-left: 2px solid ${c}44; }
      .t-creative .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 92%; }
      .t-creative .t-entry-sub { color: #6b7280; font-style: italic; font-size: 82%; }
      .t-creative .t-entry-desc { font-size: 86%; margin-top: 1%; }
      .t-creative .summary { font-size: 88%; }
    </style>
    <div class="t-creative">
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
  return `
    <style>
      .t-minimal { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #2c2c2c; padding: 7% 8%; height: 100%; font-weight: 300; }
      .t-minimal .name { font-size: 220%; font-weight: 200; letter-spacing: .01em; margin-bottom: 1.5%; }
      .t-minimal .contact { font-size: 80%; color: #888; display:flex; gap: 4%; flex-wrap: wrap; margin-bottom: 5%; padding-bottom: 4%; border-bottom: 1px solid #e5e5e5; }
      .t-minimal h2 { font-size: 80%; font-weight: 500; text-transform: uppercase; letter-spacing: .25em; color: #888; margin: 5% 0 2.5%; }
      .t-minimal .t-entry { margin-bottom: 3.5%; }
      .t-minimal .t-entry-head { display:flex; justify-content:space-between; font-weight: 500; font-size: 95%; }
      .t-minimal .t-entry-sub { color: #888; font-size: 82%; margin-top: .5%; }
      .t-minimal .t-entry-desc { font-size: 88%; margin-top: 1%; color: #444; }
      .t-minimal .summary { font-size: 90%; color: #444; }
    </style>
    <div class="t-minimal">
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
  return `
    <style>
      .t-professional { font-family: Inter, sans-serif; color: #1f2937; height: 100%; display: grid; grid-template-columns: 32% 68%; }
      .t-professional .sidebar { background: ${c}; color: #fff; padding: 6% 5%; }
      .t-professional .name { font-size: 160%; font-weight: 700; line-height: 1.15; margin-bottom: 4%; }
      .t-professional .sidebar h3 { font-size: 85%; text-transform: uppercase; letter-spacing: .12em; margin: 5% 0 2%; padding-bottom: 1%; border-bottom: 1px solid rgba(255,255,255,.3); }
      .t-professional .sidebar .item { font-size: 78%; margin-bottom: 1%; opacity: .95; }
      .t-professional .main { padding: 6% 5%; }
      .t-professional h2 { color: ${c}; font-size: 105%; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; margin: 4% 0 2%; padding-bottom: 1%; border-bottom: 2px solid ${c}; }
      .t-professional h2:first-child { margin-top: 0; }
      .t-professional .t-entry { margin-bottom: 3%; }
      .t-professional .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 92%; }
      .t-professional .t-entry-sub { color: #6b7280; font-size: 82%; }
      .t-professional .t-entry-desc { font-size: 86%; margin-top: 1%; }
      .t-professional .summary { font-size: 88%; }
    </style>
    <div class="t-professional">
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
  return `
    <style>
      .t-tech { font-family: "JetBrains Mono", "SF Mono", Menlo, monospace; color: #e5e7eb; background: #0f172a; padding: 5% 6%; height: 100%; }
      .t-tech .prompt { color: ${c}; font-size: 85%; margin-bottom: 1%; }
      .t-tech .header { display:flex; justify-content:space-between; align-items:flex-end; padding-bottom: 3%; border-bottom: 1px solid #334155; margin-bottom: 4%; }
      .t-tech .name { font-size: 200%; font-weight: 700; color: #fff; letter-spacing: -.01em; }
      .t-tech .contact { font-size: 78%; color: #94a3b8; text-align: right; }
      .t-tech .contact div { margin-bottom: 1%; }
      .t-tech h2 { color: ${c}; font-size: 100%; font-weight: 700; margin: 4% 0 2%; }
      .t-tech h2::before { content: "// "; opacity: .6; }
      .t-tech .t-entry { margin-bottom: 3%; }
      .t-tech .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; color: #fff; font-size: 92%; }
      .t-tech .t-entry-sub { color: #94a3b8; font-size: 80%; }
      .t-tech .t-entry-desc { font-size: 84%; margin-top: 1%; color: #cbd5e1; }
      .t-tech .summary { font-size: 86%; color: #cbd5e1; }
    </style>
    <div class="t-tech">
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
  return `
    <style>
      .t-executive { font-family: "Cormorant Garamond", Georgia, serif; color: #1a1a1a; background: #faf7f2; padding: 6% 7%; height: 100%; border: 4px double ${c}; }
      .t-executive .name { font-size: 240%; font-weight: 600; color: ${c}; text-align: center; letter-spacing: .02em; margin-bottom: 1%; }
      .t-executive .subtitle { text-align: center; font-size: 80%; letter-spacing: .25em; text-transform: uppercase; color: #6b5a4a; margin-bottom: 4%; padding-bottom: 4%; border-bottom: 1px solid ${c}66; }
      .t-executive .contact { text-align: center; font-size: 82%; margin-bottom: 4%; font-style: italic; }
      .t-executive h2 { color: ${c}; font-size: 115%; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; text-align: center; margin: 4% 0 2%; }
      .t-executive .t-entry { margin-bottom: 3%; }
      .t-executive .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 95%; font-family: Georgia, serif; }
      .t-executive .t-entry-sub { font-style: italic; font-size: 86%; color: #6b5a4a; }
      .t-executive .t-entry-desc { font-size: 90%; margin-top: 1%; font-family: Georgia, serif; }
      .t-executive .summary { font-size: 92%; text-align: justify; font-style: italic; font-family: Georgia, serif; }
    </style>
    <div class="t-executive">
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
  return `
    <style>
      .t-compact { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 4% 5%; height: 100%; font-size: 95%; line-height: 1.25; }
      .t-compact .name { font-size: 180%; font-weight: 800; letter-spacing: -.01em; margin-bottom: 1%; color: ${c}; }
      .t-compact .contact { font-size: 78%; color: #555; margin-bottom: 3%; padding-bottom: 2%; border-bottom: 1.5px solid ${c}; }
      .t-compact h2 { font-size: 90%; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: ${c}; margin: 2.5% 0 1.2%; }
      .t-compact .t-entry { margin-bottom: 1.8%; }
      .t-compact .t-entry-head { display:flex; justify-content:space-between; font-weight: 700; font-size: 88%; }
      .t-compact .t-entry-sub { font-style: italic; font-size: 78%; color: #555; }
      .t-compact .t-entry-desc { font-size: 80%; margin-top: .3%; }
      .t-compact .summary { font-size: 82%; }
    </style>
    <div class="t-compact">
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
  return `
    <style>
      .t-elegant { font-family: Georgia, serif; color: #2c2c2c; padding: 7% 8%; height: 100%; }
      .t-elegant .subtitle { text-align: center; font-size: 75%; letter-spacing: .35em; text-transform: uppercase; color: #888; margin-bottom: 2%; }
      .t-elegant .name { font-size: 260%; font-weight: 400; color: ${c}; text-align: center; letter-spacing: .01em; line-height: 1; margin-bottom: 2%; }
      .t-elegant .name-dash { text-align: center; margin: 1% 0 4%; }
      .t-elegant .name-dash::before { content: "·"; color: ${c}; font-size: 200%; }
      .t-elegant .contact { text-align: center; font-size: 82%; margin-bottom: 5%; padding-bottom: 4%; border-bottom: 1px solid ${c}44; }
      .t-elegant h2 { color: ${c}; font-size: 105%; font-weight: 600; text-transform: uppercase; letter-spacing: .15em; text-align: center; margin: 5% 0 2%; }
      .t-elegant .t-entry { margin-bottom: 3%; }
      .t-elegant .t-entry-head { display:flex; justify-content:space-between; font-weight: 600; font-size: 95%; }
      .t-elegant .t-entry-sub { font-style: italic; font-size: 86%; color: #666; }
      .t-elegant .t-entry-desc { font-size: 88%; margin-top: 1%; font-style: italic; color: #444; }
      .t-elegant .summary { font-size: 90%; font-style: italic; text-align: center; color: #444; }
    </style>
    <div class="t-elegant">
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

const TEMPLATE_RENDERERS = {
  modern: tModern, classic: tClassic, creative: tCreative, minimal: tMinimal,
  professional: tProfessional, tech: tTech, executive: tExecutive,
  compact: tCompact, elegant: tElegant
};

// Public API: render any template
function renderTemplate(templateId, resume, mini, accent) {
  const fn = TEMPLATE_RENDERERS[templateId] || tModern;
  const data = withFallback(resume, mini);
  return fn(data, accent);
}
