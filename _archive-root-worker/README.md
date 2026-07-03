# Archived: stale repo-root worker (DO NOT DEPLOY)

These files used to sit at the repo root and caused a production outage on
2026-07-03 when `npx wrangler deploy` was run from the repo root — it deployed
this **stale, divergent** worker over the real production API `hireflow-api`,
which wiped admin/superadmin and pointed at the wrong config.

- `worker.js` — an old/divergent copy. It lacks the superadmin + `/admin/*`
  API that `admin.html` depends on, and used placeholder vars.
- `wrangler.toml.disabled` — the old root config (renamed so it can't be
  deployed). Had placeholder `ADMIN_EMAIL` / Stripe price IDs.

## The real worker lives in `../worker/`
Deploy ONLY from there:

```
cd worker && npx wrangler deploy              # production
cd worker && npx wrangler deploy --env staging  # staging
```
…or from the repo root: `npm run deploy` / `npm run deploy:staging`.

If you ever need a feature that only exists in this old `worker.js`, port it
into `../worker/worker.js` deliberately — do not deploy this file.
