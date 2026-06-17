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

function _sectionComplete(sec) {
  switch(sec) {
    case 'personal':      return !!(resume.personal.fullName && resume.personal.email);
    case 'experience':    return resume.experience.length > 0;
    case 'education':     return resume.education.length > 0;
    case 'skills':        return resume.skills.categories.flatMap(c=>c.items).length > 0;
    case 'projects':      return resume.projects.length > 0;
    case 'certifications':return resume.certifications.length > 0;
    case 'awards':        return resume.awards.length > 0;
    case 'leadership':    return resume.leadership.length > 0;
    case 'volunteer':     return resume.volunteer.length > 0;
    case 'publications':  return resume.publications.length > 0;
    default:              return false;
  }
}

function hydrate() {
  document.querySelectorAll('.sidebar-item').forEach(el => {
    const s = el.dataset.section;
    const info = SECTION_INFO[s];
    if (!info) return;
    const isPro = PRO_SECTIONS.has(s);
    const showLock = isPro && isFree();
    const done = _sectionComplete(s);
    const indicator = showLock
      ? `<span class="ico ico-sm" style="margin-left:auto;opacity:.7;">${ICONS.lock}</span>`
      : done
        ? `<span class="s-check"><svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5 5 4 7.5 8.5 2.5"/></svg></span>`
        : `<span class="s-dot"></span>`;
    if (done) el.classList.add('has-content');
    else el.classList.remove('has-content');
    el.innerHTML = `${ICON(info.icon)}<span>${info.label}</span>${indicator}`;
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

function renderMain() {
  const mainEl = document.getElementById('main');
  mainEl.innerHTML = (SECTIONS[currentSection] || (() => '<p>Section not built yet.</p>'))();
  // Trigger section fade-in
  const card = mainEl.firstElementChild;
  if (card) { card.classList.remove('main-section-enter'); void card.offsetWidth; card.classList.add('main-section-enter'); }
  // Close mobile drawers when navigating
  _closeMobileDrawers();
  bindAutoSave();
  renderPreview();
  // Bind tag input if on skills section
  if (currentSection === 'skills') setTimeout(_bindTagInput, 0);
  // Wire drag-to-reorder
  setTimeout(_bindDragReorder, 0);
  // Update sidebar completion indicators
  document.querySelectorAll('.sidebar-item').forEach(function(el) {
    var sec = el.dataset.section;
    var done = _sectionComplete(sec);
    el.classList.toggle('has-content', done);
    var dot = el.querySelector('.s-dot');
    if (dot) { dot.style.background = done ? 'var(--accent)' : 'var(--border)'; }
  });
}

// ============ Section: Templates ============
function renderTemplateSection() {
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON('doc')} Templates</h3>
        <span class="pill">${TEMPLATE_DEFS.length} templates</span>
      </div>
      <p style="color:var(--muted); font-size:13px; margin-bottom:18px;">Choose a style. You can change colors and fonts in Customize.</p>
      <div class="template-grid">
        ${TEMPLATE_DEFS.map(t => `
          <div class="template-card ${resume.template===t.id?'selected':''}" onclick="selectTemplate('${t.id}')">
            <div class="template-thumb">${TEMPLATE_THUMBS[t.id] || ''}</div>
            <div class="template-card-foot">
              <span class="t-name">${t.name}</span>
              ${resume.template===t.id ? '<span class="t-badge" style="color:#a5b4fc;">✓ Active</span>' : ''}
            </div>
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


// ── Illustrated template thumbnails ──
const TEMPLATE_THUMBS = {
  modern: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="0" y="0" width="85" height="28" fill="#4f46e5"/>
    <rect x="8" y="7" width="40" height="5" rx="2" fill="rgba(255,255,255,.9)"/>
    <rect x="8" y="15" width="28" height="3" rx="1" fill="rgba(255,255,255,.5)"/>
    <rect x="8" y="35" width="20" height="2.5" rx="1" fill="#4f46e5"/>
    <rect x="8" y="41" width="65" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="45" width="55" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="49" width="60" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="58" width="20" height="2.5" rx="1" fill="#4f46e5"/>
    <rect x="8" y="64" width="50" height="1.5" rx=".5" fill="#d1d5db"/>
    <rect x="8" y="68" width="65" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="72" width="60" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="76" width="55" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="85" width="20" height="2.5" rx="1" fill="#4f46e5"/>
    <rect x="8" y="91" width="18" height="4" rx="2" fill="#e0e7ff"/>
    <rect x="28" y="91" width="22" height="4" rx="2" fill="#e0e7ff"/>
    <rect x="52" y="91" width="16" height="4" rx="2" fill="#e0e7ff"/>
  </svg>`,
  classic: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="8" y="8" width="69" height="6" rx="1" fill="#1f2937"/>
    <rect x="20" y="18" width="45" height="2" rx="1" fill="#6b7280"/>
    <rect x="25" y="23" width="35" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="31" width="69" height=".5" fill="#d1d5db"/>
    <rect x="8" y="36" width="18" height="2" rx="1" fill="#374151"/>
    <rect x="8" y="41" width="65" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="45" width="60" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="49" width="55" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="56" width="69" height=".5" fill="#d1d5db"/>
    <rect x="8" y="61" width="18" height="2" rx="1" fill="#374151"/>
    <rect x="8" y="67" width="65" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="71" width="58" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="78" width="69" height=".5" fill="#d1d5db"/>
    <rect x="8" y="83" width="18" height="2" rx="1" fill="#374151"/>
    <rect x="8" y="89" width="15" height="3" rx="1" fill="#f3f4f6"/>
    <rect x="25" y="89" width="15" height="3" rx="1" fill="#f3f4f6"/>
    <rect x="42" y="89" width="18" height="3" rx="1" fill="#f3f4f6"/>
  </svg>`,
  creative: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="0" y="0" width="28" height="110" fill="#0f172a"/>
    <rect x="6" y="10" width="16" height="16" rx="8" fill="#8b5cf6"/>
    <rect x="6" y="30" width="16" height="2" rx="1" fill="rgba(255,255,255,.8)"/>
    <rect x="6" y="35" width="12" height="1.5" rx=".5" fill="rgba(255,255,255,.4)"/>
    <rect x="6" y="50" width="10" height="1.5" rx=".5" fill="#8b5cf6"/>
    <rect x="6" y="55" width="16" height="1" rx=".5" fill="rgba(255,255,255,.3)"/>
    <rect x="6" y="58" width="14" height="1" rx=".5" fill="rgba(255,255,255,.3)"/>
    <rect x="6" y="61" width="16" height="1" rx=".5" fill="rgba(255,255,255,.3)"/>
    <rect x="6" y="72" width="10" height="1.5" rx=".5" fill="#8b5cf6"/>
    <rect x="6" y="77" width="12" height="3" rx="1" fill="rgba(139,92,246,.3)"/>
    <rect x="6" y="82" width="16" height="3" rx="1" fill="rgba(139,92,246,.3)"/>
    <rect x="6" y="87" width="14" height="3" rx="1" fill="rgba(139,92,246,.3)"/>
    <rect x="35" y="10" width="40" height="4" rx="1" fill="#1f2937"/>
    <rect x="35" y="18" width="30" height="2" rx="1" fill="#6b7280"/>
    <rect x="35" y="30" width="16" height="2" rx="1" fill="#8b5cf6"/>
    <rect x="35" y="36" width="42" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="35" y="40" width="38" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="35" y="50" width="16" height="2" rx="1" fill="#8b5cf6"/>
    <rect x="35" y="56" width="42" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="35" y="60" width="36" height="1.5" rx=".5" fill="#9ca3af"/>
  </svg>`,
  minimal: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="10" y="10" width="45" height="5" rx="1" fill="#111827"/>
    <rect x="10" y="19" width="60" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="10" y="23" width="50" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="10" y="33" width="65" height=".5" fill="#f3f4f6"/>
    <rect x="10" y="38" width="20" height="2" rx=".5" fill="#6b7280"/>
    <rect x="10" y="44" width="65" height="1" rx=".5" fill="#e5e7eb"/>
    <rect x="10" y="47" width="60" height="1" rx=".5" fill="#e5e7eb"/>
    <rect x="10" y="50" width="55" height="1" rx=".5" fill="#e5e7eb"/>
    <rect x="10" y="58" width="20" height="2" rx=".5" fill="#6b7280"/>
    <rect x="10" y="64" width="65" height="1" rx=".5" fill="#e5e7eb"/>
    <rect x="10" y="67" width="55" height="1" rx=".5" fill="#e5e7eb"/>
    <rect x="10" y="75" width="20" height="2" rx=".5" fill="#6b7280"/>
    <rect x="10" y="81" width="14" height="3" rx="1.5" fill="#f9fafb" stroke="#e5e7eb" stroke-width=".5"/>
    <rect x="26" y="81" width="18" height="3" rx="1.5" fill="#f9fafb" stroke="#e5e7eb" stroke-width=".5"/>
    <rect x="46" y="81" width="14" height="3" rx="1.5" fill="#f9fafb" stroke="#e5e7eb" stroke-width=".5"/>
  </svg>`,
  professional: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#f8fafc"/>
    <rect x="0" y="0" width="85" height="22" fill="#1e293b"/>
    <rect x="8" y="5" width="35" height="4" rx="1" fill="#fff"/>
    <rect x="8" y="13" width="50" height="2" rx="1" fill="rgba(255,255,255,.5)"/>
    <rect x="0" y="22" width="85" height="3" fill="#3b82f6"/>
    <rect x="8" y="32" width="18" height="2" rx="1" fill="#1e293b"/>
    <rect x="8" y="38" width="65" height="1.5" rx=".5" fill="#94a3b8"/>
    <rect x="8" y="42" width="58" height="1.5" rx=".5" fill="#94a3b8"/>
    <rect x="8" y="46" width="62" height="1.5" rx=".5" fill="#94a3b8"/>
    <rect x="8" y="55" width="18" height="2" rx="1" fill="#1e293b"/>
    <rect x="8" y="61" width="50" height="1.5" rx=".5" fill="#cbd5e1"/>
    <rect x="8" y="65" width="65" height="1.5" rx=".5" fill="#94a3b8"/>
    <rect x="8" y="69" width="60" height="1.5" rx=".5" fill="#94a3b8"/>
    <rect x="8" y="78" width="18" height="2" rx="1" fill="#1e293b"/>
    <rect x="8" y="84" width="16" height="3.5" rx="1.5" fill="#dbeafe"/>
    <rect x="26" y="84" width="20" height="3.5" rx="1.5" fill="#dbeafe"/>
    <rect x="48" y="84" width="16" height="3.5" rx="1.5" fill="#dbeafe"/>
  </svg>`,
  tech: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#0f172a"/>
    <rect x="8" y="8" width="40" height="5" rx="1" fill="#f1f5f9"/>
    <rect x="8" y="17" width="55" height="1.5" rx=".5" fill="#475569"/>
    <rect x="8" y="27" width="30" height=".5" fill="#22d3ee"/>
    <rect x="8" y="31" width="18" height="2" rx=".5" fill="#22d3ee"/>
    <rect x="8" y="37" width="65" height="1.5" rx=".5" fill="#334155"/>
    <rect x="8" y="41" width="60" height="1.5" rx=".5" fill="#334155"/>
    <rect x="8" y="45" width="55" height="1.5" rx=".5" fill="#334155"/>
    <rect x="8" y="53" width="18" height="2" rx=".5" fill="#22d3ee"/>
    <rect x="8" y="59" width="65" height="1.5" rx=".5" fill="#334155"/>
    <rect x="8" y="63" width="58" height="1.5" rx=".5" fill="#334155"/>
    <rect x="8" y="71" width="18" height="2" rx=".5" fill="#22d3ee"/>
    <rect x="8" y="77" width="14" height="3" rx="1" fill="rgba(34,211,238,.15)" stroke="rgba(34,211,238,.4)" stroke-width=".5"/>
    <rect x="24" y="77" width="18" height="3" rx="1" fill="rgba(34,211,238,.15)" stroke="rgba(34,211,238,.4)" stroke-width=".5"/>
    <rect x="44" y="77" width="22" height="3" rx="1" fill="rgba(34,211,238,.15)" stroke="rgba(34,211,238,.4)" stroke-width=".5"/>
  </svg>`,
  executive: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="8" y="8" width="69" height=".5" fill="#1f2937"/>
    <rect x="8" y="12" width="50" height="6" rx="1" fill="#1f2937"/>
    <rect x="8" y="22" width="40" height="2" rx="1" fill="#6b7280"/>
    <rect x="8" y="27" width="69" height=".5" fill="#1f2937"/>
    <rect x="8" y="33" width="16" height="2" rx="1" fill="#1f2937"/>
    <rect x="8" y="39" width="69" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="43" width="65" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="47" width="60" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="55" width="16" height="2" rx="1" fill="#1f2937"/>
    <rect x="8" y="61" width="55" height="1.5" rx=".5" fill="#d1d5db"/>
    <rect x="8" y="65" width="69" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="69" width="65" height="1.5" rx=".5" fill="#9ca3af"/>
    <rect x="8" y="77" width="16" height="2" rx="1" fill="#1f2937"/>
    <rect x="8" y="83" width="69" height=".5" fill="#e5e7eb"/>
    <rect x="8" y="89" width="12" height="3" rx="1" fill="#f3f4f6"/>
    <rect x="22" y="89" width="16" height="3" rx="1" fill="#f3f4f6"/>
    <rect x="40" y="89" width="20" height="3" rx="1" fill="#f3f4f6"/>
  </svg>`,
  compact: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="0" y="0" width="85" height="18" fill="#7c3aed"/>
    <rect x="8" y="5" width="30" height="3.5" rx="1" fill="#fff"/>
    <rect x="8" y="11" width="45" height="1.5" rx=".5" fill="rgba(255,255,255,.6)"/>
    <rect x="8" y="23" width="14" height="1.8" rx=".5" fill="#7c3aed"/>
    <rect x="8" y="27" width="69" height="1.2" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="30" width="65" height="1.2" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="33" width="60" height="1.2" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="38" width="14" height="1.8" rx=".5" fill="#7c3aed"/>
    <rect x="8" y="42" width="50" height="1.2" rx=".5" fill="#d1d5db"/>
    <rect x="8" y="45" width="69" height="1.2" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="48" width="62" height="1.2" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="53" width="14" height="1.8" rx=".5" fill="#7c3aed"/>
    <rect x="8" y="57" width="69" height="1.2" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="60" width="55" height="1.2" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="68" width="14" height="1.8" rx=".5" fill="#7c3aed"/>
    <rect x="8" y="72" width="12" height="2.5" rx="1" fill="#ede9fe"/>
    <rect x="22" y="72" width="16" height="2.5" rx="1" fill="#ede9fe"/>
    <rect x="40" y="72" width="14" height="2.5" rx="1" fill="#ede9fe"/>
  </svg>`,
  elegant: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fffbf7"/>
    <rect x="0" y="0" width="85" height="32" fill="#292524"/>
    <rect x="22" y="7" width="41" height="5" rx="1" fill="#fff"/>
    <rect x="27" y="16" width="31" height="2" rx="1" fill="rgba(255,255,255,.5)"/>
    <rect x="30" y="21" width="25" height="1.5" rx=".5" fill="rgba(255,255,255,.3)"/>
    <rect x="8" y="38" width="16" height="2" rx=".5" fill="#78716c"/>
    <rect x="8" y="43" width="69" height="1.5" rx=".5" fill="#a8a29e"/>
    <rect x="8" y="47" width="62" height="1.5" rx=".5" fill="#a8a29e"/>
    <rect x="8" y="56" width="16" height="2" rx=".5" fill="#78716c"/>
    <rect x="8" y="62" width="52" height="1.5" rx=".5" fill="#c7c3bf"/>
    <rect x="8" y="66" width="69" height="1.5" rx=".5" fill="#a8a29e"/>
    <rect x="8" y="70" width="65" height="1.5" rx=".5" fill="#a8a29e"/>
    <rect x="8" y="79" width="16" height="2" rx=".5" fill="#78716c"/>
    <rect x="8" y="85" width="13" height="3" rx="1.5" fill="#e7e5e4"/>
    <rect x="23" y="85" width="17" height="3" rx="1.5" fill="#e7e5e4"/>
    <rect x="42" y="85" width="15" height="3" rx="1.5" fill="#e7e5e4"/>
  </svg>`,
};

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
        <label>Professional Summary</label>
        <textarea data-bind="personal.summary" rows="4" placeholder="A short summary highlighting your strengths…">${esc(p.summary)}</textarea>
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
        : `<div class="drag-list">${resume.experience.map((e,i) => itemCard('experience', i, [
            ['Job Title','title',e.title], ['Company','company',e.company],
            ['Start Date','start',e.start], ['End Date / Present','end',e.end],
            ['Location','location',e.location]
          ], 'description', e.description)).join('')}</div>`}
      <button class="add-btn" onclick="addItem('experience',{title:'',company:'',start:'',end:'',location:'',description:''})">${ICON('plus','ico ico-sm')} Add Experience</button>
      ${navRow('personal','education')}
    </div>`;
}

function renderEducation() {
  return `
    <div class="section-card">
      <div class="section-head"><h3>${ICON('grad')} Education</h3></div>
      ${resume.education.length === 0 ? `<div class="empty-state">No education added yet.</div>`
        : `<div class="drag-list">${resume.education.map((e,i) => itemCard('education', i, [
            ['School','school',e.school], ['Degree','degree',e.degree],
            ['Field of Study','field',e.field], ['GPA','gpa',e.gpa],
            ['Start','start',e.start], ['End','end',e.end]
          ], 'notes', e.notes)).join('')}</div>`}
      <button class="add-btn" onclick="addItem('education',{school:'',degree:'',field:'',gpa:'',start:'',end:'',notes:''})">${ICON('plus','ico ico-sm')} Add Education</button>
      ${navRow('experience','skills')}
    </div>`;
}

function renderSkills() {
  const items = resume.skills.categories.flatMap(c=>c.items);
  const pillsHtml = items.map(function(sk, i) {
    return '<span class="tag-pill">' + esc(sk)
      + '<button type="button" data-skill-rm="' + i + '" title="Remove">&times;</button></span>';
  }).join('');
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON('bolt')} Skills</h3>
        <button class="ai-btn" onclick="aiSuggestSkills()">${ICON('sparkle','ico ico-sm')} Suggest from Experience</button>
      </div>
      <div class="tag-input-wrap" id="tag-input-wrap" onclick="_focusSkillInput()">
        ${pillsHtml}
        <input id="skill-inp" placeholder="${items.length ? 'Add another skill...' : 'Type a skill and press Enter or comma...'}" autocomplete="off">
      </div>
      <div class="tag-hint">Press <strong>Enter</strong> or <strong>,</strong> after each skill. Click &times; to remove.</div>
      ${navRow('education','projects')}
    </div>`;
}

function _focusSkillInput() { var el = document.getElementById('skill-inp'); if (el) el.focus(); }

function _bindTagInput() {
  var inp = document.getElementById('skill-inp');
  var wrap = document.getElementById('tag-input-wrap');
  if (!inp) return;

  function addSkill(val) {
    var sk = val.trim().replace(/,+$/, '').trim();
    if (!sk) return;
    var items = resume.skills.categories.flatMap(function(c){return c.items;});
    if (items.map(function(x){return x.toLowerCase();}).includes(sk.toLowerCase())) return;
    if (!resume.skills.categories.length) resume.skills.categories.push({name:'All',items:[]});
    resume.skills.categories[0].items.push(sk);
    save();
    // Re-render just the wrap content without full renderMain for snappy UX
    _refreshTagPills();
  }

  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(inp.value);
      inp.value = '';
    } else if (e.key === 'Backspace' && inp.value === '') {
      // Remove last skill
      var cats = resume.skills.categories;
      if (cats.length && cats[0].items.length) {
        cats[0].items.pop();
        save(); _refreshTagPills();
      }
    }
  });
  inp.addEventListener('blur', function() {
    if (inp.value.trim()) { addSkill(inp.value); inp.value = ''; }
  });

  // Remove pill buttons
  if (wrap) wrap.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-skill-rm]');
    if (!btn) return;
    var idx = +btn.dataset.skillRm;
    var cats = resume.skills.categories;
    if (cats.length) cats[0].items.splice(idx, 1);
    save(); _refreshTagPills();
  });
}

function _refreshTagPills() {
  var wrap = document.getElementById('tag-input-wrap');
  var inp  = document.getElementById('skill-inp');
  if (!wrap || !inp) return;
  var items = resume.skills.categories.flatMap(function(c){return c.items;});
  // Remove existing pills (not the input)
  Array.from(wrap.querySelectorAll('.tag-pill')).forEach(function(p){p.remove();});
  var frag = document.createDocumentFragment();
  items.forEach(function(sk, i) {
    var span = document.createElement('span'); span.className = 'tag-pill';
    span.innerHTML = esc(sk) + '<button type="button" data-skill-rm="' + i + '" title="Remove">&times;</button>';
    frag.appendChild(span);
  });
  wrap.insertBefore(frag, inp);
  inp.placeholder = items.length ? 'Add another skill...' : 'Type a skill and press Enter or comma...';
  // Update sidebar dot
  document.querySelectorAll('.sidebar-item').forEach(function(el) {
    if (el.dataset.section === 'skills') el.classList.toggle('has-content', items.length > 0);
  });
}

function saveSkills() {} // no-op, kept for safety


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
        `<div class="drag-list">${list.map((it,i)=> itemCard(key, i, fields.map(f=>[f[0],f[1],it[f[1]]]), longField, longField?it[longField]:null)).join('')}</div>`}
      <button class="add-btn" onclick='addItem("${key}",${JSON.stringify(blank(fields,longField))})'>${ICON('plus','ico ico-sm')} Add ${title}</button>
      ${navRow(prev,next)}
    </div>`;
}

function blank(fields, longField) { const o = {}; fields.forEach(f => o[f[1]] = ''); if (longField) o[longField] = ''; return o; }

function itemCard(key, idx, fields, longField, longValue) {
  // Smart field grouping: first field full-width, rest in grid
  const firstField = fields[0];
  const restFields = fields.slice(1);
  const halfLen = Math.ceil(restFields.length / 2);
  return `
    <div class="drag-item" draggable="true" data-drag-key="${key}" data-drag-idx="${idx}">
      <span class="drag-handle" title="Drag to reorder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/>
        </svg>
      </span>
      <div class="item-card">
        <div class="item-card-header">
          <div>
            <div class="item-card-title">${esc(firstField[2] || 'New entry')}</div>
            ${fields[1] && fields[1][2] ? `<div class="item-card-sub">${esc(fields[1][2])}</div>` : ''}
          </div>
          <button class="item-card-remove" onclick="removeItem('${key}',${idx})" title="Remove">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
        <div class="form-field"><label>${firstField[0]}</label><input data-bind="${key}.${idx}.${firstField[1]}" value="${esc(firstField[2]||'')}"></div>
        ${restFields.length ? `
        <div class="grid-2">
          ${restFields.map(f => `
            <div class="form-field"><label>${f[0]}</label><input data-bind="${key}.${idx}.${f[1]}" value="${esc(f[2]||'')}"></div>
          `).join('')}
        </div>` : ''}
        ${longField ? `
        <div class="form-field">
          <label style="display:flex;justify-content:space-between;align-items:baseline;">
            <span>${longField === 'description' ? 'Description / Bullets' : longField}</span>
            ${longField === 'description' ? '<span id="bm_' + key + '_' + idx + '" style="font-size:11px;"></span>' : ''}
          </label>
          <textarea data-bind="${key}.${idx}.${longField}" rows="4"
            placeholder="• Use bullets to describe achievements…"
            data-bmid="bm_${key}_${idx}"
            oninput="_liveBM(this,'bm_${key}_${idx}')"
            >${esc(longValue||'')}</textarea>
          ${longField === 'description' ? '<div id="bmbar_' + key + '_' + idx + '" class="bm-bar-wrap"></div>' : ''}
        </div>` : ''}
      </div>
    </div>`;
}

// Score a description/bullets block 0–100
function _scoreBullet(text) {
  if (!text || !text.trim()) return 0;
  var lines = text.split('\n').map(function(l){ return l.replace(/^[•\-\*]\s*/,'').trim(); }).filter(Boolean);
  if (!lines.length) return 0;
  var score = 0;
  var ACTION_VERBS = /^(led|built|created|designed|developed|launched|improved|increased|reduced|managed|delivered|implemented|drove|grew|optimized|architected|deployed|scaled|mentored|negotiated|spearheaded|revamped|authored|engineered|coordinated|established|exceeded|automated|migrated|collaborated|achieved|generated|saved|cut|boosted|accelerated|transformed|streamlined|restructured|recruited|trained|oversaw|pioneered|directed|facilitated)/i;
  var hasVerb = lines.some(function(l){ return ACTION_VERBS.test(l); });
  var hasMetric = /\d+\s*(%|x|k\b|\$|million|billion|users|customers|hours|days|weeks|months|years|points|ms\b|seconds)|\$\s*[\d,]+|\d[\d,]{2,}/i.test(text);
  var totalChars = lines.reduce(function(a,l){ return a+l.length; }, 0);
  var avgLen = totalChars / lines.length;
  if (hasVerb) score += 30;
  if (hasMetric) score += 35;
  if (avgLen >= 40) score += 20; else if (avgLen >= 20) score += 10;
  if (lines.length >= 2) score += 10;
  if (lines.length >= 3) score += 5;
  return Math.min(100, score);
}

// Live bullet meter update — called oninput on each description textarea
function _liveBM(ta, meterId) {
  var score = _scoreBullet(ta.value);
  var lbl = document.getElementById(meterId);
  var col = score >= 75 ? '#6ee7b7' : score >= 45 ? '#fcd34d' : '#fca5a5';
  var txt = score >= 75 ? '✦ Strong' : score >= 45 ? '◆ Decent' : '▲ Needs work';
  if (lbl) { lbl.textContent = score > 0 ? txt : ''; lbl.style.color = col; }
  var barWrap = document.getElementById(meterId.replace('bm_', 'bmbar_'));
  if (barWrap) {
    barWrap.innerHTML = score > 0
      ? '<div class="bm-track"><div class="bm-fill" style="width:'+score+'%;background:'+col+';"></div></div>'
      : '';
  }
}


// ============ Tailor / ATS / Analysis / Dashboard / Customize ============
function _jdWordCount(text) {
  var n = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return n ? n + ' words' : '';
}

function _jdWordCount(text) {
  var n = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return n ? n + ' words' : '';
}

function renderTailor() {
  const wc = _jdWordCount(resume.tailor.jobDescription);
  return `
    <div class="section-card ai-card ai-card-indigo">
      <div class="ai-card-header">
        <div class="ai-card-icon ai-icon-indigo">${ICON('target')}</div>
        <div>
          <h3 class="ai-card-title">Tailor to Job</h3>
          <p class="ai-card-sub">AI rewrites your summary &amp; bullets to match the role.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="aiTailor()" style="margin-left:auto;white-space:nowrap;flex-shrink:0;">${ICON('sparkle','ico ico-sm')} Generate</button>
      </div>
      <div class="ai-card-body">
        <div class="form-field">
          <label style="display:flex;justify-content:space-between;">
            <span>Job Description</span>
            <span id="tailor-wc" style="font-size:11px;color:var(--muted);">${wc}</span>
          </label>
          <textarea data-bind="tailor.jobDescription" rows="12"
            placeholder="Paste the full job description here — the more detail, the better the tailoring…"
            oninput="document.getElementById('tailor-wc').textContent=_jdWordCount(this.value)"
            style="font-size:13px;line-height:1.6;"
          >${esc(resume.tailor.jobDescription)}</textarea>
        </div>
        ${resume.tailor.tailoredSummary ? `
          <div class="ai-result-box ai-result-indigo">
            <div class="ai-result-label">✦ Tailored Summary</div>
            <div style="font-size:13px;line-height:1.6;white-space:pre-wrap;padding:12px 14px;">${esc(resume.tailor.tailoredSummary)}</div>
          </div>` : ''}
        ${navRow('publications','ats')}
      </div>
    </div>`;
}

function renderATS() {
  return `
    <div class="section-card ai-card ai-card-emerald">
      <div class="ai-card-header">
        <div class="ai-card-icon ai-icon-emerald">${ICON('check')}</div>
        <div>
          <h3 class="ai-card-title">ATS Compatibility Check</h3>
          <p class="ai-card-sub">Score your resume against a job posting's ATS filters.</p>
        </div>
      </div>
      <div class="ai-card-body">
        <div class="form-field">
          <label style="display:flex;justify-content:space-between;">
            <span>Job Description</span>
            <span id="ats-wc" style="font-size:11px;color:var(--muted);"></span>
          </label>
          <textarea id="ats-jd" rows="12"
            placeholder="Paste the job description — we'll keyword-match it against your resume…"
            oninput="document.getElementById('ats-wc').textContent=_jdWordCount(this.value)"
            style="font-size:13px;line-height:1.6;"></textarea>
        </div>
        <button class="btn btn-emerald btn-block" onclick="aiATS()">${ICON('check')} Run ATS Check</button>
        <div id="ats-result" style="margin-top:16px;"></div>
        ${navRow('tailor','analysis')}
      </div>
    </div>`;
}

function renderAnalysis() {
  return `
    <div class="section-card ai-card ai-card-violet">
      <div class="ai-card-header">
        <div class="ai-card-icon ai-icon-violet">${ICON('beaker')}</div>
        <div>
          <h3 class="ai-card-title">AI Resume Analysis</h3>
          <p class="ai-card-sub">Detailed strengths, weaknesses, and actionable improvements.</p>
        </div>
        <button class="btn btn-violet btn-sm" onclick="aiAnalyze()" style="margin-left:auto;white-space:nowrap;flex-shrink:0;">${ICON('sparkle','ico ico-sm')} Analyze</button>
      </div>
      <div class="ai-card-body">
        <div id="analysis-result"></div>
        ${navRow('ats','dashboard')}
      </div>
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

function bindAutoSave() {
  document.querySelectorAll('[data-bind]').forEach(el => {
    el.addEventListener('input', () => {
      const path = el.dataset.bind.split('.');
      let obj = resume;
      for (let i=0;i<path.length-1;i++) obj = obj[path[i]];
      obj[path[path.length-1]] = el.value;
      save(); renderPreview();
    });
  });
}

let _saveStatusTimer = null;
function _setSaveStatus(msg, color) {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || 'var(--muted)';
  clearTimeout(_saveStatusTimer);
  if (color) _saveStatusTimer = setTimeout(() => { el.textContent = ''; }, 4000);
}

function save() {
  localStorage.setItem('hf_resume', JSON.stringify(resume));
  _setSaveStatus('● Unsaved changes', 'var(--warning)');
}

async function saveResume() {
  resume.versions = resume.versions || [];
  // Snapshot excludes versions array to prevent recursive nesting
  const { versions: _v, ...snap } = resume;
  resume.versions.unshift({ ts: Date.now(), label: 'Manual save', data: JSON.parse(JSON.stringify(snap)) });
  resume.versions = resume.versions.slice(0, 10);
  save();
  let cloudOk = false;
  try {
    const r = await fetch(API + '/resume', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
      body: JSON.stringify({ resume })
    });
    cloudOk = r.ok;
  } catch (_) {}
  _setSaveStatus('✓ Saved', 'var(--success)');
  // Open version history so users can see saved versions and restore any of them
  openModal('version');
  toast(cloudOk ? 'Saved to cloud ✓' : 'Saved locally ✓', { type: 'success' });
}

function signOut() {
  localStorage.removeItem('hf_token');
  localStorage.removeItem('hf_email');
  location.href = 'index.html';
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
    throw new Error(data.error || `Request failed (${r.status})`);
  }
  return r.json();
}

async function aiImprove(target) {
  aiLoading('Improving your ' + (target === 'summary' ? 'summary' : target) + '…');
  try {
    const text = target==='summary' ? resume.personal.summary : JSON.stringify(resume[target]||{});
    const r = await ai('improve', { target, text });
    if (target==='summary') {
      resume.personal.summary = r.text;
      save(); renderMain();
      toast('Summary improved', { type: 'success' });
    } else {
      await notify({ title: 'AI suggestion', body: r.text, copyable: true });
    }
  } catch(e) { if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
  finally { aiLoadingDone(); }
}

async function aiSuggestSkills() {
  aiLoading('Generating skills from your experience…');
  try {
    const r = await ai('skills', { experience: resume.experience });
    const items = (r.skills||'').split(',').map(s=>s.trim()).filter(Boolean);
    if (items.length) {
      resume.skills.categories = [{ name:'All', items: Array.from(new Set([...(resume.skills.categories.flatMap(c=>c.items)||[]),...items]))}];
      save(); renderMain();
      toast(`Added ${items.length} skills`, { type: 'success' });
    } else {
      toast('No skills suggested', { type: 'warn' });
    }
  } catch(e) { if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
  finally { aiLoadingDone(); }
}

async function aiTailor() {
  aiLoading('Tailoring your resume to the job description…');
  try {
    const r = await ai('tailor', { jobDescription: resume.tailor.jobDescription, resume });
    resume.tailor.tailoredSummary = r.text;
    if (r.summary) resume.personal.summary = r.summary;
    save(); renderMain();
    toast('Resume tailored', { type: 'success' });
  } catch(e) { if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
  finally { aiLoadingDone(); }
}

async function aiATS() {
  const jd = document.getElementById('ats-jd').value;
  aiLoading('Scoring your resume against the job description…');
  try {
    const r = await ai('ats', { jobDescription: jd, resume });
    document.getElementById('ats-result').innerHTML = `
      <div class="section-card" style="background:var(--bg-2);">
        <h4>ATS Score: <span style="color:${r.score>=70?'var(--success)':r.score>=50?'var(--warning)':'var(--danger)'};">${r.score}/100</span></h4>
        <p style="white-space:pre-wrap; margin-top:8px;">${esc(r.feedback||'')}</p>
      </div>`;
  } catch(e) { if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
  finally { aiLoadingDone(); }
}

async function aiAnalyze() {
  aiLoading('Analyzing your resume with AI…');
  try {
    const r = await ai('analyze', { resume });
    document.getElementById('analysis-result').innerHTML = `
      <div class="section-card" style="background:var(--bg-2);">
        <p style="white-space:pre-wrap;">${esc(r.text||'')}</p>
      </div>`;
  } catch(e) { if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
  finally { aiLoadingDone(); }
}

function openModal(id) {
  if (id === 'import' && isFree()) { showUpgradeModal('ai'); return; }
  document.getElementById('modal-'+id).classList.add('open');
  if(id==='version') renderVersions();
}
function closeModal(id) { document.getElementById('modal-'+id).classList.remove('open'); }

function _relTime(ts) {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderVersions() {
  const versions = resume.versions || [];
  if (!versions.length) {
    document.getElementById('version-list').innerHTML =
      `<div style="text-align:center;padding:32px 16px;color:var(--muted);">
        <div style="font-size:32px;margin-bottom:8px;">📋</div>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;">No versions yet</div>
        <div style="font-size:12px;">Click <strong>Save</strong> to create your first snapshot.</div>
       </div>`;
    return;
  }
  const list = versions.map((v, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--bg-2);border-radius:10px;border:1px solid var(--border);${i===0?'border-color:var(--accent);':''}" >
      <div style="min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:13px;font-weight:600;">${esc(v.label)}</span>
          ${i === 0 ? '<span style="font-size:10px;background:var(--accent);color:#fff;padding:1px 6px;border-radius:4px;font-weight:600;">LATEST</span>' : ''}
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">
          ${new Date(v.ts).toLocaleString()} &nbsp;·&nbsp; ${_relTime(v.ts)}
        </div>
      </div>
      <button class="btn btn-secondary btn-xs" onclick="restoreVersion(${i})" ${i===0?'disabled title="This is the latest version"':''}>
        ${i === 0 ? 'Current' : 'Restore'}
      </button>
    </div>`).join('');
  document.getElementById('version-list').innerHTML = list;
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
  closeModal('import');
  aiLoading('Parsing your resume with AI…');
  try {
    const r = await ai('parse', { text });
    if (r.resume) {
      resume = Object.assign(structuredClone(DEFAULT_RESUME), r.resume);
      save(); renderMain();
      toast('Resume imported', { type: 'success' });
    } else {
      toast('Could not parse resume — try cleaning up the text and re-importing', { type: 'error', duration: 4500 });
    }
  } catch(e) { if (e.message !== 'Premium required') toast('AI failed: ' + e.message, { type: 'error' }); }
  finally { aiLoadingDone(); }
}


// ── Drag-to-reorder wiring ──
function _bindDragReorder() {
  var items = document.querySelectorAll('.drag-item');
  var dragSrc = null;
  items.forEach(function(item) {
    item.addEventListener('dragstart', function(e) {
      dragSrc = item;
      setTimeout(function(){ item.classList.add('dragging'); }, 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', function() {
      item.classList.remove('dragging');
      document.querySelectorAll('.drag-item').forEach(function(i){ i.classList.remove('drag-over'); });
      dragSrc = null;
    });
    item.addEventListener('dragover', function(e) {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      if (item !== dragSrc) {
        document.querySelectorAll('.drag-item').forEach(function(i){ i.classList.remove('drag-over'); });
        item.classList.add('drag-over');
      }
    });
    item.addEventListener('drop', function(e) {
      e.preventDefault();
      if (!dragSrc || dragSrc === item) return;
      var key = dragSrc.dataset.dragKey;
      var fromIdx = +dragSrc.dataset.dragIdx;
      var toIdx   = +item.dataset.dragIdx;
      if (key !== item.dataset.dragKey) return;
      var arr = resume[key];
      var moved = arr.splice(fromIdx, 1)[0];
      arr.splice(toIdx, 0, moved);
      save(); renderMain();
    });
  });
}

// ============ Mobile drawer helpers ============
function _toggleSidebar() {
  const sb = document.getElementById('app-sidebar');
  const ov = document.getElementById('mob-overlay');
  const rp = document.querySelector('.right-panel');
  const isOpen = sb.classList.toggle('mob-open');
  if (isOpen) { rp && rp.classList.remove('mob-open'); }
  ov.classList.toggle('open', isOpen);
}
function _togglePreview() {
  const rp = document.querySelector('.right-panel');
  const ov = document.getElementById('mob-overlay');
  const sb = document.getElementById('app-sidebar');
  const isOpen = rp.classList.toggle('mob-open');
  if (isOpen) { sb && sb.classList.remove('mob-open'); }
  ov.classList.toggle('open', isOpen);
}
function _closeMobileDrawers() {
  document.getElementById('app-sidebar')?.classList.remove('mob-open');
  document.querySelector('.right-panel')?.classList.remove('mob-open');
  document.getElementById('mob-overlay')?.classList.remove('open');
}

// ============ Boot ============
(async () => {
  await loadCurrentUser();
  hydrate();
  renderMain();
})();