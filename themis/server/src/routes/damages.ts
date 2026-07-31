import type { Context, Hono } from "hono";
import { authedActor } from "./auth.js";
import type { DB } from "../db.js";
import { audit, matterExists } from "../repo.js";
import {
  DAMAGES_CATEGORIES,
  createDamagesItem,
  deleteDamagesItem,
  listDamages,
  updateDamagesItem,
  type DamagesCategory,
} from "../damages.js";

function actor(c: Context): string {
  return authedActor(c);
}

function isCategory(v: unknown): v is DamagesCategory {
  return typeof v === "string" && DAMAGES_CATEGORIES.includes(v as DamagesCategory);
}

export function registerDamagesRoutes(app: Hono, db: DB) {
  app.get("/api/matters/:id/damages", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ items: listDamages(db, id) });
  });

  app.post("/api/matters/:id/damages", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!isCategory(body.category)) return c.json({ error: "invalid_category" }, 400);
    if (typeof body.description !== "string" || body.description.trim().length === 0)
      return c.json({ error: "invalid_description" }, 400);
    if (typeof body.amountCents !== "number") return c.json({ error: "invalid_amount" }, 400);
    const created = createDamagesItem(db, id, {
      category: body.category,
      description: body.description.trim(),
      amountCents: body.amountCents,
      multiplier: typeof body.multiplier === "number" ? body.multiplier : undefined,
      dateIncurred: typeof body.dateIncurred === "string" ? body.dateIncurred : undefined,
      citationBates: typeof body.citationBates === "string" ? body.citationBates : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    audit(
      db,
      id,
      actor(c),
      "damages.add",
      `${created.category} · ${created.description} · $${(created.amountCents / 100).toFixed(2)}`,
    );
    return c.json(created);
  });

  app.patch("/api/matters/:id/damages/:itemId", async (c) => {
    const id = c.req.param("id");
    const itemId = c.req.param("itemId");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (isCategory(body.category)) patch.category = body.category;
    if (typeof body.description === "string") patch.description = body.description;
    if (typeof body.amountCents === "number") patch.amountCents = body.amountCents;
    if (typeof body.multiplier === "number") patch.multiplier = body.multiplier;
    if (typeof body.dateIncurred === "string") patch.dateIncurred = body.dateIncurred;
    if (typeof body.citationBates === "string") patch.citationBates = body.citationBates;
    if (typeof body.notes === "string") patch.notes = body.notes;
    const updated = updateDamagesItem(db, id, itemId, patch as Partial<Parameters<typeof updateDamagesItem>[3]>);
    if (!updated) return c.json({ error: "item_not_found" }, 404);
    audit(db, id, actor(c), "damages.update", `${updated.description}`);
    return c.json(updated);
  });

  app.delete("/api/matters/:id/damages/:itemId", (c) => {
    const id = c.req.param("id");
    const itemId = c.req.param("itemId");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    if (!deleteDamagesItem(db, id, itemId)) return c.json({ error: "item_not_found" }, 404);
    audit(db, id, actor(c), "damages.delete", itemId);
    return c.json({ ok: true });
  });
}
