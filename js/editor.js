// ============ HireFlow Editor ============
const API = window.HIREFLOW_CONFIG.API_URL;

const TOKEN = localStorage.getItem('hf_token');
if (!TOKEN) location.href = 'login';

// ---- Default state ----
const DEFAULT_RESUME = {
  template: 'modern',
  customize: {
    accent: '#4f46e5', font: 'Inter', spacing: 'medium',
    sections: { education:true, experience:true, skills:true, projects:true, certifications:true, awards:true, volunteer:false, publications:false, leadership:true },
    sectionOrder: ['experience','education','skills','projects','certifications','awards','leadership','volunteer','publications']
  },
  personal: { fullName:'', email:'', phone:'', location:'', linkedin:'', github:'', website:'', summary:'' },
  experience: [], education: [], skills: { categories: [] }, projects: [],
  certifications: [], awards: [], leadership: [], volunteer: [], publications: [],
  tailor: { jobDescription:'', tailoredSummary:'' },
  versions: []
};

// Whether the browser already had a saved resume, drives the one-time cloud
// hydrate below (fresh device / cleared storage should pull the cloud copy).
const HAD_LOCAL_RESUME = !!localStorage.getItem('hf_resume');
let resume = (function () {
  try { return JSON.parse(localStorage.getItem('hf_resume') || 'null') || structuredClone(DEFAULT_RESUME); }
  catch { return structuredClone(DEFAULT_RESUME); }  // corrupt storage must not white-screen the editor
})();
let currentSection = 'template';
// Cache of the last AI results (read by the health-score badge, never re-fetched).
let AI_RESULTS = (function(){ try { return JSON.parse(localStorage.getItem('hf_ai_results') || '{}'); } catch { return {}; } })();

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
  quickfix:      { label: 'Quick Fixes',    icon: 'check' },
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
    // Free users can enter Pro sections now, show a subtle "Pro" badge instead of a lock.
    const showProBadge = isPro && isFree();
    const done = _sectionComplete(s);
    const indicator = showProBadge
      ? `<span class="sidebar-pro-badge">Pro</span>`
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

  // Plan pill (download counter lives only on the export page now)
  const planPill = document.getElementById('plan-pill');
  const ipTab = document.getElementById('ip-tab');
  const obadge = document.getElementById('optimize-badge');

  if (isPaid()) {
    planPill.innerHTML = `<button class="pill success" onclick="openBillingPortal()" style="cursor:pointer;">${ICON('crown','ico ico-sm')} ${planLabel()}</button>`;
    if (obadge) obadge.innerHTML = '';
  } else {
    planPill.innerHTML = `<a class="btn btn-primary btn-xs" href="pricing" style="text-decoration:none;">${ICON('sparkle','ico ico-sm')} <span>Upgrade</span></a>`;
    if (obadge) obadge.innerHTML = ` <span class="sidebar-pro-badge">Pro</span>`;
  }

  // Account center identity (avatar initials, email, plan label)
  const acctEmail = (CURRENT_USER && CURRENT_USER.email) || localStorage.getItem('hf_email') || '';
  const initials = acctEmail ? acctEmail.trim().charAt(0).toUpperCase() : 'A';
  ['acct-avatar', 'acct-avatar-lg'].forEach(function (id) {
    const el = document.getElementById(id); if (el) el.textContent = initials;
  });
  const emEl = document.getElementById('acct-email'); if (emEl) emEl.textContent = acctEmail || 'Account';
  const plEl = document.getElementById('acct-plan-label'); if (plEl) plEl.textContent = isPaid() ? planLabel() + ' plan' : 'Free plan';
  // Manage / cancel subscription is only relevant to paying users.
  const mgRow = document.getElementById('acct-manage-sub'); if (mgRow) mgRow.style.display = isPaid() ? '' : 'none';
  // Admin Console: only admins/super-admins (moved here from the topbar button).
  const adRow = document.getElementById('acct-admin-console');
  if (adRow) adRow.style.display = (typeof isAdmin === 'function' && isAdmin()) ? '' : 'none';

  // Interview Prep is free for everyone, no lock, navigates normally.
  if (ipTab) {
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
    setTimeout(() => { b.style.display = 'none'; history.replaceState(null,'','editor'); }, 6000);
  }
}

// ---- Sidebar (with plan gating) ----
const PRO_SECTIONS = new Set(['tailor','ats','analysis']);
document.querySelectorAll('.sidebar-item').forEach(item => {
  item.addEventListener('click', () => {
    const sec = item.dataset.section;
    // Free users may now enter Pro sections (tailor/ats/analysis) and see the full
    // UI. The free-use gate is handled inside the section, just before the AI runs.
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
  dashboard: renderDashboard, quickfix: renderQuickFix, customize: renderCustomize
};

function renderMain() {
  const mainEl = document.getElementById('main');
  const renderer = SECTIONS[currentSection]
    || (isCustomSection(currentSection) ? () => renderCustomSection(currentSection) : null)
    || (() => '<p>Section not built yet.</p>');
  mainEl.innerHTML = renderer();
  // Trigger section fade-in
  const card = mainEl.firstElementChild;
  if (card) { card.classList.remove('main-section-enter'); void card.offsetWidth; card.classList.add('main-section-enter'); }
  // Close mobile drawers when navigating
  _closeMobileDrawers();
  bindAutoSave();
  _wireAutoGrow();
  setTimeout(_wireAutoGrow, 60);   // re-fit after fonts/layout settle
  renderPreview();
  // Bind tag input if on skills section
  if (currentSection === 'skills') setTimeout(_bindTagInput, 0);
  // Wire drag-to-reorder
  setTimeout(_bindDragReorder, 0);
  setTimeout(_bindSectionDrag, 0);
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
      <p style="color:var(--muted); font-size:13px; margin-bottom:18px;">Choose a style, grouped by what you're applying for. Colors and fonts are in Customize.</p>
      ${(typeof TEMPLATE_CATEGORIES !== 'undefined' ? TEMPLATE_CATEGORIES : [null]).map(cat => {
        const items = TEMPLATE_DEFS.filter(t => (cat ? t.cat === cat : true));
        if (!items.length) return '';
        return `
        ${cat ? `<div class="tpl-cat-label">${cat}</div>` : ''}
        <div class="template-grid">
          ${items.map(t => `
            <div class="template-card ${resume.template===t.id?'selected':''}" onclick="selectTemplate('${t.id}')">
              <div class="template-thumb">${TEMPLATE_THUMBS[t.id] || ''}</div>
              <div class="template-card-foot">
                <span class="t-name">${t.name}</span>
                ${resume.template===t.id ? '<span class="t-badge" style="color:#a5b4fc;">✓ Active</span>' : ''}
              </div>
            </div>`).join('')}
        </div>`;
      }).join('')}
      <div class="action-row">
        <span></span>
        <button class="btn btn-primary" onclick="nextSection('personal')">Continue ${ICON('arrowRight')}</button>
      </div>
    </div>`;
}
function selectTemplate(id) { resume.template = id; save(); renderMain(); }


// ── Illustrated template thumbnails ──
const TEMPLATE_THUMBS = {
  harvard: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="24" y="10" width="37" height="5" rx="1" fill="#111"/>
    <rect x="28" y="18" width="29" height="1.8" rx="1" fill="#777"/>
    <rect x="8" y="29" width="26" height="2" rx=".5" fill="#111"/><rect x="8" y="32.4" width="69" height=".9" fill="#111"/>
    <rect x="8" y="37" width="40" height="1.6" rx=".5" fill="#444"/><rect x="8" y="41" width="63" height="1.3" rx=".5" fill="#cfcfcf"/><rect x="8" y="45" width="58" height="1.3" rx=".5" fill="#cfcfcf"/>
    <rect x="8" y="55" width="26" height="2" rx=".5" fill="#111"/><rect x="8" y="58.4" width="69" height=".9" fill="#111"/>
    <rect x="8" y="63" width="40" height="1.6" rx=".5" fill="#444"/><rect x="8" y="67" width="61" height="1.3" rx=".5" fill="#cfcfcf"/><rect x="8" y="71" width="55" height="1.3" rx=".5" fill="#cfcfcf"/>
    <rect x="8" y="81" width="26" height="2" rx=".5" fill="#111"/><rect x="8" y="84.4" width="69" height=".9" fill="#111"/>
    <rect x="8" y="89" width="60" height="1.3" rx=".5" fill="#cfcfcf"/>
  </svg>`,
  stanford: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="8" y="10" width="46" height="6.5" rx="1" fill="#111"/>
    <rect x="8" y="20" width="52" height="1.8" rx="1" fill="#888"/>
    <rect x="8" y="32" width="18" height="1.8" rx=".5" fill="#111"/>
    <rect x="8" y="37" width="40" height="1.6" rx=".5" fill="#555"/><rect x="8" y="41" width="64" height="1.3" rx=".5" fill="#d4d4d4"/><rect x="8" y="45" width="58" height="1.3" rx=".5" fill="#d4d4d4"/>
    <rect x="8" y="58" width="18" height="1.8" rx=".5" fill="#111"/>
    <rect x="8" y="63" width="40" height="1.6" rx=".5" fill="#555"/><rect x="8" y="67" width="62" height="1.3" rx=".5" fill="#d4d4d4"/><rect x="8" y="71" width="55" height="1.3" rx=".5" fill="#d4d4d4"/>
    <rect x="8" y="84" width="18" height="1.8" rx=".5" fill="#111"/>
    <rect x="8" y="89" width="60" height="1.3" rx=".5" fill="#d4d4d4"/>
  </svg>`,
  jake: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="23" y="10" width="39" height="5.5" rx="1" fill="#111"/>
    <rect x="20" y="18" width="45" height="1.8" rx="1" fill="#777"/>
    <rect x="8" y="28" width="28" height="2" rx=".5" fill="#111"/><rect x="8" y="31.6" width="69" height=".8" fill="#333"/>
    <rect x="8" y="36" width="34" height="1.7" rx=".5" fill="#333"/><rect x="62" y="36" width="15" height="1.7" rx=".5" fill="#999"/>
    <rect x="8" y="40" width="63" height="1.3" rx=".5" fill="#cfcfcf"/><rect x="8" y="44" width="57" height="1.3" rx=".5" fill="#cfcfcf"/>
    <rect x="8" y="54" width="28" height="2" rx=".5" fill="#111"/><rect x="8" y="57.6" width="69" height=".8" fill="#333"/>
    <rect x="8" y="62" width="34" height="1.7" rx=".5" fill="#333"/><rect x="62" y="62" width="15" height="1.7" rx=".5" fill="#999"/>
    <rect x="8" y="66" width="61" height="1.3" rx=".5" fill="#cfcfcf"/><rect x="8" y="70" width="55" height="1.3" rx=".5" fill="#cfcfcf"/>
    <rect x="8" y="80" width="28" height="2" rx=".5" fill="#111"/><rect x="8" y="83.6" width="69" height=".8" fill="#333"/>
    <rect x="8" y="88" width="60" height="1.3" rx=".5" fill="#cfcfcf"/>
  </svg>`,
  consulting: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="22" y="9" width="41" height="5" rx="1" fill="#1a1a1a"/>
    <rect x="28" y="17" width="29" height="2" rx="1" fill="#777"/>
    <rect x="8" y="28" width="69" height="2.4" rx="1" fill="#1a1a1a"/>
    <rect x="8" y="27.5" width="69" height=".7" fill="#1a1a1a"/>
    <rect x="8" y="34" width="34" height="1.8" rx=".5" fill="#444"/>
    <rect x="8" y="39" width="63" height="1.4" rx=".5" fill="#cfcfcf"/>
    <rect x="8" y="43" width="58" height="1.4" rx=".5" fill="#cfcfcf"/>
    <rect x="8" y="47" width="61" height="1.4" rx=".5" fill="#cfcfcf"/>
    <rect x="8" y="56" width="69" height="1.6" rx=".5" fill="#1a1a1a"/>
    <rect x="8" y="62" width="34" height="1.8" rx=".5" fill="#444"/>
    <rect x="8" y="67" width="63" height="1.4" rx=".5" fill="#cfcfcf"/>
    <rect x="8" y="71" width="57" height="1.4" rx=".5" fill="#cfcfcf"/>
    <rect x="8" y="80" width="69" height="1.6" rx=".5" fill="#1a1a1a"/>
    <rect x="8" y="86" width="40" height="1.8" rx=".5" fill="#444"/>
    <rect x="8" y="91" width="60" height="1.4" rx=".5" fill="#cfcfcf"/>
  </svg>`,
  faang: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="8" y="9" width="44" height="6" rx="1" fill="#111"/>
    <rect x="8" y="18" width="50" height="2" rx="1" fill="#9aa0a6"/>
    <rect x="8" y="29" width="22" height="2.4" rx="1" fill="#2563eb"/>
    <rect x="8" y="33" width="69" height="1" fill="#2563eb" opacity=".25"/>
    <rect x="8" y="38" width="36" height="1.9" rx=".5" fill="#202124"/>
    <rect x="11" y="43" width="60" height="1.4" rx=".5" fill="#d4d6da"/>
    <rect x="11" y="47" width="55" height="1.4" rx=".5" fill="#d4d6da"/>
    <rect x="8" y="56" width="22" height="2.4" rx="1" fill="#2563eb"/>
    <rect x="8" y="60" width="69" height="1" fill="#2563eb" opacity=".25"/>
    <rect x="8" y="65" width="36" height="1.9" rx=".5" fill="#202124"/>
    <rect x="11" y="70" width="62" height="1.4" rx=".5" fill="#d4d6da"/>
    <rect x="11" y="74" width="56" height="1.4" rx=".5" fill="#d4d6da"/>
    <rect x="8" y="83" width="22" height="2.4" rx="1" fill="#2563eb"/>
    <rect x="8" y="87" width="69" height="1" fill="#2563eb" opacity=".25"/>
    <rect x="8" y="92" width="64" height="1.4" rx=".5" fill="#d4d6da"/>
  </svg>`,
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
  onyx: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="0" y="0" width="30" height="110" fill="#1e2433"/>
    <rect x="5" y="9" width="20" height="4" rx="1" fill="#fff"/>
    <rect x="5" y="15" width="13" height="2" rx="1" fill="#6366f1"/>
    <rect x="5" y="26" width="11" height="2" rx="1" fill="#6366f1"/>
    <rect x="5" y="31" width="19" height="1.5" rx=".5" fill="#cbd5e1"/>
    <rect x="5" y="35" width="16" height="1.5" rx=".5" fill="#cbd5e1"/>
    <rect x="5" y="46" width="11" height="2" rx="1" fill="#6366f1"/>
    <rect x="5" y="51" width="8" height="3" rx="1" fill="rgba(255,255,255,.16)"/>
    <rect x="15" y="51" width="9" height="3" rx="1" fill="rgba(255,255,255,.16)"/>
    <rect x="5" y="56" width="10" height="3" rx="1" fill="rgba(255,255,255,.16)"/>
    <rect x="36" y="11" width="18" height="2.5" rx="1" fill="#111827"/>
    <rect x="36" y="15.5" width="43" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="36" y="19.5" width="40" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="36" y="29" width="18" height="2.5" rx="1" fill="#111827"/>
    <rect x="36" y="34" width="33" height="1.5" rx=".5" fill="#d1d5db"/>
    <rect x="36" y="38" width="43" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="36" y="42" width="40" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="36" y="46" width="38" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="36" y="56" width="18" height="2.5" rx="1" fill="#111827"/>
    <rect x="36" y="61" width="33" height="1.5" rx=".5" fill="#d1d5db"/>
    <rect x="36" y="65" width="41" height="1.5" rx=".5" fill="#e5e7eb"/>
  </svg>`,
  slate: `<svg viewBox="0 0 85 110" xmlns="http://www.w3.org/2000/svg">
    <rect width="85" height="110" fill="#fff"/>
    <rect x="0" y="0" width="85" height="26" fill="#0f172a"/>
    <rect x="8" y="8" width="34" height="5" rx="1" fill="#fff"/>
    <rect x="8" y="16" width="22" height="2" rx="1" fill="#0ea5e9"/>
    <rect x="60" y="8" width="18" height="1.5" rx=".5" fill="#cbd5e1"/>
    <rect x="60" y="12" width="18" height="1.5" rx=".5" fill="#cbd5e1"/>
    <rect x="60" y="16" width="18" height="1.5" rx=".5" fill="#cbd5e1"/>
    <rect x="8" y="34" width="2" height="5" fill="#0ea5e9"/>
    <rect x="13" y="34" width="18" height="2.5" rx="1" fill="#0ea5e9"/>
    <rect x="13" y="40" width="64" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="13" y="44" width="58" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="54" width="2" height="5" fill="#0ea5e9"/>
    <rect x="13" y="54" width="18" height="2.5" rx="1" fill="#0ea5e9"/>
    <rect x="13" y="60" width="50" height="1.5" rx=".5" fill="#d1d5db"/>
    <rect x="13" y="64" width="64" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="13" y="68" width="60" height="1.5" rx=".5" fill="#e5e7eb"/>
    <rect x="8" y="78" width="2" height="5" fill="#0ea5e9"/>
    <rect x="13" y="78" width="18" height="2.5" rx="1" fill="#0ea5e9"/>
    <rect x="13" y="84" width="55" height="1.5" rx=".5" fill="#e5e7eb"/>
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

// ============ Custom (user-defined) sections ============
// Metadata: resume.customize.customSections = [{ key, title }]; entries live in
// resume[key] (array), so all the generic editing machinery works unchanged.
function _customSections() {
  resume.customize = resume.customize || {};
  if (!Array.isArray(resume.customize.customSections)) resume.customize.customSections = [];
  return resume.customize.customSections;
}
function _ensureCustomSections() {
  _customSections().forEach(function (m) { if (!Array.isArray(resume[m.key])) resume[m.key] = []; });
}
function isCustomSection(key) { return _customSections().some(function (m) { return m.key === key; }); }
function _customTitle(key) { var m = _customSections().find(function (x) { return x.key === key; }); return m ? m.title : 'Section'; }

function addCustomSection() {
  _ensureCustomSections();
  var key = 'custom_' + Date.now().toString(36);
  resume[key] = [];
  _customSections().push({ key: key, title: 'New Section' });
  resume.customize.sections = resume.customize.sections || {};
  resume.customize.sections[key] = true;
  resume.customize.sectionOrder = Array.isArray(resume.customize.sectionOrder) ? resume.customize.sectionOrder : [];
  resume.customize.sectionOrder.push(key);
  save();
  renderCustomNav();
  currentSection = key;
  document.querySelectorAll('.sidebar-item').forEach(function (i) { i.classList.toggle('active', i.dataset.section === key); });
  renderMain();
  setTimeout(function () { var t = document.getElementById('custom-title-input'); if (t) { t.focus(); t.select(); } }, 40);
}

function deleteCustomSection(key) {
  var metas = _customSections();
  var idx = metas.findIndex(function (m) { return m.key === key; });
  if (idx === -1) return;
  metas.splice(idx, 1);
  delete resume[key];
  if (resume.customize.sections) delete resume.customize.sections[key];
  if (Array.isArray(resume.customize.sectionOrder)) resume.customize.sectionOrder = resume.customize.sectionOrder.filter(function (k) { return k !== key; });
  save();
  renderCustomNav();
  currentSection = 'template';
  document.querySelectorAll('.sidebar-item').forEach(function (i) { i.classList.toggle('active', i.dataset.section === 'template'); });
  renderMain();
  toast('Section deleted', { type: 'info' });
}

function renameCustomSection(key, title) {
  var m = _customSections().find(function (x) { return x.key === key; });
  if (!m) return;
  m.title = title || 'Section';
  save();
  renderCustomNav();
  schedulePreview();
}

// Build the sidebar nav items for custom sections + wire the "Add section" button.
function renderCustomNav() {
  var slot = document.getElementById('custom-nav');
  if (slot) {
    slot.innerHTML = _customSections().map(function (m) {
      var active = currentSection === m.key ? ' active' : '';
      var done = Array.isArray(resume[m.key]) && resume[m.key].length ? ' has-content' : '';
      return '<div class="sidebar-item' + active + done + '" data-section="' + m.key + '">'
        + ICON('doc') + '<span>' + esc(m.title || 'Section') + '</span>'
        + (resume[m.key] && resume[m.key].length
            ? '<span class="s-check"><svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5 5 4 7.5 8.5 2.5"/></svg></span>'
            : '<span class="s-dot"></span>')
        + '</div>';
    }).join('');
    slot.querySelectorAll('.sidebar-item').forEach(function (item) {
      item.addEventListener('click', function () {
        document.querySelectorAll('.sidebar-item').forEach(function (i) { i.classList.remove('active'); });
        item.classList.add('active');
        currentSection = item.dataset.section;
        renderMain();
      });
    });
  }
  var addBtn = document.getElementById('sidebar-add-section');
  if (addBtn && !addBtn._wired) {
    addBtn._wired = true;
    addBtn.innerHTML = ICON('plus') + '<span>Add section</span>';
    addBtn.addEventListener('click', addCustomSection);
  }
}

// Editor panel for one custom section: rename, delete, plus the generic entry list.
function renderCustomSection(key) {
  _ensureCustomSections();
  if (!Array.isArray(resume[key])) resume[key] = [];
  var title = _customTitle(key);
  var fields = [['Heading', 'heading'], ['Subheading', 'subheading'], ['Date', 'date']];
  var list = resume[key];
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON('doc')} <input id="custom-title-input" value="${esc(title)}" placeholder="Section title"
          oninput="renameCustomSection('${key}', this.value)"
          style="font-size:16px;font-weight:600;background:transparent;border:0;border-bottom:1px solid var(--border);color:var(--text);padding:2px 2px 4px;min-width:180px;"></h3>
        <button class="ai-btn" onclick="aiImprove('${key}')">${ICON('sparkle','ico ico-sm')} AI Improve</button>
      </div>
      <p style="color:var(--muted);font-size:12.5px;margin:-4px 0 14px;">A section you control, add anything: languages, patents, interests, references, and more.</p>
      ${list.length === 0 ? `<div class="empty-state">No entries yet. Add your first one below.</div>`
        : `<div class="drag-list">${list.map((it, i) => itemCard(key, i, fields.map(f => [f[0], f[1], it[f[1]]]), 'description', it.description)).join('')}</div>`}
      <button class="add-btn" onclick='addItem("${key}",${JSON.stringify(blank(fields, 'description'))})'>${ICON('plus','ico ico-sm')} Add entry</button>
      <div class="action-row" style="margin-top:16px;">
        <button class="btn btn-ghost btn-sm" onclick="deleteCustomSection('${key}')" style="color:var(--danger);">${ICON('trash','ico ico-sm')} Delete section</button>
        <button class="btn btn-primary btn-sm" onclick="nextSection('customize')">Done ${ICON('arrowRight')}</button>
      </div>
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
      ${resume.experience.length === 0 ? `<div class="empty-state">No work experience added yet, add your first role to get started.</div>`
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

// Live bullet meter update, called oninput on each description textarea
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


// ============ Quick Fixes (100% client-side, no AI, no network) ============
// A self-serve checklist of resume best-practices. Every check below is a pure
// function over the in-memory `resume` object using only regex/string logic, // nothing here calls the Worker, ai(), fetch(), or Cloudflare Workers AI.
// Available to all users (free included); never gated behind isFree()/isPaid().

// Static weak-opener → strong-verb lookup. Each entry rewrites the start of a
// bullet. Order matters (longer/more-specific phrases first).
const QF_VERB_SWAPS = [
  [/^responsible for\s+/i, 'Managed '],
  [/^was responsible for\s+/i, 'Managed '],
  [/^duties included\s+/i, 'Delivered '],
  [/^in charge of\s+/i, 'Directed '],
  [/^was tasked with\s+/i, 'Led '],
  [/^tasked with\s+/i, 'Led '],
  [/^worked on\s+/i, 'Built '],
  [/^helped with\s+/i, 'Contributed to '],
  [/^assisted with\s+/i, 'Supported '],
  [/^assisted\s+/i, 'Supported '],
  [/^helped\s+/i, 'Contributed to '],
];

// Collect every description-style bullet block from experience + projects.
function _qfBullets() {
  const out = [];
  (resume.experience || []).forEach((e, i) => out.push({ key: 'experience', idx: i, label: e.title || ('Experience ' + (i + 1)), desc: e.description || '' }));
  (resume.projects || []).forEach((e, i) => out.push({ key: 'projects', idx: i, label: e.name || ('Project ' + (i + 1)), desc: e.description || '' }));
  return out;
}

// --- Individual checks: each returns an array of issue objects (empty = pass) ---

function _qfWeakVerbs() {
  const issues = [];
  _qfBullets().forEach(b => {
    let count = 0;
    b.desc.split('\n').forEach(line => {
      const rest = line.replace(/^\s*[•\-\*]\s*/, '');
      if (QF_VERB_SWAPS.some(([rx]) => rx.test(rest))) count++;
    });
    if (count) issues.push({
      level: 'warn',
      title: count + ' weak ' + (count === 1 ? 'opener' : 'openers') + ' in “' + b.label + '”',
      detail: 'Bullets starting with phrases like “responsible for” read passively. Swap in strong action verbs (e.g. Managed, Built, Led).',
      action: { type: 'fix', label: 'Auto-fix', run: () => _qfFixVerbs(b.key, b.idx) }
    });
  });
  return issues;
}
function _qfFixVerbs(key, idx) {
  const entry = resume[key][idx];
  entry.description = (entry.description || '').split('\n').map(line => {
    const m = line.match(/^(\s*[•\-\*]\s*)?([\s\S]*)$/);
    const lead = m[1] || '';
    let rest = m[2];
    for (const [rx, rep] of QF_VERB_SWAPS) {
      if (rx.test(rest)) { rest = rest.replace(rx, rep); break; }
    }
    return lead + rest;
  }).join('\n');
}

function _qfMissingMetrics() {
  const issues = [];
  _qfBullets().forEach(b => {
    if (!b.desc.trim()) return;
    if (!/[\d$%]/.test(b.desc)) issues.push({
      level: 'info',
      title: 'No numbers in “' + b.label + '”',
      detail: 'Quantify impact with a number, %, or $ amount, recruiters scan for measurable results. (We can’t invent figures for you.)',
      action: { type: 'goto', section: b.key, focus: b.key + '.' + b.idx + '.description' }
    });
  });
  return issues;
}

function _qfContact() {
  const issues = [];
  const p = resume.personal;
  [['email', 'Email'], ['phone', 'Phone'], ['location', 'Location']].forEach(([f, lbl]) => {
    if (!String(p[f] || '').trim()) issues.push({
      level: 'warn',
      title: 'Missing ' + lbl,
      detail: 'Add your ' + lbl.toLowerCase() + ' so recruiters can reach you.',
      action: { type: 'goto', section: 'personal', focus: 'personal.' + f }
    });
  });
  return issues;
}

function _qfEmptySections() {
  const issues = [];
  if (!resume.experience.length) issues.push({ level: 'warn', title: 'No work experience', detail: 'Add at least one role, this is the most important section.', action: { type: 'goto', section: 'experience' } });
  if (!resume.education.length) issues.push({ level: 'info', title: 'No education listed', detail: 'Add your education history.', action: { type: 'goto', section: 'education' } });
  if (!resume.skills.categories.flatMap(c => c.items).length) issues.push({ level: 'warn', title: 'No skills listed', detail: 'Add skills so ATS keyword matching has something to match.', action: { type: 'goto', section: 'skills' } });
  return issues;
}

function _qfSummary() {
  const s = (resume.personal.summary || '').trim();
  if (!s) return [];
  const n = s.split(/\s+/).filter(Boolean).length;
  if (n < 20) return [{ level: 'info', title: 'Summary too short (' + n + ' words)', detail: 'Recruiters need more context, aim for 20–80 words.', action: { type: 'goto', section: 'personal', focus: 'personal.summary' } }];
  if (n > 80) return [{ level: 'info', title: 'Summary too long (' + n + ' words)', detail: 'Tighten this up, keep it under 80 words.', action: { type: 'goto', section: 'personal', focus: 'personal.summary' } }];
  return [];
}

function _qfDupSkills() {
  const seen = new Set();
  let dup = 0;
  (resume.skills.categories || []).forEach(c => (c.items || []).forEach(it => {
    const k = String(it).trim().toLowerCase();
    if (seen.has(k)) dup++; else seen.add(k);
  }));
  if (!dup) return [];
  return [{
    level: 'warn',
    title: dup + ' duplicate skill' + (dup > 1 ? 's' : ''),
    detail: 'The same skill appears more than once (case-insensitive). Remove duplicates to keep your list clean.',
    action: { type: 'fix', label: 'Remove duplicates', run: _qfFixDupSkills }
  }];
}
function _qfFixDupSkills() {
  const seen = new Set();
  (resume.skills.categories || []).forEach(c => {
    c.items = (c.items || []).filter(it => {
      const k = String(it).trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true; // preserve first-seen casing
    });
  });
}

function _qfDateFormat() {
  const fmt = s => {
    s = String(s || '').trim();
    if (!s || /^present$/i.test(s)) return null;
    if (/^[A-Za-z]{3,9}\.?\s+\d{4}$/.test(s)) return 'Mon YYYY';      // Jan 2023
    if (/^\d{1,2}\/\d{4}$/.test(s)) return 'MM/YYYY';                 // 01/2023
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return 'MM/DD/YYYY';   // 01/05/2023
    if (/^\d{4}$/.test(s)) return 'YYYY';                            // 2023
    return 'other';
  };
  const all = [];
  resume.experience.forEach((e, i) => ['start', 'end'].forEach(f => { const ff = fmt(e[f]); if (ff) all.push({ key: 'experience', idx: i, f, fmt: ff, label: e.title || ('Experience ' + (i + 1)) }); }));
  resume.education.forEach((e, i) => ['start', 'end'].forEach(f => { const ff = fmt(e[f]); if (ff) all.push({ key: 'education', idx: i, f, fmt: ff, label: e.school || ('Education ' + (i + 1)) }); }));
  if (all.length < 2) return [];
  const counts = {};
  all.forEach(a => counts[a.fmt] = (counts[a.fmt] || 0) + 1);
  const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const off = all.filter(a => a.fmt !== common);
  if (!off.length) return [];
  return [{
    level: 'info',
    title: off.length + ' inconsistent date format' + (off.length > 1 ? 's' : ''),
    detail: 'Most dates use the “' + common + '” style. These differ: ' + off.map(o => '“' + o.label + '” (' + o.f + ')').join(', ') + '. Pick one style throughout. (Auto-fix is unsafe to guess here.)',
    action: { type: 'goto', section: off[0].key, focus: off[0].key + '.' + off[0].idx + '.' + off[0].f }
  }];
}

const QF_CHECKS = [
  { name: 'Strong action verbs', fn: _qfWeakVerbs },
  { name: 'Quantified impact', fn: _qfMissingMetrics },
  { name: 'Contact info complete', fn: _qfContact },
  { name: 'Core sections filled', fn: _qfEmptySections },
  { name: 'Summary length', fn: _qfSummary },
  { name: 'No duplicate skills', fn: _qfDupSkills },
  { name: 'Consistent date formats', fn: _qfDateFormat },
];

// Flat list of the current render's actionable issues, indexed by qfAction().
let _qfIssues = [];

// Run every check and flatten the issues (shared by the Quick Fixes panel and
// the Dashboard's "top things to fix"). Sets the global _qfIssues so qfAction()
// indices stay valid for whatever rendered last.
function _qfGather() {
  _qfIssues = [];
  let passed = 0;
  QF_CHECKS.forEach(function (check) {
    let issues = [];
    try { issues = check.fn() || []; } catch (e) { issues = []; }
    if (!issues.length) passed++;
    issues.forEach(function (iss) { _qfIssues.push(iss); });
  });
  return { passed: passed, total: QF_CHECKS.length, issues: _qfIssues.slice() };
}

function _qfBuild() {
  _qfIssues = [];
  let passed = 0;
  const cards = QF_CHECKS.map(check => {
    let issues = [];
    try { issues = check.fn() || []; } catch (e) { issues = []; }
    if (!issues.length) {
      passed++;
      return `<div class="qf-card qf-pass">
        <span class="qf-ico qf-ico-ok">${_qfCheckSvg()}</span>
        <div class="qf-card-body"><div class="qf-card-title">${esc(check.name)}</div>
        <div class="qf-card-detail">Looks good, nothing to fix here.</div></div>
      </div>`;
    }
    return issues.map(issue => {
      const i = _qfIssues.push(issue) - 1;
      const lvl = issue.level === 'warn' ? 'warn' : 'info';
      const btn = issue.action && issue.action.type === 'fix'
        ? `<button class="btn btn-secondary qf-btn" onclick="qfAction(${i})">${esc(issue.action.label || 'Auto-fix')}</button>`
        : `<button class="qf-goto" onclick="qfAction(${i})">Go to section →</button>`;
      return `<div class="qf-card qf-${lvl}">
        <span class="qf-ico qf-ico-${lvl}">${_qfWarnSvg()}</span>
        <div class="qf-card-body">
          <div class="qf-card-title">${esc(issue.title)}</div>
          <div class="qf-card-detail">${esc(issue.detail)}</div>
        </div>
        ${btn}
      </div>`;
    }).join('');
  }).join('');

  const total = QF_CHECKS.length;
  const pct = Math.round((passed / total) * 100);
  const barCol = pct >= 80 ? 'var(--accent)' : pct >= 50 ? '#fcd34d' : '#fca5a5';
  return `
    <div class="qf-progress">
      <div class="qf-progress-head">
        <strong>${passed} of ${total} checks passing</strong>
        <span class="pill ${pct >= 80 ? 'success' : pct >= 50 ? 'warn' : 'error'}">${pct}%</span>
      </div>
      <div class="qf-track"><div class="qf-fill" style="width:${pct}%;background:${barCol};"></div></div>
    </div>
    <div class="qf-list">${cards}</div>`;
}

function renderQuickFix() {
  return `
    <div class="section-card">
      <div class="section-head">
        <h3>${ICON('check')} Quick Fixes</h3>
        <span class="qf-free-badge">Free for everyone</span>
      </div>
      <p style="color:var(--muted); font-size:13px; margin-bottom:18px;">
        Instant, self-serve best-practice checks that run entirely in your browser, included on every plan.
        Apply fixes with one click, or jump straight to the field that needs your input.
      </p>
      <div id="qf-body">${_qfBuild()}</div>
    </div>`;
}

// Live refresh of just the checklist body (called from renderPreview while the
// Quick Fixes section is open). The panel has no text inputs, so re-rendering
// its innerHTML never steals focus.
function _refreshQuickFix() {
  const host = document.getElementById('qf-body');
  if (host) host.innerHTML = _qfBuild();
}

function qfAction(i) {
  const issue = _qfIssues[i];
  if (!issue || !issue.action) return;
  const a = issue.action;
  if (a.type === 'fix') {
    a.run();
    save();
    renderMain(); // re-runs checks + preview
  } else {
    nextSection(a.section);
    if (a.focus) setTimeout(() => {
      const el = document.querySelector('[data-bind="' + a.focus + '"]');
      if (el) {
        el.focus();
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('qf-flash');
        setTimeout(() => el.classList.remove('qf-flash'), 1600);
      }
    }, 60);
  }
}

function _qfCheckSvg() { return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8.5 6.5 12 13 4.5"/></svg>'; }
function _qfWarnSvg() { return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.6 15 14H1z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><circle cx="8" cy="11.6" r="0.4"/></svg>'; }


// ============ Tailor / ATS / Analysis / Dashboard / Customize ============
function _jdWordCount(text) {
  var n = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return n ? n + ' words' : '';
}

function _jdWordCount(text) {
  var n = (text || '').trim().split(/\s+/).filter(Boolean).length;
  return n ? n + ' words' : '';
}

// Parse the tailor notes blob into structured blocks (shared by the renderer
// and the "Apply These Changes" action).
function _parseTailorBlocks(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let cur = null;
  const isHead = l => /^(matched keywords|missing keywords|what to emphasize|suggested bullet rewrites)/i.test(l);
  lines.forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    if (isHead(line)) {
      let kind = 'card', title = line.replace(/:.*$/, '').trim(), hint = '';
      if (/^matched/i.test(line)) { kind = 'good'; title = 'Matched keywords'; }
      else if (/^missing/i.test(line)) { kind = 'bad'; title = 'Missing keywords'; hint = 'Add these only if you genuinely have them.'; }
      else if (/^what to emphasize/i.test(line)) title = 'What to emphasize';
      else if (/^suggested/i.test(line)) title = 'Suggested bullet rewrites';
      cur = { kind, title, hint, items: [] };
      blocks.push(cur);
      return;
    }
    const m = line.match(/^[✓✗×x→•\-*]\s*(.*)$/);
    const t = (m ? m[1] : line).trim();
    if (!t) return;
    if (cur) cur.items.push(t);
    else blocks.push({ kind: 'intro', items: [t], title: null });
  });
  return blocks;
}

// Lay out the parsed blocks: matched/missing keyword pills + emphasis/bullet cards.
// Structured tailoring result: keyword chips + before→after bullet diffs + emphasis.
function _renderTailorStructured(r) {
  const chip = (k, cls) => `<span class="ats-kw-pill ats-kw-${cls}">${esc(k)}</span>`;
  const matched = Array.isArray(r.matchedKeywords) ? r.matchedKeywords : [];
  const missing = Array.isArray(r.missingKeywords) ? r.missingKeywords : [];
  const bullets = Array.isArray(r.bulletSuggestions) ? r.bulletSuggestions : [];
  const emph = Array.isArray(r.emphasize) ? r.emphasize : [];
  let html = '';
  if (matched.length) html += `<div class="tailor-block tailor-good"><div class="tailor-block-head">Matched keywords<span class="tailor-count">${matched.length}</span></div><div class="tailor-pills">${matched.map(k => chip(k, 'matched')).join('')}</div></div>`;
  if (missing.length) html += `<div class="tailor-block tailor-bad"><div class="tailor-block-head">Add these if true<span class="tailor-count">${missing.length}</span></div><div class="tailor-pills">${missing.map(k => chip(k, 'missing')).join('')}</div></div>`;
  if (bullets.length) {
    html += `<div class="tailor-block tailor-card"><div class="tailor-block-head">Bullet rewrites</div>` +
      bullets.map(b => `
        <div class="td-diff">
          ${b.before ? `<div class="td-row td-before"><span class="td-tag td-tag-before">Before</span><span>${esc(_deName(b.before))}</span></div>` : ''}
          <div class="td-row td-after"><span class="td-tag td-tag-after">After</span><span>${esc(_deName(b.after))}</span>
            <button class="td-copy" title="Copy rewrite" onclick="_copyTailorBullet(this)" data-t="${esc(b.after)}">${ICON('doc','ico ico-sm')} Copy</button>
          </div>
        </div>`).join('') + `</div>`;
  }
  if (emph.length) html += `<div class="tailor-block tailor-card"><div class="tailor-block-head">What to emphasize</div><ul class="ai-rec-list">${emph.map(e => `<li class="ai-rec"><span class="ai-rec-ico">${ICON('sparkle', 'ico ico-sm')}</span><span>${esc(_deName(e))}</span></li>`).join('')}</ul></div>`;
  return `<div class="tailor-result">${html || '<p class="ai-para">Tailoring complete — no changes suggested.</p>'}</div>`;
}
function _copyTailorBullet(btn) {
  const t = btn.getAttribute('data-t') || '';
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(
    () => { const o = btn.innerHTML; btn.innerHTML = 'Copied ✓'; setTimeout(() => { btn.innerHTML = o; }, 1400); },
    () => toast('Copy failed', { type: 'warn' })
  );
}

function _renderTailorResult(text) {
  const blocks = _parseTailorBlocks(text);
  if (!blocks.length) {
    return `<div style="font-size:13px;line-height:1.6;white-space:pre-wrap;color:var(--text);">${esc(text)}</div>`;
  }
  const pill = (k, cls) => `<span class="ats-kw-pill ats-kw-${cls}">${esc(k)}</span>`;
  const card = (t, ico) => `<li class="ai-rec"><span class="ai-rec-ico">${ICON(ico,'ico ico-sm')}</span><span>${esc(_deName(t))}</span></li>`;
  return '<div class="tailor-result">' + blocks.map(b => {
    if (b.kind === 'intro') return `<p class="ai-para">${b.items.map(i => esc(_deName(i))).join('<br>')}</p>`;
    let inner, badge = '';
    if (b.kind === 'good') { inner = `<div class="tailor-pills">${b.items.map(i => pill(i,'matched')).join('')}</div>`; badge = `<span class="tailor-count">${b.items.length}</span>`; }
    else if (b.kind === 'bad') { inner = `<div class="tailor-pills">${b.items.map(i => pill(i,'missing')).join('')}</div>`; badge = `<span class="tailor-count">${b.items.length}</span>`; }
    else inner = `<ul class="ai-rec-list">${b.items.map(i => card(i, /^Suggested/.test(b.title) ? 'arrowRight' : 'check')).join('')}</ul>`;
    return `<div class="tailor-block tailor-${b.kind}">
        <div class="tailor-block-head">${esc(b.title)}${badge}</div>
        ${b.hint ? `<p class="tailor-hint">${esc(b.hint)}</p>` : ''}
        ${inner}
      </div>`;
  }).join('') + '</div>';
}

// Subtle upgrade banner shown above the action button inside a Pro section.
function freeAiBanner(feature) {
  if (isPaid()) return '';
  const ctx = feature === 'analysis' ? 'analysis' : feature;
  const left = trialsLeft(feature === 'analysis' ? 'analyze' : feature);  // server-tracked count
  if (left > 0) {
    return `<div class="free-ai-banner" data-feat="${feature}">${ICON('sparkle','ico ico-sm')}<span>This feature has <b>${left} free AI ${left === 1 ? 'use' : 'uses'}</b> left.</span></div>`;
  }
  return `<div class="free-ai-banner used" data-feat="${feature}">${ICON('sparkle','ico ico-sm')}<span>You've used your free trials for this feature, <a href="#" onclick="showUpgradeModal('ai','${ctx}');return false;">upgrade to run it again</a>.</span></div>`;
}
// Small "N free uses remaining" label shown beneath each AI button.
function freeAiLabel(feature) {
  if (isPaid()) return '';
  const left = trialsLeft(feature === 'analysis' ? 'analyze' : feature);
  return `<div class="free-ai-label" data-feat="${feature}">${left > 0 ? `${left} free ${left === 1 ? 'use' : 'uses'} remaining` : 'Free trials used'}</div>`;
}
// Re-render the inline trial banners/labels in place so they always reflect the
// LIVE per-feature count. Without this they show the count from when the section
// first rendered, e.g. a stale "2 free uses remaining" even after both are used,
// which then mismatches the (correct) paywall. Called after every AI attempt.
function _refreshTrialUI() {
  document.querySelectorAll('.free-ai-banner[data-feat]').forEach(el => { el.outerHTML = freeAiBanner(el.getAttribute('data-feat')); });
  document.querySelectorAll('.free-ai-label[data-feat]').forEach(el => { el.outerHTML = freeAiLabel(el.getAttribute('data-feat')); });
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
        <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
          <button class="btn btn-primary btn-sm" onclick="aiTailor()" style="white-space:nowrap;">${ICON('sparkle','ico ico-sm')} Generate</button>
          ${freeAiLabel('tailor')}
        </div>
      </div>
      <div class="ai-card-body">
        ${freeAiBanner('tailor')}
        <div class="form-field">
          <label style="display:flex;justify-content:space-between;">
            <span>Job Description</span>
            <span id="tailor-wc" style="font-size:11px;color:var(--muted);">${wc}</span>
          </label>
          <textarea data-bind="tailor.jobDescription" rows="12"
            placeholder="Paste the full job description here, the more detail, the better the tailoring…"
            oninput="document.getElementById('tailor-wc').textContent=_jdWordCount(this.value)"
            style="font-size:13px;line-height:1.6;"
          >${esc(resume.tailor.jobDescription)}</textarea>
        </div>
        ${(resume.tailor.result || resume.tailor.tailoredSummary) ? `
          <div class="ai-result-box ai-result-indigo">
            <div class="ai-result-label" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
              <span>✦ Tailoring Results</span>
              <button class="btn btn-ghost btn-xs" onclick="saveTailorToTracker()" style="white-space:nowrap;">${ICON('briefcase','ico ico-sm')} Save to Job Tracker</button>
            </div>
            <div style="padding:14px;">${resume.tailor.result ? _renderTailorStructured(resume.tailor.result) : _renderTailorResult(resume.tailor.tailoredSummary)}</div>
          </div>` : _tailorEmptyState()}
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
            placeholder="Paste the job description, we'll keyword-match it against your resume…"
            oninput="document.getElementById('ats-wc').textContent=_jdWordCount(this.value)"
            style="font-size:13px;line-height:1.6;"></textarea>
        </div>
        ${freeAiBanner('ats')}
        <button class="btn btn-emerald btn-block" onclick="aiATS()">${ICON('check')} Run ATS Check</button>
        ${freeAiLabel('ats')}
        <div id="ats-result" style="margin-top:16px;">${_atsEmptyState()}</div>
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
        <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
          <button class="btn btn-violet btn-sm" onclick="aiAnalyze()" style="white-space:nowrap;">${ICON('sparkle','ico ico-sm')} Analyze</button>
          ${freeAiLabel('analysis')}
        </div>
      </div>
      <div class="ai-card-body">
        ${freeAiBanner('analysis')}
        <div id="analysis-result">${resume.analysis ? _analysisPanel(resume.analysis) : _analysisEmptyState()}</div>
        ${navRow('ats','dashboard')}
      </div>
    </div>`;
}

// Appealing pre-run state for ATS, previews the score + what gets graded.
function _atsEmptyState() {
  const tile = (ico, title, sub) =>
    `<div class="an-pre-tile an-pre-emerald">
      <span class="an-pre-ico">${ICON(ico, 'ico ico-sm')}</span>
      <div><b>${title}</b><span>${sub}</span></div>
    </div>`;
  return `
    <div class="an-pre">
      <div class="an-pre-ring">
        <svg viewBox="0 0 120 120" width="92" height="92">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="9"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="url(#atsPreGrad)" stroke-width="9"
            stroke-linecap="round" stroke-dasharray="80 234" transform="rotate(-90 60 60)" opacity=".85"/>
          <defs><linearGradient id="atsPreGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#10b981"/>
          </linearGradient></defs>
          <text x="60" y="58" text-anchor="middle" font-size="30" font-weight="800" fill="var(--muted)">?</text>
          <text x="60" y="80" text-anchor="middle" font-size="11" fill="var(--muted)">/ 100</text>
        </svg>
      </div>
      <p class="an-pre-lead">Paste a job description above to get an <b>ATS match score</b> with the exact keywords and fixes that get you past the automated filters <b>~70% of resumes</b> never survive.</p>
      <div class="an-pre-grid an-pre-grid-4">
        ${tile('target',    'Keywords',    'Matched to the posting')}
        ${tile('briefcase', 'Experience',  'Relevance to the role')}
        ${tile('doc',       'Formatting',  'ATS-safe structure')}
        ${tile('sparkle',   'Fixes',       'Exactly what to add')}
      </div>
    </div>`;
}

// Appealing pre-run state for Tailor, shows a before → after transformation.
function _tailorEmptyState() {
  const tile = (ico, title, sub) =>
    `<div class="an-pre-tile an-pre-fix">
      <span class="an-pre-ico">${ICON(ico, 'ico ico-sm')}</span>
      <div><b>${title}</b><span>${sub}</span></div>
    </div>`;
  return `
    <div class="tailor-pre">
      <div class="tailor-ba">
        <div class="tailor-ba-col tailor-ba-before">
          <span class="tailor-ba-tag">Your bullet</span>
          <p>Responsible for managing the team and helping out with various projects.</p>
        </div>
        <div class="tailor-ba-arrow">${ICON('arrowRight', 'ico')}</div>
        <div class="tailor-ba-col tailor-ba-after">
          <span class="tailor-ba-tag">Tailored to the role</span>
          <p>Led an <b>8-person team</b> to ship <b>3 cross-functional projects</b>, mapping each win to the role's focus on <b>delivery &amp; ownership</b>.</p>
        </div>
      </div>
      <div class="an-pre-grid">
        ${tile('bolt',   'Rewrites bullets', 'Punchier, results-first')}
        ${tile('target', 'Aligns keywords',  'Mirrors the posting')}
        ${tile('user',   'Reframes summary', 'Speaks to the role')}
      </div>
      <p class="tailor-pre-note">Grounded in your real experience, never invented.</p>
    </div>`;
}

// Appealing pre-analysis state, previews what the AI critique will deliver.
function _analysisEmptyState() {
  const tile = (cls, ico, title, sub) =>
    `<div class="an-pre-tile ${cls}">
      <span class="an-pre-ico">${ICON(ico, 'ico ico-sm')}</span>
      <div><b>${title}</b><span>${sub}</span></div>
    </div>`;
  return `
    <div class="an-pre">
      <div class="an-pre-ring">
        <svg viewBox="0 0 120 120" width="92" height="92">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="9"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="url(#anGrad)" stroke-width="9"
            stroke-linecap="round" stroke-dasharray="70 244" transform="rotate(-90 60 60)" opacity=".85"/>
          <defs><linearGradient id="anGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6366f1"/>
          </linearGradient></defs>
          <text x="60" y="58" text-anchor="middle" font-size="30" font-weight="800" fill="var(--muted)">?</text>
          <text x="60" y="80" text-anchor="middle" font-size="11" fill="var(--muted)">/ 100</text>
        </svg>
      </div>
      <p class="an-pre-lead">Get a calibrated <b>0–100 score</b> and specific, fixable feedback on your resume, in seconds.</p>
      <div class="an-pre-grid">
        ${tile('an-pre-good', 'check',      'Strengths',  "What's already working")}
        ${tile('an-pre-bad',  'arrowRight', 'Weaknesses', "Exactly what's holding it back")}
        ${tile('an-pre-fix',  'sparkle',    'Top Fixes',  'With example rewrites you can paste in')}
      </div>
      <button class="btn btn-violet" onclick="aiAnalyze()" style="margin-top:4px;">${ICON('sparkle','ico ico-sm')} Analyze my resume</button>
    </div>`;
}

function renderDashboard() {
  const h = (window.calculateHealthScore && window.calculateHealthScore()) || { score: 0, completeness: 0, bulletQuality: null, ats: null };
  const qf = _qfGather();
  const score = Math.max(0, Math.min(100, h.score));
  const ringCol = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
  const C = 213.6, off = C * (1 - score / 100);
  const verdict = score >= 80 ? ['Looking strong', 'Your resume is in great shape, give it a final read and export.']
    : score >= 50 ? ['Getting there', 'A few improvements will make this resume noticeably stronger.']
    : ['Just getting started', 'Fill in the core sections and tighten your bullets to raise your score.'];

  const barCol = function (v, good, ok) { return v >= good ? 'var(--success)' : v >= ok ? 'var(--warning)' : 'var(--danger)'; };
  const tile = function (label, valHtml, pct, col, section) {
    return `<div class="dash-tile" onclick="nextSection('${section}')">
      <div class="dash-tile-label">${label}</div>
      <div class="dash-tile-val">${valHtml}</div>
      ${pct != null ? `<div class="dash-tile-bar"><span style="width:${pct}%;background:${col};"></span></div>` : ''}
    </div>`;
  };
  const bq = h.bulletQuality, ats = h.ats;
  const tiles = [
    tile('Completeness', h.completeness + '%', h.completeness, 'var(--accent)', 'personal'),
    tile('Bullet strength', bq == null ? 'N/A' : bq + '%', bq == null ? 0 : bq, bq == null ? 'var(--border)' : barCol(bq, 70, 45), 'experience'),
    tile('ATS score', ats == null ? 'Not run' : ats + '%', ats == null ? 0 : ats, ats == null ? 'var(--border)' : barCol(ats, 80, 60), 'ats'),
    tile('Quick Fixes', qf.passed + ' / ' + qf.total, Math.round(qf.passed / qf.total * 100), qf.passed === qf.total ? 'var(--success)' : 'var(--warning)', 'quickfix'),
  ].join('');

  // Readiness checklist (all client-side, synchronous)
  const p = resume.personal || {};
  const hasContact = !!(p.email && p.phone && p.location);
  const hasMetric = (resume.experience || []).concat(resume.projects || []).some(function (e) { return /[\d$%]/.test(e && e.description || ''); });
  const noWeak = (typeof _qfWeakVerbs === 'function') ? _qfWeakVerbs().length === 0 : true;
  const hasSkills = (resume.skills.categories || []).some(function (c) { return (c.items || []).length; });
  const readyItems = [
    ['Contact details complete', hasContact, 'personal'],
    ['At least one quantified bullet', hasMetric, 'experience'],
    ['No weak opening phrases', noWeak, 'quickfix'],
    ['Skills listed', hasSkills, 'skills'],
  ];
  const readyCount = readyItems.filter(function (i) { return i[1]; }).length;
  const allReady = readyCount === readyItems.length;
  const readyRows = readyItems.map(function (it) {
    return `<div class="dash-ready-item">
      <span class="dash-ready-ico ${it[1] ? 'dash-ready-ok' : 'dash-ready-no'}">${it[1] ? _qfCheckSvg() : _qfWarnSvg()}</span>
      <span style="flex:1;${it[1] ? '' : 'color:var(--muted);'}">${it[0]}</span>
      ${it[1] ? '' : `<button class="qf-goto" onclick="nextSection('${it[2]}')">Fix →</button>`}
    </div>`;
  }).join('');

  // Top 3 fixes (first issues are _qfIssues[0..2], so qfAction indices line up)
  const top = qf.issues.slice(0, 3);
  const topHtml = top.length ? top.map(function (iss, idx) {
    const btn = iss.action && iss.action.type === 'fix'
      ? `<button class="btn btn-secondary qf-btn" onclick="qfAction(${idx})">${esc(iss.action.label || 'Auto-fix')}</button>`
      : `<button class="qf-goto" onclick="qfAction(${idx})">Go →</button>`;
    return `<div class="qf-card qf-${iss.level === 'warn' ? 'warn' : 'info'}">
      <span class="qf-ico qf-ico-${iss.level === 'warn' ? 'warn' : 'info'}">${_qfWarnSvg()}</span>
      <div class="qf-card-body"><div class="qf-card-title">${esc(iss.title)}</div></div>
      ${btn}</div>`;
  }).join('') : `<div style="font-size:13px;color:var(--muted);">No issues, nice work. ✦</div>`;

  return `
    <div class="section-card">
      <div class="section-head"><h3>${ICON('chart')} Dashboard</h3>${allReady ? '<span class="pill success">Ready to submit</span>' : ''}</div>
      <div class="dash-hero">
        <div class="dash-ring">
          <svg viewBox="0 0 80 80" width="96" height="96"><circle cx="40" cy="40" r="34" fill="none" stroke="var(--bg-3)" stroke-width="8"/><circle cx="40" cy="40" r="34" fill="none" stroke="${ringCol}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 40 40)"/></svg>
          <div class="dash-ring-num"><div class="dash-ring-score" style="color:${ringCol};">${score}</div><div class="dash-ring-lbl">Health</div></div>
        </div>
        <div><div class="dash-verdict-title">${verdict[0]}</div><div class="dash-verdict-sub">${verdict[1]}</div></div>
      </div>
      <div class="dash-tiles">${tiles}</div>
      <div class="dash-card">
        <div class="dash-card-head"><h4>Ready to submit?</h4><span class="pill ${allReady ? 'success' : 'warn'}">${readyCount}/${readyItems.length}</span></div>
        <div class="dash-ready-list">${readyRows}</div>
      </div>
      <div class="dash-card">
        <div class="dash-card-head"><h4>Top things to fix</h4>${qf.issues.length > 3 ? `<button class="qf-goto" onclick="nextSection('quickfix')">View all (${qf.issues.length}) →</button>` : ''}</div>
        <div class="qf-list">${topHtml}</div>
      </div>
      ${_renderSubCard()}
      <div class="action-row">
        <button class="btn btn-secondary" onclick="nextSection('analysis')">${ICON('arrowLeft')} Back</button>
        <a href="export" class="btn btn-primary">Preview &amp; Export ${ICON('arrowRight')}</a>
      </div>
    </div>`;
}

// Manage-subscription card: real billing controls for paid users (reuses the
// existing billing-portal modal, which includes cancel), upgrade nudge for free.
function _renderSubCard() {
  const u = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) || null;
  if (!isPaid()) {
    return `<div class="dash-card dash-sub-card">
      <div><strong>Free plan</strong><div class="dash-sub-meta">Unlock AI tailoring, ATS scoring, unlimited exports and more.</div></div>
      <a class="btn btn-primary btn-sm" href="pricing">${ICON('sparkle', 'ico ico-sm')} <span>Upgrade</span></a>
    </div>`;
  }
  const plan = (u && u.plan) || 'premium';
  const renews = u && u.currentPeriodEnd
    ? new Date(u.currentPeriodEnd * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const meta = plan === 'lifetime'
    ? 'Lifetime access, no recurring charges. Manage billing or view invoices anytime.'
    : (renews ? 'Renews ' + renews + ' · cancel or update billing anytime.' : 'Active subscription · cancel or update billing anytime.');
  return `<div class="dash-card dash-sub-card">
    <div><strong>${ICON('crown', 'ico ico-sm')} ${planLabel()} plan</strong><div class="dash-sub-meta">${meta}</div></div>
    <button class="btn btn-secondary btn-sm" onclick="openBillingPortal()">Manage subscription</button>
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
          ${SWATCHES.map((s,i)=>`<div class="swatch ${c.accent===s?'selected':''}" style="background:${s};" role="button" tabindex="0" aria-label="Accent color ${i+1}${c.accent===s?', selected':''}" onclick="setCustom('accent','${s}')"></div>`).join('')}
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
        <p style="font-size:12px; color:var(--muted); margin:4px 0 10px;">Drag to reorder (or focus a row and press ↑ ↓), and use the switch to show or hide each one.</p>
        <div role="list">
          ${_sectionOrder().map(k=>`
            <div class="toggle-row sec-drag-item" draggable="true" data-sec="${k}" tabindex="0" role="listitem"
                 aria-label="${k} section. Drag, or press arrow up or down, to reorder.">
              <span style="display:flex; align-items:center; gap:10px;">
                <span class="sec-grip" aria-hidden="true" title="Drag to reorder"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="5" cy="4" r="1.4"/><circle cx="11" cy="4" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="11" cy="12" r="1.4"/></svg></span>
                <span style="text-transform:capitalize;${c.sections[k]?'':'opacity:.5;'}">${k}</span>
              </span>
              <div class="toggle ${c.sections[k]?'on':''}" role="switch" tabindex="0" aria-checked="${!!c.sections[k]}" aria-label="Show ${k} section" onclick="toggleSection('${k}')"></div>
            </div>`).join('')}
        </div>
        <button class="btn btn-ghost btn-xs" style="margin-top:12px;" onclick="resetSectionOrder()">↺ Reset to default order</button>
      </div>
    </div>`;
}
function resetSectionOrder(){ resume.customize.sectionOrder = ALL_SECTIONS.slice(); save(); renderMain(); toast('Section order reset', {type:'info'}); }
const ALL_SECTIONS = ['experience','education','skills','projects','certifications','awards','leadership','volunteer','publications'];
// Current section order: saved order (valid keys only) + any missing sections appended.
function _sectionOrder() {
  const saved = (resume.customize.sectionOrder || []).filter(k => ALL_SECTIONS.includes(k));
  const seen = new Set(saved);
  return saved.concat(ALL_SECTIONS.filter(k => !seen.has(k)));
}
function moveSection(k, dir) {
  const order = _sectionOrder();
  const i = order.indexOf(k), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  order[i] = order[j]; order[j] = k;
  resume.customize.sectionOrder = order;
  save(); renderMain();
}
// Move a section so it lands at another section's position (drag & drop).
function _reorderSection(fromKey, toKey) {
  const order = _sectionOrder();
  const from = order.indexOf(fromKey), to = order.indexOf(toKey);
  if (from < 0 || to < 0 || from === to) return;
  const moved = order.splice(from, 1)[0];
  order.splice(to, 0, moved);
  resume.customize.sectionOrder = order;
  save(); renderMain();
}
// Wire drag-and-drop for the Resume Sections list (separate from the entry-list
// reorder, since this reorders the customize.sectionOrder string array).
function _bindSectionDrag() {
  const items = document.querySelectorAll('.sec-drag-item');
  let src = null;
  items.forEach(function (item) {
    item.addEventListener('dragstart', function (e) {
      src = item; setTimeout(function () { item.classList.add('dragging'); }, 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', function () {
      item.classList.remove('dragging');
      items.forEach(function (i) { i.classList.remove('drag-over'); });
      src = null;
    });
    item.addEventListener('dragover', function (e) {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      if (item !== src) {
        items.forEach(function (i) { i.classList.remove('drag-over'); });
        item.classList.add('drag-over');
      }
    });
    item.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!src || src === item) return;
      _reorderSection(src.dataset.sec, item.dataset.sec);
    });
    // Keyboard reorder for accessibility (drag-only would exclude keyboard users).
    item.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') { e.preventDefault(); moveSection(item.dataset.sec, -1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveSection(item.dataset.sec, 1); }
    });
  });
}
function setCustom(k,v) { resume.customize[k]=v; save(); renderMain(); }
function toggleSection(k){ resume.customize.sections[k]=!resume.customize.sections[k]; save(); renderMain(); }
// Keyboard support for the click-only swatches/toggles (Enter or Space activates).
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target;
  if (t && t.classList && (t.classList.contains('swatch') || t.classList.contains('toggle'))) {
    e.preventDefault();
    t.click();
  }
});

// ============ Nav row helper ============
function navRow(prev, next) {
  return `<div class="action-row">
    ${prev ? `<button class="btn btn-secondary" onclick="nextSection('${prev}')">${ICON('arrowLeft')} Back</button>` : '<span></span>'}
    ${next ? `<button class="btn btn-primary" onclick="nextSection('${next}')">Continue ${ICON('arrowRight')}</button>` : ''}
  </div>`;
}

// ============ Preview (uses template renderer) ============
// ============ Preview: single source of truth ============
// Both the mini panel and the full-screen overlay render the résumé into an
// iframe at TRUE page width (816px = US-Letter at 96dpi), the exact document
// the PDF prints, and scale it with CSS transform. This guarantees the preview
// is pixel-identical to the export, instead of the old lossy font-size scaling.
const PAGE_PX = 1056; // one US-Letter page at 96dpi, full scale

// Render the résumé into `frame`, wait for web fonts to load (so measurements
// aren't taken against the fallback font), then hand back the live document.
// `cb` may run more than once (initial + after fonts settle) and must be idempotent.
function _mountResume(frame, mini, cb) {
  const html = renderTemplate(resume.template, resume, mini, resume.customize.accent);
  const doc = writeResumeFrame(frame, html, 816);
  const ready = () => { try { cb(doc); } catch (e) { /* preview is non-critical */ } };
  const fonts = doc.fonts;
  if (fonts && fonts.ready && typeof fonts.ready.then === 'function') {
    fonts.ready.then(ready);
    setTimeout(ready, 1000);   // fallback if font loading stalls
  } else {
    ready();
    setTimeout(ready, 60);
  }
  return doc;
}

// Mini preview zoom (1 = fit-to-width). Persists across re-renders.
let _miniZoom = 1;
// View mode: 'width' fits the whole page width (default, good overview); 'page'
// sizes ONE full page to the panel's reading height so multi-page resumes are
// legible and you scroll page-by-page through the painted sheets.
let _previewMode = 'width';
function _pageViewportH() { return Math.max(360, Math.round(window.innerHeight * 0.74)); }
function toggleFitMode() {
  _previewMode = _previewMode === 'page' ? 'width' : 'page';
  _miniZoom = 1;
  const r = _miniRefs();
  if (r.frame && r.frame._doc) _scaleMini(r.wrap, r.sizer, r.frame, r.frame._doc);
  const btn = document.getElementById('mini-mode-btn');
  if (btn) btn.textContent = _previewMode === 'page' ? '↔ Fit width' : '▭ One page';
  const lbl = document.getElementById('mini-zoom-label');
  if (lbl) lbl.textContent = 'Fit';
}
function _miniRefs() {
  const wrap = document.getElementById('preview');
  const sizer = wrap && wrap.querySelector('.preview-sizer');
  const frame = sizer && sizer.querySelector('iframe');
  return { wrap, sizer, frame };
}
function setMiniZoom(kind) {
  if (kind === 'fit') _miniZoom = 1;
  else _miniZoom = Math.min(2.5, Math.max(0.5, +(_miniZoom + kind).toFixed(2)));
  const r = _miniRefs();
  if (r.frame && r.frame._doc) _scaleMini(r.wrap, r.sizer, r.frame, r.frame._doc);
  const lbl = document.getElementById('mini-zoom-label');
  if (lbl) lbl.textContent = _miniZoom === 1 ? 'Fit' : Math.round(_miniZoom * 100) + '%';
}

function renderPreview() {
  const wrap = document.getElementById('preview');
  if (!wrap) return;
  let sizer = wrap.querySelector('.preview-sizer');
  let frame = sizer && sizer.querySelector('iframe');
  if (!frame) {
    wrap.innerHTML = '';
    sizer = document.createElement('div');
    sizer.className = 'preview-sizer';
    sizer.style.cssText = 'position:relative; margin:0 auto;';
    frame = document.createElement('iframe');
    frame.id = 'preview-frame';
    frame.title = 'Resume preview';
    frame.setAttribute('scrolling', 'no');
    // Starts transparent; fades in once measured + scaled (kills the flash of
    // unscaled/unfonted content).
    frame.style.cssText = 'width:816px; border:0; background:#fff; display:block; transform-origin:top left; opacity:0; transition:opacity .18s ease;';
    sizer.appendChild(frame);
    wrap.appendChild(sizer);
    // Re-scale (not re-render) when the panel resizes.
    if (window.ResizeObserver && !wrap._ro) {
      wrap._ro = new ResizeObserver(() => {
        const r = _miniRefs();
        if (r.frame && r.frame._doc) _scaleMini(r.wrap, r.sizer, r.frame, r.frame._doc);
      });
      wrap._ro.observe(wrap);
    }
  }
  const sz = sizer, fr = frame;
  _mountResume(frame, true, function (doc) { fr._doc = doc; _renderMiniInto(wrap, sz, fr, doc); });
  if (_fullOverlay && _fullOverlay.style.display === 'flex') _renderFullPreview();
  if (window.renderHealthBadge) window.renderHealthBadge();
  // Keep the free Quick Fixes checklist current as the user edits (no network).
  if (currentSection === 'quickfix') _refreshQuickFix();
}

// Inject preview-only chrome (clickable-heading affordance + page gutters) into
// the iframe doc. Never touches the export render, so the PDF stays clean.
function _injectPreviewChrome(doc) {
  if (doc.getElementById('hf-preview-chrome')) return;
  const st = doc.createElement('style');
  st.id = 'hf-preview-chrome';
  st.textContent =
    '.preview-jump{cursor:pointer;transition:background .12s;}' +
    '.preview-jump:hover{background:rgba(99,102,241,.10)!important;outline:2px solid rgba(99,102,241,.35);outline-offset:1px;border-radius:3px;}' +
    '.hf-pagebreak{pointer-events:none;}';
  doc.head.appendChild(st);
}

// Idempotent: paint chrome, bind jumps once, compute fit, paginate, scale.
function _renderMiniInto(wrap, sizer, frame, doc) {
  _injectPreviewChrome(doc);
  if (!doc._jbound) { _bindPreviewClicks(doc); doc._jbound = true; }
  const pages = _paginate(doc);
  _renderFitIndicator(doc._lastRatio, pages);
  _scaleMini(wrap, sizer, frame, doc);
  frame.style.opacity = '1';                  // reveal once measured + scaled
}

// Scale the true-size iframe down to fit the panel (× the user's zoom). The
// sizer reserves the *scaled* footprint so scrollbars reflect the zoomed size.
function _scaleMini(wrap, sizer, frame, doc) {
  const avail = wrap.clientWidth || 0;
  if (avail < 1) return;                       // hidden/collapsed, RO will retry
  const z = _miniZoom || 1;
  const h = doc.documentElement.scrollHeight || doc.body.scrollHeight || 0;
  // The iframe body is the gray canvas (CANVAS_W wide); scale that to the panel.
  const cw = CANVAS_W;
  let s;
  if (_previewMode === 'page') {
    // Size one full page to the reading viewport height (never wider than the
    // panel), then scroll vertically to move through the painted page sheets.
    s = Math.min(_pageViewportH() / PAGE_PX, avail / cw) * z;
  } else {
    s = (avail / cw) * z;
  }
  frame.style.width = cw + 'px';
  frame.style.height = h + 'px';
  frame.style.transform = 'scale(' + s + ')';
  sizer.style.width = Math.round(cw * s) + 'px';
  sizer.style.height = Math.round(h * s) + 'px';
  if (_previewMode === 'page') {
    // One-page reading view: fixed viewport, scroll page-to-page.
    wrap.style.height = _pageViewportH() + 'px';
    wrap.style.overflow = 'auto';
  } else if (z > 1) {
    // Zoomed in: fixed-height scroll viewport (both axes).
    wrap.style.height = '70vh';
    wrap.style.overflow = 'auto';
  } else {
    // Fit width: panel grows to the full résumé, no scrollbars.
    wrap.style.height = Math.round(h * s) + 'px';
    wrap.style.overflow = 'hidden';
  }
}

function _renderFitIndicator(ratio, pages) {
  const preview = document.getElementById('preview');
  let ind = document.getElementById('page-fit-indicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'page-fit-indicator';
    preview.parentNode.insertBefore(ind, preview.nextSibling);
  }
  const pct = Math.round(ratio * 100);
  pages = pages || Math.max(1, Math.ceil(ratio));
  let bg, border, color, text;
  if (ratio < 0.6) {
    bg = '#fef9c3'; border = '#eab308'; color = '#854d0e';
    text = '⚠ Too much empty space, your resume only fills ' + pct + '% of a page. Add more detail.';
  } else if (ratio <= 1.05) {
    bg = '#dcfce7'; border = '#22c55e'; color = '#166534';
    text = '✓ Great fit, fills one page nicely (' + pct + '%).';
  } else if (ratio <= 2.1) {
    // Two-page resumes are fine for experienced candidates, not an error.
    bg = '#dbeafe'; border = '#3b82f6'; color = '#1e40af';
    text = '📄 ' + pages + ' pages, great for fuller experience. All pages export. Try “One page” to read each clearly.';
  } else {
    // Long resumes are legitimate (senior / academic). Encourage, don't scold.
    bg = '#dbeafe'; border = '#3b82f6'; color = '#1e40af';
    text = '📄 ' + pages + ' pages, fine for senior or academic profiles. All pages export. Tip: tighten spacing or trim older roles to condense.';
  }
  ind.style.cssText = 'margin-top:10px; padding:8px 10px; border-radius:6px; font-size:11px; line-height:1.45; font-weight:500; background:' + bg + '; border:1px solid ' + border + '; color:' + color + ';';
  ind.textContent = text;
}

// Pick the container that holds the resume's main vertical flow (where section
// blocks are siblings) so gutters land at real block boundaries. Templates vary:
// some use a ".body" column, others stack sections directly in the root, so we
// fall back to the densest block container (ignoring bullet lists).
// Choose the elements a page break is allowed to land between. Keep every block
// WHOLE by default (keep-together: an experience entry's header never separates
// from its bullets), UNLESS the block is taller than a full page, in which case
// descend one level so the break can fall between its children (e.g. between
// individual entries) instead of slicing the block across the gutter. When no
// block is oversized this returns exactly flow.children, i.e. today's behavior.
function _breakUnits(root) {
  const units = [];
  for (const child of Array.from(root.children)) {
    if (child.classList && child.classList.contains('hf-pagebreak')) continue;
    const tooTall = child.getBoundingClientRect().height > PAGE_PX;
    const kids = child.children ? Array.from(child.children) : [];
    if (tooTall && kids.length > 1) {
      for (const gc of kids) units.push(gc);
    } else {
      units.push(child);
    }
  }
  return units;
}

function _bestFlowRoot(preview) {
  const named = preview.querySelector('.body');
  if (named) return named;
  let best = preview.firstElementChild || preview, bestN = best.children ? best.children.length : 0;
  preview.querySelectorAll('div, section, main').forEach(el => {
    const n = el.children.length;
    if (n > bestN) { best = el; bestN = n; }
  });
  return best;
}

const PAGE_W = 816;        // page width (US-Letter at 96dpi)
const SHEET_GAP = 24;      // gray gap between page sheets (true px)
const CANVAS_PAD = 40;     // gray canvas margin around the page column (true px)
const CANVAS_W = PAGE_W + CANVAS_PAD * 2;  // full iframe width incl. side margins
const MAX_SHEETS = 16;     // safety cap so pathological content can't run away (covers long CVs)

// Google-Docs-style pagination: lay the résumé out as discrete white page sheets
// on a gray canvas. When a block won't fit on the current sheet, a spacer pushes
// it to the top of the next one (so a page "fills up" and a fresh page begins).
// Runs inside the preview iframe only, so the export/PDF stays a clean flow.
// Raise the résumé's real content (every body child except <style> and our own
// sheets) above the painted sheets. Note body.firstElementChild is a <style> tag,
// so we can't target a single "root" element.
function _contentEls(body) {
  return Array.from(body.children).filter(el => el.tagName !== 'STYLE' && !el.classList.contains('hf-sheet'));
}

function _paginate(doc) {
  const body = doc.body;
  // --- Reset so re-renders (incl. the fonts-ready re-run) are idempotent: unwrap
  // the page column, remove sheets, and clear every inline style we set. ---
  doc.querySelectorAll('.hf-sheet, .hf-pagebreak').forEach(e => e.remove());
  const prevCol = Array.from(body.children).find(el => el.classList && el.classList.contains('hf-doc'));
  if (prevCol) { while (prevCol.firstChild) body.insertBefore(prevCol.firstChild, prevCol); prevCol.remove(); }
  ['background', 'minHeight', 'position', 'width', 'padding', 'margin'].forEach(p => { body.style[p] = ''; });
  _contentEls(body).forEach(el => {
    el.style.zIndex = '';
    if (el.dataset.hfpos) { el.style.position = ''; delete el.dataset.hfpos; }
  });

  // Measure true content height in this clean state (correct even on the
  // fonts-ready re-run, when the body was already paginated on entry).
  doc._lastRatio = (body.scrollHeight || doc.documentElement.scrollHeight) / PAGE_PX;

  // --- Wrap the résumé (everything except the <style> tag) into a centered 816px
  // page column, and turn the body into a gray canvas around it. This gives the
  // pages gray margins on all four sides + an all-around shadow, like Google Docs. ---
  const col = doc.createElement('div');
  col.className = 'hf-doc';
  col.style.cssText = 'position:relative; width:' + PAGE_W + 'px; margin:0 auto;';
  _contentEls(body).forEach(el => col.appendChild(el));
  body.appendChild(col);
  body.style.background = '#e9eaef';
  body.style.width = CANVAS_W + 'px';
  body.style.padding = CANVAS_PAD + 'px 0';
  body.style.margin = '0';

  // --- Paginate: bump any block that overflows the current sheet to the top of
  // the next one (a page fills, a fresh page begins). Measured within the column. ---
  const flow = _bestFlowRoot(col);
  const units = _breakUnits(flow);
  const step = PAGE_PX + SHEET_GAP;
  const TAIL = 8;                                          // absorb trailing margins / rounding so a hair of overflow can't spawn a page
  const isHeading = el => el && el.nodeType === 1 && /^H[1-4]$/.test(el.tagName);
  let page = 0, prevUnit = null;
  for (const unit of units) {
    if (page >= MAX_SHEETS - 1) break;
    const r = unit.getBoundingClientRect();
    if (r.height < 1) { prevUnit = unit; continue; }       // skip empty units so they never create a phantom page
    const colTop = col.getBoundingClientRect().top;        // re-read (spacers shift layout)
    const top = r.top - colTop;
    const bottom = top + r.height;
    const sheetTop = page * step;
    const sheetBottom = sheetTop + PAGE_PX;
    if (bottom > sheetBottom + TAIL && top > sheetTop + 1) {
      // Orphan control: carry a preceding section heading to the next page so a
      // heading never strands alone at the bottom of a page without its content.
      let target = unit, targetTop = top;
      if (isHeading(prevUnit)) {
        const pTop = prevUnit.getBoundingClientRect().top - colTop;
        if (pTop > sheetTop + 1) { target = prevUnit; targetTop = pTop; }
      }
      const sp = doc.createElement('div');
      sp.className = 'hf-pagebreak';
      sp.style.cssText = 'height:' + Math.max(0, Math.round((page + 1) * step - targetTop)) + 'px;';
      (target.parentNode || flow).insertBefore(sp, target);
      page++;
    }
    prevUnit = unit;
  }
  const totalPages = page + 1;

  // --- Raise the content above the sheets (within the column). ---
  Array.from(col.children).forEach(el => {
    if (el.classList.contains('hf-pagebreak')) return;
    if (doc.defaultView.getComputedStyle(el).position === 'static') { el.style.position = 'relative'; el.dataset.hfpos = '1'; }
    el.style.zIndex = '1';
  });
  // --- Paint white page sheets behind the content, with the page number in each gutter. ---
  for (let i = 0; i < totalPages; i++) {
    const sheet = doc.createElement('div');
    sheet.className = 'hf-sheet';
    sheet.style.cssText = 'position:absolute; left:0; right:0; top:' + (i * step) + 'px; height:' + PAGE_PX +
      'px; background:#fff; z-index:0; border-radius:2px;' +
      'box-shadow:0 0 0 1px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.16), 0 10px 24px rgba(0,0,0,.10);';
    col.appendChild(sheet);
    const num = doc.createElement('div');
    num.className = 'hf-sheet hf-sheet-num';
    num.textContent = 'Page ' + (i + 1) + ' of ' + totalPages;
    num.style.cssText = 'position:absolute; left:0; right:0; top:' + (i * step + PAGE_PX + 6) +
      'px; text-align:center; font:600 10px -apple-system,BlinkMacSystemFont,sans-serif; letter-spacing:.04em; color:#8a93a6; z-index:0;';
    col.appendChild(num);
  }
  // +1 extra gap so the final page's number label has room below the last sheet.
  col.style.minHeight = (totalPages * PAGE_PX + totalPages * SHEET_GAP) + 'px';
  return totalPages;
}

// ============ Full-screen preview lightbox (industrial-grade) ============
let _fullOverlay = null;
let _fullZoom = 1;
let _fullFit = true;          // auto-fit the page to the viewport width until the user zooms
let _fullContentH = 1056;     // measured content height (unscaled) for the sizer
let _fpTotal = 1;             // total pages in the current render (for the page navigator)

// ----- Page navigator (jump between pages, track the current one on scroll) -----
function _fpStep() { return (PAGE_PX + SHEET_GAP) * _fullZoom; }
function _fpCurrentPage() {
  const scroll = document.getElementById('full-scroll');
  if (!scroll) return 1;
  return Math.min(_fpTotal, Math.max(1, Math.round(scroll.scrollTop / _fpStep()) + 1));
}
function _fpUpdateNav() {
  const no = document.getElementById('fp-pageno');
  if (!no) return;
  const cur = _fpCurrentPage();
  no.textContent = _fpTotal <= 1 ? '1 page' : (cur + ' / ' + _fpTotal);
  const prev = document.getElementById('fp-prev'), next = document.getElementById('fp-next');
  if (prev) prev.disabled = _fpTotal <= 1 || cur <= 1;
  if (next) next.disabled = _fpTotal <= 1 || cur >= _fpTotal;
}
function _fpGoto(dir) {
  const scroll = document.getElementById('full-scroll');
  if (!scroll) return;
  const target = Math.min(_fpTotal - 1, Math.max(0, _fpCurrentPage() - 1 + dir));
  scroll.scrollTo({ top: Math.round(target * _fpStep()), behavior: 'smooth' });
}

function openFullPreview() {
  if (!_fullOverlay) _buildFullOverlay();
  _fullOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';   // lock background scroll while open
  requestAnimationFrame(() => { _fullOverlay.style.opacity = '1'; _fullOverlay.classList.add('hf-fp-in'); });
  document.addEventListener('keydown', _fullKeyHandler);
  _renderFullPreview();
}

function closeFullPreview() {
  if (!_fullOverlay) return;
  _fullOverlay.style.opacity = '0';
  _fullOverlay.classList.remove('hf-fp-in');
  document.body.style.overflow = '';
  setTimeout(() => { if (_fullOverlay) _fullOverlay.style.display = 'none'; }, 220);
  document.removeEventListener('keydown', _fullKeyHandler);
}

function _fullKeyHandler(e) {
  if (e.key === 'Escape') return closeFullPreview();
  if (e.key === '+' || e.key === '=') { e.preventDefault(); setFullZoom(0.1); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); setFullZoom(-0.1); }
  else if (e.key === '0') { e.preventDefault(); _fitFullPreview(); }
}

function _fitScale() {
  const scroll = document.getElementById('full-scroll');
  if (!scroll || !scroll.clientWidth) return 1;
  return Math.max(0.4, Math.min(1.4, (scroll.clientWidth - 56) / PAGE_W));
}
function _fitFullPreview() { _fullFit = true; _fullZoom = _fitScale(); _applyFullZoom(); }
function setFullZoom(delta) {
  _fullFit = false;
  _fullZoom = Math.min(2, Math.max(0.4, +(_fullZoom + delta).toFixed(2)));
  _applyFullZoom();
}
// Scale the iframe and reserve the SCALED footprint on a sizer, so the page stays
// centered and scrolls correctly at any zoom (mirrors the mini-preview approach).
function _applyFullZoom() {
  const f = document.getElementById('full-frame');
  const sizer = document.getElementById('full-sizer');
  if (!f || !sizer) return;
  f.style.transformOrigin = 'top left';
  f.style.transform = 'scale(' + _fullZoom + ')';
  sizer.style.width = Math.round(PAGE_W * _fullZoom) + 'px';
  sizer.style.height = Math.round(_fullContentH * _fullZoom) + 'px';
  const lbl = document.getElementById('full-zoom-label');
  if (lbl) lbl.textContent = Math.round(_fullZoom * 100) + '%';
  _fpUpdateNav();
}

function _renderFullPreview() {
  const f = document.getElementById('full-frame');
  if (!f) return;
  _mountResume(f, false, function (doc) {
    _injectPreviewChrome(doc);
    if (!doc._jbound) { _bindPreviewClicks(doc); doc._jbound = true; }  // click a heading to jump-edit
    const pages = _paginate(doc);
    _fullContentH = doc.documentElement.scrollHeight || doc.body.scrollHeight || 1056;
    f.style.height = _fullContentH + 'px';
    _fpTotal = pages;
    _fpUpdateNav();
    if (_fullFit) _fitFullPreview(); else _applyFullZoom();
  });
}

function _buildFullOverlay() {
  const st = document.createElement('style');
  st.textContent =
    '#full-preview-overlay{position:fixed;inset:0;z-index:1000;display:none;flex-direction:column;background:radial-gradient(130% 100% at 50% -10%,#171b3d,#0a0c1b 68%);opacity:0;transition:opacity .22s ease;}' +
    '#full-preview-overlay .fp-bar{display:flex;align-items:center;gap:16px;padding:11px 18px;flex-shrink:0;background:rgba(13,16,38,.75);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,.08);}' +
    '#full-preview-overlay .fp-left,#full-preview-overlay .fp-right{display:flex;align-items:center;gap:10px;flex:1;min-width:0;}' +
    '#full-preview-overlay .fp-right{justify-content:flex-end;}' +
    '#full-preview-overlay .fp-brand{display:flex;align-items:center;gap:8px;color:#fff;font-weight:700;font-size:14px;white-space:nowrap;}' +
    '#full-preview-overlay .fp-brand img{width:22px;height:22px;border-radius:5px;}' +
    '#full-preview-overlay .fp-pages{font-size:12px;color:#c7cbe0;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:4px 11px;white-space:nowrap;}' +
    '#full-preview-overlay .fp-nav{display:flex;align-items:center;gap:1px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:2px;}' +
    '#full-preview-overlay .fp-nav button{width:26px;height:26px;border:0;background:transparent;color:#fff;border-radius:999px;cursor:pointer;font-size:16px;line-height:1;transition:background .12s;}' +
    '#full-preview-overlay .fp-nav button:not(:disabled):hover{background:rgba(255,255,255,.16);}' +
    '#full-preview-overlay .fp-nav button:disabled{opacity:.32;cursor:default;}' +
    '#full-preview-overlay .fp-pageno{font-size:12px;color:#c7cbe0;min-width:62px;text-align:center;white-space:nowrap;}' +
    '#full-preview-overlay .fp-zoom{display:flex;align-items:center;gap:2px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:3px;}' +
    '#full-preview-overlay .fp-zbtn{width:32px;height:30px;display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:#fff;border-radius:8px;cursor:pointer;font-size:17px;line-height:1;transition:background .12s;}' +
    '#full-preview-overlay .fp-zbtn:hover{background:rgba(255,255,255,.14);}' +
    '#full-preview-overlay .fp-zlabel{min-width:52px;text-align:center;font-size:13px;font-weight:600;color:#fff;cursor:pointer;user-select:none;}' +
    '#full-preview-overlay .fp-export{display:inline-flex;align-items:center;gap:7px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:0;border-radius:9px;padding:9px 16px;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;box-shadow:0 6px 18px rgba(99,102,241,.35);transition:transform .12s,box-shadow .12s;}' +
    '#full-preview-overlay .fp-export:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(99,102,241,.45);}' +
    '#full-preview-overlay .fp-close{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:9px;padding:9px 13px;font-size:13px;cursor:pointer;transition:background .12s;}' +
    '#full-preview-overlay .fp-close:hover{background:rgba(255,255,255,.16);}' +
    '#full-preview-overlay .fp-close kbd{font:600 10px ui-monospace,monospace;background:rgba(255,255,255,.14);border-radius:4px;padding:1px 5px;}' +
    '#full-preview-overlay .fp-scroll{flex:1;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:34px 24px 90px;}' +
    '#full-preview-overlay .fp-sizer{position:relative;flex:none;margin:0 auto;}' +
    '#full-preview-overlay #full-frame{position:absolute;top:0;left:0;width:816px;border:0;background:#fff;border-radius:3px;box-shadow:0 30px 90px rgba(0,0,0,.6);}' +
    '#full-preview-overlay.hf-fp-in .fp-sizer{animation:fpRise .3s cubic-bezier(.2,.7,.2,1) both;}' +
    '@keyframes fpRise{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}' +
    '@media (max-width:640px){#full-preview-overlay .fp-brand span,#full-preview-overlay .fp-pages{display:none;}}';
  document.head.appendChild(st);

  _fullOverlay = document.createElement('div');
  _fullOverlay.id = 'full-preview-overlay';
  _fullOverlay.innerHTML =
    '<div class="fp-bar">' +
      '<div class="fp-left"><span class="fp-brand"><img src="logo.jpeg" width="22" height="22" alt="">Preview</span>' +
        '<span class="fp-nav" id="fp-nav"><button id="fp-prev" title="Previous page" aria-label="Previous page">‹</button>' +
        '<span class="fp-pageno" id="fp-pageno">1 page</span>' +
        '<button id="fp-next" title="Next page" aria-label="Next page">›</button></span></div>' +
      '<div class="fp-zoom">' +
        '<button class="fp-zbtn" id="fz-out" title="Zoom out (−)" aria-label="Zoom out">−</button>' +
        '<span class="fp-zlabel" id="full-zoom-label" title="Fit to width (press 0)">100%</span>' +
        '<button class="fp-zbtn" id="fz-in" title="Zoom in (+)" aria-label="Zoom in">+</button>' +
        '<button class="fp-zbtn" id="fz-fit" title="Fit width" aria-label="Fit width">⤡</button>' +
      '</div>' +
      '<div class="fp-right">' +
        '<a class="fp-export" href="export">Export PDF →</a>' +
        '<button class="fp-close" id="fz-close" aria-label="Close preview">Close <kbd>Esc</kbd></button>' +
      '</div>' +
    '</div>' +
    '<div class="fp-scroll" id="full-scroll"><div class="fp-sizer" id="full-sizer"><iframe id="full-frame" title="Full resume preview" scrolling="no"></iframe></div></div>';
  document.body.appendChild(_fullOverlay);

  const q = s => _fullOverlay.querySelector(s);
  q('#fz-out').onclick = () => setFullZoom(-0.1);
  q('#fz-in').onclick = () => setFullZoom(0.1);
  q('#fz-fit').onclick = _fitFullPreview;
  q('#full-zoom-label').onclick = _fitFullPreview;
  q('#fz-close').onclick = closeFullPreview;
  q('#fp-prev').onclick = () => _fpGoto(-1);
  q('#fp-next').onclick = () => _fpGoto(1);
  const scroll = q('#full-scroll');
  scroll.addEventListener('scroll', () => {
    if (scroll._navRaf) return;
    scroll._navRaf = requestAnimationFrame(() => { scroll._navRaf = 0; _fpUpdateNav(); });
  }, { passive: true });
  _fullOverlay.addEventListener('click', (e) => { if (e.target === _fullOverlay || e.target === scroll) closeFullPreview(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (_fullFit && _fullOverlay.style.display === 'flex') _fitFullPreview(); }).observe(scroll);
}

function _bindPreviewClicks(doc) {
  if (!doc) return;
  const SECTION_MAP = {
    'experience': 'experience', 'education': 'education', 'skills': 'skills',
    'projects': 'projects', 'certifications': 'certifications', 'awards': 'awards',
    'leadership': 'leadership', 'volunteer': 'volunteer', 'publications': 'publications',
    'summary': 'personal', 'profile': 'personal', 'objective': 'personal',
    'workexperience': 'experience', 'professionalexperience': 'experience',
  };
  // Make section headings clickable (handlers added from the parent context, so
  // the same-origin iframe can call back into nextSection()).
  doc.querySelectorAll('h2').forEach(h2 => {
    const key = h2.textContent.toLowerCase().replace(/[^a-z]/g, '');
    const section = SECTION_MAP[key] || Object.keys(SECTION_MAP).reduce((found, k) => found || (key.includes(k) ? SECTION_MAP[k] : null), null);
    if (!section) return;
    h2.classList.add('preview-jump');
    h2.title = 'Click to edit ' + section;
    h2.addEventListener('click', () => nextSection(section));
  });
  // Make header/name area jump to personal
  const header = doc.querySelector('[class*="header"], [class*="name"]');
  if (header) {
    header.classList.add('preview-jump');
    header.title = 'Click to edit Personal Info';
    header.addEventListener('click', () => nextSection('personal'));
  }
}

// ============ Helpers ============
function nextSection(s) {
  currentSection = s;
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.toggle('active', i.dataset.section === s));
  renderMain();
}
function addItem(key, b) { resume[key].push(b); save(); renderMain(); }
function removeItem(key, idx) {
  const removed = resume[key][idx];
  resume[key].splice(idx, 1); save(); renderMain();
  toast('Item removed', { type: 'info', duration: 6000, action: { label: 'Undo', onClick: () => {
    resume[key].splice(idx, 0, removed); save(); renderMain(); toast('Restored', { type: 'success' });
  } } });
}

// Coalesce rapid keystrokes into one preview re-render so typing stays smooth
// (each render re-writes the iframe + re-measures; doing it per keystroke flickers).
let _previewTimer = null;
function schedulePreview() {
  clearTimeout(_previewTimer);
  _previewTimer = setTimeout(renderPreview, 160);
}

// Grow a textarea to fit its content so long bullets aren't cramped in a tiny box.
function _autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
function _wireAutoGrow() {
  document.querySelectorAll('#main textarea').forEach(el => {
    if (!el._agBound) { el._agBound = true; el.style.overflowY = 'hidden'; el.addEventListener('input', () => _autoGrow(el)); }
    _autoGrow(el);
  });
}
function bindAutoSave() {
  document.querySelectorAll('[data-bind]').forEach(el => {
    el.addEventListener('input', () => {
      const path = el.dataset.bind.split('.');
      let obj = resume;
      for (let i=0;i<path.length-1;i++) obj = obj[path[i]];
      obj[path[path.length-1]] = el.value;
      save(); schedulePreview();
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

let _cloudTimer = null;
function save() {
  localStorage.setItem('hf_resume', JSON.stringify(resume));
  _setSaveStatus('● Unsaved changes', 'var(--warning)');
  // Debounced cloud autosave so work is never stranded on one device.
  clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(_cloudSaveNow, 1400);
}
async function _cloudSaveNow() {
  _setSaveStatus('Saving…', 'var(--muted)');
  try {
    const r = await fetch(API + '/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify({ resume })
    });
    _setSaveStatus(r.ok ? '✓ All changes saved' : 'Saved on this device', r.ok ? 'var(--success)' : 'var(--muted)');
  } catch (_) {
    _setSaveStatus('Saved on this device', 'var(--muted)');
  }
}

async function saveResume(silent) {
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
  // Open version history (button save) so users can restore versions. A keyboard
  // save (⌘S) stays quiet so it doesn't yank focus into a modal mid-edit.
  if (!silent) openModal('version');
  toast(cloudOk ? 'Saved to cloud ✓' : 'Saved locally ✓', { type: 'success' });
}
// ⌘/Ctrl+S saves to the cloud without opening the version modal.
document.addEventListener('keydown', function (e) {
  if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    saveResume(true);
  }
});

function signOut() {
  ['hf_token','hf_email','hf_resume','hf_jobs','hf_ai_results','hf_welcome'].forEach(k => localStorage.removeItem(k));
  location.href = '/';
}

// ---- Account center dropdown ----
function toggleAcctMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('acct-menu');
  if (!menu) return;
  if (menu.hasAttribute('hidden')) {
    menu.removeAttribute('hidden');
    const t = document.getElementById('acct-trigger'); if (t) t.setAttribute('aria-expanded', 'true');
    document.getElementById('acct-center').classList.add('open');
  } else {
    closeAcctMenu();
  }
}
function closeAcctMenu() {
  const menu = document.getElementById('acct-menu');
  if (!menu || menu.hasAttribute('hidden')) return;
  menu.setAttribute('hidden', '');
  const t = document.getElementById('acct-trigger'); if (t) t.setAttribute('aria-expanded', 'false');
  const c = document.getElementById('acct-center'); if (c) c.classList.remove('open');
}
// Close on outside click or Escape.
document.addEventListener('click', function (e) {
  const c = document.getElementById('acct-center');
  if (c && !c.contains(e.target)) closeAcctMenu();
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAcctMenu(); });

// ============ AI calls ============
async function ai(endpoint, body) {
  // Resume Import (parse) is free for everyone, never gate it.
  // Every other AI feature gives free users a limited number of free trials,
  // ENFORCED BY THE BACKEND (per-feature, default 2). We only pre-check the
  // server-tracked count to show the upgrade modal without a wasted request,   // and we never consume a local counter here, so a network/error/402 can't
  // burn a trial (the backend consumes only on a real, successful result).
  if (isFree() && endpoint !== 'parse' && !canUseAi(endpoint)) {
    showUpgradeModal('ai', endpoint === 'analyze' ? 'analysis' : endpoint);
    throw new Error('Premium required');
  }
  const r = await fetch(API + '/ai/' + endpoint, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
    body: JSON.stringify(body)
  });
  if (r.status === 402) {
    // Backend (source of truth) says this feature is out of free trials. Our local
    // count was stale, so mark it exhausted and refresh the banners/labels, that's
    // the "says 2 left but still paywalls" mismatch corrected.
    if (CURRENT_USER) {
      CURRENT_USER.aiTrials = CURRENT_USER.aiTrials || {};
      CURRENT_USER.aiTrials[endpoint] = (typeof _trialLimit === 'function' ? _trialLimit() : ((CURRENT_USER && CURRENT_USER.freeAiTrials) || 2));
      _refreshTrialUI();
    }
    showUpgradeModal('ai'); throw new Error('Premium required');
  }
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${r.status})`);
  }
  const data = await r.json();
  // Sync the consumed free-trial count and let the user know how many remain.
  if (data && data._trial && CURRENT_USER) {
    CURRENT_USER.aiTrials = CURRENT_USER.aiTrials || {};
    CURRENT_USER.aiTrials[data._trial.feature] = data._trial.used;
    const left = data._trial.remaining;
    toast(left > 0
      ? `Free trial used, ${left} left for this feature`
      : 'Last free trial used, upgrade for unlimited AI', { type: left > 0 ? 'info' : 'warn', duration: 3500 });
    _refreshTrialUI();
  }
  return data;
}

// ============ AI output: pretty formatting + apply ============
// Render freeform AI text into clean recommendation cards: bullet lines become
// a checklist, ALL-CAPS / colon-terminated lines become subheadings, the rest
// become readable paragraphs.
// Safety net: AI output should address the user as "you", never by name or in the
// third person ("Jane's resume…", "The candidate…"). This scrubs any slips client-side
// so the rule holds regardless of backend deploy state. Applied to every AI render path.
function _deName(text) {
  if (text == null) return text;
  let s = String(text);
  // Third-person "candidate" phrasings → second person.
  s = s.replace(/\bthe candidate['’]s\b/gi, 'your').replace(/\bthe candidate\b/gi, 'you');
  const full = ((typeof resume !== 'undefined' && resume && resume.personal && resume.personal.fullName) || '').trim();
  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    // Longest first so "Jane Doe's" is handled before "Jane's".
    const names = Array.from(new Set([full, parts[0]].filter(Boolean))).sort((a, b) => b.length - a.length);
    names.forEach(n => {
      const e = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp('\\b' + e + "['’]s\\b", 'g'), 'your'); // possessive → your
      s = s.replace(new RegExp('\\b' + e + '\\b', 'g'), 'you');        // standalone → you
    });
  }
  // Re-capitalize "you/your" when it starts a sentence or a bullet.
  s = s.replace(/(^|[.!?]\s+|[•✓✗→]\s*)(your|you)\b/g, (_, p, w) => p + w.charAt(0).toUpperCase() + w.slice(1));
  // Fix the most common subject-verb breaks introduced by name→"you" swaps.
  s = s.replace(/\byou has\b/gi, m => m[0] === 'Y' ? 'You have' : 'you have')
       .replace(/\byou is\b/gi, m => m[0] === 'Y' ? 'You are' : 'you are')
       .replace(/\byou was\b/gi, m => m[0] === 'Y' ? 'You were' : 'you were')
       .replace(/\byou does\b/gi, m => m[0] === 'Y' ? 'You do' : 'you do');
  return s;
}

function _renderAiBody(text) {
  text = _deName(text);
  text = String(text || '').replace(/\s*\u2014\s*/g, ', '); // no em dashes in shown output
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return '<p class="ai-para" style="color:var(--muted);">No suggestions returned.</p>';
  const bulletRe = /^([•\-\*–]|\d+[.)])\s+(.*)$/;
  let html = '', inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  lines.forEach(line => {
    const m = line.match(bulletRe);
    if (m) {
      if (!inList) { html += '<ul class="ai-rec-list">'; inList = true; }
      html += `<li class="ai-rec"><span class="ai-rec-ico">${ICON('check','ico ico-sm')}</span><span>${esc(m[2])}</span></li>`;
    } else if (/^[A-Z][A-Za-z0-9 &/()-]{2,42}:?$/.test(line) && line.length <= 44) {
      closeList();
      html += `<h4 class="ai-subhead">${esc(line.replace(/:$/, ''))}</h4>`;
    } else {
      closeList();
      html += `<p class="ai-para">${esc(line)}</p>`;
    }
  });
  closeList();
  return html;
}

function _titleCase(s) { return String(s || '').replace(/\b\w/g, c => c.toUpperCase()); }

// Turn raw backend/model errors into a calm, human message.
function _aiErrMsg(e) {
  const m = (e && e.message) || '';
  // Log the RAW backend reason so it's diagnosable from the browser console
  // (the toast shows a friendly message; this shows the real cause).
  try { console.warn('[Applio AI] request failed:', m); } catch (_) {}
  if (/usage limit|limit reached|quota|neuron|429|too many/i.test(m)) {
    return 'The daily AI limit was reached. It resets shortly, please try again later.';
  }
  if (/empty response|model error|502|503|timeout|timed out|network|failed to fetch|overload/i.test(m)) {
    return 'The AI is busy right now, give it a few seconds and try again.';
  }
  // Never surface raw model/binding/internal text to the user.
  return 'Something went wrong generating that. Please try again.';
}

// Polished AI suggestion modal with an optional Apply button.
let _aiSuggestState = null;
function showAiSuggestion({ title, text, apply, hint }) {
  closeAiSuggest();
  const bd = document.createElement('div');
  bd.id = 'ai-suggest-bd';
  bd.className = 'app-dialog-bd';
  document.body.appendChild(bd);
  requestAnimationFrame(() => bd.classList.add('app-dialog-bd-in'));
  _aiSuggestState = { text, apply };
  bd.innerHTML = `
    <div class="app-dialog ai-suggest">
      <div class="ai-suggest-head">
        <span class="ai-suggest-spark">${ICON('sparkle')}</span>
        <h3>${esc(title || 'AI Suggestion')}</h3>
        <button class="modal-close" onclick="closeAiSuggest()" aria-label="Close">×</button>
      </div>
      <div class="ai-suggest-body ai-body">${_renderAiBody(text)}</div>
      ${hint ? `<p class="ai-suggest-hint">${esc(hint)}</p>` : ''}
      <div class="ai-suggest-actions">
        ${apply ? `<button class="btn btn-primary" onclick="_applyAiSuggestion()">${ICON('check','ico ico-sm')} <span>Apply Changes</span></button>` : ''}
        <button class="btn btn-secondary" onclick="_copyAiSuggestion()">Copy</button>
        <button class="btn btn-ghost" onclick="closeAiSuggest()">${apply ? 'Keep Original' : 'Close'}</button>
      </div>
    </div>`;
  bd.addEventListener('click', e => { if (e.target === bd) closeAiSuggest(); });
  document.addEventListener('keydown', _aiSuggestKey);
}
function _aiSuggestKey(e) { if (e.key === 'Escape') closeAiSuggest(); }
function closeAiSuggest() {
  const bd = document.getElementById('ai-suggest-bd');
  if (!bd) return;
  document.removeEventListener('keydown', _aiSuggestKey);
  bd.classList.remove('app-dialog-bd-in');
  setTimeout(() => bd.remove(), 180);
}
function _copyAiSuggestion() {
  if (!_aiSuggestState) return;
  navigator.clipboard.writeText(_aiSuggestState.text)
    .then(() => toast('Copied to clipboard', { type: 'success' }))
    .catch(() => toast('Copy failed', { type: 'error' }));
}
function _applyAiSuggestion() {
  if (!_aiSuggestState || !_aiSuggestState.apply) return;
  _aiSuggestState.apply(_aiSuggestState.text);
  closeAiSuggest();
  save(); renderMain();
  toast('Changes applied ✓', { type: 'success' });
}

async function aiImprove(target) {
  aiLoading('Improving your ' + (target === 'summary' ? 'summary' : target) + '…');
  try {
    const text = target === 'summary' ? resume.personal.summary : JSON.stringify(resume[target] || {});
    const r = await ai('improve', { target, text });
    const suggestion = r.text || '';
    let apply = null, hint = null;
    if (target === 'summary') {
      apply = (t) => { resume.personal.summary = t; };
    } else if (Array.isArray(resume[target]) && resume[target].length) {
      const item = resume[target][0];
      const field = ('description' in item) ? 'description'
                  : ('abstract' in item) ? 'abstract'
                  : Object.keys(item).find(k => typeof item[k] === 'string');
      if (field) {
        if (resume[target].length === 1) {
          apply = (t) => { resume[target][0][field] = t; };
        } else {
          apply = (t) => { resume[target][0][field] = t; };
          hint = 'Apply replaces the top entry’s bullets. For other entries, copy the lines you want.';
        }
      }
    }
    showAiSuggestion({ title: 'AI Suggestion · ' + _titleCase(target), text: suggestion, apply, hint });
  } catch(e) { if (e.message !== 'Premium required') toast(_aiErrMsg(e), { type: 'error' }); }
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
  } catch(e) { if (e.message !== 'Premium required') toast(_aiErrMsg(e), { type: 'error' }); }
  finally { aiLoadingDone(); }
}

async function aiTailor() {
  const jd = (resume.tailor.jobDescription || '').trim();
  if (jd.length < 30) {
    toast('Paste a job description first, so we have a role to tailor to.', { type: 'warn' });
    const ta = document.querySelector('[data-bind="tailor.jobDescription"]'); if (ta) ta.focus();
    return;
  }
  aiLoading('Tailoring your resume to the job description…');
  try {
    const r = await ai('tailor', { jobDescription: resume.tailor.jobDescription, resume });
    // Prefer the structured result (keyword chips + before→after bullet diffs).
    resume.tailor.result = (r && (r.bulletSuggestions || r.matchedKeywords || r.emphasize)) ? r : null;
    resume.tailor.tailoredSummary = r.text || '';   // legacy fallback text
    if (r.summary) resume.personal.summary = r.summary;
    save(); renderMain();
    toast('Resume tailored', { type: 'success' });
  } catch(e) { if (e.message !== 'Premium required') toast(_aiErrMsg(e), { type: 'error' }); }
  finally { aiLoadingDone(); }
}

// Best-effort title/company from the pasted job description (first line + an
// "at <Company>" / "Company:" pattern). The user confirms/edits before saving.
function _guessJob(jd) {
  const lines = (jd || '').split('\n').map(s => s.trim()).filter(Boolean);
  let title = lines[0] || '';
  if (title.length > 70) title = title.slice(0, 70);
  let company = '';
  const m = (jd || '').match(/(?:\bat|@|company:)\s+([A-Z][\w&.'-]+(?:\s+[A-Z][\w&.'-]+){0,2})/);
  if (m) company = m[1].trim();
  return { title, company };
}
// Save the tailored-to job into the Job Tracker (shared hf_jobs localStorage),
// matching the tracker's record shape so follow-up reminders etc. just work.
function saveTailorToTracker() {
  const jd = (resume.tailor.jobDescription || '').trim();
  if (jd.length < 30) { toast('Add a job description first', { type: 'warn' }); return; }
  const g = _guessJob(jd);
  _trackerDialog(g.title, g.company, jd);
}
function _trackerDialog(title, company, jd) {
  const old = document.getElementById('trk-dialog-bd'); if (old) old.remove();
  const bd = document.createElement('div');
  bd.id = 'trk-dialog-bd';
  bd.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(8,10,25,.6);display:flex;align-items:center;justify-content:center;padding:20px;';
  const f = 'width:100%;box-sizing:border-box;padding:9px 11px;background:var(--bg-2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;font-family:inherit;';
  bd.innerHTML =
    '<div class="section-card" style="max-width:440px;width:100%;position:relative;">' +
      '<button id="trk-x" style="position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1;">×</button>' +
      '<h3 style="margin:0 0 4px;">' + ICON('briefcase','ico ico-sm') + ' Save to Job Tracker</h3>' +
      '<p style="font-size:12px;color:var(--muted);margin:0 0 14px;">Added as <b>Applied</b>. Confirm the details, edit anytime in the tracker.</p>' +
      '<label style="font-size:12px;color:var(--muted);">Job title</label>' +
      '<input id="trk-title" style="' + f + 'margin:4px 0 12px;">' +
      '<label style="font-size:12px;color:var(--muted);">Company</label>' +
      '<input id="trk-company" style="' + f + 'margin:4px 0 4px;">' +
      '<div style="display:flex;gap:8px;margin-top:16px;">' +
        '<button class="btn btn-secondary" id="trk-cancel" style="flex:1;">Cancel</button>' +
        '<button class="btn btn-primary" id="trk-save" style="flex:1;">Add to Tracker</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(bd);
  bd.querySelector('#trk-title').value = title || '';
  bd.querySelector('#trk-company').value = company || '';
  const close = () => bd.remove();
  bd.addEventListener('click', e => { if (e.target === bd) close(); });
  bd.querySelector('#trk-x').onclick = close;
  bd.querySelector('#trk-cancel').onclick = close;
  bd.querySelector('#trk-save').onclick = () => {
    const t = bd.querySelector('#trk-title').value.trim();
    const c = bd.querySelector('#trk-company').value.trim();
    if (!t || !c) { toast('Title and company are required', { type: 'warn' }); return; }
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('hf_jobs') || '[]'); if (!Array.isArray(arr)) arr = []; } catch { arr = []; }
    const now = Date.now();
    arr.unshift({ id: now, addedAt: now, statusAt: now, title: t, company: c, location: '', status: 'Applied', notes: jd.slice(0, 280), tailored: true });
    try { localStorage.setItem('hf_jobs', JSON.stringify(arr)); } catch (e) { toast('Could not save, storage may be full', { type: 'error' }); return; }
    close();
    toast('Added to Job Tracker', { type: 'success' });
  };
}

async function aiATS() {
  const jd = (document.getElementById('ats-jd').value || '').trim();
  if (jd.length < 30) {
    toast('Paste a job description first, so we have something to score against.', { type: 'warn' });
    const ta = document.getElementById('ats-jd'); if (ta) ta.focus();
    return;
  }
  const host = document.getElementById('ats-result');
  const prev = host ? host.innerHTML : null;
  if (host) host.innerHTML = _atsSkeleton();
  try {
    const r = await ai('ats', { jobDescription: jd, resume });
    _renderATSResult(r);   // replaces #ats-result with the real result
    // Cache for the health-score badge (read locally, never re-fetched).
    AI_RESULTS.ats = { score: r.score, ts: Date.now() };
    try { localStorage.setItem('hf_ai_results', JSON.stringify(AI_RESULTS)); } catch {}
    if (window.renderHealthBadge) window.renderHealthBadge();
  } catch(e) {
    if (host && prev != null) host.innerHTML = prev;   // restore (paywall throws before any repaint)
    if (e.message !== 'Premium required') toast(_aiErrMsg(e), { type: 'error' });
  }
}

// True if a string looks like a (possibly fenced) JSON object rather than prose.
function _looksLikeJSON(s) { return typeof s === 'string' && /^\s*(```)?\s*(json)?\s*\{/i.test(s); }

function _renderATSResult(r) {
  // Recover structured fields if the backend handed back raw/blob text (e.g. an
  // un-deployed worker, or the model wrapped output in a ```json fence). This
  // guarantees we never print raw JSON to the user.
  let data = r || {};
  if (data.breakdown == null || _looksLikeJSON(data.feedback) || typeof data.text === 'string') {
    const extracted = _extractJSON(_looksLikeJSON(data.feedback) ? data.feedback : data.text) || _extractJSON(data.feedback);
    if (extracted) data = Object.assign({}, data, extracted);
  }

  const score = Number.isFinite(+data.score) ? Math.max(0, Math.min(100, +data.score)) : 0;
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 70 ? 'Strong Match ✓' : score >= 50 ? 'Decent Match' : 'Needs Work';
  const circ  = 2 * Math.PI * 50;
  const bd      = (data.breakdown && typeof data.breakdown === 'object') ? data.breakdown : null;
  const wins    = Array.isArray(data.wins) ? data.wins : [];
  const missing = Array.isArray(data.missingKeywords) ? data.missingKeywords
                : Array.isArray(data.missing) ? data.missing : [];
  // Only show feedback if it's actual prose, never a raw JSON blob.
  const feedbackText = (typeof data.feedback === 'string' && !_looksLikeJSON(data.feedback)) ? data.feedback : '';

  const bar = (lbl, v) => {
    const val = Number.isFinite(+v) ? Math.max(0, Math.min(100, +v)) : null;
    if (val == null) return '';
    const c = val >= 70 ? '#22c55e' : val >= 50 ? '#f59e0b' : '#ef4444';
    return `<div class="ats-bd-row">
        <div class="ats-bd-head"><span>${esc(lbl)}</span><span style="color:${c};font-weight:700;">${val}</span></div>
        <div class="ats-bd-track"><div class="ats-bd-fill" style="width:${val}%;background:${c};"></div></div>
      </div>`;
  };

  document.getElementById('ats-result').innerHTML = `
    <div class="ats-result-card">
      <div class="ats-ring-wrap">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="10"/>
          <circle id="ats-res-ring" cx="60" cy="60" r="50" fill="none" stroke="${color}" stroke-width="10"
            stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${circ.toFixed(1)}"
            stroke-linecap="round" transform="rotate(-90 60 60)"
            style="transition:stroke-dashoffset 1.4s cubic-bezier(.2,0,.2,1);filter:drop-shadow(0 0 6px ${color}88);"/>
        </svg>
        <div class="ats-ring-center">
          <div class="ats-ring-num" id="ats-res-num">0</div>
          <div class="ats-ring-sub">/100</div>
        </div>
      </div>
      <div class="ats-verdict" style="color:${color};">${label}</div>
      ${bd ? `<div class="ats-breakdown">
        ${bar('Keywords', bd.keywords)}
        ${bar('Experience', bd.experience)}
        ${bar('Formatting', bd.formatting)}
        ${bar('Completeness', bd.completeness)}
      </div>` : ''}
      ${feedbackText ? `<div class="ats-feedback-text ai-body">${_renderAiBody(feedbackText)}</div>` : ''}
      ${wins.length ? `<div class="ats-kw-section"><div class="ats-kw-title">✓ What's working</div><ul class="ai-rec-list" id="ats-wins"></ul></div>` : ''}
      ${missing.length ? `<div class="ats-kw-section"><div class="ats-kw-title">✕ Missing keywords</div><div class="ats-kw-list" id="ats-kw-missing"></div></div>` : ''}
    </div>`;

  // Animate ring + counter
  requestAnimationFrame(() => {
    const ring = document.getElementById('ats-res-ring');
    const numEl = document.getElementById('ats-res-num');
    if (ring) ring.style.strokeDashoffset = (circ * (1 - score / 100)).toFixed(1);
    if (numEl) {
      const start = performance.now();
      (function tick(ts) {
        const p = Math.min((ts - start) / 1400, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        numEl.textContent = Math.floor(eased * score);
        if (p < 1) requestAnimationFrame(tick); else numEl.textContent = score;
      })(performance.now());
    }
  });

  // "What's working" cards
  const winsEl = document.getElementById('ats-wins');
  if (winsEl) wins.forEach(w => {
    const li = document.createElement('li');
    li.className = 'ai-rec';
    li.innerHTML = `<span class="ai-rec-ico">${ICON('check','ico ico-sm')}</span><span>${esc(_deName(w))}</span>`;
    winsEl.appendChild(li);
  });

  // Staggered missing-keyword pills
  const mEl = document.getElementById('ats-kw-missing');
  if (mEl) missing.forEach((kw, i) => setTimeout(() => {
    const pill = document.createElement('span');
    pill.className = 'ats-kw-pill ats-kw-missing';
    pill.textContent = kw;
    mEl.appendChild(pill);
  }, 500 + i * 70));
}

// Tolerantly pull a JSON object out of an AI string (handles ```json fences,
// preamble, trailing prose). Returns null if nothing parseable.
function _extractJSON(text) {
  if (!text) return null;
  let s = String(text).replace(/```(?:json)?/gi, '').trim();
  const a = s.indexOf('{');
  if (a === -1) return null;
  s = s.slice(a);
  // Kill trailing commas before } or ] — the most common thing that makes an
  // otherwise-valid LLM JSON fail JSON.parse (e.g. ["a","b",]).
  const stripCommas = str => str.replace(/,(\s*[}\]])/g, '$1');
  const cands = [s, stripCommas(s)];
  const b = s.lastIndexOf('}');
  if (b > 0) { const t = s.slice(0, b + 1); cands.push(t, stripCommas(t)); }
  // Salvage TRUNCATED JSON (model hit its token limit mid-object): walk the text,
  // then close any still-open string, array, and object so it parses. We can then
  // render whatever fields completed instead of dumping raw JSON.
  let inStr = false, escp = false, stack = [], out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]; out += c;
    if (inStr) { if (escp) escp = false; else if (c === '\\') escp = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  if (inStr) out += '"';
  out = out.replace(/,\s*"[^"]*"\s*:?\s*$/, '').replace(/,\s*$/, '');  // drop a dangling trailing key/comma
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];         // close in correct nesting order
  cands.push(out, stripCommas(out));
  for (const cand of cands) { try { return JSON.parse(cand); } catch {} }
  return null;
}

function _renderAnalysis(r) {
  // Prefer already-structured fields; else parse JSON out of r.text.
  const j = (r && (r.strengths || r.weaknesses || r.topFixes)) ? r : _extractJSON(r && r.text);
  if (!j) {
    // Never dump raw JSON at the user. If the leftover text looks like JSON we
    // couldn't parse, ask for a re-run; otherwise show it as readable prose.
    const raw = String((r && r.text) || (typeof r === 'string' ? r : '')).trim();
    // Strip any code fence first, then decide: JSON-looking → friendly retry (never
    // dump braces at the user); real prose → render as-is.
    const rawClean = raw.replace(/```(?:json)?/gi, '').trim();
    if (/^[\{\[]/.test(rawClean)) {
      return `<div class="ai-body" style="text-align:center;color:var(--muted);padding:8px 4px;">
        The analysis came back in an unexpected format. Please run it again, this is usually a one-off.</div>`;
    }
    return `<div class="ai-body">${_renderAiBody(rawClean || raw)}</div>`;
  }
  const cards = (arr, ico) => `<ul class="ai-rec-list">${(arr || []).map(t =>
    `<li class="ai-rec"><span class="ai-rec-ico">${ICON(ico,'ico ico-sm')}</span><span>${esc(_deName(t))}</span></li>`).join('')}</ul>`;
  const score = j.overallScore != null ? j.overallScore : null;
  const scoreColor = score == null ? 'var(--accent)' : score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  let html = '';
  if (score != null) {
    const C = 2 * Math.PI * 42;
    const off = (C * (1 - Math.max(0, Math.min(100, score)) / 100)).toFixed(1);
    const verdict = score >= 80 ? 'Excellent' : score >= 65 ? 'Strong' : score >= 50 ? 'Solid' : 'Needs work';
    html += `<div class="an-ring-wrap">
      <div class="an-ring-svg">
        <svg viewBox="0 0 100 100" width="100" height="100" style="display:block;">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" stroke-width="8"/>
          <circle cx="50" cy="50" r="42" fill="none" stroke="${scoreColor}" stroke-width="8" stroke-linecap="round"
            stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off}" transform="rotate(-90 50 50)"
            style="filter:drop-shadow(0 0 5px ${scoreColor}66);"/>
        </svg>
        <div class="an-ring-center">
          <div class="an-ring-num" style="color:${scoreColor};">${score}</div>
          <div class="an-ring-sub">/100</div>
        </div>
      </div>
      <div class="an-ring-verdict" style="color:${scoreColor};">${verdict}</div>
      <div class="an-ring-label">Resume quality</div>
    </div>`;
  }
  if (j.summary) html += `<p class="ai-para" style="margin-bottom:14px;">${esc(_deName(j.summary))}</p>`;
  if (j.strengths && j.strengths.length) html += `<div class="tailor-block tailor-good"><div class="tailor-block-head">Strengths<span class="tailor-count">${j.strengths.length}</span></div>${cards(j.strengths,'check')}</div>`;
  if (j.weaknesses && j.weaknesses.length) html += `<div class="tailor-block tailor-bad"><div class="tailor-block-head">Weaknesses<span class="tailor-count">${j.weaknesses.length}</span></div>${cards(j.weaknesses,'arrowRight')}</div>`;
  if (j.topFixes && j.topFixes.length) {
    const fixes = j.topFixes.map((f, i) => {
      const pr = String(f.priority || '').toLowerCase();
      const prBadge = pr === 'high'
        ? `<span class="an-fix-pri" style="background:rgba(239,68,68,.16);color:#f87171;">High impact</span>`
        : pr === 'medium'
          ? `<span class="an-fix-pri" style="background:rgba(245,158,11,.16);color:#fbbf24;">Medium</span>`
          : '';
      return `<li class="ai-rec an-fix">
        <span class="an-fix-num">${i + 1}</span>
        <span style="min-width:0;">
          <strong>${esc(_deName(f.action || ''))}</strong>${prBadge}
          ${f.where ? `<span class="an-fix-where">${esc(_deName(f.where))}</span>` : ''}
          ${f.impact ? `<span class="an-fix-why">${esc(_deName(f.impact))}</span>` : ''}
          ${f.example ? `<span class="an-fix-example">✎ Try: “${esc(_deName(f.example))}”</span>` : ''}
        </span>
      </li>`;
    }).join('');
    html += `<div class="tailor-block tailor-card"><div class="tailor-block-head">Top fixes</div><ul class="ai-rec-list">${fixes}</ul></div>`;
  }
  if (j.missingSections && j.missingSections.length) {
    html += `<div class="tailor-block tailor-card"><div class="tailor-block-head">Consider adding</div><div class="tailor-pills">${j.missingSections.map(s => `<span class="ats-kw-pill ats-kw-missing">+ ${esc(s)}</span>`).join('')}</div></div>`;
  }
  return `<div class="tailor-result">${html}</div>`;
}

// Result panel markup, shared by a fresh run and by re-rendering the section
// (so the analysis survives navigating away and back).
function _analysisPanel(r) {
  return `
    <div class="ai-result-panel">
      <div class="ai-result-head"><span class="ai-suggest-spark">${ICON('sparkle')}</span><h4>Resume Analysis</h4></div>
      <div style="padding:16px;">${_renderAnalysis(r)}</div>
    </div>`;
}

// Shimmer skeleton shaped like the real analysis result, shown inline while the
// AI runs (an optimistic, "premium" feel instead of a blocking overlay).
function _skLine(w) { return `<div class="sk" style="height:12px;width:${w};border-radius:6px;margin:8px 0;"></div>`; }
function _skBlock(n) {
  return `<div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-top:12px;">
    <div class="sk" style="height:13px;width:120px;border-radius:6px;margin-bottom:6px;"></div>
    ${Array.from({ length: n }).map(() => _skLine('100%')).join('')}
  </div>`;
}
function _analysisSkeleton() {
  return `
    <div class="ai-result-panel">
      <div class="ai-result-head"><span class="ai-suggest-spark">${ICON('sparkle')}</span><h4>Analyzing your resume…</h4></div>
      <div style="padding:16px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin:4px 0 18px;">
          <div class="sk" style="width:100px;height:100px;border-radius:50%;"></div>
          <div class="sk" style="width:90px;height:14px;border-radius:6px;"></div>
        </div>
        ${_skLine('100%')}${_skLine('94%')}${_skLine('72%')}
        ${_skBlock(2)}${_skBlock(2)}${_skBlock(1)}
      </div>
    </div>`;
}
function _atsSkeleton() {
  const bar = () => `<div style="display:flex;align-items:center;gap:12px;margin:11px 0;">
    <div class="sk" style="width:84px;height:10px;border-radius:6px;"></div>
    <div class="sk" style="flex:1;height:8px;border-radius:999px;"></div></div>`;
  const chip = () => `<div class="sk" style="width:64px;height:24px;border-radius:8px;"></div>`;
  return `
    <div class="ats-result-card" style="display:flex;flex-direction:column;align-items:center;">
      <div class="sk" style="width:120px;height:120px;border-radius:50%;"></div>
      <div class="sk" style="width:110px;height:16px;border-radius:6px;margin:14px 0 8px;"></div>
      <div style="width:100%;max-width:340px;">${bar()}${bar()}${bar()}${bar()}</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:center;margin-top:14px;">${chip()}${chip()}${chip()}${chip()}</div>
    </div>`;
}

async function aiAnalyze() {
  const host = document.getElementById('analysis-result');
  const prev = host ? host.innerHTML : null;
  if (host) host.innerHTML = _analysisSkeleton();
  try {
    const r = await ai('analyze', { resume });
    resume.analysis = r;            // persist so it's restored when revisiting the section
    save();
    if (host) host.innerHTML = _analysisPanel(r);
  } catch(e) {
    if (host && prev != null) host.innerHTML = prev;   // restore (paywall throws before any repaint)
    if (e.message !== 'Premium required') toast(_aiErrMsg(e), { type: 'error' });
  }
}

function openModal(id) {
  document.getElementById('modal-'+id).classList.add('open');
  if(id==='version') renderVersions();
  if(id==='import') _updateImportHint();
}
// Resume import is free for everyone, no trial counter.
function _updateImportHint(){
  const el = document.getElementById('import-hint');
  if (!el) return;
  el.innerHTML = `✨ <strong style="color:var(--accent);">Free for everyone</strong>, import as many resumes as you like.`;
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
  const history = resume.versions || [];
  const snap = history[i] && history[i].data;
  if (!snap) return;
  // Deep-clone so edits don't mutate the archived snapshot, and KEEP the
  // version history (snapshots are stored without it, so a raw assign would
  // wipe every saved version on the next save).
  resume = JSON.parse(JSON.stringify(snap));
  resume.versions = history;
  save(); closeModal('version'); renderMain();
  toast('Version restored', { type: 'success' });
}

// Coerce whatever /ai/parse returns into the exact shape the editor renders, so
// a malformed AI response (skills as array/string, missing categories, non-array
// sections) can't throw inside renderSkills/renderExperience/renderCustomize.
function _normalizeImported(raw) {
  const base = structuredClone(DEFAULT_RESUME);
  if (!raw || typeof raw !== 'object') return base;
  if (raw.personal && typeof raw.personal === 'object') Object.assign(base.personal, raw.personal);
  for (const k of ['experience','education','projects','certifications','awards','leadership','volunteer','publications']) {
    if (Array.isArray(raw[k])) base[k] = raw[k];
  }
  // skills: accept {categories:[...]}, a bare array, or a comma/pipe string.
  let cats = null;
  if (raw.skills && Array.isArray(raw.skills.categories)) cats = raw.skills.categories;
  else if (Array.isArray(raw.skills)) cats = [{ name: 'All', items: raw.skills }];
  else if (typeof raw.skills === 'string') cats = [{ name: 'All', items: raw.skills.split(/[,|]/).map(s => s.trim()).filter(Boolean) }];
  if (cats) base.skills = { categories: cats.map(c => ({ name: (c && c.name) || 'All', items: Array.isArray(c && c.items) ? c.items : [] })) };
  return base;
}

async function importResume() {
  const text = document.getElementById('import-text').value;
  if (!text.trim()) return toast('Paste some text first', { type: 'warn' });
  closeModal('import');
  aiLoading('Parsing your resume with AI…');
  try {
    const r = await ai('parse', { text });
    if (r.resume) {
      resume = _normalizeImported(r.resume);
      save(); renderMain();
      toast('Resume imported', { type: 'success' });
    } else {
      toast('Could not parse resume, try cleaning up the text and re-importing', { type: 'error', duration: 4500 });
    }
  } catch(e) { if (e.message !== 'Premium required') toast(_aiErrMsg(e), { type: 'error' }); }
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

// ── Template hover zoom ──
(function () {
  const popup = document.createElement('div');
  popup.id = 'template-zoom-popup';
  popup.innerHTML = '<div class="tzp-inner"><div class="tzp-thumb" id="tzp-thumb"></div><div class="tzp-name" id="tzp-name"></div><div class="tzp-hint">Click to select</div></div>';
  document.body.appendChild(popup);

  let hideTimer, showTimer;
  document.addEventListener('mouseover', function (e) {
    const card = e.target.closest('.template-card');
    if (!card) return;
    clearTimeout(hideTimer);
    showTimer = setTimeout(() => {
      const tid = card.querySelector('[onclick]')?.getAttribute('onclick')?.match(/selectTemplate\('([^']+)'\)/)?.[1];
      if (!tid) return;
      const thumb = TEMPLATE_THUMBS[tid];
      const name  = TEMPLATE_DEFS.find(t => t.id === tid)?.name || tid;
      document.getElementById('tzp-thumb').innerHTML = thumb || '';
      document.getElementById('tzp-name').textContent = name;
      const r = card.getBoundingClientRect();
      popup.style.top  = (r.top + window.scrollY - 8) + 'px';
      popup.style.left = (r.right + window.scrollX + 12) + 'px';
      popup.classList.add('active');
    }, 300);
  });
  document.addEventListener('mouseout', function (e) {
    const card = e.target.closest('.template-card');
    if (!card) return;
    clearTimeout(showTimer);
    hideTimer = setTimeout(() => popup.classList.remove('active'), 120);
  });
  popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  popup.addEventListener('mouseleave', () => { hideTimer = setTimeout(() => popup.classList.remove('active'), 120); });
})();

// ============ Boot ============
// ---- First-signup welcome screen (plays once) ----
function _maybeShowWelcome() {
  if (localStorage.getItem('hf_welcome') !== '1') return;
  localStorage.removeItem('hf_welcome');
  const bd = document.createElement('div');
  bd.id = 'welcome-overlay';
  bd.innerHTML = `
    <div class="wel-bg"></div>
    <div class="wel-card">
      <div class="wel-logo"><img src="logo.jpeg" alt="Applio"></div>
      <div class="wel-eyebrow">Welcome to Applio</div>
      <h1 class="wel-title">Let's land you<br>more interviews.</h1>
      <p class="wel-sub">Already have a resume? Paste it and AI fills in every section in seconds. Starting fresh? Jump right in.</p>
      <div class="wel-actions" style="display:flex; flex-direction:column; align-items:center; gap:14px;">
        <button class="wel-btn" type="button" onclick="_welImport()">✨ Paste my existing resume</button>
        <button type="button" onclick="_closeWelcome()" style="background:none; border:0; color:rgba(255,255,255,.8); font-size:14px; font-weight:600; cursor:pointer; padding:4px 8px;">Start from scratch →</button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  document.body.style.overflow = 'hidden';
  // auto-dismiss as a fallback so it never blocks
  bd._t = setTimeout(_closeWelcome, 9000);
}
function _closeWelcome() {
  const b = document.getElementById('welcome-overlay');
  if (!b) return;
  clearTimeout(b._t);
  b.classList.add('wel-out');
  document.body.style.overflow = '';
  setTimeout(() => b.remove(), 420);
}
// Import-first onboarding: from the welcome screen, jump straight into the paste-your-
// resume flow so new users never face a blank editor (the #1 cause of abandonment).
function _welImport() {
  _closeWelcome();
  setTimeout(() => { if (typeof openModal === 'function') openModal('import'); }, 180);
}

// One-time cloud hydrate: on a fresh device or after cleared storage, the local
// working copy is empty even though a saved resume exists in the cloud. Pull it
// so the user doesn't see a blank editor and overwrite their real resume. We only
// do this when there was NO local resume, so unsaved local edits are never clobbered.
async function _hydrateFromCloud() {
  if (HAD_LOCAL_RESUME) return;
  try {
    const r = await fetch(API + '/resume', { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!r.ok) return;
    const data = await r.json();
    if (data && data.resume && typeof data.resume === 'object') {
      resume = data.resume;
      if (!Array.isArray(resume.versions)) resume.versions = [];
      localStorage.setItem('hf_resume', JSON.stringify(resume));
    }
  } catch (_) { /* offline / transient, fall back to the local default */ }
}

(async () => {
  _maybeShowWelcome();
  await loadCurrentUser();
  await _hydrateFromCloud();
  _ensureCustomSections();
  hydrate();
  renderCustomNav();
  renderMain();
})();