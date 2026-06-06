import type { Hono } from "hono";
import type { DB } from "../db.js";
import { getMatter, listAudit, listMatters, matterExists, verifyAuditChain } from "../repo.js";
import { getCurrentModel, getLastLLMError, isLLMReady, probeLLM } from "../llm.js";

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
      model: isLLMReady() ? getCurrentModel() : null,
      // Most recent LLM error, if any. Lets the engine pill tooltip explain
      // why answers are falling back to deterministic without forcing the
      // operator to dig through server logs.
      lastError: getLastLLMError(),
    }),
  );

  // One-shot health check — does the API key + model name actually work?
  // Returns the precise error message on failure (e.g. invalid model,
  // 401 auth, 429 rate limit).
  app.get("/api/engine/test", async (c) => c.json(await probeLLM()));

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
