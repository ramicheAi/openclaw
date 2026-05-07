---
name: session-handoff-boot
description: "Inject the latest pre-compaction HANDOFF block into MEMORY at agent bootstrap"
homepage: https://docs.openclaw.ai/hooks#session-handoff-boot
metadata:
  {
    "openclaw":
      {
        "emoji": "🪝",
        "events": ["agent:bootstrap"],
        "requires": { "config": ["workspace.dir"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OpenClaw" }],
      },
  }
---

# Session Handoff Boot Hook

Closes the compaction continuity gap. On every agent bootstrap, scans the most
recent daily memory log (`memory/YYYY-MM-DD.md`) for the last
`## HANDOFF — ... (pre-compaction)` block and prepends it to the in-memory
`MEMORY.md` bootstrap content so the new session starts with the exact
TASK / STATUS / FILES / NEXT it left off on.

Pairs with the `compaction-handoff` Pi extension, which writes the HANDOFF
block immediately before context is summarized.

## What It Does

1. Resolves today's daily log under `<workspace>/memory/YYYY-MM-DD.md`.
2. Falls back to the most recently modified `YYYY-MM-DD.md` if today's log doesn't exist.
3. Extracts the **last** `## HANDOFF` section.
4. Prepends it as a `## Recent HANDOFF` section to the bootstrap `MEMORY.md`
   file content (in-memory only — does not modify files on disk).
5. Skips silently if no HANDOFF block is found.

## Configuration

| Option       | Type   | Default | Description                                              |
| ------------ | ------ | ------- | -------------------------------------------------------- |
| `lookbackDays` | number | 7       | How far back to search for a HANDOFF block if today is empty |

Example:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "session-handoff-boot": {
          "enabled": true,
          "lookbackDays": 14
        }
      }
    }
  }
}
```

## Enable

```bash
openclaw hooks enable session-handoff-boot
```
