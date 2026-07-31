// Drafting routes — list kinds, generate a draft.
import { authedActor } from "./auth.js";

import type { Context, Hono } from "hono";
import type { DB } from "../db.js";
import { audit, matterExists } from "../repo.js";
import { generateDraft, listDraftKinds, type DraftKind } from "../drafting.js";

function actor(c: Context): string {
  return authedActor(c);
}

const VALID_KINDS = new Set(listDraftKinds().map((k) => k.id));

export function registerDraftRoutes(app: Hono, db: DB) {
  app.get("/api/draft-kinds", (c) => c.json({ kinds: listDraftKinds() }));

  app.post("/api/matters/:id/drafts", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      kind?: unknown;
      eventBates?: unknown;
      addressee?: unknown;
      demandAmount?: unknown;
      instructions?: unknown;
    };
    if (typeof body.kind !== "string" || !VALID_KINDS.has(body.kind as DraftKind)) {
      return c.json({ error: "invalid_kind", hint: `kind must be one of: ${[...VALID_KINDS].join(", ")}` }, 400);
    }
    try {
      const result = await generateDraft(db, id, {
        kind: body.kind as DraftKind,
        eventBates: Array.isArray(body.eventBates) ? (body.eventBates as string[]).filter((s) => typeof s === "string") : undefined,
        addressee: typeof body.addressee === "string" ? body.addressee : undefined,
        demandAmount: typeof body.demandAmount === "string" ? body.demandAmount : undefined,
        instructions: typeof body.instructions === "string" ? body.instructions : undefined,
      });
      if (!result.ok) return c.json({ error: "draft_failed", message: result.error }, 502);
      audit(db, id, actor(c), "draft.generate", `${result.kind} (${result.draft.length} chars)`);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[draft] route error:", message);
      return c.json({ error: "draft_route_failed", message }, 500);
    }
  });
}
