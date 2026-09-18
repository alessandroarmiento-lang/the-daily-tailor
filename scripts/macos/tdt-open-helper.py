#!/usr/bin/env python3
"""Local Mac opener HTTP front for The Daily Tailor.

Listens on 127.0.0.1:3855 and shells out to the EventKit `tdt-open` binary
(open exact item + activate app — no Automation TCC / grey browser sheet).

  POST /open  { "kind": "mail"|"reminder"|"event", ... }
  GET  /health → {"ok":true}

Install: ./deploy/macos/install-open-helper.sh
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = 3855

APP_SUPPORT = Path.home() / "Library" / "Application Support" / "the-daily-tailor"
OPEN_BIN = Path(os.environ.get("TDT_OPEN_BIN", str(APP_SUPPORT / "tdt-open")))


def run_open(args: list[str], timeout: float = 40.0) -> tuple[bool, str, dict]:
    if not OPEN_BIN.is_file():
        return False, f"missing binary {OPEN_BIN}", {}
    try:
        proc = subprocess.run(
            [str(OPEN_BIN), *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as err:
        partial = ""
        if err.stdout:
            partial = err.stdout if isinstance(err.stdout, str) else err.stdout.decode()
        if err.stderr:
            err_txt = err.stderr if isinstance(err.stderr, str) else err.stderr.decode()
            sys.stderr.write(f"tdt-open timeout stderr: {err_txt}\n")
        return False, "timeout", {"partial": partial}
    if proc.stderr:
        sys.stderr.write(f"tdt-open stderr: {proc.stderr}\n")
    raw = (proc.stdout or "").strip() or (proc.stderr or "").strip()
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        payload = {"ok": False, "detail": raw or f"exit {proc.returncode}"}
    ok = bool(payload.get("ok"))
    detail = str(payload.get("detail") or ("OK" if ok else "failed"))
    return ok, detail, payload if isinstance(payload, dict) else {}


def handle_open(body: dict) -> tuple[bool, str]:
    kind = str(body.get("kind") or "").strip().lower()
    if kind == "mail":
        mid = str(body.get("messageId") or body.get("id") or "")
        ok, detail, _ = run_open(["mail", "--id", mid])
        return ok, detail
    if kind == "reminder":
        title = str(body.get("title") or "")
        list_name = str(body.get("listName") or body.get("list") or "")
        args = ["reminder", "--title", title]
        if list_name:
            args.extend(["--list", list_name])
        ok, detail, _ = run_open(args)
        return ok, detail
    if kind in ("event", "calendar"):
        title = str(body.get("title") or "")
        start = str(body.get("startsAt") or body.get("start") or "")
        args = ["event", "--title", title]
        if start:
            args.extend(["--start", start])
        ok, detail, _ = run_open(args)
        return ok, detail
    return False, f"unknown kind {kind!r}"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("tdt-open: " + (fmt % args) + "\n")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.rstrip("/") != "/health":
            self.send_error(404)
            return
        payload = json.dumps(
            {
                "ok": True,
                "service": "tdt-open",
                "bin": OPEN_BIN.is_file(),
            }
        ).encode()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/open":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
            if not isinstance(body, dict):
                raise ValueError("body must be object")
        except Exception as err:
            self.send_response(400)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"ok": False, "error": str(err)}).encode()
            )
            return

        ok, detail = handle_open(body)
        if ok:
            status = 200
        elif detail == "NOT_FOUND":
            status = 404
        else:
            status = 500
        payload = json.dumps({"ok": ok, "detail": detail}).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"tdt-open listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
