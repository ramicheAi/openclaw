#!/usr/bin/env python3
"""Paginate the whole joefelz timeline via the unauthenticated private-API feed endpoint.

Endpoint: /api/v1/feed/user/<user_id>/?count=33&max_id=<cursor>

Instagram throttles logged-out access at the IP level and returns
HTTP 401 {"message": "Please wait a few minutes..."} once tripped. The
throttle is shared across all /api/v1/* endpoints, so the only workable
strategy is to crawl slowly and adapt: widen the delay whenever we get
blocked, narrow it again after sustained success, and never give up.

Writes one raw JSON page per request so the run is resumable and auditable.
"""
import json
import os
import random
import subprocess
import sys
import time

USER_ID = "53410977143"
USERNAME = "joefelz"
RAW = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "raw"))
STATE = os.path.join(RAW, "_state.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

DELAY_MIN = 20.0        # never go faster than this
DELAY_START = 45.0
DELAY_MAX = 120.0
SUCCESS_STREAK_TO_SPEED_UP = 5


def fetch(max_id):
    url = f"https://www.instagram.com/api/v1/feed/user/{USER_ID}/?count=33"
    if max_id:
        url += f"&max_id={max_id}"
    cmd = ["curl", "-sS", "-m", "45", "-w", "\n%{http_code}", url,
           "-H", f"User-Agent: {UA}",
           "-H", "x-ig-app-id: 936619743392459",
           "-H", "Accept: */*",
           "-H", "Accept-Language: en-US,en;q=0.9",
           "-H", f"Referer: https://www.instagram.com/{USERNAME}/"]

    # Anonymous access is throttled to a handful of requests per IP before
    # Instagram returns 401 for an extended period. Supplying a logged-in
    # session raises that ceiling enormously and is the practical way to
    # finish a full-account crawl.
    #   export IG_SESSIONID="<sessionid cookie from a logged-in browser>"
    sessionid = os.environ.get("IG_SESSIONID", "").strip()
    if sessionid:
        csrf = os.environ.get("IG_CSRFTOKEN", "").strip()
        cookie = f"sessionid={sessionid}"
        if csrf:
            cookie += f"; csrftoken={csrf}"
            cmd += ["-H", f"x-csrftoken: {csrf}"]
        cmd += ["-H", f"Cookie: {cookie}"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=70).stdout
    except subprocess.TimeoutExpired:
        return "", "timeout"
    body, _, code = out.rpartition("\n")
    return body, code.strip()


def load_state():
    if os.path.exists(STATE):
        s = json.load(open(STATE))
        print(f"resuming at page {s['page']} ({s['seen']} posts)", flush=True)
        return s
    return {"page": 0, "max_id": None, "seen": 0}


def main():
    state = load_state()
    delay = DELAY_START
    streak = 0

    while True:
        body, code = fetch(state["max_id"])

        if code != "200":
            streak = 0
            delay = min(DELAY_MAX, max(delay, 30.0) * 2)
            print(f"[page {state['page']}] HTTP {code} -> throttled, "
                  f"delay now {delay:.0f}s", flush=True)
            time.sleep(delay + random.uniform(0, 15))
            continue

        try:
            d = json.loads(body)
        except json.JSONDecodeError:
            streak = 0
            delay = min(DELAY_MAX, max(delay, 30.0) * 2)
            time.sleep(delay)
            continue

        items = d.get("items") or []
        if not items:
            print("no items returned; end of feed", flush=True)
            break

        with open(os.path.join(RAW, f"page_{state['page']:04d}.json"), "w") as fh:
            json.dump(d, fh)

        state["seen"] += len(items)
        state["page"] += 1
        state["max_id"] = d.get("next_max_id")
        with open(STATE, "w") as fh:
            json.dump(state, fh)

        streak += 1
        # Ease the delay back down once the endpoint has been stable for a while.
        if streak >= SUCCESS_STREAK_TO_SPEED_UP:
            delay = max(DELAY_MIN, delay * 0.75)
            streak = 0

        print(f"page {state['page']-1}: +{len(items)} -> {state['seen']} total "
              f"| more={d.get('more_available')} | delay={delay:.0f}s", flush=True)

        if not d.get("more_available") or not state["max_id"]:
            print("reached end of feed", flush=True)
            break

        time.sleep(delay + random.uniform(0, delay * 0.3))

    print(f"DONE: {state['seen']} posts across {state['page']} pages", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
