#!/usr/bin/env bash
# Themis auto-deploy watcher.
# Polls origin every 20s; on new commit pulls, kills server + Vite, restarts.
# Runs as a launchd agent (see install-watcher.sh) or under `nohup`/tmux.
# Logs to stdout — under launchd that goes to /tmp/themis-watcher.log.

set -uo pipefail

# Resolve repo root relative to this script. Independent of cwd so launchd
# can invoke us with a sparse environment and we still know where we are.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || { echo "repo root missing: $REPO_ROOT"; exit 1; }

# Branch to follow. Defaults to whatever is currently checked out so the
# operator can switch branches by running `git checkout other-branch` —
# the watcher will follow it next cycle.
read_branch() { git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""; }
BRANCH="$(read_branch)"
[ -z "$BRANCH" ] && { echo "not a git repo: $REPO_ROOT"; exit 1; }

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

notify() {
  # macOS user notification — silent fallback when osascript is missing
  # (Linux dev / CI environments).
  osascript -e "display notification \"$1\" with title \"Themis\"" 2>/dev/null || true
}

stop_processes() {
  log "stopping server + web"
  # tsx + vite spawn child processes; pkill -f gets the whole tree.
  pkill -f "tsx.*themis/server" 2>/dev/null || true
  pkill -f "themis/server/src/index.ts" 2>/dev/null || true
  pkill -f "vite" 2>/dev/null || true
  sleep 2
}

start_processes() {
  log "starting server (THEMIS_LLM_PROVIDER=claude-code)"
  # COURTLISTENER_API_TOKEN (optional) raises the Cite Check authority-lookup
  # rate limit. Source it from ~/.themis-env if present so the operator can set
  # it once without editing this script. Anonymous still works, just throttled.
  [ -f "$HOME/.themis-env" ] && set -a && . "$HOME/.themis-env" && set +a
  ( cd "$REPO_ROOT/themis/server" \
      && THEMIS_LLM_PROVIDER=claude-code nohup npm run dev > /tmp/themis-server.log 2>&1 & )
  log "starting web (vite)"
  ( cd "$REPO_ROOT/themis" \
      && nohup npm run dev > /tmp/themis-web.log 2>&1 & )
}

# Boot fresh on every watcher start.
stop_processes
start_processes
log "watcher up. repo=$REPO_ROOT branch=$BRANCH poll=20s"
notify "Themis watcher up · $BRANCH"

LAST_SHA="$(git rev-parse HEAD)"

while true; do
  sleep 20
  # Re-read branch every cycle so `git checkout` on the Mac is followed.
  BRANCH="$(read_branch)"
  if ! git fetch origin "$BRANCH" --quiet 2>/dev/null; then
    continue
  fi
  REMOTE_SHA="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")"
  [ -z "$REMOTE_SHA" ] && continue
  [ "$REMOTE_SHA" = "$LAST_SHA" ] && continue

  log "new commit on origin/$BRANCH: ${REMOTE_SHA:0:7} — redeploying"
  notify "Pulling ${REMOTE_SHA:0:7}…"
  if git pull --ff-only --quiet; then
    stop_processes
    start_processes
    LAST_SHA="$REMOTE_SHA"
    log "redeploy complete at ${REMOTE_SHA:0:7}"
    notify "Themis deployed ${REMOTE_SHA:0:7}"
  else
    log "pull failed — will retry next cycle (probably a merge conflict; resolve manually)"
    notify "Themis pull failed — see /tmp/themis-watcher.log"
  fi
done
