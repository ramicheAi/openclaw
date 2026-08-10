#!/usr/bin/env bash
# Start either collector if it is not currently running.
#
# Both are safe to start repeatedly: each checkpoints its progress and skips
# work already on disk, so a restart resumes rather than redoing. Handy when
# long-running background jobs get reaped.
cd "$(dirname "$0")/.." || exit 1

start_if_down() {
  local script="$1" log="$2"
  # Anchor to the start of the command line so this only ever matches the
  # collector itself, never a shell whose command line happens to mention the
  # filename (which silently defeated an unanchored pattern).
  if pgrep -f "^python3 scripts/$script" >/dev/null 2>&1; then
    echo "$script already running"
  else
    setsid nohup python3 "scripts/$script" >> "$log" 2>&1 < /dev/null &
    disown
    echo "$script started"
  fi
}

start_if_down scrape.py   data/raw/scrape.log
start_if_down yt_fetch.py data/raw/yt_fetch.log
