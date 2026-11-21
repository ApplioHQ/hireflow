# Applio - Project Rules

## Approach
- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- No sycophantic openers or closing fluff.
- Do not guess APIs, versions, flags, or package names. Verify by reading code or docs first.

## Code Rules
- Simplest working solution. No over-engineering.
- No abstractions for single-use operations.
- No speculative features or "you might also want..."
- Read the file before modifying it. Never edit blind.
- No error handling for scenarios that cannot happen.
- Three similar lines is better than a premature abstraction.

## Output
- Return code first. Explanation after, only if non-obvious.
- No inline prose in code. Comments only where logic is unclear.
- No boilerplate unless explicitly requested.

## Formatting
- No em dashes, smart quotes, or decorative Unicode.
- Plain hyphens and straight quotes only.
- Code output must be copy-paste safe.

## Review and Debug
- State the bug. Show the fix. Stop.
- Never speculate about a bug without reading the relevant code first.
- If cause is unclear: say so. Do not guess.

## Project-Specific
- Vanilla HTML/CSS/JS. No build step. No frameworks.
- Cloudflare Worker backend. KV for storage.
- Auto-deploys via GitHub Pages on push to main.
- CORS errors on localhost are expected (Worker is origin-locked to appliohq.com).
- Applio is 100% free. All traces of paid plans removed.
- Never put social proof or interview counters on the landing page without asking.
- Don't publicly advertise security internals.
- After committing, push to origin main automatically. Also deploy worker if worker/ changed.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
