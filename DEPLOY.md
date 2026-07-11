# Applio / appliohq.com, Deploy & Ops Runbook

There are **two independent deploy targets**. They are NOT the same and do not
deploy each other:

| Part | Lives in | Hosted by | How it deploys |
|------|----------|-----------|----------------|
| **Front-end** (`index.html`, `css/`, `js/`, …) | repo root | **GitHub Pages** (`appliohq.com`) | Automatically on `git push` to `main`. `.nojekyll` keeps the build passing. |
| **API** (`worker.js`) | **`worker/`** | **Cloudflare Worker** `hireflow-api` | Manually, via `wrangler`, see below. |

> Pushing to GitHub deploys the **front-end only**. The API never deploys from
> GitHub, you must run `wrangler` for that.

---

## Deploying the API (worker)

**Always deploy from `worker/`.** The repo root has **no** worker config on
purpose (the old one caused an outage and is quarantined in
`_archive-root-worker/`).

```bash
# from the repo root:
npm run deploy            # → production  (KV 84f236c3, real Stripe prices)
npm run deploy:staging    # → staging     (KV d89e0b29, test Stripe prices)

# or directly:
cd worker && npx wrangler deploy
cd worker && npx wrangler deploy --env staging
```

Before a production deploy, sanity-check bindings:
```bash
cd worker && npx wrangler deploy --dry-run        # shows bindings/vars, uploads nothing
```

### Rollback (proven, this saved us on 2026-07-03)
```bash
cd worker && npx wrangler deployments list        # find a known-good version id
cd worker && npx wrangler rollback <version-id>   # instant restore, reversible
```

---

## Never test against production

Load / rate-limit / signup tests must target **staging or local**, never prod.
The production KV namespace is `84f236c3…`; the staging one is `d89e0b29…`
(created 2026-07-03, isolated). Point any test script's base URL at the staging
worker (`hireflow-api-staging.pritamavuthu7.workers.dev`) or `wrangler dev`.

---

## Required secrets (per environment)

Secrets are set with `npx wrangler secret put NAME` (from `worker/`) and are
**never** overwritten by `wrangler deploy`. Current production secrets:

| Secret | Purpose |
|--------|---------|
| `JWT_SECRET` | signs/verifies login tokens |
| `STRIPE_SECRET_KEY` | Stripe API calls (`sk_live_…` prod / `sk_test_…` staging) |
| `STRIPE_WEBHOOK_KEY` | verifies Stripe webhook signatures (`whsec_…`), code reads `env.STRIPE_WEBHOOK_KEY` |
| `SUPERADMIN_EMAIL` | superadmin login email |
| `SUPERADMIN_PASSWORD` | superadmin login password |
| `ADMIN_PASSWORD` | password for the built-in `ADMIN` account |

Set staging copies with `--env staging` (use Stripe **test** keys there).

---

## Backups

Production KV holds real users (emails + password hashes) and resumes. Back it
up regularly and store the file **outside** the repo (never commit, it is PII):
```bash
npm run backup     # → backups/kv-backup-<timestamp>.json  (gitignored)
```
