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
  app.get("/api/engine", (c) =>
    c.json({
      llm: isLLMReady(),
      engine: isLLMReady() ? "llm" : "deterministic",
      model: isLLMReady() ? getCurrentModel() : null,
      // Most recent LLM error, if any. Lets the engine pill tooltip explain
      // why answers are falling back to deterministic without forcing the
      // operator to dig through server logs.
      lastError: getLastLLMError(),
    }),
  );

  // One-shot health check — does the API key + model name actually work?
  // Returns the precise error message on failure (e.g. invalid model,
  // 401 auth, 429 rate limit).
  app.get("/api/engine/test", async (c) => c.json(await probeLLM()));

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
    if (!body.bates?.trim() || !body.title?.trim() || !body.body?.trim()) {
      return c.json({ error: "bates_title_body_required" }, 400);
    }
    const doc = createDocument(db, id, {
      bates: body.bates.trim(),
      title: body.title.trim(),
      type: body.type?.trim() || "Document",
      date: body.date?.trim() || new Date().toISOString().slice(0, 10),
      author: body.author?.trim() || "—",
      recipients: body.recipients ?? [],
      summary: body.summary?.trim() || body.body.slice(0, 240),
      body: body.body,
      entities: body.entities,
      pages: body.pages,
    });
    audit(db, id, actor(c), "doc.create", `${doc.bates} · ${doc.title}`);
    return c.json(doc, 201);
  });
}
