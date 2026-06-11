// Team + webhook routes. Owner of a matter can invite / revoke teammates;
// firm-level webhook endpoints are scoped to the configuring user.

import type { Context, Hono } from "hono";
import { authedActor } from "./auth.js";
import type { DB } from "../db.js";
import { audit, matterExists } from "../repo.js";
import { isAuthRequired, readSessionCookie, resolveSession } from "../auth.js";
import { createWebhook, deleteWebhook, grantAccess, listMatterAccess, listWebhooks, revokeAccess, ROLES, webhookTargetError, type Role } from "../teams.js";

function actor(c: Context): string {
  return authedActor(c);
}

function currentEmail(c: Context, db: DB): string | null {
  if (!isAuthRequired()) return null;
  const sid = readSessionCookie(c.req.header("cookie"));
  if (!sid) return null;
  return resolveSession(db, sid)?.email ?? null;
}

export function registerTeamRoutes(app: Hono, db: DB) {
  // List collaborators on a matter.
  app.get("/api/matters/:id/access", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ access: listMatterAccess(db, id) });
  });

  // Invite a collaborator.
  app.post("/api/matters/:id/access", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { email?: unknown; role?: unknown };
    if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return c.json({ error: "invalid_email" }, 400);
    }
    if (typeof body.role !== "string" || !ROLES.includes(body.role as Role)) {
      return c.json({ error: "invalid_role", hint: `role must be one of: ${ROLES.join(", ")}` }, 400);
    }
    const entry = grantAccess(db, id, body.email.trim(), body.role as Role, actor(c));
    audit(db, id, actor(c), "team.invite", `${entry.email} as ${entry.role}`);
    return c.json(entry);
  });

  app.delete("/api/matters/:id/access/:email", (c) => {
    const id = c.req.param("id");
    const email = decodeURIComponent(c.req.param("email"));
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    if (!revokeAccess(db, id, email)) return c.json({ error: "access_not_found" }, 404);
    audit(db, id, actor(c), "team.revoke", email);
    return c.json({ ok: true });
  });

  // ── Webhook endpoints (firm-scoped) ──────────────────────────────────
  app.get("/api/webhooks", (c) => {
    const email = currentEmail(c, db) ?? actor(c);
    if (!email || email === "you") return c.json({ webhooks: [] });
    return c.json({ webhooks: listWebhooks(db, email) });
  });

  app.post("/api/webhooks", async (c) => {
    const email = currentEmail(c, db);
    if (!email && isAuthRequired()) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { url?: unknown; events?: unknown };
    if (typeof body.url !== "string" || !/^https?:\/\//.test(body.url)) {
      return c.json({ error: "invalid_url" }, 400);
    }
    const targetErr = webhookTargetError(body.url.trim());
    if (targetErr) return c.json({ error: targetErr }, 400);
    const wh = createWebhook(db, email ?? "operator", body.url.trim(), typeof body.events === "string" ? body.events : "audit.*");
    return c.json(wh);
  });

  app.delete("/api/webhooks/:id", (c) => {
    const email = currentEmail(c, db) ?? "operator";
    const id = c.req.param("id");
    if (!deleteWebhook(db, email, id)) return c.json({ error: "webhook_not_found" }, 404);
    return c.json({ ok: true });
  });
}
