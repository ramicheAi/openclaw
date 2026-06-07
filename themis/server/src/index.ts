import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getDb } from "./db.js";
import { seed } from "./seed.js";
import { registerMatterRoutes } from "./routes/matters.js";
import { registerCorpusRoutes } from "./routes/corpus.js";
import { registerWorkspaceRoutes } from "./routes/workspace.js";
import { registerBinderRoutes } from "./routes/binders.js";
import { registerChainRoutes } from "./routes/chains.js";
import { registerVerifyRoutes } from "./routes/verify.js";
import { registerDeadlineRoutes } from "./routes/deadlines.js";

export function buildApp(db = getDb()) {
  seed(db); // idempotent: seeds only when empty

  const app = new Hono();
  app.use("*", cors());

  app.get("/api/health", (c) => c.json({ ok: true, service: "themis-server", version: "0.2.0" }));

  registerMatterRoutes(app, db);
  registerCorpusRoutes(app, db);
  registerWorkspaceRoutes(app, db);
  registerBinderRoutes(app, db);
  registerChainRoutes(app, db);
  registerVerifyRoutes(app, db);
  registerDeadlineRoutes(app, db);

  app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));
  app.onError((err, c) => {
    console.error("[themis] unhandled error:", err);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

// Only start a listener when run directly (not when imported by tests/smoke).
const invokedDirectly = process.argv[1]?.endsWith("index.ts");
if (invokedDirectly) {
  const port = Number(process.env.PORT ?? 8787);
  const app = buildApp();
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Themis API listening on http://localhost:${info.port}`);
  });
}
