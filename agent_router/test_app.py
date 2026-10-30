"""Tests for the local web app. Run: python3 -m unittest agent_router/test_app.py"""
import contextlib
import http.client
import io
import json
import re
import subprocess
import sys
import textwrap
import threading
import time
import unittest
from unittest import mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "app"))
import cli  # noqa: E402
import router  # noqa: E402
import server  # noqa: E402
from test_router import RepoCase  # noqa: E402

# Fake agent: reports a session ID, records its arguments and prompt, edits a file, writes handoff.md.
# If .git/plan.json exists it follows a scripted list of moves per agent instead (for relay tests).
# Its own bookkeeping lives in .git/ so it never shows up as a code change.
SESSION_AGENT = textwrap.dedent("""\
    import sys, json, pathlib, time
    args = sys.argv[1:]
    name = args[0]
    prompt = sys.stdin.read()
    runs = pathlib.Path(f".git/runs-{name}.jsonl")
    with runs.open("a") as f:
        f.write(json.dumps({"args": args, "prompt": prompt}) + "\\n")
    plan_path = pathlib.Path(".git/plan.json")
    plan = json.loads(plan_path.read_text()) if plan_path.exists() else {}
    if name in plan:
        action = plan[name].pop(0) if plan[name] else "comment"
        plan_path.write_text(json.dumps(plan))
        print(json.dumps({"type": "system", "session_id": f"sess-{name}"}), flush=True)
        kind, *rest = action.split(" ", 2)
        if kind == "say":
            print(action[4:], flush=True)
            sys.exit(0)
        if kind == "route":
            print("ROUTE: CODE", flush=True)
            sys.exit(0)
        if kind in ("write", "edit-approve"):
            pathlib.Path(rest[0]).write_text(rest[1] + "\\n")
        if kind == "bad":
            pathlib.Path(rest[0]).write_text("var = ;\\n")
        if kind in ("approve", "edit-approve"):
            print("Looks good.\\nAPPROVED", flush=True)
        else:
            print(f"{name} move: {kind}", flush=True)
        pathlib.Path("agent_state/handoff.md").write_text(f"Agent: {name}\\nMove: {action}\\n")
        sys.exit(0)
    if "SLOW" in prompt:
        time.sleep(3)
    print(json.dumps({"type": "system", "session_id": f"sess-{name}"}), flush=True)
    print(f"{name} did the work", flush=True)
    pathlib.Path(f"{name}.js").write_text("var ok = 1;\\n")
    pathlib.Path("agent_state/handoff.md").write_text(f"Task: x\\nAgent: {name}\\nStatus: done\\n")
""")


class AppTest(RepoCase):
    def setUp(self):
        super().setUp()
        (self.repo / "sess.py").write_text(SESSION_AGENT)
        (self.repo / "icon-192.png").write_bytes(b"\x89PNG fake")
        cfg = self.cfg(claude=[sys.executable, "sess.py", "claude"],
                       hermes=[sys.executable, "sess.py", "hermes"])
        for spec in cfg["agents"].values():
            spec["resume"] = ["--resume", "{session_id}"]
        cfg["agents"]["hermes"]["vision"] = False
        self.server = server.make_server(cfg, 0)
        self.port = self.server.server_address[1]
        self.app = self.server.RequestHandlerClass.app
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.wait()
        self.server.shutdown()
        self.server.server_close()
        super().tearDown()

    def request(self, method, path, body=None, headers=None, host=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Host": host or f"localhost:{self.port}"}
        if method == "POST":
            h.update({"Content-Type": "application/json", "X-Agents": "1"})
        h.update(headers or {})
        conn.request(method, path, json.dumps(body) if body is not None else None, h)
        res = conn.getresponse()
        data = res.read()
        conn.close()
        try:
            return res.status, json.loads(data)
        except ValueError:
            return res.status, data

    def post(self, path, body=None):
        return self.request("POST", path, body or {})

    def wait(self, timeout=15):
        end = time.time() + timeout
        while time.time() < end:
            if self.app.idle():
                return
            time.sleep(0.05)
        self.fail("app did not finish its jobs")

    def runs(self, name):
        path = self.repo / f".git/runs-{name}.jsonl"
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    # ---- static and security ----

    def test_serves_page_manifest_and_repo_icon(self):
        status, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"Applio Agents", body)
        self.assertEqual(self.request("GET", "/manifest.json")[0], 200)
        self.assertEqual(self.request("GET", "/icon-192.png")[1], b"\x89PNG fake")

    def test_no_files_outside_static(self):
        self.assertEqual(self.request("GET", "/../router.py")[0], 404)
        self.assertEqual(self.request("GET", "/%2e%2e/router.py")[0], 404)
        self.assertEqual(self.request("GET", "/sess.py")[0], 404)

    def test_rejects_other_hosts_and_cross_site_posts(self):
        self.assertEqual(self.request("GET", "/api/state", host="evil.com")[0], 403)
        status, _ = self.request("POST", "/api/tasks", {"agent": "claude", "text": "x"}, headers={"X-Agents": ""})
        self.assertEqual(status, 403)
        status, _ = self.request("POST", "/api/tasks", {"agent": "claude", "text": "x"},
                                 headers={"Origin": "https://evil.com"})
        self.assertEqual(status, 403)
        self.assertEqual(len(self.rows()), 3)

    def test_bad_json_and_unknown_agent(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("POST", "/api/tasks", "{not json", {"Host": f"localhost:{self.port}", "X-Agents": "1"})
        self.assertEqual(conn.getresponse().status, 400)
        conn.close()
        status, body = self.post("/api/tasks", {"agent": "gpt", "text": "x"})
        self.assertEqual((status, body["error"]), (400, "Unknown agent 'gpt'"))

    # ---- tasks and threads ----

    def test_state_lists_tasks_and_agents(self):
        status, body = self.request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertEqual([t["id"] for t in body["tasks"]], ["T1", "T2", "T3"])
        self.assertEqual(body["agents"], ["claude", "hermes"])

    def test_new_task_runs_and_builds_thread(self):
        status, body = self.post("/api/tasks", {"agent": "claude", "text": "Write c.js"})
        self.assertEqual((status, body["id"]), (200, "T4"))
        self.wait()
        self.assertEqual(self.rows()["T4"]["status"], "done")
        thread = self.request("GET", "/api/threads/T4")[1]
        roles = [m["role"] for m in thread["messages"]]
        self.assertEqual(roles, ["user", "agent", "result"])
        self.assertIn("claude did the work", thread["messages"][1]["text"])
        self.assertFalse(thread["messages"][1]["live"])
        self.assertTrue(thread["messages"][2]["ok"])
        self.assertIn("claude.js", thread["messages"][2]["files"])
        self.assertEqual(thread["session_id"], "sess-claude")
        self.assertTrue((self.repo / "agent_state/threads/T4.json").exists())

    def test_reply_resumes_the_same_session(self):
        self.post("/api/tasks", {"agent": "claude", "text": "Write c.js"})
        self.wait()
        status, _ = self.post("/api/tasks/T4/reply", {"text": "Also add a comment"})
        self.assertEqual(status, 200)
        self.wait()
        first, second = self.runs("claude")
        self.assertNotIn("--resume", first["args"])
        self.assertEqual(second["args"][-2:], ["--resume", "sess-claude"])
        self.assertIn("Also add a comment", second["prompt"])
        self.assertNotIn("===== agent_state/context.md", second["prompt"])  # resumed: no full re-brief
        roles = [m["role"] for m in self.request("GET", "/api/threads/T4")[1]["messages"]]
        self.assertEqual(roles, ["user", "agent", "result", "user", "agent", "result"])
        self.assertEqual(self.rows()["T4"]["status"], "done")
        self.assertEqual(len(list((self.repo / "agent_state/log").glob("*-T4*.md"))), 2)

    def test_reply_after_owner_change_starts_fresh_with_full_brief(self):
        self.post("/api/tasks", {"agent": "claude", "text": "Write c.js"})
        self.wait()
        self.post("/api/tasks/T4/owner", {"agent": "hermes"})
        self.post("/api/tasks/T4/reply", {"text": "Hermes, take over"})
        self.wait()
        run = self.runs("hermes")[0]
        self.assertNotIn("--resume", run["args"])
        self.assertIn("===== agent_state/context.md", run["prompt"])
        self.assertIn("Hermes, take over", run["prompt"])

    def test_reply_rules(self):
        self.assertEqual(self.post("/api/tasks/T1/reply", {"text": "hi"})[0], 409)  # never ran
        self.assertEqual(self.post("/api/tasks/T99/reply", {"text": "hi"})[0], 404)
        self.post("/api/tasks", {"agent": "claude", "text": "Write c.js"})
        self.wait()
        self.assertEqual(self.post("/api/tasks/T4/reply", {"text": "  "})[0], 400)

    def test_run_existing_task_and_rules(self):
        self.assertEqual(self.post("/api/tasks/T3/run")[0], 400)  # no owner
        self.assertEqual(self.post("/api/tasks/T3/run", {"agent": "hermes"})[0], 200)
        self.wait()
        self.assertEqual(self.rows()["T3"]["status"], "done")
        self.assertEqual(self.post("/api/tasks/T3/run")[0], 409)  # done: reply instead

    def test_queue_runs_one_at_a_time_in_order(self):
        self.post("/api/tasks", {"agent": "claude", "text": "SLOW first"})
        self.post("/api/tasks", {"agent": "hermes", "text": "second"})
        time.sleep(0.3)
        state = self.request("GET", "/api/state")[1]
        self.assertEqual(state["current"], "T4")
        self.assertEqual(state["queued"], ["T5"])
        self.wait()
        self.assertEqual(self.rows()["T4"]["status"], "done")
        self.assertEqual(self.rows()["T5"]["status"], "done")

    def test_stop_running_task_blocks_it(self):
        self.post("/api/tasks", {"agent": "claude", "text": "SLOW task"})
        time.sleep(0.4)
        status, body = self.post("/api/tasks/T4/stop")
        self.assertEqual((status, body["result"]), (200, "stopping"))
        self.wait()
        self.assertEqual(self.rows()["T4"]["status"], "blocked")
        result = self.request("GET", "/api/threads/T4")[1]["messages"][-1]
        self.assertEqual((result["role"], result["ok"], result["reason"]), ("result", False, "stopped by user"))
        self.assertEqual(self.post("/api/tasks/T4/reset")[0], 200)
        self.assertEqual(self.rows()["T4"]["status"], "pending")

    def test_cancel_queued_task(self):
        self.post("/api/tasks", {"agent": "claude", "text": "SLOW first"})
        self.post("/api/tasks", {"agent": "hermes", "text": "second"})
        time.sleep(0.2)
        self.assertEqual(self.post("/api/tasks/T5/stop")[1]["result"], "cancelled")
        self.wait()
        self.assertEqual(self.rows()["T5"]["status"], "pending")
        self.assertEqual(self.runs("hermes"), [])

    def test_multiline_task_stays_one_row(self):
        self.post("/api/tasks", {"agent": "claude", "text": "line one\nline | two", "run": False})
        self.assertEqual(self.rows()["T4"]["task"], "line one line / two")
        self.assertEqual(self.rows()["T4"]["status"], "pending")

    def test_reset_only_blocked(self):
        self.assertEqual(self.post("/api/tasks/T1/reset")[0], 409)

    def test_thread_for_task_run_outside_app_comes_from_logs(self):
        router.run(self.app.cfg, "T1")
        thread = self.request("GET", "/api/threads/T1")[1]
        self.assertEqual([m["role"] for m in thread["messages"]], ["user", "agent", "result"])
        self.assertIn("claude did the work", thread["messages"][1]["text"])
        self.assertTrue(thread["messages"][2]["ok"])

    # ---- relay ----

    def relay(self, plan, text="Write a.js"):
        (self.repo / ".git/plan.json").write_text(json.dumps(plan))
        status, body = self.post("/api/tasks", {"agent": "relay", "text": text})
        self.assertEqual(status, 200, body)
        self.wait()
        return body["id"], self.request("GET", f"/api/threads/{body['id']}")[1]["messages"]

    def test_relay_reviewer_approves(self):
        task_id, msgs = self.relay({"claude": ["write a.js var a = 1;"], "hermes": ["approve"]})
        row = self.rows()[task_id]
        self.assertEqual((row["status"], row["owner"]), ("done", "claude+hermes"))
        steps = [(m["role"], m.get("agent"), m.get("step"), m.get("approved"), m.get("relay")) for m in msgs]
        self.assertEqual(steps, [
            ("user", None, None, None, None),
            ("agent", "claude", "build", None, None),
            ("result", None, "build", False, None),
            ("agent", "hermes", "review", None, None),
            ("result", None, "review", True, None),
            ("result", None, None, None, "agreed"),
        ])
        self.assertIn("===== RELAY =====", self.runs("claude")[0]["prompt"])
        review = self.runs("hermes")[0]["prompt"]
        self.assertIn("RELAY REVIEW", review)
        self.assertIn("+var a = 1;", review)
        self.assertIn("check after Claude's turn: passed", review)

    def test_relay_reviewer_fixes_then_builder_approves(self):
        task_id, msgs = self.relay({"claude": ["write a.js var a = 1;", "approve"],
                                    "hermes": ["write a.js var a = 2;"]})
        self.assertEqual(self.rows()[task_id]["status"], "done")
        self.assertEqual(len(self.runs("claude")), 2)
        self.assertIn("+var a = 2;", self.runs("claude")[1]["prompt"])
        self.assertEqual(msgs[-1]["relay"], "agreed")
        self.assertIn("a.js", msgs[4]["files"])  # a second edit to an already-changed file is detected

    def test_relay_check_failure_goes_to_reviewer(self):
        task_id, msgs = self.relay({"claude": ["bad a.js", "approve"], "hermes": ["write a.js var a = 3;"]})
        self.assertFalse(msgs[2]["ok"])
        self.assertIn("FAILED", self.runs("hermes")[0]["prompt"])
        self.assertIn("SyntaxError", self.runs("hermes")[0]["prompt"])
        self.assertEqual(self.rows()[task_id]["status"], "done")
        self.assertEqual(msgs[-1]["relay"], "agreed")

    def test_relay_approval_with_edits_does_not_count(self):
        task_id, msgs = self.relay({"claude": ["write a.js var a = 1;", "approve"],
                                    "hermes": ["edit-approve a.js var a = 5;"]})
        self.assertFalse(msgs[4]["approved"])
        self.assertEqual(len(self.runs("claude")), 2)
        self.assertEqual(msgs[-1]["relay"], "agreed")

    def test_relay_without_agreement_blocks(self):
        self.app.cfg["relay_max_turns"] = 3
        task_id, msgs = self.relay({"claude": ["write a.js var a = 1;", "comment"], "hermes": ["comment"]})
        row = self.rows()[task_id]
        self.assertEqual(row["status"], "blocked")
        self.assertIn("no approval after 3 turns", row["notes"])
        self.assertEqual(msgs[-1]["relay"], "no_agreement")
        self.assertEqual(len([m for m in msgs if m["role"] == "agent"]), 3)

    def test_relay_reply_runs_another_round(self):
        task_id, _ = self.relay({"claude": ["write a.js var a = 1;", "write a.js var a = 9;"],
                                 "hermes": ["approve", "approve"]})
        self.assertEqual(self.post(f"/api/tasks/{task_id}/reply", {"text": "Make it 9"})[0], 200)
        self.wait()
        prompt = self.runs("claude")[1]["prompt"]
        self.assertIn("Make it 9", prompt)
        self.assertIn("===== RELAY =====", prompt)
        self.assertEqual(len(self.runs("hermes")), 2)
        msgs = self.request("GET", f"/api/threads/{task_id}")[1]["messages"]
        self.assertEqual([m.get("relay") for m in msgs if m.get("relay")], ["agreed", "agreed"])
        self.assertEqual(self.rows()[task_id]["owner"], "claude+hermes")

    def test_relay_owner_choices(self):
        self.assertEqual(self.post("/api/tasks/T3/owner", {"agent": "hermes+claude"})[0], 200)
        self.assertEqual(self.rows()["T3"]["owner"], "hermes+claude")
        self.assertEqual(self.post("/api/tasks/T3/owner", {"agent": "claude+claude"})[0], 400)
        self.assertEqual(self.post("/api/tasks/T3/owner", {"agent": "claude+gpt"})[0], 400)

    def test_relay_stop_mid_turn(self):
        (self.repo / ".git/plan.json").unlink(missing_ok=True)
        self.post("/api/tasks", {"agent": "relay", "text": "SLOW relay"})
        time.sleep(0.4)
        self.post("/api/tasks/T4/stop")
        self.wait()
        self.assertEqual(self.rows()["T4"]["status"], "blocked")
        self.assertEqual(self.runs("hermes"), [])  # never handed to the reviewer

    # ---- auto ----

    def auto(self, plan, text="What does js/config.js do?"):
        (self.repo / ".git/plan.json").write_text(json.dumps(plan))
        status, body = self.post("/api/tasks", {"agent": "auto", "text": text})
        self.assertEqual(status, 200, body)
        self.wait()
        return body["id"], self.request("GET", f"/api/threads/{body['id']}")[1]["messages"]

    def test_auto_question_is_answered_by_hermes(self):
        task_id, msgs = self.auto({"hermes": ["say It sets the API URL."]})
        self.assertEqual([m["role"] for m in msgs], ["user", "agent", "result"])
        self.assertEqual(msgs[1]["agent"], "hermes")
        self.assertIn("It sets the API URL.", msgs[1]["text"])
        self.assertTrue(msgs[2]["answer"] and msgs[2]["ok"])
        row = self.rows()[task_id]
        self.assertEqual((row["status"], row["owner"]), ("done", "auto"))
        self.assertIn("answered by hermes", row["notes"])
        self.assertIn("SEED-HANDOFF", self.handoff())  # answers leave the coding handoff alone
        self.assertEqual(self.runs("claude"), [])
        self.assertIn("ROUTE: CODE", self.runs("hermes")[0]["prompt"])  # Hermes was told how to route

    def test_auto_code_request_goes_to_claude(self):
        task_id, msgs = self.auto({"hermes": ["route"], "claude": ["write a.js var a = 1;"]}, "Add a.js")
        self.assertEqual([(m["role"], m.get("agent")) for m in msgs],
                         [("user", None), ("agent", "hermes"), ("agent", "claude"), ("result", None)])
        self.assertEqual(msgs[1]["step"], "route")
        self.assertIn("handing it to Claude", msgs[1]["text"])
        self.assertTrue(msgs[3]["ok"])
        self.assertIn("a.js", msgs[3]["files"])
        row = self.rows()[task_id]
        self.assertEqual((row["status"], row["owner"]), ("done", "auto"))
        self.assertIn("Task: Add a.js", self.runs("claude")[0]["prompt"])

    def test_auto_follow_ups_resume_each_agents_own_session(self):
        task_id, _ = self.auto({"hermes": ["route", "route"],
                                "claude": ["write a.js var a = 1;", "write a.js var a = 2;"]}, "Add a.js")
        self.post(f"/api/tasks/{task_id}/reply", {"text": "Make it 2"})
        self.wait()
        self.assertEqual(self.runs("hermes")[1]["args"][-2:], ["--resume", "sess-hermes"])
        self.assertEqual(self.runs("claude")[1]["args"][-2:], ["--resume", "sess-claude"])
        self.assertIn("Make it 2", self.runs("claude")[1]["prompt"])

    def test_auto_follow_up_question_after_code_is_answered(self):
        task_id, _ = self.auto({"hermes": ["route", "say a is 1 because you asked."],
                                "claude": ["write a.js var a = 1;"]}, "Add a.js")
        self.post(f"/api/tasks/{task_id}/reply", {"text": "Why 1?"})
        self.wait()
        msgs = self.request("GET", f"/api/threads/{task_id}")[1]["messages"]
        self.assertIn("a is 1 because you asked.", msgs[-2]["text"])
        self.assertEqual(len(self.runs("claude")), 1)
        self.assertEqual(self.rows()[task_id]["status"], "done")

    def test_auto_answer_runs_while_claude_is_coding(self):
        (self.repo / ".git/plan.json").write_text(json.dumps({"hermes": ["say quick answer"]}))
        self.post("/api/tasks", {"agent": "claude", "text": "SLOW coding task"})
        time.sleep(0.3)
        self.post("/api/tasks", {"agent": "auto", "text": "quick question"})
        deadline = time.time() + 2.5
        while time.time() < deadline and self.rows()["T5"]["status"] != "done":
            time.sleep(0.05)
        self.assertEqual(self.rows()["T5"]["status"], "done")
        self.assertEqual(self.request("GET", "/api/state")[1]["current"], "T4")  # Claude still working
        self.wait()
        self.assertEqual(self.rows()["T4"]["status"], "done")

    def test_auto_answer_that_changes_files_is_flagged(self):
        task_id, msgs = self.auto({"hermes": ["write x.js var x = 1;"]})
        self.assertTrue(msgs[-1]["answer"])
        self.assertIn("x.js", msgs[-1]["files"])

    def test_auto_hides_hermes_session_lines(self):
        line = "session_id: local-abc\n"
        self.assertEqual(router.session_in(line), "local-abc")

    # ---- attachments ----

    def shot(self, name="Screen Shot.png"):
        folder = Path(self.tmp.name) / "outside"
        folder.mkdir(exist_ok=True)
        path = folder / name
        path.write_bytes(b"\x89PNG screenshot")
        return path

    def test_screenshot_question_goes_to_claude_because_hermes_cannot_see(self):
        (self.repo / ".git/plan.json").write_text(json.dumps({"claude": ["say It is a login page."]}))
        task_id = self.app.new_task("auto", "What is in this screenshot?", files=[str(self.shot())])
        self.wait()
        saved = self.repo / "agent_state/attachments" / task_id / "Screen Shot.png"
        self.assertTrue(saved.exists())
        self.assertEqual(self.runs("hermes"), [])
        run = self.runs("claude")[0]
        self.assertIn("ROUTE: CODE", run["prompt"])  # Claude answers or routes, like Hermes would
        self.assertIn("===== ATTACHED FILES =====", run["prompt"])
        msgs = self.request("GET", f"/api/threads/{task_id}")[1]["messages"]
        self.assertTrue(msgs[-1]["answer"])
        self.assertIn("SEED-HANDOFF", self.handoff())
        self.assertIn(f"agent_state/attachments/{task_id}/Screen Shot.png", run["prompt"])
        thread = self.request("GET", f"/api/threads/{task_id}")[1]
        self.assertEqual(thread["messages"][0]["files"], [f"agent_state/attachments/{task_id}/Screen Shot.png"])

    def test_attachment_follows_the_handoff_to_claude(self):
        (self.repo / ".git/plan.json").write_text(json.dumps({"hermes": ["route"], "claude": ["write a.js var a = 1;"]}))
        self.app.new_task("auto", "Use the values in this file", files=[str(self.shot("values.txt"))])
        self.wait()
        self.assertIn("values.txt", self.runs("hermes")[0]["prompt"])
        self.assertIn("ATTACHED FILES", self.runs("claude")[0]["prompt"])

    def test_screenshot_code_request_continues_claudes_session(self):
        (self.repo / ".git/plan.json").write_text(json.dumps({"claude": ["route", "write a.js var a = 1;"]}))
        task_id = self.app.new_task("auto", "Make it look like this", files=[str(self.shot())])
        self.wait()
        self.assertEqual(self.rows()[task_id]["status"], "done")
        self.assertEqual(len(self.runs("claude")), 2)
        self.assertIn("ATTACHED FILES", self.runs("claude")[1]["prompt"])

    def test_reply_attachments_and_relay_reviewer_sees_them(self):
        (self.repo / ".git/plan.json").write_text(json.dumps({"claude": ["write a.js var a = 1;", "write a.js var a = 2;"],
                                                               "hermes": ["approve", "approve"]}))
        self.post("/api/tasks", {"agent": "relay", "text": "Write a.js"})
        self.wait()
        self.app.reply("T4", "Match this design", files=[str(self.shot("design.png"))])
        self.wait()
        self.assertIn("design.png", self.runs("claude")[1]["prompt"])
        self.assertIn("design.png", self.runs("hermes")[1]["prompt"])
        self.assertNotIn("ATTACHED FILES", self.runs("claude")[0]["prompt"])

    def test_same_name_attachments_do_not_overwrite(self):
        first = self.app.save_attachments("T1", [str(self.shot("a.png"))])
        second = self.app.save_attachments("T1", [str(self.shot("a.png"))])
        self.assertEqual([Path(first[0]).name, Path(second[0]).name], ["a.png", "a-2.png"])

    def test_bad_attachment_creates_no_task(self):
        with self.assertRaises(server.ApiError):
            self.app.new_task("auto", "look", files=["/no/such/file.png"])
        self.assertEqual(len(self.rows()), 3)

    def test_handoff_context_and_diff(self):
        self.assertIn("SEED-HANDOFF", self.request("GET", "/api/files/handoff")[1]["text"])
        self.assertIn("CONTEXT-MARKER", self.request("GET", "/api/files/context")[1]["text"])
        self.post("/api/tasks", {"agent": "claude", "text": "Write c.js"})
        self.wait()
        self.assertIn("claude.js", self.request("GET", "/api/diff")[1]["status"])


ORIGINAL_SAY = router.say


class CliTest(RepoCase):
    def setUp(self):
        super().setUp()
        (self.repo / "sess.py").write_text(SESSION_AGENT)
        cfg = self.cfg(claude=[sys.executable, "sess.py", "claude"], hermes=[sys.executable, "sess.py", "hermes"])
        for spec in cfg["agents"].values():
            spec["resume"] = ["--resume", "{session_id}"]
        cfg["agents"]["hermes"]["vision"] = False  # as in config.toml
        self.shell = cli.Shell(cfg, poll=0.02)

    def tearDown(self):
        router.say = ORIGINAL_SAY
        super().tearDown()

    def plan(self, plan):
        (self.repo / ".git/plan.json").write_text(json.dumps(plan))

    def send(self, line):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            keep = self.shell.handle(line)
        return keep, out.getvalue()

    def runs(self, name):
        path = self.repo / f".git/runs-{name}.jsonl"
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def test_question_is_answered_by_hermes(self):
        self.plan({"hermes": ["say It sets the API URL."]})
        _, out = self.send("what does config.js do?")
        self.assertIn("Hermes", out)
        self.assertIn("It sets the API URL.", out)
        self.assertNotIn("check passed", out)
        self.assertEqual(self.shell.prompt(), "T4 > ")
        self.assertEqual(self.runs("claude"), [])

    def test_code_request_is_handed_to_claude(self):
        self.plan({"hermes": ["route"], "claude": ["write a.js var a = 1;"]})
        _, out = self.send("add a.js")
        self.assertIn("handing it to Claude", out)
        self.assertNotIn("ROUTE: CODE", out)
        self.assertIn("Claude", out)
        self.assertIn("Done, check passed", out)
        self.assertIn("a.js", out)

    def test_follow_up_stays_in_the_same_task(self):
        self.plan({"hermes": ["say first", "say second"]})
        self.send("question one")
        _, out = self.send("question two")
        self.assertIn("second", out)
        self.assertNotIn("T5", [r["id"] for r in router.read_tasks(self.repo / "agent_state/tasks.md")[2]])
        self.assertEqual(self.runs("hermes")[1]["args"][-2:], ["--resume", "sess-hermes"])

    def test_new_starts_a_fresh_task(self):
        self.plan({"hermes": ["say one", "say two"]})
        self.send("question one")
        _, out = self.send("/new")
        self.assertEqual(self.shell.prompt(), "new > ")
        self.send("question two")
        self.assertEqual(self.shell.prompt(), "T5 > ")

    def test_mentions_pick_the_agent(self):
        self.plan({"claude": ["write a.js var a = 1;"]})
        self.send("@claude add a.js")
        self.assertEqual(self.rows()["T4"]["owner"], "claude")
        self.send("/new")
        self.plan({"claude": ["write b.js var b = 1;"], "hermes": ["approve"]})
        _, out = self.send("@both add b.js")
        self.assertEqual(self.rows()["T5"]["owner"], "claude+hermes")
        self.assertIn("Both agents agree", out)
        self.send("/new")
        self.plan({"hermes": ["say legacy works"]})
        _, out = self.send("hermes: old style prefix")
        self.assertEqual(self.rows()["T6"]["owner"], "hermes")

    def test_mention_inside_a_task_hands_it_over_with_context(self):
        self.plan({"hermes": ["say Use a constant."], "claude": ["write c.js var c = 1;"]})
        self.send("how should I store c?")
        _, out = self.send("@claude do it")
        self.assertIn("T4 now goes to Claude", out)
        prompt = self.runs("claude")[0]["prompt"]
        self.assertIn("CONVERSATION SO FAR", prompt)
        self.assertIn("Use a constant.", prompt)
        self.assertIn("do it", prompt)

    def test_agent_command(self):
        self.send("/agent claude")
        self.assertEqual(self.shell.prompt(), "new (Claude) > ")
        _, out = self.send("/agent gpt")
        self.assertIn("Unknown agent", out)
        _, out = self.send("/agent")
        self.assertIn("New tasks go to Claude", out)

    def test_open_shows_history_and_tasks_marks_focus(self):
        router.run(self.shell.cfg, "T1")
        _, out = self.send("/open t1")
        self.assertIn("Write a.js", out)
        self.assertIn("claude did the work", out)
        self.assertEqual(self.shell.prompt(), "T1 > ")
        _, out = self.send("/tasks")
        self.assertIn("*T1", out)

    def test_errors_are_printed_not_raised(self):
        self.assertIn("Open a task first", self.send("/run")[1])
        self.assertIn("Unknown command", self.send("/bogus")[1])
        self.assertIn("No task T99", self.send("/open T99")[1])

    def shot(self, name="Screen Shot 1.png"):
        folder = Path(self.tmp.name) / "outside"
        folder.mkdir(exist_ok=True)
        path = folder / name
        path.write_bytes(b"\x89PNG screenshot")
        return path

    def test_dragged_file_is_attached(self):
        self.plan({"claude": ["say A login page."]})
        dragged = str(self.shot()).replace(" ", "\\ ")
        _, out = self.send(f"{dragged} what is this?")
        self.assertIn("attached: Screen Shot 1.png", out)
        self.assertEqual(self.rows()["T4"]["task"], "what is this?")
        self.assertIn("Screen Shot 1.png", self.runs("claude")[0]["prompt"])

    def test_file_alone_gets_a_default_message(self):
        self.plan({"claude": ["say Got it."]})
        self.send(f"'{self.shot()}'")
        self.assertEqual(self.rows()["T4"]["task"], "Take a look at the attached file.")

    def test_attach_command_and_prompt_indicator(self):
        _, out = self.send(f"/attach {self.shot()}")
        self.assertIn("goes with your next message", out)
        self.assertEqual(self.shell.prompt(), "new [1 file] > ")
        self.send("/attach clear")
        self.assertEqual(self.shell.prompt(), "new > ")
        self.send(f"/attach {self.shot('notes.txt')}")
        self.plan({"hermes": ["say ok"]})
        self.send("what is this")
        self.assertEqual(self.shell.prompt(), "T4 > ")
        self.assertIn("ATTACHED FILES", self.runs("hermes")[0]["prompt"])

    def test_warns_when_sending_a_screenshot_to_hermes(self):
        self.plan({"hermes": ["say I can't see it."]})
        _, out = self.send(f"@hermes {self.shot()} what is this")
        self.assertIn("Hermes can't see images", out)
        self.assertIn("No file at", self.send("/attach /no/such.png")[1])

    def test_paste_without_clipboard_image(self):
        failed = subprocess.CompletedProcess([], 1, "", "no image")
        with mock.patch.object(cli.shutil, "which", return_value="/usr/bin/osascript"), \
                mock.patch.object(cli.subprocess, "run", return_value=failed):
            _, out = self.send("/paste")
        self.assertIn("No image on the clipboard", out)
        self.assertEqual(self.shell.pending, [])

    def test_paste_attaches_clipboard_image(self):
        def fake_osascript(cmd, **kw):
            path = re.search(r'POSIX file "([^"]+)"', cmd[2]).group(1)
            Path(path).write_bytes(b"\x89PNG clip")
            return subprocess.CompletedProcess(cmd, 0, "", "")
        with mock.patch.object(cli.shutil, "which", return_value="/usr/bin/osascript"), \
                mock.patch.object(cli.subprocess, "run", side_effect=fake_osascript):
            _, out = self.send("/paste")
        self.assertIn("Attached the clipboard image", out)
        self.assertEqual(len(self.shell.pending), 1)

    def test_slash_word_in_message_is_not_a_command(self):
        self.assertIn("Unknown command /nope", self.send("/nope do something")[1])

    def test_quit(self):
        self.assertFalse(self.send("/quit")[0])
        self.assertTrue(self.send("/help")[0])


if __name__ == "__main__":
    unittest.main()
