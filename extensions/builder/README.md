# Builder (Claude Code + Design)

Lets OpenClaw **fleet agents** dispatch autonomous **coding** and **design** tasks to a
tool-enabled Claude Code instance — for internal design/dev work, never exposed to clients.

## How it works

```
Fleet agent (NOVA / SHURI / VEE / …)
      │  calls the `dev` or `design` tool
      ▼
Builder extension  ──POST /v1/chat/completions──▶  Claude Max proxy (:3456)
                                                        │ wraps the Claude Code CLI
                                                        ▼  --dangerously-skip-permissions
                                                   Claude Code (file + bash tools)
                                                        │ edits files / runs commands
                                                        ▼
                                                   Target project directory
```

The extension does **not** spawn its own `claude` process and does **not** need an API key.
It reuses the already-running Claude Max proxy that the fleet already authenticates through,
steering Claude Code with **absolute paths** under the requested `workingDir`. This is the
most reliable integration on this machine: the auth and tool-execution path is the same one
the fleet already runs on, proven in production.

## Tools

### `dev`
Implement features, fix bugs, refactor, scaffold.

| param | required | description |
|---|---|---|
| `task` | yes | What to build/change, with acceptance criteria. |
| `workingDir` | yes | **Absolute** path to the target project. Claude Code operates only here. |
| `model` | no | Alias override: `claude-opus-4-6` (hard), `claude-sonnet-4-5` (default), `claude-haiku-4-5` (trivial). |
| `timeoutMs` | no | Per-task timeout. Default 600000 (10m). |

### `design`
UI/visual work — HTML/CSS/SVG components, landing pages, layout/styling, design tokens.
Same parameters; uses `designModel` if configured.

Both return the assistant's summary of exactly what changed, plus
`details: { tool, model, workingDir }`.

## Safety

The underlying CLI runs with `--dangerously-skip-permissions`, so **set `allowedRoots`**.
Any `workingDir` outside every configured root is rejected (boundary-safe: `/safe-other`
does not count as inside `/safe`). With no `allowedRoots`, any absolute path is permitted —
only do that on a fully trusted, isolated host.

## Enable it

In `~/.openclaw/openclaw.json`, add `builder` to `plugins.allow` and an entry:

```json
{
  "plugins": {
    "allow": ["…existing…", "builder"],
    "entries": {
      "builder": {
        "enabled": true,
        "config": {
          "allowedRoots": ["/Users/admin"],
          "defaultModel": "claude-sonnet-4-5",
          "timeoutMs": 600000
        }
      }
    }
  }
}
```

### Config

| key | default | description |
|---|---|---|
| `proxyUrl` | `http://127.0.0.1:3456/v1/chat/completions` | Claude Max proxy endpoint. |
| `defaultModel` | `claude-sonnet-4-5` | Default model for `dev`. |
| `designModel` | falls back to `defaultModel` | Default model for `design`. |
| `timeoutMs` | `600000` | Default per-task timeout. |
| `allowedRoots` | _(none)_ | Allowlisted absolute path prefixes. **Strongly recommended.** |

## Notes

- The proxy is shared with the fleet's normal LLM traffic; long builds occupy it for the
  duration. For heavy parallel build load, run a second proxy instance on another port and
  point `proxyUrl` at it.
- Requires the Claude Max proxy to be running (`claude-max-api` LaunchAgent). If it's down,
  both tools fail fast with a clear HTTP error — they're registered `optional`, so a fleet
  without the proxy degrades gracefully.
