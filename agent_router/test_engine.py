"""Tests for projects, chats and orchestration, with scripted fake agents.
Run: python3 -m unittest agent_router/test_engine.py"""
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine  # noqa: E402

# A fake agent. It follows a script of moves per agent name from FAKE_PLAN, records every run
# (arguments, folder, prompt) next to the plan, and reports a session ID like the real CLIs do.
FAKE_AGENT = textwrap.dedent("""\
    import sys, json, os, pathlib, time
    name = sys.argv[1]
    prompt = sys.stdin.read()
    control = pathlib.Path(os.environ["FAKE_PLAN"]).parent
    with (control / f"runs-{name}.jsonl").open("a") as f:
        f.write(json.dumps({"args": sys.argv[2:], "cwd": os.getcwd(), "prompt": prompt}) + "\\n")
    plan_path = pathlib.Path(os.environ["FAKE_PLAN"])
    plan = json.loads(plan_path.read_text()) if plan_path.exists() else {}
    move = plan.get(name, []).pop(0) if plan.get(name) else "say ok"
    plan_path.write_text(json.dumps(plan))
    print(json.dumps({"type": "system", "session_id": f"sess-{name}"}), flush=True)
    kind, _, rest = move.partition(" ")
    if kind == "say":
        print(rest)
    elif kind == "delegate":
        coder, _, review = rest.partition(" ")
        print(f"DELEGATE: {coder}\\nREVIEW: {'yes' if review else 'no'}\\nBRIEF:\\nDo the thing carefully.")
    elif kind == "write":
        path, _, content = rest.partition(" ")
        pathlib.Path(path).write_text(content + "\\n")
        print(f"Wrote {path}.")
    elif kind == "decide":
        pathlib.Path("d.js").write_text("var d = 1;\\n")
        print(f"Done.\\nDECISION: {rest}")
    elif kind == "bad":
        pathlib.Path(rest).write_text("var = ;\\n")
        print(f"Wrote {rest}.")
    elif kind == "approve":
        print("Looks right.\\nAPPROVED")
    elif kind == "blocked":
        print(f"I can't do this.\\nBLOCKED: {rest}")
    elif kind == "crash":
        print(rest or "crashed")
        sys.exit(1)
    elif kind == "slow":
        time.sleep(3)
        print("finally done")
""")

CHECK = "for f in $(ls *.js 2>/dev/null); do node --check $f || exit 1; done"


class EngineCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.control = root / "control"
        self.control.mkdir()
        (self.control / "agent.py").write_text(FAKE_AGENT)
        os.environ["FAKE_PLAN"] = str(self.control / "plan.json")
        self.applio = root / "applio"
        self.applio.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=self.applio, check=True)
        (self.applio / "index.js").write_text("var ok = 1;\n")
        subprocess.run(["git", "add", "-A"], cwd=self.applio, check=True)
        subprocess.run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"],
                       cwd=self.applio, check=True)
        self.stockbot = root / "stockbot"  # not a git repo, like the real one
        self.stockbot.mkdir()
        (self.stockbot / "bot.py").write_text("print('hi')\n")
        agent = str(self.control / "agent.py")
        self.cfg = {
            "repo": root / "tool", "agent_timeout": 60, "check_timeout": 60,
            "orchestrator": {"agent": "hermes", "coders": ["claude", "chatgpt"], "report": True, "namer": "namer"},
            "agents": {
                "hermes": {"command": [sys.executable, agent, "hermes"], "resume": ["--resume", "{session_id}"],
                           "vision": False},
                "claude": {"command": [sys.executable, agent, "claude"], "resume": ["--resume", "{session_id}"],
                           "add_dir": ["--add-dir", "{dir}"]},
                "namer": {"command": [sys.executable, agent, "namer"]},
                "chatgpt": {"command": [sys.executable, agent, "chatgpt"],
                            "resume_command": [sys.executable, agent, "chatgpt", "resume", "{session_id}"]},
            },
        }
        self.store = engine.Store(root / "home")
        self.engine = engine.Engine(self.cfg, self.store)
        self.store.add_project(self.applio, "Applio", coders=["claude", "chatgpt"], check=CHECK)
        self.store.add_project(self.stockbot, "Stockbot", coders=["chatgpt", "claude"],
                               check="python3 -m compileall -q .", notes=engine.STOCKBOT_NOTES)

    def tearDown(self):
        self.wait()
        self.tmp.cleanup()

    def plan(self, plan):
        (self.control / "plan.json").write_text(json.dumps(plan))

    def runs(self, name):
        path = self.control / f"runs-{name}.jsonl"
        return [json.loads(l) for l in path.read_text().splitlines()] if path.exists() else []

    def wait(self, timeout=20):
        end = time.time() + timeout
        while time.time() < end:
            if self.engine.idle():
                return
            time.sleep(0.05)
        self.fail("engine did not finish")

    def chat(self, pid, text, files=(), agent=None):
        cid = self.engine.new_chat(pid, text, files, agent)
        self.wait()
        return cid, self.store.chat(pid, cid)["messages"]

    def steps(self, messages):
        return [(m["role"], m.get("agent"), m.get("step")) for m in messages]


class OrchestrationTest(EngineCase):
    def test_hermes_answers_questions_itself(self):
        self.plan({"hermes": ["say It sets the API URL."]})
        cid, msgs = self.chat("applio", "What does config.js do?")
        self.assertEqual(self.steps(msgs), [("user", None, None), ("agent", "hermes", "answer")])
        self.assertIn("It sets the API URL.", msgs[1]["text"])
        self.assertEqual(self.runs("claude") + self.runs("chatgpt"), [])
        prompt = self.runs("hermes")[0]["prompt"]
        self.assertIn('orchestrator for the "Applio" project', prompt)
        self.assertIn("default coder is Claude", prompt)
        hermes_dir = self.runs("hermes")[0]["cwd"]
        self.assertNotEqual(hermes_dir, str(self.applio.resolve()))  # Hermes works in its own copy
        self.assertIn(f"/scratch/{cid}/applio", hermes_dir)

    def test_code_goes_to_the_projects_default_coder_then_hermes_reports(self):
        self.plan({"hermes": ["delegate claude", "say Claude added a.js and the check passed."],
                   "claude": ["write a.js var a = 1;"]})
        cid, msgs = self.chat("applio", "Add a.js")
        self.assertEqual(self.steps(msgs), [("user", None, None), ("agent", "hermes", "delegate"),
                                            ("agent", "claude", "code"), ("result", "claude", None),
                                            ("agent", "hermes", "report")])
        self.assertEqual(msgs[1]["text"], "Handing this to Claude.")
        self.assertEqual(msgs[1]["brief"], "Do the thing carefully.")
        self.assertTrue(msgs[3]["ok"])
        self.assertEqual(msgs[3]["files"], ["a.js"])
        self.assertIn("BRIEF FROM HERMES", self.runs("claude")[0]["prompt"])
        self.assertIn("Do the thing carefully.", self.runs("claude")[0]["prompt"])
        self.assertIn("Claude added a.js", msgs[4]["text"])

    def test_stockbot_uses_chatgpt_and_finds_changes_without_git(self):
        self.plan({"hermes": ["delegate chatgpt", "say done"], "chatgpt": ["write strategy.py x = 1"]})
        cid, msgs = self.chat("stockbot", "Add a strategy file")
        run = self.runs("chatgpt")[0]
        self.assertEqual(run["cwd"], str(self.stockbot.resolve()))
        self.assertIn("live trading bot", run["prompt"])  # the project's safety rules reach the coder
        self.assertIn("default coder is ChatGPT", self.runs("hermes")[0]["prompt"])
        result = next(m for m in msgs if m["role"] == "result")
        self.assertTrue(result["ok"])
        self.assertIn("strategy.py", result["files"])

    def test_coder_that_hits_its_limit_hands_over(self):
        self.plan({"hermes": ["delegate claude", "say ChatGPT finished it."],
                   "claude": ["crash You've hit your weekly limit"], "chatgpt": ["write a.js var a = 1;"]})
        cid, msgs = self.chat("applio", "Add a.js")
        note = next(m for m in msgs if m["role"] == "note")
        self.assertIn("Claude failed (You've hit your weekly limit). Handing it to ChatGPT.", note["text"])
        result = next(m for m in msgs if m["role"] == "result")
        self.assertTrue(result["ok"])
        self.assertEqual(result["agent"], "chatgpt")
        self.assertIn("claude", self.engine.unavailable)
        self.plan({"hermes": ["say noted"]})
        self.chat("applio", "Anything else?")
        self.assertIn("Claude is unavailable right now", self.runs("hermes")[-1]["prompt"])

    def test_failed_check_goes_back_to_the_coder_once(self):
        self.plan({"hermes": ["delegate claude", "say fixed"], "claude": ["bad a.js", "write a.js var a = 2;"]})
        cid, msgs = self.chat("applio", "Add a.js")
        self.assertIn(("agent", "claude", "fix"), self.steps(msgs))
        fix_prompt = self.runs("claude")[1]["prompt"]
        self.assertIn("check failed", fix_prompt)
        self.assertIn("SyntaxError", fix_prompt)
        self.assertEqual(self.runs("claude")[1]["args"][-2:], ["--resume", "sess-claude"])
        self.assertTrue(next(m for m in msgs if m["role"] == "result")["ok"])

    def test_check_that_still_fails_is_reported(self):
        self.plan({"hermes": ["delegate claude", "say still broken"], "claude": ["bad a.js", "bad a.js"]})
        cid, msgs = self.chat("applio", "Add a.js")
        result = next(m for m in msgs if m["role"] == "result")
        self.assertFalse(result["ok"])
        self.assertIn("SyntaxError", result["check"])

    def test_risky_changes_get_reviewed_by_the_other_coder(self):
        self.plan({"hermes": ["delegate claude review", "say reviewed"], "claude": ["write a.js var a = 1;"],
                   "chatgpt": ["approve"]})
        cid, msgs = self.chat("applio", "Rewrite the payment flow")
        self.assertIn(("agent", "chatgpt", "review"), self.steps(msgs))
        self.assertIn("+var a = 1;", self.runs("chatgpt")[0]["prompt"])
        self.assertTrue(any(m["role"] == "note" and "ChatGPT approved" in m["text"] for m in msgs))

    def test_blocked_coder_hands_to_next(self):
        self.plan({"hermes": ["delegate claude", "say done"],
                   "claude": ["blocked missing dependency"], "chatgpt": ["write a.js var a = 1;"]})
        cid, msgs = self.chat("applio", "Add a.js")
        note = next(m for m in msgs if m["role"] == "note")
        self.assertIn("Claude is blocked (missing dependency)", note["text"])
        self.assertIn("Handing it to ChatGPT", note["text"])
        result = next(m for m in msgs if m["role"] == "result")
        self.assertTrue(result["ok"])
        self.assertEqual(result["agent"], "chatgpt")

    def test_cross_chat_memory_records_changes(self):
        self.plan({"hermes": ["delegate claude", "say done"], "claude": ["write a.js var a = 1;"]})
        self.chat("applio", "Add a.js")
        memory = self.store.memory("applio")
        self.assertIn("a.js", memory)
        self.assertIn("Add a.js", memory)

    def test_report_skipped_when_no_files_changed(self):
        self.plan({"hermes": ["delegate claude"], "claude": ["say No changes needed."]})
        cid, msgs = self.chat("applio", "Check a.js")
        steps = [m.get("step") for m in msgs if m["role"] == "agent"]
        self.assertNotIn("report", steps)

    def test_if_hermes_fails_the_message_goes_straight_to_a_coder(self):
        self.plan({"hermes": ["crash model unavailable", "crash model unavailable"],
                   "claude": ["write a.js var a = 1;"]})
        cid, msgs = self.chat("applio", "Add a.js")
        self.assertTrue(any(m["role"] == "note" and "Sending this straight to Claude" in m["text"] for m in msgs))
        self.assertTrue(next(m for m in msgs if m["role"] == "result")["ok"])
        self.assertFalse(any(m.get("step") == "report" for m in msgs))  # failed report is dropped

    def test_hermes_cannot_edit_files_so_a_coder_does(self):
        self.plan({"hermes": ["write sneaky.js var s = 1;", "say done"], "claude": ["write a.js var a = 1;"]})
        cid, msgs = self.chat("applio", "Add a.js")
        self.assertFalse((self.applio / "sneaky.js").exists())  # Hermes only touched its scratch copy
        self.assertEqual((msgs[1]["step"], msgs[1]["coder"]), ("delegate", "claude"))
        self.assertTrue((self.applio / "a.js").exists())
        self.assertEqual(self.runs("claude")[0]["cwd"], str(self.applio.resolve()))
        self.assertTrue(next(m for m in msgs if m["role"] == "result")["ok"])

    def test_picking_a_coder_skips_hermes(self):
        self.plan({"chatgpt": ["write a.js var a = 1;"], "hermes": ["say ChatGPT did it."]})
        cid, msgs = self.chat("applio", "Add a.js", agent="chatgpt")
        self.assertEqual(len(self.runs("hermes")), 1)  # only the report
        self.assertEqual(msgs[1]["agent"], "chatgpt")

    def test_hermes_copy_keeps_its_path_and_stays_fresh(self):
        self.plan({"hermes": ["delegate claude", "say done", "say second answer"], "claude": ["write a.js var a = 1;"]})
        cid, _ = self.chat("applio", "Add a.js")
        self.engine.send("applio", cid, "What's in a.js?")
        self.wait()
        dirs = {r["cwd"] for r in self.runs("hermes")}
        self.assertEqual(len(dirs), 1)  # same folder every turn, so Hermes can resume its session
        self.assertTrue((Path(dirs.pop()) / "a.js").exists())  # refreshed with Claude's change
        self.engine.delete_chat("applio", cid)
        self.assertFalse((self.store.project_dir("applio") / "scratch" / cid).exists())

    def test_follow_ups_resume_each_agents_session(self):
        self.plan({"hermes": ["delegate claude", "say done", "delegate claude", "say done again"],
                   "claude": ["write a.js var a = 1;", "write a.js var a = 2;"]})
        cid, _ = self.chat("applio", "Add a.js")
        self.engine.send("applio", cid, "Make it 2")
        self.wait()
        self.assertEqual(self.runs("hermes")[2]["args"][-2:], ["--resume", "sess-hermes"])
        self.assertIn("Make it 2", self.runs("hermes")[2]["prompt"])
        self.assertEqual(self.runs("claude")[1]["args"][-2:], ["--resume", "sess-claude"])
        self.assertIn("New work in this chat", self.runs("claude")[1]["prompt"])

    def test_chatgpt_resumes_with_its_resume_command(self):
        self.plan({"chatgpt": ["write a.js var a = 1;", "write a.js var a = 2;"]})
        cid, _ = self.chat("applio", "Add a.js", agent="chatgpt")
        self.engine.send("applio", cid, "again", agent="chatgpt")
        self.wait()
        self.assertEqual(self.runs("chatgpt")[1]["args"][:2], ["resume", "sess-chatgpt"])

    def test_stop_while_working(self):
        self.plan({"hermes": ["delegate claude"], "claude": ["slow"]})
        cid = self.engine.new_chat("applio", "Do a slow thing")
        deadline = time.time() + 5
        while time.time() < deadline and not self.runs("claude"):
            time.sleep(0.05)
        time.sleep(0.2)
        self.assertEqual(self.engine.stop("applio", cid), "stopping")
        self.wait()
        result = self.store.chat("applio", cid)["messages"][-1]
        self.assertEqual((result["role"], result["ok"], result["reason"]), ("result", False, "stopped by you"))

    def test_projects_work_in_parallel(self):
        self.plan({"hermes": ["delegate chatgpt", "say quick answer"], "chatgpt": ["slow"]})
        slow = self.engine.new_chat("stockbot", "slow job")
        deadline = time.time() + 5
        while time.time() < deadline and not self.runs("chatgpt"):
            time.sleep(0.05)
        quick = self.engine.new_chat("applio", "quick question")
        deadline = time.time() + 2.5
        while time.time() < deadline and self.engine.busy("applio", quick):
            time.sleep(0.05)
        self.assertFalse(self.engine.busy("applio", quick))
        self.assertTrue(self.engine.busy("stockbot", slow))

    def test_busy_chat_refuses_another_message(self):
        self.plan({"hermes": ["delegate claude"], "claude": ["slow"]})
        cid = self.engine.new_chat("applio", "slow")
        with self.assertRaises(engine.ChatError):
            self.engine.send("applio", cid, "again")

    def test_image_attachment_goes_straight_to_a_coder(self):
        shot = Path(self.tmp.name) / "shot.png"
        shot.write_bytes(b"\x89PNG")
        self.plan({"claude": ["say It's a login page."]})
        cid, msgs = self.chat("applio", "What's wrong here?", files=[str(shot)])
        saved = self.store.attachments_dir("applio", cid) / "shot.png"
        self.assertTrue(saved.exists())
        steps = [m.get("step") for m in msgs if m["role"] == "agent"]
        self.assertEqual(steps[0], "code")        # the coder runs first; Hermes did not orchestrate
        self.assertNotIn("orchestrate", steps)
        self.assertTrue(any(m["role"] == "note" and "goes to Claude" in m.get("text", "") for m in msgs))
        claude = self.runs("claude")[0]
        self.assertIn(str(saved), claude["prompt"])
        self.assertEqual(claude["args"][-2:], ["--add-dir", str(saved.parent)])

    def test_text_attachment_still_goes_through_hermes(self):
        notes = Path(self.tmp.name) / "notes.txt"
        notes.write_text("some notes")
        self.plan({"hermes": ["say I read your notes."]})
        cid, msgs = self.chat("applio", "What's in this?", files=[str(notes)])
        steps = [m.get("step") for m in msgs if m["role"] == "agent"]
        self.assertEqual(steps[0], "answer")      # Hermes can read text files itself
        self.assertFalse(any("goes to" in m.get("text", "") for m in msgs if m["role"] == "note"))

    def test_text_followup_in_an_image_chat_goes_to_hermes(self):
        shot = Path(self.tmp.name) / "shot.png"
        shot.write_bytes(b"\x89PNG")
        self.plan({"claude": ["say A login page."], "hermes": ["say Looked over it.", "say Here are the steps."]})
        cid, _ = self.chat("applio", "What is this?", files=[str(shot)])  # image -> coder
        self.engine.send("applio", cid, "give me step by step instructions")  # no image -> Hermes
        self.wait()
        msgs = self.store.chat("applio", cid)["messages"]
        self.assertEqual([m["role"] for m in msgs][-2:], ["user", "agent"])
        last = msgs[-1]
        self.assertEqual((last["agent"], last.get("step")), ("hermes", "answer"))  # Hermes handled the text follow-up
        self.assertEqual(len([m for m in msgs if m.get("step") == "code"]), 1)      # no second coder run

    def test_decisions_are_remembered_for_later(self):
        self.plan({"hermes": ["delegate claude", "say ok", "say noted"], "claude": ["decide Use plain hyphens"]})
        self.chat("applio", "Add d.js")
        self.assertIn("(Claude): Use plain hyphens", self.store.memory_path("applio").read_text())
        self.chat("applio", "What did we decide?")
        self.assertIn("Use plain hyphens", self.runs("hermes")[-1]["prompt"])

    def wait_for_title(self, pid, cid, timeout=10):
        end = time.time() + timeout
        while time.time() < end and self.store.chat(pid, cid).get("auto_title"):
            time.sleep(0.05)
        return self.store.chat(pid, cid)["title"]

    def test_new_chats_get_a_short_name(self):
        self.plan({"namer": ["say Cookie basics"], "hermes": ["say Cookies are small files a site stores."]})
        cid = self.engine.new_chat("applio", "what are cookies in a website. tldr")
        self.assertEqual(self.store.chat("applio", cid)["title"], "What are cookies in website")  # until named
        self.assertEqual(self.wait_for_title("applio", cid), "Cookie basics")
        self.wait()
        self.assertIn("what are cookies", self.runs("namer")[0]["prompt"])
        self.assertNotIn("Name this chat", self.runs("hermes")[0]["prompt"])

    def test_a_bad_name_keeps_the_quick_one(self):
        self.plan({"namer": ["say Here is a much too long name for a chat that rambles on"], "hermes": ["say ok"]})
        cid = self.engine.new_chat("applio", "add dark mode")
        self.wait()
        time.sleep(0.5)
        self.assertEqual(self.store.chat("applio", cid)["title"], "Add dark mode")

    def test_your_own_name_is_kept(self):
        cid = self.store.create_chat("applio", "Quick name", auto_title=True)
        self.store.update_chat("applio", cid, title="My name")
        self.store.name_chat("applio", cid, "Hermes name")
        self.assertEqual(self.store.chat("applio", cid)["title"], "My name")

    def test_quick_titles(self):
        self.assertEqual(engine.quick_title("Add a dark mode toggle to settings please"), "Add dark mode toggle settings")
        self.assertEqual(engine.quick_title("?!"), "New chat")
        self.assertEqual(engine.clean_title(' "Stripe webhook fix." '), "Stripe webhook fix")

    def test_unknown_agent_and_empty_message(self):
        with self.assertRaises(engine.ChatError):
            self.engine.new_chat("applio", "hi", agent="gpt5")
        with self.assertRaises(engine.ChatError):
            self.engine.new_chat("applio", "   ")
        with self.assertRaises(engine.ChatError):
            self.engine.new_chat("nope", "hi")


class StoreTest(EngineCase):
    def test_projects(self):
        again = self.store.add_project(self.applio, "Other name")
        self.assertEqual(again["id"], "applio")  # same folder is not added twice
        self.assertEqual(self.store.project_for_path(self.applio / "sub")["id"], "applio")
        self.assertIsNone(self.store.project_for_path(Path(self.tmp.name)))
        self.store.update_project("stockbot", coders=["claude", "chatgpt"])
        self.assertEqual(self.store.project("stockbot")["coders"], ["claude", "chatgpt"])
        with self.assertRaises(engine.ChatError):
            self.store.add_project(Path(self.tmp.name) / "missing")

    def test_detect_check(self):
        self.assertIn("node --check", engine.detect_check(self.applio))
        self.assertIn("compileall", engine.detect_check(self.stockbot))
        empty = Path(self.tmp.name) / "empty"
        empty.mkdir()
        self.assertEqual(engine.detect_check(empty), "")

    def test_chat_list_rename_pin_archive_delete_search(self):
        self.plan({"hermes": ["say one", "say two"]})
        first, _ = self.chat("applio", "First question about cookies")
        second, _ = self.chat("applio", "Second question")
        self.assertEqual([c["id"] for c in self.store.chats("applio")][0], second)
        self.store.update_chat("applio", first, pinned=True, title="Cookies")
        listed = self.store.chats("applio")
        self.assertEqual((listed[0]["id"], listed[0]["title"]), (first, "Cookies"))
        self.assertEqual(self.store.search("cookies")[0]["chat"], first)
        self.store.update_chat("applio", second, archived=True)
        self.assertEqual(len(self.store.chats("applio")), 1)
        self.engine.delete_chat("applio", first)
        self.assertEqual(self.store.chats("applio"), [])

    def test_old_task_threads_become_chats(self):
        state = self.cfg["repo"] / "agent_state"
        (state / "threads").mkdir(parents=True)
        (state / "tasks.md").write_text("| ID | Task |\n|--|--|\n| T4 | Add a comment block |\n")
        (state / "threads" / "T4.json").write_text(json.dumps(
            {"messages": [{"role": "user", "text": "Add a comment block"}, {"role": "agent", "text": "Done."}]}))
        self.engine.import_tasks("applio")
        chats = self.store.chats("applio")
        self.assertEqual(chats[0]["title"], "T4: Add a comment block")
        self.assertEqual(len(self.store.chat("applio", chats[0]["id"])["messages"]), 2)

    def test_defaults_only_on_first_run(self):
        fresh = engine.Engine(self.cfg, engine.Store(Path(self.tmp.name) / "fresh"))
        fresh.store.save_projects([{"id": "x", "name": "X", "path": str(self.applio), "coders": ["claude"]}])
        fresh.ensure_defaults()
        self.assertEqual([p["id"] for p in fresh.store.projects()], ["x"])


if __name__ == "__main__":
    unittest.main()
