#!/usr/bin/env bash
# Open the interactive Remotion Studio in the browser (Ctrl+C to stop).
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_studio.sh"
STUDIO="$(studio_or_die)"; ensure_installed "$STUDIO"
echo "Opening Remotion Studio from: $STUDIO"
( cd "$STUDIO" && "$(remotion_bin "$STUDIO")" studio )
