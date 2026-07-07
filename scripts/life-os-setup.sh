#!/usr/bin/env bash
# life-os-setup.sh — install the Life OS on this gateway host.
#
# Seeds workspace tracker files, installs the life-os skill, and registers
# three cron jobs (morning brief, evening check-in, weekly review) that run as
# isolated agent turns and deliver to your channel.
#
# Usage:
#   scripts/life-os-setup.sh --to <chatId> [options]
#
# Options:
#   --to <target>       Delivery target (required unless --dry-run), e.g.
#                       Telegram chat id "123456789" or "-100...:topic:12"
#   --channel <name>    Delivery channel (default: telegram)
#   --tz <iana>         Timezone for schedules (default: America/New_York)
#   --morning <cron>    Morning brief schedule   (default: "0 6 * * *")
#   --evening <cron>    Evening check-in schedule (default: "30 21 * * *")
#   --weekly <cron>     Weekly review schedule    (default: "0 18 * * 0")
#   --workspace <dir>   Agent workspace (default: ~/.openclaw/workspace)
#   --dry-run           Print what would be done without changing anything
set -euo pipefail

CHANNEL="telegram"
TO=""
TZ_NAME="America/New_York"
MORNING="0 6 * * *"
EVENING="30 21 * * *"
WEEKLY="0 18 * * 0"
WORKSPACE="${HOME}/.openclaw/workspace"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) TO="$2"; shift 2 ;;
    --channel) CHANNEL="$2"; shift 2 ;;
    --tz) TZ_NAME="$2"; shift 2 ;;
    --morning) MORNING="$2"; shift 2 ;;
    --evening) EVENING="$2"; shift 2 ;;
    --weekly) WEEKLY="$2"; shift 2 ;;
    --workspace) WORKSPACE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$TO" && "$DRY_RUN" -eq 0 ]]; then
  echo "error: --to <target> is required (where briefs get delivered)" >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_SRC="${REPO_DIR}/skills/life-os"
TEMPLATES="${SKILL_SRC}/templates"
SKILL_DST="${HOME}/.openclaw/skills/life-os"

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf 'DRY RUN:'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

echo "== Life OS setup =="
echo "workspace: ${WORKSPACE}"
echo "channel:   ${CHANNEL} -> ${TO:-<dry-run>}  tz: ${TZ_NAME}"

# 1. Seed workspace tracker files (never overwrite existing tracker data).
run mkdir -p "${WORKSPACE}/life"
for f in GOALS.md STREAKS.md BUDGET.md BIBLE.md LATER.md; do
  if [[ -e "${WORKSPACE}/life/${f}" ]]; then
    echo "keep:      life/${f} (exists)"
  else
    run cp "${TEMPLATES}/${f}" "${WORKSPACE}/life/${f}"
    echo "seed:      life/${f}"
  fi
done

# Creed + plan into the workspace so every session sees them.
for pair in "docs/CREED.md:CREED.md" "docs/THREE-YEAR-LIFE-PLAN.md:THREE-YEAR-LIFE-PLAN.md"; do
  src="${REPO_DIR}/${pair%%:*}"; dst="${WORKSPACE}/${pair##*:}"
  if [[ -f "$src" && ! -e "$dst" ]]; then
    run cp "$src" "$dst"
    echo "seed:      ${pair##*:}"
  fi
done

# 2. Install the skill where the gateway discovers managed skills.
run mkdir -p "$(dirname "${SKILL_DST}")"
run rm -rf "${SKILL_DST}"
run cp -R "${SKILL_SRC}" "${SKILL_DST}"
echo "skill:     ${SKILL_DST}"

# 3. Replace any prior life-os cron jobs, then register the three rhythms.
if [[ "$DRY_RUN" -eq 0 ]]; then
  # Match on our name prefix; ignore errors if cron list is empty.
  openclaw cron list --json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const j of JSON.parse(s).jobs??JSON.parse(s)){if((j.name||"").startsWith("life-os:"))console.log(j.id)}}catch{}})' \
    | while read -r id; do [[ -n "$id" ]] && run openclaw cron rm "$id"; done
fi

add_job() { # name schedule message
  run openclaw cron add \
    --name "$1" \
    --cron "$2" \
    --tz "${TZ_NAME}" \
    --session isolated \
    --message "$3" \
    --deliver \
    --channel "${CHANNEL}" \
    --to "${TO:-DRY-RUN-TARGET}"
}

add_job "life-os: morning brief" "${MORNING}" \
  "Use the life-os skill: run the MORNING BRIEF procedure. Read the tracker files under life/ in the workspace and CREED.md, then deliver the single brief message."

add_job "life-os: evening check-in" "${EVENING}" \
  "Use the life-os skill: run the EVENING CHECK-IN procedure. Ask the four questions in one compact message."

add_job "life-os: weekly review" "${WEEKLY}" \
  "Use the life-os skill: run the WEEKLY REVIEW procedure. Compile the scorecard from life/ trackers and this week's memory files, compare against the current quarter targets in THREE-YEAR-LIFE-PLAN.md, and propose exactly one adjustment."

echo
echo "== Done. Verify =="
echo "  openclaw cron list"
echo "  openclaw cron run <morning-brief-job-id> --force   # test the brief now"
echo
echo "Fill in the placeholders in ${WORKSPACE}/life/GOALS.md and BIBLE.md —"
echo "the brief will keep asking until the numbers are real."
