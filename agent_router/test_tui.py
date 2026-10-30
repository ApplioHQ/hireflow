"""Tests for the terminal UI, driven with a fake terminal. Run: python3 -m unittest agent_router/test_tui.py"""
import json
import re
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "app"))
import cli  # noqa: E402
import router  # noqa: E402
import tui  # noqa: E402
from test_app import SESSION_AGENT  # noqa: E402
from test_router import RepoCase  # noqa: E402

ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07")


def plain(text):
    return ANSI.sub("", text)


class FakeTerminal:
    def __init__(self, cols=100, rows=30):
        self.cols, self.rows = cols, rows
        self.written = []

    def enter(self):
        pass

    def leave(self):
        pass

    def size(self):
        return self.cols, self.rows

    def read(self, timeout):
        return b""

    def write(self, text):
        self.written.append(text)


ORIGINAL_SAY = router.say


class TuiCase(RepoCase):
    def setUp(self):
        super().setUp()
        (self.repo / "sess.py").write_text(SESSION_AGENT)
        cfg = self.cfg(claude=[sys.executable, "sess.py", "claude"], hermes=[sys.executable, "sess.py", "hermes"])
        for spec in cfg["agents"].values():
            spec["resume"] = ["--resume", "{session_id}"]
        cfg["agents"]["hermes"]["vision"] = False
        self.shell = cli.Shell(cfg, poll=0.02)
        self.term = FakeTerminal()
        self.ui = tui.TUI(self.shell, self.term, history_path=Path(self.tmp.name) / "history")

    def tearDown(self):
        router.say = ORIGINAL_SAY
        super().tearDown()

    def plan(self, plan):
        (self.repo / ".git/plan.json").write_text(json.dumps(plan))

    def runs(self, name):
        path = self.repo / f".git/runs-{name}.jsonl"
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def type(self, text):
        for event in self.ui.keys.feed(text.encode()):
            self.ui.handle(event)

    def key(self, raw):
        for event in self.ui.keys.feed(raw):
            self.ui.handle(event)

    def settle(self, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            self.ui.tick()
            if not self.shell.busy() and not self.ui.bash and not self.ui.queue:
                self.ui.tick()
                return
            time.sleep(0.02)
        self.fail("agents did not finish")

    def screen(self):
        """Everything committed to scrollback so far, without color codes."""
        self.ui.render()
        return plain("".join(self.term.written))

    def live(self):
        lines, row, col = self.ui.build_live(*self.term.size())
        return [plain(line) for line in lines], row, col


class KeysTest(unittest.TestCase):
    def test_sequences(self):
        k = tui.Keys()
        events = k.feed(b"a\x1b[A\x1b[B\x1b[C\x1b[D\x1b[H\x1b[F\x1b[3~\x1b[Z\x1b\r\x1bb\x1bf\x1b\x7f\x1b[1;3C\x0d\x0a\x7f\t")
        self.assertEqual(events, [("char", "a"), ("key", "up"), ("key", "down"), ("key", "right"), ("key", "left"),
                                  ("key", "home"), ("key", "end"), ("key", "delete"), ("key", "shift-tab"),
                                  ("key", "newline"), ("key", "word-left"), ("key", "word-right"), ("key", "kill-word"),
                                  ("key", "word-right"), ("key", "enter"), ("key", "newline"), ("key", "backspace"),
                                  ("key", "tab")])

    def test_ctrl_keys(self):
        k = tui.Keys()
        names = [e[1] for e in k.feed(b"\x01\x05\x0b\x15\x17\x03\x04\x0c\x12\x16\x1a")]
        self.assertEqual(names, ["home", "end", "kill-end", "kill-start", "kill-word", "ctrl-c", "ctrl-d",
                                 "ctrl-l", "ctrl-r", "ctrl-v", "ctrl-z"])

    def test_paste_split_across_reads(self):
        k = tui.Keys()
        self.assertEqual(k.feed(b"\x1b[200~first\nsec"), [])
        self.assertEqual(k.feed(b"ond\x1b[201~x"), [("paste", "first\nsecond"), ("char", "x")])

    def test_utf8_split_and_lone_escape(self):
        k = tui.Keys()
        self.assertEqual(k.feed(b"\xe2\x9c"), [])
        self.assertEqual(k.feed(b"\x93"), [("char", "✓")])
        self.assertEqual(k.feed(b"\x1b"), [])
        self.assertTrue(k.pending_escape())
        self.assertEqual(k.parse(flush=True), [("key", "esc")])
        self.assertEqual(k.feed(b"\x1b[1"), [])  # incomplete sequence waits
        self.assertEqual(k.feed(b"~"), [("key", "home")])

    def test_shift_enter_variants(self):
        k = tui.Keys()
        self.assertEqual(k.feed(b"\x1b[13;2u\x1b[27;2;13~"), [("key", "newline"), ("key", "newline")])


class EditorTest(unittest.TestCase):
    def test_editing(self):
        e = tui.Editor()
        e.insert("hello world")
        e.word_left()
        self.assertEqual(e.pos, 6)
        e.kill_end()
        self.assertEqual(e.text, "hello ")
        e.insert("there")
        e.kill_word()
        self.assertEqual(e.text, "hello ")
        e.home()
        e.kill_end()
        self.assertEqual(e.text, "")

    def test_lines(self):
        e = tui.Editor()
        e.insert("one\ntwo\nthree")
        self.assertTrue(e.up())
        self.assertEqual(e.text[:e.pos], "one\ntwo")
        self.assertTrue(e.up())
        self.assertFalse(e.up())
        self.assertTrue(e.down())
        e.end()
        self.assertEqual(e.text[:e.pos], "one\ntwo")
        e.kill_start()
        self.assertEqual(e.text, "one\n\nthree")


class MeasureTest(unittest.TestCase):
    def test_width_and_fit(self):
        self.assertEqual(tui.width("\x1b[31mab\x1b[0m中"), 4)
        cut, used = tui.fit("\x1b[1mhello\x1b[0m world", 7)
        self.assertEqual((plain(cut), used), ("hello w", 7))
        self.assertEqual(tui.width(tui.pad("ab", 5)), 5)

    def test_wrap_cursor(self):
        self.assertEqual(tui.wrap("hello world", 11, 5), (["hello", " worl", "d"], 2, 1))
        self.assertEqual(tui.wrap("ab\ncd", 3, 5), (["ab", "cd"], 1, 0))
        self.assertEqual(tui.wrap("", 0, 5), ([""], 0, 0))


class LayoutTest(TuiCase):
    def test_welcome_and_box(self):
        self.ui.welcome()
        out = self.screen()
        self.assertIn("Welcome to Applio Agents!", out)
        self.assertIn("Hermes answers it", out)
        lines, row, col = self.live()
        self.assertTrue(lines[0].startswith(tui.TL))
        self.assertIn("> Try", lines[1])
        self.assertIn("? for shortcuts", lines[-1])
        self.assertIn("Auto", lines[-1])
        self.assertTrue(all(tui.width(l) < self.term.cols for l in lines))

    def test_typing_and_cursor(self):
        self.type("hello")
        lines, row, col = self.live()
        self.assertIn("> hello", lines[row])
        self.assertEqual(col, 4 + 5)

    def test_long_input_wraps_inside_box(self):
        self.term.cols = 30
        self.type("x" * 60)
        lines, row, col = self.live()
        box = [l for l in lines if l.startswith(tui.V)]
        self.assertGreaterEqual(len(box), 3)
        self.assertTrue(all(tui.width(l) < 30 for l in lines))

    def test_bash_and_memory_modes_change_the_prompt(self):
        self.type("!ls")
        lines, _, _ = self.live()
        self.assertIn("! ls", lines[1])
        self.assertIn("bash mode", lines[-1])
        self.ui.editor.set("#note")
        lines, _, _ = self.live()
        self.assertIn("# note", lines[1])

    def test_shortcuts_panel(self):
        self.type("?")
        lines, _, _ = self.live()
        self.assertTrue(any("shift+tab" in l for l in lines))
        self.type("a")  # any key closes it
        self.assertFalse(self.ui.show_shortcuts)


class MenuTest(TuiCase):
    def test_command_menu_filters_and_runs(self):
        self.type("/st")
        self.assertEqual(self.ui.popup["kind"], "command")
        labels = [i[1] for i in self.ui.popup["items"]]
        self.assertEqual(labels[0], "/status")
        lines, _, _ = self.live()
        self.assertTrue(any("/status" in l and "Repo" in l for l in lines))
        self.key(b"\r")
        self.assertIn("handles", self.screen())

    def test_tab_completes_commands_that_take_arguments(self):
        self.type("/atta")
        self.key(b"\t")
        self.assertEqual(self.ui.editor.text, "/attach ")
        self.assertIsNone(self.ui.popup)

    def test_escape_closes_menu(self):
        self.type("/h")
        self.key(b"\x1b")
        self.ui.handle(("key", "esc"))
        self.assertIsNone(self.ui.popup)

    def test_mention_menu_lists_agents_and_files(self):
        self.type("look at @ag")
        labels = [i[1] for i in self.ui.popup["items"]]
        self.assertIn("@agent.py", labels)
        self.ui.editor.set("")
        self.type("@cl")
        self.assertEqual(self.ui.popup["items"][0][1], "@claude")
        self.key(b"\t")
        self.assertEqual(self.ui.editor.text, "@claude ")

    def test_mode_picker(self):
        self.type("/model")
        self.ui.popup = None
        self.key(b"\r")
        self.assertIsNotNone(self.ui.picker)
        lines, _, _ = self.live()
        self.assertTrue(any("Who handles" in l for l in lines))
        self.type("claude")
        self.key(b"\r")
        self.assertEqual(self.shell.default, "claude")

    def test_task_picker_opens_task(self):
        self.ui.run_line("/resume")
        self.type("T2")
        self.key(b"\r")
        self.assertEqual(self.shell.focus, "T2")
        self.assertIn("T2  Write b.js", self.screen())

    def test_shift_tab_cycles_modes(self):
        seen = []
        for _ in range(4):
            self.key(b"\x1b[Z")
            seen.append(self.shell.default)
        self.assertEqual(seen, ["claude", "hermes", "claude+hermes", "auto"])
        self.key(b"\x1b[Z")
        self.assertIn("Claude", self.live()[0][-1])


class FlowTest(TuiCase):
    def test_question_streams_and_echoes(self):
        self.plan({"hermes": ["say It sets the API URL."]})
        self.type("what does config.js do?")
        self.key(b"\r")
        self.settle()
        out = self.screen()
        self.assertIn("> what does config.js do?", out)
        self.assertIn("Hermes", out)
        self.assertIn("It sets the API URL.", out)
        self.assertEqual(self.shell.focus, "T4")
        self.assertIn("what does config.js do?", self.ui.history)

    def test_spinner_while_working(self):
        self.type("SLOW job")
        self.key(b"\r")
        time.sleep(0.4)
        self.ui.tick()
        lines, _, _ = self.live()
        self.assertTrue(any("esc to interrupt" in l for l in lines))
        self.ui.handle(("key", "esc"))
        self.settle()
        self.assertIn("Interrupted by user", self.screen())
        self.assertEqual(self.rows()["T4"]["status"], "blocked")

    def test_messages_typed_while_busy_are_queued(self):
        self.plan({"hermes": ["say first", "say second"]})
        self.type("first question")
        self.key(b"\r")
        self.type("second question")
        self.key(b"\r")
        self.assertEqual(len(self.ui.queue), 1)
        lines, _, _ = self.live()
        self.assertTrue(any("queued: second question" in l for l in lines))
        self.settle()
        self.assertIn("second", self.screen())
        self.assertEqual(len(self.runs("hermes")), 2)

    def test_pasted_file_becomes_an_attachment(self):
        self.plan({"claude": ["say A login page."]})
        shot = Path(self.tmp.name) / "Screen Shot.png"
        shot.write_bytes(b"\x89PNG")
        self.key(b"\x1b[200~" + str(shot).replace(" ", "\\ ").encode() + b"\x1b[201~")
        self.assertIn("[Image #1]", self.ui.editor.text)
        self.type("what is this?")
        self.key(b"\r")
        self.settle()
        self.assertIn("Screen Shot.png", self.runs("claude")[0]["prompt"])
        self.assertEqual(self.rows()["T4"]["task"], "what is this?")

    def test_big_paste_collapses_and_expands(self):
        self.plan({"hermes": ["say ok"]})
        self.key(b"\x1b[200~" + b"\n".join(b"line %d" % i for i in range(10)) + b"\x1b[201~")
        self.assertIn("[Pasted text #1 +10 lines]", self.ui.editor.text)
        self.key(b"\r")
        self.settle()
        self.assertIn("line 9", self.runs("hermes")[0]["prompt"])

    def test_at_file_mention_attaches(self):
        self.plan({"hermes": ["say ok"]})
        self.ui.editor.set("explain @agent.py please")
        self.key(b"\r")
        self.settle()
        self.assertIn("agent_state/attachments/T4/agent.py", self.runs("hermes")[0]["prompt"])

    def test_bash_mode_runs_a_command(self):
        self.ui.editor.set("!echo hello-from-bash")
        self.key(b"\r")
        self.settle()
        out = self.screen()
        self.assertIn("! echo hello-from-bash", out)
        self.assertIn("hello-from-bash", out.split("! echo hello-from-bash", 1)[1])

    def test_memory_mode_saves_a_note(self):
        self.ui.editor.set("# always use plain hyphens")
        self.key(b"\r")
        self.assertIn("(you): always use plain hyphens", (self.repo / "agent_state/context.md").read_text())
        self.assertIn("Saved to agent_state/context.md", self.screen())

    def test_multiline_input(self):
        self.type("line one\\")
        self.key(b"\r")
        self.type("line two")
        self.key(b"\x1b\r")
        self.type("three")
        self.assertEqual(self.ui.editor.text, "line one\nline two\nthree")

    def test_history_navigation(self):
        self.ui.history = ["older", "newer"]
        self.type("draft")
        self.key(b"\x1b[A")
        self.assertEqual(self.ui.editor.text, "newer")
        self.key(b"\x1b[A")
        self.assertEqual(self.ui.editor.text, "older")
        self.key(b"\x1b[B\x1b[B")
        self.assertEqual(self.ui.editor.text, "draft")

    def test_ctrl_c_clears_then_exits(self):
        self.type("abc")
        self.key(b"\x03")
        self.assertEqual(self.ui.editor.text, "")
        self.key(b"\x03")
        self.assertTrue(self.ui.running)
        self.key(b"\x03")
        self.assertFalse(self.ui.running)

    def test_exit_while_working_stops_and_records_the_task(self):
        self.type("SLOW job")
        self.key(b"\r")
        time.sleep(0.4)
        self.ui.tick()
        self.ui.stop_before_exit()
        self.assertFalse(self.shell.busy())
        self.assertEqual(self.rows()["T4"]["status"], "blocked")
        self.assertIn("Stopping running work before exit", self.screen())

    def test_clipboard_image_with_ctrl_v(self):
        shot = Path(self.tmp.name) / "clip.png"
        shot.write_bytes(b"\x89PNG")
        with mock.patch.object(cli, "clipboard_image", return_value=str(shot)):
            self.key(b"\x16")
        self.assertIn("[Image #1]", self.ui.editor.text)
        with mock.patch.object(cli, "clipboard_image", return_value=None):
            self.key(b"\x16")
        self.assertIn("No image on the clipboard", self.ui.flash_text)

    def test_commands_print_into_scrollback(self):
        self.ui.run_line("/tasks")
        self.ui.run_line("/cost")
        self.ui.run_line("/help")
        out = self.screen()
        self.assertIn("T1", out)
        self.assertIn("No Claude usage", out)
        self.assertIn("/resume", out)

    def test_export(self):
        self.plan({"hermes": ["say exported answer"]})
        self.type("a question")
        self.key(b"\r")
        self.settle()
        self.ui.run_line("/export")
        self.assertIn("exported answer", (self.repo / "agent_state/exports/T4.md").read_text())

    def test_render_keeps_cursor_bookkeeping(self):
        self.type("hello")
        self.ui.render()
        self.assertEqual(self.ui.cursor_row, 1)
        self.ui.commit("some output")
        self.ui.render()
        self.assertIn("some output", plain(self.term.written[-1]))
        self.assertTrue(self.term.written[-1].startswith("\x1b[?2026h\r\x1b[1A\x1b[J"))


if __name__ == "__main__":
    unittest.main()
