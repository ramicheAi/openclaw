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

**Tools:** `social_create` (generate from a brief), `social_fanout` (one brief to every
platform), `social_draft` (queue a ready caption), `social_queue` (list pending). There is
deliberately **no** `social_approve`/`social_send` tool — approval is human-only, out of band.

## Generation routed through the brain (`generate.ts` + `social_create`)

`social_create` takes a BRIEF (topic + proof + offer + awareness level) and generates the
caption through the **conductor brain's egress-guarded model caller**, with the Pantheon
**CATALYST hook doctrine** (Proof + Promise + Plan) baked into the prompt. The locked brand
rule is enforced *during* generation: if the model emits a dash or an ellipsis it regenerates
with an escalating correction, and never silently ships a violation. The result is formatted
and queued as a gated draft like everything else. 4 tests.

## How it fits the bigger picture

```
brief -> social_create (conductor brain + CATALYST) -> format + brand-lint -> gated queue -> [human approves] -> real poster
              this release                                this release           this release    enforced          next (needs creds)
```

The generation, gate, and correctness core is done. The one remaining increment is the
downstream **real platform poster**, which needs platform API credentials and lands behind
this same human gate. Until then there is no agent-reachable send path at all.

## Approving drafts (the human gate)

Agents queue drafts; only a human opens the gate, from a terminal:

```
openclaw social list                  # drafts awaiting review
openclaw social show <id>             # read one in full
openclaw social approve <id> --by Ramon   # the ONLY way a post becomes sendable
openclaw social reject <id> --note "off-brand"
openclaw social publish <id>          # human-triggered send (dry-run by default)
```

`approve` is what sets `approvedBy`, which is what `canSend()` requires. It is deliberately
a CLI command, not an agent tool, so an agent can never approve its own drafts.

## The send layer (`poster.ts`)

`publish` calls `publishApproved`, which **re-enforces the gate at the send point** (defense
in depth, not just at approval) before dispatching to a `PlatformPoster`. The default poster
is a **dry-run** that logs the payload and never makes a network call, so the whole loop is
exercisable with zero risk. Real TikTok / Instagram / X adapters implement the same
`PlatformPoster` interface and drop in behind this same gate once credentials exist.

## Config

```json
{ "plugins": { "entries": { "social-manager": { "enabled": true } } } }
```

Drafts persist to `~/.openclaw/social/queue.json` (override with `queuePath`). Allowlist the
tools per agent: `"tools": { "allow": ["social_create", "social_fanout", "social_draft", "social_queue"] }`.
