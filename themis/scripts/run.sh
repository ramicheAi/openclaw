#!/usr/bin/env bash
# Themis one-command boot.
#
# Usage (from the themis/ root):
#   ./scripts/run.sh           # local-only: API on :8787, Vite on :5180
#   ./scripts/run.sh --public  # also publish via Tailscale Funnel
#   ./scripts/run.sh --stop    # tear down everything
#
# Reads ANTHROPIC_API_KEY from the environment (or ~/.themis-env if present)
# and exports it to the API server so chat synthesis runs through Claude
# instead of the deterministic fallback.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-8787}"
WEB_PORT="${WEB_PORT:-5180}"
LOG_DIR="$ROOT/.run-logs"
mkdir -p "$LOG_DIR"

# Pick up the key from ~/.themis-env if present (gitignored). This means you
# can set it once and forget it.
if [ -f "$HOME/.themis-env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$HOME/.themis-env"
  set +a
fi

ACTION="${1:---start}"

stop_all() {
  for f in "$LOG_DIR/api.pid" "$LOG_DIR/vite.pid"; do
    if [ -f "$f" ]; then
      pid="$(cat "$f")"
      if kill -0 "$pid" 2>/dev/null; then
        echo "→ stopping pid $pid"
        kill "$pid" || true
      fi
      rm -f "$f"
    fi
  done
}

start_api() {
  if [ ! -d "server/node_modules" ]; then
    echo "→ installing server dependencies"
    (cd server && npm install)
  fi
  echo "→ starting API on http://localhost:${API_PORT}"
  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    echo "  · ANTHROPIC_API_KEY detected — chat synthesis will use Claude"
  else
    echo "  · ANTHROPIC_API_KEY unset — deterministic engine will handle chat"
  fi
  (
    cd server
    PORT="$API_PORT" nohup npm start >"$LOG_DIR/api.log" 2>&1 &
    echo $! >"$LOG_DIR/api.pid"
  )
  sleep 3
  for i in 1 2 3 4 5; do
    if curl -fsS "http://localhost:${API_PORT}/api/health" >/dev/null; then
      echo "  · API ready"
      return 0
    fi
    sleep 1
  done
  echo "  · API failed to start; tail of log:"
  tail -20 "$LOG_DIR/api.log"
  exit 1
}

start_vite() {
  if [ ! -d "node_modules" ]; then
    echo "→ installing frontend dependencies"
    npm install
  fi
  echo "→ starting Vite on http://localhost:${WEB_PORT}"
  nohup npm run dev -- --host 0.0.0.0 --port "$WEB_PORT" >"$LOG_DIR/vite.log" 2>&1 &
  echo $! >"$LOG_DIR/vite.pid"
  sleep 4
  for i in 1 2 3 4 5 6; do
    if curl -fsS -I "http://localhost:${WEB_PORT}" | head -1 | grep -q 200; then
      echo "  · Vite ready"
      return 0
    fi
    sleep 1
  done
  echo "  · Vite failed to start; tail of log:"
  tail -20 "$LOG_DIR/vite.log"
  exit 1
}

publish_tunnel() {
  bash "$ROOT/scripts/expose.sh" start
}

case "$ACTION" in
  --stop|stop)
    stop_all
    bash "$ROOT/scripts/expose.sh" stop || true
    echo "→ stopped"
    ;;
  --start|start|"")
    stop_all
    start_api
    start_vite
    echo ""
    echo "Themis is running:"
    echo "  • Local:        http://localhost:${WEB_PORT}"
    echo "  • API:          http://localhost:${API_PORT}/api/health"
    echo "  • API log:      $LOG_DIR/api.log"
    echo "  • Vite log:     $LOG_DIR/vite.log"
    ;;
  --public|public)
    stop_all
    start_api
    start_vite
    publish_tunnel
    ;;
  *)
    echo "Usage: $0 [--start|--stop|--public]"
    exit 2
    ;;
esac
