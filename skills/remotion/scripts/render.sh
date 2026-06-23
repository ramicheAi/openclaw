#!/usr/bin/env bash
# Render a composition to MP4 locally.
# usage: render.sh <Composition> [--props '<json>'] [--props-file <f>] [--out <path>] [--codec <c>] [--scale <n>]
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_studio.sh"

COMP=""; PROPS=""; PROPS_FILE=""; OUT=""; CODEC=""; SCALE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --props) PROPS="$2"; shift 2;;
    --props-file) PROPS_FILE="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --codec) CODEC="$2"; shift 2;;
    --scale) SCALE="$2"; shift 2;;
    -h|--help)
      echo "usage: render.sh <Composition> [--props '<json>'] [--props-file f] [--out path] [--codec h264] [--scale 2]"
      exit 0;;
    *) if [ -z "$COMP" ]; then COMP="$1"; else echo "unknown arg: $1" >&2; exit 1; fi; shift;;
  esac
done
[ -n "$COMP" ] || { echo "render.sh: composition id required" >&2; exit 1; }

STUDIO="$(studio_or_die)"; ensure_installed "$STUDIO"
BIN="$(remotion_bin "$STUDIO")"
mkdir -p "$STUDIO/out"
[ -n "$OUT" ] || OUT="$STUDIO/out/${COMP}-$(date +%Y%m%d-%H%M%S).mp4"

TMP=""
if [ -n "$PROPS" ]; then
  TMP="$(mktemp -t remotion-props).json"
  printf '%s' "$PROPS" > "$TMP"
  PROPS_FILE="$TMP"
fi

ARGS=(render src/index.ts "$COMP" "$OUT")
[ -n "$PROPS_FILE" ] && ARGS+=("--props=$PROPS_FILE")
[ -n "$CODEC" ] && ARGS+=("--codec=$CODEC")
[ -n "$SCALE" ] && ARGS+=("--scale=$SCALE")

set +e
( cd "$STUDIO" && "$BIN" "${ARGS[@]}" )
RC=$?
set -e
[ -n "$TMP" ] && rm -f "$TMP"
[ $RC -eq 0 ] && echo "Rendered $COMP -> $OUT"
exit $RC
