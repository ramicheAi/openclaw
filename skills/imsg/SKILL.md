---
name: imsg
description: iMessage/SMS CLI for listing chats, history, watch, and sending. Sending texts a real person and cannot be unsent — send only what the user asked, to the handle they named; listing and history are safe.
homepage: https://imsg.to
metadata: {"openclaw":{"emoji":"📨","os":["darwin"],"requires":{"bins":["imsg"]},"install":[{"id":"brew","kind":"brew","formula":"steipete/tap/imsg","bins":["imsg"],"label":"Install imsg (brew)"}]}}
---

# imsg

> **⚠️ Terminal action — sending texts a real person and cannot be unsent.** When to use: send a message the user asked for, to a number/handle they specified. When NOT to use: don't text people the user didn't name, or send drafts. GOOD: text "running 10 min late" to the contact the user named. BAD: auto-replying to an unknown number or blasting a list.

Use `imsg` to read and send Messages.app iMessage/SMS on macOS.

Requirements
- Messages.app signed in
- Full Disk Access for your terminal
- Automation permission to control Messages.app (for sending)

Common commands
- List chats: `imsg chats --limit 10 --json`
- History: `imsg history --chat-id 1 --limit 20 --attachments --json`
- Watch: `imsg watch --chat-id 1 --attachments`
- Send: `imsg send --to "+14155551212" --text "hi" --file /path/pic.jpg`

Notes
- `--service imessage|sms|auto` controls delivery.
- Confirm recipient + message before sending.
