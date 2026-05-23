import type { Hono } from "hono";
import type { DB } from "../db.js";
import { getDocument, listDocuments, matterExists } from "../repo.js";
import { searchService } from "../services.js";

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
}
