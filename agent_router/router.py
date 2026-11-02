#!/usr/bin/env python3
"""Shared pieces for running coding agents: start an agent CLI, stream its output as readable text,
capture its session ID, run a project's check, and see which files it changed."""
import ctypes
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import tomllib
from pathlib import Path

DEFAULT_CONFIG = Path(__file__).resolve().parent / "config.toml"
TAIL = 4000  # characters of output kept in logs and summaries


def load_config(path=DEFAULT_CONFIG):
    path = Path(path).resolve()
    cfg = tomllib.loads(path.read_text())
    cfg["repo"] = (path.parent / cfg.get("repo", "..")).resolve()
    return cfg


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
    if kind in ("item.started", "item.completed"):  # ChatGPT (Codex CLI)
        return codex_item(kind, event.get("item") or {}, repo)
    if kind == "turn.completed" and isinstance(event.get("usage"), dict):
        usage = event["usage"]
        return f"\n[{usage.get('input_tokens', 0) + usage.get('output_tokens', 0)} tokens]\n"
    if kind in ("turn.failed", "error"):
        error = event.get("error") or {}
        message = error.get("message") if isinstance(error, dict) else str(error)
        return f"\nError: {message or event.get('message') or 'unknown error'}\n"
    if kind == "result":
        if "total_cost_usd" in event:
            return f"\n[cost ${event['total_cost_usd']:.2f}]\n"
        if isinstance(event.get("tokens"), dict):
            return f"\n[{event['tokens'].get('total', '?')} tokens]\n"
    return ""


def codex_item(kind, item, repo):
    """Readable text for one item event from `codex exec --json`."""
    item_type = item.get("type")
    if item_type == "agent_message" and kind == "item.completed":
        return item.get("text", "") + "\n"
    if item_type == "command_execution" and kind == "item.started":
        command = re.sub(r"^/bin/(?:ba|z)?sh -lc ", "", item.get("command", ""))
        return tool_line("Bash", {"command": command.strip("'\"")}, repo)
    if item_type == "file_change" and kind == "item.completed":
        return "".join(tool_line("Edit", {"path": c.get("path", "")}, repo) for c in item.get("changes") or [])
    if item_type in ("mcp_tool_call", "web_search") and kind == "item.started":
        return tool_line(item.get("tool") or item.get("query") or item_type, {}, repo)
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
    if not isinstance(event, dict):
        return None
    if event.get("type") == "thread.started":  # ChatGPT (Codex CLI)
        return event.get("thread_id") or None
    return event.get("session_id") or None


def run_agent(cfg, agent, prompt, echo=None, session_id=None, control=None, cwd=None, extra_dirs=(),
              model=None):
    """Run the agent CLI from the repo root, streaming its output to echo.

    session_id resumes an earlier session. control is a dict another thread can use to stop the run:
    it gets control["proc"], and setting control["stopped"] = True before killing marks it a user stop.
    model overrides the agent's default model if the agent has a model_flag in config.
    Returns (exit_code, output, session_id).
    """
    spec = cfg["agents"][agent]
    command = list(spec["command"])
    if session_id and spec.get("resume_command"):  # agents that resume with a different command (ChatGPT)
        command = [part.replace("{session_id}", session_id) for part in spec["resume_command"]]
    elif session_id:
        command += [part.replace("{session_id}", session_id) for part in spec.get("resume", [])]
    if model and spec.get("model_flag"):
        command += [part.replace("{model}", model) for part in spec["model_flag"]]
    for folder in extra_dirs:  # folders outside cwd the agent may read (attachments), for agents that need it
        command += [part.replace("{dir}", str(folder)) for part in spec.get("add_dir", [])]
    parse = spec.get("format") == "stream-json"
    uses_file = any("{prompt_file}" in part for part in command)
    timeout = cfg.get("agent_timeout", 1800)
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
        f.write(prompt)
    cmd = [part.replace("{prompt_file}", f.name) for part in command]
    try:
        proc = subprocess.Popen(cmd, cwd=cwd or cfg["repo"], text=True, bufsize=1,
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
            text = parse_line(line, cwd or cfg["repo"]) if parse else line
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


def scratch_copy(folder, dest=None):
    """A copy of `folder` to run an agent in, so nothing it does touches the real one.

    With `dest`, the copy is (re)made at exactly that path, replacing what was there. On APFS (macOS)
    this is a copy-on-write clone: instant, and it takes no extra disk space. Elsewhere it falls back
    to a plain copy without dependency and build folders.
    """
    folder = Path(folder).resolve()
    if dest is None:
        dest = Path(tempfile.mkdtemp(prefix="applio-scratch-")) / folder.name
    else:
        dest = Path(dest)
        shutil.rmtree(dest, ignore_errors=True)
        dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        libc = ctypes.CDLL("libc.dylib", use_errno=True)
        if libc.clonefile(str(folder).encode(), str(dest).encode(), 0) == 0:
            return dest
    except (OSError, AttributeError):
        pass
    shutil.copytree(folder, dest, symlinks=True, ignore=shutil.ignore_patterns(*(SKIP_DIRS - {".git"})))
    return dest


def remove_scratch(path):
    shutil.rmtree(Path(path).parent, ignore_errors=True)


def run_check(command, cwd, timeout=600):
    """Run a project's check command. Returns (exit_code, output); (0, "") when there is no check."""
    if not command:
        return 0, ""
    try:
        p = subprocess.run(command, shell=True, cwd=cwd, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, f"check timed out after {timeout}s: {command}"
    except KeyboardInterrupt:
        return 130, "check stopped by user"
    return p.returncode, (p.stdout + p.stderr).strip() or "(no output)"


SKIP_DIRS = {".git", "node_modules", "__pycache__", ".pycache", "venv", ".venv", "dist", "build", ".next", ".cache"}


def snapshot(folder):
    """What files look like right now, to spot what an agent changed. Uses git when the folder is a repo."""
    folder = Path(folder)
    if (folder / ".git").exists():
        return git_status(folder)
    entries = set()
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            path = Path(root) / name
            try:
                st = path.stat()
            except OSError:
                continue
            entries.add(f"?? {path.relative_to(folder)}\t{st.st_mtime_ns}-{st.st_size}")
    return entries


def changed_files(before, after):
    """Paths that differ between two snapshots (added, edited or deleted)."""
    return sorted({line[3:].split("\t")[0] for line in before ^ after})


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


def tail(text, limit=TAIL):
    text = text.strip()
    return text if len(text) <= limit else "...\n" + text[-limit:]
