// Firm Library routes — CRUD over firm-scoped templates.

import type { Context, Hono } from "hono";
import { authedActor } from "./auth.js";
import type { DB } from "../db.js";
import { isAuthRequired, readSessionCookie, resolveSession } from "../auth.js";
import {
  bumpTemplateUseCount,
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
  type TemplateKind,
} from "../templates.js";

function currentEmail(c: Context, db: DB): string {
  if (!isAuthRequired()) return authedActor(c) || "operator";
  const sid = readSessionCookie(c.req.header("cookie"));
  if (!sid) return "operator";
  return resolveSession(db, sid)?.email ?? "operator";
}

const VALID_KINDS = new Set<TemplateKind>(["draft", "depo", "evidence", "demand-clause", "other"]);

export function registerTemplateRoutes(app: Hono, db: DB) {
  app.get("/api/templates", (c) => {
    const kindParam = c.req.query("kind");
    const kind = kindParam && VALID_KINDS.has(kindParam as TemplateKind) ? (kindParam as TemplateKind) : undefined;
    return c.json({ templates: listTemplates(db, currentEmail(c, db), kind) });
  });

  app.post("/api/templates", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      kind?: unknown;
      category?: unknown;
      title?: unknown;
      body?: unknown;
      tags?: unknown;
    };
    if (typeof body.kind !== "string" || !VALID_KINDS.has(body.kind as TemplateKind)) {
      return c.json({ error: "invalid_kind", hint: `kind must be one of: ${[...VALID_KINDS].join(", ")}` }, 400);
    }
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return c.json({ error: "invalid_title" }, 400);
    }
    const tpl = createTemplate(db, currentEmail(c, db), {
      kind: body.kind as TemplateKind,
      category: typeof body.category === "string" ? body.category.trim() : "",
      title: body.title.trim(),
      body: typeof body.body === "string" ? body.body : "",
      tags: typeof body.tags === "string" ? body.tags : "",
    });
    return c.json(tpl);
  });

  app.patch("/api/templates/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Parameters<typeof updateTemplate>[3] = {};
    if (typeof body.kind === "string" && VALID_KINDS.has(body.kind as TemplateKind)) patch.kind = body.kind as TemplateKind;
    if (typeof body.category === "string") patch.category = body.category;
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.body === "string") patch.body = body.body;
    if (typeof body.tags === "string") patch.tags = body.tags;
    const updated = updateTemplate(db, currentEmail(c, db), id, patch);
    if (!updated) return c.json({ error: "template_not_found" }, 404);
    return c.json(updated);
  });

  app.delete("/api/templates/:id", (c) => {
    const id = c.req.param("id");
    if (!deleteTemplate(db, currentEmail(c, db), id)) return c.json({ error: "template_not_found" }, 404);
    return c.json({ ok: true });
  });

  // Use-count bump — called when the operator clicks "Insert" / "Use" on a
  // template in the Draft Studio so the library can sort by popularity.
  app.post("/api/templates/:id/use", (c) => {
    bumpTemplateUseCount(db, currentEmail(c, db), c.req.param("id"));
    return c.json({ ok: true });
  });
}
