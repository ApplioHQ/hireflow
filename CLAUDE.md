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
