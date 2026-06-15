// ============ HireFlow Editor ============
const API = window.HIREFLOW_CONFIG.API_URL;

const TOKEN = localStorage.getItem('hf_token');
if (!TOKEN) location.href = 'login.html';

// ---- Default state ----
const DEFAULT_RESUME = {
  template: 'modern',
  customize: {
    accent: '#4f46e5', font: 'Inter', spacing: 'medium',
    sections: { education:true, experience:true, skills:true, projects:true, certifications:true, awards:true, volunteer:false, publications:false, leadership:true }
  },
  personal: { fullName:'', email:'', phone:'', location:'', linkedin:'', github:'', website:'', summary:'' },
  experience: [], education: [], skills: { categories: [] }, projects: [],
  certifications: [], awards: [], leadership: [], volunteer: [], publications: [],
  tailor: { jobDescription:'', tailoredSummary:'' },
  versions: []
};

let resume = JSON.parse(localStorage.getItem('hf_resume') || 'null') || structuredClone(DEFAULT_RESUME);
let currentSection = 'template';

// ---- Section label/icon map ----
const SECTION_INFO = {
  template:      { label: 'Templates',      icon: 'doc' },
  personal:      { label: 'Personal Info',  icon: 'user' },
  experience:    { label: 'Experience',     icon: 'briefcase' },
  education:     { label: 'Education',      icon: 'grad' },
  skills:        { label: 'Skills',         icon: 'bolt' },
  projects:      { label: 'Projects',       icon: 'tool' },
  certifications:{ label: 'Certifications', icon: 'badge' },
  awards:        { label: 'Awards',         icon: 'trophy' },
  leadership:    { label: 'Leadership',     icon: 'team' },
  volunteer:     { label: 'Volunteer',      icon: 'heart' },
  publications:  { label: 'Publications',   icon: 'book' },
  tailor:        { label: 'Tailor to Job',  icon: 'target' },
  ats:           { label: 'ATS Check',      icon: 'check' },
  analysis:      { label: 'AI Analysis',    icon: 'beaker' },
  dashboard:     { label: 'Dashboard',      icon: 'chart' },
  customize:     { label: 'Customize',      icon: 'settings' }
};

// ---- Hydrate icons in static markup ----
function hydrate() {
  document.querySelectorAll('.sidebar-item').forEach(el => {
    const s = el.dataset.section;
    const info = SECTION_INFO[s];
    if (!info) return;
    const isPro = PRO_SECTIONS.has(s);
    const showLock = isPro && isFree();
    el.innerHTML = `${ICON(info.icon)}<span>${info.label}</span>${showLock ? `<span class="ico ico-sm" style="margin-left:auto; opacity:.7;">${ICONS.lock}</span>` : ''}`;
  });
  document.getElementById('btn-import').innerHTML = `${ICON('upload')} <span>Import</span>`;
  document.getElementById('btn-save').innerHTML = `${ICON('check')} <span>Save</span>`;
  document.getElementById('btn-export').innerHTML = `${ICON('arrowRight')} <span>Preview &amp; Export</span>`;
  document.getElementById('copilot-label').innerHTML = `${ICON('sparkle')} <span>Smart writing copilot</span>`;
  document.getElementById('rp-export').innerHTML = `${ICON('download')} <span>Export PDF</span>`;
  document.getElementById('rp-history').innerHTML = `${ICON('clock')} <span>Version History</span>`;
  document.getElementById('modal-import-title').innerHTML = `${ICON('upload','ico ico-lg')} <span style="margin-left:8px;">Import Your Resume</span>`;
  document.getElementById('modal-version-title').innerHTML = `${ICON('clock','ico ico-lg')} <span style="margin-left:8px;">Version History</span>`;
  document.getElementById('btn-import-go').innerHTML = `${ICON('sparkle')} <span>Import with AI</span>`;

  // Plan pill + download counter
  const planPill = document.getElementById('plan-pill');
  const dlPill = document.getElementById('download-pill');
  const ipTab = document.getElementById('ip-tab');
  const obadge = document.getElementById('optimize-badge');

  if (isPaid()) {
    planPill.innerHTML = `<button class="pill success" onclick="openBillingPortal()" style="cursor:pointer;">${ICON('crown','ico ico-sm')} ${planLabel()}</button>`;
    if (dlPill) dlPill.style.display = 'none';
    if (obadge) obadge.innerHTML = '';
  } else {
    planPill.innerHTML = `<a class="btn btn-primary btn-xs" href="pricing.html" style="text-decoration:none;">${ICON('sparkle','ico ico-sm')} <span>Upgrade</span></a>`;
    const left = downloadsLeft();
    if (dlPill) {
      dlPill.style.display = '';
      dlPill.innerHTML = `<span class="pill ${left<=2?'warn':''}" title="Free plan downloads">${ICON('download','ico ico-sm')} ${CURRENT_USER?.downloadsUsed || 0} / ${CURRENT_USER?.downloadLimit || 10}</span>`;
    }
    if (obadge) obadge.innerHTML = ` <span class="ico ico-sm" style="opacity:.5; vertical-align:middle;">${ICONS.lock}</span>`;
  }

  // Interview Prep tab — always visible, but show lock for free
  if (ipTab && isFree()) {
    ipTab.innerHTML = `Interview Prep <span class="ico ico-sm" style="vertical-align:middle; opacity:.6;">${ICONS.lock}</span>`;
    ipTab.onclick = (e) => { e.preventDefault(); showUpgradeModal('interview'); };
  } else if (ipTab) {
    ipTab.innerHTML = 'Interview Prep';
    ipTab.onclick = null;
  }

  // Welcome banner
  const params = new URLSearchParams(location.search);
  const welcome = params.get('welcome');
  if (welcome) {
    const b = document.getElementById('welcome-banner');
    b.style.display = '';
    b.innerHTML = `${ICON('sparkle')} <span style="margin-left:6px;">Welcome to ${welcome === 'lifetime' ? 'Lifetime' : 'Premium'}! All features are now unlocked.</span>`;
    setTimeout(() => { b.style.display = 'none'; history.replaceState(null,'','editor.html'); }, 6000);
  }
}

// ---- Sidebar (with plan gating) ----
const PRO_SECTIONS = new Set(['tailor','ats','analysis']);
const AI_RESULTS = { tailor: null, ats: null, analysis: null };
function clearAIResult(sec) {
  AI_RESULTS[sec] = null;
  if (sec === 'tailor') resume.tailor.tailoredSummary = '';
  renderMain();
}
document.querySelectorAll('.sidebar-item').forEach(item => {
  item.addEventListener('click', () => {
    const sec = item.dataset.section;
    if (PRO_SECTIONS.has(sec) && isFree()) {
      showUpgradeModal('optimize');
      return;
    }
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    currentSection = sec;
    renderMain();
  });
});

// ---- Renderers ----
const SECTIONS = {
  template: renderTemplateSection, personal: renderPersonal, experience: renderExperience,
  education: renderEducation, skills: renderSkills, projects: renderProjects,
  certifications: renderCertifications, awards: renderAwards, leadership: renderLeadership,
  volunteer: renderVolunteer, publications: renderPublications,
  tailor: renderTailor, ats: renderATS, analysis: renderAnalysis,
  dashboard: renderDashboard, customize: renderCustomize
};

function _swc(v) {
  var el = document.getElementById('swc');
  if (!el) return;
  var c = v.trim() ? v.trim().split(/\s+/).length : 0;
  el.textContent = c + ' word' + (c !== 1 ? 's' : '');
  el.style.color = c === 0 ? 'var(--muted)' : c < 20 ? 'var(--danger)' : c <= 60 ? 'var(--success)' : 'var(--warning)';
}
function renderMain() {
  document.getElementById('main').innerHTML = (SECTIONS[currentSection] || (() => '<p>Section not built yet.</p>'))();
  bindAutoSave();
  renderPreview();
  var _st = document.getElementById('sum-ta');
  if (_st) _swc(_st.value);
}

// ============ Section: Templates ============
function renderTemplateSection() {
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON('doc')} Templates</h3>
        <span class="pill">${TEMPLATE_DEFS.length} templates</span>
      </div>
      <p style="color:var(--muted); font-size:13px; margin-bottom:18px;">Choose a template. You can change colors and fonts later.</p>
      <div class="template-grid">
        ${TEMPLATE_DEFS.map(t => `
          <div class="template-card ${resume.template===t.id?'selected':''}" onclick="selectTemplate('${t.id}')">
            <div class="template-preview">${renderTemplate(t.id, resume, true, resume.customize.accent)}</div>
            <div class="template-name">${t.name}</div>
          </div>
        `).join('')}
      </div>
      <div class="action-row">
        <span></span>
        <button class="btn btn-primary" onclick="nextSection('personal')">Continue ${ICON('arrowRight')}</button>
      </div>
    </div>`;
}
function selectTemplate(id) { resume.template = id; save(); renderMain(); }

// ============ Personal ============
function renderPersonal() {
  const p = resume.personal;
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON('user')} Personal Info</h3>
        <button class="ai-btn" onclick="aiImprove('summary')">${ICON('sparkle','ico ico-sm')} AI Improve</button>
      </div>
      <div class="form-field"><label>Full Name</label><input data-bind="personal.fullName" value="${esc(p.fullName)}"></div>
      <div class="form-field"><label>Email</label><input data-bind="personal.email" value="${esc(p.email)}" type="email"></div>
      <div class="grid-2">
        <div class="form-field"><label>Phone</label><input data-bind="personal.phone" value="${esc(p.phone)}"></div>
        <div class="form-field"><label>Location</label><input data-bind="personal.location" value="${esc(p.location)}"></div>
      </div>
      <div class="grid-2">
        <div class="form-field"><label>LinkedIn URL</label><input data-bind="personal.linkedin" value="${esc(p.linkedin)}"></div>
        <div class="form-field"><label>GitHub URL</label><input data-bind="personal.github" value="${esc(p.github)}"></div>
      </div>
      <div class="form-field"><label>Personal Website</label><input data-bind="personal.website" value="${esc(p.website)}"></div>
      <div class="form-field">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
          <label style="margin-bottom:0;">Professional Summary</label>
          <span id="swc" style="font-size:11px;color:var(--muted);transition:color .2s;"></span>
        </div>
        <textarea data-bind="personal.summary" rows="4" id="sum-ta"
          placeholder="A short summary highlighting your strengths…"
          oninput="_swc(this.value)">${esc(p.summary)}</textarea>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">Aim for 40–60 words.</div>
      </div>
      ${navRow('template','experience')}
    </div>`;
}

// ============ Experience / list-style sections ============
function renderExperience() {
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON('briefcase')} Experience</h3>
        <button class="ai-btn" onclick="aiImprove('experience')">${ICON('sparkle','ico ico-sm')} AI Improve</button>
      </div>
      ${resume.experience.length === 0 ? `<div class="empty-state">No work experience added yet — add your first role to get started.</div>`
        : resume.experience.map((e,i) => itemCard('experience', i, [
            ['Job Title','title',e.title], ['Company','company',e.company],
            ['Start Date','start',e.start], ['End Date / Present','end',e.end],
            ['Location','location',e.location]
          ], 'description', e.description)).join('')}
      <button class="add-btn" onclick="addItem('experience',{title:'',company:'',start:'',end:'',location:'',description:''})">${ICON('plus','ico ico-sm')} Add Experience</button>
      ${navRow('personal','education')}
    </div>`;
}

function renderEducation() {
  return `
    <div class="section-card">
      <div class="section-head"><h3>${ICON('grad')} Education</h3></div>
      ${resume.education.length === 0 ? `<div class="empty-state">No education added yet.</div>`
        : resume.education.map((e,i) => itemCard('education', i, [
            ['School','school',e.school], ['Degree','degree',e.degree],
            ['Field of Study','field',e.field], ['GPA','gpa',e.gpa],
            ['Start','start',e.start], ['End','end',e.end]
          ], 'notes', e.notes)).join('')}
      <button class="add-btn" onclick="addItem('education',{school:'',degree:'',field:'',gpa:'',start:'',end:'',notes:''})">${ICON('plus','ico ico-sm')} Add Education</button>
      ${navRow('experience','skills')}
    </div>`;
}

function renderSkills() {
  const cats = resume.skills.categories;
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON('bolt')} Skills</h3>
        <button class="ai-btn" onclick="aiSuggestSkills()">${ICON('sparkle','ico ico-sm')} Suggest from Experience</button>
      </div>
      <div class="form-field">
        <label>Add skills (comma-separated)</label>
        <textarea id="skills-input" rows="3" placeholder="e.g. React, JavaScript, Project Management, Communication">${cats.flatMap(c=>c.items).join(', ')}</textarea>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="saveSkills()">Save Skills</button>
      <div class="tag-list" style="margin-top:14px;">
        ${cats.flatMap(c=>c.items).map(s=>`<span class="tag">${esc(s)}</span>`).join('')}
      </div>
      ${navRow('education','projects')}
    </div>`;
}
function saveSkills() {
  const raw = document.getElementById('skills-input').value;
  resume.skills.categories = [{ name:'All', items: raw.split(',').map(s=>s.trim()).filter(Boolean) }];
  save(); renderMain();
}

function renderProjects()      { return sectionList('projects','tool','Projects', resume.projects, [['Name','name'],['Role','role'],['Tech','tech'],['Link','link']], 'description', 'skills','certifications'); }
function renderCertifications(){ return sectionList('certifications','badge','Certifications', resume.certifications, [['Name','name'],['Issuer','issuer'],['Date','date'],['Credential URL','url']], null, 'projects','awards'); }
function renderAwards()        { return sectionList('awards','trophy','Awards', resume.awards, [['Name','name'],['Issuer','issuer'],['Date','date']], 'description','certifications','leadership'); }
function renderLeadership()    { return sectionList('leadership','team','Leadership', resume.leadership, [['Role','role'],['Organization','org'],['Start','start'],['End','end']], 'description','awards','volunteer'); }
function renderVolunteer()     { return sectionList('volunteer','heart','Volunteer', resume.volunteer, [['Role','role'],['Organization','org'],['Start','start'],['End','end']], 'description','leadership','publications'); }
function renderPublications()  { return sectionList('publications','book','Publications', resume.publications, [['Title','title'],['Venue','venue'],['Date','date'],['URL','url']], 'abstract','volunteer','tailor'); }

function sectionList(key, icon, title, list, fields, longField, prev, next) {
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON(icon)} ${title}</h3>
        ${longField ? `<button class="ai-btn" onclick="aiImprove('${key}')">${ICON('sparkle','ico ico-sm')} AI Improve</button>`:''}
      </div>
      ${list.length===0 ? `<div class="empty-state">No ${key} added yet.</div>` :
        list.map((it,i)=> itemCard(key, i, fields.map(f=>[f[0],f[1],it[f[1]]]), longField, longField?it[longField]:null)).join('')}
      <button class="add-btn" onclick='addItem("${key}",${JSON.stringify(blank(fields,longField))})'>${ICON('plus','ico ico-sm')} Add ${title}</button>
      ${navRow(prev,next)}
    </div>`;
}

function blank(fields, longField) { const o = {}; fields.forEach(f => o[f[1]] = ''); if (longField) o[longField] = ''; return o; }

function itemCard(key, idx, fields, longField, longValue) {
  return `
    <div class="section-card" style="background:var(--bg-2); margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:10px; align-items:center;">
        <strong style="font-size:13px;">${fields[0][2] || 'New entry'}</strong>
        <button class="btn btn-ghost btn-xs" onclick="removeItem('${key}',${idx})">${ICON('trash','ico ico-sm')} Remove</button>
      </div>
      <div class="grid-2">
        ${fields.map(f => `
          <div class="form-field"><label>${f[0]}</label><input data-bind="${key}.${idx}.${f[1]}" value="${esc(f[2]||'')}"></div>
        `).join('')}
      </div>
      ${longField ? `
        <div class="form-field">
          <label style="display:flex;justify-content:space-between;align-items:baseline;">
            <span>${longField === 'description' ? 'Description / Bullets' : longField}</span>
            ${longField === 'description' ? `<span style="font-size:11px;color:var(--muted);">Strength meter</span>` : ''}
          </label>
          <textarea data-bind="${key}.${idx}.${longField}" rows="4"
            placeholder="• Use bullets to describe achievements…"
            oninput="${longField === 'description' ? `_updateBulletMeter(this,'_bm_${key}_${idx}')` : ''}"
            id="ta_${key}_${idx}_${longField}">${esc(longValue||'')}</textarea>
          ${longField === 'description' ? `<div id="_bm_${key}_${idx}">${_renderBulletMeter(_scoreBullet(longValue||''))}</div>` : ''}
        </div>` : ''}
    </div>`;
}

// ============ Tailor / ATS / Analysis / Dashboard / Customize ============
function renderTailor() {
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON('target')} Tailor to Job</h3>
        <button class="ai-btn" onclick="aiTailor()">${ICON('sparkle','ico ico-sm')} Generate Tailored Resume</button>
      </div>
      <p style="color:var(--muted); font-size:13px; margin-bottom:12px;">Paste a job description and our AI will tailor your summary &amp; highlight the right experience.</p>
      <div class="form-field">
        <label>Job Description</label>
        <textarea data-bind="tailor.jobDescription" rows="8" placeholder="Paste the job description here…">${esc(resume.tailor.jobDescription)}</textarea>
      </div>
      <div id="tailor-result" style="margin-top:8px;">${AI_RESULTS.tailor ? _renderTailorCard(AI_RESULTS.tailor) : ''}</div>
      ${navRow('publications','ats')}
    </div>`;
}

function renderATS() {
  return `
    <div class="section-card">
      <div class="section-head"><h3>${ICON('check')} ATS Compatibility Check</h3></div>
      <p style="color:var(--muted); font-size:13px; margin-bottom:12px;">Paste a job posting and we'll score your resume's ATS match.</p>
      <div class="form-field">
        <label>Job Description</label>
        <textarea id="ats-jd" rows="5" placeholder="Paste job description…"></textarea>
      </div>
      <button class="btn btn-primary btn-block" onclick="aiATS()">${ICON('check')} Run ATS Check</button>
      <div id="ats-result" style="margin-top:16px;">${AI_RESULTS.ats ? _renderATSCard(AI_RESULTS.ats) : ''}</div>
      ${navRow('tailor','analysis')}
    </div>`;
}

function renderAnalysis() {
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON('beaker')} AI Resume Analysis</h3>
        <button class="ai-btn" onclick="aiAnalyze()">${ICON('sparkle','ico ico-sm')} Run Analysis</button>
      </div>
      <p style="color:var(--muted); font-size:13px;">Get AI-powered insights on your resume's strengths and areas to improve.</p>
      <div id="analysis-result" style="margin-top:16px;">${AI_RESULTS.analysis ? _renderAnalysisCard(AI_RESULTS.analysis) : ''}</div>
      ${navRow('ats','dashboard')}
    </div>`;
}

function renderDashboard() {
  const filled = countFilled();
  const pct = Math.round(filled.score * 100);
  return `
    <div class="section-card">
      <div class="section-head"><h3>${ICON('chart')} Dashboard</h3></div>
      <div class="grid-2" style="margin-bottom:16px;">
        <div style="background:var(--bg-2); padding:18px; border-radius:10px; border:1px solid var(--border);">
          <div style="font-size:12px; color:var(--muted);">Your Progress</div>
          <div style="font-size:36px; font-weight:700; margin-top:4px;">${pct}%</div>
        </div>
        <div style="background:var(--bg-2); padding:18px; border-radius:10px; border:1px solid var(--border);">
          <div style="font-size:12px; color:var(--muted);">Sections Completed</div>
          <div style="font-size:36px; font-weight:700; margin-top:4px;">${filled.done} / ${filled.total}</div>
        </div>
      </div>
      <div class="toggle-row" style="border:none;">
        <div><strong>Resume Completeness</strong><div style="color:var(--muted); font-size:12px;">Fill all required sections for the best results.</div></div>
        <div class="pill ${pct>=80?'success':pct>=50?'warn':'error'}">${pct>=80?'Strong':pct>=50?'In progress':'Just started'}</div>
      </div>
      <div style="margin-top:16px;">
        <strong>Selected Template:</strong> ${esc(resume.template)}
      </div>
      <div class="action-row">
        <button class="btn btn-secondary" onclick="nextSection('analysis')">${ICON('arrowLeft')} Back</button>
        <a href="export.html" class="btn btn-primary">Preview &amp; Export ${ICON('arrowRight')}</a>
      </div>
    </div>`;
}

function countFilled() {
  let done = 0;
  if (resume.personal.fullName && resume.personal.email) done++;
  if (resume.experience.length) done++;
  if (resume.education.length) done++;
  if (resume.skills.categories.length) done++;
  if (resume.projects.length) done++;
  return { done, total: 5, score: done/5 };
}

const SWATCHES = ['#4f46e5','#7c3aed','#ec4899','#0f766e','#f59e0b','#10b981','#0ea5e9','#3b82f6','#1f2937','#7c2d12'];
const FONTS = ['Inter','Helvetica','Georgia','Times'];

function renderCustomize() {
  const c = resume.customize;
  return `
    <div class="section-card">
      <div class="section-head"><h3>${ICON('settings')} Customize Template</h3></div>
      <div style="margin-bottom:18px;">
        <label style="font-size:13px; color:var(--muted);">Accent Color</label>
        <div class="swatch-grid" style="margin-top:8px;">
          ${SWATCHES.map(s=>`<div class="swatch ${c.accent===s?'selected':''}" style="background:${s};" onclick="setCustom('accent','${s}')"></div>`).join('')}
        </div>
      </div>
      <div class="form-field">
        <label>Font</label>
        <select data-bind="customize.font">${FONTS.map(f=>`<option ${c.font===f?'selected':''}>${f}</option>`).join('')}</select>
      </div>
      <div class="form-field">
        <label>Spacing</label>
        <select data-bind="customize.spacing">
          <option value="compact" ${c.spacing==='compact'?'selected':''}>Compact</option>
          <option value="medium" ${c.spacing==='medium'?'selected':''}>Medium</option>
          <option value="relaxed" ${c.spacing==='relaxed'?'selected':''}>Relaxed</option>
        </select>
      </div>
      <div style="margin-top:18px;">
        <strong>Resume Sections</strong>
        <div style="margin-top:10px;">
          ${Object.keys(c.sections).map(k=>`
            <div class="toggle-row">
              <span style="text-transform:capitalize;">${k}</span>
              <div class="toggle ${c.sections[k]?'on':''}" onclick="toggleSection('${k}')"></div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}
function setCustom(k,v) { resume.customize[k]=v; save(); renderMain(); }
function toggleSection(k){ resume.customize.sections[k]=!resume.customize.sections[k]; save(); renderMain(); }

// ============ Nav row helper ============
function navRow(prev, next) {
  return `<div class="action-row">
    ${prev ? `<button class="btn btn-secondary" onclick="nextSection('${prev}')">${ICON('arrowLeft')} Back</button>` : '<span></span>'}
    ${next ? `<button class="btn btn-primary" onclick="nextSection('${next}')">Continue ${ICON('arrowRight')}</button>` : ''}
  </div>`;
}

// ============ Preview (uses template renderer) ============
function renderPreview() {
  document.getElementById('preview').innerHTML = renderTemplate(resume.template, resume, true, resume.customize.accent);
}

// ============ Helpers ============
function nextSection(s) {
  currentSection = s;
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.toggle('active', i.dataset.section === s));
  renderMain();
}
function addItem(key, b) { resume[key].push(b); save(); renderMain(); }
function removeItem(key, idx) { resume[key].splice(idx,1); save(); renderMain(); }

let _pvTimer = null;
function bindAutoSave() {
  document.querySelectorAll('[data-bind]').forEach(function(el) {
    el.addEventListener('input', function() {
      const path = el.dataset.bind.split('.');
      let obj = resume;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = el.value;
      save();
      clearTimeout(_pvTimer);
      _pvTimer = setTimeout(renderPreview, 280);
    });
  });
}

let _dirty = false;
function save() {
  localStorage.setItem('hf_resume', JSON.stringify(resume));
  _dirty = true;
}
window.addEventListener('beforeunload', function(e) {
  if (_dirty) { e.preventDefault(); e.returnValue = ''; }
});

async function saveResume() {
  save();
  resume.versions = resume.versions || [];
  resume.versions.unshift({ ts: Date.now(), label: 'Manual save', data: JSON.parse(JSON.stringify(resume)) });
  resume.versions = resume.versions.slice(0, 10);
  save();
  try {
    await fetch(API + '/resume', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body: JSON.stringify({ resume })
    });
    toast('Saved to cloud ✓', { type: 'success' });
  } catch (e) { toast('Saved locally (offline)', { type: 'warn' }); }
}

function toast(msg, warn) {
  const m = document.createElement('div');
  m.className = 'toast';
  if (warn) m.style.background = 'var(--warning)';
  m.innerHTML = `${ICON('check')} ${msg}`;
  document.body.appendChild(m);
  setTimeout(()=>m.remove(), 1800);
}

function signOut() {
  localStorage.removeItem('hf_token');
  localStorage.removeItem('hf_email');
  location.href = 'index.html';
}


// ============ AI loading overlay ============
function _setAIBtns(off) {
  document.querySelectorAll('.ai-btn, #btn-import-go').forEach(function(b) {
    b.disabled = off; b.style.opacity = off ? '0.5' : ''; b.style.pointerEvents = off ? 'none' : '';
  });
}
function showAILoading(msg) {
  var el = document.getElementById('_aio');
  if (el) { el.querySelector('p').textContent = msg; return; }
  el = document.createElement('div'); el.id = '_aio';
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:rgba(7,9,26,.82);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
  el.innerHTML = '<style>@keyframes _sp{to{transform:rotate(360deg)}}@keyframes _pu{0%,100%{opacity:.45}50%{opacity:1}}</style>'
    + '<div style="position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center;">'
    + '<svg viewBox="0 0 60 60" style="position:absolute;inset:0;width:60px;height:60px;animation:_sp .9s linear infinite">'
    + '<circle cx="30" cy="30" r="25" fill="none" stroke="rgba(99,102,241,.2)" stroke-width="4"/>'
    + '<circle cx="30" cy="30" r="25" fill="none" stroke="#6366f1" stroke-width="4" stroke-linecap="round" stroke-dasharray="40 117"/>'
    + '</svg>'
    + '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#a5b4fc" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="position:relative;">'
    + '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'
    + '</svg></div>'
    + '<p style="margin:0;font-size:14px;font-weight:500;color:#e6e9f5;text-align:center;max-width:260px;line-height:1.5;animation:_pu 1.8s ease-in-out infinite;"></p>';
  el.querySelector('p').textContent = msg;
  document.body.appendChild(el);
  _setAIBtns(true);
}
function hideAILoading() {
  var el = document.getElementById('_aio');
  if (el) el.remove();
  _setAIBtns(false);
}

// Close-button helper — uses data attribute to avoid inline-onclick quote issues
function _closeBtn(sec) {
  return '<button class="_ai-close" data-sec="' + sec + '" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:20px;line-height:1;padding:0 4px;" title="Dismiss">\u00d7</button>';
}
document.addEventListener('click', function(e) {
  var btn = e.target.closest && e.target.closest('._ai-close');
  if (btn) clearAIResult(btn.dataset.sec);
});

// ============ AI result card renderers ============
function _renderTailorCard(data) {
  var r = data.r || {};
  var html = '<div style="border:1px solid rgba(99,102,241,.35);border-radius:12px;overflow:hidden;margin-top:4px;">';
  html += '<div style="background:rgba(99,102,241,.12);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">';
  html += '<span style="font-weight:600;font-size:13px;color:#c4b5fd;">' + ICON('sparkle','ico ico-sm') + ' AI Tailor Results</span>';
  html += _closeBtn('tailor') + '</div>';
  if (r.summary) {
    html += '<div style="padding:14px 16px;border-bottom:1px solid rgba(99,102,241,.15);">';
    html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px;">Suggested Summary</div>';
    html += '<p style="font-size:13px;line-height:1.6;color:var(--text);margin:0;">' + esc(r.summary) + '</p>';
    html += '<button class="btn btn-secondary btn-xs" style="margin-top:8px;" id="_tcopy">Copy Summary</button></div>';
  }
  if (r.matchedKeywords && r.matchedKeywords.length) {
    html += '<div style="padding:12px 16px;border-bottom:1px solid rgba(99,102,241,.1);">';
    html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px;">Matched Keywords</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    r.matchedKeywords.forEach(function(k) { html += '<span style="background:rgba(16,185,129,.15);color:#6ee7b7;padding:3px 10px;border-radius:20px;font-size:12px;">\u2713 ' + esc(k) + '</span>'; });
    html += '</div></div>';
  }
  if (r.missingKeywords && r.missingKeywords.length) {
    html += '<div style="padding:12px 16px;border-bottom:1px solid rgba(99,102,241,.1);">';
    html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px;">Missing Keywords</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    r.missingKeywords.forEach(function(k) { html += '<span style="background:rgba(239,68,68,.12);color:#fca5a5;padding:3px 10px;border-radius:20px;font-size:12px;">\u00d7 ' + esc(k) + '</span>'; });
    html += '</div></div>';
  }
  if (r.bulletSuggestions && r.bulletSuggestions.length) {
    html += '<div style="padding:12px 16px;border-bottom:1px solid rgba(99,102,241,.1);">';
    html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px;">Suggested Bullets</div>';
    r.bulletSuggestions.forEach(function(b) {
      html += '<div style="display:flex;gap:8px;padding:5px 0;font-size:13px;line-height:1.5;border-bottom:1px solid rgba(255,255,255,.04);">';
      html += '<span style="color:#6366f1;flex-shrink:0;">\u2192</span><span>' + esc(b) + '</span></div>';
    });
    html += '</div>';
  }
  var sugg = [];
  if (r.summary) sugg.push({ label: 'Update professional summary', apply: function() { resume.personal.summary = r.summary; } });
  if (r.missingKeywords && r.missingKeywords.length) sugg.push({
    label: 'Add missing keywords to Skills: ' + r.missingKeywords.slice(0,5).join(', '),
    apply: function() {
      if (!resume.skills.categories.length) resume.skills.categories.push({ name: 'All', items: [] });
      r.missingKeywords.forEach(function(kw) {
        if (!resume.skills.categories[0].items.map(function(x){return x.toLowerCase();}).includes(kw.toLowerCase()))
          resume.skills.categories[0].items.push(kw);
      });
    }
  });
  (r.bulletSuggestions || []).forEach(function(b) {
    sugg.push({ label: 'Add bullet to most recent job: "' + b.slice(0,70) + (b.length>70?'...':'') + '"',
      apply: function() {
        if (!resume.experience.length) return;
        resume.experience[0].description = (resume.experience[0].description||'') + '\n\u2022 ' + b.replace(/^[\u2022\-\*]\s*/,'');
      }
    });
  });
  if (sugg.length) {
    html += '<div style="padding:14px 16px;background:rgba(99,102,241,.06);" id="_tapply">';
    html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:10px;">Apply to Resume</div>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">';
    sugg.forEach(function(sg, i) {
      html += '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;font-size:13px;line-height:1.5;">';
      html += '<input type="checkbox" data-ti="' + i + '" checked style="margin-top:3px;accent-color:#6366f1;flex-shrink:0;"> <span>' + esc(sg.label) + '</span></label>';
    });
    html += '</div><button class="btn btn-primary btn-sm" id="_tapplybtn">Apply selected</button></div>';
    setTimeout(function() {
      var btn = document.getElementById('_tapplybtn');
      if (!btn) return;
      btn.addEventListener('click', function() {
        var count = 0;
        document.querySelectorAll('#_tapply input[type=checkbox]').forEach(function(cb) {
          if (cb.checked) { sugg[+cb.dataset.ti].apply(); count++; }
        });
        save(); renderPreview();
        toast('Applied ' + count + ' suggestion' + (count!==1?'s':''), { type: 'success' });
      });
    }, 50);
  }
  html += '</div>';
  return html;
}

function _renderATSCard(data) {
  var score = data.score || 0;
  var feedback = data.feedback || '';
  var missing = data.missingKeywords || [];
  var matched = data.matchedKeywords || [];
  var col = score>=70?'#6ee7b7':score>=50?'#fcd34d':'#fca5a5';
  var bg  = score>=70?'rgba(16,185,129,.1)':score>=50?'rgba(245,158,11,.1)':'rgba(239,68,68,.1)';
  var bdr = score>=70?'rgba(16,185,129,.3)':score>=50?'rgba(245,158,11,.3)':'rgba(239,68,68,.3)';
  var lines = feedback.split('\n');
  var summary=[], breakdown=[], wins=[], fixes=[];
  var mode='summary';
  lines.forEach(function(l) {
    var t = l.trim(); if (!t) return;
    if (t.startsWith('Breakdown:'))         { mode='bd'; return; }
    if (t.startsWith("What\u2019s working:") || t.startsWith("What\'s working:") || t.startsWith("What's working:")) { mode='wins'; return; }
    if (t.startsWith('What to fix:'))       { mode='fix'; return; }
    if (t.startsWith('Missing keywords:') || t.startsWith('Matched keywords:')) { mode='skip'; return; }
    if (mode==='summary') summary.push(t);
    else if (mode==='bd') breakdown.push(t);
    else if (mode==='wins') wins.push(t.replace(/^[\u2713\u2022\-\*]\s*/,''));
    else if (mode==='fix')  fixes.push(t.replace(/^[\u2717\u2022\-\*]\s*/,''));
  });
  var html = '<div style="border:1px solid ' + bdr + ';border-radius:12px;overflow:hidden;margin-top:4px;">';
  html += '<div style="background:' + bg + ';padding:16px 18px;display:flex;justify-content:space-between;align-items:center;">';
  html += '<div style="display:flex;align-items:center;gap:14px;">';
  html += '<div style="text-align:center;"><div style="font-size:36px;font-weight:800;color:' + col + ';line-height:1;">' + score + '</div>';
  html += '<div style="font-size:11px;color:var(--muted);">/ 100</div></div>';
  html += '<div><div style="font-weight:700;font-size:14px;color:' + col + ';margin-bottom:3px;">ATS Score</div>';
  var snip = summary.join(' ').slice(0,130);
  html += '<div style="font-size:12px;color:var(--muted);line-height:1.4;">' + esc(snip) + '</div></div></div>';
  html += _closeBtn('ats') + '</div>';
  if (breakdown.length) {
    html += '<div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.07);display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    breakdown.forEach(function(l) {
      var m = l.match(/^(.+?)\s+(\d+)\/100/);
      if (!m) return;
      var lbl = m[1].replace(/\s*\(\d+%[^)]*\)/,'').trim();
      var val = Math.min(100,Math.max(0,+m[2]));
      var bc  = val>=70?'#6ee7b7':val>=50?'#fcd34d':'#fca5a5';
      html += '<div style="background:var(--bg-2);border-radius:8px;padding:10px 12px;">';
      html += '<div style="font-size:11px;color:var(--muted);margin-bottom:6px;">' + esc(lbl) + '</div>';
      html += '<div style="display:flex;align-items:center;gap:8px;">';
      html += '<div style="flex:1;height:5px;background:rgba(255,255,255,.1);border-radius:3px;"><div style="width:' + val + '%;height:5px;background:' + bc + ';border-radius:3px;"></div></div>';
      html += '<span style="font-size:13px;font-weight:700;color:' + bc + ';min-width:26px;text-align:right;">' + val + '</span></div></div>';
    });
    html += '</div>';
  }
  if (wins.length) {
    html += '<div style="padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.07);">';
    html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px;">What\u2019s Working</div>';
    wins.forEach(function(w) { html += '<div style="display:flex;gap:8px;padding:4px 0;font-size:13px;line-height:1.5;"><span style="color:#6ee7b7;flex-shrink:0;">\u2713</span><span>' + esc(w) + '</span></div>'; });
    html += '</div>';
  }
  if (fixes.length) {
    html += '<div style="padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.07);">';
    html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px;">What to Fix</div>';
    fixes.forEach(function(f) { html += '<div style="display:flex;gap:8px;padding:4px 0;font-size:13px;line-height:1.5;"><span style="color:#fca5a5;flex-shrink:0;">\u2717</span><span>' + esc(f) + '</span></div>'; });
    html += '</div>';
  }
  if (missing.length || matched.length) {
    html += '<div style="padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.07);">';
    if (missing.length) {
      html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px;">Missing Keywords</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">';
      missing.forEach(function(k) { html += '<span style="background:rgba(239,68,68,.12);color:#fca5a5;padding:3px 10px;border-radius:20px;font-size:12px;">\u00d7 ' + esc(k) + '</span>'; });
      html += '</div>';
    }
    if (matched.length) {
      html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px;">Matched Keywords</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      matched.forEach(function(k) { html += '<span style="background:rgba(16,185,129,.12);color:#6ee7b7;padding:3px 10px;border-radius:20px;font-size:12px;">\u2713 ' + esc(k) + '</span>'; });
      html += '</div>';
    }
    html += '</div>';
  }
  if (missing.length) {
    html += '<div style="padding:14px 18px;background:rgba(99,102,241,.06);" id="_aapply">';
    html += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:10px;">Apply to Resume</div>';
    var prev = missing.slice(0,5).map(function(k){return esc(k);}).join(', ') + (missing.length>5?' + '+(missing.length-5)+' more':'');
    html += '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;font-size:13px;line-height:1.5;margin-bottom:12px;">';
    html += '<input type="checkbox" id="_aapplycb" checked style="margin-top:3px;accent-color:#6366f1;flex-shrink:0;"> <span>Add missing keywords to Skills: ' + prev + '</span></label>';
    html += '<button class="btn btn-primary btn-sm" id="_aapplybtn">Apply selected</button></div>';
    setTimeout(function() {
      var btn = document.getElementById('_aapplybtn');
      if (!btn) return;
      btn.addEventListener('click', function() {
        var cb = document.getElementById('_aapplycb');
        if (cb && cb.checked) {
          if (!resume.skills.categories.length) resume.skills.categories.push({name:'All',items:[]});
          missing.forEach(function(k) {
            if (!resume.skills.categories[0].items.map(function(x){return x.toLowerCase();}).includes(k.toLowerCase()))
              resume.skills.categories[0].items.push(k);
          });
          save(); renderPreview();
          toast('Keywords added to Skills', { type: 'success' });
        }
      });
    }, 50);
  }
  html += '</div>';
  return html;
}

function _renderAnalysisCard(data) {
  var html = '<div style="border:1px solid rgba(99,102,241,.3);border-radius:12px;overflow:hidden;">';
  html += '<div style="background:rgba(99,102,241,.1);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">';
  html += '<span style="font-weight:600;font-size:13px;color:#c4b5fd;">' + ICON('beaker','ico ico-sm') + ' AI Analysis</span>';
  html += _closeBtn('analysis') + '</div>';
  html += '<div style="padding:16px;white-space:pre-wrap;font-size:13px;line-height:1.7;color:var(--text);">' + esc(data.text||'') + '</div>';
  html += '</div>';
  return html;
}

// Clipboard helper
function _copyText(text) {
  navigator.clipboard.writeText(text).then(function() {
    toast('Copied to clipboard', { type: 'success' });
  }).catch(function() {
    toast('Copy failed', { type: 'error' });
  });
}

// ============ AI calls ============
async function ai(endpoint, body) {
  if (isFree()) { showUpgradeModal('ai'); throw new Error('Premium required'); }
  const r = await fetch(API + '/ai/' + endpoint, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
    body: JSON.stringify(body)
  });
  if (r.status === 402) { showUpgradeModal('ai'); throw new Error('Premium required'); }
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || 'Request failed (' + r.status + ')');
  }
  return r.json();
}

async function aiImprove(target) {
  try {
    showAILoading(target==='summary' ? 'Rewriting your summary...' : 'Improving your bullets...');
    const text = target==='summary' ? resume.personal.summary : JSON.stringify(resume[target]||{});
    const r = await ai('improve', { target, text });
    hideAILoading();
    if (target==='summary') {
      resume.personal.summary = r.text;
      save(); renderMain();
      toast('Summary improved \u2713', { type: 'success' });
    } else {
      await notify({ title: 'AI suggestion', body: r.text, copyable: true });
    }
  } catch(e) { hideAILoading(); if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
}

async function aiSuggestSkills() {
  try {
    showAILoading('Suggesting skills from your experience...');
    const r = await ai('skills', { experience: resume.experience });
    hideAILoading();
    const all = (r.skills||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
    if (!all.length) { toast('No skills suggested', { type: 'warn' }); return; }
    const have = new Set(resume.skills.categories.flatMap(function(c){return c.items||[];}).map(function(s){return s.toLowerCase();}));
    const fresh = all.filter(function(s){return !have.has(s.toLowerCase());});
    if (!fresh.length) { toast('All suggested skills already added', { type: 'info' }); return; }
    const wrap = document.getElementById('main'); if (!wrap) return;
    var old = document.getElementById('_skpanel'); if (old) old.remove();
    const panel = document.createElement('div');
    panel.id = '_skpanel'; panel.className = 'section-card';
    panel.style.cssText = 'margin-top:12px;border:1px solid rgba(99,102,241,.4);background:var(--bg-2);';
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;font-weight:600;font-size:13px;';
    hdr.textContent = 'AI Suggested Skills (' + fresh.length + ' new)';
    panel.appendChild(hdr);
    const listEl = document.createElement('div');
    listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:14px;';
    fresh.forEach(function(sk, i) {
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;gap:10px;align-items:center;cursor:pointer;font-size:13px;';
      const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=true; cb.dataset.i=i;
      cb.style.cssText = 'accent-color:#6366f1;flex-shrink:0;';
      const sp = document.createElement('span'); sp.textContent = sk;
      lbl.appendChild(cb); lbl.appendChild(sp); listEl.appendChild(lbl);
    });
    panel.appendChild(listEl);
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;';
    const applyBtn = document.createElement('button'); applyBtn.className='btn btn-primary btn-sm'; applyBtn.textContent='Apply selected';
    applyBtn.addEventListener('click', function() {
      var sel=[];
      panel.querySelectorAll('input[type=checkbox]').forEach(function(c){if(c.checked)sel.push(fresh[+c.dataset.i]);});
      if (!sel.length) { toast('No skills selected', {type:'warn'}); return; }
      if (!resume.skills.categories.length) resume.skills.categories.push({name:'All',items:[]});
      sel.forEach(function(sk){
        if (!resume.skills.categories[0].items.map(function(x){return x.toLowerCase();}).includes(sk.toLowerCase()))
          resume.skills.categories[0].items.push(sk);
      });
      save(); renderMain();
      toast('Added ' + sel.length + ' skill' + (sel.length!==1?'s':'') + ' \u2713', {type:'success'});
    });
    const dismissBtn = document.createElement('button'); dismissBtn.className='btn btn-ghost btn-sm'; dismissBtn.textContent='Dismiss';
    dismissBtn.addEventListener('click', function(){panel.remove();});
    row.appendChild(applyBtn); row.appendChild(dismissBtn); panel.appendChild(row);
    wrap.appendChild(panel);
  } catch(e) { hideAILoading(); if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
}

async function aiTailor() {
  try {
    showAILoading('Tailoring your resume to the job...');
    const r = await ai('tailor', { jobDescription: resume.tailor.jobDescription, resume });
    hideAILoading();
    resume.tailor.tailoredSummary = r.text || '';
    AI_RESULTS.tailor = { r: r };
    save(); renderMain();
    toast('Resume tailored \u2713', { type: 'success' });
  } catch(e) { hideAILoading(); if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
}

async function aiATS() {
  const jdEl = document.getElementById('ats-jd');
  const jd = jdEl ? jdEl.value : '';
  try {
    showAILoading('Running ATS check...');
    const r = await ai('ats', { jobDescription: jd, resume });
    hideAILoading();
    AI_RESULTS.ats = { score: r.score, feedback: r.feedback, missingKeywords: r.missingKeywords||[], matchedKeywords: r.matchedKeywords||[] };
    var el = document.getElementById('ats-result');
    if (el) el.innerHTML = _renderATSCard(AI_RESULTS.ats);
  } catch(e) { hideAILoading(); if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
}

async function aiAnalyze() {
  try {
    showAILoading('Analyzing your resume...');
    const r = await ai('analyze', { resume });
    hideAILoading();
    AI_RESULTS.analysis = { text: r.text||'' };
    var el = document.getElementById('analysis-result');
    if (el) el.innerHTML = _renderAnalysisCard(AI_RESULTS.analysis);
  } catch(e) { hideAILoading(); if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
}

async function importResume() {
  const text = document.getElementById('import-text').value;
  if (!text.trim()) return toast('Paste some text first', { type: 'warn' });
  try {
    showAILoading('Parsing your resume with AI...');
    const r = await ai('parse', { text });
    hideAILoading();
    if (r.resume) {
      resume = Object.assign(structuredClone(DEFAULT_RESUME), r.resume);
      resume.customize = Object.assign(structuredClone(DEFAULT_RESUME.customize), r.resume.customize || {});
      resume.customize.sections = Object.assign(structuredClone(DEFAULT_RESUME.customize.sections || {}), (r.resume.customize || {}).sections || {});
      resume.tailor = Object.assign(structuredClone(DEFAULT_RESUME.tailor), r.resume.tailor || {});
      resume.versions = [];
      save(); closeModal('import'); renderMain();
      toast('Resume imported \u2713', { type: 'success' });
    } else {
      toast('Could not parse resume - try cleaning up the text', { type: 'error', duration: 4500 });
    }
  } catch(e) { hideAILoading(); if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
}



function openModal(id) {
  if (id === 'import' && isFree()) { showUpgradeModal('ai'); return; }
  document.getElementById('modal-'+id).classList.add('open');
  if(id==='version') renderVersions();
}
function closeModal(id) { document.getElementById('modal-'+id).classList.remove('open'); }

function renderVersions() {
  const list = (resume.versions || []).map((v,i)=> `
    <div style="display:flex; justify-content:space-between; padding:10px; background:var(--bg-2); border-radius:8px; align-items:center;">
      <div>
        <strong>${v.label}</strong>
        <div style="color:var(--muted); font-size:12px;">${new Date(v.ts).toLocaleString()}</div>
      </div>
      <button class="btn btn-secondary btn-xs" onclick="restoreVersion(${i})">Restore</button>
    </div>`).join('');
  document.getElementById('version-list').innerHTML = list || '<p style="color:var(--muted);">No versions yet.</p>';
}
async function restoreVersion(i) {
  const ok = await confirmDialog({
    title: 'Restore this version?',
    body: 'Your current changes will be replaced with the snapshot from ' + new Date(resume.versions[i].ts).toLocaleString() + '.',
    confirmText: 'Restore',
    cancelText: 'Keep current',
    danger: true
  });
  if (!ok) return;
  resume = resume.versions[i].data; save(); closeModal('version'); renderMain();
  toast('Version restored', { type: 'success' });
}

async function importResume() {
  const text = document.getElementById('import-text').value;
  if (!text.trim()) return toast('Paste some text first', { type: 'warn' });
  try {
    toast('AI is parsing your resume…', { type: 'info', duration: 2200 });
    const r = await ai('parse', { text });
    if (r.resume) {
      resume = Object.assign(structuredClone(DEFAULT_RESUME), r.resume);
      resume.customize = Object.assign(structuredClone(DEFAULT_RESUME.customize), r.resume.customize || {});
      resume.customize.sections = Object.assign(structuredClone(DEFAULT_RESUME.customize.sections || {}), (r.resume.customize || {}).sections || {});
      resume.tailor = Object.assign(structuredClone(DEFAULT_RESUME.tailor), r.resume.tailor || {});
      resume.versions = [];
      save(); closeModal('import'); renderMain();
      toast('Resume imported \u2713', { type: 'success' });
    } else {
      toast('Could not parse resume — try cleaning up the text and re-importing', { type: 'error', duration: 4500 });
    }
  } catch(e) { if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
}


// ══════════════════════════════════════════════════════════════════
// FEATURE: Duplicate Resume
// ══════════════════════════════════════════════════════════════════
function duplicateResume() {
  const copy = JSON.parse(JSON.stringify(resume));
  copy.personal.fullName = copy.personal.fullName ? copy.personal.fullName + ' (Copy)' : 'Copy';
  copy.versions = [];
  localStorage.setItem('hf_resume_backup', localStorage.getItem('hf_resume'));
  localStorage.setItem('hf_resume', JSON.stringify(copy));
  resume = copy;
  renderMain();
  toast('Resume duplicated \u2713 — you\u2019re now editing the copy', { type: 'success', duration: 3500 });
}

// ══════════════════════════════════════════════════════════════════
// FEATURE: Recruiter Preview Mode (full-screen clean view)
// ══════════════════════════════════════════════════════════════════
function openRecruiterPreview() {
  var el = document.getElementById('_recruiter-preview');
  if (el) { el.remove(); return; }
  el = document.createElement('div');
  el.id = '_recruiter-preview';
  el.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#374151;display:flex;flex-direction:column;';
  el.innerHTML = '<div style="background:#1f2937;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">'
    + '<div style="display:flex;align-items:center;gap:12px;">'
    + '<span style="font-size:13px;font-weight:600;color:#e5e7eb;">Recruiter Preview</span>'
    + '<span style="font-size:12px;color:#9ca3af;">This is exactly what gets exported</span>'
    + '</div>'
    + '<div style="display:flex;gap:8px;align-items:center;">'
    + '<span style="font-size:12px;color:#9ca3af;">Zoom:</span>'
    + '<button onclick="_rpZoom(-0.1)" style="background:#374151;border:none;color:#e5e7eb;cursor:pointer;padding:4px 10px;border-radius:4px;font-size:13px;">\u2212</button>'
    + '<span id="_rpZoomLbl" style="font-size:12px;color:#e5e7eb;min-width:40px;text-align:center;">100%</span>'
    + '<button onclick="_rpZoom(0.1)" style="background:#374151;border:none;color:#e5e7eb;cursor:pointer;padding:4px 10px;border-radius:4px;font-size:13px;">+</button>'
    + '<button id="_rp-close" style="background:#6366f1;border:none;color:#fff;cursor:pointer;padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600;margin-left:8px;">Close</button>'
    + '</div></div>'
    + '<div style="flex:1;overflow:auto;display:flex;justify-content:center;padding:32px 20px;">'
    + '<div id="_rp-inner" style="transform-origin:top center;transition:transform .2s;">'
    + '<div id="_rp-doc" style="width:850px;background:#fff;color:#111;box-shadow:0 20px 60px rgba(0,0,0,.5);border-radius:4px;overflow:hidden;font-size:14px;line-height:1.45;"></div>'
    + '</div></div>';
  document.body.appendChild(el);
  document.getElementById('_rp-doc').innerHTML = renderTemplate(resume.template, resume, false, resume.customize.accent, 'Normal');
  el._zoom = 1.0;
  document.getElementById('_rp-close').addEventListener('click', function() { el.remove(); });
}
function _rpZoom(delta) {
  var el = document.getElementById('_recruiter-preview');
  var inner = document.getElementById('_rp-inner');
  var lbl = document.getElementById('_rpZoomLbl');
  if (!el || !inner) return;
  el._zoom = Math.max(0.4, Math.min(1.5, (el._zoom || 1.0) + delta));
  inner.style.transform = 'scale(' + el._zoom + ')';
  lbl.textContent = Math.round(el._zoom * 100) + '%';
}

// ══════════════════════════════════════════════════════════════════
// FEATURE: Bullet Strength Meter (live heuristic)
// ══════════════════════════════════════════════════════════════════
function _updateBulletMeter(textarea, meterId) {
  var score = _scoreBullet(textarea.value);
  var el = document.getElementById(meterId);
  if (el) el.innerHTML = _renderBulletMeter(score);
}

function _scoreBullet(text) {
  if (!text || !text.trim()) return null;
  const lines = text.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length > 5;});
  if (!lines.length) return null;
  var total = 0, count = 0;
  const WEAK = /^(responsible for|worked on|helped|assisted|supported|participated|involved in|duties included)/i;
  const METRIC = /\d+[%x\+]|\$[\d,]+|\d+\s*(people|users|customers|clients|members|reports|projects|sites|apps|team)/i;
  const ACTION = /^(led|built|created|designed|developed|managed|launched|delivered|increased|reduced|improved|drove|achieved|generated|negotiated|secured|established|scaled|automated|implemented|deployed|optimized|coordinated|streamlined|transformed|grew|mentored|coached|founded|executed)/i;
  lines.forEach(function(line) {
    var clean = line.replace(/^[\u2022\-\*]\s*/, '');
    var score = 50;
    if (WEAK.test(clean)) score -= 25;
    if (METRIC.test(clean)) score += 30;
    if (ACTION.test(clean)) score += 20;
    if (clean.length > 120) score -= 10;
    if (clean.length < 30) score -= 15;
    total += Math.min(100, Math.max(0, score));
    count++;
  });
  return count ? Math.round(total / count) : null;
}

function _renderBulletMeter(score) {
  if (score === null) return '';
  var col = score >= 75 ? '#6ee7b7' : score >= 50 ? '#fcd34d' : '#fca5a5';
  var label = score >= 75 ? 'Strong' : score >= 50 ? 'Could be better' : 'Needs work';
  var tip = score >= 75
    ? 'Good use of action verbs and metrics'
    : score >= 50
    ? 'Add numbers, percentages, or outcomes to strengthen'
    : 'Start bullets with action verbs and include measurable results';
  return '<div style="display:flex;align-items:center;gap:10px;margin-top:6px;padding:6px 10px;background:rgba(255,255,255,.04);border-radius:6px;">'
    + '<div style="flex:1;height:4px;background:rgba(255,255,255,.1);border-radius:2px;">'
    + '<div style="width:' + score + '%;height:4px;background:' + col + ';border-radius:2px;transition:width .3s;"></div>'
    + '</div>'
    + '<span style="font-size:11px;font-weight:600;color:' + col + ';min-width:70px;">' + label + '</span>'
    + '<span style="font-size:11px;color:var(--muted);" title="' + tip + '">?</span>'
    + '</div>';
}

// ══════════════════════════════════════════════════════════════════
// FEATURE: Compare Versions (side-by-side diff in version modal)
// ══════════════════════════════════════════════════════════════════
var _compareIdx = null;

function renderVersions() {
  const list = (resume.versions || []);
  if (!list.length) {
    document.getElementById('version-list').innerHTML = '<p style="color:var(--muted);">No versions yet.</p>';
    return;
  }
  var html = '';
  list.forEach(function(v, i) {
    var comparing = _compareIdx === i;
    html += '<div style="display:flex;justify-content:space-between;padding:10px;background:var(--bg-2);border-radius:8px;align-items:center;border:1px solid ' + (comparing ? 'rgba(99,102,241,.5)' : 'var(--border)') + ';">';
    html += '<div><strong style="font-size:13px;">' + v.label + '</strong>';
    html += '<div style="color:var(--muted);font-size:12px;margin-top:2px;">' + new Date(v.ts).toLocaleString() + '</div></div>';
    html += '<div style="display:flex;gap:6px;">';
    html += '<button class="btn btn-ghost btn-xs" id="_vcompbtn' + i + '">Compare</button>';
    html += '<button class="btn btn-secondary btn-xs" id="_vrestbtn' + i + '">Restore</button>';
    html += '</div></div>';
  });
  if (_compareIdx !== null && list[_compareIdx]) {
    html += '<div style="margin-top:16px;border:1px solid rgba(99,102,241,.3);border-radius:10px;overflow:hidden;">';
    html += '<div style="background:rgba(99,102,241,.1);padding:10px 14px;font-size:12px;font-weight:600;color:#c4b5fd;">Comparing: ' + list[_compareIdx].label + ' vs Current</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">';
    var snap = list[_compareIdx].data || {};
    var fields = [
      ['Name', (snap.personal||{}).fullName, resume.personal.fullName],
      ['Summary', (snap.personal||{}).summary, resume.personal.summary],
      ['Experience roles', ((snap.experience||[]).length).toString(), resume.experience.length.toString()],
      ['Skills', ((snap.skills||{categories:[]}).categories.flatMap(function(c){return c.items||[];})).slice(0,5).join(', '), resume.skills.categories.flatMap(function(c){return c.items||[];}).slice(0,5).join(', ')],
    ];
    html += '<div style="padding:12px 14px;border-right:1px solid rgba(99,102,241,.2);"><div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Snapshot</div>';
    fields.forEach(function(f) {
      html += '<div style="margin-bottom:8px;"><div style="font-size:11px;color:var(--muted);">' + f[0] + '</div>';
      html += '<div style="font-size:13px;color:var(--text);word-break:break-word;">' + (f[1]||'\u2014') + '</div></div>';
    });
    html += '</div>';
    html += '<div style="padding:12px 14px;"><div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Current</div>';
    fields.forEach(function(f) {
      var changed = f[1] !== f[2];
      html += '<div style="margin-bottom:8px;"><div style="font-size:11px;color:var(--muted);">' + f[0] + '</div>';
      html += '<div style="font-size:13px;color:' + (changed?'#6ee7b7':'var(--text)') + ';word-break:break-word;">' + (f[2]||'\u2014') + '</div></div>';
    });
    html += '</div></div></div>';
  }
  document.getElementById('version-list').innerHTML = html;
  list.forEach(function(v, i) {
    var compBtn = document.getElementById('_vcompbtn' + i);
    var restBtn = document.getElementById('_vrestbtn' + i);
    if (compBtn) compBtn.addEventListener('click', function() {
      _compareIdx = _compareIdx === i ? null : i;
      renderVersions();
    });
    if (restBtn) restBtn.addEventListener('click', function() { _restoreVersion(i); });
  });
}

async function _restoreVersion(i) {
  const ok = await confirmDialog({
    title: 'Restore this version?',
    body: 'Your current changes will be replaced with the snapshot from ' + new Date(resume.versions[i].ts).toLocaleString() + '.',
    confirmText: 'Restore', cancelText: 'Keep current', danger: true
  });
  if (!ok) return;
  resume = JSON.parse(JSON.stringify(resume.versions[i].data));
  save(); closeModal('version'); renderMain();
  toast('Version restored', { type: 'success' });
}

// ══════════════════════════════════════════════════════════════════
// FEATURE: Industry template recommendations
// ══════════════════════════════════════════════════════════════════
const INDUSTRY_TEMPLATES = {
  'software': { templates: ['tech','minimal','modern'], reason: 'Clean, technical layouts score best with engineering recruiters.' },
  'engineer': { templates: ['tech','minimal','modern'], reason: 'Clean, technical layouts score best with engineering recruiters.' },
  'developer': { templates: ['tech','minimal','modern'], reason: 'Clean, technical layouts score best with engineering recruiters.' },
  'design': { templates: ['creative','elegant','modern'], reason: 'Creative roles benefit from distinctive visual presentation.' },
  'product': { templates: ['modern','professional','classic'], reason: 'Product managers do best with structured, achievement-focused layouts.' },
  'marketing': { templates: ['creative','modern','elegant'], reason: 'Marketing roles reward personality-forward designs.' },
  'finance': { templates: ['classic','professional','executive'], reason: 'Finance and banking expect conservative, formal layouts.' },
  'executive': { templates: ['executive','classic','professional'], reason: 'Senior roles call for authoritative, understated layouts.' },
  'sales': { templates: ['modern','professional','compact'], reason: 'Sales roles benefit from concise, results-oriented layouts.' },
  'healthcare': { templates: ['professional','classic','minimal'], reason: 'Healthcare requires clean, professional, easy-to-scan formats.' },
  'data': { templates: ['tech','minimal','modern'], reason: 'Data roles suit structured, information-dense layouts.' },
  'teacher': { templates: ['classic','professional','elegant'], reason: 'Education roles suit traditional, readable formats.' },
};

function _getTemplateRec() {
  const role = (resume.personal.fullName || '') + ' ' + (resume.experience.map(function(e){return e.title||'';}).join(' ')).toLowerCase();
  for (var key in INDUSTRY_TEMPLATES) {
    if (role.includes(key)) return INDUSTRY_TEMPLATES[key];
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
// FEATURE: Cover Letter Generator
// ══════════════════════════════════════════════════════════════════
var _coverLetterData = null;

async function generateCoverLetter() {
  if (isFree()) { showUpgradeModal('ai'); return; }
  const jd = resume.tailor.jobDescription;
  if (!jd || jd.trim().length < 20) {
    toast('Add a job description in Tailor to Job first', { type: 'warn', duration: 3500 });
    nextSection('tailor');
    return;
  }
  try {
    showAILoading('Writing your cover letter...');
    const r = await ai('coverletter', { jobDescription: jd, resume });
    hideAILoading();
    _coverLetterData = r.text || '';
    _openCoverLetterModal();
  } catch(e) { hideAILoading(); if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
}

function _openCoverLetterModal() {
  var old = document.getElementById('_cl-modal');
  if (old) old.remove();
  var bd = document.createElement('div');
  bd.id = '_cl-modal';
  bd.className = 'modal-backdrop open';
  bd.innerHTML = '<div class="modal" style="max-width:680px;">'
    + '<button class="modal-close" id="_cl-modal-close">\u00d7</button>'
    + '<h3 style="margin-bottom:4px;">' + ICON('doc') + ' <span style="margin-left:6px;">Cover Letter</span></h3>'
    + '<p style="color:var(--muted);font-size:12px;margin-bottom:14px;">AI-generated based on your resume and the job description. Edit before using.</p>'
    + '<textarea id="_cl-text" rows="16" style="width:100%;padding:12px;background:var(--bg-2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;line-height:1.7;resize:vertical;"></textarea>'
    + '<div style="display:flex;gap:8px;margin-top:12px;">'
    + '<button class="btn btn-primary" id="_cl-copy">Copy to Clipboard</button>'
    + '<button class="btn btn-secondary" id="_cl-regen">' + ICON('sparkle','ico ico-sm') + ' Regenerate</button>'
    + '<button class="btn btn-ghost" id="_cl-modal-close">Close</button>'
    + '</div></div>';
  document.body.appendChild(bd);
  document.getElementById('_cl-text').value = _coverLetterData || '';
  document.getElementById('_cl-copy').addEventListener('click', function() {
    _copyText(document.getElementById('_cl-text').value);
  });
  document.getElementById('_cl-regen').addEventListener('click', function() {
    document.getElementById('_cl-modal').remove();
    generateCoverLetter();
  });
  var clClose = document.getElementById('_cl-modal-close');
  if (clClose) clClose.addEventListener('click', function() { bd.remove(); });
  bd.addEventListener('click', function(e) { if (e.target === bd) bd.remove(); });
}

// ══════════════════════════════════════════════════════════════════
// FEATURE: Onboarding Wizard (first-time users)
// ══════════════════════════════════════════════════════════════════
function _shouldShowOnboarding() {
  if (localStorage.getItem('hf_onboarded')) return false;
  const r = resume;
  const isEmpty = !r.personal.fullName && !r.experience.length && !r.education.length;
  return isEmpty;
}

function _openOnboarding() {
  if (!_shouldShowOnboarding()) return;
  var bd = document.createElement('div');
  bd.id = '_onboard-modal';
  bd.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(7,9,26,.92);display:flex;align-items:center;justify-content:center;padding:20px;';
  bd.innerHTML = '<div style="background:var(--bg-1);border:1px solid var(--border);border-radius:16px;max-width:520px;width:100%;padding:32px;">'
    + '<div style="text-align:center;margin-bottom:28px;">'
    + '<div style="width:56px;height:56px;background:var(--gradient);border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">'
    + '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
    + '</div>'
    + '<h2 style="font-size:22px;font-weight:800;margin-bottom:8px;">Welcome to Applio</h2>'
    + '<p style="color:var(--muted);font-size:14px;line-height:1.6;">Let\u2019s build your resume. How would you like to start?</p>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:10px;">'
    + '<button class="btn btn-primary" style="padding:14px;font-size:14px;justify-content:flex-start;" id="_ob-import">'
    + ICON('upload') + '<div style="margin-left:12px;text-align:left;"><div style="font-weight:600;">Import existing resume</div><div style="font-size:12px;opacity:.7;margin-top:2px;">Paste text and AI fills everything in seconds</div></div></button>'
    + '<button class="btn btn-secondary" style="padding:14px;font-size:14px;justify-content:flex-start;" id="_ob-scratch">'
    + ICON('doc') + '<div style="margin-left:12px;text-align:left;"><div style="font-weight:600;">Start from scratch</div><div style="font-size:12px;opacity:.7;margin-top:2px;">Fill in your details section by section</div></div></button>'
    + '<button class="btn btn-secondary" style="padding:14px;font-size:14px;justify-content:flex-start;" id="_ob-template">'
    + ICON('settings') + '<div style="margin-left:12px;text-align:left;"><div style="font-weight:600;">Pick a template first</div><div style="font-size:12px;opacity:.7;margin-top:2px;">Choose your style, then add your content</div></div></button>'
    + '</div>'
    + '<p style="text-align:center;margin-top:20px;font-size:12px;color:var(--muted);"><a href="#" id="_ob-skip" style="color:var(--muted);">Skip — I know what I\u2019m doing</a></p>'
    + '</div>';
  document.body.appendChild(bd);
  document.getElementById('_ob-import').addEventListener('click', function() {
    bd.remove(); localStorage.setItem('hf_onboarded', '1');
    openModal('import');
  });
  document.getElementById('_ob-scratch').addEventListener('click', function() {
    bd.remove(); localStorage.setItem('hf_onboarded', '1');
    nextSection('personal');
  });
  document.getElementById('_ob-template').addEventListener('click', function() {
    bd.remove(); localStorage.setItem('hf_onboarded', '1');
    nextSection('template');
  });
  document.getElementById('_ob-skip').addEventListener('click', function(e) {
    e.preventDefault(); bd.remove(); localStorage.setItem('hf_onboarded', '1');
  });
}

// ============ Boot ============
(async () => {
  await loadCurrentUser();
  hydrate();
  renderMain();
  // Show onboarding wizard for new users
  setTimeout(_openOnboarding, 600);
  // Keyboard shortcut: Escape closes recruiter preview
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var rp = document.getElementById('_recruiter-preview');
      if (rp) rp.remove();
    }
  });
})();