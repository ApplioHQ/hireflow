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
- Cloudflare Workers AI — Llama 3.1 8B Instruct
