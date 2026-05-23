import type { Hono } from "hono";
import type { DB } from "../db.js";
import { getMatter, listAudit, listMatters, matterExists } from "../repo.js";

export function registerMatterRoutes(app: Hono, db: DB) {
  app.get("/api/matters", (c) => c.json({ matters: listMatters(db) }));

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
}
