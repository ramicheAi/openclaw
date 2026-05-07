---
name: session-end-log
description: "Append session summary to daily memory log on /new command"
homepage: https://docs.openclaw.ai/hooks#session-end-log
metadata:
  {
    "openclaw":
      {
        "emoji": "📝",
        "events": ["command:new"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Session End Log Hook

Automatically appends a concise LLM-generated session summary to the daily memory log (`memory/YYYY-MM-DD.md`) when `/new` is issued.

## What It Does

When you run `/new` to start a fresh session:

1. **Reads the ending session** — Extracts recent user/assistant messages from the transcript
2. **Generates summary via LLM** — Asks a fast model for a 2-4 line summary of what happened
3. **Appends to daily log** — Writes the summary to `<workspace>/memory/YYYY-MM-DD.md`
4. **Creates file if missing** — First session of the day creates the daily log with a header

## Output Format

Each entry appended to the daily log:

```markdown
## 14:30 — mettle-onboarding-flow
- Implemented athlete signup flow with validation
- Fixed SSR hydration mismatch on dashboard
- Next: add coach invitation emails
```

## Configuration

| Option     | Type   | Default | Description                                                     |
| ---------- | ------ | ------- | --------------------------------------------------------------- |
| `messages` | number | 20      | Number of messages to read for summary generation               |

Example:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "session-end-log": {
          "enabled": true,
          "messages": 30
        }
      }
    }
  }
}
```

## Disabling

```bash
openclaw hooks disable session-end-log
```
