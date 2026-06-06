import type { Hono } from "hono";
import type { DB } from "../db.js";
import {
  createDocument,
  createMatter,
  getMatter,
  listAudit,
  listMatters,
  matterExists,
  verifyAuditChain,
  audit,
} from "../repo.js";
import { getCurrentModel, getLastLLMError, isLLMReady, probeLLM } from "../llm.js";
import { defaultBatesPrefix, proposeMetadata } from "../metadata.js";
import { analyzeMatter } from "../analyze.js";
import { isClaudeCodeProvider, probeClaudeCode } from "../claude-code.js";
import { formatTranscript, isAssemblyAIReady, startTranscript, uploadMedia, waitForTranscript, type TranscriptUtterance } from "../assemblyai.js";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { Readable } from "node:stream";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
function actor(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header("x-themis-actor") ?? "anon";
}

export function registerMatterRoutes(app: Hono, db: DB) {
  app.get("/api/matters", (c) => c.json({ matters: listMatters(db) }));

  // Transparent engine status — the user (and any third party reading via
  // the audit trail) can confirm whether Themis is running Claude or the
  // deterministic fallback. The audit log records the engine on every chat
  // turn; this endpoint just surfaces the current readiness state up-front.
  app.get("/api/engine", (c) => {
    const useCLI = isClaudeCodeProvider();
    const ready = useCLI || isLLMReady();
    return c.json({
      llm: ready,
      engine: ready ? "llm" : "deterministic",
      provider: useCLI ? "claude-code" : isLLMReady() ? "api" : null,
      model: useCLI ? "claude (via CLI / Max plan)" : isLLMReady() ? getCurrentModel() : null,
      // Most recent LLM error, if any. Lets the engine pill tooltip explain
      // why answers are falling back to deterministic without forcing the
      // operator to dig through server logs.
      lastError: getLastLLMError(),
    });
  });

  // One-shot health check — does the API key + model name actually work?
  // Returns the precise error message on failure (e.g. invalid model,
  // 401 auth, 429 rate limit).
  app.get("/api/engine/test", async (c) => {
    // Route to whichever provider is configured so the operator gets a
    // clean yes/no on the same engine they'll use for chat / analyze.
    if (isClaudeCodeProvider()) {
      return c.json({ provider: "claude-code", ...(await probeClaudeCode()) });
    }
    return c.json({ provider: "api", ...(await probeLLM()) });
  });

  app.get("/api/matters/:id", (c) => {
    const matter = getMatter(db, c.req.param("id"));
    if (!matter) return c.json({ error: "matter_not_found" }, 404);
    return c.json(matter);
  });

  app.get("/api/matters/:id/audit", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const limit = Number(c.req.query("limit") ?? 50);
    return c.json({ entries: listAudit(db, id, Number.isFinite(limit) ? limit : 50) });
  });

  // Tamper-evidence: walk the hash chain and report integrity.
  app.get("/api/matters/:id/audit/verify", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json(verifyAuditChain(db, id));
  });

  // Create a new matter. Operator picks the id (slugged) so the route
  // stays predictable and stable across page reloads.
  app.post("/api/matters", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      client?: string;
      matterType?: string;
      leadAttorney?: string;
      posture?: string;
    };
    if (!body.name?.trim() || !body.client?.trim()) {
      return c.json({ error: "name_and_client_required" }, 400);
    }
    const id = slug(`${body.name}-${body.client}`);
    if (matterExists(db, id)) return c.json({ error: "matter_already_exists", id }, 409);
    createMatter(db, {
      id,
      name: body.name.trim(),
      client: body.client.trim(),
      matterType: body.matterType?.trim() || "Litigation — General",
      leadAttorney: body.leadAttorney?.trim() || "—",
      posture: body.posture?.trim(),
    });
    audit(db, id, actor(c), "matter.create", `${body.name} · ${body.client}`);
    const matter = getMatter(db, id);
    return c.json({ matter, id }, 201);
  });

  // Suggest the next Bates id for a matter. The operator picks (or accepts)
  // the prefix; the server returns prefix + zero-padded next number based on
  // the highest existing Bates with that prefix.
  app.get("/api/matters/:id/next-bates", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const matter = getMatter(db, id);
    const prefix = (c.req.query("prefix") || defaultBatesPrefix(matter?.name ?? id)).toUpperCase();
    const docs = (await import("../repo.js")).listDocuments(db, id);
    const re = new RegExp(`^${prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}-(\\d+)$`);
    let max = 0;
    for (const d of docs) {
      const m = d.bates.match(re);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const next = max + 1;
    return c.json({ prefix, next: `${prefix}-${String(next).padStart(6, "0")}`, count: docs.length });
  });

  // Extract suggested metadata (title, type, date, author, recipients,
  // summary) from a document's text body + filename. Pure regex/heuristics
  // server-side so the operator-side AddDocumentModal can auto-fill before
  // saving, no LLM call required.
  app.post("/api/extract-metadata", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: string; filename?: string };
    if (typeof body.text !== "string" || body.text.length === 0) {
      return c.json({ error: "text_required" }, 400);
    }
    return c.json(proposeMetadata(body.text, body.filename ?? ""));
  });

  // Transcribe an uploaded video / audio file via AssemblyAI and store the
  // result as a new document in the matter. Multipart upload — the operator
  // drops a video, the backend uploads it to AssemblyAI, polls for the
  // result, formats the diarized transcript with [HH:MM:SS] timestamps + a
  // SPEAKER A/B prefix per utterance, and persists as a doc whose body is
  // grounded just like any other source.
  //
  // The original media file is saved to ~/.themis/media/<matter>/<docId>.<ext>
  // so the player surface can scrub to citation timestamps. Speaker labels
  // can be renamed after the fact via PATCH /documents/:docId/speakers.
  app.post("/api/matters/:id/transcribe", async (c) => {
    const matterId = c.req.param("id");
    if (!matterExists(db, matterId)) return c.json({ error: "matter_not_found" }, 404);
    if (!isAssemblyAIReady()) {
      return c.json(
        {
          error: "assemblyai_not_configured",
          hint: "Add ASSEMBLYAI_API_KEY=… to ~/.themis-env then restart. Sign up at https://www.assemblyai.com — free tier covers light testing.",
        },
        503,
      );
    }
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "file_required" }, 400);
    const bates = String(form.get("bates") ?? "").trim();
    const title = String(form.get("title") ?? file.name).trim();
    const type = String(form.get("type") ?? "Deposition").trim();
    const date = String(form.get("date") ?? new Date().toISOString().slice(0, 10)).trim();
    if (!bates) return c.json({ error: "bates_required" }, 400);

    // 1) Persist the original media for later playback.
    const mediaDir = join(homedir(), ".themis", "media", matterId);
    await mkdir(mediaDir, { recursive: true });
    const ext = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? "bin";

    // 2) Upload to AssemblyAI + transcribe with speaker labels. Catch every
    // upstream error and surface it so the operator can see whether the
    // key is bad, the file's too short, the model rejected the audio, etc.
    const buf = await file.arrayBuffer();
    let result;
    try {
      const uploadUrl = await uploadMedia(buf);
      const transcriptId = await startTranscript(uploadUrl);
      result = await waitForTranscript(transcriptId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[transcribe] AssemblyAI error:", message);
      return c.json({ error: "transcription_upstream_failed", message }, 502);
    }
    if (result.status !== "completed" || !result.utterances) {
      return c.json({ error: "transcription_failed", detail: result.error ?? "no utterances" }, 502);
    }

    // 3) Build the body (timestamped + speaker labeled) and the speaker map.
    const body = formatTranscript(result.utterances);
    const speakerLabels = [...new Set(result.utterances.map((u) => u.speaker))];
    const speakers = Object.fromEntries(speakerLabels.map((s) => [s, `Speaker ${s}`])) as Record<string, string>;

    // 4) Create the doc row + save speaker map + save the file on disk under
    //    the doc id so the player can find it.
    const doc = (await import("../repo.js")).createDocument(db, matterId, {
      bates,
      title,
      type,
      date,
      author: speakerLabels.map((s) => `Speaker ${s}`).join(", "),
      recipients: [],
      summary: result.text.slice(0, 240),
      body,
      pages: Math.max(1, Math.ceil(body.length / 2400)),
    });
    // Persist media + speaker map keyed on the new doc id.
    await writeFile(join(mediaDir, `${doc.id}.${ext}`), Buffer.from(buf));
    await writeFile(
      join(mediaDir, `${doc.id}.speakers.json`),
      JSON.stringify({ speakers, utterances: result.utterances }, null, 2),
    );
    audit(db, matterId, actor(c), "transcribe.complete", `${doc.bates} · ${title} · ${result.durationSec ?? "?"}s`);
    return c.json(
      {
        doc,
        durationSec: result.durationSec,
        speakers,
        utteranceCount: result.utterances.length,
      },
      201,
    );
  });

  // Rename speakers on a transcribed doc. Operator says "Speaker A is
  // Roberto Mata"; we rewrite the body so every "[HH:MM:SS]  SPEAKER A:"
  // line becomes "[HH:MM:SS]  ROBERTO MATA:". Citations stay valid because
  // the timestamps are unchanged.
  app.patch("/api/matters/:id/documents/:docId/speakers", async (c) => {
    const matterId = c.req.param("id");
    const docId = c.req.param("docId");
    if (!matterExists(db, matterId)) return c.json({ error: "matter_not_found" }, 404);
    const repo = await import("../repo.js");
    const doc = repo.getDocumentById?.(db, matterId, docId);
    if (!doc) return c.json({ error: "doc_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { speakers?: Record<string, string> };
    if (!body.speakers || typeof body.speakers !== "object") {
      return c.json({ error: "speakers_required" }, 400);
    }
    const mediaDir = join(homedir(), ".themis", "media", matterId);
    const mapPath = join(mediaDir, `${docId}.speakers.json`);
    let payload: { speakers: Record<string, string>; utterances: TranscriptUtterance[] };
    try {
      payload = JSON.parse(await (await import("node:fs/promises")).readFile(mapPath, "utf8"));
    } catch {
      return c.json({ error: "speaker_map_not_found" }, 404);
    }
    payload.speakers = { ...payload.speakers, ...body.speakers };
    await writeFile(mapPath, JSON.stringify(payload, null, 2));
    // Rewrite the doc body so the new speaker names show up in chat
    // citations + binder + exports. Citation timestamps stay valid.
    const newBody = formatTranscript(payload.utterances, payload.speakers);
    repo.updateDocumentBody?.(db, matterId, docId, newBody);
    audit(db, matterId, actor(c), "transcribe.rename-speakers", `${doc.bates} · ${Object.keys(body.speakers).join(",")}`);
    return c.json({ ok: true, speakers: payload.speakers });
  });

  // Run the LLM analyzer over a matter's corpus: extract entities, events,
  // case theory, hot docs, gaps. Persists everything into the existing
  // tables so the UI lights up on the next refetch (chronology, mini brain,
  // scales, cast, gaps). Idempotent — repeated runs only add new findings.
  app.post("/api/matters/:id/analyze", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const result = await analyzeMatter(db, id);
    if (!result.ok) return c.json({ error: "analyze_failed", message: result.error }, 502);
    audit(
      db,
      id,
      actor(c),
      "matter.analyze",
      `entities ${result.entities} · events ${result.events} · hot ${result.hot} · gaps ${result.gaps}`,
    );
    return c.json(result);
  });

  // Persist the original binary for a document under
  // ~/.themis/media/<matter>/<docId>.<ext>. Looked up by Bates id so the
  // upload modal can call this right after the doc-create POST without
  // needing the new doc id round-trip.
  app.put("/api/matters/:id/documents/by-bates/:bates/media", async (c) => {
    const id = c.req.param("id");
    const bates = c.req.param("bates");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const repo = await import("../repo.js");
    const doc = repo.getDocumentByBates?.(db, id, bates);
    if (!doc) return c.json({ error: "doc_not_found" }, 404);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "file_required" }, 400);
    const dir = join(homedir(), ".themis", "media", id);
    await mkdir(dir, { recursive: true });
    const ext = file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? "bin";
    const buf = await file.arrayBuffer();
    await writeFile(join(dir, `${doc.id}.${ext}`), Buffer.from(buf));
    audit(db, id, actor(c), "doc.media.persist", `${doc.bates} · ${file.name}`);
    return c.json({ ok: true, ext, size: buf.byteLength });
  });

  // Update a document's body. Used by the client-side OCR flow: after the
  // operator runs Tesseract on a scanned PDF, the extracted text comes
  // back here. Idempotent and audited.
  app.patch("/api/matters/:id/documents/:docId/body", async (c) => {
    const id = c.req.param("id");
    const docId = c.req.param("docId");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const repo = await import("../repo.js");
    const doc = repo.getDocumentById?.(db, id, docId);
    if (!doc) return c.json({ error: "doc_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { body?: string; signal?: string };
    if (typeof body.body !== "string") {
      return c.json({ error: "body_required" }, 400);
    }
    repo.updateDocumentBody?.(db, id, docId, body.body);
    audit(db, id, actor(c), "doc.body.update", `${doc.bates} · ${body.signal ?? "manual"} · ${body.body.length} chars`);
    return c.json({ ok: true, length: body.body.length });
  });

  // Stream the persisted media file for a transcript document — the video
  // player on the doc viewer fetches this URL to scrub against citation
  // timestamps. Looks up ~/.themis/media/<matter>/<docId>.<any-ext>.
  app.get("/api/matters/:id/documents/:docId/media", async (c) => {
    const id = c.req.param("id");
    const docId = c.req.param("docId");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const dir = join(homedir(), ".themis", "media", id);
    if (!existsSync(dir)) return c.json({ error: "no_media" }, 404);
    // Find the file matching <docId>.<ext> (we don't know the extension).
    const match = readdirSync(dir).find((f) => f.startsWith(`${docId}.`) && !f.endsWith(".speakers.json"));
    if (!match) return c.json({ error: "media_not_found" }, 404);
    const path = join(dir, match);
    const s = await stat(path);
    const ext = match.split(".").pop()?.toLowerCase() ?? "bin";
    const contentType =
      ext === "mp4" ? "video/mp4" :
      ext === "mov" ? "video/quicktime" :
      ext === "webm" ? "video/webm" :
      ext === "m4v" ? "video/mp4" :
      ext === "mp3" ? "audio/mpeg" :
      ext === "m4a" ? "audio/mp4" :
      ext === "wav" ? "audio/wav" :
      ext === "pdf" ? "application/pdf" :
      "application/octet-stream";
    // Handle HTTP Range requests so the browser can seek inside the video
    // without downloading the whole file first — required for click-to-scrub.
    const range = c.req.header("range");
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : Math.min(start + 1024 * 1024, s.size - 1);
        const stream = createReadStream(path, { start, end });
        const web = Readable.toWeb(stream) as unknown as ReadableStream;
        return new Response(web, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${s.size}`,
            "Accept-Ranges": "bytes",
          },
        });
      }
    }
    const stream = createReadStream(path);
    const web = Readable.toWeb(stream) as unknown as ReadableStream;
    return new Response(web, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(s.size),
        "Accept-Ranges": "bytes",
      },
    });
  });

  // Add a document to an existing matter. Operator pastes / uploads body
  // text + minimal metadata; the matter's docs / pages totals recompute.
  app.post("/api/matters/:id/documents", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      bates?: string;
      title?: string;
      type?: string;
      date?: string;
      author?: string;
      recipients?: string[];
      summary?: string;
      body?: string;
      entities?: string[];
      pages?: number;
    };
    // Bates + title required; body can be empty (image-only PDFs save as
    // a record even when extractText returned a placeholder).
    if (!body.bates?.trim() || !body.title?.trim()) {
      return c.json({ error: "bates_and_title_required" }, 400);
    }
    try {
      const docBody = (body.body ?? "").length > 0
        ? body.body!
        : `[No text — saved as a record. OCR / paste body to enable grounded answers.]`;
      const doc = createDocument(db, id, {
        bates: body.bates.trim(),
        title: body.title.trim(),
        type: body.type?.trim() || "Document",
        date: body.date?.trim() || new Date().toISOString().slice(0, 10),
        author: body.author?.trim() || "—",
        recipients: body.recipients ?? [],
        summary: body.summary?.trim() || docBody.slice(0, 240),
        body: docBody,
        entities: body.entities,
        pages: body.pages,
      });
      audit(db, id, actor(c), "doc.create", `${doc.bates} · ${doc.title}`);
      return c.json(doc, 201);
    } catch (err) {
      // Surface the real SQLite / system error so the operator sees what's
      // wrong instead of an opaque 500. Map UNIQUE constraint to a clear
      // 'bates_already_exists' code that the modal can handle (auto-bump
      // the Bates and retry).
      const message = err instanceof Error ? err.message : String(err);
      console.error("[doc.create] failed:", message);
      if (/UNIQUE constraint failed/i.test(message)) {
        return c.json(
          {
            error: "bates_already_exists",
            bates: body.bates,
            message: `Bates ${body.bates} is already used in this matter. Pick a different prefix or bump the number.`,
          },
          409,
        );
      }
      return c.json({ error: "doc_create_failed", message }, 500);
    }
  });
}
