// Deadline routes — list, extract-from-order, toggle done, delete.
import { authedActor } from "./auth.js";

import type { Context, Hono } from "hono";
import type { DB } from "../db.js";
import { audit, matterExists } from "../repo.js";
import {
  deleteDeadline,
  insertDeadlines,
  listDeadlines,
  parseDeadlines,
  setDeadlineDone,
} from "../deadlines.js";

function actor(c: Context): string {
  return authedActor(c);
}

export function registerDeadlineRoutes(app: Hono, db: DB) {
  app.get("/api/matters/:id/deadlines", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ deadlines: listDeadlines(db, id) });
  });

  // Extract deadlines from pasted order text, persist, return the new rows.
  app.post("/api/matters/:id/deadlines/extract", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown; source?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return c.json({ error: "invalid_text", hint: "paste the order text" }, 400);
    }
    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : "Scheduling Order";
    const result = await parseDeadlines(body.text);
    if (!result.ok) return c.json({ error: "extract_failed", message: result.error }, 502);
    const rows = insertDeadlines(db, id, result.deadlines, source);
    audit(db, id, actor(c), "deadlines.extract", `${rows.length} deadline(s) from ${source}`);
    return c.json({ deadlines: rows, added: rows.length });
  });

  app.patch("/api/matters/:id/deadlines/:dlId", async (c) => {
    const id = c.req.param("id");
    const dlId = c.req.param("dlId");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { done?: unknown };
    if (typeof body.done !== "boolean") return c.json({ error: "invalid_done" }, 400);
    const updated = setDeadlineDone(db, id, dlId, body.done);
    if (!updated) return c.json({ error: "deadline_not_found" }, 404);
    audit(db, id, actor(c), body.done ? "deadlines.complete" : "deadlines.reopen", `${updated.title} (${updated.dueDate || "no date"})`);
    return c.json(updated);
  });

  app.delete("/api/matters/:id/deadlines/:dlId", (c) => {
    const id = c.req.param("id");
    const dlId = c.req.param("dlId");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    if (!deleteDeadline(db, id, dlId)) return c.json({ error: "deadline_not_found" }, 404);
    audit(db, id, actor(c), "deadlines.delete", dlId);
    return c.json({ ok: true });
  });
}
