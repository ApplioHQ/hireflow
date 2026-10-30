# Agent router: 5 proposed improvements

Scope: `agent_router/` only (router.py, cli.py, app/server.py). This is a plan, not an
implementation — each item below is a candidate task for tasks.md.

## 1. tasks.md writes are not atomic

`write_row` and `add_task` both call `path.write_text(...)` directly. `tasks_lock`
(fcntl flock on `.tasks.lock`) serializes writer-vs-writer, but no reader — `read_tasks`,
`pick_task`, `Shell.rows`, `App.rows`, `App.snapshot` — takes that lock. `write_text`
truncates the file before writing the new contents, so a reader (CLI, app, or a second
router invocation) that opens the file in that window can see a truncated or empty
table, which trips `REQUIRED_COLUMNS` and raises `SystemExit`, or silently loses rows.

This matters specifically because the code's own comment says the lock exists to
"serialize edits ... across threads and processes (the app, the CLI, the router)" — three
separate long-running processes are expected to touch this file concurrently.

Fix: write to a temp file in the same directory and `os.replace()` it over `tasks.md`
(and take `tasks_lock` around reads too, or at least make the write atomic so a reader
without the lock never observes a partial file).

## 2. Stale `in_progress` tasks require manual recovery

A task row only has `id/task/status/owner/notes` — no timestamp or PID. If the router
process is killed externally (crash, `kill -9`, laptop sleep, power loss) while a task is
`in_progress`, every future run refuses to start (`pick_task` raises `SystemExit` telling
the user to hand-edit tasks.md) and the app's worker raises the same for any relay/non-relay
job. There's no way to tell, from tasks.md alone, whether an `in_progress` row is a real
run or an orphan from a crash hours ago.

Fix: record a start timestamp (and ideally the PID) when a row is marked `in_progress`.
Let the router/app detect "no process running past `agent_timeout` + a buffer" and either
auto-reclaim the row to `blocked` with a clear reason, or surface a one-click "this looks
stuck since <time> — reset?" affordance in the app instead of requiring a manual tasks.md
edit every time.

## 3. Relay turns never resume the agent's own session

`App.run_job` resumes a session on reply (`thread.get("session_id")`), but
`App.run_relay` never passes a `session_id` into `router.execute`, and never feeds a
turn's resulting session back into the next turn for the same agent. Every build/review/fix
turn re-sends the full prompt (system prompt + task + context.md + handoff.md + tasks.md +
diff) from scratch, even though the agent CLI already supports resuming its own prior
turn cheaply.

This is a real cost/latency cost: `relay_max_turns` defaults to 4, so a single relay task
can mean up to 4 full-context cold starts instead of 4 short, resumed turns.

Fix: track `session_id` per agent (lead/reviewer) across a relay run and pass it into
`router.execute`/`run_agent` on that agent's subsequent turns, falling back to a fresh
session only on the agent's first turn or an owner change (matching the existing
non-relay reply logic in `App.run_job`).

## 4. No visibility into agent spend

`parse_line` already extracts `total_cost_usd` / token counts from each agent's `result`
event and renders them as "[cost $x.xx]" inline in the streamed output, but nothing
aggregates that figure anywhere durable — not in the log file's header, not in
`snapshot()`/the thread JSON the app serves to the UI. The only record is buried inside
the truncated (`TAIL = 4000` chars) output blob.

This matters because relay mode can multiply cost by up to `relay_max_turns` agent
invocations per task, with no running total to notice before it becomes a surprise.

Fix: parse the cost/token figure out of the agent's final `result` event in `run_agent`,
return it from `execute`, store it on the task's log header and thread entry, and show a
per-task and session-running total in the CLI (`/tasks`) and the app.

## 5. Unbounded in-memory output buffering during a run

In `run_agent`, every parsed line is appended to `shown` for the full duration of the
run and only truncated (`tail()`, last 4000 chars) once the process exits. A verbose or
looping agent — within the existing 1800s `agent_timeout` — can still emit output large
enough to be a real memory footprint before that truncation ever kicks in, since nothing
bounds `shown` while the run is in progress.

Fix: cap `shown` while streaming (e.g., keep a bounded deque or drop/collapse the middle
once a size threshold is hit) so memory use during a run is bounded independent of how
chatty the agent is, instead of only bounding the output used afterward.
