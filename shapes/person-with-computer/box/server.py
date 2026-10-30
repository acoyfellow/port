import os
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

BOOT = uuid.uuid4().hex
NOTE = "/home/user/note.txt"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/write":
            with open(NOTE, "w") as f:
                f.write(parse_qs(url.query).get("text", [""])[0])
        note = open(NOTE).read() if os.path.exists(NOTE) else ""
        body = ('{"boot":"%s","note":"%s"}' % (BOOT, note)).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)


HTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
