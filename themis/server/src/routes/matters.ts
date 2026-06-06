import type { Hono } from "hono";
import type { DB } from "../db.js";
import { getMatter, listAudit, listMatters, matterExists, verifyAuditChain } from "../repo.js";
import { isLLMReady } from "../llm.js";

export function registerMatterRoutes(app: Hono, db: DB) {
  app.get("/api/matters", (c) => c.json({ matters: listMatters(db) }));

  // Transparent engine status — the user (and any third party reading via
  // the audit trail) can confirm whether Themis is running Claude or the
  // deterministic fallback. The audit log records the engine on every chat
  // turn; this endpoint just surfaces the current readiness state up-front.
  app.get("/api/engine", (c) =>
    c.json({
      llm: isLLMReady(),
      engine: isLLMReady() ? "llm" : "deterministic",
      model: isLLMReady() ? process.env.THEMIS_LLM_MODEL ?? "claude-sonnet-4-6" : null,
    }),
  );

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

  // Tamper-evidence: walk the hash chain and report integrity.
  app.get("/api/matters/:id/audit/verify", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json(verifyAuditChain(db, id));
  });
}
