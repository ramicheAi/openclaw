import type { Context, Hono } from "hono";
import type { DB } from "../db.js";
import {
  addBinderItem,
  audit,
  createBinder,
  deleteBinder,
  getBinder,
  listBinders,
  matterExists,
  removeBinderItem,
  renameBinder,
  renameBinderItem,
  reorderBinder,
} from "../repo.js";

function actor(c: Context): string {
  return c.req.header("x-themis-actor") || "you";
}

export function registerBinderRoutes(app: Hono, db: DB) {
  app.get("/api/matters/:id/binders", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ binders: listBinders(db, id) });
  });

  app.post("/api/matters/:id/binders", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return c.json({ error: "invalid_name" }, 400);
    }
    const binder = createBinder(db, id, body.name.trim(), actor(c));
    audit(db, id, actor(c), "binder.create", binder.name);
    return c.json(binder);
  });

  app.get("/api/matters/:id/binders/:binderId", (c) => {
    const binder = getBinder(db, c.req.param("id"), c.req.param("binderId"));
    if (!binder) return c.json({ error: "binder_not_found" }, 404);
    return c.json(binder);
  });

  app.patch("/api/matters/:id/binders/:binderId", async (c) => {
    const matterId = c.req.param("id");
    const binderId = c.req.param("binderId");
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; order?: unknown };

    if (typeof body.name === "string" && body.name.trim().length > 0) {
      const updated = renameBinder(db, matterId, binderId, body.name.trim());
      if (!updated) return c.json({ error: "binder_not_found" }, 404);
      audit(db, matterId, actor(c), "binder.rename", `${binderId} → ${updated.name}`);
      return c.json(updated);
    }
    if (Array.isArray(body.order) && body.order.every((x) => typeof x === "string")) {
      const updated = reorderBinder(db, matterId, binderId, body.order as string[]);
      if (!updated) return c.json({ error: "binder_not_found" }, 404);
      audit(db, matterId, actor(c), "binder.reorder", `${updated.items.length} items`);
      return c.json(updated);
    }
    return c.json({ error: "invalid_patch" }, 400);
  });

  app.delete("/api/matters/:id/binders/:binderId", (c) => {
    const matterId = c.req.param("id");
    const binderId = c.req.param("binderId");
    if (!deleteBinder(db, matterId, binderId)) return c.json({ error: "binder_not_found" }, 404);
    audit(db, matterId, actor(c), "binder.delete", binderId);
    return c.json({ ok: true });
  });

  app.post("/api/matters/:id/binders/:binderId/items", async (c) => {
    const matterId = c.req.param("id");
    const binderId = c.req.param("binderId");
    const body = (await c.req.json().catch(() => ({}))) as { docId?: unknown; label?: unknown };
    if (typeof body.docId !== "string") return c.json({ error: "invalid_doc" }, 400);
    const label = typeof body.label === "string" ? body.label : undefined;
    const updated = addBinderItem(db, matterId, binderId, body.docId, label);
    if (!updated) return c.json({ error: "not_found" }, 404);
    audit(db, matterId, actor(c), "binder.add_item", `${body.docId} → ${updated.name}`);
    return c.json(updated);
  });

  app.patch("/api/matters/:id/binders/:binderId/items/:itemId", async (c) => {
    const matterId = c.req.param("id");
    const binderId = c.req.param("binderId");
    const itemId = c.req.param("itemId");
    const body = (await c.req.json().catch(() => ({}))) as { label?: unknown };
    if (typeof body.label !== "string" || body.label.length === 0) {
      return c.json({ error: "invalid_label" }, 400);
    }
    const updated = renameBinderItem(db, matterId, binderId, itemId, body.label);
    if (!updated) return c.json({ error: "not_found" }, 404);
    audit(db, matterId, actor(c), "binder.relabel", `${itemId} → "${body.label}"`);
    return c.json(updated);
  });

  app.delete("/api/matters/:id/binders/:binderId/items/:itemId", (c) => {
    const matterId = c.req.param("id");
    const binderId = c.req.param("binderId");
    const itemId = c.req.param("itemId");
    const updated = removeBinderItem(db, matterId, binderId, itemId);
    if (!updated) return c.json({ error: "not_found" }, 404);
    audit(db, matterId, actor(c), "binder.remove_item", `${itemId} from ${updated.name}`);
    return c.json(updated);
  });
}
