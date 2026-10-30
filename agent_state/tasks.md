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
