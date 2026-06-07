import type { Hono } from "hono";
import type { DB } from "../db.js";
import { checkConflicts } from "../conflicts.js";

export function registerConflictRoutes(app: Hono, db: DB) {
  // Pre-engagement conflicts check. POST with { names: ["...", "..."],
  // excludeMatterId?: "..." } returns hits across every other matter.
  app.post("/api/conflicts/check", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { names?: unknown; excludeMatterId?: unknown };
    if (!Array.isArray(body.names)) {
      return c.json({ error: "invalid_names", hint: "names must be a string array" }, 400);
    }
    const names = (body.names as unknown[]).filter((n): n is string => typeof n === "string");
    const hits = checkConflicts(db, names, {
      excludeMatterId: typeof body.excludeMatterId === "string" ? body.excludeMatterId : undefined,
    });
    return c.json({ checked: names.length, hits });
  });
}
