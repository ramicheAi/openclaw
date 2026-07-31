#!/usr/bin/env bash
# Installs a launchd agent that runs themis/scripts/backup.sh daily at
# 03:30 local time. One-time setup: `bash themis/scripts/install-backup.sh`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SH="$SCRIPT_DIR/backup.sh"
PLIST="$HOME/Library/LaunchAgents/com.themis.backup.plist"
LABEL="com.themis.backup"

chmod +x "$BACKUP_SH"

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
    <string>$BACKUP_SH</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>3</integer>
    <key>Minute</key><integer>30</integer>
  </dict>
  <key>RunAtLoad</key><false/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StandardOutPath</key><string>/tmp/themis-backup.log</string>
  <key>StandardErrorPath</key><string>/tmp/themis-backup.log</string>
</dict>
</plist>
EOF

launchctl load "$PLIST"

cat <<EOF

Themis backup installed.
  Runs:    daily at 03:30 local time
  Output:  ~/.themis/backups/themis-YYYYMMDD-HHMMSS.tar.gz
  Keep:    last 30 days (override with THEMIS_BACKUP_KEEP=N)
  Log:     tail -f /tmp/themis-backup.log
  Force:   bash $BACKUP_SH

To restore a backup, unpack into the matching locations:
  tar xzf <backup.tar.gz> -C /tmp/restore
  cp /tmp/restore/.../themis.db  themis/server/data/themis.db
  cp -R /tmp/restore/.../media   ~/.themis/media

To uninstall the backup agent:
  launchctl unload "$PLIST"
EOF
