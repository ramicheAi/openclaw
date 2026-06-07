// Sharing routes — create / list / revoke share links, plus a token-resolved
// read-only view endpoint that exposes a curated subset of the matter.

import type { Context, Hono } from "hono";
import type { DB } from "../db.js";
import { audit, getMatter, listChronology, listDocuments, listEntities, matterExists } from "../repo.js";
import { createShareLink, listShareLinks, resolveShareToken, revokeShareLink, type ShareScope } from "../sharing.js";

function actor(c: Context): string {
  return c.req.header("x-themis-actor") || "you";
}

export function registerSharingRoutes(app: Hono, db: DB) {
  // List the matter's share links (operator-only).
  app.get("/api/matters/:id/share-links", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ links: listShareLinks(db, id) });
  });

  app.post("/api/matters/:id/share-links", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      label?: unknown;
      scope?: unknown;
      binderId?: unknown;
      expiresAt?: unknown;
    };
    const scope: ShareScope = body.scope === "binder" ? "binder" : "matter";
    const link = createShareLink(db, id, {
      label: typeof body.label === "string" ? body.label.trim() : "",
      scope,
      binderId: scope === "binder" && typeof body.binderId === "string" ? body.binderId : undefined,
      expiresAt: typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : undefined,
      createdBy: actor(c),
    });
    audit(db, id, actor(c), "share.create", `${scope}${link.label ? ` · ${link.label}` : ""}${link.expiresAt ? ` · expires ${link.expiresAt}` : ""}`);
    return c.json(link);
  });

  app.delete("/api/matters/:id/share-links/:token", (c) => {
    const id = c.req.param("id");
    const token = c.req.param("token");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    if (!revokeShareLink(db, id, token)) return c.json({ error: "link_not_found" }, 404);
    audit(db, id, actor(c), "share.revoke", token.slice(0, 8) + "…");
    return c.json({ ok: true });
  });

  // Public token-resolved read-only view. NO matter id in the path —
  // the token IS the credential. We expose: matter summary, accepted
  // chronology events, non-privileged documents (no body for withheld /
  // flagged docs ever — privilege wall stays intact), entities.
  app.get("/api/shared/:token", (c) => {
    const token = c.req.param("token");
    const link = resolveShareToken(db, token);
    if (!link) return c.json({ error: "link_invalid_or_expired" }, 404);
    const matter = getMatter(db, link.matterId);
    if (!matter) return c.json({ error: "matter_gone" }, 404);

    // Filter the matter view to safe-to-share fields. Strip cite-verification
    // internals + audit pointers the recipient shouldn't see.
    const events = listChronology(db, link.matterId)
      .filter((e) => e.accepted !== false)
      .map((e) => ({
        date: e.date,
        description: e.description,
        citation: { bates: e.citation.bates, page: e.citation.page, verified: e.citation.verified },
        confidence: e.confidence,
        issueTags: e.issueTags,
      }));

    // Documents: never expose flagged/withheld bodies; the privilege wall is
    // inviolable even for shared views.
    const documents = listDocuments(db, link.matterId)
      .filter((d) => d.privilege !== "withheld" && d.privilege !== "flagged")
      .map((d) => ({
        bates: d.bates,
        title: d.title,
        type: d.type,
        date: d.date,
        author: d.author,
        recipients: d.recipients,
        summary: d.summary,
        hot: d.hot,
      }));

    const entities = listEntities(db, link.matterId).map((e) => ({
      name: e.name,
      role: e.role,
      org: e.org,
      mentions: e.mentions,
    }));

    return c.json({
      link: {
        scope: link.scope,
        label: link.label,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
      },
      matter: {
        id: matter.id,
        name: matter.name,
        client: matter.client,
        matterType: matter.matterType,
        leadAttorney: matter.leadAttorney,
        pages: matter.pages,
        docs: matter.docs,
        posture: matter.caseTheory?.posture ?? "",
        claims: matter.caseTheory?.claims ?? [],
      },
      events,
      documents,
      entities,
    });
  });
}
