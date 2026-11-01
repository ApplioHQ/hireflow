# Task queue

The router reads and writes the table below. Columns:
- Status: pending | in_progress | done | blocked
- Owner: claude | hermes | unassigned. A pending task runs only once it has an owner (or with `--agent`).
- Edit Task / Owner / Notes by hand to add or route work. Leave Status to the router, except to reset a blocked task to pending.

| ID | Task | Status | Owner | Notes |
|----|------|--------|-------|-------|
| T1 | Add scripts/check-syntax.sh that runs `node --check` on every git-tracked .js file and exits non-zero on any failure; add it to package.json as `npm run check` | done | claude | done 2026-10-30 02:57, see log/ |
| T2 | Add a short "Syntax check" section to DEPLOY.md that documents the `npm run check` command added in T1 (read handoff.md for exact usage) | done | hermes | done 2026-10-30 03:02, see log/ |
| T3 | Audit sitemap.xml for URLs whose .html file no longer exists in the repo and remove them | pending | unassigned | needs an owner |
| T4 | Add a short comment block at the top of js/config.js explaining what each setting does | done | claude | done 2026-10-30 13:24, see log/ |
| T5 | plan 5 improvements | done | claude+hermes | done 2026-10-30 14:19, see log/ |
| T6 | go through our entire seo and find thing to improve | done | auto | answered by hermes 2026-10-30 15:35 |
| T7 | what are all the skills that i downloaded onto claude | done | hermes | done 2026-10-30 16:00, see log/ |
| T8 | claude tell hermes all the skills i downloaded to you so hermes can do it too | done | claude+hermes | done 2026-10-31 00:33, see log/ |
| T9 | do a full geo audit | done | claude+hermes | done 2026-10-30 17:30, see log/ |
| T10 | what are cookies in a website. tldr | done | chatgpt | done 2026-11-01 01:56, see log/ |
