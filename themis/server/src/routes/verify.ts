// Cite-Check surface — the "Mata v. Avianca shield". Paste a draft brief or
import { authedActor } from "./auth.js";
// motion and Themis verifies BOTH kinds of citation it contains:
//   1. Bates citations (e.g. OLIV-000014, p.3) against the matter corpus —
//      does the document exist, does the cited page exist, does the source
//      actually support the surrounding claim (entailment)?
//   2. Legal authorities (e.g. Varghese v. China Southern Airlines, 925 F.3d
//      1339) against CourtListener — is this a REAL published opinion, or did
//      a generative tool fabricate it?
//
// One endpoint, one report. This is the highest-leverage trust feature: post-
// Mata, every court wants a certification that authorities were verified.

import type { Context, Hono } from "hono";
import type { DB } from "../db.js";
import { audit, getDocumentByBates, matterExists } from "../repo.js";
import { assessCitation } from "../services.js";
import { verifyAuthorities, isCourtListenerConfigured } from "../courtlistener.js";
import { generateCertification } from "../certifications.js";

function actor(c: Context): string {
  return authedActor(c);
}

export function registerVerifyRoutes(app: Hono, db: DB) {
  // Combined draft check: Bates + authorities in a single pass.
  app.post("/api/matters/:id/verify", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return c.json({ error: "invalid_text", hint: "paste the draft text to verify" }, 400);
    }
    const text = body.text;

    // --- Bates citations against the matter corpus -------------------------
    const bates = checkBates(db, id, text);

    // --- Legal authorities against CourtListener ---------------------------
    const authorities = await verifyAuthorities(text);

    const fabricated = authorities.findings.filter((f) => f.verdict === "not_found").length;
    const unresolvedBates = bates.findings.filter((f) => !f.existed).length;
    audit(
      db,
      id,
      actor(c),
      "verify.run",
      `bates ${bates.total} (${unresolvedBates} unresolved) · authorities ${authorities.findings.length} (${fabricated} not found)`,
    );

    return c.json({
      bates,
      authorities: {
        ok: authorities.ok,
        configured: authorities.configured,
        error: authorities.error,
        total: authorities.findings.length,
        verified: authorities.findings.filter((f) => f.verdict === "verified").length,
        ambiguous: authorities.findings.filter((f) => f.verdict === "ambiguous").length,
        notFound: fabricated,
        findings: authorities.findings,
      },
    });
  });

  // Authorities only — handy for a quick paste without Bates context.
  app.post("/api/matters/:id/authority-check", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return c.json({ error: "invalid_text" }, 400);
    }
    const r = await verifyAuthorities(body.text);
    const fabricated = r.findings.filter((f) => f.verdict === "not_found").length;
    audit(db, id, actor(c), "verify.authorities", `${r.findings.length} authorities · ${fabricated} not found`);
    return c.json(r);
  });

  // Tiny status probe so the UI can tell the operator whether the
  // CourtListener token is configured (anonymous still works, just throttled).
  app.get("/api/verify/status", (c) =>
    c.json({ courtListenerConfigured: isCourtListenerConfigured() }),
  );

  // Generate an AI-use certification from the matter's actual verification
  // audit trail — defensible because every number comes from the audit log,
  // not from a hand-edited form.
  app.post("/api/matters/:id/certification", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      filing?: unknown;
      jurisdiction?: unknown;
      signer?: unknown;
      barNumber?: unknown;
    };
    if (typeof body.filing !== "string" || body.filing.trim().length === 0) {
      return c.json({ error: "invalid_filing", hint: "filing must describe what's being certified" }, 400);
    }
    const cert = generateCertification(db, id, {
      filing: body.filing.trim(),
      jurisdiction: typeof body.jurisdiction === "string" ? body.jurisdiction.trim() : undefined,
      signer: typeof body.signer === "string" ? body.signer.trim() : undefined,
      barNumber: typeof body.barNumber === "string" ? body.barNumber.trim() : undefined,
    });
    if (!cert) return c.json({ error: "matter_not_found" }, 404);
    audit(db, id, actor(c), "verify.certify", `${body.filing.trim()} · ${cert.stats.authorities_verified} authorities verified · ${cert.stats.authorities_not_found} not found`);
    return c.json(cert);
  });
}

// Extracted from the old workspace cite-check so both endpoints share one
// implementation (single source of truth for Bates trust scoring).
function checkBates(db: DB, id: string, text: string) {
  const re = /\b([A-Z]{2,}-\d{3,})(?:\s*[,·]?\s*(?:p\.?|page)\s*(\d{1,4}))?/g;
  const findings: {
    bates: string;
    page: number;
    index: number;
    existed: boolean;
    entailed: boolean;
    supportScore: number;
    title?: string;
    date?: string;
    privilege?: string;
  }[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const b = m[1];
    const page = m[2] ? Number(m[2]) : 1;
    const key = `${b}#${page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const idx = m.index;
    const doc = getDocumentByBates(db, id, b);
    const around = text.slice(Math.max(0, idx - 240), Math.min(text.length, idx + 200));
    const sup = assessCitation(db, id, b, page, around);
    findings.push({
      bates: b,
      page,
      index: idx,
      existed: sup.existed,
      entailed: sup.entailed,
      supportScore: sup.supportScore,
      title: doc?.title,
      date: doc?.date,
      privilege: doc?.privilege,
    });
  }
  return {
    total: findings.length,
    existed: findings.filter((f) => f.existed).length,
    entailed: findings.filter((f) => f.entailed).length,
    findings,
  };
}
