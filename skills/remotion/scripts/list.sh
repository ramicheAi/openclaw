#!/usr/bin/env bash
# List the registered compositions.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_studio.sh"
STUDIO="$(studio_or_die)"; ensure_installed "$STUDIO"
( cd "$STUDIO" && "$(remotion_bin "$STUDIO")" compositions src/index.ts )
