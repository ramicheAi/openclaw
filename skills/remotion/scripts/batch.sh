#!/usr/bin/env bash
# Batch-render many videos from a CSV or JSON file (the volume engine).
# usage: batch.sh <input.csv> --composition QuoteReel [opts]
#        batch.sh <jobs.json> [opts]
# opts: --out-dir <d> --jobs <n> --prefix <name> --codec <c> --scale <n>
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_studio.sh"
STUDIO="$(studio_or_die)"; ensure_installed "$STUDIO"
exec node "$HERE/batch.mjs" --studio "$STUDIO" "$@"
