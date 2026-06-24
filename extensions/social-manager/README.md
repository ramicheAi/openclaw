# @openclaw/social-manager — the publish-to-post layer

The first "elite layer" on top of the [conductor](../conductor/README.md) orchestration
brain. It turns finished content into **platform-correct, brand-safe, human-gated** posts.
Sending is a COO hard gate, so the gate is enforced in code, not by convention.

## What this release ships (the safe + correct foundation)

- **`platform.ts` — platform-correct + brand-safe formatting.** Each post is formatted to
  the real platform spec (caption length, hashtag best-practice cap, aspect ratio) and
  **linted against the locked Parallax no-AI-syntax rule** (no em/en dashes, no ellipses).
  Copy that violates the brand rule is flagged `invalid` and never auto-fixed. 7 tests.
- **`post-queue.ts` — the hard-gated draft queue.** The COO rule "drafts auto-prepared,
  SENDING is gated to Ramon" is an enforced invariant:
  - `enqueueDraft` only ever creates status `draft` — never approved, never posted.
  - `canSend()` returns ok **only** when a human explicitly approved (`approvedBy` set).
  - There is **no auto-approve and no agent-reachable send path**. An agent can prepare,
    format, and queue all day; it physically cannot push anything live.
  - The real platform-API call is intentionally **not implemented** — so even an approved
    draft can't leak out until that integration is added deliberately, behind this gate. 7 tests.

**Tools:** `social_draft` (format + queue a draft), `social_queue` (list pending). There is
deliberately **no** `social_approve`/`social_send` tool — approval is human-only, out of band.

## How it fits the bigger picture

```
Pantheon (generate)  →  conductor_run (judge/polish the caption)  →  social_draft (format + gate)  →  [human approves]  →  post
        ▲ next increment                ▲ next increment                ✅ this release                 ✅ enforced
```

This release is the **gate + correctness** core — the load-bearing, security-critical part.
The next increments wire the upstream (route the concept/caption through `conductor_run`
and the Pantheon disciplines) and the downstream (a real platform poster), both landing
behind the same human gate.

## Config

```json
{ "plugins": { "entries": { "social-manager": { "enabled": true } } } }
```

Drafts persist to `~/.openclaw/social/queue.json` (override with `queuePath`). Allowlist the
tools per agent: `"tools": { "allow": ["social_draft", "social_queue"] }`.
