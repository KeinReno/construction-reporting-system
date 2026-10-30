"""Open the private owner preview on this computer only."""
from __future__ import annotations

import http.server
import argparse
import socketserver
import threading
import webbrowser
from pathlib import Path


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).resolve().parent), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def log_message(self, format, *args):
        # Avoid writing paths and query strings from private data into a log.
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    with Server(("127.0.0.1", 0), Handler) as server:
        url = f"http://127.0.0.1:{server.server_address[1]}/"
        print(f"Локальное демо владельца: {url}", flush=True)
        print("Для остановки закройте это окно или нажмите Ctrl+C.", flush=True)
        if not args.no_browser:
            threading.Timer(0.4, lambda: webbrowser.open(url)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
