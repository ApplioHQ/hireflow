# HireFlow

AI-powered resume builder. Static frontend on GitHub Pages, Cloudflare Worker for auth + AI.

See [SETUP.md](./SETUP.md) for full deployment instructions.

## Quick start

```bash
# 1. Deploy the Worker
cd worker
wrangler kv namespace create HIREFLOW_KV   # paste id into wrangler.toml
wrangler secret put JWT_SECRET             # paste a random hex string
wrangler deploy

# 2. Edit js/config.js with your Worker URL.

# 3. Test locally
cd ..
python3 -m http.server 8000

# 4. Push to GitHub, enable Pages, done.
```

## Features

- Landing page + auth (sign up / sign in)
- Resume editor with 15 sections (personal, experience, education, skills, projects, certifications, awards, leadership, volunteer, publications, etc.)
- 9 template options with live preview
- Customize: accent colors, fonts, spacing, toggle sections
- AI: improve writing, suggest skills, tailor to job, ATS scoring, full resume analysis, parse uploaded resume
- Job application tracker
- Interview prep (AI-generated questions)
- Export as PDF (via browser print), HTML, or plain text
- Resume version history (last 10 saves)

## Stack

- Vanilla HTML/CSS/JS — no build step
- Cloudflare Worker — auth, AI proxy, resume storage
- Cloudflare KV — user accounts (hashed pw) and resume JSON
- Cloudflare Workers AI — `@cf/moonshotai/kimi-k2.7-code` (fast) + `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` (smart)

## Roles & contribution convention (READ BEFORE ADDING FEATURES)

There are two privileged roles: **ADMIN** and **SUPERADMIN** (`role: "admin"` and `role: "super"`).

**All NEW features and updates must work for BOTH ADMIN and SUPERADMIN.** Do not lock a new
capability to SUPERADMIN only. When gating on the backend, use `requireAdmin(req, env)` (allows
both roles) — NOT `requireAdmin(req, env, true)` (super-only). On the frontend, gate with
`ROLE === 'admin' || ROLE === 'super'`, not `ROLE === 'super'` alone.

**Existing SUPERADMIN-only controls stay SUPERADMIN-only** — do not loosen them. As of now these
remain super-only on purpose: delete user, disable AI globally, take site offline (maintenance),
and the "ADMIN tier access" toggle. Everything else, including **Site Analytics**, is available to
both roles.

> Why: this repo gets dropped into other Claude sessions for further edits. Without this note, an
> agent may default new features to SUPERADMIN only. Treat ADMIN + SUPERADMIN as the default
> audience for any new admin feature unless explicitly told otherwise.
