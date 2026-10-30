# Agent decisions log

Durable decisions that future tasks depend on: library choices, API contracts, naming conventions.
Append one line per decision, newest last. Format: `- YYYY-MM-DD (agent, task ID): decision`.
Full project architecture lives in /CONTEXT.md and project rules in /CLAUDE.md; don't duplicate them here.

- 2026-10-30 (setup): Claude Code and Hermes coordinate through agent_state/ only; agent_router/router.py assigns tasks and marks them done after `node --check` passes on all tracked .js files.
