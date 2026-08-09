#!/usr/bin/env python3
"""Fetch metadata + English transcripts for every joefelz YouTube item.

YouTube blocks the default player clients from this IP ("Sign in to confirm
you're not a bot"). The `tv_embedded` and `android_vr` clients still serve
both the player response and the caption tracks, so we use those.

Writes <id>.info.json and <id>.<lang>.vtt per video. Resumable: anything
already on disk (or recorded as permanently failed) is skipped.
"""
import json
import os
import random
import subprocess
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW = os.path.join(ROOT, "data", "raw")
SUBS = os.path.join(ROOT, "data", "subs")
FAILED = os.path.join(RAW, "yt_failed.json")
CLIENTS = ["tv_embedded", "android_vr"]

os.makedirs(SUBS, exist_ok=True)


def collect_ids():
    """Long-form and streams first (highest teaching density), then shorts."""
    ids, seen = [], set()
    for name in ("yt_videos.jsonl", "yt_streams.jsonl", "yt_shorts.jsonl"):
        path = os.path.join(RAW, name)
        if not os.path.exists(path):
            continue
        for line in open(path):
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            vid = d.get("id")
            if vid and vid not in seen:
                seen.add(vid)
                ids.append((vid, name.replace("yt_", "").replace(".jsonl", "")))
    return ids


def already_done(vid):
    return os.path.exists(os.path.join(SUBS, f"{vid}.info.json"))


def fetch(vid):
    # YouTube blocks anonymous datacenter traffic after a burst. A cookies.txt
    # exported from a logged-in browser lifts that limit and is the practical
    # way to pull the full channel:
    #   export YT_COOKIES=/path/to/cookies.txt
    cookies = os.environ.get("YT_COOKIES", "").strip()

    for client in CLIENTS:
        cmd = [sys.executable, "-m", "yt_dlp", "--skip-download",
               "--write-auto-subs", "--write-subs", "--sub-langs", "en.*",
               "--sub-format", "vtt", "--write-info-json", "--no-warnings",
               "--no-progress", "--retries", "3",
               "--extractor-args", f"youtube:player_client={client}",
               "-o", os.path.join(SUBS, "%(id)s.%(ext)s"),
               f"https://www.youtube.com/watch?v={vid}"]
        if cookies:
            cmd[-1:-1] = ["--cookies", cookies]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        except subprocess.TimeoutExpired:
            continue
        if already_done(vid):
            return True, client
        if "DRM" in r.stderr or "Private video" in r.stderr:
            continue
    return False, None


DELAY_MIN = 8.0
DELAY_START = 15.0
DELAY_MAX = 420.0


def main():
    """YouTube trips bot detection after a burst of requests from a datacenter
    IP, so pace adaptively: widen on failure, narrow after a success run.
    Long-form videos and streams are queued ahead of shorts, so the material
    with the most spoken content lands first if the run is cut short."""
    failed = json.load(open(FAILED)) if os.path.exists(FAILED) else {}
    ids = collect_ids()
    print(f"{len(ids)} YouTube items queued", flush=True)

    delay = DELAY_START
    streak = 0
    done = skipped = new = 0

    for i, (vid, kind) in enumerate(ids):
        if already_done(vid):
            done += 1
            continue
        if failed.get(vid, 0) >= 4:
            skipped += 1
            continue

        ok, client = fetch(vid)
        if ok:
            new += 1
            streak += 1
            # Decay on every success, faster once a run is established, so one
            # bad patch does not leave the crawler parked at a long delay.
            delay = max(DELAY_MIN, delay * (0.5 if streak >= 3 else 0.8))
            print(f"[{i+1}/{len(ids)}] {vid} ({kind}) ok via {client} "
                  f"| delay={delay:.0f}s", flush=True)
        else:
            streak = 0
            failed[vid] = failed.get(vid, 0) + 1
            with open(FAILED, "w") as fh:
                json.dump(failed, fh)
            delay = min(DELAY_MAX, max(delay, 10.0) * 2)
            print(f"[{i+1}/{len(ids)}] {vid} ({kind}) FAILED "
                  f"| delay={delay:.0f}s", flush=True)

        time.sleep(delay + random.uniform(0, delay * 0.4))

    print(f"DONE: {new} new, {done} already present, {skipped} skipped, "
          f"{len(failed)} in failed list", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
