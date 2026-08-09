#!/usr/bin/env bash
# Restart both collectors, then wait.
#
# Restarting mid-crawl costs nothing (both checkpoint and skip completed work)
# and measurably helps: a process parked at its maximum backoff keeps missing
# the windows when the platform block lifts, whereas a fresh process starts at
# the short delay again and catches them. Observed jumping Instagram from 84 to
# 120 posts in one restart.
cd "$(dirname "$0")/.." || exit 1

for p in $(pgrep -f "^python3 scripts/"); do kill "$p" 2>/dev/null; done
sleep 3
./scripts/supervise.sh

sleep "${1:-420}"

echo "IG=$(python3 -c "import json;print(json.load(open('data/raw/_state.json'))['seen'])" 2>/dev/null)" \
     "YT=$(ls data/subs/*.info.json 2>/dev/null | wc -l)"
tail -1 data/raw/scrape.log
tail -1 data/raw/yt_fetch.log
