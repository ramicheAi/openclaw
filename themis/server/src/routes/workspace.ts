import type { Context, Hono } from "hono";
import type { DB } from "../db.js";
import {
  audit,
  listChat,
  listChronology,
  listDocuments,
  listEntities,
  listPrivilegeQueue,
  matterExists,
  setChronologyAccepted,
} from "../repo.js";
import { chatService, privilegeService } from "../services.js";

function actor(c: Context): string {
  return c.req.header("x-themis-actor") || "D. Okafor";
}

export function registerWorkspaceRoutes(app: Hono, db: DB) {
  // --- Chronology ---
  app.get("/api/matters/:id/chronology", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ events: listChronology(db, id) });
  });

  app.patch("/api/matters/:id/chronology/:eventId", async (c) => {
    const id = c.req.param("id");
    const eventId = c.req.param("eventId");
    const body = (await c.req.json().catch(() => ({}))) as { accepted?: unknown };
    if (!(body.accepted === true || body.accepted === false || body.accepted === null)) {
      return c.json({ error: "invalid_accepted", hint: "accepted must be true, false, or null" }, 400);
    }
    const updated = setChronologyAccepted(db, id, eventId, body.accepted);
    if (!updated) return c.json({ error: "event_not_found" }, 404);
    const verb = body.accepted === null ? "reset" : body.accepted ? "accept" : "reject";
    audit(db, id, actor(c), `chronology.${verb}`, `${updated.citation.bates} ${updated.date}`);
    return c.json(updated);
  });

  // --- Entities ---
  app.get("/api/matters/:id/entities", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ entities: listEntities(db, id) });
  });

  // --- Privilege ---
  app.get("/api/matters/:id/privilege", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ queue: listPrivilegeQueue(db, id) });
  });

  // Re-run the privilege heuristic over the corpus (advisory; no mutation).
  // Registered before the :docId route so the static path wins.
  app.post("/api/matters/:id/privilege/scan", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const counselTokens = [
      ...new Set(
        listEntities(db, id)
          .filter((e) => /counsel|attorney/i.test(e.role))
          .flatMap((e) => [e.name, ...e.aliases])
          .flatMap((n) => n.toLowerCase().split(/[^a-z]+/))
          .filter((t) => t.length >= 4),
      ),
    ];
    const flags = listDocuments(db, id)
      .map((d) => ({ doc: d, result: privilegeService.scan(d, counselTokens) }))
      .filter((x) => x.result.flagged)
      .map((x) => ({ id: x.doc.id, bates: x.doc.bates, title: x.doc.title, basis: x.result.basis }));
    audit(db, id, "themis", "privilege.scan", `${flags.length} potential privilege flag(s)`);
    return c.json({ flags });
  });

  app.post("/api/matters/:id/privilege/:docId", async (c) => {
    const id = c.req.param("id");
    const docId = c.req.param("docId");
    const body = (await c.req.json().catch(() => ({}))) as { decision?: unknown };
    if (body.decision !== "cleared" && body.decision !== "withheld") {
      return c.json({ error: "invalid_decision", hint: "decision must be 'cleared' or 'withheld'" }, 400);
    }
    const updated = privilegeService.decide(db, id, docId, body.decision, actor(c));
    if (!updated) return c.json({ error: "document_not_found" }, 404);
    return c.json(updated);
  });

  // --- Chat ---
  app.get("/api/matters/:id/chat", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ turns: listChat(db, id) });
  });

  app.post("/api/matters/:id/chat", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { question?: unknown };
    if (typeof body.question !== "string" || body.question.trim().length === 0) {
      return c.json({ error: "invalid_question" }, 400);
    }
    const turn = await chatService.ask(db, id, body.question.trim(), actor(c));
    return c.json(turn);
  });
}
