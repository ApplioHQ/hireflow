"""Terminal interface for the agents, modeled on Claude Code's CLI.

Output scrolls normally above a live area that is redrawn in place: a spinner while agents work, queued
messages, the bordered input box, and a footer or menu under it. Python standard library only.
"""
import codecs
import json
import os
import re
import select
import shutil
import signal
import subprocess
import sys
import termios
import threading
import time
import unicodedata
from pathlib import Path

import cli
import engine
import router

ESC = "\x1b"
TL, TR, BL, BR, H, V = "╭", "╮", "╰", "╯", "─", "│"
POINTER = "❯"
SPARK = "✻"
SPINNER = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"]
ARROWS = "⏵⏵"
ELLIPSIS = "…"
DOT, ELBOW, MIDDOT = cli.DOT, cli.ELBOW, cli.MIDDOT
VERBS = {"orchestrate": "Thinking", "review": "Reviewing", "code": "Coding", "fix": "Fixing", "report": "Writing",
         "": "Working", "queued": "Waiting", "checking": "Checking"}
HISTORY = Path.home() / ".applio_agents_history"
ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07")
MODE_DESC = {"hermes": "decides: answers questions, hands code to the project's coder",
             "claude": "straight to Claude, skipping Hermes", "chatgpt": "straight to ChatGPT, skipping Hermes"}

CSI = {"A": "up", "B": "down", "C": "right", "D": "left", "H": "home", "F": "end", "Z": "shift-tab"}
TILDE = {"1": "home", "7": "home", "4": "end", "8": "end", "3": "delete", "5": "pageup", "6": "pagedown"}
SS3 = {"A": "up", "B": "down", "C": "right", "D": "left", "H": "home", "F": "end"}
CTRL = {"\r": "enter", "\n": "newline", "\x7f": "backspace", "\x08": "backspace", "\t": "tab",
        "\x01": "home", "\x05": "end", "\x0b": "kill-end", "\x15": "kill-start", "\x17": "kill-word",
        "\x03": "ctrl-c", "\x04": "ctrl-d", "\x0c": "ctrl-l", "\x12": "ctrl-r", "\x16": "ctrl-v",
        "\x02": "left", "\x06": "right", "\x10": "ctrl-p", "\x0e": "down", "\x1a": "ctrl-z"}
ALT = {"\r": "newline", "\n": "newline", "b": "word-left", "f": "word-right", "\x7f": "kill-word", "d": "kill-word-right"}


# ---- text measuring ----

def char_width(ch):
    if unicodedata.combining(ch) or ord(ch) < 32 or ord(ch) == 127:
        return 0
    return 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1


def width(text):
    return sum(char_width(c) for c in ANSI.sub("", text))


def fit(text, cols):
    """Cut text that may contain color codes to `cols` visible columns. Returns (text, columns used)."""
    out, used, i = [], 0, 0
    while i < len(text):
        m = ANSI.match(text, i)
        if m:
            out.append(m.group())
            i = m.end()
            continue
        w = char_width(text[i])
        if used + w > cols:
            break
        out.append(text[i])
        used += w
        i += 1
    return "".join(out) + ("\x1b[0m" if "\x1b[" in text else ""), used


def pad(text, cols):
    cut, used = fit(text, cols)
    return cut + " " * (cols - used)


def paint(text, code):
    return f"\x1b[{code}m{text}\x1b[0m" if code else text


def dim(text):
    return paint(text, "2")


def wrap(text, pos, cols):
    """Lay out editor text in rows of `cols` columns. Returns (rows, cursor_row, cursor_col)."""
    rows, cur = [], (0, 0)
    offset = 0
    for line in text.split("\n"):
        row, used, start = "", 0, offset
        if offset <= pos <= offset + len(line) and pos - offset == 0:
            cur = (len(rows), 0)
        for k, ch in enumerate(line):
            w = char_width(ch)
            if used + w > cols:
                rows.append(row)
                row, used = "", 0
            row += ch
            used += w
            if start + k + 1 == pos:
                cur = (len(rows), used)
        if used == cols and pos == offset + len(line) and line:
            rows.append(row)
            row, used = "", 0
            cur = (len(rows), 0)
        rows.append(row)
        offset += len(line) + 1
    return rows, cur[0], cur[1]


# ---- input pieces ----

class Keys:
    """Turns raw terminal bytes into ("char", c), ("key", name) and ("paste", text) events."""

    def __init__(self):
        self.buf = ""
        self.decoder = codecs.getincrementaldecoder("utf-8")("replace")
        self.paste = None

    def feed(self, data):
        self.buf += self.decoder.decode(data)
        return self.parse()

    def pending_escape(self):
        return self.buf == ESC

    def parse(self, flush=False):
        events = []
        while self.buf:
            if self.paste is not None:
                end = self.buf.find("\x1b[201~")
                if end < 0:
                    self.paste += self.buf
                    self.buf = ""
                    break
                self.paste += self.buf[:end]
                self.buf = self.buf[end + 6:]
                events.append(("paste", self.paste))
                self.paste = None
                continue
            c = self.buf[0]
            if c != ESC:
                self.buf = self.buf[1:]
                if c in CTRL:
                    events.append(("key", CTRL[c]))
                elif c >= " ":
                    events.append(("char", c))
                continue
            if len(self.buf) == 1:
                if flush:
                    events.append(("key", "esc"))
                    self.buf = ""
                break
            nxt = self.buf[1]
            if nxt == "[":
                m = re.match(r"\x1b\[([0-9;?]*)([~A-Za-z])", self.buf)
                if not m:
                    if flush or len(self.buf) > 32 or not re.fullmatch(r"\x1b\[[0-9;?]*", self.buf):
                        events.append(("key", "esc"))
                        self.buf = self.buf[1:]
                        continue
                    break
                self.buf = self.buf[m.end():]
                params, final = m.groups()
                if params == "200" and final == "~":
                    self.paste = ""
                elif final == "~":
                    first = params.split(";")[0]
                    if first == "13" or params.startswith("27;2;13"):
                        events.append(("key", "newline"))  # shift+enter in terminals that report it
                    elif first in TILDE:
                        events.append(("key", TILDE[first]))
                elif final == "u" and params.startswith("13"):
                    events.append(("key", "newline"))
                elif final in CSI:
                    mods = params.split(";")[1] if ";" in params else ""
                    if final in "CD" and mods in ("3", "5", "9"):
                        events.append(("key", "word-right" if final == "C" else "word-left"))
                    else:
                        events.append(("key", CSI[final]))
                continue
            if nxt == "O":
                if len(self.buf) < 3:
                    if flush:
                        events.append(("key", "esc"))
                        self.buf = ""
                    break
                name = SS3.get(self.buf[2])
                self.buf = self.buf[3:]
                if name:
                    events.append(("key", name))
                continue
            if nxt in ALT:
                events.append(("key", ALT[nxt]))
                self.buf = self.buf[2:]
            else:
                events.append(("key", "esc"))
                self.buf = self.buf[1:]
        return events


class Editor:
    """The text being typed, with a cursor. Multi-line."""

    def __init__(self):
        self.text = ""
        self.pos = 0

    def set(self, text):
        self.text, self.pos = text, len(text)

    def insert(self, s):
        self.text = self.text[:self.pos] + s + self.text[self.pos:]
        self.pos += len(s)

    def backspace(self):
        if self.pos:
            self.text = self.text[:self.pos - 1] + self.text[self.pos:]
            self.pos -= 1

    def delete(self):
        self.text = self.text[:self.pos] + self.text[self.pos + 1:]

    def left(self):
        self.pos = max(0, self.pos - 1)

    def right(self):
        self.pos = min(len(self.text), self.pos + 1)

    def bounds(self):
        start = self.text.rfind("\n", 0, self.pos) + 1
        end = self.text.find("\n", self.pos)
        return start, len(self.text) if end < 0 else end

    def home(self):
        self.pos = self.bounds()[0]

    def end(self):
        self.pos = self.bounds()[1]

    def up(self):
        start, _ = self.bounds()
        if start == 0:
            return False
        col = self.pos - start
        prev_start = self.text.rfind("\n", 0, start - 1) + 1
        self.pos = min(prev_start + col, start - 1)
        return True

    def down(self):
        start, end = self.bounds()
        if end == len(self.text):
            return False
        col = self.pos - start
        next_end = self.text.find("\n", end + 1)
        next_end = len(self.text) if next_end < 0 else next_end
        self.pos = min(end + 1 + col, next_end)
        return True

    def word_left(self):
        i = self.pos
        while i and not self.text[i - 1].isalnum():
            i -= 1
        while i and self.text[i - 1].isalnum():
            i -= 1
        self.pos = i

    def word_right(self):
        i, n = self.pos, len(self.text)
        while i < n and not self.text[i].isalnum():
            i += 1
        while i < n and self.text[i].isalnum():
            i += 1
        self.pos = i

    def kill_word(self):
        end = self.pos
        self.word_left()
        self.text = self.text[:self.pos] + self.text[end:]

    def kill_word_right(self):
        start = self.pos
        self.word_right()
        self.text = self.text[:start] + self.text[self.pos:]
        self.pos = start

    def kill_start(self):
        start, _ = self.bounds()
        if start == self.pos and start:
            start -= 1  # at the start of a line: join with the previous one
        self.text = self.text[:start] + self.text[self.pos:]
        self.pos = start

    def kill_end(self):
        _, end = self.bounds()
        if end == self.pos and end < len(self.text):
            end += 1
        self.text = self.text[:self.pos] + self.text[end:]


class Terminal:
    def __init__(self, fd=None, out=None):
        self.fd = sys.stdin.fileno() if fd is None else fd
        self.out = out or sys.stdout
        self.saved = None

    def enter(self):
        self.saved = termios.tcgetattr(self.fd)
        mode = termios.tcgetattr(self.fd)
        mode[0] &= ~(termios.IXON | termios.ICRNL | termios.INLCR)
        mode[3] &= ~(termios.ECHO | termios.ICANON | termios.ISIG | termios.IEXTEN)
        mode[6][termios.VMIN], mode[6][termios.VTIME] = 1, 0
        termios.tcsetattr(self.fd, termios.TCSADRAIN, mode)
        self.write("\x1b[?2004h")

    def leave(self):
        self.write("\x1b[?2004l\x1b[0m\x1b]0;\x07")
        if self.saved:
            termios.tcsetattr(self.fd, termios.TCSADRAIN, self.saved)

    def size(self):
        size = shutil.get_terminal_size((80, 24))
        return max(20, size.columns), max(8, size.lines)

    def read(self, timeout):
        ready, _, _ = select.select([self.fd], [], [], timeout)
        return os.read(self.fd, 4096) if ready else b""

    def write(self, text):
        self.out.write(text)
        self.out.flush()


# ---- the interface ----

class TUI:
    def __init__(self, shell, term=None, history_path=HISTORY):
        self.shell = shell
        self.term = term or Terminal()
        self.editor = Editor()
        self.keys = Keys()
        self.lock = threading.Lock()
        self.committed = []
        shell.out = self.commit
        self.cursor_row = 0
        self.live_height = 0
        self.popup = None
        self.dismissed = None
        self.picker = None
        self.show_shortcuts = False
        self.history_path = history_path
        self.history = self.load_history()
        self.hist_index = None
        self.hist_draft = ""
        self.pastes = {}
        self.attachments = {}
        self.queue = []
        self.flash_text, self.flash_until = "", 0
        self.exit_armed = 0
        self.last_esc = 0
        self.bash = None
        self.running = True
        self.spin = 0
        self.files_cache = (0, [])
        self.busy_since = None
        self.title = ""
        self.dirty = True

    # ---- output ----

    def commit(self, text=""):
        with self.lock:
            self.committed.extend(str(text).split("\n"))
        self.dirty = True

    def flash(self, text, seconds=3):
        self.flash_text, self.flash_until = text, time.time() + seconds
        self.dirty = True

    # ---- main loop ----

    def run(self):
        self.term.enter()
        try:
            self.welcome()
            while self.running:
                data = self.term.read(0.08)
                if data:
                    for event in self.keys.feed(data):
                        self.handle(event)
                elif self.keys.pending_escape():
                    for event in self.keys.parse(flush=True):
                        self.handle(event)
                self.tick()
                self.render()
        finally:
            self.stop_before_exit()
            self.clear_live()
            self.term.leave()
            self.save_history()

    def stop_before_exit(self, timeout=10):
        """Stop agents still working so their tasks are recorded as stopped, not left in_progress."""
        if not self.shell.busy() and not self.bash:
            return
        self.commit(dim(f"  {ELBOW} Stopping running work before exit{ELLIPSIS}"))
        self.interrupt()
        end = time.time() + timeout
        while (self.shell.busy() or self.bash) and time.time() < end:
            self.shell.pump()
            time.sleep(0.05)

    def tick(self):
        was_busy = self.shell.busy()
        self.shell.pump()
        busy = self.shell.busy() or self.bash is not None
        if busy:
            self.busy_since = self.busy_since or time.time()
            self.spin += 1
            self.dirty = True
        elif self.busy_since:
            if time.time() - self.busy_since > 15:
                self.term.write("\a")  # long run finished
            self.busy_since = None
        if was_busy and not self.shell.busy() and self.queue:
            message, files, shown = self.queue.pop(0)
            self.send(message, files, shown)
        if self.flash_text and time.time() > self.flash_until:
            self.flash_text = ""
            self.dirty = True

    # ---- drawing ----

    def clear_live(self):
        out = "\r" + (f"\x1b[{self.cursor_row}A" if self.cursor_row else "") + "\x1b[J"
        with self.lock:
            lines, self.committed = self.committed, []
        out += "".join(line + "\x1b[0m\r\n" for line in lines)
        self.term.write(out)
        self.cursor_row = self.live_height = 0

    def render(self):
        if not self.dirty:
            return
        self.dirty = False
        cols, rows = self.term.size()
        live, cur_row, cur_col = self.build_live(cols, rows)
        out = ["\x1b[?2026h\r"]
        if self.cursor_row:
            out.append(f"\x1b[{self.cursor_row}A")
        out.append("\x1b[J")
        with self.lock:
            lines, self.committed = self.committed, []
        out.extend(line + "\x1b[0m\r\n" for line in lines)
        out.append("\r\n".join(live))
        up = len(live) - 1 - cur_row
        if up > 0:
            out.append(f"\x1b[{up}A")
        out.append("\r" + (f"\x1b[{cur_col}C" if cur_col else ""))
        title = f"Agents{' - ' + self.shell.focus if self.shell.focus else ''}"
        if title != self.title:
            self.title = title
            out.append(f"\x1b]0;{title}\x07")
        out.append("\x1b[?2026l")
        self.term.write("".join(out))
        self.cursor_row, self.live_height = cur_row, len(live)

    def build_live(self, cols, rows):
        """Lines of the live area and where the cursor goes in it."""
        width_ = cols - 1
        lines = []
        partial = self.shell.live_partial()
        if partial:
            lines.append(fit("  " + partial, width_)[0])
        for agent, step, secs in self.shell.working():
            glyph = paint(SPINNER[self.spin % len(SPINNER)], cli.AGENT_COLORS.get(agent, "38;5;173"))
            who = "Queued" if agent == "queued" else f"{engine.name(agent)} {VERBS.get(step, 'Working').lower()}"
            lines.append(fit(f"{glyph} {who}{ELLIPSIS} " + dim(f"({int(secs)}s {MIDDOT} esc to interrupt)"), width_)[0])
        if self.bash:
            glyph = paint(SPINNER[self.spin % len(SPINNER)], "35")
            secs = int(time.time() - self.bash["started"])
            lines.append(fit(f"{glyph} Running {self.bash['cmd']}{ELLIPSIS} " + dim(f"({secs}s {MIDDOT} esc to interrupt)"), width_)[0])
        for _, _, shown in self.queue:
            lines.append(fit(dim(f"  {ELBOW} queued: {' '.join(shown.split())}"), width_)[0])
        if lines:
            lines.append("")
        if self.picker:
            box, cur_row, cur_col = self.picker_lines(width_, rows)
        else:
            box, cur_row, cur_col = self.box_lines(width_, rows)
        top = len(lines)
        lines.extend(box)
        lines.extend(self.under_lines(width_))
        return lines, top + cur_row, cur_col

    def box_lines(self, cols, rows):
        text, pos = self.editor.text, self.editor.pos
        mode = text[:1] if text[:1] in ("!", "#") else ""
        border = {"!": "35", "#": "34"}.get(mode, "2")
        symbol = mode or ">"
        if mode:
            text, pos = text[1:], max(0, pos - 1)
        inner = cols - 4
        body, cur_r, cur_c = wrap(text, pos, inner - 2)
        if not self.editor.text:
            body = [dim(self.placeholder())]
        max_rows = max(1, rows - 10)
        start = max(0, min(cur_r - max_rows + 1, len(body) - max_rows)) if len(body) > max_rows else 0
        shown = body[start:start + max_rows]
        lines = [paint(TL + H * (cols - 2) + TR, border)]
        for k, row in enumerate(shown):
            prefix = paint(symbol, "35" if mode == "!" else "34" if mode == "#" else "0") + " " if k + start == 0 else "  "
            lines.append(paint(V, border) + " " + prefix + pad(row, inner - 2) + " " + paint(V, border))
        lines.append(paint(BL + H * (cols - 2) + BR, border))
        return lines, 1 + cur_r - start, 4 + cur_c

    def placeholder(self):
        if not self.shell.pid:
            return "Add a project first: /project add <folder>"
        if self.shell.focus:
            return f"Reply{ELLIPSIS}  (/new for a new chat, ctrl+p to switch project)"
        return f"Ask anything about {self.shell.project()['name']}, or describe a change"

    def under_lines(self, cols):
        if self.popup:
            return self.popup_lines(self.popup, cols)
        if self.show_shortcuts:
            half = (len(cli.SHORTCUTS) + 1) // 2
            out = []
            for k in range(half):
                left = cli.SHORTCUTS[k]
                right = cli.SHORTCUTS[k + half] if k + half < len(cli.SHORTCUTS) else None
                cell = lambda pair: (paint(pair[0], "1") + dim(f" {pair[1]}")) if pair else ""
                out.append(fit("  " + pad(cell(left), cols // 2 - 2) + cell(right), cols)[0])
            return out
        return [self.footer(cols)]

    def footer(self, cols):
        text = self.editor.text
        if self.flash_text:
            left = paint(self.flash_text, "33")
        elif text.startswith("!"):
            left = paint("! for bash mode", "35")
        elif text.startswith("#"):
            left = paint("# to save a note to this project's memory", "34")
        elif self.shell.busy() or self.bash:
            left = dim("esc to interrupt")
        else:
            left = dim("? for shortcuts")
        owner = self.shell.current_owner()
        parts = [f"{ARROWS} {self.shell.label(owner)}"]
        if self.shell.pid:
            project = self.shell.project()
            parts.append(project["name"])
            if not self.shell.agent:
                coder = self.shell.default_coder()
                parts[0] += f" {cli.ARROW} {engine.name(coder)}" if coder else ""
        title = self.shell.chat_title()
        if title:
            parts.append(title[:24] + (ELLIPSIS if len(title) > 24 else ""))
        files = len(self.shell.pending) + sum(1 for t in self.attachments if t in self.editor.text)
        if files:
            parts.append(f"{files} file{'s' if files != 1 else ''}")
        right = paint(f" {MIDDOT} ".join(parts), "38;5;173") + dim(" (shift+tab)")
        gap = cols - 2 - width(left) - width(right)
        if gap < 1:
            right = paint(f" {MIDDOT} ".join(parts), "38;5;173")
            gap = max(1, cols - 2 - width(left) - width(right))
        return fit("  " + left + " " * gap + right, cols)[0]

    def popup_lines(self, popup, cols):
        items = popup["items"][:8]
        label_w = min(max((width(i[1]) for i in items), default=0) + 2, cols // 2)
        out = []
        for k, (_, label, desc) in enumerate(items):
            selected = k == popup["index"]
            mark = paint(POINTER, "38;5;173") if selected else " "
            name = paint(pad(label, label_w), "38;5;173;1" if selected else "0")
            out.append(fit(f"  {mark} {name}" + dim(desc), cols)[0])
        if len(popup["items"]) > 8:
            out.append(dim(f"    {len(popup['items']) - 8} more{ELLIPSIS}"))
        return out

    def picker_lines(self, cols, rows):
        p = self.picker
        items = self.picker_items()
        p["index"] = min(p["index"], max(0, len(items) - 1))
        lines = [paint(TL + H * (cols - 2) + TR, "38;5;173")]
        lines.append(paint(V, "38;5;173") + " " + pad(paint(p["title"], "1"), cols - 4) + " " + paint(V, "38;5;173"))
        query = f"Search: {p['query']}"
        lines.append(paint(V, "38;5;173") + " " + pad(dim(query) if not p["query"] else query, cols - 4) + " " + paint(V, "38;5;173"))
        visible = max(3, min(10, rows - 8))
        start = max(0, min(p["index"] - visible + 1, len(items) - visible))
        for k, (value, label, desc) in enumerate(items[start:start + visible], start=start):
            selected = k == p["index"]
            mark = paint(POINTER, "38;5;173") if selected else " "
            row = f"{mark} " + (paint(label, "1") if selected else label) + "  " + dim(desc)
            lines.append(paint(V, "38;5;173") + " " + pad(row, cols - 4) + " " + paint(V, "38;5;173"))
        if not items:
            lines.append(paint(V, "38;5;173") + " " + pad(dim("No matches"), cols - 4) + " " + paint(V, "38;5;173"))
        lines.append(paint(BL + H * (cols - 2) + BR, "38;5;173"))
        lines.append(dim("  enter to select " + MIDDOT + " esc to cancel " + MIDDOT + " type to search"))
        return lines, 2, 2 + width(query)

    def welcome(self):
        cols, _ = self.term.size()
        w = min(cols - 1, 66)
        projects = self.shell.store.projects()
        here = self.shell.project()["name"] if self.shell.pid else "none yet"
        body = [paint(SPARK, "38;5;173") + " Welcome to " + paint("Agents", "1") + "!", "",
                dim("  /help for help, /doctor to check your agents"), "", dim(f"  project: {here}")]
        lines = [paint(TL + H * (w - 2) + TR, "38;5;173")]
        lines += [paint(V, "38;5;173") + " " + pad(row, w - 4) + " " + paint(V, "38;5;173") for row in body]
        lines.append(paint(BL + H * (w - 2) + BR, "38;5;173"))
        coders = " and ".join(engine.name(c) for c in self.shell.engine.coders)
        tips = [" How it works:", "",
                f" 1. Hermes reads every message and answers questions itself",
                f" 2. Changes go to a coder ({coders}), then Hermes reports back",
                " 3. @ attaches files, ! runs a shell command, # saves a note",
                " 4. ctrl+p switches project, shift+tab sends straight to a coder", ""]
        if projects:
            tips.append(" Projects:")
            for p in projects:
                mark = "*" if p["id"] == self.shell.pid else " "
                tips.append(f"  {mark} {p['name']:<12} {engine.name(self.shell.engine.default_coder(p)):<8} "
                            + p["path"].replace(str(Path.home()), "~"))
            tips.append("")
        missing = [n for n, spec in self.shell.cfg["agents"].items()
                   if not (shutil.which(spec["command"][0]) or Path(spec["command"][0]).exists())]
        if missing:
            tips.append(paint(f" Not installed: {', '.join(missing)}", "31"))
        self.commit("\n".join(lines + [""] + [dim(t) if t[:3].strip()[:1].isdigit() or t.startswith("  ") else t for t in tips]))

    # ---- keys ----

    def handle(self, event):
        kind, value = event
        self.dirty = True
        if kind == "paste":
            return self.on_paste(value)
        if self.picker:
            return self.picker_key(kind, value)
        if self.show_shortcuts:
            self.show_shortcuts = False
            if kind == "char" and value == "?":
                return
        if kind == "char":
            if value == "?" and not self.editor.text:
                self.show_shortcuts = True
                return
            self.editor.insert(value)
            return self.edited()
        key = value
        if self.popup and key in ("up", "down"):
            n = min(8, len(self.popup["items"]))
            self.popup["index"] = (self.popup["index"] + (1 if key == "down" else -1)) % n
            return
        if self.popup and key in ("tab", "enter"):
            return self.accept(run=key == "enter")
        if key == "esc":
            return self.on_escape()
        if key == "enter":
            if self.editor.text.endswith("\\") and self.editor.pos == len(self.editor.text):
                self.editor.backspace()
                self.editor.insert("\n")
                return self.edited()
            return self.submit()
        actions = {
            "newline": lambda: self.editor.insert("\n"), "backspace": self.editor.backspace,
            "delete": self.editor.delete, "left": self.editor.left, "right": self.editor.right,
            "home": self.editor.home, "end": self.editor.end, "word-left": self.editor.word_left,
            "word-right": self.editor.word_right, "kill-word": self.editor.kill_word,
            "kill-word-right": self.editor.kill_word_right, "kill-start": self.editor.kill_start,
            "kill-end": self.editor.kill_end,
        }
        if key in actions:
            actions[key]()
            return self.edited(moved=key in ("left", "right", "home", "end", "word-left", "word-right"))
        if key == "up":
            if not self.editor.up():
                self.history_move(-1)
            return
        if key == "down":
            if not self.editor.down():
                self.history_move(1)
            return
        if key == "shift-tab":
            return self.cycle_mode()
        if key == "ctrl-c":
            return self.on_ctrl_c()
        if key == "ctrl-d":
            if not self.editor.text:
                self.running = False
            else:
                self.editor.delete()
            return
        if key == "ctrl-l":
            self.term.write("\x1b[2J\x1b[3J\x1b[H")
            self.cursor_row = self.live_height = 0
            return
        if key == "ctrl-r":
            return self.open_history_picker()
        if key == "ctrl-p":
            return self.open_project_picker()
        if key == "ctrl-v":
            return self.paste_clipboard_image()
        if key == "ctrl-z":
            return self.suspend()

    def edited(self, moved=False):
        if not moved:
            self.hist_index = None
        self.update_popup()

    def on_escape(self):
        if self.popup:
            self.dismissed = self.editor.text
            self.popup = None
            return
        if self.shell.busy() or self.bash:
            return self.interrupt()
        if self.editor.text:
            if time.time() - self.last_esc < 0.8:
                self.editor.set("")
                self.edited()
            else:
                self.flash("Press esc again to clear")
            self.last_esc = time.time()

    def on_ctrl_c(self):
        if self.editor.text:
            self.editor.set("")
            return self.edited()
        if self.shell.busy() or self.bash:
            return self.interrupt()
        if time.time() - self.exit_armed < 2:
            self.running = False
        else:
            self.exit_armed = time.time()
            self.flash("Press Ctrl-C again to exit", 2)

    def interrupt(self):
        stopped = self.shell.stop_all()
        if self.bash:
            try:
                os.killpg(self.bash["proc"].pid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                pass
            stopped.append("shell command")
        if self.queue:
            self.editor.set("\n".join(shown for _, _, shown in self.queue))
            self.queue = []
        if stopped:
            self.commit(dim(f"  {ELBOW} Interrupted by user"))

    def suspend(self):
        self.clear_live()
        self.term.leave()
        os.kill(os.getpid(), signal.SIGTSTP)
        self.term.enter()
        self.dirty = True

    # ---- history ----

    def load_history(self):
        try:
            raw = self.history_path.read_text().splitlines()
        except OSError:
            return []
        items = []
        for line in raw:
            try:
                value = json.loads(line)
            except ValueError:
                value = line
            if isinstance(value, str) and value.strip() and not line.startswith("_HiStOrY_V2_"):
                items.append(value)
        return items[-500:]

    def save_history(self):
        try:
            self.history_path.write_text("".join(json.dumps(h) + "\n" for h in self.history[-500:]))
        except OSError:
            pass

    def remember(self, text):
        if text.strip() and (not self.history or self.history[-1] != text):
            self.history.append(text)

    def history_move(self, step):
        if not self.history:
            return
        if self.hist_index is None:
            if step > 0:
                return
            self.hist_draft = self.editor.text
            self.hist_index = len(self.history)
        self.hist_index += step
        if self.hist_index >= len(self.history):
            self.hist_index = None
            self.editor.set(self.hist_draft)
        else:
            self.hist_index = max(0, self.hist_index)
            self.editor.set(self.history[self.hist_index])
        self.popup = None

    # ---- menus ----

    def update_popup(self):
        text, pos = self.editor.text, self.editor.pos
        before = text[:pos]
        previous = self.popup
        self.popup = None
        if text == self.dismissed:
            return
        self.dismissed = None
        if re.fullmatch(r"/[\w-]*", text) and pos == len(text):
            query = text[1:].lower()
            names = [n for n in cli.COMMANDS if n.startswith(query)] or [n for n in cli.COMMANDS if query in n]
            items = [(n, "/" + n, cli.COMMANDS[n][0]) for n in names if n not in ("quit", "agent", "clear") or n == query]
            if items:
                self.popup = {"kind": "command", "items": items, "index": 0}
        else:
            m = re.search(r"(?:^|\s)@([^\s]*)$", before)
            if m:
                items = self.mention_items(m.group(1))
                if items:
                    self.popup = {"kind": "mention", "items": items, "index": 0, "start": m.start(1) - 1}
        if previous and self.popup and previous["kind"] == self.popup["kind"]:
            self.popup["index"] = min(previous["index"], min(8, len(self.popup["items"])) - 1)

    def mention_items(self, query):
        items = []
        for mode in self.shell.modes():
            if mode.startswith(query.lower()):
                items.append((f"@{mode} ", f"@{mode}", MODE_DESC.get(mode, f"send this message to {engine.name(mode)}")))
        if query.startswith(("/", "~")):
            base = os.path.expanduser(query)
            folder, prefix = os.path.split(base)
            try:
                entries = sorted(e for e in os.listdir(folder or "/") if e.startswith(prefix) and not e.startswith("."))
            except OSError:
                entries = []
            shown_folder = os.path.dirname(query)
            for e in entries[:30]:
                full = os.path.join(folder or "/", e)
                is_dir = os.path.isdir(full)
                value = os.path.join(shown_folder, e) + ("/" if is_dir else " ")
                items.append((f"@{value}", "@" + os.path.join(shown_folder, e) + ("/" if is_dir else ""),
                              "folder" if is_dir else "attach file"))
            return items
        files = self.repo_files()
        q = query.lower()
        if q:
            ranked = []
            for f in files:
                low, name = f.lower(), Path(f).name.lower()
                if low.startswith(q):
                    rank = 0
                elif name.startswith(q):
                    rank = 1
                elif q in low:
                    rank = 2
                elif self.subsequence(q, low):
                    rank = 3
                else:
                    continue
                ranked.append((rank, f.count("/"), len(f), f))
            matches = [f for *_, f in sorted(ranked)]
        else:
            matches = files
        items += [(f"@{f} ", f"@{f}", "attach file") for f in matches[:30]]
        return items

    @staticmethod
    def subsequence(q, s):
        it = iter(s)
        return all(ch in it for ch in q)

    def folder(self):
        """The current project's folder (where @files, ! commands and agents work)."""
        return Path(self.shell.project()["path"]) if self.shell.pid else Path.cwd()

    def repo_files(self):
        folder = self.folder()
        stamp, cached_for, files = self.files_cache if len(self.files_cache) == 3 else (0, None, [])
        if time.time() - stamp < 30 and cached_for == folder:
            return files
        if (folder / ".git").exists():
            result = subprocess.run(["git", "ls-files", "-co", "--exclude-standard"], cwd=folder,
                                    capture_output=True, text=True)
            files = result.stdout.splitlines()
        else:
            files = []
            for root, dirs, names in os.walk(folder):
                dirs[:] = sorted(d for d in dirs if d not in router.SKIP_DIRS and not d.startswith("."))
                files += [str((Path(root) / n).relative_to(folder)) for n in sorted(names) if not n.startswith(".")]
                if len(files) > 20000:
                    break
        files = [f for f in files if not f.startswith(("node_modules/", ".env"))][:20000]
        self.files_cache = (time.time(), folder, files)
        return files

    def accept(self, run):
        popup = self.popup
        value = popup["items"][popup["index"]][0]
        if popup["kind"] == "command":
            if run and not cli.COMMANDS[value][1]:
                self.editor.set("")
                self.popup = None
                return self.run_line("/" + value)
            self.editor.set(f"/{value} ")
            self.popup = None
            return
        start = popup["start"]
        text = self.editor.text
        self.editor.text = text[:start] + value + text[self.editor.pos:]
        self.editor.pos = start + len(value)
        self.popup = None
        if value.endswith("/"):
            self.update_popup()

    def open_picker(self, title, items, on_pick):
        self.picker = {"title": title, "all": items, "query": "", "index": 0, "on_pick": on_pick}
        self.popup = None

    def picker_items(self):
        q = self.picker["query"].lower()
        by_label = [i for i in self.picker["all"] if q in i[1].lower()]
        return by_label + [i for i in self.picker["all"] if i not in by_label and q in i[2].lower()]

    def picker_key(self, kind, value):
        p = self.picker
        if kind == "char":
            p["query"] += value
            p["index"] = 0
            return
        if value == "backspace":
            p["query"] = p["query"][:-1]
        elif value in ("up", "down"):
            n = len(self.picker_items())
            if n:
                p["index"] = (p["index"] + (1 if value == "down" else -1)) % n
        elif value == "enter":
            items = self.picker_items()
            self.picker = None
            if items:
                try:
                    p["on_pick"](items[p["index"]][0])
                except (SystemExit, engine.ChatError) as e:
                    self.commit(paint(str(getattr(e, "code", None) or e), "31"))
        elif value in ("esc", "ctrl-c"):
            self.picker = None

    def open_task_picker(self):
        if not self.shell.pid:
            return self.flash("Add a project first: /project add <folder>")
        chats = self.shell.store.chats(self.shell.pid)
        if not chats:
            return self.commit("No chats in this project yet. Just type what you need.")
        items = [(c["id"], c["title"][:60] + (ELLIPSIS if len(c["title"]) > 60 else ""),
                  c["updated"][5:16].replace("T", " ") + (" " + MIDDOT + " failed" if c["failed"] else ""))
                 for c in chats]
        self.open_picker(f"Resume a chat in {self.shell.project()['name']}", items, self.shell.open)

    def open_project_picker(self):
        projects = self.shell.store.projects()
        if not projects:
            return self.flash("No projects yet: /project add <folder>")
        items = [(p["id"], p["name"] + (" (current)" if p["id"] == self.shell.pid else ""),
                  f"{engine.name(self.shell.engine.default_coder(p))} {MIDDOT} " + p["path"].replace(str(Path.home()), "~"))
                 for p in projects]
        self.open_picker("Switch project", items, self.shell.switch)

    def open_mode_picker(self):
        current = self.shell.current_owner()
        items = [(mode, self.shell.label(mode) + (" (current)" if mode == current else ""), MODE_DESC.get(mode, ""))
                 for mode in self.shell.modes()]
        self.open_picker("Who handles your messages", items, self.shell.set_mode)

    def open_history_picker(self):
        seen, items = set(), []
        for h in reversed(self.history):
            if h not in seen:
                seen.add(h)
                items.append((h, " ".join(h.split())[:70], ""))
        if not items:
            return self.flash("No history yet")
        self.open_picker("Search history", items, lambda h: self.editor.set(h))

    def cycle_mode(self):
        modes = self.shell.modes()
        current = self.shell.current_owner()
        nxt = modes[(modes.index(current) + 1) % len(modes)] if current in modes else modes[0]
        try:
            self.shell.set_mode(nxt, quiet=True)
        except (SystemExit, engine.ChatError) as e:
            self.flash(str(getattr(e, "code", None) or e))

    # ---- paste and attachments ----

    def add_attachment(self, path):
        n = len(self.attachments) + 1
        image = Path(path).suffix.lower() in engine.IMAGE_TYPES
        token = f"[Image #{n}]" if image else f"[File #{n}: {Path(path).name}]"
        self.attachments[token] = path
        return token

    def on_paste(self, text):
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        if self.picker:
            self.picker["query"] += " ".join(text.split())
            return
        stripped = text.strip()
        if stripped and "\n" not in stripped:
            rest, files = cli.extract_files(stripped)
            if files and not rest:
                self.editor.insert(" ".join(self.add_attachment(f) for f in files) + " ")
                return self.edited()
        lines = text.count("\n") + 1
        if lines > 3 or len(text) > 800:
            token = f"[Pasted text #{len(self.pastes) + 1} +{lines} lines]"
            self.pastes[token] = text
            self.editor.insert(token)
        else:
            self.editor.insert(text)
        self.edited()

    def paste_clipboard_image(self):
        path = cli.clipboard_image()
        if not path:
            return self.flash("No image on the clipboard (Cmd+Ctrl+Shift+4 copies a screenshot)")
        self.editor.insert(self.add_attachment(path) + " ")
        self.edited()

    def expand(self, text):
        """Turn what was typed into (message, files): paste and attachment tokens, and @file mentions."""
        files = []
        for token, content in self.pastes.items():
            text = text.replace(token, content)
        for token, path in self.attachments.items():
            if token in text:
                text = text.replace(token, "")
                files.append(path)
        repo = self.folder()
        for m in re.finditer(r"(?:^|\s)@(\S+)", text):
            mention = m.group(1)
            for candidate in (repo / mention, Path(os.path.expanduser(mention))):
                if candidate.is_file():
                    files.append(str(candidate))
                    break
        return re.sub(r"[ \t]{2,}", " ", text).strip(), files

    # ---- sending ----

    def submit(self):
        text = self.editor.text
        if not text.strip():
            return
        self.remember(text)
        self.editor.set("")
        self.popup = None
        self.hist_index = None
        self.run_line(text)

    def run_line(self, text):
        stripped = text.strip()
        if stripped in ("/resume", "/open"):
            return self.open_task_picker()
        if stripped == "/project":
            return self.open_project_picker()
        if stripped in ("/model", "/agent"):
            return self.open_mode_picker()
        if stripped.startswith("!"):
            return self.run_bash(stripped[1:].strip())
        if stripped.startswith("#"):
            self.commit("")
            self.commit(paint("#", "34") + " " + stripped[1:].strip())
            try:
                self.shell.remember(stripped[1:])
            except SystemExit as e:
                self.commit(paint(str(e.code), "31"))
            return
        if stripped.startswith("/") and stripped[1:].split(" ")[0].lower() in self.shell.handlers:
            self.commit("")
            self.commit(dim("> " + stripped))
            if self.shell.submit(stripped) is False:
                self.running = False
            self.pastes, self.attachments = {}, {}
            return
        message, files = self.expand(text)
        self.pastes, self.attachments = {}, {}
        if self.shell.busy():
            self.queue.append((message, files, stripped))
            return self.flash("Queued. It sends when the agent finishes.")
        self.send(message, files, stripped)

    def send(self, message, files, shown):
        self.commit("")
        for k, line in enumerate(shown.split("\n")):
            self.commit(dim(("> " if k == 0 else "  ") + line))
        self.shell.submit(message, files)

    def run_bash(self, cmd):
        if not cmd:
            return self.flash("Type a command after !")
        if self.bash:
            return self.flash("A shell command is already running")
        self.commit("")
        self.commit(paint("!", "35") + " " + cmd)
        proc = subprocess.Popen(cmd, shell=True, cwd=self.folder(), stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True, errors="replace",
                                start_new_session=True, executable=os.environ.get("SHELL") or "/bin/sh")
        self.bash = {"proc": proc, "cmd": cmd, "started": time.time()}
        threading.Thread(target=self.read_bash, args=(proc,), daemon=True).start()

    def read_bash(self, proc, limit=200):
        count = 0
        for line in proc.stdout:
            count += 1
            if count <= limit:
                self.commit(("  " + ELBOW + " " if count == 1 else "    ") + line.rstrip("\n"))
        code = proc.wait()
        if count > limit:
            self.commit(dim(f"    {ELLIPSIS} {count - limit} more lines"))
        if count == 0:
            self.commit(dim(f"  {ELBOW} (no output)"))
        if code:
            self.commit(paint(f"    exit {code}", "31"))
        self.bash = None
        self.dirty = True


def run(shell):
    TUI(shell).run()
