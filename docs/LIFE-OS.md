# Life OS

The operational layer for [The Three-Year Plan](/THREE-YEAR-LIFE-PLAN) —
Part 6 ("OpenClaw as your life OS") made real, using only built-in OpenClaw
primitives: gateway cron, workspace bootstrap files, workspace memory, and a
skill.

## Architecture

```
gateway cron (3 jobs)
   │  isolated agent turn, tz-aware schedule
   ▼
life-os skill (skills/life-os/SKILL.md)
   │  procedures: morning brief · evening check-in · weekly review
   ▼
workspace trackers (~/.openclaw/workspace/life/*.md)
   GOALS.md · STREAKS.md · BUDGET.md · BIBLE.md · LATER.md
   + CREED.md and THREE-YEAR-LIFE-PLAN.md injected into every session
   ▼
delivery to your channel (Telegram by default)
```

- **Morning brief** (default 6:00) — creed, today's 3 chapters, streaks, one
  money line, top-3 tasks for the engine.
- **Evening check-in** (default 21:30) — four questions: scripture, training,
  clean day, deep-work hours. Answers append to `life/STREAKS.md` and the
  daily memory log.
- **Weekly review** (Sunday 18:00) — scorecard vs. the current quarter in the
  three-year plan, plus exactly one adjustment and a pass over the `LATER.md`
  parking lot.

All state is plain Markdown in the agent workspace, so `memory_search`, the
`session-end-log` hook, and every normal session can see it.

## Setup (run on the gateway host)

```bash
scripts/life-os-setup.sh --to <chatId>
```

Options: `--channel` (default `telegram`), `--tz` (default
`America/New_York`), `--morning/--evening/--weekly` (cron expressions),
`--workspace`, `--dry-run`.

The script is idempotent: it never overwrites existing tracker files, and it
replaces (not duplicates) any previous `life-os:` cron jobs.

Then:

1. Fill in the `<<fill in>>` placeholders in `~/.openclaw/workspace/life/GOALS.md`
   and `BIBLE.md` — the brief will keep asking until the numbers are real.
2. Test: `openclaw cron list`, then `openclaw cron run <job-id> --force`.

## Adjusting later

- Change times/channel: `openclaw cron edit <jobId> ...` or re-run the setup
  script with new flags.
- Pause everything: `openclaw cron disable <jobId>` per job.
- The trackers are yours to edit by hand any time — the skill reads whatever
  is there.

## Privacy

Streaks and check-in answers are personal. Keep the delivery target your own
private chat; the skill is instructed never to surface tracker details
anywhere else.
