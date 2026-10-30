#!/usr/bin/env python3
"""Hand the next task in agent_state/tasks.md to Claude Code or Hermes, gate it, record it.

Usage:
  python3 agent_router/router.py                     run the next pending task that has an owner
  python3 agent_router/router.py --task T2           run a specific task
  python3 agent_router/router.py --task "fix X" --agent claude   add a new task and run it
  python3 agent_router/router.py --dry-run           print the prompt only, change nothing
"""
import argparse
import datetime as dt
import os
import subprocess
import sys
import tempfile
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


def write_row(path, task_id, **fields):
    lines, header, rows = read_tasks(path)
    row = next(r for r in rows if r["id"] == task_id)
    for key, value in fields.items():
        row[key] = str(value).replace("|", "/").replace("\n", " ")
    lines[row["line"]] = "| " + " | ".join(row.get(h, "") for h in header) + " |"
    path.write_text("\n".join(lines) + "\n")


def add_task(path, text, owner):
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


def run_agent(cfg, agent, prompt):
    """Run the agent CLI from the repo root. Returns (exit_code, output)."""
    command = cfg["agents"][agent]["command"]
    uses_file = any("{prompt_file}" in part for part in command)
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
        f.write(prompt)
    cmd = [part.replace("{prompt_file}", f.name) for part in command]
    stdin = {"stdin": subprocess.DEVNULL} if uses_file else {"input": prompt}
    try:
        p = subprocess.run(cmd, cwd=cfg["repo"], capture_output=True, text=True,
                           timeout=cfg.get("agent_timeout", 1800), **stdin)
    except FileNotFoundError:
        return 127, f"command not found: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return 124, f"agent timed out after {cfg.get('agent_timeout', 1800)}s"
    finally:
        os.unlink(f.name)
    out = p.stdout
    if p.stderr.strip():
        out += f"\n[stderr]\n{p.stderr}"
    return p.returncode, out


def run_check(cfg):
    cmd = cfg.get("check_command")
    if not cmd:
        return 0, "(no check_command configured)"
    try:
        p = subprocess.run(cmd, shell=True, cwd=cfg["repo"], capture_output=True, text=True,
                           timeout=cfg.get("check_timeout", 600))
    except subprocess.TimeoutExpired:
        return 124, f"check timed out: {cmd}"
    return p.returncode, (p.stdout + p.stderr).strip() or "(no output)"


def git_status(repo):
    p = subprocess.run(["git", "status", "--porcelain", "-uall"], cwd=repo,
                       capture_output=True, text=True)
    return set(p.stdout.splitlines()) if p.returncode == 0 else set()


def tail(text):
    text = text.strip()
    return text if len(text) <= TAIL else "...\n" + text[-TAIL:]


def run(cfg, wanted=None, agent_override=None, dry_run=False):
    state = cfg["state"]
    tasks_path, handoff_path, context_path = state / "tasks.md", state / "handoff.md", state / "context.md"
    row, agent = pick_task(cfg, tasks_path, wanted, agent_override)
    prompt = build_prompt(row, agent, state)

    if dry_run:
        print(f"[dry run] {row['id']} -> {agent}\n\n{prompt}")
        return 0

    write_row(tasks_path, row["id"], status="in_progress", owner=agent)
    handoff_before = handoff_path.read_text() if handoff_path.exists() else ""
    context_before = context_path.read_text() if context_path.exists() else ""
    git_before = git_status(cfg["repo"])
    started = dt.datetime.now()

    print(f"{row['id']} -> {agent}: {row['task']}\nRunning {agent}...", flush=True)
    agent_code, agent_out = run_agent(cfg, agent, prompt)
    check_code, check_out = (None, "skipped: agent failed") if agent_code else run_check(cfg)

    changed = sorted({line[3:] for line in git_status(cfg["repo"]) - git_before})
    handoff_after = handoff_path.read_text() if handoff_path.exists() else ""
    context_changed = (context_path.read_text() if context_path.exists() else "") != context_before
    wrote_handoff = handoff_after != handoff_before
    ok = agent_code == 0 and check_code == 0
    stamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    files = ", ".join(changed) or "(none detected)"

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
        reason = (f"agent exited {agent_code}" if agent_code else f"check failed (exit {check_code})")
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

    log_path = state / "log" / f"{started:%Y-%m-%d}-{row['id']}.md"
    log_path.parent.mkdir(exist_ok=True)
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

    print(f"\n{row['id']}: {'done' if ok else 'BLOCKED'}  (log: {log_path.relative_to(cfg['repo'])})")
    print(f"Files changed: {files}")
    if not wrote_handoff:
        print(f"Warning: {agent} did not write handoff.md; the router wrote one for it.")
    if not ok:
        print(f"\n{tail(check_out if agent_code == 0 else agent_out)}")
    return 0 if ok else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--task", help="task ID from tasks.md, or new task text (needs --agent)")
    ap.add_argument("--agent", help="override the task's owner (claude or hermes)")
    ap.add_argument("--dry-run", action="store_true", help="print the prompt and change nothing")
    ap.add_argument("--config", default=DEFAULT_CONFIG, help="path to config.toml")
    args = ap.parse_args(argv)
    return run(load_config(args.config), args.task, args.agent, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
