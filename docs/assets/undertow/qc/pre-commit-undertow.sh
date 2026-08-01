#!/usr/bin/env bash
# UNDERTOW integrity gate — pre-commit hook.
#
# Blocks any commit that touches docs/assets/undertow/ unless the asset
# verifier passes, and blocks any commit that touches the score unless the
# audio verifiers pass too. This is what makes the canon and delivery systems
# unskippable rather than merely documented.
#
# INSTALL:
#   ln -sf ../../docs/assets/undertow/qc/pre-commit-undertow.sh .git/hooks/pre-commit
#   chmod +x docs/assets/undertow/qc/pre-commit-undertow.sh
#
# Bypass (emergencies only, and it will be visible in history):
#   git commit --no-verify

set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
VERIFIER="$REPO_ROOT/docs/assets/undertow/qc/verify_assets.py"

# Only run when UNDERTOW assets or canon are in play.
if ! git diff --cached --name-only | grep -qE '^docs/(assets/undertow/|UNDERTOW-CHARACTER-CANON\.json)'; then
  exit 0
fi

echo ""
echo "  UNDERTOW art-integrity gate…"

if [ ! -f "$VERIFIER" ]; then
  echo "  ✗ verifier missing at $VERIFIER — refusing to commit character art blind."
  exit 1
fi

if ! python3 "$VERIFIER"; then
  cat <<'MSG'

  ────────────────────────────────────────────────────────────────
  COMMIT BLOCKED — UNDERTOW character canon violation.

  Every character asset must trace to approved identity. Fix by either:

    • Regenerating with the character's locked element_id
      (see docs/UNDERTOW-CHARACTER-CANON.json)
    • Registering the asset in qc/asset-manifest.json with valid
      provenance and a visual sign-off

  Full rules: docs/UNDERTOW-ART-PROTOCOL.md
  Status:     python3 docs/assets/undertow/qc/verify_assets.py --report
  ────────────────────────────────────────────────────────────────

MSG
  exit 1
fi

# ── audio gates ─────────────────────────────────────────────────────────────
# Only run when the score itself is in play; they take a few seconds each and
# there is no reason to pay that on an art-only commit.
if git diff --cached --name-only \
     | grep -qE '^docs/assets/undertow/(.*\.wav$|build-score\.py|build-signatures\.py|mastering\.py|audio/)'; then
  echo ""
  echo "  UNDERTOW score delivery gate…"
  for v in verify_mastering verify_signatures verify_translation verify_acoustics verify_lipsync; do
    if ! python3 "$REPO_ROOT/docs/assets/undertow/qc/$v.py"; then
      cat <<MSG

  ────────────────────────────────────────────────────────────────
  COMMIT BLOCKED — $v failed.

  The score package must deliver 24-bit stereo at -16 LUFS with true peak
  under -1.0 dBTP, the signature kit must still demonstrate its design
  (the Fathom ladder audibly a ladder, the dive reflex actually slowing),
  the ANSWER must still survive a phone speaker, the house acoustic must
  still put every sound in the same water, and the lip-sync instrument must
  still find a five-frame defect planted on purpose.

  That last one is not a formality. An uncalibrated sync detector clears
  everything, which looks exactly like success.

  Full rules: docs/UNDERTOW-SCORE.md and docs/UNDERTOW-SOUND-BIBLE.md
  ────────────────────────────────────────────────────────────────

MSG
      exit 1
    fi
  done
fi

exit 0
