---
name: add-channel
description: Add a new messaging channel to OpenClaw, or safely refactor shared channel logic, without missing a surface. Use when adding/modifying a channel (Telegram, Discord, Slack, Signal, iMessage, WhatsApp, or an extension channel) or touching routing, allowlists, pairing, command gating, or onboarding. Checklist of every surface that must stay in sync.
metadata: {"openclaw":{"emoji":"🔌","requires":{"bins":["git"]}}}
---

# add-channel — every surface a channel touches

Channels span core (`src/<channel>`) and extensions (`extensions/<channel>`). When adding a channel
or refactoring shared logic, **consider all built-in + extension channels** — a half-wired channel
ships broken. This is the checklist.

## Where channel code lives
- **Core:** `src/telegram`, `src/discord`, `src/slack`, `src/signal`, `src/imessage`,
  `src/web` (WhatsApp web), `src/channels`, `src/routing`.
- **Extensions:** `extensions/*` (e.g. `msteams`, `matrix`, `zalo`, `zalouser`, `line`,
  `mattermost`, `googlechat`, `voice-call`).
- **Docs:** `docs/channels/<channel>.md`.

## Surfaces to wire (don't skip any)
1. **Channel code** — adapter/bot, message context, media handling, send path.
2. **Routing** (`src/routing`) — inbound dispatch + reply routing.
3. **Allowlists / pairing** — `quickstartAllowFrom`, allowFrom matching (case-insensitive),
   pairing/onboarding flow.
4. **Command gating** — native commands + plugin-auth gating parity with existing channels.
5. **Onboarding / config** — selection label, blurb, aliases, order; config + status forms so the
   provider list and settings stay in sync across **macOS app, web UI, and mobile**.
6. **Status output** — `channels status` (and `--probe`) reports the new channel.
7. **Docs** — `docs/channels/<channel>.md` (generic content: no personal hostnames/paths; use
   `user@gateway-host`).
8. **Labeler** — add a `"channel: <name>"` block to `.github/labeler.yml` covering
   `src/<channel>/**`, `extensions/<channel>/**`, and `docs/channels/<channel>.md`.

## Streaming rule (hard)
Never send streaming/partial replies to external messaging surfaces (WhatsApp, Telegram, …) —
**final replies only.** Streaming/tool events may go to internal UIs / the control channel.

## Verify before done
`pnpm lint && pnpm build && pnpm test`; `openclaw channels status --probe` shows the channel. Match
an existing channel's test layout (see `src/telegram/*.test.ts`) for parity coverage.
