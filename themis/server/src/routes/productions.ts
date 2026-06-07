import type { Context, Hono } from "hono";
import type { DB } from "../db.js";
import { audit, matterExists } from "../repo.js";
import { createProduction, deleteProduction, listProductions, type ProductionDirection } from "../productions.js";

function actor(c: Context): string {
  return c.req.header("x-themis-actor") || "you";
}

export function registerProductionRoutes(app: Hono, db: DB) {
  app.get("/api/matters/:id/productions", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ productions: listProductions(db, id) });
  });

  app.post("/api/matters/:id/productions", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      direction?: unknown;
      party?: unknown;
      prodDate?: unknown;
      label?: unknown;
      batesStart?: unknown;
      batesEnd?: unknown;
      privilegeLog?: unknown;
      notes?: unknown;
    };
    if (body.direction !== "sent" && body.direction !== "received") {
      return c.json({ error: "invalid_direction", hint: "direction must be 'sent' or 'received'" }, 400);
    }
    const required: [string, unknown][] = [
      ["party", body.party],
      ["prodDate", body.prodDate],
      ["batesStart", body.batesStart],
      ["batesEnd", body.batesEnd],
    ];
    for (const [k, v] of required) {
      if (typeof v !== "string" || v.trim().length === 0) {
        return c.json({ error: "invalid_field", hint: `${k} required` }, 400);
      }
    }
    const created = createProduction(db, id, {
      direction: body.direction as ProductionDirection,
      party: (body.party as string).trim(),
      prodDate: (body.prodDate as string).trim(),
      label: typeof body.label === "string" ? body.label.trim() : "",
      batesStart: (body.batesStart as string).trim(),
      batesEnd: (body.batesEnd as string).trim(),
      privilegeLog: !!body.privilegeLog,
      notes: typeof body.notes === "string" ? body.notes : "",
    });
    audit(
      db,
      id,
      actor(c),
      `production.${created.direction}`,
      `${created.label || (created.direction === "sent" ? "to" : "from") + " " + created.party} · ${created.batesStart}-${created.batesEnd} (${created.docCount} docs)`,
    );
    return c.json(created);
  });

  app.delete("/api/matters/:id/productions/:prodId", (c) => {
    const id = c.req.param("id");
    const prodId = c.req.param("prodId");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    if (!deleteProduction(db, id, prodId)) return c.json({ error: "production_not_found" }, 404);
    audit(db, id, actor(c), "production.delete", prodId);
    return c.json({ ok: true });
  });
}
