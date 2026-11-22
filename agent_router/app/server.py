#!/usr/bin/env python3
"""Local web app for Agents. Start it with: npm run app (then open http://localhost:4747)."""
import argparse
import json
import re
import secrets
import shutil
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import browser  # noqa: E402
import engine  # noqa: E402
import terminal  # noqa: E402
import router  # noqa: E402

STATIC = HERE / "static"
PORT = 4747
MAX_BODY = 200_000
MAX_UPLOAD = engine.MAX_ATTACHMENT
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".json": "application/manifest+json",
         ".png": "image/png", ".svg": "image/svg+xml"}
IMAGE_TYPES = engine.IMAGE_TYPES
name = engine.name


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class Handler(BaseHTTPRequestHandler):
    engine = None
    terminals = None
    port = PORT
    server_version = "ApplioAgents"
    protocol_version = "HTTP/1.1"  # needed for the WebSocket (101) upgrade; every response sets Content-Length

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
        if url.path == "/ws/terminal" and terminal.is_upgrade(self.headers):
            return self.open_terminal(query)
        try:
            if url.path == "/api/attachment":
                return self.attachment(query)
            if url.path == "/api/screenshot/view":
                return self.screenshot_view(query)
            if url.path.startswith("/pf/"):
                return self.project_file(url.path)
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
        if path == "/api/models":
            return eng.models_info()
        raise ApiError(404, "not found")

    def open_terminal(self, q):
        """Attach this WebSocket to the project's persistent shell. Local page only."""
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://localhost:{self.port}", f"http://127.0.0.1:{self.port}"):
            return self.send(403, {"error": "forbidden"})
        try:
            project = self.engine.store.project(q.get("project", ""))
        except engine.ChatError:
            return self.send(404, b"not found", "text/plain")
        if not Path(project["path"]).is_dir():
            return self.send(404, b"not found", "text/plain")
        self.close_connection = True
        shell = self.terminals.get(project["id"], project["path"])
        terminal.serve(self, shell)

    def project_file(self, path):
        """Serve a file from inside a project (/pf/<pid>/<relpath>), so the chat can show images and
        render HTML mockups the agents made. Read-only, confined to the project folder, local page only."""
        parts = path.split("/", 3)  # ["", "pf", "<pid>", "<relpath>"]
        if len(parts) < 4 or not parts[3]:
            return self.send(404, b"not found", "text/plain")
        try:
            project = self.engine.store.project(unquote(parts[2]))
        except engine.ChatError:
            return self.send(404, b"not found", "text/plain")
        root = Path(project["path"]).resolve()
        rel = unquote(parts[3].split("?")[0])
        file = (root / rel).resolve()
        suffix = file.suffix.lower()
        blocked = {".env", ".pem", ".key", ".p12", ".pfx"}
        if (root not in file.parents or ".git" in file.parts or not file.is_file()
                or suffix in blocked or file.name == ".env" or file.name.startswith(".env")
                or file.stat().st_size > 15_000_000):
            return self.send(404, b"not found", "text/plain")
        ctype = {".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
                 ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                 ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
                 ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
                 ".pdf": "application/pdf"}.get(suffix, "text/plain; charset=utf-8")
        self.send(200, file.read_bytes(), ctype, "no-store")

    def attachment(self, q):
        """Serve an image a user attached to a chat (for thumbnails), and nothing outside that chat's folder."""
        folder = self.engine.store.attachments_dir(q.get("project", ""), q.get("chat", "")).resolve()
        file = (folder / Path(q.get("name", "")).name).resolve()
        if folder not in file.parents or not file.is_file() or file.suffix.lower() not in IMAGE_TYPES:
            return self.send(404, b"not found", "text/plain")
        ctype = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}.get(
            file.suffix.lower(), "image/png")
        self.send(200, file.read_bytes(), ctype, "private, max-age=3600")

    def screenshot_view(self, q):
        """Serve a screenshot or diff file from the screenshots directory."""
        rel = q.get("path", "")
        if not rel or ".." in rel:
            return self.send(400, b"invalid path", "text/plain")
        screenshots_dir = self.engine.store.home / "screenshots"
        file = (screenshots_dir / rel).resolve()
        if not file.is_file() or screenshots_dir.resolve() not in file.parents:
            return self.send(404, b"not found", "text/plain")
        ctype = {".png": "image/png", ".html": "text/html; charset=utf-8",
                 ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(file.suffix.lower(), "application/octet-stream")
        self.send(200, file.read_bytes(), ctype, "no-cache")

    def static(self, path):
        file_name = "index.html" if path in ("/", "/index.html") else path.lstrip("/")
        file = (STATIC / file_name).resolve()
        if STATIC.resolve() not in file.parents:
            return self.send(404, b"not found", "text/plain")
        if not file.is_file():
            return self.send(404, b"not found", "text/plain")
        self.send(200, file.read_bytes(), TYPES.get(file.suffix, "application/octet-stream"), "no-store")

    def do_POST(self):
        # Only this page may call the API: same host, a custom header (which a cross-site form or fetch
        # cannot add without a CORS preflight this server never approves), and JSON bodies.
        origin = self.headers.get("Origin")
        if (not self.allowed_host() or self.headers.get("X-Agents") != "1"
                or (origin and origin not in (f"http://localhost:{self.port}", f"http://127.0.0.1:{self.port}"))):
            return self.send(403, {"error": "forbidden"})
        length = int(self.headers.get("Content-Length") or 0)
        if urlparse(self.path).path == "/api/upload":
            return self.upload(length)
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

    def uploads_dir(self):
        return self.engine.store.home / "uploads"

    def upload(self, length):
        """Store one file the page attached (raw bytes, name in X-Filename) until it is sent with a message."""
        if length > MAX_UPLOAD:
            return self.send(413, {"error": "Files can be up to 25 MB."})
        raw_name = unquote(self.headers.get("X-Filename") or "")
        file_name = re.sub(r"[^\w.\- ]+", "_", Path(raw_name).name).strip(" .") or "attachment"
        folder = self.uploads_dir() / secrets.token_hex(8)
        folder.mkdir(parents=True, exist_ok=True)
        dest = folder / file_name[:120]
        remaining = length
        with dest.open("wb") as f:
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, 1 << 20))
                if not chunk:
                    break
                f.write(chunk)
                remaining -= len(chunk)
        self.send(200, {"path": str(dest), "name": dest.name, "size": dest.stat().st_size})

    def uploaded_files(self, b):
        """Paths from the page must be files it uploaded, never arbitrary files on the Mac."""
        files = b.get("files") or []
        root = self.uploads_dir().resolve()
        if not isinstance(files, list):
            raise ApiError(400, "files must be a list")
        checked = []
        for f in files:
            path = Path(str(f)).resolve()
            if root not in path.parents or not path.is_file():
                raise ApiError(400, "Attach files with the attach button, drag and drop, or paste.")
            checked.append(str(path))
        return checked

    def discard_uploads(self, files):
        for f in files:  # copied into the chat already
            shutil.rmtree(Path(f).parent, ignore_errors=True)

    def post_api(self, path, b):
        eng = self.engine
        pid, cid = str(b.get("project", "")), str(b.get("chat", ""))
        agent = b.get("agent") or None
        if path == "/api/chats":
            files = self.uploaded_files(b)
            chat = eng.new_chat(pid, str(b.get("text", "")), files, agent=agent)
            self.discard_uploads(files)
            return {"chat": chat}
        if path == "/api/chats/send":
            files = self.uploaded_files(b)
            eng.send(pid, cid, str(b.get("text", "")), files, agent=agent)
            self.discard_uploads(files)
            return {"ok": True}
        if path == "/api/uploads/discard":
            self.discard_uploads(self.uploaded_files(b))
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
        if path == "/api/models/set":
            eng.set_model(str(b.get("agent", "")), b.get("model") or None)
            return {"ok": True, "models": eng.models_info()}
        if path == "/api/projects/update":
            coders = b.get("coders")
            if coders is not None and (not isinstance(coders, list) or not coders
                                       or not all(c in eng.coders for c in coders)):
                raise ApiError(400, f"Coders must be some of: {', '.join(eng.coders)}")
            eng.store.update_project(pid, coders=coders, check=b.get("check"), name=b.get("name"),
                                     preview_url=b.get("preview_url"), preview_pages=b.get("preview_pages"),
                                     deploy=b.get("deploy"))
            return {"ok": True}
        if path == "/api/screenshot":
            url = b.get("url", "")
            if not url:
                raise ApiError(400, "url is required")
            dest_dir = eng.store.home / "screenshots"
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"{secrets.token_hex(6)}.png"
            shot_path, err = browser.screenshot(url, dest, b.get("width", 1280), b.get("height", 800))
            if not shot_path:
                raise ApiError(500, err or "screenshot failed")
            return {"path": shot_path, "url": f"/api/screenshot/view?path={dest.name}"}
        if path == "/api/screenshot/pages":
            project_url = b.get("url", "")
            pages = b.get("pages", ["/"])
            if not project_url:
                raise ApiError(400, "url is required")
            dest_dir = eng.store.home / "screenshots" / secrets.token_hex(6)
            results = browser.auto_screenshots(project_url, dest_dir, pages)
            for r in results:
                if r["path"]:
                    r["view_url"] = f"/api/screenshot/view?path={Path(r['path']).parent.name}/{Path(r['path']).name}"
            return {"results": results}
        if path == "/api/visual-diff":
            before_url = b.get("before", "")
            after_url = b.get("after", "")
            if not before_url or not after_url:
                raise ApiError(400, "before and after URLs are required")
            token = secrets.token_hex(4)
            dest_dir = eng.store.home / "screenshots" / f"diff-{token}"
            dest_dir.mkdir(parents=True, exist_ok=True)
            before_path = dest_dir / "before.png"
            after_path = dest_dir / "after.png"
            browser.screenshot(before_url, before_path)
            browser.screenshot(after_url, after_path)
            diff_html = dest_dir / "diff.html"
            browser.diff_side_by_side(before_path, after_path, diff_html)
            return {"diff_url": f"/api/screenshot/view?path=diff-{token}/diff.html",
                    "before_url": f"/api/screenshot/view?path=diff-{token}/before.png",
                    "after_url": f"/api/screenshot/view?path=diff-{token}/after.png"}
        if path == "/api/test-flow":
            url = b.get("url", "")
            steps = b.get("steps", [])
            if not url or not steps:
                raise ApiError(400, "url and steps are required")
            token = secrets.token_hex(4)
            dest_dir = eng.store.home / "screenshots" / f"flow-{token}"
            results = browser.run_flow(url, steps, dest_dir, b.get("width", 1280), b.get("height", 800))
            for r in results:
                if r.get("screenshot"):
                    r["view_url"] = f"/api/screenshot/view?path=flow-{token}/{Path(r['screenshot']).name}"
            return {"results": results}
        if path == "/api/exec":
            code_text = b.get("code", "").strip()
            lang = b.get("lang", "").lower()
            pid = b.get("project")
            if not code_text:
                raise ApiError(400, "code is required")
            project = eng.store.project(pid) if pid else None
            cwd = project["path"] if project else str(eng.store.home)
            if lang in ("python", "py"):
                cmd = ["python3", "-c", code_text]
            elif lang in ("sh", "bash", "shell", "zsh", ""):
                cmd = ["bash", "-c", code_text]
            else:
                cmd = ["bash", "-c", code_text]
            import subprocess as _sp
            try:
                result = _sp.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=30)
                return {"ok": result.returncode == 0, "code": result.returncode,
                        "stdout": result.stdout[-4000:], "stderr": result.stderr[-2000:]}
            except _sp.TimeoutExpired:
                return {"ok": False, "code": 124, "stdout": "", "stderr": "timed out after 30s"}
            except Exception as exc:
                return {"ok": False, "code": 1, "stdout": "", "stderr": str(exc)}
        raise ApiError(404, "not found")


def make_server(cfg, port=PORT, store=None):
    eng = engine.Engine(cfg, store)
    eng.ensure_defaults()
    stale = eng.store.home / "uploads"
    for folder in stale.glob("*") if stale.exists() else []:  # attachments that were never sent
        if time.time() - folder.stat().st_mtime > 86400:
            shutil.rmtree(folder, ignore_errors=True)
    handler = type("BoundHandler", (Handler,), {"engine": eng, "port": port, "terminals": terminal.Terminals()})
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
    print(f"Agents running at {url}  (Ctrl-C to stop)")
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
        server.RequestHandlerClass.terminals.close_all()
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
