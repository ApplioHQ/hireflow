// ============ HireFlow Editor ============
const API = window.HIREFLOW_CONFIG.API_URL;

// ---- Auth gate ----
const TOKEN = localStorage.getItem('hf_token');
if (!TOKEN) location.href = 'login.html';

// ---- State ----
const DEFAULT_RESUME = {
  template: 'modern',
  customize: {
    accent: '#4f46e5',
    font: 'Inter',
    spacing: 'medium',
    headerStyle: 'centered',
    sectionStyle: 'underline',
    sections: { education:true, experience:true, skills:true, projects:true, certifications:true, awards:true, volunteer:false, publications:false, leadership:true }
  },
  personal: { fullName:'', email:'', phone:'', location:'', linkedin:'', github:'', website:'', summary:'' },
  experience: [],
  education: [],
  skills: { categories: [] },
  projects: [],
  certifications: [],
  awards: [],
  leadership: [],
  volunteer: [],
  publications: [],
  tailor: { jobDescription:'', tailoredSummary:'' },
  versions: []
};

let resume = JSON.parse(localStorage.getItem('hf_resume') || 'null') || structuredClone(DEFAULT_RESUME);
let currentSection = 'template';

// ---- Sidebar ----
document.querySelectorAll('.sidebar-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    currentSection = item.dataset.section;
    renderMain();
  });
});

// ---- Renderers ----
const SECTIONS = {
  template: renderTemplate,
  personal: renderPersonal,
  experience: renderExperience,
  education: renderEducation,
  skills: renderSkills,
  projects: renderProjects,
  certifications: renderCertifications,
  awards: renderAwards,
  leadership: renderLeadership,
  volunteer: renderVolunteer,
  publications: renderPublications,
  tailor: renderTailor,
  ats: renderATS,
  analysis: renderAnalysis,
  dashboard: renderDashboard,
  customize: renderCustomize
};

function renderMain() {
  const main = document.getElementById('main');
  main.innerHTML = (SECTIONS[currentSection] || (() => '<p>Section not built yet.</p>'))();
  bindAutoSave();
  renderPreview();
}

// ============ Templates ============
const TEMPLATES = [
  { id:'modern', name:'Modern', color:'linear-gradient(135deg,#4f46e5,#7c3aed)' },
  { id:'classic', name:'Classic', color:'#1f2937' },
  { id:'creative', name:'Creative', color:'linear-gradient(135deg,#ec4899,#f43f5e)' },
  { id:'minimal', name:'Minimal', color:'#f3f4f6' },
  { id:'professional', name:'Professional', color:'#0f766e' },
  { id:'tech', name:'Tech', color:'#0ea5e9' },
  { id:'executive', name:'Executive', color:'#7c2d12' },
  { id:'compact', name:'Compact', color:'#4b5563' },
  { id:'elegant', name:'Elegant', color:'linear-gradient(135deg,#7c3aed,#a855f7)' }
];

function renderTemplate() {
  return `
    <div class="section-card">
      <div class="section-head"><h3>🎨 Templates</h3><span class="pill">${TEMPLATES.length} templates</span></div>
      <p style="color:var(--muted); font-size:13px; margin-bottom:16px;">Choose a template. You can customize colors and fonts later.</p>
      <div class="template-grid">
        ${TEMPLATES.map(t => `
          <div class="template-card ${resume.template===t.id?'selected':''}" onclick="selectTemplate('${t.id}')">
            <div class="template-preview" style="background:${t.color};">
              <div style="background:#fff; height:100%; padding:8px; color:#111;">
                <div style="font-weight:700; font-size:8px;">Your Name</div>
                <div style="height:1px; background:#ccc; margin:4px 0;"></div>
                <div style="font-size:5px; line-height:1.4;">Lorem ipsum dolor sit amet consectetur.</div>
              </div>
            </div>
            <div class="template-name">${t.name}</div>
          </div>
        `).join('')}
      </div>
      <div class="action-row">
        <span></span>
        <button class="btn btn-primary" onclick="nextSection('personal')">Customize →</button>
      </div>
    </div>
  `;
}
function selectTemplate(id) { resume.template = id; save(); renderMain(); }

// ============ Personal ============
function renderPersonal() {
  const p = resume.personal;
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>👤 Personal Info</h3>
        <button class="ai-btn" onclick="aiImprove('summary')">✨ AI Improve</button>
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
        <label>Professional Summary</label>
        <textarea data-bind="personal.summary" rows="4" placeholder="A short summary highlighting your strengths…">${esc(p.summary)}</textarea>
      </div>
      <div class="action-row">
        <button class="btn btn-secondary" onclick="nextSection('template')">← Back</button>
        <button class="btn btn-primary" onclick="nextSection('experience')">Continue →</button>
      </div>
    </div>
  `;
}

// ============ Experience ============
function renderExperience() {
  return `
    <div class="section-card">
      <div class="section-head"><h3>💼 Experience</h3>
        <button class="ai-btn" onclick="aiImprove('experience')">✨ AI Improve</button>
      </div>
      ${resume.experience.length === 0 ? `
        <div class="empty-state">No work experience added yet — add your first role to get started.</div>
      ` : resume.experience.map((e,i) => itemCard('experience', i, [
        ['Job Title', 'title', e.title], ['Company', 'company', e.company],
        ['Start Date', 'start', e.start], ['End Date / Present', 'end', e.end],
        ['Location', 'location', e.location]
      ], 'description', e.description)).join('')}
      <button class="add-btn" onclick="addItem('experience',{title:'',company:'',start:'',end:'',location:'',description:''})">+ Add Experience</button>
      <div class="action-row">
        <button class="btn btn-secondary" onclick="nextSection('personal')">← Back</button>
        <button class="btn btn-primary" onclick="nextSection('education')">Continue →</button>
      </div>
    </div>`;
}

// ============ Education ============
function renderEducation() {
  return `
    <div class="section-card">
      <div class="section-head"><h3>🎓 Education</h3></div>
      ${resume.education.length === 0 ? `<div class="empty-state">No education added yet.</div>` :
        resume.education.map((e,i) => itemCard('education', i, [
          ['School','school',e.school], ['Degree','degree',e.degree],
          ['Field of Study','field',e.field], ['GPA','gpa',e.gpa],
          ['Start','start',e.start], ['End','end',e.end]
        ], 'notes', e.notes)).join('')}
      <button class="add-btn" onclick="addItem('education',{school:'',degree:'',field:'',gpa:'',start:'',end:'',notes:''})">+ Add Education</button>
      <div class="action-row">
        <button class="btn btn-secondary" onclick="nextSection('experience')">← Back</button>
        <button class="btn btn-primary" onclick="nextSection('skills')">Continue →</button>
      </div>
    </div>`;
}

// ============ Skills ============
function renderSkills() {
  const cats = resume.skills.categories;
  return `
    <div class="section-card">
      <div class="section-head"><h3>⚡ Skills</h3>
        <button class="ai-btn" onclick="aiSuggestSkills()">✨ Suggest Skills from Experience</button>
      </div>
      <div class="form-field">
        <label>Add skills (comma-separated)</label>
        <textarea id="skills-input" rows="3" placeholder="e.g. React, JavaScript, Project Management, Communication">${cats.flatMap(c=>c.items).join(', ')}</textarea>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="saveSkills()">Save Skills</button>
      <div class="tag-list" style="margin-top:14px;">
        ${cats.flatMap(c=>c.items).map(s=>`<span class="tag">${esc(s)}</span>`).join('')}
      </div>
      <div class="action-row">
        <button class="btn btn-secondary" onclick="nextSection('education')">← Back</button>
        <button class="btn btn-primary" onclick="nextSection('projects')">Continue →</button>
      </div>
    </div>`;
}
function saveSkills() {
  const raw = document.getElementById('skills-input').value;
  const items = raw.split(',').map(s=>s.trim()).filter(Boolean);
  resume.skills.categories = [{ name:'All', items }];
  save(); renderMain();
}

// ============ Projects ============
function renderProjects() {
  return sectionList('projects','🛠 Projects', resume.projects, [
    ['Name','name'],['Role','role'],['Tech','tech'],['Link','link']
  ], 'description', 'education','certifications');
}
// ============ Certifications ============
function renderCertifications() {
  return sectionList('certifications','📜 Certifications', resume.certifications, [
    ['Name','name'],['Issuer','issuer'],['Date','date'],['Credential URL','url']
  ], null, 'projects','awards');
}
// ============ Awards ============
function renderAwards() {
  return sectionList('awards','🏆 Awards', resume.awards, [
    ['Name','name'],['Issuer','issuer'],['Date','date']
  ], 'description','certifications','leadership');
}
// ============ Leadership ============
function renderLeadership() {
  return sectionList('leadership','🤝 Leadership', resume.leadership, [
    ['Role','role'],['Organization','org'],['Start','start'],['End','end']
  ], 'description','awards','volunteer');
}
// ============ Volunteer ============
function renderVolunteer() {
  return sectionList('volunteer','❤️ Volunteer', resume.volunteer, [
    ['Role','role'],['Organization','org'],['Start','start'],['End','end']
  ], 'description','leadership','publications');
}
// ============ Publications ============
function renderPublications() {
  return sectionList('publications','📚 Publications', resume.publications, [
    ['Title','title'],['Venue','venue'],['Date','date'],['URL','url']
  ], 'abstract','volunteer','tailor');
}

function sectionList(key, title, list, fields, longField, prev, next) {
  return `
    <div class="section-card">
      <div class="section-head"><h3>${title}</h3>
        ${longField ? `<button class="ai-btn" onclick="aiImprove('${key}')">✨ AI Improve</button>`:''}
      </div>
      ${list.length===0 ? `<div class="empty-state">No ${key} added yet.</div>` :
        list.map((it,i)=> itemCard(key, i, fields.map(f=>[f[0],f[1],it[f[1]]]), longField, longField?it[longField]:null)).join('')}
      <button class="add-btn" onclick='addItem("${key}",${JSON.stringify(blank(fields,longField))})'>+ Add ${title.split(' ')[1]}</button>
      <div class="action-row">
        <button class="btn btn-secondary" onclick="nextSection('${prev}')">← Back</button>
        <button class="btn btn-primary" onclick="nextSection('${next}')">Continue →</button>
      </div>
    </div>`;
}

function blank(fields, longField) {
  const o = {}; fields.forEach(f => o[f[1]] = ''); if (longField) o[longField] = ''; return o;
}

function itemCard(key, idx, fields, longField, longValue) {
  return `
    <div class="section-card" style="background:var(--bg-2); margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <strong>${fields[0][2] || 'New entry'}</strong>
        <button class="btn btn-ghost btn-xs" onclick="removeItem('${key}',${idx})">🗑 Remove</button>
      </div>
      <div class="grid-2">
        ${fields.map(f => `
          <div class="form-field"><label>${f[0]}</label><input data-bind="${key}.${idx}.${f[1]}" value="${esc(f[2]||'')}"></div>
        `).join('')}
      </div>
      ${longField ? `
        <div class="form-field">
          <label>${longField === 'description' ? 'Description / Bullets' : longField}</label>
          <textarea data-bind="${key}.${idx}.${longField}" rows="4" placeholder="• Use bullets to describe achievements…">${esc(longValue||'')}</textarea>
        </div>` : ''}
    </div>`;
}

// ============ Tailor ============
function renderTailor() {
  return `
    <div class="section-card">
      <div class="section-head"><h3>🎯 Tailor to Job</h3>
        <button class="ai-btn" onclick="aiTailor()">✨ Generate Tailored Resume</button>
      </div>
      <p style="color:var(--muted); font-size:13px; margin-bottom:12px;">Paste a job description and our AI will tailor your summary &amp; highlight the right experience.</p>
      <div class="form-field">
        <label>Job Description</label>
        <textarea data-bind="tailor.jobDescription" rows="8" placeholder="Paste the job description here…">${esc(resume.tailor.jobDescription)}</textarea>
      </div>
      ${resume.tailor.tailoredSummary ? `
        <div class="notice" style="background:rgba(99,102,241,.1); border-color:rgba(99,102,241,.3); color:#c4b5fd;">
          <strong>Tailored summary:</strong><br>${esc(resume.tailor.tailoredSummary)}
        </div>` : ''}
      <div class="action-row">
        <button class="btn btn-secondary" onclick="nextSection('publications')">← Back</button>
        <button class="btn btn-primary" onclick="nextSection('ats')">Continue →</button>
      </div>
    </div>`;
}

// ============ ATS ============
function renderATS() {
  return `
    <div class="section-card">
      <div class="section-head"><h3>✅ ATS Compatibility Check</h3></div>
      <p style="color:var(--muted); font-size:13px; margin-bottom:12px;">Paste a job posting and we'll score your resume's ATS match.</p>
      <div class="form-field">
        <label>Job Description</label>
        <textarea id="ats-jd" rows="4" placeholder="Paste job description…"></textarea>
      </div>
      <button class="btn btn-primary btn-block" onclick="aiATS()">⚙️ Run ATS Check</button>
      <div id="ats-result" style="margin-top:16px;"></div>
      <div class="action-row">
        <button class="btn btn-secondary" onclick="nextSection('tailor')">← Back</button>
        <button class="btn btn-primary" onclick="nextSection('analysis')">Continue →</button>
      </div>
    </div>`;
}

// ============ AI Analysis ============
function renderAnalysis() {
  return `
    <div class="section-card">
      <div class="section-head"><h3>🔬 AI Resume Analysis</h3>
        <button class="ai-btn" onclick="aiAnalyze()">✨ Run Analysis</button>
      </div>
      <p style="color:var(--muted); font-size:13px;">Get AI-powered insights on your resume's strengths and areas to improve.</p>
      <div id="analysis-result" style="margin-top:16px;"></div>
      <div class="action-row">
        <button class="btn btn-secondary" onclick="nextSection('ats')">← Back</button>
        <button class="btn btn-primary" onclick="nextSection('dashboard')">Continue →</button>
      </div>
    </div>`;
}

// ============ Dashboard ============
function renderDashboard() {
  const filled = countFilled();
  const pct = Math.round(filled.score * 100);
  return `
    <div class="section-card">
      <div class="section-head"><h3>📊 Dashboard</h3></div>
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
        <button class="btn btn-secondary" onclick="nextSection('analysis')">← Back</button>
        <a href="export.html" class="btn btn-primary">Preview &amp; Export →</a>
      </div>
    </div>`;
}

function countFilled() {
  const sections = ['personal','experience','education','skills','projects'];
  let done = 0;
  if (resume.personal.fullName && resume.personal.email) done++;
  if (resume.experience.length) done++;
  if (resume.education.length) done++;
  if (resume.skills.categories.length) done++;
  if (resume.projects.length) done++;
  return { done, total: sections.length, score: done/sections.length };
}

// ============ Customize ============
const SWATCHES = ['#4f46e5','#7c3aed','#ec4899','#f43f5e','#f59e0b','#10b981','#0ea5e9','#3b82f6','#8b5cf6','#1f2937'];
const FONTS = ['Inter','Helvetica','Georgia','Times','Roboto'];
function renderCustomize() {
  const c = resume.customize;
  return `
    <div class="section-card">
      <div class="section-head"><h3>⚙️ Customize Template</h3></div>
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

// ============ Preview ============
function renderPreview() {
  const p = resume.personal;
  const accent = resume.customize.accent;
  const html = `
    <div style="font-family:${resume.customize.font},sans-serif;">
      <div style="background:${accent}; color:#fff; padding:8px; margin:-12px -12px 8px;">
        <div style="font-weight:700; font-size:14px;">${esc(p.fullName||'Your Name')}</div>
        <div style="font-size:7px; opacity:.85;">${esc([p.email,p.phone,p.location].filter(Boolean).join(' · '))}</div>
      </div>
      ${p.summary ? `<h2 style="color:${accent};">Summary</h2><p>${esc(p.summary)}</p>`:''}
      ${resume.experience.length ? `<h2 style="color:${accent};">Experience</h2>${resume.experience.map(e=>`
        <p><strong>${esc(e.title)}</strong> · ${esc(e.company)}<br><em>${esc(e.start)} – ${esc(e.end)}</em></p>
        <p style="font-size:7px;">${esc(e.description||'').slice(0,200)}</p>`).join('')}` : ''}
      ${resume.education.length ? `<h2 style="color:${accent};">Education</h2>${resume.education.map(e=>`
        <p><strong>${esc(e.school)}</strong> — ${esc(e.degree)} ${esc(e.field)}</p>`).join('')}` : ''}
      ${resume.skills.categories.length ? `<h2 style="color:${accent};">Skills</h2><p>${esc(resume.skills.categories.flatMap(c=>c.items).join(' · '))}</p>` : ''}
    </div>`;
  document.getElementById('preview').innerHTML = html;
}

// ============ Helpers ============
function esc(s) { return String(s==null?'':s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function nextSection(s) {
  currentSection = s;
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.toggle('active', i.dataset.section === s));
  renderMain();
}
function addItem(key, blank) { resume[key].push(blank); save(); renderMain(); }
function removeItem(key, idx) { resume[key].splice(idx,1); save(); renderMain(); }

function bindAutoSave() {
  document.querySelectorAll('[data-bind]').forEach(el => {
    el.addEventListener('input', () => {
      const path = el.dataset.bind.split('.');
      let obj = resume;
      for (let i=0;i<path.length-1;i++) obj = obj[path[i]];
      obj[path[path.length-1]] = el.value;
      save();
      renderPreview();
    });
  });
}

function save() {
  localStorage.setItem('hf_resume', JSON.stringify(resume));
}

async function saveResume() {
  save();
  // push a version snapshot
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
    flashSaved();
  } catch (e) { console.warn('sync failed', e); flashSaved('local'); }
}

function flashSaved(mode) {
  const m = document.createElement('div');
  m.textContent = mode==='local' ? '💾 Saved locally' : '✓ Saved to cloud';
  m.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--success);color:#fff;padding:10px 16px;border-radius:8px;z-index:200;';
  document.body.appendChild(m);
  setTimeout(()=>m.remove(), 1800);
}

function signOut() {
  localStorage.removeItem('hf_token');
  localStorage.removeItem('hf_email');
  location.href = 'index.html';
}

// ============ AI calls ============
async function ai(endpoint, body) {
  const r = await fetch(API + '/ai/' + endpoint, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('AI request failed');
  return r.json();
}

async function aiImprove(target) {
  try {
    const text = target==='summary' ? resume.personal.summary : JSON.stringify(resume[target]||{});
    const r = await ai('improve', { target, text });
    if (target==='summary') { resume.personal.summary = r.text; save(); renderMain(); }
    else { alert('AI suggestion:\n\n'+r.text); }
  } catch(e) { alert('AI failed: '+e.message); }
}

async function aiSuggestSkills() {
  try {
    const r = await ai('skills', { experience: resume.experience });
    const items = (r.skills||'').split(',').map(s=>s.trim()).filter(Boolean);
    if (items.length) {
      resume.skills.categories = [{ name:'All', items: Array.from(new Set([...(resume.skills.categories.flatMap(c=>c.items)||[]),...items]))}];
      save(); renderMain();
    }
  } catch(e) { alert('AI failed: '+e.message); }
}

async function aiTailor() {
  try {
    const r = await ai('tailor', { jobDescription: resume.tailor.jobDescription, resume });
    resume.tailor.tailoredSummary = r.text;
    if (r.summary) resume.personal.summary = r.summary;
    save(); renderMain();
  } catch(e) { alert('AI failed: '+e.message); }
}

async function aiATS() {
  const jd = document.getElementById('ats-jd').value;
  try {
    const r = await ai('ats', { jobDescription: jd, resume });
    document.getElementById('ats-result').innerHTML = `
      <div class="section-card" style="background:var(--bg-2);">
        <h4>ATS Score: <span style="color:${r.score>=70?'var(--success)':r.score>=50?'var(--warning)':'var(--danger)'};">${r.score}/100</span></h4>
        <p style="white-space:pre-wrap; margin-top:8px;">${esc(r.feedback||'')}</p>
      </div>`;
  } catch(e) { alert('AI failed: '+e.message); }
}

async function aiAnalyze() {
  try {
    const r = await ai('analyze', { resume });
    document.getElementById('analysis-result').innerHTML = `
      <div class="section-card" style="background:var(--bg-2);">
        <p style="white-space:pre-wrap;">${esc(r.text||'')}</p>
      </div>`;
  } catch(e) { alert('AI failed: '+e.message); }
}

// ============ Modals ============
function openModal(id) { document.getElementById('modal-'+id).classList.add('open'); if(id==='version') renderVersions(); }
function closeModal(id) { document.getElementById('modal-'+id).classList.remove('open'); }

function renderVersions() {
  const list = (resume.versions || []).map((v,i)=> `
    <div style="display:flex; justify-content:space-between; padding:10px; background:var(--bg-2); border-radius:8px;">
      <div>
        <strong>${v.label}</strong>
        <div style="color:var(--muted); font-size:12px;">${new Date(v.ts).toLocaleString()}</div>
      </div>
      <button class="btn btn-secondary btn-xs" onclick="restoreVersion(${i})">Restore</button>
    </div>`).join('');
  document.getElementById('version-list').innerHTML = list || '<p style="color:var(--muted);">No versions yet.</p>';
}
function restoreVersion(i) {
  if (!confirm('Restore this version? Current changes will be replaced.')) return;
  resume = resume.versions[i].data; save(); closeModal('version'); renderMain();
}

async function importResume() {
  const text = document.getElementById('import-text').value;
  if (!text) return alert('Paste some text first');
  try {
    const r = await ai('parse', { text });
    if (r.resume) {
      resume = Object.assign(structuredClone(DEFAULT_RESUME), r.resume);
      save(); closeModal('import'); renderMain();
    } else { alert('AI returned no resume data'); }
  } catch(e) { alert('AI failed: '+e.message); }
}

// ============ Boot ============
renderMain();
