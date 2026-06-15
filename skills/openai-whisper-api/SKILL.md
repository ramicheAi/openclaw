---
name: openai-whisper-api
description: Transcribe audio via OpenAI Audio Transcriptions API (Whisper). Costs money — the OpenAI transcription API bills per minute of audio (the local openai-whisper skill is the free alternative).
homepage: https://platform.openai.com/docs/guides/speech-to-text
metadata: {"openclaw":{"emoji":"☁️","requires":{"bins":["curl"],"env":["OPENAI_API_KEY"]},"primaryEnv":"OPENAI_API_KEY"}}
---

# OpenAI Whisper API (curl)

> **💸 Costs money — paid OpenAI API, billed per minute of audio.** When to use: a one-off, or when local Whisper isn't viable. When NOT to use: for bulk or repeated transcription prefer the free local `openai-whisper` skill. GOOD: transcribe the single clip the user sent. BAD: batch-sending hours of audio to the paid API when local would do.

Transcribe an audio file via OpenAI’s `/v1/audio/transcriptions` endpoint.

## Quick start

```bash
{baseDir}/scripts/transcribe.sh /path/to/audio.m4a
```

Defaults:
- Model: `whisper-1`
- Output: `<input>.txt`

## Useful flags

```bash
{baseDir}/scripts/transcribe.sh /path/to/audio.ogg --model whisper-1 --out /tmp/transcript.txt
{baseDir}/scripts/transcribe.sh /path/to/audio.m4a --language en
{baseDir}/scripts/transcribe.sh /path/to/audio.m4a --prompt "Speaker names: Peter, Daniel"
{baseDir}/scripts/transcribe.sh /path/to/audio.m4a --json --out /tmp/transcript.json
```

## API key

Set `OPENAI_API_KEY`, or configure it in `~/.openclaw/openclaw.json`:

```json5
{
  skills: {
    "openai-whisper-api": {
      apiKey: "OPENAI_KEY_HERE"
    }
  }
}
```
