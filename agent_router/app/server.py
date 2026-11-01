#!/usr/bin/env python3
"""Local web app for Applio Agents. Start it with: npm run app (then open http://localhost:4747)."""
import argparse
import json
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import engine  # noqa: E402
import router  # noqa: E402

STATIC = HERE / "static"
PORT = 4747
MAX_BODY = 200_000
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".json": "application/manifest+json",
         ".png": "image/png", ".svg": "image/svg+xml"}
ICONS = {"icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png"}
IMAGE_TYPES = engine.IMAGE_TYPES
name = engine.name


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class Handler(BaseHTTPRequestHandler):
    engine = None
    port = PORT
    server_version = "ApplioAgents"

    def log_message(self, fmt, *args):
        pass

    def allowed_host(self):
        return self.headers.get("Host", "") in (f"localhost:{self.port}", f"127.0.0.1:{self.port}")

    def send(self, status, body, ctype="application/json", cache="no-store"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.allowed_host():
            return self.send(403, {"error": "forbidden host"})
        url = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            if url.path.startswith("/api/"):
                return self.send(200, self.get_api(url.path, query))
            return self.static(url.path)
        except ApiError as e:
            self.send(e.status, {"error": str(e)})
        except engine.ChatError as e:
            self.send(400, {"error": str(e)})

    def get_api(self, path, q):
        eng = self.engine
        if path == "/api/state":
            return eng.snapshot()
        if path == "/api/chat":
            chat = eng.store.chat(q.get("project", ""), q.get("chat", ""))
            chat["status"] = eng.status(chat["project"], chat["id"])
            return chat
        if path == "/api/diff":
            return eng.diff(q.get("project", ""))
        if path == "/api/memory":
            eng.store.project(q.get("project", ""))
            return {"text": eng.store.memory(q.get("project", ""))}
        if path == "/api/search":
            return {"results": eng.store.search(q.get("q", ""))}
        if path == "/api/doctor":
            return eng.doctor()
        raise ApiError(404, "not found")

    def static(self, path):
        file_name = "index.html" if path in ("/", "/index.html") else path.lstrip("/")
        if file_name in ICONS:
            file = self.engine.cfg["repo"] / file_name
        else:
            file = (STATIC / file_name).resolve()
            if STATIC.resolve() not in file.parents:
                return self.send(404, b"not found", "text/plain")
        if not file.is_file():
            return self.send(404, b"not found", "text/plain")
        self.send(200, file.read_bytes(), TYPES.get(file.suffix, "application/octet-stream"), "no-cache")

    def do_POST(self):
        # Only this page may call the API: same host, a custom header (which a cross-site form or fetch
        # cannot add without a CORS preflight this server never approves), and JSON bodies.
        origin = self.headers.get("Origin")
        if (not self.allowed_host() or self.headers.get("X-Agents") != "1"
                or (origin and origin not in (f"http://localhost:{self.port}", f"http://127.0.0.1:{self.port}"))):
            return self.send(403, {"error": "forbidden"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.send(413, {"error": "too large"})
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError
        except ValueError:
            return self.send(400, {"error": "invalid JSON"})
        try:
            self.send(200, self.post_api(urlparse(self.path).path, body))
        except ApiError as e:
            self.send(e.status, {"error": str(e)})
        except engine.ChatError as e:
            self.send(400, {"error": str(e)})

    def post_api(self, path, b):
        eng = self.engine
        pid, cid = str(b.get("project", "")), str(b.get("chat", ""))
        agent = b.get("agent") or None
        if path == "/api/chats":
            return {"chat": eng.new_chat(pid, str(b.get("text", "")), agent=agent)}
        if path == "/api/chats/send":
            eng.send(pid, cid, str(b.get("text", "")), agent=agent)
            return {"ok": True}
        if path == "/api/chats/stop":
            return {"result": eng.stop(pid, cid)}
        if path == "/api/chats/update":
            eng.store.update_chat(pid, cid, title=b.get("title"), pinned=b.get("pinned"), archived=b.get("archived"))
            return {"ok": True}
        if path == "/api/chats/delete":
            eng.delete_chat(pid, cid)
            return {"ok": True}
        if path == "/api/projects":
            project = eng.store.add_project(str(b.get("path", "")), b.get("name") or None,
                                            coders=b.get("coders") or None)
            return {"project": project["id"]}
        if path == "/api/projects/update":
            coders = b.get("coders")
            if coders is not None and (not isinstance(coders, list) or not coders
                                       or not all(c in eng.coders for c in coders)):
                raise ApiError(400, f"Coders must be some of: {', '.join(eng.coders)}")
            eng.store.update_project(pid, coders=coders, check=b.get("check"), name=b.get("name"))
            return {"ok": True}
        raise ApiError(404, "not found")


def make_server(cfg, port=PORT, store=None):
    eng = engine.Engine(cfg, store)
    eng.ensure_defaults()
    handler = type("BoundHandler", (Handler,), {"engine": eng, "port": port})
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    handler.port = server.server_address[1]
    return server


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--no-open", action="store_true", help="don't open the browser")
    ap.add_argument("--config", default=router.DEFAULT_CONFIG)
    args = ap.parse_args(argv)
    try:
        server = make_server(router.load_config(args.config), args.port)
    except OSError:
        print(f"Port {args.port} is busy. Is the app already running? Open http://localhost:{args.port}")
        return 1
    url = f"http://localhost:{args.port}"
    print(f"Applio Agents running at {url}  (Ctrl-C to stop)")
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        eng = server.RequestHandlerClass.engine
        for pid, cid in eng.running():
            print(f"\nStopping {pid}/{cid}...")
            try:
                eng.stop(pid, cid)
            except engine.ChatError:
                pass
        for _ in range(100):
            if not eng.running():
                break
            time.sleep(0.1)
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
