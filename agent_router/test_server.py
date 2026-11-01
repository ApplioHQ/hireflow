"""Tests for the web app's server. Run: python3 -m unittest agent_router/test_server.py"""
import http.client
import json
import sys
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "app"))
import server  # noqa: E402
from test_engine import EngineCase  # noqa: E402


class ServerTest(EngineCase):
    def setUp(self):
        super().setUp()
        (self.cfg["repo"]).mkdir(exist_ok=True)
        (self.cfg["repo"] / "icon-192.png").write_bytes(b"\x89PNG fake")
        self.server = server.make_server(self.cfg, 0, self.store)
        self.port = self.server.server_address[1]
        self.engine = self.server.RequestHandlerClass.engine
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

    def get_chat(self, pid, cid):
        return self.request("GET", f"/api/chat?project={pid}&chat={cid}")[1]

    def test_page_and_icons(self):
        status, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"Applio Agents", body)
        self.assertEqual(self.request("GET", "/icon-192.png")[1], b"\x89PNG fake")
        self.assertEqual(self.request("GET", "/../engine.py")[0], 404)

    def test_security(self):
        self.assertEqual(self.request("GET", "/api/state", host="evil.com")[0], 403)
        self.assertEqual(self.request("POST", "/api/chats", {"project": "applio", "text": "x"}, headers={"X-Agents": ""})[0], 403)
        self.assertEqual(self.request("POST", "/api/chats", {"project": "applio", "text": "x"},
                                      headers={"Origin": "https://evil.com"})[0], 403)
        self.assertEqual(self.store.chats("applio"), [])

    def test_state_lists_projects_and_chats(self):
        status, state = self.request("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertEqual([p["id"] for p in state["projects"]], ["applio", "stockbot"])
        self.assertEqual(state["orchestrator"], "hermes")
        self.assertEqual(state["coders"], ["claude", "chatgpt"])

    def test_chat_flow(self):
        self.plan({"hermes": ["say It's a resume builder.", "delegate claude", "say Done."],
                   "claude": ["write a.js var a = 1;"]})
        status, body = self.post("/api/chats", {"project": "applio", "text": "What is this?"})
        self.assertEqual(status, 200)
        cid = body["chat"]
        self.wait()
        chat = self.get_chat("applio", cid)
        self.assertIn("resume builder", chat["messages"][1]["text"])
        self.assertEqual(self.post("/api/chats/send", {"project": "applio", "chat": cid, "text": "Add a.js"})[0], 200)
        self.wait()
        steps = [m.get("step") or m["role"] for m in self.get_chat("applio", cid)["messages"]]
        self.assertEqual(steps, ["user", "answer", "user", "delegate", "code", "result", "report"])
        state = self.request("GET", "/api/state")[1]
        self.assertEqual(state["projects"][0]["chats"][0]["status"], "idle")

    def test_direct_coder_and_unknown_agent(self):
        self.plan({"chatgpt": ["write a.js var a = 1;"]})
        status, body = self.post("/api/chats", {"project": "applio", "text": "Add a.js", "agent": "chatgpt"})
        self.assertEqual(status, 200)
        self.wait()
        self.assertEqual(self.get_chat("applio", body["chat"])["messages"][1]["agent"], "chatgpt")
        status, body = self.post("/api/chats", {"project": "applio", "text": "x", "agent": "gpt9"})
        self.assertEqual(status, 400)
        self.assertIn("Unknown agent", body["error"])

    def test_stop(self):
        self.plan({"hermes": ["delegate claude"], "claude": ["slow"]})
        cid = self.post("/api/chats", {"project": "applio", "text": "slow"})[1]["chat"]
        deadline = time.time() + 5
        while time.time() < deadline and not self.runs("claude"):
            time.sleep(0.05)
        time.sleep(0.2)
        self.assertEqual(self.post("/api/chats/stop", {"project": "applio", "chat": cid})[1]["result"], "stopping")
        self.wait()
        self.assertEqual(self.get_chat("applio", cid)["messages"][-1]["reason"], "stopped by you")
        self.assertEqual(self.post("/api/chats/stop", {"project": "applio", "chat": cid})[0], 400)

    def test_rename_pin_archive_delete(self):
        self.plan({"hermes": ["say hi"]})
        cid = self.post("/api/chats", {"project": "applio", "text": "hello"})[1]["chat"]
        self.wait()
        self.post("/api/chats/update", {"project": "applio", "chat": cid, "title": "Greeting", "pinned": True})
        chat = self.get_chat("applio", cid)
        self.assertEqual((chat["title"], chat["pinned"]), ("Greeting", True))
        self.post("/api/chats/update", {"project": "applio", "chat": cid, "archived": True})
        self.assertEqual(self.request("GET", "/api/state")[1]["projects"][0]["chats"], [])
        self.assertEqual(self.post("/api/chats/delete", {"project": "applio", "chat": cid})[0], 200)
        self.assertEqual(self.request("GET", f"/api/chat?project=applio&chat={cid}")[0], 400)

    def test_projects(self):
        other = Path(self.tmp.name) / "other"
        other.mkdir()
        status, body = self.post("/api/projects", {"path": str(other)})
        self.assertEqual((status, body["project"]), (200, "other"))
        self.assertEqual(self.post("/api/projects", {"path": "/nope/missing"})[0], 400)
        self.assertEqual(self.post("/api/projects/update", {"project": "other", "coders": ["chatgpt", "claude"]})[0], 200)
        self.assertEqual(self.store.project("other")["coders"], ["chatgpt", "claude"])
        self.assertEqual(self.post("/api/projects/update", {"project": "other", "coders": ["gpt9"]})[0], 400)
        self.assertEqual(self.post("/api/projects/update", {"project": "other", "coders": []})[0], 400)

    def test_diff_memory_search_doctor(self):
        self.plan({"hermes": ["delegate claude", "say ok"], "claude": ["decide Keep it simple"]})
        cid = self.post("/api/chats", {"project": "applio", "text": "Add d.js"})[1]["chat"]
        self.wait()
        self.assertIn("d.js", self.request("GET", "/api/diff?project=applio")[1]["status"])
        self.assertFalse(self.request("GET", "/api/diff?project=stockbot")[1]["git"])
        self.assertIn("Keep it simple", self.request("GET", "/api/memory?project=applio")[1]["text"])
        self.assertEqual(self.request("GET", "/api/search?q=d.js")[1]["results"][0]["chat"], cid)
        doctor = self.request("GET", "/api/doctor")[1]
        roles = {a["agent"]: a["role"] for a in doctor["agents"]}
        self.assertEqual((roles["hermes"], roles["claude"], roles["chatgpt"]), ("orchestrator", "coder", "coder"))
        self.assertEqual([p["name"] for p in doctor["projects"]], ["Applio", "Stockbot"])


if __name__ == "__main__":
    unittest.main()
