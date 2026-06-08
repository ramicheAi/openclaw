#!/usr/bin/env bash
# Installs a launchd agent that runs the daily deadline-reminder digest at
# 08:00 local time. One-time setup: `bash themis/scripts/install-reminders.sh`.
#
# The script reads ~/.themis-env (RESEND_API_KEY, THEMIS_PUBLIC_URL,
# THEMIS_DB, etc.) so it shares config with the watcher.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVER_DIR="$REPO_ROOT/themis/server"
PLIST="$HOME/Library/LaunchAgents/com.themis.reminders.plist"
LABEL="com.themis.reminders"

# Find node, just like the watcher installer.
NODE_BIN="$(command -v node || true)"
for cand in "$HOME/.nvm/versions/node"/*/bin/node "$HOME/.volta/bin/node" "/opt/homebrew/bin/node" "/usr/local/bin/node"; do
  [ -z "$NODE_BIN" ] && [ -x "$cand" ] && NODE_BIN="$cand"
done
if [ -z "$NODE_BIN" ]; then
  echo "Error: node not found." >&2
  exit 1
fi
NODE_DIR="$(dirname "$NODE_BIN")"

# Write a tiny wrapper that sources ~/.themis-env then runs the reminders.
WRAPPER="$HOME/.themis/run-reminders.sh"
mkdir -p "$(dirname "$WRAPPER")"
cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
set -uo pipefail
[ -f "\$HOME/.themis-env" ] && set -a && . "\$HOME/.themis-env" && set +a
cd "$SERVER_DIR"
export PATH="$NODE_DIR:\$PATH"
exec npx tsx src/run-reminders.ts
EOF
chmod +x "$WRAPPER"

launchctl unload "$PLIST" 2>/dev/null || true

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$WRAPPER</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>8</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StandardOutPath</key><string>/tmp/themis-reminders.log</string>
  <key>StandardErrorPath</key><string>/tmp/themis-reminders.log</string>
</dict>
</plist>
EOF

launchctl load "$PLIST"

cat <<EOF

Themis daily reminders installed.
  Runs:  08:00 local time
  Log:   tail -f /tmp/themis-reminders.log
  Force: bash $WRAPPER

To uninstall:
  launchctl unload "$PLIST"
EOF
