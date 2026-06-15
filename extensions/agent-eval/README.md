# @openclaw/agent-eval

An **agent/model evaluation harness** for OpenClaw. Score the outputs of an agent,
a model, or any command against **deterministic checks** and **LLM-judged rubrics**,
so a deployment can *measure* and *prove* agent quality — and catch regressions
before they ship.

## How it works

The harness is **responder-agnostic**: anything that maps a string input to a
string output can be evaluated. A run combines two scoring layers:

1. **Deterministic matchers** (pure, offline): `contains`, `notContains`, `regex`,
   `equals`.
2. **An optional LLM judge** that scores fuzzy `criteria` from 0..1.

A case **passes** when *all* its deterministic checks pass **and** (it has no
`criteria`, or the judge score ≥ the threshold). Everything that touches the
network — the responder and the judge — is injectable, so the test suite runs
without any API keys.

Reports are written to `~/.openclaw/agent-eval/<suite>-<timestamp>.json`.

## Install

```bash
openclaw plugins install @openclaw/agent-eval
```

Restart the gateway afterwards.

## Suite format

A suite is plain JSON (no YAML dependency):

```json
{
  "name": "support-bot-smoke",
  "cases": [
    {
      "id": "greets-politely",
      "input": "Say hello to a new customer.",
      "expect": {
        "contains": ["hello"],
        "notContains": ["error"],
        "criteria": "A warm, professional greeting that invites the customer to ask a question.",
        "minScore": 0.7
      },
      "tags": ["tone"]
    },
    {
      "id": "exact-ack",
      "input": "Reply with exactly: ACK",
      "expect": { "equals": "ACK" }
    },
    {
      "id": "has-order-id",
      "input": "Confirm order 12345.",
      "expect": { "regex": "order\\s+\\d+" }
    }
  ]
}
```

`expect` fields (all optional, but at least one is required):

| Field         | Meaning                                                        |
| ------------- | ------------------------------------------------------------- |
| `contains`    | every listed substring must appear in the output              |
| `notContains` | none of the listed substrings may appear                      |
| `regex`       | output must match this regular expression                     |
| `equals`      | trimmed output must exactly equal this trimmed string         |
| `criteria`    | natural-language rubric scored 0..1 by the LLM judge          |
| `minScore`    | per-case judge threshold (defaults to the suite `passThreshold`) |

## Commands

```bash
# Evaluate a shell command (input is piped to its stdin, stdout is the output)
openclaw eval run suite.json --responder command --command "openclaw agent --message -"

# Evaluate an OpenAI model directly (needs OPENAI_API_KEY)
openclaw eval run suite.json --responder openai --model gpt-4o-mini

# Skip the LLM judge (criteria-based cases will fail)
openclaw eval run suite.json --responder command --command "cat" --no-judge

# Pretty-print a saved report
openclaw eval report ~/.openclaw/agent-eval/support-bot-smoke-2026-01-29T12-00-00-000Z.json
```

`eval run` exits non-zero when any case fails, so it works as a CI gate.

## Config

Put under `plugins.entries.agent-eval.config`:

```json5
{
  judgeModel: "gpt-4o-mini",      // model the LLM judge uses
  defaultResponder: "command",    // "command" | "openai"
  model: "gpt-4o-mini",           // model for the openai responder
  apiKeyEnv: "OPENAI_API_KEY",    // env var holding the API key
  passThreshold: 0.6              // default judge pass score (0..1)
}
```

All fields are optional and fall back to the defaults shown above.
