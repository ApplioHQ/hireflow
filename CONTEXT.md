# Applio -- Full Project Context

Hand this file to any agent working on Applio. It covers architecture, file map, data model, design system, deployment, conventions, and known issues.

---

## 1. What Applio Is

A **100%-free AI resume builder** at [appliohq.com](https://appliohq.com). Users build, tailor, and export resumes with AI assistance. No paid plans -- every feature is unlocked for everyone. Stripe/billing plumbing is dormant but still in the codebase.

**Stack:** vanilla HTML + CSS + JS (no build step, no framework). Cloudflare Worker backend with KV storage. Auto-deploys via GitHub Pages on push to `main`.

**Owner:** Pritam Avuthu (solo founder). Also builds Raylight (motion design editor, separate project).

---

## 2. Architecture

```
Browser (static site on GitHub Pages)
  |
  |  fetch() to API_URL
  v
Cloudflare Worker (worker/worker.js, ~4800 lines)
  |
  +-- KV (HIREFLOW_KV) -- user records, resumes, jobs, feedback, analytics
  +-- Workers AI (@cf/meta/llama-3.1-8b-instruct-fast, @cf/meta/llama-4-scout-17b-16e-instruct)
  +-- Stripe (checkout, webhooks, portal -- dormant)
  +-- Google OAuth (optional, client ID empty by default)
  +-- Google Drive export (OAuth flow for exporting resume as Google Doc)
```

### Key URLs
- **Live site:** `https://appliohq.com`
- **API:** `https://hireflow-api.pritamavuthu7.workers.dev`
- **Config:** `js/config.js` sets `window.HIREFLOW_CONFIG.API_URL`

### Auth
- JWT tokens stored in `localStorage` as `hf_token`
- Anonymous mode: visitors can build a full resume with no account (localStorage only)
- Sign-up is only asked at cloud save, AI features, and export
- `js/plan.js` monkey-patches `window.fetch` to catch 401/403 globally

### Data Flow
- **Local-first:** resume lives in `localStorage` as `hf_resume` (the active one) and `hf_resumes` (multi-resume array)
- **Cloud sync:** single resume per user stored as `resume:<email>` in KV
- `hf_active_id` tracks which resume is loaded

---

## 3. File Map

### HTML Pages (product)
| Page | File | Purpose |
|------|------|---------|
| Dashboard | `dashboard.html` | Home, resume cards, quick actions |
| Editor | `editor.html` | Resume builder (main product) |
| Export | `export.html` | Export/download with paginated preview |
| Autopilot | `autopilot.html` | Auto-tailor to job descriptions |
| Cover Letter | `cover-letter.html` | AI cover letter generator |
| Letter Writer | `letters.html` | General letter writing |
| Best Match | `match.html` | Job-resume match scoring |
| Interview Prep | `interview.html` | AI interview practice |
| Career Coach | `assistant.html` | AI career advice chat |
| Job Tracker | `jobs.html` | Kanban job tracker |
| Skill Gap | `skill-gap.html` | Identify skill gaps |
| Salary Insights | `salary.html` | Salary data |
| Brag Doc | `brag-doc.html` | Achievement tracker |
| First 90 Days | `first-90-days.html` | New job plan |
| Login | `login.html` | Auth page |
| Admin | `admin.html` | Admin dashboard |
| Pricing | `pricing.html` | Pricing page (shows everything free) |
| Profile | `profile.html` | User profile |

### HTML Pages (SEO/marketing)
- `index.html` -- landing page
- `resume-builder.html`, `resume-builder-for-*.html` (10 niche pages)
- `*-alternative.html` (competitor comparison pages)
- `cover-letter-examples/*.html` (30 example pages)
- `cover-letter-templates/index.html`
- `blog/*.html` (5 blog posts)
- `compare/*.html` (2 comparison pages)

### JavaScript (alphabetical, with line counts and purpose)
| File | Lines | Purpose |
|------|-------|---------|
| `js/acctcenter.js` | ~200 | Account menu dropdown component |
| `js/applio-ai.js` | ~300 | AI "thinking orb" animation, shared AI identity |
| `js/appshell.js` | ~250 | Persistent left nav rail (the canonical navigation) |
| `js/attribution.js` | ~50 | UTM/referral attribution tracking |
| `js/command-palette.js` | ~200 | Cmd+K command palette |
| `js/config.js` | 5 | API URL + Stripe publishable key |
| `js/copilot-rail.js` | ~300 | Copilot score card in editor right panel |
| `js/editor.js` | 5128 | **Main editor** -- resume CRUD, AI tools, preview, sidebar |
| `js/focus-mode.js` | ~100 | Distraction-free editing mode |
| `js/health-badge.js` | ~200 | Health score badge in topbar |
| `js/icons.js` | ~100 | SVG icon set (`ICON('name')` helper) |
| `js/notify.js` | 463 | Toasts, modals, confirm dialogs, AI loading overlay |
| `js/onboarding.js` | ~200 | First-run onboarding flow |
| `js/plan.js` | 537 | User/plan state, `loadCurrentUser()`, `isPaid()`, `canUseAi()` |
| `js/pwa.js` | ~100 | PWA install prompts (Android/iOS) |
| `js/slim-sidebar.js` | ~150 | Slim icon sidebar for editor |
| `js/templates.js` | 1488 | Resume templates + rendering (`renderTemplate`, `writeResumeFrame`, `HFPaginate`) |
| `js/theme.js` | ~50 | Light/dark mode toggle |
| `js/walkthrough.js` | ~150 | Step-by-step walkthrough overlay |
| `worker/worker.js` | 4813 | **Cloudflare Worker** -- all backend logic |

### CSS
| File | Lines | Purpose |
|------|-------|---------|
| `css/styles.css` | 2065 | **Shared design system** -- tokens, components, layout |
| `css/home.css` | ~600 | Landing page styles |

### Config
| File | Purpose |
|------|---------|
| `worker/wrangler.toml` | Worker deployment config (KV, secrets, staging, cron) |
| `CNAME` | GitHub Pages custom domain (`appliohq.com`) |
| `manifest.json` | PWA manifest |
| `sw.js` | Service worker |

---

## 4. Design System (`css/styles.css`)

### Design Tokens (`:root`, lines 2-55)
```css
/* Colors */
--bg-0: #111113;  --bg-1: #1c1c20;  --bg-2: #26262b;  --bg-3: #303037;
--border: #33333a;  --text: #e6e9f5;  --muted: #9a9aa2;
--accent: #6d4dfc;  --accent-deep: #5a3ce8;  --accent-2: #8a73f8;
--accent-hover: #8370ff;  --accent-text: #c2b8fd;  --on-accent: #ffffff;
--accent-ghost: rgba(109,77,252,.08);  --accent-soft: rgba(109,77,252,.14);
--accent-line: rgba(109,77,252,.35);
--success: #10b981;  --warning: #f59e0b;  --danger: #ef4444;
/* + status soft/text/line variants for each */

/* Radius */
--r-sm: 8px;  --r-md: 12px;  --r-lg: 16px;  --r-xl: 20px;  --r-full: 999px;

/* Shadows */
--sh-1 / --sh-2 / --sh-3  (layered, low-opacity)
--hi: inset 0 1px 0 rgba(255,255,255,.05);  /* glass highlight */

/* Spacing (8px rhythm) */
--sp-1: 4px ... --sp-8: 48px;

/* Type scale */
--fs-xs: 12px ... --fs-4xl: 44px;
--font-display: 'Sora', -apple-system, ...;

/* Motion */
--ease / --ease-out / --dur: .16s / --dur-fast: .1s / --dur-slow: .3s;
```

### Light Mode (`html.light-mode`, lines 57-78)
Overrides backgrounds, text, shadows, accent tints. Toggled by `js/theme.js`, persisted in `localStorage` as `hf_theme`.

### CSS Prefix Conventions
- `.rb-` -- dashboard/resume-builder
- `.ai-tool-` / `.ai-globe` -- AI loading states
- `.cr-` -- copilot rail
- `.app-` -- app shell (rail, topbar, dialog)
- `.rail-` -- navigation rail items

---

## 5. App Shell & Navigation

**One nav, one source of truth:** `js/appshell.js` renders a fixed left rail with 14 items in 4 groups:

```
Home
---
Resume Builder | Autopilot | Cover Letter | Letter Writer | Best Match
---
Interview Prep | Career Coach | Job Tracker
---
Skill Gap | Salary Insights | Brag Doc | First 90 Days
```

- Desktop: slim icon rail (60px), expands to 220px on hover with labels
- Mobile (<=900px): rail hides, replaced by a slide-in drawer triggered from topbar hamburger
- Self-contained: injects own CSS, adds `body.has-rail` class
- Hides per-page `.topbar-tabs` everywhere (one source of nav)
- Include on any page: `<script src="/js/appshell.js"></script>`

### Account Menu
`js/acctcenter.js` is the single account menu component. Renders user avatar + dropdown.

### Topbar
Each page has an `.app-topbar` with brand + right-side actions (health badge, theme toggle, account menu).

---

## 6. Resume Data Model

```javascript
const DEFAULT_RESUME = {
  template: 'modern',      // template id from js/templates.js
  customize: {
    accent: '#6d4dfc',      // resume accent color
    font: 'Inter',          // resume body font
    spacing: 'medium',      // compact | medium | comfortable
    textSize: 'm',          // s | m | l
    margins: 'Normal',      // Narrow | Normal | Wide
    lineHeight: 'normal',
    bullet: 'dot',          // dot | dash | arrow | none
    headingCase: 'uppercase',
    paperSize: 'Letter',    // Letter | A4
    sections: { education: true, experience: true, skills: true, ... },
    sectionOrder: ['experience', 'education', 'skills', 'projects', ...]
  },
  personal: { fullName, email, phone, location, linkedin, github, website, summary },
  experience: [],           // { company, title, location, startDate, endDate, current, bullets:[] }
  education: [],            // { school, degree, field, startDate, endDate, gpa, bullets:[] }
  skills: { categories: [] }, // { name, skills }
  projects: [],             // { name, description, url, bullets:[] }
  certifications: [],
  awards: [],
  leadership: [],
  volunteer: [],
  publications: [],
  tailor: { jobDescription, tailoredSummary },
  versions: []
};
```

### Multi-Resume Storage
- `hf_resumes` -- array of `{ id, name, resume, updatedAt }`
- `hf_active_id` -- which one is loaded
- `hf_resume` -- the active resume object (redundant with active entry in array)

---

## 7. Editor Structure (`editor.html` + `js/editor.js`)

The editor is a single-page app with a section-based router:

### Sidebar
Ordered flow with completion awareness:
- **Build** group: Personal Info, Experience, Education, Skills, Projects, Certifications, Awards, Leadership, Volunteer, Publications
- **Improve** group: AI Tailor, ATS Check, Analysis, Modernize

### Key Functions
| Function | Line | Purpose |
|----------|------|---------|
| `_normalizeResume()` | 39 | Deep-merge loaded resume against DEFAULT shape |
| `renderMain()` / `goSection()` | ~271 | Section router |
| `_resumeHealth()` | ~317 | Resume health score (unified, single engine) |
| `renderPreview()` | ~2394 | Live preview rendering |
| `renderTailor()` | ~1752 | AI Tailor panel |
| `renderATS()` | ~1816 | ATS check panel |
| `renderAnalysis()` | ~1871 | Resume analysis panel |
| `renderModernize()` | ~1894 | Modernize suggestions panel |
| `showAiSuggestion()` | ~3636 | Diff-apply modal for AI suggestions |
| `_aiToolLoading()` | ~1988 | Inline AI loading indicator (dotted globe) |

### AI Interaction Pattern
All four AI tools share:
1. One header component (icon + title + run button)
2. One loading affordance (dotted globe spinner)
3. One result surface
4. One "review & apply" diff model (`showAiSuggestion`)

### Preview
- Renders template HTML into an iframe via `writeResumeFrame()`
- Pagination via `HFPaginate` (shared with export page)
- Google-Docs-style page sheets

---

## 8. Templates (`js/templates.js`)

### Key Functions
- `renderTemplate(templateId, resume, mini, accent, marginsKey)` (line 1239) -- returns HTML string for a template
- `writeResumeFrame(frame, bodyHTML, pageWidth)` (line 1289) -- writes HTML into an iframe
- `fitDocToOnePage(doc, pageH)` (line 1305) -- auto-shrink to fit one page
- `window.HFPaginate` (line 1484) -- shared pagination (page breaks, overflow)

Templates are pure HTML/CSS rendered into iframes. No React, no shadow DOM.

---

## 9. Worker API (`worker/worker.js`)

### All Routes (lines 130-179)
```
POST /auth/signup              POST /auth/login             POST /auth/google
GET  /me                       GET  /me/sync                GET  /status
GET  /promo/earlybird          POST /pageview               POST /track
POST /demo/session
GET  /resume                   POST /resume
GET  /profile                  POST /profile
POST /attribution              POST /onboarding-answers
GET  /consent/config           GET  /consent                POST /consent
GET  /testimonial              POST /testimonial            GET  /admin/testimonials
GET  /jobs                     POST /jobs
POST /downloads/increment
POST /stripe/checkout          POST /stripe/portal          POST /stripe/webhook
POST /feedback                 GET  /feedback/list
GET  /admin/analytics          GET  /admin/users            POST /admin/users/delete
POST /admin/ai-disable         POST /admin/maintenance      POST /admin/admin-access
POST /admin/test-win-nudge     GET  /admin/excluded-ips
POST /referral/code            GET  /referral/stats
POST /interview-win            GET  /interview-wins
GET  /auth/gdrive/start        GET  /auth/gdrive/callback   POST /export-gdoc
GET  /job-search
POST /student/claim
GET  /site/config              POST /site/publish           POST /site/unpublish
GET  /ai/stream/<action>       GET  /ai/<action>            POST /ai/<action>
GET  /p/<code>                 (public resume site)
POST /unsubscribe
POST /mcp                      (MCP protocol endpoint)
```

### AI Endpoints (`/ai/<action>`)
Dispatches to `aiDispatch()`. Actions include: `tailor`, `ats`, `analysis`, `modernize`, `cover-letter`, `interview`, `coach`, `match`, `job-search`, `skill-gap`, `salary`, `brag-doc`, `first-90-days`, `linkedin-optimize`.

### AI Models
- **Fast:** `@cf/meta/llama-3.1-8b-instruct-fast` -- quick responses
- **Smart:** `@cf/meta/llama-4-scout-17b-16e-instruct` -- complex analysis

### Rate Limiting
- 120 req/min global
- 10/min auth endpoints
- 20/min AI endpoints
- Per-account daily AI cap (abuse protection only, high ceiling)

### KV Data Shape
- `user:<email>` -- user record (password hash, plan, trials, features, activity)
- `resume:<email>` -- single cloud resume
- `jobs:<email>` -- job tracker data
- `feedback:<timestamp>` -- user feedback
- `stats:ai:total` / `stats:ai:<action>` -- AI usage counters
- `airate:<email>:<date>` -- daily AI rate limit
- `system:*` -- system flags (maintenance, AI disabled)

### Secrets (set via `wrangler secret put`)
- `JWT_SECRET` -- token signing
- `STRIPE_SECRET_KEY` -- Stripe API (dormant)
- `STRIPE_WEBHOOK_KEY` -- webhook verification
- `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` -- superadmin login
- `ADMIN_PASSWORD` -- built-in admin account

### Staging
- Deploy: `cd worker && npx wrangler deploy --env staging`
- Separate KV namespace (isolated from prod)
- `ALLOWED_ORIGIN = "*"` (any origin)
- Stripe test-mode keys

---

## 10. Deployment

### Frontend (GitHub Pages)
1. Push to `main` branch
2. GitHub Pages auto-deploys
3. Custom domain: `appliohq.com` (via CNAME file)

### Worker (Cloudflare)
```bash
cd worker && npx wrangler deploy           # production
cd worker && npx wrangler deploy --env staging  # staging
```

### Convention
After every commit, push to `origin main` automatically. If `worker/` files changed, also deploy the worker.

---

## 11. Plan/User State (`js/plan.js`)

```javascript
// Key globals
window.CURRENT_USER   // hydrated from localStorage cache, refreshed via /me
window.loadCurrentUser()  // fetches /me, handles 401/403
window.isPaid()       // returns CURRENT_USER.isPaid
window.isFree()       // returns false (everything is free)
window.canUseAi()     // always returns true
window.trialsLeft()   // returns Infinity
```

Session expiry: `plan.js` monkey-patches `window.fetch` to detect 401/403 responses and clean up the token.

---

## 12. Notifications (`js/notify.js`)

```javascript
toast(message, { type, duration })                    // bottom-right slide-in
notify({ title, body, copyable })                     // center modal with OK
confirmDialog({ title, body, confirmText, danger })   // Promise<bool>
window.aiLoading(text)                                // full-screen AI loading overlay (dotted globe)
window.aiLoadingDone()                                // removes overlay
```

---

## 13. Conventions & Rules

### Code
- Vanilla HTML/CSS/JS. No build step. No frameworks.
- Simplest working solution. No over-engineering.
- Read the file before modifying it. Never edit blind.
- No error handling for scenarios that cannot happen.
- Three similar lines > premature abstraction.

### Formatting
- No em dashes, smart quotes, or decorative Unicode. Plain hyphens and straight quotes only.
- Code output must be copy-paste safe.

### Product
- **Applio is 100% free.** All traces of paid plans removed from UI. Billing code dormant.
- **Never put social proof or interview counters on the landing page without asking.**
- Don't publicly advertise security internals.
- CORS errors on localhost are expected (Worker is origin-locked to appliohq.com).

### Git
- After committing, push to `origin main` automatically.
- If `worker/` changed, also deploy the worker.
- Commit style: imperative, concise (see recent commits for examples).

---

## 14. Known Technical Debt

1. **Inline styles:** ~180 inline `style=` in `editor.js` + 14 JS files that inject `<style>` blocks. Should migrate to `css/styles.css` classes over time.
2. **Two scoring engines:** `calculateHealthScore` (health-badge.js:63) and `_resumeHealth` (editor.js:317) were unified in Phase 4 but verify they stay in sync.
3. **Light mode:** functional but less polished than dark. Some accent-tinted surfaces may need tweaking.
4. **Dead code:** `success.html` (billing success page), some billing-related UI paths in acctcenter -- dormant but present.
5. **Intermittent viewport gap:** defensive CSS fix applied (html background + min-height) but root cause of intermittent black bar at bottom not fully identified.
6. **Google OAuth:** client ID is empty in config -- Google sign-in is not active.

---

## 15. Recent Work (as of Oct 2026)

Recent commits show a completed 6-phase product rework:
- Phase 1: Design system foundation (tokens, components)
- Phase 2: Unified app shell and navigation
- Phase 3: Editor overhaul (sidebar flow, unified AI tools, apply model)
- Phase 4: One score + one AI identity
- Phase 5: Onboarding consolidation
- Phase 6: Light-mode QA pass

Post-rework fixes: multi-resume storage, dashboard management, font picker, preview improvements, export page fix, dotted globe spinner, viewport gap fix.
