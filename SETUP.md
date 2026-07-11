# HireFlow, Setup Guide

Your site is split into two pieces:

1. **Static frontend** (HTML/CSS/JS) → hosted free on **GitHub Pages**
2. **Cloudflare Worker** (auth + AI + storage) → hosted free on **Cloudflare**

You'll deploy the Worker first, then point the frontend at it, then push to GitHub.

---

## Part 1, Cloudflare Worker

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Create the KV namespace

This is where users and resumes are stored (replaces your "JSON file" idea, much safer).

```bash
cd worker
wrangler kv namespace create HIREFLOW_KV
```

Wrangler prints something like:

```
[[kv_namespaces]]
binding = "HIREFLOW_KV"
id = "abc123def456..."
```

Copy the `id` into `worker/wrangler.toml` (replace `PASTE_KV_ID_HERE`).

### 3. Set the JWT secret

```bash
# Generate a random secret
openssl rand -hex 32

# Then set it on Cloudflare:
wrangler secret put JWT_SECRET
# Paste the hex string when prompted.
```

### 4. Set your GitHub Pages origin

Open `worker/wrangler.toml` and update `ALLOWED_ORIGIN` to your real GitHub Pages URL, e.g.:

```toml
[vars]
ALLOWED_ORIGIN = "https://rakesh.github.io"
```

(or `https://rakesh.github.io/Hireflow` if you're using a project page, use just the origin part, no path.)

### 5. Deploy

```bash
wrangler deploy
```

You'll get a URL like:

```
https://hireflow-api.YOUR-SUBDOMAIN.workers.dev
```

Copy this, you need it next.

### 6. Workers AI

Workers AI is enabled automatically by the `[ai] binding = "AI"` line in `wrangler.toml`. The free tier gives you **10,000 neurons/day** which is plenty for personal use. The model used is `@cf/meta/llama-3.1-8b-instruct`.

---

## Part 2, Frontend

### 1. Point the frontend at your Worker

Open `js/config.js` and replace the placeholder with your Worker URL:

```js
window.HIREFLOW_CONFIG = {
  API_URL: "https://hireflow-api.YOUR-SUBDOMAIN.workers.dev"
};
```

### 2. Test locally

From the project root:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. Sign up → you should be redirected to the editor.

### 3. Push to GitHub

```bash
cd /Users/rakesh/Hireflow   # or wherever the folder lives
git init
git add .
git commit -m "Initial HireFlow site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/hireflow.git
git push -u origin main
```

### 4. Turn on GitHub Pages

In the repo on github.com:

- **Settings → Pages**
- **Source:** Deploy from a branch
- **Branch:** `main` / `/` (root)
- Save.

Your site goes live at `https://YOUR-USERNAME.github.io/hireflow/` in 1–2 minutes.

### 5. Update CORS

Go back to `worker/wrangler.toml`, make sure `ALLOWED_ORIGIN` matches your real Pages URL, and redeploy:

```bash
cd worker
wrangler deploy
```

---

## File structure

```
Hireflow/
├── index.html          Landing page
├── login.html          Sign in / sign up
├── editor.html         Resume builder (main app)
├── jobs.html           Job tracker
├── interview.html      AI interview prep
├── export.html         PDF / HTML / TXT export
├── css/styles.css      All styling
├── js/
│   ├── config.js       Worker URL, edit this!
│   ├── auth.js         Sign-in / sign-up logic
│   └── editor.js       Editor app
├── worker/
│   ├── worker.js       The Cloudflare Worker
│   └── wrangler.toml   Worker config
├── SETUP.md            This file
└── README.md
```

---

## What lives where

| Data | Where | Why |
|---|---|---|
| Email + password hash | Cloudflare KV (`user:<email>`) | Hashed with PBKDF2-SHA256 (100k iterations). Never in GitHub. |
| Resume content | Cloudflare KV (`resume:<email>`) + browser localStorage | KV for cross-device sync, localStorage for offline editing |
| Job tracker | Browser localStorage only | Simple, fast, private |
| AI calls | Cloudflare Workers AI (Llama 3.1 8B) | Free tier, no external API key needed |

---

## Troubleshooting

**"AI failed" in the editor**
→ Check `wrangler tail` for logs. Most common issue: you exceeded the daily Workers AI free tier (10k neurons).

**CORS error in browser console**
→ `ALLOWED_ORIGIN` in `wrangler.toml` doesn't match your GitHub Pages URL exactly. Redeploy after fixing.

**"Invalid token"**
→ Clear localStorage in browser DevTools and sign in again. Tokens expire after 30 days.

**Signup says "Account already exists"**
→ The email is already in KV. You can wipe it: `wrangler kv key delete --binding=HIREFLOW_KV "user:rakesh@example.com"`

---

## Cost

Everything used here is on the **free tier**:

- **GitHub Pages:** free for public repos, unlimited bandwidth (within fair use)
- **Cloudflare Workers:** 100,000 requests/day free
- **Cloudflare KV:** 100,000 reads/day, 1,000 writes/day free
- **Workers AI:** 10,000 neurons/day free (~1,000+ AI requests)

So unless your site gets seriously popular, you'll pay $0.
