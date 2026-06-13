#!/usr/bin/env bash
# Themis auto-deploy watcher.
# Polls origin every 20s; on a new commit it pulls and restarts server + Vite.
# Between commits it supervises the API: if it stops answering /api/health it
# restarts the stack. Runs as a launchd agent (com.themis.watcher); logs to
# /tmp/themis-watcher.log.
#
# Health is probed with `curl http://127.0.0.1:8787/api/health`, NOT `lsof`.
# Under the launchd agent's session context `lsof -i` returns nothing even for
# a bound socket (it can't enumerate another process's network FDs), so an
# earlier lsof-based supervisor thought a healthy server was always down and
# restarted it every cycle (~95s thrash, 2026-06-12). curl to loopback has no
# such restriction and also verifies the server actually *responds*, not just
# that a port is open.

set -uo pipefail

# Resolve repo root relative to this script, independent of cwd, so launchd can
# invoke us with a sparse environment and we still know where we are.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || { echo "repo root missing: $REPO_ROOT"; exit 1; }

# Follow whatever branch is checked out so `git checkout other-branch` is honored.
read_branch() { git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""; }
BRANCH="$(read_branch)"
[ -z "$BRANCH" ] && { echo "not a git repo: $REPO_ROOT"; exit 1; }

HEALTH_URL="http://127.0.0.1:8787/api/health"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

notify() {
  # macOS user notification — silent fallback when osascript is missing.
  osascript -e "display notification \"$1\" with title \"Themis\"" 2>/dev/null || true
}

# True when the API answers /api/health (HTTP 2xx → curl exit 0).
server_healthy() { curl -fsS --max-time 3 -o /dev/null "$HEALTH_URL" 2>/dev/null; }

# Block until nothing answers on port $1 (curl exit 7 = connection refused), so
# a rebind can't hit EADDRINUSE on a not-yet-dead old server. SIGKILL holders
# as a backstop after ~12s. (EADDRINUSE on redeploy was the original outage.)
wait_port_free() {
  local port="$1" n=0 rc
  while true; do
    curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$port/" 2>/dev/null
    rc=$?
    [ "$rc" -eq 7 ] && return 0          # 7 = couldn't connect = port is free
    n=$((n + 1))
    if [ "$n" -gt 24 ]; then
      log "port $port still answering after ~12s — SIGKILL holders"
      pkill -9 -f "tsx.*themis/server" 2>/dev/null || true
      pkill -9 -f "themis/server/src/index.ts" 2>/dev/null || true
      pkill -9 -f "vite" 2>/dev/null || true
      sleep 1
      return 0
    fi
    sleep 0.5
  done
}

# Block until the API answers health, up to ~120s, so a slow boot finishes
# before the poll loop can judge it. Non-fatal on timeout (poll loop retries).
wait_server_up() {
  local n=0
  until server_healthy; do
    n=$((n + 1))
    if [ "$n" -gt 120 ]; then
      log "server not healthy after ~120s — continuing (poll loop will retry)"
      return 1
    fi
    sleep 1
  done
  log "server healthy on :8787"
}

stop_processes() {
  log "stopping server + web"
  # tsx + vite spawn child processes; pkill -f gets the whole tree.
  pkill -f "tsx.*themis/server" 2>/dev/null || true
  pkill -f "themis/server/src/index.ts" 2>/dev/null || true
  pkill -f "vite" 2>/dev/null || true
  # Don't return until the ports are actually free, or start_processes races the
  # not-yet-dead old server for :8787 and dies on EADDRINUSE.
  wait_port_free 8787
  wait_port_free 5180
}

start_processes() {
  log "starting server (THEMIS_LLM_PROVIDER=claude-code)"
  # COURTLISTENER_API_TOKEN (optional) raises the Cite Check authority-lookup
  # rate limit; ANTHROPIC_API_KEY etc. come from ~/.themis-env if present.
  [ -f "$HOME/.themis-env" ] && set -a && . "$HOME/.themis-env" && set +a
  ( cd "$REPO_ROOT/themis/server" \
      && THEMIS_LLM_PROVIDER=claude-code nohup npm run dev > /tmp/themis-server.log 2>&1 & )
  log "starting web (vite)"
  ( cd "$REPO_ROOT/themis" \
      && nohup npm run dev > /tmp/themis-web.log 2>&1 & )
  # Don't resume polling until the API actually answers — a poll that fires
  # mid-boot would treat "still booting" as "crashed" and kill it.
  wait_server_up || true
}

# Boot fresh on every watcher start.
stop_processes
start_processes
log "watcher up. repo=$REPO_ROOT branch=$BRANCH poll=20s"
notify "Themis watcher up · $BRANCH"

LAST_SHA="$(git rev-parse HEAD)"

while true; do
  sleep 20

  # Crash supervision: restart if the API stopped answering without a new
  # commit. (Original failure: a dead server stayed dark ~6.5h because the
  # watcher only ever acted on new commits.)
  if ! server_healthy; then
    log "server not answering health — restarting (crash recovery)"
    notify "Themis server down — restarting"
    stop_processes
    start_processes
  fi

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
    # If package.json / lock changed, npm install before restart — otherwise a
    # new dep is imported but not on disk and the server crashes on boot.
    if git diff --name-only "$LAST_SHA" "$REMOTE_SHA" 2>/dev/null | grep -qE "(^|/)(package\.json|package-lock\.json)$"; then
      log "package files changed — running npm install in server + web"
      ( cd "$REPO_ROOT/themis/server" && npm install --no-audit --no-fund --silent 2>&1 | tail -3 | while read -r line; do log "[server install] $line"; done ) || true
      ( cd "$REPO_ROOT/themis" && npm install --no-audit --no-fund --silent 2>&1 | tail -3 | while read -r line; do log "[web install] $line"; done ) || true
    fi
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
