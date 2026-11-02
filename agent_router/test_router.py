"""Tests for the shared agent-running library. Run: python3 -m unittest agent_router/test_router.py"""
import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import router  # noqa: E402


class ParseTest(unittest.TestCase):
    repo = Path("/repo")

    def test_claude_events(self):
        line = json.dumps({"type": "assistant", "message": {"content": [
            {"type": "text", "text": "hi"}, {"type": "tool_use", "name": "Read", "input": {"file_path": "/repo/a.js"}}]}})
        self.assertEqual(router.parse_line(line, self.repo), "hi\n\n> Read a.js\n")
        self.assertEqual(router.parse_line(json.dumps({"type": "result", "total_cost_usd": 0.5}), self.repo), "\n[cost $0.50]\n")
        self.assertEqual(router.parse_line(json.dumps({"type": "rate_limit_event"}), self.repo), "")

    def test_hermes_events(self):
        self.assertEqual(router.parse_line(json.dumps({"type": "text", "text": "ap"}), self.repo), "ap")
        tool = json.dumps({"type": "tool_use", "name": "read_file", "input": {"path": "/repo/x"}})
        self.assertEqual(router.parse_line(tool, self.repo), "\n> read_file x\n")
        self.assertEqual(router.parse_line(json.dumps({"type": "result", "tokens": {"total": 9}}), self.repo), "\n[9 tokens]\n")
        self.assertEqual(router.parse_line("Session: abc\n", self.repo), "Session: abc\n")

    def test_chatgpt_events(self):
        msg = {"type": "item.completed", "item": {"type": "agent_message", "text": "done"}}
        cmd = {"type": "item.started", "item": {"type": "command_execution", "command": "/bin/zsh -lc 'ls -la'"}}
        edit = {"type": "item.completed", "item": {"type": "file_change", "changes": [{"path": "/repo/b.py"}]}}
        usage = {"type": "turn.completed", "usage": {"input_tokens": 10, "output_tokens": 5}}
        fail = {"type": "turn.failed", "error": {"message": "usage limit reached"}}
        self.assertEqual(router.parse_line(json.dumps(msg), self.repo), "done\n")
        self.assertEqual(router.parse_line(json.dumps(cmd), self.repo), "\n> Bash ls -la\n")
        self.assertEqual(router.parse_line(json.dumps(edit), self.repo), "\n> Edit b.py\n")
        self.assertEqual(router.parse_line(json.dumps(usage), self.repo), "\n[15 tokens]\n")
        self.assertEqual(router.parse_line(json.dumps(fail), self.repo), "\nError: usage limit reached\n")

    def test_session_ids(self):
        self.assertEqual(router.session_in('{"type": "system", "session_id": "s1"}'), "s1")
        self.assertEqual(router.session_in('{"type": "thread.started", "thread_id": "t1"}'), "t1")
        self.assertEqual(router.session_in("session_id: local-abc\n"), "local-abc")
        self.assertIsNone(router.session_in("plain text"))

    def test_long_tool_args_are_shortened(self):
        self.assertLess(len(router.tool_line("Bash", {"command": "x" * 300}, self.repo)), 120)


class RunAgentTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        script = ("import sys, json\nprompt = sys.stdin.read()\n"
                  "print(json.dumps({'args': sys.argv[1:], 'prompt': prompt}), flush=True)\n"
                  "print(json.dumps({'type': 'system', 'session_id': 'new-sess'}), flush=True)\n")
        (self.dir / "echo.py").write_text(script)
        self.cfg = {"repo": self.dir, "agent_timeout": 60, "agents": {
            "a": {"command": [sys.executable, str(self.dir / "echo.py")], "resume": ["--resume", "{session_id}"],
                  "add_dir": ["--add-dir", "{dir}"]},
            "b": {"command": [sys.executable, str(self.dir / "echo.py"), "fresh"],
                  "resume_command": [sys.executable, str(self.dir / "echo.py"), "resume", "{session_id}"]}}}

    def tearDown(self):
        self.tmp.cleanup()

    def first_json(self, out):
        return json.loads(out.splitlines()[0])

    def test_prompt_streams_and_session_is_captured(self):
        seen = []
        code, out, session = router.run_agent(self.cfg, "a", "hello", echo=seen.append)
        self.assertEqual((code, session), (0, "new-sess"))
        self.assertEqual(self.first_json(out)["prompt"], "hello")
        self.assertTrue(seen)

    def test_resume_flags_extra_dirs_and_cwd(self):
        sub = self.dir / "proj"
        sub.mkdir()
        code, out, _ = router.run_agent(self.cfg, "a", "x", session_id="old", cwd=sub, extra_dirs=[self.dir / "att"])
        self.assertEqual(self.first_json(out)["args"], ["--resume", "old", "--add-dir", str(self.dir / "att")])

    def test_resume_command_replaces_the_command(self):
        _, out, _ = router.run_agent(self.cfg, "b", "x", session_id="old")
        self.assertEqual(self.first_json(out)["args"], ["resume", "old"])
        _, out, _ = router.run_agent(self.cfg, "b", "x")
        self.assertEqual(self.first_json(out)["args"], ["fresh"])

    def test_model_flag_injected(self):
        self.cfg["agents"]["a"]["model_flag"] = ["--model", "{model}"]
        _, out, _ = router.run_agent(self.cfg, "a", "x", model="opus")
        self.assertIn("--model", self.first_json(out)["args"])
        self.assertIn("opus", self.first_json(out)["args"])

    def test_model_flag_not_injected_when_none(self):
        self.cfg["agents"]["a"]["model_flag"] = ["--model", "{model}"]
        _, out, _ = router.run_agent(self.cfg, "a", "x", model=None)
        self.assertNotIn("--model", self.first_json(out)["args"])

    def test_missing_command(self):
        self.cfg["agents"]["a"]["command"] = ["no-such-agent-cli"]
        code, out, _ = router.run_agent(self.cfg, "a", "x")
        self.assertEqual(code, 127)
        self.assertIn("command not found", out)

    def test_stop_from_another_thread(self):
        (self.dir / "slow.py").write_text("import sys, time\nsys.stdin.read()\nprint('started', flush=True)\ntime.sleep(30)\n")
        self.cfg["agents"]["a"]["command"] = [sys.executable, str(self.dir / "slow.py")]
        control = {}
        import threading

        def stopper():
            while "proc" not in control:
                time.sleep(0.05)
            time.sleep(0.3)
            control["stopped"] = True
            control["proc"].kill()
        threading.Thread(target=stopper).start()
        code, out, _ = router.run_agent(self.cfg, "a", "x", control=control)
        self.assertEqual(code, 130)
        self.assertIn("stopped by user", out)

    def test_timeout(self):
        (self.dir / "slow.py").write_text("import sys, time\nsys.stdin.read()\ntime.sleep(30)\n")
        self.cfg["agents"]["a"]["command"] = [sys.executable, str(self.dir / "slow.py")]
        self.cfg["agent_timeout"] = 1
        code, out, _ = router.run_agent(self.cfg, "a", "x")
        self.assertEqual(code, 124)
        self.assertIn("timed out", out)


class FilesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_snapshot_without_git(self):
        (self.dir / "a.py").write_text("1")
        (self.dir / "__pycache__").mkdir()
        before = router.snapshot(self.dir)
        (self.dir / "a.py").write_text("22")
        (self.dir / "b.py").write_text("new")
        (self.dir / "__pycache__" / "x.pyc").write_text("ignored")
        self.assertEqual(router.changed_files(before, router.snapshot(self.dir)), ["a.py", "b.py"])

    def test_snapshot_with_git_sees_second_edit(self):
        subprocess.run(["git", "init", "-q"], cwd=self.dir, check=True)
        (self.dir / "a.js").write_text("1")
        first = router.snapshot(self.dir)
        (self.dir / "a.js").write_text("2")
        self.assertEqual(router.changed_files(first, router.snapshot(self.dir)), ["a.js"])

    def test_scratch_copy_is_separate(self):
        subprocess.run(["git", "init", "-q"], cwd=self.dir, check=True)
        (self.dir / "a.js").write_text("original")
        copy = router.scratch_copy(self.dir)
        self.assertEqual((copy / "a.js").read_text(), "original")
        self.assertTrue((copy / ".git").exists())  # git status still works in the copy
        (copy / "a.js").write_text("changed in copy")
        (copy / "new.js").write_text("x")
        self.assertEqual((self.dir / "a.js").read_text(), "original")
        self.assertFalse((self.dir / "new.js").exists())
        router.remove_scratch(copy)
        self.assertFalse(copy.exists())

    def test_run_check(self):
        self.assertEqual(router.run_check("", self.dir), (0, ""))
        self.assertEqual(router.run_check("echo fine", self.dir)[0], 0)
        code, out = router.run_check("echo broken >&2; exit 3", self.dir)
        self.assertEqual((code, out), (3, "broken"))


if __name__ == "__main__":
    unittest.main()
