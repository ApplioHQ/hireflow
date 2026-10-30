"""Tests for router.py using fake agents in a throwaway git repo. Run: python3 -m unittest agent_router/test_router.py"""
import contextlib
import io
import json
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import router  # noqa: E402

TASKS = """\
# Task queue

| ID | Task | Status | Owner | Notes |
|----|------|--------|-------|-------|
| T1 | Write a.js | pending | claude | first |
| T2 | Write b.js using the handoff | pending | hermes | second |
| T3 | Unrouted task | pending | unassigned | |
"""

# Fake agent: reads the prompt (stdin or file arg), records it, writes a file and handoff.md.
GOOD_AGENT = textwrap.dedent("""\
    import sys, pathlib
    prompt = pathlib.Path(sys.argv[2]).read_text() if len(sys.argv) > 2 else sys.stdin.read()
    name = sys.argv[1]
    pathlib.Path(f"prompt-{name}.txt").write_text(prompt)
    pathlib.Path(f"{name}.js").write_text("var ok = 1;\\n")
    pathlib.Path("agent_state/handoff.md").write_text(
        f"Task: x\\nAgent: {name}\\nStatus: done\\nFor the next agent: MARKER-FROM-{name}\\n")
    print(f"{name} finished")
""")


class RepoCase(unittest.TestCase):
    """Throwaway git repo with agent_state/ and fake agents."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        state = self.repo / "agent_state"
        (state / "log").mkdir(parents=True)
        (state / "tasks.md").write_text(TASKS)
        (state / "context.md").write_text("- CONTEXT-MARKER\n")
        (state / "handoff.md").write_text("Task: none\nFor the next agent: SEED-HANDOFF\n")
        (self.repo / "agent.py").write_text(GOOD_AGENT)
        subprocess.run(["git", "init", "-q"], cwd=self.repo, check=True)
        subprocess.run(["git", "add", "-A"], cwd=self.repo, check=True)
        subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"],
                       cwd=self.repo, check=True)
        self.claude = [sys.executable, "agent.py", "claude"]               # prompt via stdin
        self.hermes = [sys.executable, "agent.py", "hermes", "{prompt_file}"]  # prompt via file
        self.check = "git ls-files -co --exclude-standard -z '*.js' | xargs -0 -n1 node --check"

    def tearDown(self):
        self.tmp.cleanup()

    def cfg(self, claude=None, hermes=None, check=None):
        return {
            "repo": self.repo, "state": self.repo / "agent_state",
            "check_command": check or self.check, "agent_timeout": 60,
            "agents": {"claude": {"command": claude or self.claude},
                       "hermes": {"command": hermes or self.hermes}},
        }

    def run_router(self, cfg, **kw):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            try:
                code = router.run(cfg, **kw)
            except SystemExit as e:
                code = e.code
        return code, out.getvalue()

    def rows(self):
        return {r["id"]: r for r in router.read_tasks(self.repo / "agent_state/tasks.md")[2]}

    def handoff(self):
        return (self.repo / "agent_state/handoff.md").read_text()


class RouterTest(RepoCase):
    def test_dry_run_builds_prompt_and_changes_nothing(self):
        before = (self.repo / "agent_state/tasks.md").read_text()
        code, out = self.run_router(self.cfg(), dry_run=True)
        self.assertEqual(code, 0)
        for marker in ["T1 -> claude", "Write a.js", "CONTEXT-MARKER", "SEED-HANDOFF",
                       "Do not commit, push, or deploy", "| T2 |"]:
            self.assertIn(marker, out)
        self.assertEqual((self.repo / "agent_state/tasks.md").read_text(), before)

    def test_success_marks_done_and_writes_log(self):
        code, out = self.run_router(self.cfg())
        self.assertEqual(code, 0, out)
        self.assertEqual(self.rows()["T1"]["status"], "done")
        self.assertIn("MARKER-FROM-claude", self.handoff())
        self.assertIn("Router: check passed", self.handoff())
        log = next((self.repo / "agent_state/log").glob("*-T1.md")).read_text()
        self.assertIn("Result: done", log)
        self.assertIn("claude.js", log)
        self.assertIn("Agent wrote handoff.md: yes", log)

    def test_second_agent_receives_first_agents_handoff(self):
        self.assertEqual(self.run_router(self.cfg())[0], 0)
        code, out = self.run_router(self.cfg())
        self.assertEqual(code, 0, out)
        self.assertEqual(self.rows()["T2"]["status"], "done")
        hermes_prompt = (self.repo / "prompt-hermes.txt").read_text()
        self.assertIn("MARKER-FROM-claude", hermes_prompt)
        self.assertIn("| T1 | Write a.js | done |", hermes_prompt)

    def test_agent_that_skips_handoff_gets_fallback(self):
        lazy = [sys.executable, "-c", "import sys; sys.stdin.read(); print('LAZY-OUTPUT')"]
        code, out = self.run_router(self.cfg(claude=lazy))
        self.assertEqual(code, 0, out)
        self.assertIn("did not write handoff.md", out)
        self.assertIn("LAZY-OUTPUT", self.handoff())
        self.assertIn("Status: done", self.handoff())

    def test_failed_check_blocks_task(self):
        bad = [sys.executable, "-c",
               "import sys,pathlib; sys.stdin.read(); pathlib.Path('bad.js').write_text('var = ;')"]
        code, out = self.run_router(self.cfg(claude=bad))
        self.assertEqual(code, 1)
        self.assertEqual(self.rows()["T1"]["status"], "blocked")
        self.assertIn("Status: blocked", self.handoff())
        self.assertIn("SyntaxError", self.handoff())
        self.assertIn("SEED-HANDOFF", self.handoff())  # previous notes survive a failure

    def test_missing_agent_cli_blocks_task(self):
        code, out = self.run_router(self.cfg(claude=["no-such-agent-cli"]))
        self.assertEqual(code, 1)
        self.assertEqual(self.rows()["T1"]["status"], "blocked")
        self.assertIn("command not found", self.handoff())

    def test_failing_agent_exit_code_blocks_task(self):
        crash = [sys.executable, "-c", "import sys; sys.stdin.read(); sys.exit(3)"]
        code, _ = self.run_router(self.cfg(claude=crash))
        self.assertEqual(code, 1)
        self.assertIn("agent exited 3", self.rows()["T1"]["notes"])

    def test_in_progress_task_stops_new_runs(self):
        router.write_row(self.repo / "agent_state/tasks.md", "T1", status="in_progress")
        code, out = self.run_router(self.cfg())
        self.assertIn("in_progress", str(code))

    def test_unassigned_tasks_are_skipped(self):
        for t in ["T1", "T2"]:
            router.write_row(self.repo / "agent_state/tasks.md", t, status="done")
        code, _ = self.run_router(self.cfg())
        self.assertIn("no owner", str(code))
        code, out = self.run_router(self.cfg(), agent_override="claude", dry_run=True)
        self.assertIn("T3 -> claude", out)

    def test_new_task_text_is_added_and_run(self):
        code, out = self.run_router(self.cfg(), wanted="Brand new task", agent_override="hermes")
        self.assertEqual(code, 0, out)
        row = self.rows()["T4"]
        self.assertEqual((row["task"], row["owner"], row["status"]), ("Brand new task", "hermes", "done"))

    def test_new_task_without_agent_is_refused(self):
        code, _ = self.run_router(self.cfg(), wanted="Brand new task")
        self.assertIn("--agent", str(code))

    def test_done_task_is_not_rerun(self):
        router.write_row(self.repo / "agent_state/tasks.md", "T1", status="done")
        code, _ = self.run_router(self.cfg(), wanted="T1")
        self.assertIn("already done", str(code))

    def test_git_status_sees_second_edit_of_modified_file(self):
        target = self.repo / "agent.py"
        target.write_text("# edit 1\n")
        before = router.git_status(self.repo)
        target.write_text("# edit 2\n")
        self.assertNotEqual(router.git_status(self.repo), before)

    def test_pipes_in_notes_do_not_break_table(self):
        router.write_row(self.repo / "agent_state/tasks.md", "T1", notes="a | b")
        self.assertEqual(self.rows()["T1"]["notes"], "a / b")
        self.assertEqual(len(self.rows()), 3)


# Fake agent that emits Claude Code style stream-json, edits a file and writes handoff.md.
STREAM_AGENT = textwrap.dedent("""\
    import sys, json, pathlib, os
    sys.stdin.read()
    repo = os.getcwd()
    def emit(e): print(json.dumps(e), flush=True)
    emit({"type": "system", "subtype": "init"})
    emit({"type": "assistant", "message": {"content": [
        {"type": "text", "text": "Working on it"},
        {"type": "tool_use", "name": "Edit", "input": {"file_path": repo + "/s.js"}}]}})
    pathlib.Path("s.js").write_text("var s = 1;\\n")
    pathlib.Path("agent_state/handoff.md").write_text("Task: s\\nStatus: done\\n")
    emit({"type": "result", "total_cost_usd": 0.1234})
""")


class StreamingTest(RepoCase):
    def test_parse_claude_events(self):
        line = json.dumps({"type": "assistant", "message": {"content": [
            {"type": "text", "text": "hi"},
            {"type": "tool_use", "name": "Read", "input": {"file_path": f"{self.repo}/a.js"}}]}})
        self.assertEqual(router.parse_line(line, self.repo), "hi\n\n> Read a.js\n")
        self.assertEqual(router.parse_line(json.dumps({"type": "result", "total_cost_usd": 0.5}), self.repo),
                         "\n[cost $0.50]\n")
        self.assertEqual(router.parse_line(json.dumps({"type": "rate_limit_event"}), self.repo), "")

    def test_parse_hermes_events(self):
        self.assertEqual(router.parse_line(json.dumps({"type": "text", "text": "ap"}), self.repo), "ap")
        tool = json.dumps({"type": "tool_use", "name": "read_file", "input": {"path": f"{self.repo}/x"}})
        self.assertEqual(router.parse_line(tool, self.repo), "\n> read_file x\n")
        self.assertEqual(router.parse_line(json.dumps({"type": "result", "tokens": {"total": 9}}), self.repo),
                         "\n[9 tokens]\n")
        self.assertEqual(router.parse_line("Session: abc\n", self.repo), "Session: abc\n")

    def test_long_tool_args_are_shortened(self):
        out = router.tool_line("Bash", {"command": "x" * 300}, self.repo)
        self.assertLess(len(out), 120)

    def test_output_is_streamed_to_echo(self):
        (self.repo / "stream.py").write_text(STREAM_AGENT)
        cfg = self.cfg(claude=[sys.executable, "stream.py"])
        cfg["agents"]["claude"]["format"] = "stream-json"
        seen = []
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = router.run(cfg, echo=seen.append)
        self.assertEqual(code, 0, out.getvalue())
        streamed = "".join(seen)
        self.assertIn("Working on it", streamed)
        self.assertIn("> Edit s.js", streamed)
        self.assertIn("[cost $0.12]", streamed)
        self.assertNotIn('"type"', streamed)  # raw JSON never shown
        log = next((self.repo / "agent_state/log").glob("*-T1.md")).read_text()
        self.assertIn("> Edit s.js", log)

    def test_ctrl_c_stops_agent_and_blocks_task(self):
        slow = [sys.executable, "-c", "import sys,time; sys.stdin.read(); print('started', flush=True); time.sleep(30)"]

        def interrupt(text):
            raise KeyboardInterrupt

        code, out = self.run_router(self.cfg(claude=slow), echo=interrupt)
        self.assertEqual(code, 1)
        self.assertEqual(self.rows()["T1"]["status"], "blocked")
        self.assertIn("stopped by user", self.rows()["T1"]["notes"])

    def test_timeout_blocks_task(self):
        slow = [sys.executable, "-c", "import sys,time; sys.stdin.read(); time.sleep(30)"]
        cfg = self.cfg(claude=slow)
        cfg["agent_timeout"] = 1
        code, _ = self.run_router(cfg)
        self.assertEqual(code, 1)
        self.assertIn("timed out", self.handoff())


if __name__ == "__main__":
    unittest.main()
