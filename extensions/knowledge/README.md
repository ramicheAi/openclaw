# @openclaw/knowledge

A document-RAG knowledge base for OpenClaw. Ingest **PDF, DOCX, HTML, Markdown, and plain-text**
files, then let agents retrieve over them with citations via the **`knowledge_search`** tool.

## How it works

1. You ingest files or directories into a named **collection** with `openclaw knowledge ingest`.
2. Each document is extracted to text, split into overlapping chunks, embedded with OpenAI, and
   stored in a per-collection SQLite database at `~/.openclaw/knowledge/<collection>.sqlite`
   (built-in `node:sqlite` — no extra storage dependency).
3. Agents call `knowledge_search` (read-only, available even in sandboxed sessions). It embeds the
   query, ranks chunks by cosine similarity, and returns passages prefixed with citations like
   `[source#chunkIndex] (score 0.83)`.

Re-ingesting a source replaces its previous chunks, so updates never leave stale data behind.

## Install

```bash
openclaw plugins install @openclaw/knowledge
```

Restart the gateway afterwards. Set your OpenAI key (default env var `OPENAI_API_KEY`).

## Config

Put under `plugins.entries.knowledge.config`:

```json5
{
  defaultCollection: "default",        // collection used when none is given
  embeddingModel: "text-embedding-3-small",
  chunkTokens: 400,                    // target chunk size (~4 chars/token)
  chunkOverlap: 80,                    // overlap carried between chunks
  topK: 6,                             // default number of results
  apiKeyEnv: "OPENAI_API_KEY"          // env var holding the OpenAI API key
}
```

All fields are optional; numeric values are clamped to safe ranges.

## Commands

```bash
openclaw knowledge ingest <paths...> [--collection c]   # ingest files/dirs
openclaw knowledge search "<query>" [--collection c] [--top-k n]
openclaw knowledge list                                 # collections + chunk counts
openclaw knowledge stats [collection]                   # chunk/source counts
openclaw knowledge clear [collection]                   # drop one collection, or all
```

## Agent tool

`knowledge_search({ query, collection?, topK? })` returns text passages with `[source#chunk]`
citations and the structured hits in `details`. If no API key is configured it returns a clear
message rather than failing the turn.
