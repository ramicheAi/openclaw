#!/usr/bin/env bash
# Themis public access via Tailscale Funnel.
#
# Usage (on the host running Themis, e.g. the iMac):
#   ./scripts/expose.sh start    # publish the local Vite (5180) to your tailnet
#   ./scripts/expose.sh stop     # take it down
#   ./scripts/expose.sh status   # show current funnel + URL
#
# Requires: macOS or Linux with Homebrew or apt; sudo for `tailscale up`.
# Tailscale Funnel exposes the URL to the public internet over HTTPS. If you
# only want it reachable on your own devices, use `tailscale serve` instead
# (private to your tailnet, no public URL).

set -euo pipefail

PORT="${PORT:-5180}"
ACTION="${1:-status}"

have() { command -v "$1" >/dev/null 2>&1; }

install_tailscale() {
  if have tailscale; then return; fi
  if have brew; then
    echo "→ installing tailscale via Homebrew (macOS)"
    brew install --cask tailscale
    # Mac app installs the menubar binary; CLI lives at the app bundle.
    if ! have tailscale && [ -e /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
      sudo ln -sf /Applications/Tailscale.app/Contents/MacOS/Tailscale /usr/local/bin/tailscale
    fi
  elif have apt-get; then
    echo "→ installing tailscale via apt (Linux)"
    curl -fsSL https://tailscale.com/install.sh | sh
  else
    echo "Tailscale install requires Homebrew or apt-get. Install manually from https://tailscale.com/download then re-run."
    exit 1
  fi
}

ensure_up() {
  if ! tailscale status >/dev/null 2>&1; then
    echo "→ tailscale up (you may be prompted to authenticate in a browser)"
    sudo tailscale up
  fi
}

case "$ACTION" in
  start)
    install_tailscale
    ensure_up
    echo "→ publishing http://localhost:${PORT} via Tailscale Funnel"
    sudo tailscale funnel --bg "${PORT}"
    sleep 1
    sudo tailscale funnel status
    ;;
  stop)
    echo "→ taking funnel down"
    sudo tailscale funnel --bg off || sudo tailscale funnel off
    ;;
  status)
    if ! have tailscale; then
      echo "tailscale not installed. Run './scripts/expose.sh start' to install + publish."
      exit 0
    fi
    sudo tailscale funnel status 2>/dev/null || echo "no funnel running"
    ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 2
    ;;
esac
