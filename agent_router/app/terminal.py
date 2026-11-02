"""A real interactive shell per project, relayed to the browser over a WebSocket.

Each project gets one persistent pseudo-terminal running the user's shell in the project folder. It keeps
state (cd, env, running programs) across panel opens, and several tabs share the same session. The
WebSocket protocol and PTY are stdlib only, since the app's server is a plain http.server.

Browser -> server: binary frames are raw keystrokes; text frames are JSON control ({"resize":[cols,rows]}).
Server -> browser: binary frames are raw terminal output.
"""
import base64
import fcntl
import hashlib
import json
import os
import pty
import select
import signal
import struct
import termios
import threading
import time
from collections import deque
from pathlib import Path

WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
SCROLLBACK = 200_000  # bytes of recent output replayed to a tab when it attaches


class Shell:
    """One pseudo-terminal running a shell in a folder, with any number of attached WebSocket clients."""

    def __init__(self, cwd, shell=None):
        self.cwd = str(cwd)
        self.clients = set()          # send callables, one per attached tab
        self.history = deque(maxlen=SCROLLBACK)
        self.lock = threading.Lock()
        self.alive = True
        self.pid, self.fd = pty.fork()
        if self.pid == 0:             # child: its stdio is the slave side of the pty
            try:
                os.chdir(self.cwd)
            except OSError:
                pass
            os.environ["TERM"] = "xterm-256color"
            os.environ["AGENTS_TERMINAL"] = "1"
            sh = shell or os.environ.get("SHELL") or "/bin/zsh"
            os.execvp(sh, [sh, "-i"])
            os._exit(1)               # unreachable unless exec fails
        self.resize(80, 24)
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self):
        """Read the shell's output forever and fan it out to attached clients."""
        while True:
            try:
                ready, _, _ = select.select([self.fd], [], [], 0.5)
            except (OSError, ValueError):
                break
            if not ready:
                if not self._still_running():
                    break
                continue
            try:
                data = os.read(self.fd, 65536)
            except OSError:
                break
            if not data:
                break
            with self.lock:
                self.history.extend(data)
                clients = list(self.clients)
            for send in clients:
                try:
                    send(data)
                except Exception:
                    pass
        self.close()

    def _still_running(self):
        try:
            done, _ = os.waitpid(self.pid, os.WNOHANG)
            return done == 0
        except ChildProcessError:
            return False

    def write(self, data):
        try:
            os.write(self.fd, data)
        except OSError:
            self.close()

    def resize(self, cols, rows):
        try:
            cols, rows = max(2, min(500, int(cols))), max(1, min(300, int(rows)))
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        except (OSError, ValueError):
            pass

    def snapshot(self):
        with self.lock:
            return bytes(self.history)

    def add(self, send):
        with self.lock:
            self.clients.add(send)

    def remove(self, send):
        with self.lock:
            self.clients.discard(send)

    def close(self):
        if not self.alive:
            return
        self.alive = False
        for sig in (signal.SIGHUP, signal.SIGKILL):
            try:
                os.kill(self.pid, sig)
            except ProcessLookupError:
                break
        try:
            os.close(self.fd)
        except OSError:
            pass
        with self.lock:
            clients = list(self.clients)
            self.clients.clear()
        for send in clients:
            try:
                send(b"\r\n\x1b[31m[shell exited]\x1b[0m\r\n", closing=True)
            except Exception:
                pass


class Terminals:
    """One persistent Shell per project, created on demand."""

    def __init__(self):
        self.shells = {}
        self.lock = threading.Lock()

    def get(self, pid, cwd):
        with self.lock:
            shell = self.shells.get(pid)
            if shell is None or not shell.alive:
                shell = Shell(cwd)
                self.shells[pid] = shell
            return shell

    def close_all(self):
        with self.lock:
            shells = list(self.shells.values())
            self.shells.clear()
        for shell in shells:
            shell.close()


# ---- minimal WebSocket (server side) ----

def accept_key(key):
    return base64.b64encode(hashlib.sha1((key + WS_MAGIC).encode()).digest()).decode()


def is_upgrade(headers):
    return (headers.get("Upgrade", "").lower() == "websocket"
            and "upgrade" in headers.get("Connection", "").lower()
            and headers.get("Sec-WebSocket-Key"))


def handshake(handler):
    key = handler.headers.get("Sec-WebSocket-Key")
    handler.send_response(101)
    handler.send_header("Upgrade", "websocket")
    handler.send_header("Connection", "Upgrade")
    handler.send_header("Sec-WebSocket-Accept", accept_key(key))
    handler.end_headers()


def frame(payload, opcode=0x2):
    header = bytes([0x80 | opcode])
    n = len(payload)
    if n < 126:
        header += bytes([n])
    elif n < 65536:
        header += bytes([126]) + struct.pack(">H", n)
    else:
        header += bytes([127]) + struct.pack(">Q", n)
    return header + payload


def read_frame(rfile):
    """Return (opcode, payload) or (None, None) at end of stream."""
    head = rfile.read(2)
    if len(head) < 2:
        return None, None
    opcode = head[0] & 0x0f
    masked = head[1] & 0x80
    length = head[1] & 0x7f
    if length == 126:
        length = struct.unpack(">H", rfile.read(2))[0]
    elif length == 127:
        length = struct.unpack(">Q", rfile.read(8))[0]
    mask = rfile.read(4) if masked else b""
    data = rfile.read(length)
    if masked:
        data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    return opcode, data


def serve(handler, shell):
    """Relay between a WebSocket client (handler) and a project Shell until either side closes."""
    sock = handler.connection
    write_lock = threading.Lock()

    def send(data, closing=False):
        with write_lock:
            try:
                sock.sendall(frame(data, 0x2))
                if closing:
                    sock.sendall(frame(b"", 0x8))
            except OSError:
                raise

    handshake(handler)
    with write_lock:
        sock.sendall(frame(shell.snapshot(), 0x2))  # replay recent output so the tab shows context
    shell.add(send)
    try:
        while True:
            opcode, data = read_frame(handler.rfile)
            if opcode is None or opcode == 0x8:      # closed
                break
            if opcode == 0x9:                        # ping -> pong
                with write_lock:
                    sock.sendall(frame(data, 0xA))
                continue
            if opcode == 0x1:                        # text = JSON control
                try:
                    msg = json.loads(data)
                    if "resize" in msg:
                        shell.resize(*msg["resize"])
                except (ValueError, TypeError):
                    pass
            elif opcode == 0x2:                      # binary = keystrokes
                shell.write(data)
    except (OSError, ValueError):
        pass
    finally:
        shell.remove(send)
