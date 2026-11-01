#!/usr/bin/env python3
"""Local web app for the agent router. Start it with: npm run app (then open http://localhost:4747)."""
import argparse
import datetime as dt
import json
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import router  # noqa: E402

STATIC = HERE / "static"
PORT = 4747
MAX_BODY = 200_000
MAX_DIFF = 400_000
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".json": "application/manifest+json",
         ".png": "image/png", ".svg": "image/svg+xml"}
REPO_ICONS = {"icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png"}
NAMES = {"claude": "Claude", "hermes": "Hermes", "chatgpt": "ChatGPT"}
APPROVED = re.compile(r"(?m)^\W*APPROVED\W*$")
MAX_REVIEW_DIFF = 30_000
MAX_ATTACHMENT = 25_000_000
IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

RELAY_BUILD = """
===== RELAY =====
You are working on this task together with {other}. You go first and build it. When you finish,
{other} reviews your changes and either approves them or fixes problems and hands back to you.
Write a clear agent_state/handoff.md so {other} can review your work.
"""

REVIEW_PROMPT = """{system}
===== RELAY REVIEW =====
You are {me}. You and {other} are doing task {id} together, taking turns. {other} just finished a turn.
Review the current state of the work.

Task: {task}

Router check after {other}'s turn: {check}

{other}'s handoff (agent_state/handoff.md):
{handoff}

Uncommitted changes in the repo, agent_state/ excluded:
```diff
{diff}
```
{untracked}
Decide:
- If the changes fully and correctly do the task and the check passed: change nothing, and end your
  reply with a line containing only the word APPROVED.
- Otherwise: fix the problems yourself, staying inside the task's scope. Then overwrite
  agent_state/handoff.md with what you changed and why, so {other} can review it. Do not write APPROVED.

===== agent_state/context.md =====
{context}
"""


def name(agent):
    return " + ".join(NAMES.get(a, a) for a in agent.split("+"))


def now():
    return dt.datetime.now().isoformat(timespec="seconds")


class Threads:
    """One conversation per task, saved as agent_state/threads/<ID>.json."""

    def __init__(self, state):
        self.dir = state / "threads"
        self.log_dir = state / "log"
        self.lock = threading.RLock()
        self.cache = {}

    def _load(self, task_id):
        if task_id not in self.cache:
            path = self.dir / f"{task_id}.json"
            self.cache[task_id] = json.loads(path.read_text()) if path.exists() else None
        return self.cache[task_id]

    def _save(self, task_id):
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / f"{task_id}.json").write_text(json.dumps(self.cache[task_id], indent=1))

    def get(self, task_id, task_text=""):
        with self.lock:
            thread = self._load(task_id)
            return json.loads(json.dumps(thread)) if thread else self.from_logs(task_id, task_text)

    def ensure(self, task_id, agent, task_text):
        """Create the thread if needed (a task first run outside the app starts from its logs)."""
        with self.lock:
            if self._load(task_id) is None:
                self.cache[task_id] = self.from_logs(task_id, task_text)
                self.cache[task_id]["agent"] = agent
                self._save(task_id)

    def add(self, task_id, message):
        with self.lock:
            self.cache[task_id]["messages"].append({"time": now(), **message})
            self._save(task_id)

    def attach(self, task_id, files):
        """Record attachments on the task's latest user message."""
        with self.lock:
            for m in reversed(self.cache[task_id]["messages"]):
                if m["role"] == "user":
                    m["files"] = files
                    break
            self._save(task_id)

    @staticmethod
    def latest_files(thread):
        for m in reversed(thread["messages"]):
            if m["role"] == "user":
                return m.get("files") or []
        return []

    def append_text(self, task_id, text):
        with self.lock:
            self.cache[task_id]["messages"][-1]["text"] += text

    def finish(self, task_id, agent, result, extra=None):
        with self.lock:
            thread = self.cache[task_id]
            last = thread["messages"][-1]
            if last.get("live"):
                last["live"] = False
            if result.get("session_id"):
                thread.setdefault("sessions", {})[agent] = result["session_id"]
                if not extra:
                    thread["session_id"] = result["session_id"]
                    thread["agent"] = agent
            self._save(task_id)
        self.add(task_id, {"role": "result", "ok": result["ok"], "reason": result.get("reason", ""),
                           "files": result.get("files", []), "check": result.get("check", ""),
                           "log": result["log"].name if result.get("log") else "", **(extra or {})})

    def finish_live(self, task_id, text=None, step=None, session=None):
        """End a live agent message, optionally replacing its text (used when a request is routed on)."""
        with self.lock:
            thread = self.cache.get(task_id)
            if not thread or not thread["messages"]:
                return
            last = thread["messages"][-1]
            if last.get("live"):
                last["live"] = False
                if text is not None:
                    last["text"] = text
                if step:
                    last["step"] = step
            if session and session[1]:
                thread.setdefault("sessions", {})[session[0]] = session[1]
            self._save(task_id)

    @staticmethod
    def session_for(thread, agent):
        sessions = thread.get("sessions") or {}
        if sessions.get(agent):
            return sessions[agent]
        return thread.get("session_id") if thread.get("agent") == agent else None

    @staticmethod
    def conversation(thread, skip_last_user=False, limit=6000):
        """The thread as plain text, for agents starting fresh on a follow-up."""
        messages = [m for m in thread["messages"] if m["role"] in ("user", "agent") and m.get("step") != "route"]
        if skip_last_user and messages and messages[-1]["role"] == "user":
            messages = messages[:-1]
        parts = []
        for m in messages:
            who = "User" if m["role"] == "user" else name(m.get("agent") or "agent")
            text = m.get("text", "").strip()
            if text:
                parts.append(f"{who}: {text[-2000:]}")
        convo = "\n\n".join(parts)
        return convo[-limit:]

    def conversation_section(self, thread):
        convo = self.conversation(thread, skip_last_user=True)
        return f"\n===== CONVERSATION SO FAR =====\n{convo}\n" if convo else ""

    def from_logs(self, task_id, task_text):
        """Rebuild a thread for tasks that ran before the app existed, from agent_state/log/."""
        messages = [{"role": "user", "text": task_text, "time": ""}]
        logs = [*self.log_dir.glob(f"*-{task_id}.md"), *self.log_dir.glob(f"*-{task_id}-*.md")]
        for log in sorted(logs, key=lambda p: p.stat().st_mtime):
            text = log.read_text()
            output = re.search(r"## Agent output\n\n```\n(.*?)\n```", text, re.S)
            result = re.search(r"- Result: (\w+)", text)
            files = re.search(r"- Files changed: (.*)", text)
            messages.append({"role": "agent", "text": output.group(1) if output else "", "time": ""})
            ok = bool(result and result.group(1) == "done")
            changed = files.group(1) if files else ""
            messages.append({"role": "result", "ok": ok, "time": "", "log": log.name, "check": "",
                             "reason": "" if ok else "see log",
                             "files": [] if changed.startswith("(none") else changed.split(", ")})
        return {"id": task_id, "agent": None, "session_id": None, "messages": messages}


class Lane:
    """A queue of jobs run one at a time on its own worker thread."""

    def __init__(self, app, label):
        self.app, self.label = app, label
        self.jobs = queue.Queue()
        self.queued, self.cancelled = [], set()
        self.current = None
        self.control = None
        threading.Thread(target=self.worker, daemon=True).start()

    def submit(self, kind, task_id, text=None):
        with self.app.lock:
            self.queued.append(task_id)
            self.cancelled.discard(task_id)
        self.jobs.put((kind, task_id, text))

    def idle(self):
        with self.app.lock:
            return self.current is None and not self.queued and self.jobs.unfinished_tasks == 0

    def worker(self):
        while True:
            kind, task_id, text = self.jobs.get()
            try:
                with self.app.lock:
                    self.queued.remove(task_id)
                    if task_id in self.cancelled:
                        self.cancelled.discard(task_id)
                        continue
                    self.current, self.control = task_id, {}
                try:
                    self.app.run_job(self, kind, task_id, text)
                except Exception as e:  # report any failure in the thread instead of killing the worker
                    message = str(e.code) if isinstance(e, SystemExit) else f"{type(e).__name__}: {e}"
                    self.app.threads.finish_live(task_id)
                    self.app.threads.add(task_id, {"role": "result", "ok": False, "reason": message,
                                                   "files": [], "check": "", "log": ""})
                finally:
                    with self.app.lock:
                        self.current, self.control = None, None
            finally:
                self.jobs.task_done()


class App:
    """Runs agent jobs and keeps threads up to date.

    Code changes run one at a time on the code lane. Auto requests (answer or route) run on the quick
    lane, so a question gets answered even while a coding task is running.
    """

    def __init__(self, cfg):
        self.cfg = cfg
        self.state = cfg["state"]
        self.tasks_path = self.state / "tasks.md"
        self.threads = Threads(self.state)
        self.lock = threading.Lock()
        auto = cfg.get("auto", {})
        self.auto = {"answer": auto.get("answer", "hermes"), "code": auto.get("code", "claude")}
        self.code = Lane(self, "code")
        self.quick = Lane(self, "quick")
        self.lanes = (self.code, self.quick)

    # ---- reading ----

    def rows(self):
        return router.read_tasks(self.tasks_path)[2]

    def row(self, task_id):
        row = next((r for r in self.rows() if r["id"] == task_id), None)
        if row is None:
            raise ApiError(404, f"No task {task_id}")
        return row

    def snapshot(self):
        branch = subprocess.run(["git", "branch", "--show-current"], cwd=self.cfg["repo"],
                                capture_output=True, text=True).stdout.strip()
        with self.lock:
            lanes = {lane.label: {"current": lane.current, "queued": list(lane.queued)} for lane in self.lanes}
        tasks = [{k: r.get(k, "") for k in ("id", "task", "status", "owner", "notes")} for r in self.rows()]
        return {"tasks": tasks, "agents": list(self.cfg["agents"]),
                "current": lanes["code"]["current"], "queued": lanes["code"]["queued"],
                "quick": lanes["quick"], "auto": self.auto if self.auto_ready() else None,
                "repo": self.cfg["repo"].name, "branch": branch, "relay_turns": self.relay_turns()}

    def relay_turns(self):
        return max(2, int(self.cfg.get("relay_max_turns", 4)))

    def diff(self):
        repo = self.cfg["repo"]
        status = subprocess.run(["git", "status", "--short"], cwd=repo, capture_output=True, text=True).stdout
        diff = subprocess.run(["git", "diff"], cwd=repo, capture_output=True,
                              encoding="utf-8", errors="replace").stdout
        if len(diff) > MAX_DIFF:
            diff = diff[:MAX_DIFF] + "\n... (diff truncated)\n"
        return {"status": status, "diff": diff}

    def idle(self):
        return all(lane.idle() for lane in self.lanes)

    def running(self):
        """Task IDs currently being worked on, in any lane."""
        with self.lock:
            return [lane.current for lane in self.lanes if lane.current]

    # ---- owners ----

    def auto_ready(self):
        agents = self.cfg["agents"]
        return self.auto["answer"] in agents and self.auto["code"] in agents

    def is_relay(self, owner):
        parts = owner.split("+")
        return len(parts) == 2 and parts[0] != parts[1] and all(p in self.cfg["agents"] for p in parts)

    def runnable(self, owner):
        return owner in self.cfg["agents"] or self.is_relay(owner) or (owner == "auto" and self.auto_ready())

    def check_agent(self, agent):
        """An agent name, 'auto', a relay pair like 'claude+hermes', or 'relay' for the first two agents."""
        if agent == "relay":
            names = list(self.cfg["agents"])
            if len(names) < 2:
                raise ApiError(400, "Relay needs two agents in config.toml")
            return f"{names[0]}+{names[1]}"
        if agent == "auto" and not self.auto_ready():
            raise ApiError(400, "Auto needs both agents named in [auto] in config.toml")
        if not self.runnable(agent):
            raise ApiError(400, f"Unknown agent '{agent}'")
        return agent

    # ---- attachments ----

    def save_attachments(self, task_id, paths):
        """Copy files the user attached into agent_state/attachments/<ID>/ so every agent can read them."""
        saved = []
        folder = self.state / "attachments" / task_id
        for raw in paths or []:
            src = Path(raw).expanduser()
            if not src.is_file():
                raise ApiError(400, f"Can't attach {raw}: not a file")
            if src.stat().st_size > MAX_ATTACHMENT:
                raise ApiError(400, f"Can't attach {src.name}: larger than 25 MB")
            folder.mkdir(parents=True, exist_ok=True)
            dest = folder / src.name
            n = 2
            while dest.exists():
                dest = folder / f"{src.stem}-{n}{src.suffix}"
                n += 1
            shutil.copy2(src, dest)
            saved.append(str(dest.relative_to(self.cfg["repo"])))
        return saved

    def attachments(self, task_id):
        """Prompt section listing the latest message's attachments, and whether any is an image."""
        files = self.threads.latest_files(self.threads.get(task_id))
        if not files:
            return "", False
        note = ("\n===== ATTACHED FILES =====\nThe user attached these files (paths from the repo root). "
                "Open each one, images included, before you start:\n" + "".join(f"- {f}\n" for f in files))
        return note, any(Path(f).suffix.lower() in IMAGE_TYPES for f in files)

    def sees_images(self, agent):
        return self.cfg["agents"][agent].get("vision", True)

    # ---- actions ----

    def busy(self, task_id):
        with self.lock:
            return any(task_id == lane.current or task_id in lane.queued for lane in self.lanes)

    def lane_for(self, owner):
        return self.quick if owner == "auto" else self.code

    def new_task(self, agent, text, run=True, files=None):
        agent, text = self.check_agent(agent), text.strip()
        if not text:
            raise ApiError(400, "Describe the task first")
        for raw in files or []:
            if not Path(raw).expanduser().is_file():
                raise ApiError(400, f"Can't attach {raw}: not a file")
        task_id = router.add_task(self.tasks_path, text, agent)
        self.threads.ensure(task_id, agent, text)
        if files:
            self.threads.attach(task_id, self.save_attachments(task_id, files))
        if run:
            self.lane_for(agent).submit("auto" if agent == "auto" else "run", task_id)
        return task_id

    def run_task(self, task_id, agent=None):
        row = self.row(task_id)
        if self.busy(task_id):
            raise ApiError(409, f"{task_id} is already running or queued")
        if row["status"] not in ("pending", "blocked"):
            raise ApiError(409, f"{task_id} is {row['status']}; reply to it instead")
        if agent:
            owner = self.check_agent(agent)
            router.write_row(self.tasks_path, task_id, owner=owner)
        elif not self.runnable(row["owner"]):
            raise ApiError(400, f"{task_id} has no owner; pick an agent")
        else:
            owner = row["owner"]
        self.lane_for(owner).submit("auto" if owner == "auto" else "run", task_id)

    def reply(self, task_id, text, files=None):
        row = self.row(task_id)
        if not text.strip():
            raise ApiError(400, "Write a reply first")
        if self.busy(task_id):
            raise ApiError(409, f"{task_id} is still working; wait or stop it")
        if row["status"] == "pending":
            raise ApiError(409, f"{task_id} hasn't run yet; run it first")
        if not self.runnable(row["owner"]):
            raise ApiError(400, f"{task_id} has no owner")
        self.threads.ensure(task_id, row["owner"], row["task"])
        saved = self.save_attachments(task_id, files)
        self.threads.add(task_id, {"role": "user", "text": text.strip(), **({"files": saved} if saved else {})})
        owner = row["owner"]
        self.lane_for(owner).submit("auto" if owner == "auto" else "reply", task_id, text)

    def stop(self, task_id):
        with self.lock:
            for lane in self.lanes:
                if task_id in lane.queued:
                    lane.cancelled.add(task_id)
                    return "cancelled"
                if task_id == lane.current and lane.control is not None:
                    lane.control["stopped"] = True
                    proc = lane.control.get("proc")
                    if proc and proc.poll() is None:
                        proc.kill()
                    return "stopping"
        raise ApiError(409, f"{task_id} is not running")

    def reset(self, task_id):
        row = self.row(task_id)
        if row["status"] != "blocked" or self.busy(task_id):
            raise ApiError(409, f"Only blocked tasks can be reset ({task_id} is {row['status']})")
        router.write_row(self.tasks_path, task_id, status="pending")

    def set_owner(self, task_id, agent):
        self.row(task_id)
        if self.busy(task_id):
            raise ApiError(409, f"{task_id} is running")
        router.write_row(self.tasks_path, task_id, owner=self.check_agent(agent))

    # ---- jobs ----

    def run_job(self, lane, kind, task_id, text):
        rows = self.rows()
        row = next(r for r in rows if r["id"] == task_id)
        mine = set(self.running())
        others = [r["id"] for r in rows if r["status"] == "in_progress" and r["id"] not in mine]
        if others and lane is self.code:
            raise SystemExit(f"{', '.join(others)} is in_progress (started outside the app). "
                             "Wait for it, or reset it in tasks.md.")
        if kind == "auto":
            return self.run_auto(lane, row, text)
        if self.is_relay(row["owner"]):
            return self.run_relay(lane, row, text if kind == "reply" else None)
        agent = self.auto["code"] if row["owner"] == "auto" else row["owner"]
        self.threads.ensure(task_id, row["owner"], row["task"])
        thread = self.threads.get(task_id)
        session = self.threads.session_for(thread, agent) if kind == "reply" else None
        if kind == "reply":
            prompt = router.reply_prompt(row, agent, text, self.state, resumed=bool(session))
            if not session:
                prompt += self.threads.conversation_section(thread)
        else:
            prompt = router.build_prompt(row, agent, self.state)
        note, _ = self.attachments(task_id)
        self.threads.add(task_id, {"role": "agent", "agent": agent, "text": "", "live": True})
        result = router.execute(self.cfg, row, agent, prompt + note,
                                echo=lambda chunk: self.threads.append_text(task_id, chunk),
                                session_id=session, control=lane.control, owner=row["owner"])
        self.threads.finish(task_id, agent, result)

    # ---- auto: Hermes answers, or hands code work to Claude ----

    def run_auto(self, lane, row, text):
        task_id = row["id"]
        answerer, coder = self.auto["answer"], self.auto["code"]
        self.threads.ensure(task_id, "auto", row["task"])
        note, has_image = self.attachments(task_id)
        if has_image and not self.sees_images(answerer):
            answerer = coder  # the answer agent can't see images, so the code agent reads this one
        thread = self.threads.get(task_id)
        session = self.threads.session_for(thread, answerer) if text else None
        conversation = "" if session or not text else self.threads.conversation(thread, skip_last_user=True)
        prompt = router.route_prompt(text or row["task"], name(coder), conversation, resumed=bool(session))
        self.threads.add(task_id, {"role": "agent", "agent": answerer, "text": "", "live": True, "step": "auto"})
        result = router.ask(self.cfg, row, answerer, prompt + note,
                            echo=lambda chunk: self.threads.append_text(task_id, chunk),
                            session_id=session, control=lane.control, owner=row["owner"])
        if result["routed"]:
            self.threads.finish_live(task_id, text=f"This needs code changes, so I'm handing it to {name(coder)}.",
                                     step="route", session=(answerer, result["session_id"]))
            self.code.submit("reply" if text else "run", task_id, text)
            return
        self.threads.finish(task_id, answerer, result, {"answer": True})

    # ---- relay: two agents take turns until one approves the other's work ----

    def run_relay(self, lane, row, reply_text=None):
        task_id, owner = row["id"], row["owner"]
        lead, reviewer = owner.split("+")
        max_turns = self.relay_turns()
        self.threads.ensure(task_id, owner, row["task"])
        if reply_text:
            prompt = router.reply_prompt(row, lead, reply_text, self.state, resumed=False)
        else:
            prompt = router.build_prompt(row, lead, self.state)
        prompt += RELAY_BUILD.format(other=name(reviewer))
        note, _ = self.attachments(task_id)
        agent, other = lead, reviewer

        for turn in range(1, max_turns + 1):
            step = "build" if turn == 1 else "review"
            self.threads.add(task_id, {"role": "agent", "agent": agent, "text": "", "live": True,
                                       "turn": turn, "step": step})
            result = router.execute(self.cfg, row, agent, prompt + note,
                                    echo=lambda chunk: self.threads.append_text(task_id, chunk),
                                    control=lane.control, owner=owner)
            code_files = [f for f in result["files"] if not f.startswith("agent_state/")]
            approved = bool(turn > 1 and result["ok"] and not code_files and APPROVED.search(result["output"]))
            self.threads.finish(task_id, agent, result, {"turn": turn, "step": step, "approved": approved})
            if result["stopped"]:
                return
            if result["reason"].startswith("agent exited"):
                # The agent itself failed (usage limit, crash, login): nothing new to review, so stop here.
                last = next((l.strip() for l in reversed(result["output"].splitlines())
                             if l.strip() and not l.strip().startswith("[")), "")
                self.threads.add(task_id, {"role": "result", "ok": False, "relay": "agent_failed", "files": [],
                                           "check": "", "log": "", "reason": f"{name(agent)} failed",
                                           "text": last[:300]})
                return
            if approved:
                self.threads.add(task_id, {"role": "result", "ok": True, "relay": "agreed", "files": [],
                                           "check": "", "log": "", "reason": "",
                                           "text": f"{name(agent)} approved the work after {turn} turns."})
                return
            if turn < max_turns:
                prompt = self.review_prompt(row, me=other, author=agent, result=result)
                agent, other = other, agent

        router.write_row(self.tasks_path, task_id, status="blocked",
                         notes=f"relay: no approval after {max_turns} turns")
        self.threads.add(task_id, {"role": "result", "ok": False, "relay": "no_agreement", "files": [],
                                   "check": "", "log": "", "reason": f"no approval after {max_turns} turns",
                                   "text": "Read the last turn, then reply with directions or run it again."})

    def review_prompt(self, row, me, author, result):
        repo = self.cfg["repo"]
        exclude = ["--", ".", ":(exclude)agent_state"]
        diff = subprocess.run(["git", "diff", "HEAD", *exclude], cwd=repo, capture_output=True,
                              encoding="utf-8", errors="replace").stdout
        new_files = subprocess.run(["git", "ls-files", "--others", "--exclude-standard", *exclude],
                                   cwd=repo, capture_output=True, text=True).stdout.splitlines()
        for path in new_files:  # new files aren't in `git diff`; show them as added
            if len(diff) > MAX_REVIEW_DIFF:
                break
            diff += subprocess.run(["git", "diff", "--no-index", "--", "/dev/null", path], cwd=repo,
                                   capture_output=True, encoding="utf-8", errors="replace").stdout
        untracked = ""
        if len(diff) > MAX_REVIEW_DIFF:
            diff = diff[:MAX_REVIEW_DIFF] + "\n... (diff truncated)\n"
            untracked = f"The diff was cut short. All changed new files: {', '.join(new_files) or 'none'}. Read them directly.\n"
        check = "passed" if result["ok"] else f"FAILED ({result['reason']})\n{result['check']}"
        handoff = (self.state / "handoff.md").read_text() if (self.state / "handoff.md").exists() else "(none)"
        context = (self.state / "context.md").read_text() if (self.state / "context.md").exists() else "(none)"
        return REVIEW_PROMPT.format(system=router.SYSTEM_PROMPT, me=name(me), other=name(author), id=row["id"],
                                    task=row["task"], check=check, handoff=handoff.strip(),
                                    diff=diff.strip() or "(no changes)", untracked=untracked, context=context.strip())


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class Handler(BaseHTTPRequestHandler):
    app = None
    port = PORT
    server_version = "ApplioAgents"

    def log_message(self, fmt, *args):
        pass

    def allowed_host(self):
        return self.headers.get("Host", "") in (f"localhost:{self.port}", f"127.0.0.1:{self.port}")

    def send(self, status, body, ctype="application/json", cache="no-store"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.allowed_host():
            return self.send(403, {"error": "forbidden host"})
        path = urlparse(self.path).path
        try:
            if path.startswith("/api/"):
                return self.send(200, self.get_api(path))
            return self.static(path)
        except ApiError as e:
            self.send(e.status, {"error": str(e)})

    def get_api(self, path):
        app = self.app
        if path == "/api/state":
            return app.snapshot()
        if path == "/api/diff":
            return app.diff()
        if path in ("/api/files/handoff", "/api/files/context"):
            name = path.rsplit("/", 1)[1] + ".md"
            file = app.state / name
            return {"text": file.read_text() if file.exists() else ""}
        m = re.fullmatch(r"/api/threads/(T\d+)", path)
        if m:
            return app.threads.get(m.group(1), app.row(m.group(1))["task"])
        raise ApiError(404, "not found")

    def static(self, path):
        name = "index.html" if path in ("/", "/index.html") else path.lstrip("/")
        if name in REPO_ICONS:
            file = self.app.cfg["repo"] / name
        else:
            file = (STATIC / name).resolve()
            if STATIC.resolve() not in file.parents:
                return self.send(404, b"not found", "text/plain")
        if not file.is_file():
            return self.send(404, b"not found", "text/plain")
        self.send(200, file.read_bytes(), TYPES.get(file.suffix, "application/octet-stream"), "no-cache")

    def do_POST(self):
        # Only this page may call the API: same host, a custom header (which a cross-site form or
        # fetch cannot add without a CORS preflight this server never approves), and JSON bodies.
        origin = self.headers.get("Origin")
        if (not self.allowed_host() or self.headers.get("X-Agents") != "1"
                or (origin and origin not in (f"http://localhost:{self.port}", f"http://127.0.0.1:{self.port}"))):
            return self.send(403, {"error": "forbidden"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.send(413, {"error": "too large"})
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError
        except ValueError:
            return self.send(400, {"error": "invalid JSON"})
        try:
            self.send(200, self.post_api(urlparse(self.path).path, body))
        except ApiError as e:
            self.send(e.status, {"error": str(e)})

    def post_api(self, path, body):
        app = self.app
        text = str(body.get("text", ""))
        agent = body.get("agent")
        if path == "/api/tasks":
            return {"id": app.new_task(str(agent or ""), text, bool(body.get("run", True)))}
        m = re.fullmatch(r"/api/tasks/(T\d+)/(run|stop|reset|owner|reply)", path)
        if not m:
            raise ApiError(404, "not found")
        task_id, action = m.groups()
        if action == "run":
            app.run_task(task_id, agent)
        elif action == "stop":
            return {"result": app.stop(task_id)}
        elif action == "reset":
            app.reset(task_id)
        elif action == "owner":
            app.set_owner(task_id, str(agent or ""))
        elif action == "reply":
            app.reply(task_id, text)
        return {"ok": True}


def make_server(cfg, port=PORT):
    handler = type("BoundHandler", (Handler,), {"app": App(cfg), "port": port})
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    handler.port = server.server_address[1]
    return server


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--no-open", action="store_true", help="don't open the browser")
    ap.add_argument("--config", default=router.DEFAULT_CONFIG)
    args = ap.parse_args(argv)
    try:
        server = make_server(router.load_config(args.config), args.port)
    except OSError:
        print(f"Port {args.port} is busy. Is the app already running? Open http://localhost:{args.port}")
        return 1
    url = f"http://localhost:{args.port}"
    print(f"Applio Agents running at {url}  (Ctrl-C to stop)")
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        app = server.RequestHandlerClass.app
        for task_id in app.running():
            print(f"\nStopping {task_id} and marking it blocked...")
            app.stop(task_id)
        for _ in range(100):  # let the router record the result before exiting
            if not app.running():
                break
            time.sleep(0.1)
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
