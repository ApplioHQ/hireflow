"""Tests for the interactive terminal: WebSocket framing and a real shell round-trip.
Run: python3 -m unittest agent_router/test_terminal.py"""
import base64
import io
import os
import socket
import struct
import sys
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "app"))
import server  # noqa: E402
import terminal  # noqa: E402
from test_engine import EngineCase  # noqa: E402


class FramingTest(unittest.TestCase):
    def test_accept_key(self):
        self.assertEqual(terminal.accept_key("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")

    def test_frame_and_read_roundtrip(self):
        self.assertEqual(terminal.frame(b"hi", 0x2), b"\x82\x02hi")
        # a long binary frame uses the 2-byte length form
        big = b"x" * 300
        self.assertEqual(terminal.frame(big, 0x2)[:4], bytes([0x82, 126]) + struct.pack(">H", 300))
        # read a masked client frame back
        payload, mask = b"ls -la\n", b"\x01\x02\x03\x04"
        masked = bytes(c ^ mask[i % 4] for i, c in enumerate(payload))
        raw = bytes([0x82, 0x80 | len(payload)]) + mask + masked
        op, data = terminal.read_frame(io.BytesIO(raw))
        self.assertEqual((op, data), (0x2, payload))

    def test_read_frame_eof(self):
        self.assertEqual(terminal.read_frame(io.BytesIO(b"")), (None, None))

    def test_is_upgrade(self):
        self.assertTrue(terminal.is_upgrade({"Upgrade": "websocket", "Connection": "Upgrade",
                                             "Sec-WebSocket-Key": "abc"}))
        self.assertFalse(terminal.is_upgrade({"Upgrade": "h2c", "Connection": "Upgrade"}))


class ShellTest(unittest.TestCase):
    def test_shell_runs_echoes_and_closes(self):
        sh = terminal.Shell("/tmp")
        time.sleep(0.4)
        sh.write(b"echo direct-shell-42\n")
        end = time.time() + 5
        while b"direct-shell-42" not in sh.snapshot() and time.time() < end:
            time.sleep(0.05)
        self.assertIn(b"direct-shell-42", sh.snapshot())
        sh.close()
        self.assertFalse(sh.alive)


def recvn(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            break
        buf += chunk
    return buf


class WebSocketTest(EngineCase):
    def setUp(self):
        super().setUp()
        (self.cfg["repo"]).mkdir(exist_ok=True)
        self.server = server.make_server(self.cfg, 0, self.store)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.RequestHandlerClass.terminals.close_all()
        self.server.shutdown()
        self.server.server_close()
        super().tearDown()

    def connect(self, project="applio"):
        s = socket.create_connection(("127.0.0.1", self.port), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode()
        s.sendall((f"GET /ws/terminal?project={project} HTTP/1.1\r\nHost: localhost:{self.port}\r\n"
                   f"Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
                   f"Sec-WebSocket-Version: 13\r\n\r\n").encode())
        head = b""
        while b"\r\n\r\n" not in head:
            head += s.recv(1024)
        return s, head.split(b"\r\n", 1)[0]

    def send(self, s, payload, opcode):
        mask = os.urandom(4)
        masked = bytes(c ^ mask[i % 4] for i, c in enumerate(payload))
        n = len(payload)
        if n < 126:
            header = bytes([0x80 | opcode, 0x80 | n])
        else:
            header = bytes([0x80 | opcode, 0x80 | 126]) + struct.pack(">H", n)
        s.sendall(header + mask + masked)

    def recv_frame(self, s, timeout=5):
        s.settimeout(timeout)
        head = recvn(s, 2)
        if len(head) < 2:
            return None
        length = head[1] & 0x7f
        if length == 126:
            length = struct.unpack(">H", recvn(s, 2))[0]
        elif length == 127:
            length = struct.unpack(">Q", recvn(s, 8))[0]
        return recvn(s, length)

    def read_until(self, s, marker, timeout=6):
        out, end = b"", time.time() + timeout
        while marker not in out and time.time() < end:
            try:
                frame = self.recv_frame(s, timeout=1)
            except socket.timeout:
                continue
            if frame is None:
                break
            out += frame
        return out

    def test_shell_echo_over_websocket(self):
        s, status = self.connect("applio")
        self.assertIn(b"101", status)
        time.sleep(0.3)
        self.send(s, b"echo ws-roundtrip-99\n", 0x2)
        out = self.read_until(s, b"ws-roundtrip-99")
        self.assertIn(b"ws-roundtrip-99", out)
        self.send(s, b'{"resize":[100,30]}', 0x1)  # control frame: no crash
        self.send(s, b"echo still-alive-7\n", 0x2)
        self.assertIn(b"still-alive-7", self.read_until(s, b"still-alive-7"))
        s.close()

    def test_shell_is_persistent_across_connections(self):
        s1, _ = self.connect("applio")
        time.sleep(0.3)
        self.send(s1, b"MARKERVAR=persisted-88\n", 0x2)
        time.sleep(0.5)
        s1.close()
        s2, _ = self.connect("applio")  # same project -> same shell
        time.sleep(0.3)
        self.send(s2, b"echo $MARKERVAR\n", 0x2)
        self.assertIn(b"persisted-88", self.read_until(s2, b"persisted-88"))
        s2.close()

    def test_runs_in_the_project_folder(self):
        s, _ = self.connect("stockbot")
        time.sleep(0.3)
        self.send(s, b"pwd\n", 0x2)
        tmp_name = Path(self.tmp.name).name.encode()  # only appears once pwd prints the full path
        out = self.read_until(s, tmp_name)
        self.assertIn(tmp_name + b"/stockbot", out)  # the shell's cwd is this test's stockbot folder
        s.close()

    def test_unknown_project_is_refused(self):
        s, status = self.connect("nope")
        self.assertIn(b"404", status)
        s.close()


if __name__ == "__main__":
    unittest.main()
