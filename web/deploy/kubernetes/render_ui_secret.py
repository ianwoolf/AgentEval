"""Render local Control config as Secrets. Pipe stdout directly to kubectl.

Keeps the original auth/session settings and changes only the database host.
Does not read or emit the evaluation Trigger token; the pod references its
existing evaluation-trigger Secret directly.
"""

import argparse
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--database-host", default="host.docker.internal")
    parser.add_argument("--database-port", type=int, default=55432)
    args = parser.parse_args()
    content = args.config.read_text(encoding="utf-8-sig")
    match = re.search(r'(?m)^url\s*=\s*"(postgresql://[^"\n]+)"\s*$', content)
    if not match:
        raise SystemExit("Expected a PostgreSQL database url in local TOML config")
    url = urlsplit(match.group(1))
    if not url.username or not url.password or not url.path.strip("/"):
        raise SystemExit("Local PostgreSQL config must specify user, password and database")
    credentials = url.netloc.rsplit("@", 1)[0]
    destination = urlunsplit((url.scheme, credentials + f"@{args.database_host}:{args.database_port}", url.path, url.query, url.fragment))
    content = content[:match.start(1)] + destination + content[match.end(1):]
    items = []
    for name, data in [
        ("evaluation-ui-config", {"control.toml": content}),
    ]:
        items.append({"apiVersion": "v1", "kind": "Secret", "metadata": {"name": name, "namespace": "evaluation"}, "type": "Opaque", "stringData": data})
    print(json.dumps({"apiVersion": "v1", "kind": "List", "items": items}))


if __name__ == "__main__":
    main()
