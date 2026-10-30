#!/usr/bin/env python3
"""Hand the next task in agent_state/tasks.md to Claude Code or Hermes, gate it, record it.

Usage:
  python3 agent_router/router.py                     run the next pending task that has an owner
  python3 agent_router/router.py --task T2           run a specific task
  python3 agent_router/router.py --task "fix X" --agent claude   add a new task and run it
  python3 agent_router/router.py --dry-run           print the prompt only, change nothing
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import tomllib
from pathlib import Path

DEFAULT_CONFIG = Path(__file__).resolve().parent / "config.toml"
REQUIRED_COLUMNS = ["id", "task", "status", "owner", "notes"]
TAIL = 4000  # chars of agent/check output kept in handoff and logs

SYSTEM_PROMPT = """\
You are working on the Applio codebase alongside another AI agent. You coordinate only
through the files in agent_state/. The router that started you assigns tasks and checks results.

Before starting the task:
1. Read agent_state/context.md for decisions and constraints (included below).
2. Read agent_state/handoff.md for what the last agent (you or the other one) just finished
   and any notes left for you (included below).
3. Do not redo work already marked done in agent_state/tasks.md (included below).
4. Follow the project rules in CLAUDE.md and use CONTEXT.md for architecture.

While working:
- Stay inside the scope of the assigned task. If you notice unrelated issues, note them in
  handoff.md instead of fixing them, so they become their own task.
- Do not commit, push, or deploy. Leave changes uncommitted for human review. This overrides
  any auto-commit or auto-push rule in CLAUDE.md.

When you finish:
1. Overwrite agent_state/handoff.md in exactly this shape:
   Task: <task text>
   Agent: <your agent name>
   Status: done
   What changed: <one or two sentences>
   Files touched: <comma-separated paths>
   Tests: <what you ran and the result, or "none">
   For the next agent: <anything the next agent needs to know>
2. If you made a decision future work depends on (a library choice, an API contract, a naming
   convention), append one line to agent_state/context.md:
   - <YYYY-MM-DD> (<agent>, <task ID>): <decision>
3. Do not edit agent_state/tasks.md. The router marks the task done after checks pass.
"""


def load_config(path):
    path = Path(path).resolve()
    cfg = tomllib.loads(path.read_text())
    cfg["repo"] = (path.parent / cfg.get("repo", "..")).resolve()
    cfg["state"] = cfg["repo"] / cfg.get("state_dir", "agent_state")
    return cfg


def read_tasks(path):
    """Return (lines, header, rows). Each row is a dict keyed by lowercased column name plus 'line'."""
    lines = path.read_text().splitlines()
    header, rows = None, []
    for i, line in enumerate(lines):
        if not line.lstrip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if header is None:
            header = [c.lower() for c in cells]
            continue
        if set("".join(cells)) <= set("-: "):
            continue
        rows.append({"line": i, **dict(zip(header, cells))})
    missing = [c for c in REQUIRED_COLUMNS if c not in (header or [])]
    if missing:
        raise SystemExit(f"{path}: task table is missing columns: {', '.join(missing)}")
    return lines, header, rows


@contextlib.contextmanager
def tasks_lock(path):
    """Serialize edits to tasks.md across threads and processes (the app, the CLI, the router)."""
    with open(path.parent / ".tasks.lock", "w") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        yield


def write_row(path, task_id, **fields):
    with tasks_lock(path):
        lines, header, rows = read_tasks(path)
        row = next(r for r in rows if r["id"] == task_id)
        for key, value in fields.items():
            row[key] = str(value).replace("|", "/").replace("\n", " ")
        lines[row["line"]] = "| " + " | ".join(row.get(h, "") for h in header) + " |"
        path.write_text("\n".join(lines) + "\n")


def add_task(path, text, owner):
    text = " ".join(text.split())  # one table row: no newlines
    with tasks_lock(path):
        lines, header, rows = read_tasks(path)
        nums = [int(r["id"][1:]) for r in rows if r["id"][:1] == "T" and r["id"][1:].isdigit()]
        task_id = f"T{max(nums, default=0) + 1}"
        values = {"id": task_id, "task": text, "status": "pending", "owner": owner, "notes": "added via --task"}
        row = "| " + " | ".join(values.get(h, "").replace("|", "/") for h in header) + " |"
        insert_at = rows[-1]["line"] + 1 if rows else len(lines)
        lines.insert(insert_at, row)
        path.write_text("\n".join(lines) + "\n")
    return task_id


def pick_task(cfg, tasks_path, wanted, agent_override):
    """Return (row, agent) or exit with a message explaining why nothing can run."""
    _, _, rows = read_tasks(tasks_path)
    busy = [r["id"] for r in rows if r["status"] == "in_progress"]
    if busy:
        raise SystemExit(f"{', '.join(busy)} is in_progress. Wait for it, or set its status back "
                         "to pending (or blocked) in tasks.md if a previous run crashed.")
    agents = cfg["agents"]

    if wanted:
        row = next((r for r in rows if r["id"] == wanted), None)
        if row is None:
            if not agent_override:
                raise SystemExit("A new task needs --agent claude or --agent hermes.")
            new_id = add_task(tasks_path, wanted, agent_override)
            _, _, rows = read_tasks(tasks_path)
            row = next(r for r in rows if r["id"] == new_id)
            print(f"Added {new_id} to tasks.md")
        elif row["status"] == "done":
            raise SystemExit(f"{wanted} is already done.")
    else:
        pending = [r for r in rows if r["status"] == "pending"]
        if not pending:
            raise SystemExit("No pending tasks.")
        row = next((r for r in pending if agent_override or r["owner"] in agents), None)
        if row is None:
            raise SystemExit("Pending tasks have no owner. Set Owner to one of "
                             f"{', '.join(agents)} in tasks.md, or pass --agent.")

    agent = agent_override or row["owner"]
    if agent not in agents:
        raise SystemExit(f"{row['id']} has owner '{agent}'. Use one of: {', '.join(agents)}.")
    return row, agent


def build_prompt(row, agent, state):
    def section(name):
        p = state / name
        return f"===== agent_state/{name} =====\n{p.read_text().strip() if p.exists() else '(missing)'}\n"

    return (
        f"{SYSTEM_PROMPT}\n"
        f"===== YOUR TASK =====\nTask ID: {row['id']}\nTask: {row['task']}\n"
        f"Notes: {row.get('notes') or '(none)'}\nYou are: {agent}\n\n"
        f"{section('context.md')}\n{section('handoff.md')}\n{section('tasks.md')}"
    )


def say(*args):
    """Router progress output. Front ends that draw their own output (the CLI) replace this."""
    print(*args, flush=True)


def tool_line(name, args, repo):
    arg = ""
    if isinstance(args, dict):
        for key in ("file_path", "path", "command", "pattern", "url", "query", "description"):
            if args.get(key):
                arg = str(args[key])
                break
    for prefix in (f"{repo}/", f"{Path(repo).resolve()}/"):
        if arg.startswith(prefix):
            arg = arg[len(prefix):]
            break
    arg = arg.replace("\n", " ")
    if len(arg) > 100:
        arg = arg[:97] + "..."
    return f"\n> {name} {arg}".rstrip() + "\n"


def parse_line(line, repo):
    """Turn one line of stream-json from Claude Code or Hermes into readable text."""
    try:
        event = json.loads(line)
    except ValueError:
        return line
    if not isinstance(event, dict):
        return line
    kind = event.get("type")
    if kind == "assistant":  # Claude Code: whole message blocks
        parts = []
        for block in event.get("message", {}).get("content", []):
            if block.get("type") == "text":
                parts.append(block.get("text", "") + "\n")
            elif block.get("type") == "tool_use":
                parts.append(tool_line(block.get("name"), block.get("input"), repo))
        return "".join(parts)
    if kind == "text":  # Hermes: text arrives in small chunks
        return event.get("text", "")
    if kind == "tool_use":  # Hermes
        return tool_line(event.get("name"), event.get("input"), repo)
    if kind == "result":
        if "total_cost_usd" in event:
            return f"\n[cost ${event['total_cost_usd']:.2f}]\n"
        if isinstance(event.get("tokens"), dict):
            return f"\n[{event['tokens'].get('total', '?')} tokens]\n"
    return ""


def feed(pipe, text):
    try:
        pipe.write(text)
        pipe.close()
    except (BrokenPipeError, OSError):
        pass


def session_in(line):
    """Session ID an agent reports, from a JSON event or Hermes's 'session_id: ...' line."""
    if line.startswith("session_id:"):
        return line.split(":", 1)[1].strip() or None
    try:
        event = json.loads(line)
    except ValueError:
        return None
    return (event.get("session_id") or None) if isinstance(event, dict) else None


def run_agent(cfg, agent, prompt, echo=None, session_id=None, control=None):
    """Run the agent CLI from the repo root, streaming its output to echo.

    session_id resumes an earlier session. control is a dict another thread can use to stop the run:
    it gets control["proc"], and setting control["stopped"] = True before killing marks it a user stop.
    Returns (exit_code, output, session_id).
    """
    spec = cfg["agents"][agent]
    command = list(spec["command"])
    if session_id:
        command += [part.replace("{session_id}", session_id) for part in spec.get("resume", [])]
    parse = spec.get("format") == "stream-json"
    uses_file = any("{prompt_file}" in part for part in command)
    timeout = cfg.get("agent_timeout", 1800)
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
        f.write(prompt)
    cmd = [part.replace("{prompt_file}", f.name) for part in command]
    try:
        proc = subprocess.Popen(cmd, cwd=cfg["repo"], text=True, bufsize=1,
                                stdin=subprocess.DEVNULL if uses_file else subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    except FileNotFoundError:
        os.unlink(f.name)
        return 127, f"command not found: {cmd[0]}", session_id
    if control is not None:
        control["proc"] = proc

    timed_out = []
    timer = threading.Timer(timeout, lambda: (timed_out.append(True), proc.kill()))
    timer.start()
    if not uses_file:
        threading.Thread(target=feed, args=(proc.stdin, prompt), daemon=True).start()
    shown, new_session = [], None
    try:
        for line in proc.stdout:
            new_session = session_in(line) or new_session
            if parse and line.startswith(("Session:", "session_id:")):
                continue  # Hermes session bookkeeping, already captured
            text = parse_line(line, cfg["repo"]) if parse else line
            if text:
                shown.append(text)
                if echo:
                    echo(text)
        code = proc.wait()
    except KeyboardInterrupt:
        proc.kill()
        proc.wait()
        code = 130
        shown.append("\n[stopped by user]\n")
    finally:
        timer.cancel()
        proc.stdout.close()
        os.unlink(f.name)
    if control is not None and control.get("stopped"):
        code = 130
        shown.append("\n[stopped by user]\n")
    session = new_session or session_id
    if timed_out:
        return 124, f"agent timed out after {timeout}s\n" + "".join(shown), session
    return code, "".join(shown), session


def run_check(cfg):
    cmd = cfg.get("check_command")
    if not cmd:
        return 0, "(no check_command configured)"
    try:
        p = subprocess.run(cmd, shell=True, cwd=cfg["repo"], capture_output=True, text=True,
                           timeout=cfg.get("check_timeout", 600))
    except subprocess.TimeoutExpired:
        return 124, f"check timed out: {cmd}"
    except KeyboardInterrupt:
        return 130, "check stopped by user"
    return p.returncode, (p.stdout + p.stderr).strip() or "(no output)"


def git_status(repo):
    """Changed paths with a content hash, so a second edit to an already-modified file still shows up."""
    p = subprocess.run(["git", "status", "--porcelain", "-uall"], cwd=repo,
                       capture_output=True, text=True)
    if p.returncode != 0:
        return set()
    entries = set()
    for line in p.stdout.splitlines():
        path = Path(repo) / line[3:].split(" -> ")[-1].strip('"')
        digest = hashlib.sha1(path.read_bytes()).hexdigest() if path.is_file() else "-"
        entries.add(f"{line}\t{digest}")
    return entries


def tail(text):
    text = text.strip()
    return text if len(text) <= TAIL else "...\n" + text[-TAIL:]


def reply_prompt(row, agent, text, state, resumed):
    """Prompt for a follow-up on an existing task. A resumed session already has the full context."""
    reply = (f"===== FOLLOW-UP FROM THE USER on {row['id']} =====\n{text.strip()}\n\n"
             "Continue the same task with this in mind. Same rules as before: stay in scope, do not "
             "commit, push or deploy, do not edit agent_state/tasks.md, and when you finish overwrite "
             "agent_state/handoff.md in the same shape and append to agent_state/context.md only for "
             "durable decisions.\n")
    return reply if resumed else build_prompt(row, agent, state) + "\n" + reply


def unique_log_path(state, started, task_id):
    base = state / "log" / f"{started:%Y-%m-%d}-{task_id}"
    path, n = base.with_suffix(".md"), 2
    while path.exists():
        path = Path(f"{base}-{n}.md")
        n += 1
    return path


def run(cfg, wanted=None, agent_override=None, dry_run=False, echo=None):
    tasks_path = cfg["state"] / "tasks.md"
    row, agent = pick_task(cfg, tasks_path, wanted, agent_override)
    prompt = build_prompt(row, agent, cfg["state"])
    if dry_run:
        print(f"[dry run] {row['id']} -> {agent}\n\n{prompt}")
        return 0
    return execute(cfg, row, agent, prompt, echo)["code"]


def execute(cfg, row, agent, prompt, echo=None, session_id=None, control=None, owner=None):
    """Run one agent turn on a task, gate it with the check, and record the result.

    owner is what tasks.md keeps in the Owner column (defaults to agent; relay tasks keep "claude+hermes").
    Returns {"code": 0 or 1, "ok", "session_id", "files", "log", "reason", "check", "output", "stopped"}.
    """
    state = cfg["state"]
    tasks_path, handoff_path, context_path = state / "tasks.md", state / "handoff.md", state / "context.md"
    write_row(tasks_path, row["id"], status="in_progress", owner=owner or agent)
    handoff_before = handoff_path.read_text() if handoff_path.exists() else ""
    context_before = context_path.read_text() if context_path.exists() else ""
    git_before = git_status(cfg["repo"])
    started = dt.datetime.now()

    say(f"{row['id']} -> {agent}: {row['task']}\nRunning {agent}...")
    agent_code, agent_out, session = run_agent(cfg, agent, prompt, echo, session_id, control)
    check_code, check_out = (None, "skipped: agent failed") if agent_code else run_check(cfg)

    changed = sorted({line[3:].split("\t")[0] for line in git_status(cfg["repo"]) - git_before})
    handoff_after = handoff_path.read_text() if handoff_path.exists() else ""
    context_changed = (context_path.read_text() if context_path.exists() else "") != context_before
    wrote_handoff = handoff_after != handoff_before
    ok = agent_code == 0 and check_code == 0
    stamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    files = ", ".join(changed) or "(none detected)"

    reason = ""
    if ok:
        write_row(tasks_path, row["id"], status="done", notes=f"done {stamp}, see log/")
        if wrote_handoff:
            handoff_path.write_text(handoff_after.rstrip() + f"\nRouter: check passed, marked done {stamp}\n")
        else:
            handoff_path.write_text(
                f"Task: {row['task']}\nAgent: {agent}\nStatus: done\n"
                f"What changed: (the agent did not write handoff.md; its final output is below)\n"
                f"Files touched: {files}\nTests: router check passed\n"
                f"For the next agent: review the output below.\n\n{tail(agent_out)}\n"
                f"Router: check passed, marked done {stamp}\n")
    else:
        if agent_code == 130 or check_code == 130:
            reason = "stopped by user"
        elif agent_code:
            reason = f"agent exited {agent_code}"
        else:
            reason = f"check failed (exit {check_code})"
        write_row(tasks_path, row["id"], status="blocked", notes=f"{reason}, {stamp}")
        detail = check_out if agent_code == 0 else agent_out
        handoff_path.write_text(
            f"Task: {row['task']}\nAgent: {agent}\nStatus: blocked\n"
            f"Reason: {reason}\nFiles touched: {files}\n"
            f"For the next agent: this task is blocked and its changes are uncommitted. "
            f"A human should review before it is reset to pending.\n\n"
            f"Error output:\n{tail(detail)}\n"
            + (f"\nThe agent's own handoff before the failure:\n{handoff_after}\n" if wrote_handoff else "")
            + f"\nPrevious handoff (from the last task, still relevant):\n{handoff_before}")

    (state / "log").mkdir(exist_ok=True)
    log_path = unique_log_path(state, started, row["id"])
    log_path.write_text(
        f"# {row['id']}: {row['task']}\n\n"
        f"- Agent: {agent}\n- Result: {'done' if ok else 'blocked'}\n"
        f"- Started: {started:%Y-%m-%d %H:%M}, finished: {stamp}\n"
        f"- Agent exit code: {agent_code}\n- Check exit code: {check_code}\n"
        f"- Agent wrote handoff.md: {'yes' if wrote_handoff else 'NO'}\n"
        f"- Agent appended to context.md: {'yes' if context_changed else 'no'}\n"
        f"- Files changed: {files}\n\n"
        f"## Handoff\n\n{handoff_path.read_text()}\n"
        f"## Check output\n\n```\n{tail(check_out)}\n```\n\n"
        f"## Agent output\n\n```\n{tail(agent_out)}\n```\n\n"
        f"## Prompt sent\n\n<details>\n\n```\n{prompt}\n```\n\n</details>\n")

    say(f"\n{row['id']}: {'done' if ok else 'BLOCKED'}  (log: {log_path.relative_to(cfg['repo'])})")
    say(f"Files changed: {files}")
    if not wrote_handoff:
        say(f"Warning: {agent} did not write handoff.md; the router wrote one for it.")
    if not ok:
        say(f"\n{tail(check_out if agent_code == 0 else agent_out)}")
    return {"code": 0 if ok else 1, "ok": ok, "session_id": session, "files": changed,
            "log": log_path, "reason": reason, "check": tail(check_out), "output": agent_out,
            "stopped": agent_code == 130 or check_code == 130}


ROUTE_PROMPT = """\
You are the first stop for requests about the Applio codebase (the repo you are in). Another agent,
{coder}, makes all code changes.

Decide what this request needs:
- If doing it requires creating, editing or deleting files in the repo (code, docs, config, tests),
  reply with exactly this one line and nothing else:
  ROUTE: CODE
- Otherwise (a question, an explanation, advice, a plan, a review that changes nothing), answer it
  yourself, clearly and concisely. You may read files to answer. Do not create, edit or delete any
  files, and do not run commands that change anything.
If the request mixes a question with a change, choose ROUTE: CODE.
{conversation}
===== REQUEST =====
{request}
"""

ROUTE_FOLLOWUP = """\
Follow-up from the user. Same rules as before: if it needs files created, edited or deleted, reply with
exactly ROUTE: CODE. Otherwise answer it without changing any files.

{request}
"""

WANTS_CODE = re.compile(r"(?m)^\W*ROUTE:\s*CODE\b")


def route_prompt(request, coder, conversation="", resumed=False):
    if resumed:
        return ROUTE_FOLLOWUP.format(request=request.strip())
    convo = f"\n===== CONVERSATION SO FAR =====\n{conversation.strip()}\n" if conversation.strip() else ""
    return ROUTE_PROMPT.format(coder=coder, conversation=convo, request=request.strip())


def wants_code(output):
    return bool(WANTS_CODE.search(output))


def ask(cfg, row, agent, prompt, echo=None, session_id=None, control=None, owner=None):
    """Let an agent answer without changing files, or hand back ROUTE: CODE.

    No check runs and handoff.md is left alone, since nothing should change. Returns the same shape
    as execute(), plus "routed": True when the agent says the request needs code.
    """
    state = cfg["state"]
    tasks_path = state / "tasks.md"
    write_row(tasks_path, row["id"], status="in_progress", owner=owner or agent)
    git_before = git_status(cfg["repo"])
    started = dt.datetime.now()
    say(f"{row['id']} -> {agent} (answer or route): {row['task']}")
    code, out, session = run_agent(cfg, agent, prompt, echo, session_id, control)
    changed = sorted({line[3:].split("\t")[0] for line in git_status(cfg["repo"]) - git_before})
    stamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    routed = code == 0 and wants_code(out)
    stopped = code == 130
    ok = code == 0
    if routed:
        write_row(tasks_path, row["id"], status="pending", notes=f"routed to code {stamp}")
        result_text, reason = "routed to code", ""
    elif ok:
        write_row(tasks_path, row["id"], status="done", notes=f"answered by {agent} {stamp}")
        result_text, reason = "answered", ""
    else:
        reason = "stopped by user" if stopped else f"agent exited {code}"
        write_row(tasks_path, row["id"], status="blocked", notes=f"{reason}, {stamp}")
        result_text = "blocked"
    files = ", ".join(changed) or "(none detected)"
    (state / "log").mkdir(exist_ok=True)
    log_path = unique_log_path(state, started, row["id"])
    log_path.write_text(
        f"# {row['id']}: {row['task']}\n\n"
        f"- Agent: {agent}\n- Result: {result_text}\n"
        f"- Started: {started:%Y-%m-%d %H:%M}, finished: {stamp}\n"
        f"- Agent exit code: {code}\n- Files changed: {files}\n\n"
        f"## Agent output\n\n```\n{tail(out)}\n```\n\n"
        f"## Prompt sent\n\n<details>\n\n```\n{prompt}\n```\n\n</details>\n")
    say(f"{row['id']}: {result_text}")
    return {"code": 0 if ok else 1, "ok": ok, "session_id": session, "files": changed, "log": log_path,
            "reason": reason, "check": "", "output": out, "stopped": stopped, "routed": routed}


def write_out(text):
    sys.stdout.write(text)
    sys.stdout.flush()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--task", help="task ID from tasks.md, or new task text (needs --agent)")
    ap.add_argument("--agent", help="override the task's owner (claude or hermes)")
    ap.add_argument("--dry-run", action="store_true", help="print the prompt and change nothing")
    ap.add_argument("--config", default=DEFAULT_CONFIG, help="path to config.toml")
    args = ap.parse_args(argv)
    return run(load_config(args.config), args.task, args.agent, args.dry_run, echo=write_out)


if __name__ == "__main__":
    sys.exit(main())
