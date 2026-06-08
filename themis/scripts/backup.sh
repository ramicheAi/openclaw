#!/usr/bin/env bash
# Nightly backup of every Themis state file: the SQLite DB, the WAL, the
# persisted media (~/.themis/media/<matter>/*), and the operator's env file
# if present. Rolling 30-day retention.
#
# Run manually:   bash themis/scripts/backup.sh
# Run automatic:  add a launchd plist or cron entry that calls this script.
#                 The watcher (themis-watch.sh) doesn't run this — backups
#                 should keep happening even if the watcher is stopped.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="${THEMIS_BACKUP_DIR:-$HOME/.themis/backups}"
KEEP_DAYS="${THEMIS_BACKUP_KEEP:-30}"

mkdir -p "$BACKUP_DIR"

ts="$(date +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/themis-$ts.tar.gz"

# Build the tar list. Each entry is optional — skip missing files quietly so
# the script works on a fresh install too.
files=()
for p in \
  "$REPO_ROOT/themis/server/data/themis.db" \
  "$REPO_ROOT/themis/server/data/themis.db-wal" \
  "$REPO_ROOT/themis/server/data/themis.db-shm" \
  "$HOME/.themis/media" \
  "$HOME/.themis-env"; do
  [ -e "$p" ] && files+=("$p")
done

if [ "${#files[@]}" -eq 0 ]; then
  echo "[backup] no state files to back up yet (themis hasn't run?)"
  exit 0
fi

# SQLite-safe backup: use `sqlite3 .backup` instead of copying the DB
# while it might be mid-write. Falls back to plain copy if the sqlite3 CLI
# isn't installed.
SQLITE_DB="$REPO_ROOT/themis/server/data/themis.db"
if [ -f "$SQLITE_DB" ] && command -v sqlite3 >/dev/null 2>&1; then
  TMP_DB="$(mktemp -t themis-backup.XXXXXX)"
  if sqlite3 "$SQLITE_DB" ".backup '$TMP_DB'" 2>/dev/null; then
    # Replace the DB entry in the tar list with the consistent snapshot.
    new_files=()
    for f in "${files[@]}"; do
      [ "$f" = "$SQLITE_DB" ] && continue
      [[ "$f" == *themis.db-wal ]] && continue
      [[ "$f" == *themis.db-shm ]] && continue
      new_files+=("$f")
    done
    new_files+=("$TMP_DB")
    files=("${new_files[@]}")
  fi
fi

tar czf "$out" "${files[@]}" 2>/dev/null

[ -n "${TMP_DB:-}" ] && rm -f "$TMP_DB"

size="$(du -h "$out" | awk '{print $1}')"
echo "[backup] wrote $out ($size)"

# Rotate — keep last KEEP_DAYS days of backups.
find "$BACKUP_DIR" -name "themis-*.tar.gz" -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null
remaining="$(find "$BACKUP_DIR" -name "themis-*.tar.gz" -type f | wc -l | tr -d ' ')"
echo "[backup] retention: $remaining backup(s) on disk ($KEEP_DAYS-day window)"
