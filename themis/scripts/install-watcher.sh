#!/usr/bin/env bash
# One-time install: registers a launchd agent that runs themis-watch.sh on
# login + keeps it alive. After this, every git push to the tracked branch
# auto-deploys to your Mac in <20s — no commands to run, no terminals to
# keep open.
#
# Run once: `bash themis/scripts/install-watcher.sh` from inside the repo.
# Reinstall: same command. Uninstall: `launchctl unload <plist>`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WATCHER="$SCRIPT_DIR/themis-watch.sh"
PLIST="$HOME/Library/LaunchAgents/com.themis.watcher.plist"
LABEL="com.themis.watcher"

# Make sure node + npm are reachable. launchd starts with a sparse env —
# we bake the user's current node binary directory into the plist's PATH
# so nvm/volta/homebrew/pnpm all work without sourcing a shell rc file.
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"
if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
  echo "Error: node + npm must be on PATH. If you use nvm/volta, run \`nvm use\` first." >&2
  exit 1
fi
NODE_DIR="$(dirname "$NODE_BIN")"
NPM_DIR="$(dirname "$NPM_BIN")"

chmod +x "$WATCHER"

# Unload an existing copy so we replace cleanly.
launchctl unload "$PLIST" 2>/dev/null || true

# bootout is the modern equivalent — try it too, ignore failure.
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$WATCHER</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO_ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_DIR:$NPM_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StandardOutPath</key><string>/tmp/themis-watcher.log</string>
  <key>StandardErrorPath</key><string>/tmp/themis-watcher.log</string>
</dict>
</plist>
EOF

launchctl load "$PLIST"

cat <<EOF

Themis watcher installed.
  Repo:    $REPO_ROOT
  Branch:  $(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
  Plist:   $PLIST
  Log:     tail -f /tmp/themis-watcher.log

Every push to origin/<current-branch> will auto-deploy within ~20s.
The Mac will pop a notification on each redeploy.

Tail server log:  tail -f /tmp/themis-server.log
Tail web log:     tail -f /tmp/themis-web.log
Stop watcher:     launchctl unload "$PLIST"
EOF
