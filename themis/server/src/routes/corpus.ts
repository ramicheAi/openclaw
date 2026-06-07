import type { Context, Hono } from "hono";
import type { DB } from "../db.js";
import { audit, getDocument, listDocuments, matterExists, setDocReview } from "../repo.js";
import { searchService } from "../services.js";

function actor(c: Context): string {
  return c.req.header("x-themis-actor") || "you";
}

export function registerCorpusRoutes(app: Hono, db: DB) {
  app.get("/api/matters/:id/documents", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ documents: listDocuments(db, id) });
  });

  app.get("/api/matters/:id/documents/:docId", (c) => {
    const doc = getDocument(db, c.req.param("id"), c.req.param("docId"));
    if (!doc) return c.json({ error: "document_not_found" }, 404);
    return c.json(doc);
  });

  // Hybrid lexical search over the matter corpus (vector retrieval drops in here).
  app.get("/api/matters/:id/search", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const q = c.req.query("q") ?? "";
    const limit = Number(c.req.query("limit") ?? 10);
    const hits = searchService.search(db, id, q, { limit: Number.isFinite(limit) ? limit : 10 });
    return c.json({ query: q, hits });
  });

  // Per-document review state — Mark hot / Reviewed.
  app.patch("/api/matters/:id/documents/:docId/review", async (c) => {
    const matterId = c.req.param("id");
    const docId = c.req.param("docId");
    const body = (await c.req.json().catch(() => ({}))) as { hot?: unknown; reviewed?: unknown };
    const patch: { hot?: boolean; reviewed?: boolean } = {};
    if (typeof body.hot === "boolean") patch.hot = body.hot;
    if (typeof body.reviewed === "boolean") patch.reviewed = body.reviewed;
    if (Object.keys(patch).length === 0) return c.json({ error: "invalid_patch" }, 400);
    const updated = setDocReview(db, matterId, docId, patch, actor(c));
    if (!updated) return c.json({ error: "document_not_found" }, 404);
    const parts: string[] = [];
    if (patch.hot !== undefined) parts.push(`hot=${patch.hot}`);
    if (patch.reviewed !== undefined) parts.push(`reviewed=${patch.reviewed}`);
    audit(db, matterId, actor(c), "doc.review", `${updated.bates} ${parts.join(" ")}`);
    return c.json(updated);
  });
}
