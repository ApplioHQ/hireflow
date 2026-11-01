#!/usr/bin/env python3
"""Chat with Claude and Hermes from the terminal. Start it with: npm run agents

In a real terminal this opens the full interface (tui.py). When input or output is piped it falls back
to a plain line-by-line mode with the same commands.
"""
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "app"))
import router  # noqa: E402
import server  # noqa: E402

COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
AGENT_COLORS = {"claude": "38;5;173", "hermes": "38;5;75", "chatgpt": "38;5;36"}
STATUS_COLORS = {"done": "32", "blocked": "31", "in_progress": "33", "pending": "36", "running": "33", "queued": "36"}
MENTION = re.compile(r"^\s*@(\w+)\s*(.*)$", re.S)
LEGACY = re.compile(r"^\s*(claude|hermes|both|auto)\s*:\s*(.+)$", re.S | re.I)
PASTE_HELP = "Copy a screenshot with Cmd+Ctrl+Shift+4 (or copy an image), then /paste."

# Glyphs (escaped so this file stays plain ASCII)
DOT = "⏺"
ELBOW = "⎿"
MIDDOT = "·"

REVIEW_REQUEST = ("Review the uncommitted changes in this repo (look at git status and git diff). List concrete "
                  "problems: bugs, risky or unintended changes, missing pieces. Be specific and brief. "
                  "Do not change any files.")

COMMANDS = {  # name -> (description, takes an argument)
    "help": ("Show help and commands", False),
    "new": ("Start a new task", False),
    "clear": ("Start a new task (same as /new)", False),
    "resume": ("Switch to an earlier task", False),
    "open": ("Switch to a task by ID", True),
    "tasks": ("List tasks", False),
    "model": ("Choose who handles messages: auto, claude, hermes, chatgpt, both", False),
    "agent": ("Same as /model", False),
    "attach": ("Attach a file to your next message", True),
    "paste": ("Attach the image on your clipboard", False),
    "run": ("Run the current task (if pending or blocked)", False),
    "reset": ("Set the current blocked task back to pending", False),
    "review": ("Ask for a review of the uncommitted changes", False),
    "diff": ("Show uncommitted changes (/diff full for all)", False),
    "status": ("Repo, agents, logins and what's running", False),
    "cost": ("Estimated agent usage from the logs", False),
    "handoff": ("Show the latest handoff note", False),
    "context": ("Show the decisions log", False),
    "log": ("Show a task's latest log", False),
    "export": ("Save the current task's conversation to a file", False),
    "exit": ("Exit", False),
    "quit": ("Exit", False),
}

HELP = """\
Just type. On Auto, Hermes answers questions and hands code changes to Claude
(messages with screenshots go to Claude, since Hermes can't see images).
After a task runs you stay in it: type again to follow up, or /new to start another.

  @claude @hermes @chatgpt      pick who handles this message (in a task, hands it over)
  @both @auto                   Claude builds and Hermes reviews / let Auto decide
  @path                         attach a file; dragging a file in or /paste also attaches
  !command                      run a shell command in the repo
  #note                         save a note to agent_state/context.md for both agents

Commands:
{commands}"""

SHORTCUTS = [
    ("enter", "send"), ("\\+enter / option+enter", "new line"),
    ("shift+tab", "switch agent"), ("esc", "stop the agent / close menu"),
    ("up / down", "message history"), ("ctrl+r", "search history"), ("ctrl+v", "paste a screenshot"),
    ("ctrl+c", "clear input (twice to exit)"), ("ctrl+d", "exit"), ("ctrl+l", "redraw the screen"),
    ("/", "commands"), ("@", "files and agents"), ("!", "shell command"), ("#", "save a note"),
]


def paint(text, code):
    return f"\033[{code}m{text}\033[0m" if COLOR and code else text


def dim(text):
    return paint(text, "2")


def unescape_path(text):
    """A path as a terminal pastes it on drag-and-drop: backslash-escaped or quoted."""
    text = text.strip()
    if len(text) > 1 and text[0] == text[-1] and text[0] in "'\"":
        text = text[1:-1]
    return os.path.expanduser(re.sub(r"\\(.)", r"\1", text))


def extract_files(line):
    """Pull dragged-in file paths out of a message. Returns (text without them, [paths])."""
    files, out, i = [], [], 0
    while i < len(line):
        starts_word = i == 0 or line[i - 1].isspace()
        quote = line[i] if line[i] in "'\"" and starts_word else ""
        j = i + 1 if quote else i
        if starts_word and line[j:j + 1] in ("/", "~"):
            found = None
            for end in range(len(line), j, -1):  # longest match that is a real file
                if quote and line[end - 1] != quote:
                    continue
                candidate = unescape_path(line[i:end])
                if os.path.isfile(candidate):
                    found = (end, candidate)
                    break
            if found:
                files.append(found[1])
                i = found[0]
                continue
        out.append(line[i])
        i += 1
    text = re.sub(r"[ \t]{2,}", " ", "".join(out)).strip()
    return text, files


def clipboard_image():
    """Save the clipboard image to a temp PNG and return its path, or None if there is no image."""
    if not shutil.which("osascript"):
        return None
    dest = Path(tempfile.mkdtemp(prefix="applio-paste-")) / f"clipboard-{time.strftime('%H%M%S')}.png"
    result = subprocess.run(
        ["osascript", "-e", f'set f to open for access POSIX file "{dest}" with write permission',
         "-e", "write (the clipboard as «class PNGf») to f", "-e", "close access f"],
        capture_output=True, text=True)
    if result.returncode != 0 or not dest.exists() or dest.stat().st_size == 0:
        return None
    return str(dest)


class Watch:
    """What has been shown so far of one task's thread."""

    def __init__(self, task_id, seen):
        self.task_id = task_id
        self.seen = seen      # messages before this index were already on screen
        self.printed = {}     # message index -> characters shown (-1 = finished route message)
        self.partial = {}     # message index -> unfinished line
        self.queued_note = False
        self.started = time.time()


class Shell:
    """Commands and conversation logic shared by the full terminal UI and the plain line mode.

    Nothing here blocks on an agent: submit() starts work and pump() shows whatever is new.
    """

    def __init__(self, cfg, poll=0.15, out=None):
        router.say = lambda *args: None  # this shell draws its own output
        self.app = server.App(cfg)
        self.cfg = cfg
        self.state = cfg["state"]
        self.poll = poll
        self.out = out or (lambda text="": print(text, flush=True))
        self.focus = None
        self.default = "auto" if self.app.auto_ready() else next(iter(cfg["agents"]))
        self.hinted = False
        self.pending = []  # files attached with /attach or /paste, sent with the next message
        self.watches = []
        self.last_agent = {}  # task -> agent of the last message shown (to print headers only on change)
        self.handlers = {
            "new": self.new, "clear": self.new, "open": self.open, "resume": self.open, "tasks": self.tasks,
            "agent": self.agent, "model": self.agent, "run": self.run, "reset": self.reset, "diff": self.diff,
            "handoff": lambda a: self.show_file("handoff.md"), "context": lambda a: self.show_file("context.md"),
            "log": self.log, "help": self.help, "attach": self.attach, "paste": self.paste,
            "status": self.status, "cost": self.cost, "review": self.review, "export": self.export,
            "quit": lambda a: False, "exit": lambda a: False,
        }
        self.commands = self.handlers  # kept for older callers

    # ---- naming ----

    def resolve(self, word):
        """Map what the user typed (auto, claude, hermes, both) to an owner the app accepts."""
        word = word.lower()
        if word == "both":
            word = "relay"
        try:
            return self.app.check_agent(word)
        except server.ApiError as e:
            raise SystemExit(str(e))

    def label(self, owner):
        return server.name(owner) if owner != "auto" else "Auto"

    def modes(self):
        """Choices for who handles messages, in Shift+Tab order."""
        choices = []
        if self.app.auto_ready():
            choices.append("auto")
        choices += list(self.cfg["agents"])
        if len(self.cfg["agents"]) >= 2:
            choices.append(self.resolve("both"))
        return choices

    def current_owner(self):
        return self.app.row(self.focus)["owner"] if self.focus else self.default

    def prompt(self):
        files = f" [{len(self.pending)} file{'s' if len(self.pending) != 1 else ''}]" if self.pending else ""
        if self.focus:
            return f"{self.focus}{files} > "
        return f"new{files} > " if self.default == "auto" else f"new ({self.label(self.default)}){files} > "

    # ---- input ----

    def handle(self, line, files=()):
        """Line mode: run one line and wait for the agents. Returns False when the shell should exit."""
        keep = self.submit(line, files)
        self.wait()
        return keep

    def submit(self, line, files=()):
        """Start whatever a line asks for. Returns False when the shell should exit."""
        line = line.strip()
        if not line and not files:
            return True
        try:
            text, dragged = extract_files(line)
            first_word = line[1:].split(" ")[0].lower()
            if line.startswith("/") and (first_word in self.handlers or not dragged):
                cmd, _, arg = line[1:].partition(" ")
                fn = self.handlers.get(cmd.lower())
                if fn is None:
                    self.out(f"Unknown command /{cmd}. Type /help.")
                    return True
                return fn(arg.strip()) is not False
            agent, text = self.split_mention(text) if text else (None, "")
            files = self.pending + list(files) + dragged
            if not text and files:
                text = "Take a look at the attached file." if len(files) == 1 else "Take a look at the attached files."
            if not text:
                raise SystemExit("Write a message after the agent name.")
            self.send(text, agent, files)
            self.pending = []
        except (SystemExit, server.ApiError) as e:
            self.out(paint(str(getattr(e, "code", None) or e), "31"))
        return True

    def split_mention(self, line):
        m = MENTION.match(line) or LEGACY.match(line)
        if m and (m.group(1).lower() in ("auto", "both") or m.group(1).lower() in self.cfg["agents"]):
            return self.resolve(m.group(1)), m.group(2).strip()
        return None, line

    def send(self, text, agent=None, files=None):
        if files:
            self.out(dim(f"  {ELBOW} attached: " + ", ".join(Path(f).name for f in files)))
            target = agent or self.current_owner()
            images = [f for f in files if Path(f).suffix.lower() in server.IMAGE_TYPES]
            if images and target in self.cfg["agents"] and not self.app.sees_images(target):
                self.out(paint(f"  {server.name(target)} can't see images. Use Auto or @claude for screenshots.", "33"))
        if self.focus is None:
            self.focus = self.app.new_task(agent or self.default, text, files=files)
            seen = 1  # the request itself
        else:
            row = self.app.row(self.focus)
            seen = len(self.app.threads.get(self.focus, row["task"])["messages"])
            if agent and agent != row["owner"]:
                self.app.set_owner(self.focus, agent)
                self.out(dim(f"  {ELBOW} {self.focus} now goes to {self.label(agent)}"))
            if row["status"] == "pending":
                if files:
                    self.app.threads.ensure(self.focus, row["owner"], row["task"])
                    self.app.threads.attach(self.focus, self.app.save_attachments(self.focus, files))
                self.app.run_task(self.focus)
            else:
                self.app.reply(self.focus, text, files)
        self.watch(self.focus, seen)

    def watch(self, task_id, seen=0, printed=None, partial=None):
        w = Watch(task_id, seen)
        if printed is not None:
            w.printed, w.partial = printed, partial
        self.watches.append(w)
        return w

    # ---- streaming ----

    def busy(self):
        return bool(self.watches)

    def pump(self):
        """Show anything new in watched threads. Returns True while any watched task is still working."""
        for w in list(self.watches):
            busy = self.app.busy(w.task_id)
            thread = self.app.threads.get(w.task_id, "")
            for i, m in enumerate(thread["messages"]):
                if i < w.seen or m["role"] == "user":
                    continue
                if m["role"] == "result":
                    if i not in w.printed:
                        w.printed[i] = 0
                        self.print_result(m)
                    continue
                self.print_agent(w.task_id, i, m, w.printed, w.partial)
            blocker = self.blocking(w.task_id)
            if not w.queued_note and blocker:
                w.queued_note = True
                self.out(dim(f"  {ELBOW} queued, starts when {blocker} finishes"))
            if not busy and not any(m.get("live") for m in thread["messages"]):
                self.watches.remove(w)
                if not self.hinted:
                    self.hinted = True
                    self.out(dim("  Reply to follow up on this task, or /new to start another."))
        return bool(self.watches)

    def wait(self):
        """Line mode: keep showing output until watched tasks finish. Ctrl-C stops them."""
        try:
            while self.pump():
                time.sleep(self.poll)
        except KeyboardInterrupt:
            self.out(paint("\nStopping...", "33"))
            self.stop_all()
            while self.pump():
                time.sleep(self.poll)

    def stop_all(self):
        stopped = []
        for w in self.watches:
            try:
                self.app.stop(w.task_id)
                stopped.append(w.task_id)
            except server.ApiError:
                pass
        return stopped

    def working(self):
        """(agent, step, seconds) for each agent currently producing output, for a status line."""
        items = []
        for w in self.watches:
            thread = self.app.threads.get(w.task_id, "")
            live = next((m for m in reversed(thread["messages"]) if m.get("live")), None)
            if live:
                try:
                    started = dt.datetime.fromisoformat(live["time"]).timestamp()
                except (KeyError, ValueError):
                    started = w.started
                items.append((live.get("agent") or "agent", live.get("step") or "", max(0, time.time() - started)))
            elif self.app.busy(w.task_id):
                items.append(("queued", "", time.time() - w.started))
        return items

    def blocking(self, task_id):
        """The task a queued task is waiting behind, if it is actually waiting."""
        with self.app.lock:
            for lane in self.app.lanes:
                if task_id in lane.queued and lane.current not in (None, task_id):
                    return lane.current
        return None

    def queued_ids(self):
        with self.app.lock:
            return [t for lane in self.app.lanes for t in lane.queued]

    def print_agent(self, task_id, i, m, printed, partial):
        agent = m.get("agent") or "agent"
        if i not in printed:
            printed[i] = 0
            partial[i] = ""
            step = {"build": f"builds, turn {m.get('turn')}", "review": f"reviews, turn {m.get('turn')}"}.get(m.get("step"), "")
            if self.last_agent.get(task_id) != (agent, m.get("turn")) or step:
                self.out("")
                self.out(paint(DOT, AGENT_COLORS.get(agent, "0")) + " " + paint(server.name(agent), "1")
                         + (dim(f"  {MIDDOT} {step}") if step else ""))
            self.last_agent[task_id] = (agent, m.get("turn"))
        text = m.get("text", "")
        if m.get("step") == "route" and not m.get("live"):
            if printed[i] != -1:
                printed[i] = -1
                partial[i] = ""
                self.out(dim(f"  {ELBOW} {text}"))
            return
        if printed[i] == -1:
            return
        new = text[printed[i]:]
        printed[i] = len(text)
        lines = (partial[i] + new).split("\n")
        partial[i] = lines.pop()
        for line in lines:
            self.print_line(line)
        if not m.get("live") and partial[i]:
            self.print_line(partial[i])
            partial[i] = ""

    def live_partial(self):
        """The unfinished line an agent is typing right now (shown in the live area by the UI)."""
        for w in self.watches:
            for i, text in w.partial.items():
                if text and router.WANTS_CODE.match(text) is None:
                    return text
        return ""

    def print_line(self, line):
        if router.WANTS_CODE.match(line):
            return  # shown as "handing it to Claude" once routing finishes
        tool = re.match(r"^> (\S+)\s*(.*)$", line)
        if tool:
            arg = f"({tool.group(2)})" if tool.group(2) else ""
            self.out("  " + paint(DOT, "32") + " " + paint(tool.group(1), "1") + dim(arg))
        elif re.match(r"^\[(cost .*|\d+ tokens|stopped by user)\]$", line):
            self.out("  " + dim(f"{ELBOW} " + line.strip("[]")))
        elif line.strip():
            self.out("  " + line)
        else:
            self.out("")

    def print_result(self, m):
        files = [f for f in m.get("files", []) if f and not f.startswith("agent_state/")]
        changed = f" {MIDDOT} changed {', '.join(files)}" if files else ""
        lead = f"  {ELBOW} "
        if m.get("relay") == "agreed":
            self.out(lead + paint("Both agents agree: done", "32") + dim(f" {MIDDOT} {m.get('text', '')}"))
        elif m.get("relay") == "agent_failed":
            self.out(lead + paint(f"Stopped: {m.get('reason')}", "31") + dim(f" {MIDDOT} {m.get('text') or 'see /log'}"))
            self.out(dim("     Fix the cause, then /run to try again."))
        elif m.get("relay"):
            self.out(lead + paint(f"No agreement: {m.get('reason')}", "31") + dim(f" {MIDDOT} reply with directions or /run"))
        elif m.get("answer"):
            if not m.get("ok"):
                self.out(lead + paint(f"Stopped: {m.get('reason')}", "31"))
            elif files:
                self.out(lead + paint(f"Changed files while answering: {', '.join(files)}", "33"))
        elif m.get("step"):
            if m.get("approved"):
                self.out(lead + paint("Approved, check passed", "32"))
            elif m.get("ok"):
                self.out(lead + paint("Check passed", "32") + dim(changed))
            else:
                self.out(lead + paint(f"Check failed: {m.get('reason')}", "31"))
        elif m.get("ok"):
            self.out(lead + paint("Done, check passed", "32") + dim(changed + f" {MIDDOT} /diff to review"))
        else:
            self.out(lead + paint(f"Blocked: {m.get('reason') or 'see log'}", "31"))
            check = (m.get("check") or "").strip()
            if check and check != "skipped: agent failed":
                for line in check.splitlines()[-8:]:
                    self.out(dim("     " + line))
            self.out(dim("     Reply with how to fix it, or /run to try again."))

    # ---- notes and shell commands (used by the UI's # and ! modes) ----

    def remember(self, note):
        note = " ".join(note.split())
        if not note:
            raise SystemExit("Write the note after #.")
        path = self.state / "context.md"
        with path.open("a") as f:
            f.write(f"- {dt.date.today()} (you): {note}\n")
        self.out(dim(f"  {ELBOW} Saved to agent_state/context.md, so both agents will see it."))

    # ---- commands ----

    def help(self, arg):
        width = max(len(n) for n in COMMANDS) + 2
        lines = [f"  /{name:<{width}}{desc}" for name, (desc, _) in COMMANDS.items() if name not in ("quit", "agent", "clear")]
        self.out(HELP.format(commands="\n".join(lines)))

    def new(self, arg):
        self.focus = None
        if arg:
            self.submit(arg)
        else:
            self.out(dim("New task. Type what you need."))

    def open(self, arg):
        if not arg:
            return self.tasks("")
        row = self.app.row(arg.upper())
        self.focus = row["id"]
        thread = self.app.threads.get(row["id"], row["task"])
        self.out(paint(f"{row['id']}  {row['task']}", "1") + dim(f"  ({self.label(row['owner'])}, {row['status']})"))
        printed, partial = {}, {}
        self.last_agent.pop(row["id"], None)
        for i, m in enumerate(thread["messages"]):
            if m["role"] == "user":
                if i:
                    self.out("")
                self.out(dim("> " + m["text"]))
            elif m["role"] == "agent":
                self.print_agent(row["id"], i, m, printed, partial)
            else:
                printed[i] = 0
                self.print_result(m)
        if self.app.busy(row["id"]):
            self.watch(row["id"], 1, printed, partial)

    def attach(self, arg):
        if arg == "clear":
            self.pending = []
            self.out("Attachments cleared.")
            return
        if not arg:
            if self.pending:
                self.out("Attached for your next message: " + ", ".join(Path(f).name for f in self.pending))
            else:
                self.out("Nothing attached. Drag a file in, use @path or /attach <path>, or /paste a screenshot.")
            return
        path = unescape_path(arg)
        if not os.path.isfile(path):
            raise SystemExit(f"No file at {path}")
        self.pending.append(path)
        self.out(f"Attached {Path(path).name}. It goes with your next message (/attach clear to remove).")

    def paste(self, arg):
        if not shutil.which("osascript"):
            raise SystemExit("/paste needs macOS. Drag the file in or use /attach <path> instead.")
        path = clipboard_image()
        if not path:
            raise SystemExit(f"No image on the clipboard. {PASTE_HELP}")
        self.pending.append(path)
        self.out(f"Attached the clipboard image ({Path(path).stat().st_size // 1024} KB). It goes with your next message.")

    def tasks(self, arg):
        rows = self.app.rows()
        if not rows:
            self.out("No tasks yet. Just type what you need.")
            return
        snap = self.app.snapshot()
        live = {snap["current"]: "running", snap["quick"]["current"]: "running"}
        live.update({t: "queued" for t in snap["queued"] + snap["quick"]["queued"]})
        for r in rows[-20:]:
            status = live.get(r["id"], r["status"])
            text = r["task"] if len(r["task"]) <= 60 else r["task"][:57] + "..."
            mark = paint("*", "1") if r["id"] == self.focus else " "
            self.out(f" {mark}{r['id']:<4} {paint(f'{status:<11}', STATUS_COLORS.get(status, '0'))} "
                     f"{self.label(r['owner']):<16} {text}")
        if len(rows) > 20:
            self.out(dim(f"  ({len(rows) - 20} older tasks in agent_state/tasks.md)"))

    def agent(self, arg):
        if not arg:
            who = self.label(self.current_owner())
            self.out(f"{'This task goes to' if self.focus else 'New tasks go to'} {who}. "
                     f"Options: {', '.join(['auto', *self.cfg['agents'], 'both'])}.")
            return
        self.set_mode(self.resolve(arg))

    def set_mode(self, owner, quiet=False):
        """Who handles messages: the default for new tasks, and the current task's owner if in one."""
        if self.focus:
            self.app.set_owner(self.focus, owner)
        self.default = owner
        if not quiet:
            self.out(f"{self.focus} now goes to {self.label(owner)}." if self.focus else f"New tasks go to {self.label(owner)}.")

    def run(self, arg):
        if not self.focus:
            raise SystemExit("Open a task first (/resume or /open <ID>).")
        seen = len(self.app.threads.get(self.focus, "")["messages"])
        self.app.run_task(self.focus)
        self.watch(self.focus, seen)

    def reset(self, arg):
        if not self.focus:
            raise SystemExit("Open a task first (/resume or /open <ID>).")
        self.app.reset(self.focus)
        self.out(f"{self.focus} is pending again. /diff shows anything the failed run left behind; /run to retry.")

    def review(self, arg):
        if not self.app.diff()["status"].strip():
            raise SystemExit("No uncommitted changes to review.")
        self.focus = None
        self.send(REVIEW_REQUEST if not arg else f"{REVIEW_REQUEST} Focus on: {arg}",
                  self.resolve("auto") if self.app.auto_ready() else None)

    def diff(self, arg):
        data = self.app.diff()
        self.out(data["status"].rstrip() or "No uncommitted changes.")
        if not data["status"]:
            return
        args = ["git", "diff"] if arg == "full" else ["git", "diff", "--stat"]
        if arg == "full" and COLOR:
            args = ["git", "-c", "color.ui=always", "diff"]
        out = subprocess.run(args, cwd=self.cfg["repo"], capture_output=True, text=True,
                             encoding="utf-8", errors="replace").stdout
        self.out(out.rstrip())
        if arg != "full":
            self.out(dim("/diff full for the whole diff"))

    def status(self, arg):
        auth = "unknown"
        if shutil.which("claude"):
            try:
                result = subprocess.run(["claude", "auth", "status"], capture_output=True, text=True, timeout=8)
                info = json.loads(result.stdout or "{}")
                auth = (f"logged in ({info.get('subscriptionType') or info.get('authMethod')})"
                        if info.get("loggedIn") else "NOT logged in (run: claude auth login)")
            except (subprocess.TimeoutExpired, ValueError, OSError):
                pass
        snap = self.app.snapshot()
        rows = self.app.rows()
        counts = {}
        for r in rows:
            counts[r["status"]] = counts.get(r["status"], 0) + 1
        self.out(paint("Applio Agents", "1"))
        self.out(f"  repo      {self.cfg['repo']}  ({snap['branch'] or '?'})")
        self.out(f"  handles   {self.label(self.current_owner())}" + (f"  (in {self.focus})" if self.focus else ""))
        if snap["auto"]:
            self.out(f"  auto      {server.name(snap['auto']['answer'])} answers, {server.name(snap['auto']['code'])} codes")
        for name, spec in self.cfg["agents"].items():
            installed = "installed" if shutil.which(spec["command"][0]) else paint("NOT installed", "31")
            extra = f", {auth}" if name == "claude" else ""
            extra += ", can't see images" if not spec.get("vision", True) else ""
            self.out(f"  {name:<9} {installed}{extra}")
        running = [t for t in (snap["current"], snap["quick"]["current"]) if t]
        self.out(f"  running   {', '.join(running) or 'nothing'}"
                 + (f"  (queued: {', '.join(snap['queued'] + snap['quick']['queued'])})" if snap["queued"] or snap["quick"]["queued"] else ""))
        self.out(f"  tasks     " + ", ".join(f"{n} {s}" for s, n in counts.items()))

    def cost(self, arg):
        per_task, total = {}, 0.0
        for log in (self.state / "log").glob("*.md"):
            spent = sum(float(x) for x in re.findall(r"\[cost \$([\d.]+)\]", log.read_text()))
            task_id = re.match(r"\d{4}-\d{2}-\d{2}-(T\d+)", log.name)
            if spent and task_id:
                per_task[task_id.group(1)] = per_task.get(task_id.group(1), 0) + spent
                total += spent
        if not per_task:
            self.out("No Claude usage recorded in the logs yet. Hermes runs on a free model.")
            return
        self.out(f"Estimated Claude usage: ${total:.2f} across {len(per_task)} tasks")
        for task_id, spent in sorted(per_task.items(), key=lambda kv: -kv[1])[:8]:
            self.out(f"  {task_id:<5} ${spent:.2f}")
        self.out(dim("On a Claude plan this counts toward your usage limit; it isn't billed per task. "
                     "Hermes runs on a free model."))

    def export(self, arg):
        task_id = (arg or self.focus or "").upper()
        if not task_id:
            raise SystemExit("Open a task first, or /export <ID>.")
        row = self.app.row(task_id)
        thread = self.app.threads.get(task_id, row["task"])
        parts = [f"# {task_id}: {row['task']}\n"]
        for m in thread["messages"]:
            if m["role"] == "user":
                parts.append(f"**You:** {m['text']}\n")
            elif m["role"] == "agent":
                parts.append(f"**{server.name(m.get('agent') or 'agent')}:**\n\n{m.get('text', '').strip()}\n")
            elif m["role"] == "result":
                parts.append(f"_Result: {'ok' if m.get('ok') else 'blocked'} {m.get('reason') or ''}_\n")
        path = self.state / "exports" / f"{task_id}.md"
        path.parent.mkdir(exist_ok=True)
        path.write_text("\n".join(parts))
        self.out(f"Saved {path.relative_to(self.cfg['repo'])}")

    def show_file(self, name):
        path = self.state / name
        self.out(path.read_text().rstrip() if path.exists() else f"(no {name})")

    def log(self, arg):
        task_id = (arg or self.focus or "").upper()
        log_dir = self.state / "log"
        if task_id:
            candidates = [*log_dir.glob(f"*-{task_id}.md"), *log_dir.glob(f"*-{task_id}-*.md")]
        else:
            candidates = list(log_dir.glob("*.md"))
        if not candidates:
            self.out("No logs yet.")
            return
        text = max(candidates, key=lambda p: p.stat().st_mtime).read_text()
        self.out(text.split("## Prompt sent")[0].rstrip())


def line_mode(shell):
    """Plain mode for pipes and dumb terminals."""
    try:
        import readline  # noqa: F401  (history and editing for input())
    except ImportError:
        pass
    shell.out(paint("Applio Agents", "1") + dim(f"  {shell.cfg['repo'].name}"))
    shell.out("Just type. /help for commands.")
    while True:
        try:
            line = input(paint(shell.prompt(), "1"))
        except EOFError:
            shell.out()
            break
        except KeyboardInterrupt:
            shell.out()
            continue
        if not shell.handle(line):
            break


def main():
    cfg = router.load_config(router.DEFAULT_CONFIG)
    if sys.stdin.isatty() and sys.stdout.isatty() and os.environ.get("TERM") != "dumb" and "--plain" not in sys.argv:
        import tui
        tui.run(Shell(cfg))
    else:
        line_mode(Shell(cfg))


if __name__ == "__main__":
    main()
