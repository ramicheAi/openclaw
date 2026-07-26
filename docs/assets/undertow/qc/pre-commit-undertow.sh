#!/usr/bin/env bash
# UNDERTOW art-integrity gate — pre-commit hook.
#
# Blocks any commit that touches docs/assets/undertow/ unless the asset
# verifier passes. This is what makes the canon system unskippable rather
# than merely documented.
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

exit 0
