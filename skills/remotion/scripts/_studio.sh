#!/usr/bin/env bash
# Shared studio-resolution helpers for the remotion skill.
# Works identically whether this skill lives in the OpenClaw repo (skills/remotion)
# or globally (~/.claude/skills/remotion): it resolves the one canonical studio.
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_studio() {
  # 1) explicit override
  if [ -n "${REMOTION_STUDIO_DIR:-}" ] && [ -d "${REMOTION_STUDIO_DIR}" ]; then
    (cd "$REMOTION_STUDIO_DIR" && pwd); return 0
  fi
  # 2) repo-relative (when this skill is inside the OpenClaw repo)
  local rel="$LIB_DIR/../../../extensions/remotion/studio"
  if [ -d "$rel" ]; then (cd "$rel" && pwd); return 0; fi
  # 3) global symlink created by setup.sh
  if [ -d "$HOME/.claude/remotion-studio" ]; then (cd "$HOME/.claude/remotion-studio" && pwd); return 0; fi
  # 4) known machine path
  if [ -d "/Users/admin/openclaw-src/extensions/remotion/studio" ]; then
    echo "/Users/admin/openclaw-src/extensions/remotion/studio"; return 0
  fi
  return 1
}

studio_or_die() {
  local s; s="$(resolve_studio || true)"
  if [ -z "$s" ]; then
    echo "remotion: could not locate the Remotion studio. Set REMOTION_STUDIO_DIR." >&2
    exit 1
  fi
  echo "$s"
}

remotion_bin() { echo "$1/node_modules/.bin/remotion"; }

ensure_installed() {
  local s="$1"
  if [ ! -x "$(remotion_bin "$s")" ]; then
    echo "remotion: studio deps not installed. Run: $LIB_DIR/setup.sh" >&2
    exit 1
  fi
}
