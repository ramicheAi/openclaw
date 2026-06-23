#!/usr/bin/env bash
# Install the Remotion studio dependencies (one time).
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_studio.sh"

STUDIO="$(studio_or_die)"
echo "Installing Remotion studio deps in: $STUDIO"
( cd "$STUDIO" && npm install )

# Make the studio reachable globally (so any repo's session resolves it without env vars).
LINK="$HOME/.claude/remotion-studio"
if [ ! -e "$LINK" ] && [ "$STUDIO" != "$LINK" ]; then
  if ln -s "$STUDIO" "$LINK" 2>/dev/null; then echo "Linked $LINK -> $STUDIO"; fi
fi

echo "Setup complete. The first render downloads a headless Chrome (~150MB)."
