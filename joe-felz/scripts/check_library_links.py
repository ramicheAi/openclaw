#!/usr/bin/env python3
"""Check every URL in data/library.json and record its status in place.

Adds "link_status": {url: "HTTP code or error"} to each item, plus a checked
timestamp on the top level, so the catalog notes can show whether each copy
was reachable when the vault was built. GET with an early abort rather than
HEAD: several of these hosts (hathitrust, scribd, amazon) reject HEAD.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PATH = os.path.join(ROOT, "data", "library.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def probe(url):
    cmd = ["curl", "-sS", "-o", "/dev/null", "-m", "25", "-L",
           "--max-filesize", "200000",  # abort large bodies early; 63 = hit cap, means OK
           "-w", "%{http_code}", "-H", f"User-Agent: {UA}", url]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=35)
        code = r.stdout.strip()
        if r.returncode == 63:      # CURLE_FILESIZE_EXCEEDED: body exists and is big
            return "200 (large file)"
        if r.returncode != 0 and code in ("", "000"):
            err = (r.stderr or "").strip().splitlines()
            return f"error: {err[-1][:80]}" if err else "error"
        return code or "no response"
    except subprocess.TimeoutExpired:
        return "timeout"


def main():
    data = json.load(open(PATH))
    total = ok = 0
    for cat in data["categories"]:
        for item in cat["items"]:
            status = {}
            for url in item.get("urls", []):
                s = probe(url)
                status[url] = s
                total += 1
                if s.startswith("200"):
                    ok += 1
                print(f"[{s:>18}] {item['title'][:50]:50} {url[:70]}",
                      flush=True)
            if status:
                item["link_status"] = status
    data["links_checked_utc"] = datetime.now(timezone.utc).strftime(
        "%Y-%m-%d %H:%M UTC")
    with open(PATH, "w") as fh:
        json.dump(data, fh, indent=1, ensure_ascii=False)
    print(f"\n{ok}/{total} links reachable")


if __name__ == "__main__":
    sys.exit(main())
