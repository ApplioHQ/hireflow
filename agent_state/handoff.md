Task: Add a short "Syntax check" section to DEPLOY.md that documents the `npm run check` command added in T1 (read handoff.md for exact usage)
Agent: hermes
Status: done
What changed: Added a "Syntax check" section to DEPLOY.md documenting the `npm run check` command, which runs `node --check` on every git-tracked .js file via scripts/check-syntax.sh and exits non-zero on any failure.
Files touched: DEPLOY.md
Tests: Ran `npm run check` — exited 0 across all git-tracked .js files.
For the next agent: T3 (sitemap.xml audit) can proceed — no dependencies on this change.
Router: check passed, marked done 2026-10-30 03:02
