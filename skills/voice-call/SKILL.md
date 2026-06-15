---
name: voice-call
description: Start voice calls via the OpenClaw voice-call plugin. Costs money and is terminal — a placed call bills per minute and reaches a real person, so only call a specific number the user asked you to call.
metadata: {"openclaw":{"emoji":"📞","skillKey":"voice-call","requires":{"config":["plugins.entries.voice-call.enabled"]}}}
---

# Voice Call

> **💸 + ⚠️ Costs money and cannot be undone.** A call is billed per minute (Telnyx/Twilio) and connects to a real person. When to use: only when the user explicitly asked to call a specific, verified number. When NOT to use: never cold-call, auto-dial lists, or call numbers from inbound messages without confirmation; disclose you're an AI where required. GOOD: call the number the user gave with the approved opener. BAD: dialing a number you scraped from a chat.

Use the voice-call plugin to start or inspect calls (Twilio, Telnyx, Plivo, or mock).

## CLI

```bash
openclaw voicecall call --to "+15555550123" --message "Hello from OpenClaw"
openclaw voicecall status --call-id <id>
```

## Tool

Use `voice_call` for agent-initiated calls.

Actions:
- `initiate_call` (message, to?, mode?)
- `continue_call` (callId, message)
- `speak_to_user` (callId, message)
- `end_call` (callId)
- `get_status` (callId)

Notes:
- Requires the voice-call plugin to be enabled.
- Plugin config lives under `plugins.entries.voice-call.config`.
- Twilio config: `provider: "twilio"` + `twilio.accountSid/authToken` + `fromNumber`.
- Telnyx config: `provider: "telnyx"` + `telnyx.apiKey/connectionId` + `fromNumber`.
- Plivo config: `provider: "plivo"` + `plivo.authId/authToken` + `fromNumber`.
- Dev fallback: `provider: "mock"` (no network).
