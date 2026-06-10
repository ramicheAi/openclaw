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
import { registerDraftRoutes } from "./routes/drafts.js";
import { registerProductionRoutes } from "./routes/productions.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerTeamRoutes } from "./routes/teams.js";
import { registerTemplateRoutes } from "./routes/templates.js";
import { attachAuth } from "./routes/auth.js";
import { isAuthRequired as isAuthRequiredFn, normalizeEmail, reapExpiredAuthArtifacts } from "./auth.js";
import type { Context, Next } from "hono";
import { canAccessMatter as canAccessFn } from "./repo.js";
import { registerConflictRoutes } from "./routes/conflicts.js";
import { registerSharingRoutes } from "./routes/sharing.js";
import { registerDamagesRoutes } from "./routes/damages.js";

export function buildApp(db = getDb()) {
  seed(db); // idempotent: seeds only when empty
  reapExpiredAuthArtifacts(db); // GC stale tokens + expired sessions on boot

  // Legacy/seed matters carry owner_email = ''. In multi-tenant mode those
  // belong to nobody — they are NOT world-accessible (SECURITY-TODO #3).
  // THEMIS_OPERATOR_EMAIL assigns every orphan matter to the operator's
  // account at boot so a pre-auth deployment keeps its matters after
  // turning multi-tenant on.
  const operator = process.env.THEMIS_OPERATOR_EMAIL?.trim();
  if (operator) {
    const claimed = db
      .prepare(`UPDATE matters SET owner_email = ? WHERE owner_email = ''`)
      .run(normalizeEmail(operator));
    if (claimed.changes > 0) {
      console.log(`[themis] assigned ${claimed.changes} unowned matter(s) to operator ${normalizeEmail(operator)}`);
    }
  }

  const app = new Hono();
  app.use("*", cors({
    origin: (o) => o ?? "*",
    credentials: true,
  }));

  app.get("/api/health", (c) => c.json({ ok: true, service: "themis-server", version: "0.2.0" }));

  // Auth must mount FIRST so its middleware gates every other /api route
  // when THEMIS_AUTH_REQUIRED=1. Public prefixes (/api/health, /api/auth/*,
  // /api/shared/*) skip the check; everything else needs a session cookie.
  attachAuth(app, db);

  // Per-matter ownership middleware. Runs after the auth middleware so we
  // know the session is valid; only kicks in when multi-tenant. Resolves
  // :id and 403s the request if the authed user doesn't own (or hasn't
  // been granted access to) the matter.
  //
  // Registered on BOTH the bare path and the wildcard. Hono's ":id/*"
  // pattern already matches the bare ":id" path (verified empirically —
  // see SECURITY-TODO #1), but the explicit bare matcher means a future
  // router behavior change can't silently un-gate `GET /api/matters/:id`.
  const matterGate = async (c: Context, next: Next) => {
    if (!isAuthRequiredFn()) return next();
    const session = c.get("session" as never) as { email: string } | undefined;
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const id = c.req.param("id");
    // "/api/matters/archived" is a list route that shares the ":id" path
    // shape — it is not a matter id. Without this carve-out the gate 403s
    // the Archive surface for every signed-in user.
    if (id === "archived") return next();
    if (!id || !canAccessFn(db, id, session.email)) {
      return c.json({ error: "matter_forbidden" }, 403);
    }
    return next();
  };
  app.use("/api/matters/:id", matterGate);
  app.use("/api/matters/:id/*", matterGate);

  registerMatterRoutes(app, db);
  registerCorpusRoutes(app, db);
  registerWorkspaceRoutes(app, db);
  registerBinderRoutes(app, db);
  registerChainRoutes(app, db);
  registerVerifyRoutes(app, db);
  registerDeadlineRoutes(app, db);
  registerDraftRoutes(app, db);
  registerProductionRoutes(app, db);
  registerConflictRoutes(app, db);
  registerSharingRoutes(app, db);
  registerDamagesRoutes(app, db);
  registerBillingRoutes(app, db);
  registerPublicRoutes(app, db);
  registerTeamRoutes(app, db);
  registerTemplateRoutes(app, db);

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
