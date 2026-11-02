"""Projects, chats, and how the agents work together.

Hermes (the orchestrator) reads every message. It answers anything that needs no file changes, and
hands code work to a coder (Claude or ChatGPT) with a written brief. The coder works in the project's
folder; the project's check runs; a failed check goes back to the coder once; if a coder fails outright
(usage limit, crash) the other coder takes over. Then Hermes reports back.

Projects and chats live in ~/.applio-agents/ (APPLIO_AGENTS_HOME overrides it).
"""
import datetime as dt
import json
import os
import queue
import re
import secrets
import shutil
import subprocess
import threading
import time
from pathlib import Path

import router

HOME = Path(os.environ.get("APPLIO_AGENTS_HOME") or "~/.applio-agents").expanduser()
NAMES = {"claude": "Claude", "hermes": "Hermes", "chatgpt": "ChatGPT"}
IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
MAX_ATTACHMENT = 25_000_000
MAX_REVIEW_DIFF = 30_000

DELEGATE = re.compile(r"(?mi)^\W*DELEGATE:\s*(\w+)")
REVIEW = re.compile(r"(?mi)^\W*REVIEW:\s*(yes|no)")
BRIEF = re.compile(r"(?mis)^\W*BRIEF:\s*\n?(.*)")
DECISION = re.compile(r"(?m)^\W*DECISION:\s*(.+)$")
APPROVED = re.compile(r"(?m)^\W*APPROVED\W*$")
DELEGATE_BLOCK = re.compile(r"(?mi)^\W*DELEGATE:\s*(\w+)")


def parse_delegations(output):
    """Parse one or more DELEGATE/REVIEW/BRIEF blocks from Hermes's output.

    Returns a list of dicts: [{"coder": str, "review": bool, "brief": str}, ...]
    """
    splits = list(DELEGATE_BLOCK.finditer(output))
    if not splits:
        return []
    blocks = []
    for i, match in enumerate(splits):
        start = match.start()
        end = splits[i + 1].start() if i + 1 < len(splits) else len(output)
        chunk = output[start:end]
        coder = match.group(1).lower()
        review_m = REVIEW.search(chunk)
        review = bool(review_m and review_m.group(1).lower() == "yes")
        brief_m = BRIEF.search(chunk)
        brief = brief_m.group(1).strip() if brief_m else ""
        blocks.append({"coder": coder, "review": review, "brief": brief})
    return blocks
BLOCKED = re.compile(r"(?m)^\W*BLOCKED:\s*(.+)$")
FILLER = {"please", "pls", "plz", "can", "could", "would", "you", "u", "i", "want", "need", "to", "help", "me",
          "hey", "hi", "just", "the", "a", "an", "tldr", "my", "our", "some", "go", "through"}

STOCKBOT_NOTES = ("This folder runs a live trading bot. Never run the bot, its schedulers, or anything that "
                  "places, cancels or simulates orders. Never open, print or copy .env or any API keys.")

ORCHESTRATE = """You are Hermes, the orchestrator for the "{project}" project ({path}). You talk with the user
and decide who does the work. The coders are {coders}. This project's default coder is {default}.

You can read any file, but never change files yourself: you are working in a copy of the project, and any
edit you make there is thrown away. Only the coders change the real project.

IMPORTANT: Each coder call costs real usage quota. Only delegate when files MUST be created, edited or deleted.
Handle everything else yourself -- questions, explanations, plans, reviews, debugging advice, reading code,
checking what files exist, analyzing errors, and summarizing what was done. If you can answer by reading
files, do it yourself. When in doubt, answer yourself first.

IMPORTANT: You have NO tools. Do not call delegate_task, execute_code, or any other function. Your
ONLY way to delegate is the plain-text DELEGATE block shown below. Your ONLY way to answer is
plain text. If you try to call a tool it will be ignored and the user's message will be lost.

For each message, do exactly one of these:

1. ANSWER YOURSELF (strongly preferred): If the message is a question, explanation, plan, review, status
   check, "thanks", "looks good", or anything that does not require writing/editing/deleting files.
2. DELEGATE TO A CODER: Only if files must be created, edited or deleted. Reply with ONLY this block:
DELEGATE: <{names}>
REVIEW: <yes ONLY if the change touches payment, auth, data deletion, or more than 5 files>
BRIEF:
## Goal
<one sentence: what the user wants>
## Files
<which files to create/edit/delete, be specific>
## Constraints
<what NOT to do, edge cases, style rules>
## Done when
<how to verify the change works>

3. SPLIT ACROSS CODERS: When the user asks for independent pieces to go to different coders, reply with
   multiple DELEGATE blocks, one per piece. Each block is a complete DELEGATE/REVIEW/BRIEF set:
DELEGATE: <coder1>
REVIEW: <yes or no>
BRIEF:
<brief for coder1's piece>

DELEGATE: <coder2>
REVIEW: <yes or no>
BRIEF:
<brief for coder2's piece>

The pieces run one after another. Use this ONLY when the user explicitly splits work across coders.

ROUTING RULES (follow these exactly, in this priority order):
1. HIGHEST PRIORITY: If the user names a specific coder ("use Claude", "send to ChatGPT", "give this
   to Claude", "have Claude do it", "batch 3 to Claude", etc.), ALWAYS use that coder, regardless of
   what the task is. The user's explicit choice overrides every other rule.
2. Use Claude for: UI/UX design, mockups, visual changes, CSS/styling, landing pages, layout work,
   logo/icon/image generation, frontend polish, design systems, and anything the user describes as
   "design" or "make it look". Claude is the design specialist.
3. Use {default} for everything else: backend, logic, bug fixes, refactoring, tests, data, scripts,
   config, APIs, and general coding. {default} is the workhorse.
{availability}{images}{notes}
===== PROJECT MEMORY =====
{memory}
{conversation}
===== MESSAGE FROM THE USER =====
{text}
"""

ORCHESTRATE_FOLLOWUP = """Another message from the user in this chat. Same rules as before: answer it yourself
if it needs no file changes; otherwise reply with only the DELEGATE / REVIEW / BRIEF block(s).
You have NO tools -- only plain text and DELEGATE blocks. Never call delegate_task or execute_code.
If the user splits work across coders, use multiple DELEGATE blocks (one per piece).
Reminder: if the user names a coder, ALWAYS use that coder. Otherwise use Claude for design/visual
work and {default} for everything else.
{availability}{images}
{text}
"""

CODER = """You are {coder}, a coding agent working in the "{project}" project at {path}. Hermes, the
orchestrator, assigned you this work from a chat with the user.

Rules:
- Stay inside the scope of the brief. Mention unrelated issues at the end instead of fixing them.
- Do not commit, push, or deploy. Leave changes uncommitted for the user to review, even if the
  project's own rules say otherwise.
- Follow the project's own rules files (CLAUDE.md, AGENTS.md, README) if there are any.
- If the request turns out to need no file changes, just answer it.
- When you finish, end with a short summary: what changed, which files, and how you checked it.
- If you made a decision future work depends on (a library choice, an API contract, a naming
  convention), add a line starting with "DECISION: ".
- If you cannot complete the task (missing access, unclear requirement, dependency not installed,
  blocked by another change), say "BLOCKED: <reason>" instead of guessing or failing silently.
  The other coder will take over.{notes}
===== PROJECT MEMORY =====
{memory}
{conversation}
===== BRIEF FROM HERMES =====
{brief}

===== THE USER'S MESSAGE =====
{text}
"""

CODER_FOLLOWUP = """New work in this chat from Hermes, the orchestrator. Same rules as before.

===== BRIEF FROM HERMES =====
{brief}

===== THE USER'S MESSAGE =====
{text}
"""

FIX = """The project's check failed after your changes:

{check}

Fix the problem, staying inside the original scope, and end with a short summary of the fix."""

REVIEWER = """You are {reviewer}, reviewing {author}'s work in the "{project}" project at {path}.

The task (from Hermes's brief): {brief}

Check result after {author}'s turn: {check}

{author}'s final message:
{output}

Uncommitted changes:
```diff
{diff}
```

Decide:
- If the changes fully and correctly do the task: change nothing, and end your reply with a line
  containing only the word APPROVED.
- Otherwise: fix the problems yourself, staying inside the task's scope, and explain what you changed.
  Do not write APPROVED.
Do not commit, push, or deploy.{notes}
"""

NAME_CHAT = """Name this chat in 2 to 5 words, like "Stripe webhook fix" or "Dark mode toggle". Reply with only the
name, nothing else, and don't use any tools.

The first message: {text}
"""

REPORT = """The coding for the user's last message is finished. Tell the user what happened in one to three
short sentences: what changed, whether the check passed, and anything they should do next (such as
review the changes). Base your summary on the actual diff below, not just the coder's description.
Do not change any files, and do not repeat this block.

Coder: {coder}
Files changed: {files}
Check: {check}
The coder's final message:
{output}

===== ACTUAL DIFF =====
{diff}
"""


def quick_title(text):
    """A short chat name from a message, used until Hermes names the chat."""
    words = [w.strip(".,!?;:-/'\"") for w in re.findall(r"[A-Za-z0-9][\w.+#/'-]*", text)]
    words = [w for w in words if w]
    kept = [w for w in words if w.lower() not in FILLER] or words
    title = " ".join(kept[:5])[:60]
    return (title[:1].upper() + title[1:]) if title else "New chat"


def clean_title(raw):
    title = " ".join(raw.strip().strip("*_`\"'").split())
    return title.rstrip(".:")[:60]


def name(agent):
    return " + ".join(NAMES.get(a, a.title()) for a in str(agent).split("+"))


def now():
    return dt.datetime.now().isoformat(timespec="milliseconds")


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "project"


def detect_check(path):
    """A safe default check for a folder: syntax checks only, nothing that runs the project."""
    path = Path(path)
    if (path / "package.json").exists() or list(path.glob("*.js"))[:1]:
        if (path / ".git").exists():
            return "git ls-files -co --exclude-standard -z '*.js' | xargs -0 -n1 node --check"
        return "find . -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check"
    if list(path.glob("*.py"))[:1] or (path / "pyproject.toml").exists():
        return "python3 -m compileall -q -x '(venv|\\.venv|node_modules)' ."
    return ""


class ChatError(Exception):
    """A request the user can fix (unknown project, empty message, busy chat)."""


# ---- storage ----

class Store:
    """Projects in projects.json; each chat in projects/<project>/chats/<chat>.json."""

    def __init__(self, home=HOME):
        self.home = Path(home)
        self.lock = threading.RLock()
        self.cache = {}

    # projects

    def projects_file(self):
        return self.home / "projects.json"

    def projects(self):
        with self.lock:
            try:
                return json.loads(self.projects_file().read_text())["projects"]
            except (OSError, ValueError, KeyError):
                return []

    def save_projects(self, projects):
        with self.lock:
            self.home.mkdir(parents=True, exist_ok=True)
            self.projects_file().write_text(json.dumps({"projects": projects}, indent=1))

    def project(self, pid):
        found = next((p for p in self.projects() if p["id"] == pid), None)
        if found is None:
            raise ChatError(f"No project '{pid}'. See /project list.")
        return found

    def add_project(self, path, project_name=None, coders=None, check=None, notes=""):
        folder = Path(path).expanduser().resolve()
        if not folder.is_dir():
            raise ChatError(f"No folder at {folder}")
        with self.lock:
            projects = self.projects()
            existing = next((p for p in projects if p["path"] == str(folder)), None)
            if existing:
                return existing
            base = slug(project_name or folder.name)
            pid, n = base, 2
            while any(p["id"] == pid for p in projects):
                pid, n = f"{base}-{n}", n + 1
            project = {"id": pid, "name": project_name or folder.name, "path": str(folder),
                       "coders": list(coders or ["claude", "chatgpt"]),
                       "check": detect_check(folder) if check is None else check,
                       "notes": notes, "created": now()}
            projects.append(project)
            self.save_projects(projects)
            return project

    def update_project(self, pid, **fields):
        with self.lock:
            projects = self.projects()
            project = next((p for p in projects if p["id"] == pid), None)
            if project is None:
                raise ChatError(f"No project '{pid}'.")
            project.update({k: v for k, v in fields.items() if v is not None})
            self.save_projects(projects)
            return project

    def remove_project(self, pid):
        """Forget a project. Its chats stay on disk."""
        with self.lock:
            self.save_projects([p for p in self.projects() if p["id"] != pid])

    def project_for_path(self, path):
        """The project a folder belongs to (deepest match), if any."""
        path = str(Path(path).expanduser().resolve())
        matches = [p for p in self.projects() if path == p["path"] or path.startswith(p["path"] + os.sep)]
        return max(matches, key=lambda p: len(p["path"]), default=None)

    def project_dir(self, pid):
        return self.home / "projects" / pid

    def memory_path(self, pid):
        return self.project_dir(pid) / "memory.md"

    def memory(self, pid):
        parts = []
        for path in (self.home / "memory.md", self.memory_path(pid)):
            if path.exists() and path.read_text().strip():
                parts.append(path.read_text().strip())
        return "\n".join(parts) or "(nothing yet)"

    def remember(self, pid, who, note):
        note = " ".join(str(note).split())
        if not note:
            return
        path = self.memory_path(pid)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a") as f:
            f.write(f"- {dt.date.today()} ({who}): {note}\n")

    # chats

    def chat_path(self, pid, cid):
        return self.project_dir(pid) / "chats" / f"{cid}.json"

    def _load(self, pid, cid):
        key = (pid, cid)
        if key not in self.cache:
            path = self.chat_path(pid, cid)
            if not path.exists():
                raise ChatError(f"No chat {cid} in {pid}.")
            self.cache[key] = json.loads(path.read_text())
        return self.cache[key]

    def _save(self, pid, cid):
        path = self.chat_path(pid, cid)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.cache[(pid, cid)], indent=1))
        tmp.replace(path)

    def create_chat(self, pid, title, cid=None, auto_title=False):
        cid = cid or f"{dt.datetime.now():%Y%m%d-%H%M%S}-{secrets.token_hex(2)}"
        chat = {"id": cid, "project": pid, "title": " ".join(title.split())[:80] or "New chat",
                "created": now(), "updated": now(), "pinned": False, "archived": False,
                "auto_title": auto_title, "sessions": {}, "messages": []}
        with self.lock:
            self.cache[(pid, cid)] = chat
            self._save(pid, cid)
        return cid

    def chat(self, pid, cid):
        with self.lock:
            return json.loads(json.dumps(self._load(pid, cid)))

    def chats(self, pid, archived=False):
        """Chat summaries for a project: pinned first, then most recently updated."""
        folder = self.project_dir(pid) / "chats"
        out = []
        with self.lock:
            for path in folder.glob("*.json") if folder.exists() else []:
                try:
                    chat = self._load(pid, path.stem)
                except (ValueError, ChatError):
                    continue
                if chat.get("archived") and not archived:
                    continue
                last = next((m for m in reversed(chat["messages"]) if m["role"] == "result"), None)
                out.append({"id": chat["id"], "title": chat["title"], "updated": chat["updated"],
                            "pinned": chat.get("pinned", False), "archived": chat.get("archived", False),
                            "failed": bool(last and not last.get("ok")), "messages": len(chat["messages"])})
        return sorted(out, key=lambda c: (c["pinned"], c["updated"]), reverse=True)

    def update_chat(self, pid, cid, **fields):
        with self.lock:
            chat = self._load(pid, cid)
            for key in ("title", "pinned", "archived"):
                if fields.get(key) is not None:
                    chat[key] = " ".join(str(fields[key]).split())[:80] if key == "title" else bool(fields[key])
            if fields.get("title") is not None:
                chat["auto_title"] = False  # the user named it; keep their name
            self._save(pid, cid)

    def name_chat(self, pid, cid, title):
        """Give the chat a name from Hermes, unless the user already named it."""
        title = clean_title(title)
        with self.lock:
            chat = self._load(pid, cid)
            if title and chat.get("auto_title"):
                chat["title"], chat["auto_title"] = title, False
                self._save(pid, cid)

    def delete_chat(self, pid, cid):
        with self.lock:
            self.cache.pop((pid, cid), None)
            self.chat_path(pid, cid).unlink(missing_ok=True)
            shutil.rmtree(self.project_dir(pid) / "attachments" / cid, ignore_errors=True)
            shutil.rmtree(self.project_dir(pid) / "scratch" / cid, ignore_errors=True)

    def add(self, pid, cid, message):
        with self.lock:
            chat = self._load(pid, cid)
            chat["messages"].append({"time": now(), **message})
            chat["updated"] = now()
            self._save(pid, cid)
            return len(chat["messages"]) - 1

    def append_text(self, pid, cid, text):
        with self.lock:
            self._load(pid, cid)["messages"][-1]["text"] += text

    def finish_live(self, pid, cid, **fields):
        """End the live agent message, optionally replacing fields (text, step, brief)."""
        with self.lock:
            chat = self._load(pid, cid)
            for m in reversed(chat["messages"]):
                if m.get("live"):
                    m["live"] = False
                    m.update(fields)
                    break
            self._save(pid, cid)

    def set_session(self, pid, cid, agent, session_id):
        if not session_id:
            return
        with self.lock:
            self._load(pid, cid).setdefault("sessions", {})[agent] = session_id
            self._save(pid, cid)

    def search(self, text, limit=30):
        """Chats in any project whose title or messages contain `text`."""
        text = text.lower()
        hits = []
        for project in self.projects():
            for summary in self.chats(project["id"], archived=True):
                chat = self.chat(project["id"], summary["id"])
                body = chat["title"] + "\n" + "\n".join(m.get("text", "") for m in chat["messages"])
                at = body.lower().find(text)
                if at >= 0:
                    hits.append({"project": project["id"], "chat": chat["id"], "title": chat["title"],
                                 "snippet": " ".join(body[max(0, at - 40):at + 80].split())})
        return hits[:limit]

    def attachments_dir(self, pid, cid):
        return self.project_dir(pid) / "attachments" / cid

    def save_attachments(self, pid, cid, paths):
        saved = []
        folder = self.attachments_dir(pid, cid)
        for raw in paths or []:
            src = Path(raw).expanduser()
            if not src.is_file():
                raise ChatError(f"Can't attach {raw}: not a file")
            if src.stat().st_size > MAX_ATTACHMENT:
                raise ChatError(f"Can't attach {src.name}: larger than 25 MB")
            folder.mkdir(parents=True, exist_ok=True)
            dest, n = folder / src.name, 2
            while dest.exists():
                dest, n = folder / f"{src.stem}-{n}{src.suffix}", n + 1
            shutil.copy2(src, dest)
            saved.append(str(dest))
        return saved


# ---- running jobs ----

class Lane:
    """Jobs run one at a time on their own thread. Each project has a chat lane (Hermes) and a code lane."""

    def __init__(self, engine, label):
        self.engine, self.label = engine, label
        self.jobs = queue.Queue()
        self.queued, self.cancelled = [], set()
        self.current = None
        self.control = None
        threading.Thread(target=self.worker, daemon=True).start()

    def submit(self, job):
        key = (job["project"], job["chat"])
        with self.engine.lock:
            self.queued.append(key)
            self.cancelled.discard(key)
        self.jobs.put(job)

    def idle(self):
        with self.engine.lock:
            return self.current is None and not self.queued and self.jobs.unfinished_tasks == 0

    def worker(self):
        while True:
            job = self.jobs.get()
            key = (job["project"], job["chat"])
            try:
                with self.engine.lock:
                    self.queued.remove(key)
                    if key in self.cancelled:
                        self.cancelled.discard(key)
                        continue
                    self.current, self.control = key, {}
                try:
                    self.engine.run_job(self, job)
                except Exception as e:  # show the failure in the chat instead of killing the worker
                    self.engine.store.finish_live(*key)
                    detail = str(e.code) if isinstance(e, SystemExit) else f"{type(e).__name__}: {e}"
                    self.engine.store.add(*key, {"role": "result", "ok": False, "reason": detail, "files": []})
                finally:
                    with self.engine.lock:
                        self.current, self.control = None, None
            finally:
                self.jobs.task_done()


class Engine:
    def __init__(self, cfg, store=None):
        self.cfg = cfg
        self.store = store or Store()
        self.lock = threading.Lock()
        self.lanes = {}
        orch = cfg.get("orchestrator", {})
        self.orchestrator = orch.get("agent", "hermes")
        self.coders = [c for c in orch.get("coders", ["claude", "chatgpt"]) if c in cfg["agents"]]
        self.report_enabled = orch.get("report", True)
        namer = orch.get("namer", self.orchestrator)  # the agent that names new chats
        self.namer = namer if namer in cfg["agents"] else None
        self.unavailable = {}  # agent -> (until timestamp, reason): skipped after a usage-limit failure
        self.models = self._load_models()  # agent -> selected model override

    # ---- setup ----

    def _models_file(self):
        return self.store.home / "models.json"

    def _load_models(self):
        try:
            return json.loads(self._models_file().read_text())
        except (OSError, ValueError):
            return {}

    def _save_models(self):
        self._models_file().write_text(json.dumps(self.models, indent=1))

    def set_model(self, agent, model):
        spec = self.cfg["agents"].get(agent)
        if not spec:
            raise ChatError(f"Unknown agent '{agent}'.")
        allowed = spec.get("models", [])
        if model and model not in allowed:
            raise ChatError(f"Model '{model}' not available for {agent}. Pick from: {', '.join(allowed)}")
        if model:
            self.models[agent] = model
        else:
            self.models.pop(agent, None)
        self._save_models()

    def get_model(self, agent):
        return self.models.get(agent)

    def models_info(self):
        info = {}
        for agent, spec in self.cfg["agents"].items():
            allowed = spec.get("models", [])
            if allowed:
                info[agent] = {"models": allowed, "selected": self.models.get(agent)}
        return info

    def ensure_defaults(self):
        """First run: register Applio and Stockbot if those folders exist, and bring over old task threads."""
        if self.store.projects():
            return
        applio = Path("~/Projects/hireflow-main").expanduser()
        stockbot = Path("~/stockbot").expanduser()
        if applio.is_dir():
            self.store.add_project(applio, "Applio", coders=["chatgpt", "claude"])
            self.import_tasks("applio")
        if stockbot.is_dir():
            self.store.add_project(stockbot, "Stockbot", coders=["chatgpt", "claude"], notes=STOCKBOT_NOTES)

    def import_tasks(self, pid):
        """Turn the old task threads (agent_state/threads/*.json) into chats in a project."""
        folder = self.cfg["repo"] / "agent_state" / "threads"
        tasks = {}
        tasks_md = self.cfg["repo"] / "agent_state" / "tasks.md"
        if tasks_md.exists():
            for line in tasks_md.read_text().splitlines():
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                if len(cells) >= 2 and re.fullmatch(r"T\d+", cells[0]):
                    tasks[cells[0]] = cells[1]
        for path in sorted(folder.glob("T*.json")) if folder.exists() else []:
            thread = json.loads(path.read_text())
            title = f"{path.stem}: {tasks.get(path.stem, thread['messages'][0].get('text', path.stem) if thread['messages'] else path.stem)}"
            cid = self.store.create_chat(pid, title, cid=f"imported-{path.stem.lower()}")
            times = [m["time"] for m in thread["messages"] if m.get("time")]
            with self.store.lock:
                chat = self.store._load(pid, cid)
                chat["messages"] = thread["messages"]
                if times:  # keep the task's real dates so chats sort as they happened
                    chat["created"], chat["updated"] = min(times), max(times)
                self.store._save(pid, cid)

    # ---- lanes and state ----

    def lane(self, pid, kind):
        with self.lock:
            if (pid, kind) not in self.lanes:
                self.lanes[(pid, kind)] = Lane(self, f"{pid}:{kind}")
            return self.lanes[(pid, kind)]

    def all_lanes(self):
        with self.lock:
            return list(self.lanes.values())

    def busy(self, pid, cid):
        key = (pid, cid)
        with self.lock:
            return any(lane.current == key or key in lane.queued for lane in self.lanes.values())

    def status(self, pid, cid):
        key = (pid, cid)
        with self.lock:
            for lane in self.lanes.values():
                if lane.current == key:
                    return "running"
            for lane in self.lanes.values():
                if key in lane.queued:
                    return "queued"
        return "idle"

    def waiting_behind(self, pid, cid):
        """The chat a queued chat is waiting for, if it is really waiting."""
        key = (pid, cid)
        with self.lock:
            for lane in self.lanes.values():
                if key in lane.queued and lane.current not in (None, key):
                    return lane.current
        return None

    def running(self):
        with self.lock:
            return [lane.current for lane in self.lanes.values() if lane.current]

    def idle(self):
        return all(lane.idle() for lane in self.all_lanes())

    def snapshot(self):
        projects = []
        for p in self.store.projects():
            chats = self.store.chats(p["id"])
            for c in chats:
                c["status"] = self.status(p["id"], c["id"])
            projects.append({**p, "exists": Path(p["path"]).is_dir(), "chats": chats})
        return {"projects": projects, "agents": list(self.cfg["agents"]), "coders": self.coders,
                "orchestrator": self.orchestrator, "running": [list(k) for k in self.running()],
                "unavailable": {a: r for a, (until, r) in self.unavailable.items() if until > time.time()},
                "models": self.models_info()}

    # ---- actions ----

    def check_agent(self, agent):
        if agent in (None, "", "auto", self.orchestrator):
            return None
        if agent not in self.coders:
            raise ChatError(f"Unknown agent '{agent}'. Use {', '.join([self.orchestrator, *self.coders])}.")
        return agent

    def new_chat(self, pid, text, files=(), agent=None):
        project = self.store.project(pid)
        agent = self.check_agent(agent)
        if not str(text).strip():
            raise ChatError("Write a message first.")
        for raw in files or []:
            if not Path(raw).expanduser().is_file():
                raise ChatError(f"Can't attach {raw}: not a file")
        cid = self.store.create_chat(project["id"], quick_title(text), auto_title=True)
        self.send(project["id"], cid, text, files, agent)
        if self.namer:
            threading.Thread(target=self.name_chat, args=(project["id"], cid, text), daemon=True).start()
        return cid

    def name_chat(self, pid, cid, text):
        """Ask the naming agent for a short chat name (in the background; the quick name stays if it fails)."""
        self.store.home.mkdir(parents=True, exist_ok=True)
        code, output, _ = router.run_agent(self.cfg, self.namer, NAME_CHAT.format(text=" ".join(text.split())[:500]),
                                           cwd=self.store.home)
        lines = [l.strip() for l in output.splitlines()
                 if l.strip() and not l.strip().startswith(("[", ">", "{")) and not l.lower().startswith("session")]
        if code == 0 and lines:
            title = clean_title(lines[0].split("name:", 1)[-1] if lines[0].lower().startswith("name:") else lines[0])
            if 1 <= len(title.split()) <= 6:
                self.store.name_chat(pid, cid, title)

    def orchestrator_sees_images(self):
        return self.cfg["agents"][self.orchestrator].get("vision", True)

    def send(self, pid, cid, text, files=(), agent=None):
        project = self.store.project(pid)
        agent = self.check_agent(agent)
        text = str(text).strip()
        if not text:
            raise ChatError("Write a message first.")
        if self.busy(pid, cid):
            raise ChatError("This chat is still working. Wait for it, or stop it first.")
        saved = self.store.save_attachments(pid, cid, files)
        self.store.add(pid, cid, {"role": "user", "text": text, **({"files": saved} if saved else {})})
        job = {"project": pid, "chat": cid, "text": text, "files": saved, "agent": agent}
        if not agent and not self.orchestrator_sees_images() \
                and any(Path(f).suffix.lower() in IMAGE_TYPES for f in saved):
            # The orchestrator can't see images, so a message that attaches one goes straight to a coder
            # who can, instead of Hermes stalling. Plain follow-ups (no new image) still go to Hermes,
            # which has the conversation history (including any description the coder already gave).
            agent = self.default_coder(project)
            self.store.add(pid, cid, {"role": "note",
                                      "text": f"That has an image {name(self.orchestrator)} can't see, "
                                              f"so it goes to {name(agent)}."})
        if agent:  # a coder was picked, or an image routed one in: skip Hermes's routing
            job.update(coder=agent, brief=text, review=False)
            self.lane(pid, "code").submit(job)
        else:
            self.lane(pid, "chat").submit(job)

    def stop(self, pid, cid):
        key = (pid, cid)
        result = None
        with self.lock:
            for lane in self.lanes.values():
                if key in lane.queued:
                    lane.cancelled.add(key)
                    result = result or "cancelled"
                if lane.current == key and lane.control is not None:
                    lane.control["stopped"] = True
                    proc = lane.control.get("proc")
                    if proc and proc.poll() is None:
                        proc.kill()
                    result = "stopping"
        if result is None:
            raise ChatError("Nothing is running in this chat.")
        return result

    def delete_chat(self, pid, cid):
        if self.busy(pid, cid):
            raise ChatError("Stop the chat before deleting it.")
        self.store.delete_chat(pid, cid)

    # ---- the pipeline ----

    def run_job(self, lane, job):
        if "coder" in job:
            return self.run_code(lane, job)
        return self.orchestrate(lane, job)

    def project_notes(self, project):
        return f"\n\nProject rules: {project['notes']}" if project.get("notes") else ""

    def conversation(self, chat, limit=6000):
        """The chat so far as plain text, minus the newest user message (sent separately)."""
        messages = [m for m in chat["messages"] if m["role"] in ("user", "agent") and m.get("step") != "delegate"]
        if messages and messages[-1]["role"] == "user":
            messages = messages[:-1]
        parts = [f"{'User' if m['role'] == 'user' else name(m.get('agent', 'agent'))}: {m.get('text', '').strip()[-2000:]}"
                 for m in messages if m.get("text", "").strip()]
        convo = "\n\n".join(parts)[-limit:]
        return f"\n===== CONVERSATION SO FAR =====\n{convo}\n" if convo else ""

    def attachment_note(self, files):
        if not files:
            return ""
        return ("\n===== ATTACHED FILES =====\nThe user attached these files. Open each one, images included:\n"
                + "".join(f"- {f}\n" for f in files))

    def available(self, agent):
        until, _ = self.unavailable.get(agent, (0, ""))
        return until <= time.time()

    def availability(self, project):
        notes = [f"{name(a)} is unavailable right now ({r})." for a, (until, r) in self.unavailable.items()
                 if until > time.time() and a in project["coders"]]
        return (" " + " ".join(notes) + " Use another coder.") if notes else ""

    def default_coder(self, project):
        coders = [c for c in project.get("coders", self.coders) if c in self.coders] or self.coders
        return next((c for c in coders if self.available(c)), coders[0])

    def run_agent(self, lane, project, chat_id, agent, prompt, step, session=None, extra=None, files=(),
                  folder=None):
        """Run one agent turn with its output streaming into the chat. Returns the turn's result."""
        pid = project["id"]
        self.store.add(pid, chat_id, {"role": "agent", "agent": agent, "step": step, "text": "", "live": True,
                                      **(extra or {})})
        folder = Path(folder or project["path"])
        before = router.snapshot(folder)
        started = time.time()
        att = self.store.attachments_dir(pid, chat_id)
        dirs = [att] if att.is_dir() and any(att.iterdir()) else []  # reach this chat's attachments, past ones too
        code, output, new_session = router.run_agent(
            self.cfg, agent, prompt, echo=lambda t: self.store.append_text(pid, chat_id, t),
            session_id=session, control=lane.control, cwd=folder, extra_dirs=dirs,
            model=self.get_model(agent))
        changed = router.changed_files(before, router.snapshot(folder))
        self.store.set_session(pid, chat_id, agent, new_session)
        stopped = code == 130
        self.write_log(project, chat_id, agent, step, prompt, output, code, changed, started)
        if code not in (0, 130):
            reason = self.failure_reason(output, code)
            if re.search(r"limit|quota|rate.?limit|usage", reason, re.I):
                self.unavailable[agent] = (time.time() + 3600, reason)
        return {"code": code, "output": output, "files": changed, "stopped": stopped,
                "reason": "stopped by you" if stopped else (self.failure_reason(output, code) if code else "")}

    @staticmethod
    def failure_reason(output, code):
        lines = [l.strip() for l in output.splitlines() if l.strip() and not l.strip().startswith("[")]
        return (lines[-1][:200] if lines else f"exited with code {code}")

    def write_log(self, project, chat_id, agent, step, prompt, output, code, changed, started):
        folder = self.store.project_dir(project["id"]) / "logs"
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{chat_id}-{int(started)}-{agent}-{step}.md"
        path.write_text(f"# {agent} {step} in {project['name']}\n\n- Exit code: {code}\n"
                        f"- Took: {int(time.time() - started)}s\n- Files changed: {', '.join(changed) or 'none'}\n\n"
                        f"## Output\n\n```\n{router.tail(output)}\n```\n\n## Prompt\n\n```\n{prompt}\n```\n")

    def orchestrate(self, lane, job):
        pid, cid = job["project"], job["chat"]
        project = self.store.project(pid)
        chat = self.store.chat(pid, cid)
        hermes = self.orchestrator
        session = chat.get("sessions", {}).get(hermes)
        images = [f for f in job["files"] if Path(f).suffix.lower() in IMAGE_TYPES]
        image_note = ""
        if images and not self.cfg["agents"][hermes].get("vision", True):
            image_note = (" The user attached an image you can't see; if it matters, delegate to a coder, "
                          "who can see it.")
        default = self.default_coder(project)
        values = {"project": project["name"], "path": project["path"], "default": name(default),
                  "coders": ", ".join(name(c) for c in project["coders"] if c in self.coders),
                  "names": " or ".join(c for c in project["coders"] if c in self.coders),
                  "availability": self.availability(project), "images": image_note,
                  "notes": self.project_notes(project), "memory": self.store.memory(pid),
                  "conversation": "" if session else self.conversation(chat), "text": job["text"]}
        template = ORCHESTRATE_FOLLOWUP if session else ORCHESTRATE
        copy = self.hermes_folder(project, cid)
        values["path"] = str(copy)
        prompt = template.format(**values) + self.attachment_note(job["files"])
        turn = self.run_agent(lane, project, cid, hermes, prompt, "orchestrate", session=session,
                              files=job["files"], folder=copy)
        if turn["stopped"]:
            self.store.finish_live(pid, cid)
            return self.store.add(pid, cid, {"role": "result", "ok": False, "reason": "stopped by you", "files": []})
        delegations = parse_delegations(turn["output"]) if turn["code"] == 0 else []
        if turn["code"] != 0:
            # Hermes itself failed: don't strand the message, send it straight to the default coder.
            self.store.finish_live(pid, cid, step="note")
            self.store.add(pid, cid, {"role": "note", "text": f"{name(hermes)} failed ({turn['reason']}). "
                                                              f"Sending this straight to {name(default)}."})
            job.update(coder=default, brief=job["text"], review=False)
            return self.lane(pid, "code").submit(job)
        if not delegations and turn["files"]:
            # Hermes edited its own copy instead of delegating. Those edits are discarded; the request
            # needs a change, so it goes to a coder like any other hand-off.
            self.store.finish_live(pid, cid, step="delegate", text=f"Handing this to {name(default)}.",
                                   brief=job["text"], coder=default, review=False)
            job.update(coder=default, brief=job["text"], review=False)
            return self.lane(pid, "code").submit(job)
        if not delegations:
            self.store.finish_live(pid, cid, step="answer")
            return
        # Resolve unknown coders to the default.
        for d in delegations:
            if d["coder"] not in self.coders:
                d["coder"] = default
            if not d["brief"]:
                d["brief"] = job["text"]
        if len(delegations) == 1:
            d = delegations[0]
            self.store.finish_live(pid, cid, step="delegate", text=f"Handing this to {name(d['coder'])}.",
                                   brief=d["brief"], coder=d["coder"], review=d["review"])
            job.update(coder=d["coder"], brief=d["brief"], review=d["review"])
            self.lane(pid, "code").submit(job)
        else:
            coders_involved = list(dict.fromkeys(d["coder"] for d in delegations))
            summary = " and ".join(name(c) for c in coders_involved)
            self.store.finish_live(pid, cid, step="delegate",
                                   text=f"Splitting this across {summary} ({len(delegations)} pieces).")
            for i, d in enumerate(delegations):
                self.store.add(pid, cid, {"role": "note",
                                          "text": f"Piece {i+1}/{len(delegations)}: {name(d['coder'])}.",
                                          "brief": d["brief"], "coder": d["coder"]})
                piece = {**job, "coder": d["coder"], "brief": d["brief"], "review": d["review"]}
                self.lane(pid, "code").submit(piece)

    def hermes_folder(self, project, cid):
        """Hermes's own copy of the project for this chat, refreshed from the real folder before each turn.

        Hermes reads everything there, and anything it edits stays in the copy. The path stays the same for
        the whole chat because Hermes ties each session to the folder it started in.
        """
        dest = self.store.project_dir(project["id"]) / "scratch" / cid / Path(project["path"]).name
        return router.scratch_copy(project["path"], dest)

    def coder_prompt(self, project, chat, coder, job, resumed):
        values = {"coder": name(coder), "project": project["name"], "path": project["path"],
                  "notes": self.project_notes(project), "memory": self.store.memory(project["id"]),
                  "conversation": self.conversation(chat), "brief": job["brief"], "text": job["text"]}
        return (CODER_FOLLOWUP if resumed else CODER).format(**values) + self.attachment_note(job["files"])

    def run_code(self, lane, job):
        pid, cid = job["project"], job["chat"]
        project = self.store.project(pid)
        order = [job["coder"]] + [c for c in project.get("coders", self.coders) + self.coders
                                  if c != job["coder"] and c in self.coders]
        order = list(dict.fromkeys(order))
        files, turn, coder = [], None, None
        for k, coder in enumerate(order):
            if k and not self.available(coder):
                continue
            chat = self.store.chat(pid, cid)
            session = chat.get("sessions", {}).get(coder)
            prompt = self.coder_prompt(project, chat, coder, job, resumed=bool(session))
            turn = self.run_agent(lane, project, cid, coder, prompt, "code", session=session, files=job["files"])
            self.store.finish_live(pid, cid)
            files += turn["files"]
            if turn["stopped"]:
                return self.store.add(pid, cid, {"role": "result", "ok": False, "reason": "stopped by you",
                                                 "files": files, "agent": coder})
            blocked = BLOCKED.search(turn["output"]) if turn["code"] == 0 else None
            if turn["code"] == 0 and not blocked:
                break
            reason = blocked.group(1).strip() if blocked else turn["reason"]
            nxt = next((c for c in order[k + 1:] if self.available(c)), None)
            verb = "is blocked" if blocked else "failed"
            self.store.add(pid, cid, {"role": "note", "text": f"{name(coder)} {verb} ({reason})."
                                      + (f" Handing it to {name(nxt)}." if nxt else "")})
        else:
            return self.store.add(pid, cid, {"role": "result", "ok": False, "files": sorted(set(files)),
                                             "reason": "no coder could finish this", "agent": coder})

        check_code, check_out = router.run_check(project.get("check"), project["path"],
                                                 self.cfg.get("check_timeout", 600))
        if check_code not in (0, 130):
            self.store.add(pid, cid, {"role": "note", "text": f"The check failed. Asking {name(coder)} to fix it."})
            session = self.store.chat(pid, cid).get("sessions", {}).get(coder)
            fix = self.run_agent(lane, project, cid, coder, FIX.format(check=router.tail(check_out, 3000)), "fix",
                                 session=session)
            self.store.finish_live(pid, cid)
            files += fix["files"]
            if fix["stopped"]:
                return self.store.add(pid, cid, {"role": "result", "ok": False, "reason": "stopped by you",
                                                 "files": sorted(set(files)), "agent": coder})
            turn = fix if fix["code"] == 0 else turn
            check_code, check_out = router.run_check(project.get("check"), project["path"],
                                                     self.cfg.get("check_timeout", 600))

        reviewer = next((c for c in self.coders if c != coder and self.available(c)), None)
        if job.get("review") and reviewer and check_code == 0:
            review = self.run_agent(lane, project, cid, reviewer, REVIEWER.format(
                reviewer=name(reviewer), author=name(coder), project=project["name"], path=project["path"],
                brief=job["brief"], check="passed", output=router.tail(turn["output"], 3000),
                diff=self.review_diff(project), notes=self.project_notes(project)), "review")
            self.store.finish_live(pid, cid)
            files += review["files"]
            if review["files"]:
                check_code, check_out = router.run_check(project.get("check"), project["path"],
                                                         self.cfg.get("check_timeout", 600))
            approved = review["code"] == 0 and not review["files"] and APPROVED.search(review["output"])
            self.store.add(pid, cid, {"role": "note", "text": f"{name(reviewer)} approved the changes." if approved
                                      else f"{name(reviewer)} reviewed and made fixes." if review["files"]
                                      else f"{name(reviewer)} reviewed without approving."})

        files = sorted(set(files))
        ok = check_code == 0
        for decision in DECISION.findall(turn["output"]):
            self.store.remember(pid, name(coder), decision)
        if ok and files:
            summary = f"Changed {', '.join(files[:5])}" + (f" +{len(files)-5} more" if len(files) > 5 else "")
            chat = self.store.chat(pid, cid)
            user_msg = next((m["text"] for m in reversed(chat["messages"]) if m["role"] == "user"), "")
            if user_msg:
                summary += f" ({' '.join(user_msg.split()[:8])})"
            self.store.remember(pid, name(coder), summary)
        self.store.add(pid, cid, {"role": "result", "ok": ok, "files": files, "agent": coder,
                                  "check": "" if ok else router.tail(check_out, 2000),
                                  "checked": bool(project.get("check")),
                                  "reason": "" if ok else "the check still fails"})
        if self.report_enabled and (not ok or files):
            self.report(lane, project, cid, coder, files, ok, check_out, turn["output"])

    def report(self, lane, project, cid, coder, files, ok, check_out, output):
        hermes = self.orchestrator
        if not self.available(hermes):
            return
        session = self.store.chat(project["id"], cid).get("sessions", {}).get(hermes)
        check = ("passed" if project.get("check") else "no check configured") if ok else f"failed:\n{router.tail(check_out, 1500)}"
        diff = self.review_diff(project) if files else "(no changes)"
        prompt = REPORT.format(coder=name(coder), files=", ".join(files) or "none", check=check,
                               output=router.tail(output, 3000), diff=router.tail(diff, 4000))
        if not session:
            prompt = f'You are Hermes, the orchestrator for the "{project["name"]}" project.\n\n' + prompt
        turn = self.run_agent(lane, project, cid, hermes, prompt, "report", session=session,
                              folder=self.hermes_folder(project, cid))
        self.store.finish_live(project["id"], cid)
        if turn["code"] not in (0, 130):
            with self.store.lock:  # a failed report is noise; drop it
                chat = self.store._load(project["id"], cid)
                if chat["messages"] and chat["messages"][-1].get("step") == "report":
                    chat["messages"].pop()
                    self.store._save(project["id"], cid)

    def review_diff(self, project):
        folder = project["path"]
        if not (Path(folder) / ".git").exists():
            return "(not a git repository; read the changed files directly)"
        diff = subprocess.run(["git", "diff", "HEAD"], cwd=folder, capture_output=True, encoding="utf-8",
                              errors="replace").stdout
        new = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=folder,
                             capture_output=True, text=True).stdout.splitlines()
        for path in new:
            if len(diff) > MAX_REVIEW_DIFF:
                break
            diff += subprocess.run(["git", "diff", "--no-index", "--", "/dev/null", path], cwd=folder,
                                   capture_output=True, encoding="utf-8", errors="replace").stdout
        return (diff[:MAX_REVIEW_DIFF] + "\n... (truncated)") if len(diff) > MAX_REVIEW_DIFF else (diff or "(no changes)")

    # ---- project helpers for front ends ----

    def diff(self, pid):
        project = self.store.project(pid)
        folder = project["path"]
        if not (Path(folder) / ".git").exists():
            return {"status": "", "diff": "", "git": False}
        status = subprocess.run(["git", "status", "--short"], cwd=folder, capture_output=True, text=True).stdout
        diff = subprocess.run(["git", "diff"], cwd=folder, capture_output=True, encoding="utf-8",
                              errors="replace").stdout
        return {"status": status, "diff": diff[:400_000], "git": True}

    def doctor(self):
        """Is each agent installed and signed in, and does each project folder exist?"""
        rows = []
        for agent, spec in self.cfg["agents"].items():
            binary = spec["command"][0]
            installed = bool(shutil.which(binary) or Path(binary).exists())
            login = ""
            if installed and agent == "claude":
                login = self._run_json(["claude", "auth", "status"], lambda d: "signed in" if d.get("loggedIn")
                                       else "NOT signed in (run: claude auth login)")
            elif installed and agent == "chatgpt":
                out = self._run([binary, "login", "status"])
                login = "signed in" if "Logged in" in out else "NOT signed in (open the ChatGPT app and sign in)"
            elif installed and agent == "hermes":
                out = self._run([binary, "config", "get", "model.default"]).strip().splitlines()
                login = f"model {out[0]}" if out else ""
            until, reason = self.unavailable.get(agent, (0, ""))
            rows.append({"agent": agent, "name": name(agent), "installed": installed, "login": login,
                         "role": "orchestrator" if agent == self.orchestrator else "coder" if agent in self.coders else "",
                         "limited": reason if until > time.time() else ""})
        projects = [{"name": p["name"], "path": p["path"], "exists": Path(p["path"]).is_dir(),
                     "git": (Path(p["path"]) / ".git").exists(), "coders": p["coders"], "check": p.get("check", "")}
                    for p in self.store.projects()]
        return {"agents": rows, "projects": projects}

    @staticmethod
    def _run(cmd):
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            return result.stdout + result.stderr  # some CLIs print their status to stderr
        except (OSError, subprocess.TimeoutExpired):
            return ""

    def _run_json(self, cmd, describe):
        try:
            return describe(json.loads(self._run(cmd) or "{}"))
        except ValueError:
            return ""
