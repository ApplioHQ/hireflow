#!/usr/bin/env python3
"""Chat with your agents from the terminal. Start it with: npm run agents

Hermes reads every message: it answers questions itself and hands code to a coder (Claude or ChatGPT),
working in the current project's folder. In a real terminal this opens the full interface (tui.py);
when input or output is piped it falls back to a plain line-by-line mode with the same commands.
"""
import datetime as dt
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
import engine  # noqa: E402
import router  # noqa: E402

COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")
AGENT_COLORS = {"claude": "38;5;173", "hermes": "38;5;75", "chatgpt": "38;5;36"}
MENTION = re.compile(r"^\s*@(\w+)\s*(.*)$", re.S)
PASTE_HELP = "Copy a screenshot with Cmd+Ctrl+Shift+4 (or copy an image), then /paste."
IMAGE_TYPES = engine.IMAGE_TYPES

# Glyphs (escaped so this file stays plain ASCII)
DOT = "⏺"
ELBOW = "⎿"
MIDDOT = "·"
ARROW = "→"

REVIEW_REQUEST = ("Review the uncommitted changes in this project. List concrete problems: bugs, risky or "
                  "unintended changes, missing pieces. Be specific and brief. Do not change any files.")

COMMANDS = {  # name -> (description, takes an argument)
    "help": ("Show help and commands", False),
    "new": ("Start a new chat in this project", False),
    "clear": ("Start a new chat (same as /new)", False),
    "resume": ("Open an earlier chat in this project", False),
    "chats": ("List chats in this project", False),
    "project": ("Switch project, or /project add <folder>, /project coder <name>", False),
    "model": ("Who handles messages: Hermes (decides) or a coder directly", False),
    "attach": ("Attach a file to your next message", True),
    "paste": ("Attach the image on your clipboard", False),
    "review": ("Ask for a review of the uncommitted changes", False),
    "diff": ("Show this project's uncommitted changes (/diff full for all)", False),
    "doctor": ("Agents, logins, limits and projects", False),
    "status": ("Same as /doctor", False),
    "memory": ("What the agents remember about this project", False),
    "cost": ("Estimated agent usage from the logs", False),
    "search": ("Search all chats in every project", True),
    "rename": ("Rename this chat", True),
    "pin": ("Pin or unpin this chat", False),
    "archive": ("Archive this chat", False),
    "delete": ("Delete this chat (or /delete <number> from /chats)", False),
    "export": ("Save this chat to a markdown file", False),
    "exit": ("Exit", False),
}

HELP = """\
Just type. Hermes answers questions itself and hands code changes to the project's coder
({coders}), then reports back. Your chat stays open: type again to follow up, /new for another.

  @claude @chatgpt   send this message straight to a coder (skips Hermes)
  @hermes            let Hermes decide (the default)
  @path              attach a file; dragging a file in, ctrl+v or /paste also attach
  !command           run a shell command in the project folder
  #note              save a note to this project's memory for every agent

Commands:
{commands}"""

SHORTCUTS = [
    ("enter", "send"), ("\\+enter / option+enter", "new line"),
    ("shift+tab", "Hermes or a coder"), ("ctrl+p", "switch project"),
    ("esc", "stop / close menu"), ("up / down", "message history"),
    ("ctrl+r", "search history"), ("ctrl+v", "paste a screenshot"),
    ("ctrl+c", "clear input (twice to exit)"), ("ctrl+d", "exit"),
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
    return re.sub(r"[ \t]{2,}", " ", "".join(out)).strip(), files


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
    """What has been shown so far of one chat."""

    def __init__(self, pid, cid, seen):
        self.pid, self.cid, self.seen = pid, cid, seen
        self.printed = {}   # message index -> characters shown
        self.partial = {}   # message index -> unfinished line
        self.queued_note = False
        self.started = time.time()


class Shell:
    """Projects, chats and commands, shared by the terminal UI and the plain line mode.

    Nothing here blocks on an agent: submit() starts work and pump() shows whatever is new.
    """

    def __init__(self, cfg, poll=0.15, out=None, store=None, cwd=None):
        self.engine = engine.Engine(cfg, store)
        self.engine.ensure_defaults()
        self.store = self.engine.store
        self.cfg = cfg
        self.poll = poll
        self.out = out or (lambda text="": print(text, flush=True))
        start = self.store.project_for_path(cwd or os.environ.get("INIT_CWD") or os.getcwd())
        projects = self.store.projects()
        self.pid = (start or (projects[0] if projects else {})).get("id")
        self.focus = None     # current chat id
        self.agent = None     # None = Hermes decides; otherwise a coder name
        self.pending = []     # files attached with /attach or /paste, sent with the next message
        self.watches = []
        self.hinted = False
        self.confirm_delete = (None, 0)  # chat waiting for a second /delete, and when it was asked
        self.handlers = {
            "help": self.help, "new": self.new, "clear": self.new, "resume": self.resume, "chats": self.chats,
            "open": self.resume, "project": self.project_cmd, "model": self.model, "agent": self.model,
            "attach": self.attach, "paste": self.paste, "review": self.review, "diff": self.diff,
            "doctor": self.doctor, "status": self.doctor, "memory": self.memory, "cost": self.cost,
            "search": self.search, "rename": self.rename, "pin": self.pin, "archive": self.archive,
            "export": self.export, "delete": self.delete, "exit": lambda a: False, "quit": lambda a: False,
        }

    # ---- naming ----

    def project(self):
        if not self.pid:
            raise SystemExit("No project yet. Add one with /project add <folder>.")
        return self.store.project(self.pid)

    def label(self, agent):
        return engine.name(agent or self.engine.orchestrator)

    def modes(self):
        """Who handles messages, in Shift+Tab order: Hermes first, then each coder directly."""
        return [self.engine.orchestrator, *self.engine.coders]

    def current_owner(self):
        return self.agent or self.engine.orchestrator

    @property
    def default(self):
        return self.current_owner()

    def set_mode(self, agent, quiet=False):
        agent = (agent or "").lower()
        if agent not in self.modes():
            raise SystemExit(f"Choose one of: {', '.join(self.modes())}.")
        self.agent = None if agent == self.engine.orchestrator else agent
        if not quiet:
            self.out(f"Messages go to {self.label(agent)}" + ("" if self.agent else " (it answers or hands code to a coder)") + ".")

    def default_coder(self):
        return self.engine.default_coder(self.project()) if self.pid else None

    def prompt(self):
        files = f" [{len(self.pending)} file{'s' if len(self.pending) != 1 else ''}]" if self.pending else ""
        name = self.project()["name"] if self.pid else "no project"
        who = "" if not self.agent else f" ({self.label(self.agent)})"
        return f"{name}{who}{files} > "

    def chat_title(self):
        if not self.focus:
            return ""
        try:
            return self.store.chat(self.pid, self.focus)["title"]
        except engine.ChatError:
            return ""

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
        except (SystemExit, engine.ChatError) as e:
            self.out(paint(str(getattr(e, "code", None) or e), "31"))
        return True

    def split_mention(self, line):
        m = MENTION.match(line)
        if m and m.group(1).lower() in self.modes():
            return m.group(1).lower(), m.group(2).strip()
        return None, line

    def send(self, text, agent=None, files=None):
        project = self.project()
        target = agent if agent is not None else self.agent
        if target == self.engine.orchestrator:
            target = None
        if files:
            self.out(dim(f"  {ELBOW} attached: " + ", ".join(Path(f).name for f in files)))
        if self.focus is None:
            self.focus = self.engine.new_chat(project["id"], text, files, target)
            seen = 1
        else:
            seen = len(self.store.chat(project["id"], self.focus)["messages"]) + 1
            self.engine.send(project["id"], self.focus, text, files, target)
        self.watch(project["id"], self.focus, seen)

    def watch(self, pid, cid, seen=0, printed=None, partial=None):
        w = Watch(pid, cid, seen)
        if printed is not None:
            w.printed, w.partial = printed, partial
        self.watches.append(w)
        return w

    # ---- streaming ----

    def busy(self):
        return bool(self.watches)

    def pump(self):
        """Show anything new in watched chats. Returns True while any is still working."""
        for w in list(self.watches):
            busy = self.engine.busy(w.pid, w.cid)
            chat = self.store.chat(w.pid, w.cid)
            for i, m in enumerate(chat["messages"]):
                if i < w.seen or m["role"] == "user":
                    continue
                self.print_message(i, m, w.printed, w.partial)
            blocker = self.engine.waiting_behind(w.pid, w.cid)
            if blocker and not w.queued_note:
                w.queued_note = True
                self.out(dim(f"  {ELBOW} queued behind another chat in this project"))
            if not busy and not any(m.get("live") for m in chat["messages"]):
                self.watches.remove(w)
                if not self.hinted:
                    self.hinted = True
                    self.out(dim("  Reply to follow up in this chat, or /new to start another."))
        return bool(self.watches)

    def wait(self):
        """Line mode: keep showing output until watched chats finish. Ctrl-C stops them."""
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
                self.engine.stop(w.pid, w.cid)
                stopped.append(w.cid)
            except engine.ChatError:
                pass
        return stopped

    def working(self):
        """(agent, step, seconds) for each agent producing output now, for the spinner."""
        items = []
        for w in self.watches:
            chat = self.store.chat(w.pid, w.cid)
            live = next((m for m in reversed(chat["messages"]) if m.get("live")), None)
            if live:
                try:
                    started = dt.datetime.fromisoformat(live["time"]).timestamp()
                except (KeyError, ValueError):
                    started = w.started
                items.append((live.get("agent") or "agent", live.get("step") or "", max(0, time.time() - started)))
            elif self.engine.status(w.pid, w.cid) == "queued":
                items.append(("queued", "", time.time() - w.started))
            elif self.engine.busy(w.pid, w.cid):
                items.append(("checking", "", time.time() - w.started))
        return items

    def live_partial(self):
        for w in self.watches:
            for text in w.partial.values():
                if text and not re.match(r"^\W*(DELEGATE|REVIEW|BRIEF|TITLE):", text):
                    return text
        return ""

    def print_message(self, i, m, printed, partial):
        if m["role"] == "result":
            if i not in printed:
                printed[i] = 0
                self.print_result(m)
            return
        if m["role"] == "note":
            if i not in printed:
                printed[i] = 0
                self.out(dim(f"  {ELBOW} {m['text']}"))
            return
        if m["role"] != "agent":
            return
        agent = m.get("agent") or "agent"
        step = m.get("step") or ""
        if step == "delegate" or (step == "orchestrate" and m.get("live")):
            if step == "delegate" and printed.get(i) != -1:
                printed[i] = -1
                partial[i] = ""
                self.out("")
                self.out(paint(DOT, AGENT_COLORS["hermes"]) + " " + paint("Hermes", "1") + " " + ARROW + " "
                         + paint(engine.name(m.get("coder", "")), "1;" + AGENT_COLORS.get(m.get("coder"), "0"))
                         + (dim("  (with review)") if m.get("review") else ""))
                brief = " ".join((m.get("brief") or "").split())
                if brief:
                    self.out(dim(f"  {ELBOW} {brief[:200]}{'...' if len(brief) > 200 else ''}"))
            return
        if i not in printed:
            printed[i] = 0
            partial[i] = ""
            label = {"code": "coding", "fix": "fixing the check", "review": "reviewing", "report": ""}.get(step, "")
            self.out("")
            self.out(paint(DOT, AGENT_COLORS.get(agent, "0")) + " " + paint(engine.name(agent), "1")
                     + (dim(f"  {MIDDOT} {label}") if label else ""))
        if printed[i] == -1:
            return
        text = m.get("text", "")
        new = text[printed[i]:]
        printed[i] = len(text)
        lines = (partial[i] + new).split("\n")
        partial[i] = lines.pop()
        for line in lines:
            self.print_line(line)
        if not m.get("live") and partial[i]:
            self.print_line(partial[i])
            partial[i] = ""

    def print_line(self, line):
        if re.match(r"^\W*(DELEGATE|REVIEW|BRIEF|TITLE):", line):
            return
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
        files = [f for f in m.get("files", []) if f]
        changed = f" {MIDDOT} changed {', '.join(files)}" if files else ""
        lead = f"  {ELBOW} "
        if m.get("answer"):
            if files:
                self.out(lead + paint(f"Changed files while answering: {', '.join(files)}", "33"))
        elif m.get("ok"):
            check = " check passed" if m.get("checked", True) else ""
            self.out(lead + paint(f"Done{',' + check if check else ''}", "32")
                     + dim(f" {MIDDOT} {engine.name(m['agent'])}" if m.get("agent") else "") + dim(changed))
        else:
            self.out(lead + paint(f"Not finished: {m.get('reason') or 'see the log'}", "31") + dim(changed))
            for line in (m.get("check") or "").strip().splitlines()[-8:]:
                self.out(dim("     " + line))

    # ---- notes (the UI's # mode) ----

    def remember(self, note):
        if not " ".join(note.split()):
            raise SystemExit("Write the note after #.")
        self.store.remember(self.project()["id"], "you", note)
        self.out(dim(f"  {ELBOW} Saved to {self.project()['name']}'s memory, so every agent will see it."))

    # ---- commands ----

    def help(self, arg):
        width = max(len(n) for n in COMMANDS) + 2
        lines = [f"  /{n:<{width}}{d}" for n, (d, _) in COMMANDS.items() if n not in ("clear", "status")]
        self.out(HELP.format(commands="\n".join(lines),
                             coders=" or ".join(engine.name(c) for c in self.engine.coders)))

    def new(self, arg):
        self.focus = None
        if arg:
            self.submit(arg)
        else:
            self.out(dim(f"New chat in {self.project()['name']}. Type what you need."))

    def chats(self, arg):
        chats = self.store.chats(self.project()["id"])
        if not chats:
            self.out("No chats in this project yet. Just type what you need.")
            return
        for k, c in enumerate(chats[:20], start=1):
            status = self.engine.status(self.pid, c["id"])
            mark = paint("*", "1") if c["id"] == self.focus else " "
            flag = paint(f" {status}", "33") if status != "idle" else (paint(" failed", "31") if c["failed"] else "")
            self.out(f" {mark}{k:>2}. {c['title'][:70]}{flag}" + dim(f"  {c['updated'][5:16].replace('T', ' ')}"))
        self.out(dim("  /resume <number> opens one"))

    def resume(self, arg):
        chats = self.store.chats(self.project()["id"])
        if not arg:
            return self.chats("")
        if arg.isdigit() and 1 <= int(arg) <= len(chats):
            cid = chats[int(arg) - 1]["id"]
        else:
            cid = next((c["id"] for c in chats if c["id"] == arg or c["title"].lower().startswith(arg.lower())), None)
        if not cid:
            raise SystemExit(f"No chat matching '{arg}'. See /chats.")
        self.open(cid)

    def open(self, cid, pid=None):
        if pid:
            self.pid = pid
        chat = self.store.chat(self.pid, cid)
        self.focus = cid
        self.out(paint(chat["title"], "1") + dim(f"  ({self.project()['name']})"))
        printed, partial = {}, {}
        for i, m in enumerate(chat["messages"]):
            if m["role"] == "user":
                self.out("")
                self.out(dim("> " + m["text"]))
            else:
                self.print_message(i, m, printed, partial)
        if self.engine.busy(self.pid, cid):
            self.watch(self.pid, cid, 0, printed, partial)

    def project_cmd(self, arg):
        words = arg.split(maxsplit=1)
        if not words or words[0] == "list":
            for p in self.store.projects():
                mark = paint("*", "1") if p["id"] == self.pid else " "
                coder = engine.name(self.engine.default_coder(p))
                self.out(f" {mark} {p['name']:<14} {coder:<9}" + dim(p["path"]))
            self.out(dim("  /project <name> switches, /project add <folder> adds one, /project coder <name> sets the coder"))
            return
        if words[0] == "add":
            if len(words) < 2:
                raise SystemExit("Usage: /project add <folder>")
            project = self.store.add_project(unescape_path(words[1]))
            self.switch(project["id"])
            self.out(f"Added {project['name']} ({project['path']}). Coder: {engine.name(project['coders'][0])}. "
                     + (f"Check: {project['check']}" if project["check"] else "No check found; set one in the app."))
            return
        if words[0] == "coder":
            coder = (words[1] if len(words) > 1 else "").lower()
            if coder not in self.engine.coders:
                raise SystemExit(f"Coders: {', '.join(self.engine.coders)}.")
            p = self.project()
            self.store.update_project(p["id"], coders=[coder] + [c for c in self.engine.coders if c != coder])
            self.out(f"{p['name']} now codes with {engine.name(coder)}.")
            return
        match = next((p for p in self.store.projects() if p["id"] == arg.lower() or p["name"].lower() == arg.lower()), None)
        if not match:
            raise SystemExit(f"No project '{arg}'. See /project list.")
        self.switch(match["id"])

    def switch(self, pid):
        self.pid = pid
        self.focus = None
        p = self.store.project(pid)
        self.out(f"Now in {p['name']} ({p['path']}). Coder: {engine.name(self.engine.default_coder(p))}.")

    def model(self, arg):
        if not arg:
            self.out(f"Messages go to {self.label(self.current_owner())}. Options: {', '.join(self.modes())}.")
            return
        self.set_mode(arg)

    def attach(self, arg):
        if arg == "clear":
            self.pending = []
            self.out("Attachments cleared.")
            return
        if not arg:
            self.out(("Attached for your next message: " + ", ".join(Path(f).name for f in self.pending)) if self.pending
                     else "Nothing attached. Drag a file in, use @path or /attach <path>, or /paste a screenshot.")
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

    def review(self, arg):
        self.focus = None
        self.send(REVIEW_REQUEST + (f" Focus on: {arg}" if arg else ""), None)

    def diff(self, arg):
        data = self.engine.diff(self.project()["id"])
        if not data["git"]:
            self.out("This project isn't a git repository, so there's no diff. Result lines list the files each coder changed.")
            return
        self.out(data["status"].rstrip() or "No uncommitted changes.")
        if not data["status"]:
            return
        args = ["git", "-c", f"color.ui={'always' if COLOR else 'never'}", "diff"] if arg == "full" else ["git", "diff", "--stat"]
        out = subprocess.run(args, cwd=self.project()["path"], capture_output=True, encoding="utf-8", errors="replace").stdout
        self.out(out.rstrip())
        if arg != "full":
            self.out(dim("/diff full for the whole diff"))

    def doctor(self, arg):
        data = self.engine.doctor()
        self.out(paint("Agents", "1"))
        for a in data["agents"]:
            state = "installed" if a["installed"] else paint("NOT installed", "31")
            extra = ", ".join(x for x in (a["login"], a["limited"] and paint(a["limited"], "31")) if x)
            self.out(f"  {a['name']:<9} {a['role']:<13} {state}" + (f", {extra}" if extra else ""))
        self.out(paint("Projects", "1"))
        for p in data["projects"]:
            where = "" if p["exists"] else paint(" (folder missing)", "31")
            self.out(f"  {p['name']:<14} {engine.name(p['coders'][0]):<9}" + dim(p["path"]) + where
                     + dim(f"  check: {p['check'] or 'none'}"))

    def memory(self, arg):
        self.out(self.store.memory(self.project()["id"]))

    def cost(self, arg):
        total, per_project = 0.0, {}
        for p in self.store.projects():
            for log in (self.store.project_dir(p["id"]) / "logs").glob("*.md"):
                spent = sum(float(x) for x in re.findall(r"\[cost \$([\d.]+)\]", log.read_text()))
                per_project[p["name"]] = per_project.get(p["name"], 0) + spent
                total += spent
        if not total:
            self.out("No Claude usage recorded yet. Hermes runs on a free model; ChatGPT uses your ChatGPT plan.")
            return
        self.out(f"Estimated Claude usage: ${total:.2f}")
        for name, spent in sorted(per_project.items(), key=lambda kv: -kv[1]):
            if spent:
                self.out(f"  {name:<14} ${spent:.2f}")
        self.out(dim("On a Claude plan this counts toward your usage limit; it isn't billed per chat."))

    def search(self, arg):
        if not arg:
            raise SystemExit("Usage: /search <words>")
        hits = self.store.search(arg)
        if not hits:
            self.out("No matches.")
        for h in hits[:15]:
            self.out(f"  {h['project']:<10} {h['title'][:50]:<52}" + dim(h["snippet"][:60]))

    def rename(self, arg):
        if not self.focus or not arg:
            raise SystemExit("Open a chat first, then /rename <new name>.")
        self.store.update_chat(self.pid, self.focus, title=arg)
        self.out(f"Renamed to {arg}.")

    def pin(self, arg):
        if not self.focus:
            raise SystemExit("Open a chat first.")
        pinned = not self.store.chat(self.pid, self.focus).get("pinned")
        self.store.update_chat(self.pid, self.focus, pinned=pinned)
        self.out("Pinned." if pinned else "Unpinned.")

    def archive(self, arg):
        if not self.focus:
            raise SystemExit("Open a chat first.")
        self.store.update_chat(self.pid, self.focus, archived=True)
        self.focus = None
        self.out("Archived. New chat started.")

    def delete(self, arg):
        chats = self.store.chats(self.project()["id"], archived=True)
        if arg.isdigit() and 1 <= int(arg) <= len(chats):
            target = chats[int(arg) - 1]
        elif arg:
            raise SystemExit(f"No chat number {arg}. See /chats.")
        else:
            target = next((c for c in chats if c["id"] == self.focus), None)
        if not target:
            raise SystemExit("Open a chat first, or /delete <number> from /chats.")
        waiting, asked = self.confirm_delete
        if waiting != target["id"] or time.time() - asked > 30:
            self.confirm_delete = (target["id"], time.time())
            self.out(paint(f"Delete \"{target['title']}\"? This can't be undone. Type /delete{' ' + arg if arg else ''} again to confirm.", "33"))
            return
        self.confirm_delete = (None, 0)
        self.engine.delete_chat(self.pid, target["id"])
        if self.focus == target["id"]:
            self.focus = None
        self.out(f"Deleted \"{target['title']}\".")

    def export(self, arg):
        if not self.focus:
            raise SystemExit("Open a chat first.")
        chat = self.store.chat(self.pid, self.focus)
        parts = [f"# {chat['title']}\n"]
        for m in chat["messages"]:
            if m["role"] == "user":
                parts.append(f"**You:** {m['text']}\n")
            elif m["role"] == "agent" and m.get("step") != "delegate":
                parts.append(f"**{engine.name(m.get('agent', 'agent'))}:**\n\n{m.get('text', '').strip()}\n")
            elif m.get("step") == "delegate":
                parts.append(f"_Hermes handed this to {engine.name(m.get('coder', ''))}._\n")
            elif m["role"] in ("note", "result"):
                parts.append(f"_{m.get('text') or ('Done' if m.get('ok') else 'Not finished: ' + (m.get('reason') or ''))}_\n")
        path = self.store.project_dir(self.pid) / "exports" / f"{self.focus}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(parts))
        self.out(f"Saved {path}")


def line_mode(shell):
    """Plain mode for pipes and dumb terminals."""
    try:
        import readline  # noqa: F401  (history and editing for input())
    except ImportError:
        pass
    shell.out(paint("Agents", "1") + dim(f"  {shell.project()['name'] if shell.pid else 'no project'}"))
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
