// Public Cite Check — the free-tier wedge. Anyone hits POST /api/public/cite-check
// with a blob of text, gets back every case-law citation Themis could find
// + whether each one resolves in CourtListener. Optional email for lead
// capture. IP-rate-limited (50/day for unauth, unlimited for signed-in).
//
// Bates verification needs a matter corpus; this endpoint only does the
// authority check. Visitors who want Bates resolution see the upgrade
// CTA in the response.
//
// This is the marketing funnel: ABA Journal piece → "try free Cite Check" →
// "save the report → email" → "upgrade for matter-scoped Bates verify".

import type { Context, Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { DB } from "../db.js";
import { verifyAuthorities } from "../courtlistener.js";
import { getVerifiedByHash } from "../verified.js";

// Hard rate-limit at the route layer so we don't burn through our
// CourtListener allowance on an attack. 50 checks per IP per day.
const DAILY_LIMIT = 50;

function ip(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}

function countToday(db: DB, requestIp: string): number {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const r = db
    .prepare(`SELECT COUNT(*) AS n FROM public_cite_checks WHERE ip = ? AND created_at > ?`)
    .get(requestIp, since) as { n: number };
  return r.n;
}

export function registerPublicRoutes(app: Hono, db: DB) {
  app.post("/api/public/cite-check", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown; email?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return c.json({ error: "invalid_text", message: "Paste the text of a brief, motion, or memo." }, 400);
    }
    if (body.text.length > 64_000) {
      return c.json({ error: "text_too_long", message: "Public Cite Check accepts up to 64KB. Subscribe to remove the limit." }, 413);
    }
    const requestIp = ip(c);
    const used = countToday(db, requestIp);
    if (used >= DAILY_LIMIT) {
      return c.json(
        {
          error: "rate_limited",
          dailyLimit: DAILY_LIMIT,
          used,
          message: `You've used ${used}/${DAILY_LIMIT} free Cite Checks today. Subscribe to Solo ($99/mo) for unlimited.`,
        },
        429,
      );
    }

    const result = await verifyAuthorities(body.text);
    const notFound = result.findings.filter((f) => f.verdict === "not_found").length;

    db.prepare(
      `INSERT INTO public_cite_checks (id, ip, email, created_at, total, not_found, chars) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `pc-${randomUUID().slice(0, 8)}`,
      requestIp,
      typeof body.email === "string" ? body.email.trim().toLowerCase() : null,
      new Date().toISOString(),
      result.findings.length,
      notFound,
      body.text.length,
    );

    return c.json({
      ok: result.ok,
      configured: result.configured,
      error: result.error,
      total: result.findings.length,
      verified: result.findings.filter((f) => f.verdict === "verified").length,
      ambiguous: result.findings.filter((f) => f.verdict === "ambiguous").length,
      notFound,
      findings: result.findings,
      // Funnel metadata
      remainingToday: DAILY_LIMIT - used - 1,
      dailyLimit: DAILY_LIMIT,
    });
  });

  // Themis Verified — public attestation lookup. Anyone with the hash
  // (from a filing, an email, a Slack message) can verify what was checked,
  // when, and by whom. Free; no account needed. This is the moat play.
  app.get("/api/public/verify/:hash", (c) => {
    const hash = c.req.param("hash");
    const cert = getVerifiedByHash(db, hash);
    if (!cert) return c.json({ error: "not_found" }, 404);
    if (cert.revoked) return c.json({ error: "revoked" }, 410);
    // Strip PII we don't want to expose to randoms — we publish the signer
    // name + bar number (which IS already on the filing) but never their
    // email or session info.
    return c.json({
      hash: cert.hash,
      matterName: cert.matterName,
      client: cert.client,
      filing: cert.filing,
      jurisdiction: cert.jurisdiction,
      signer: cert.signer,
      barNumber: cert.barNumber,
      stats: cert.stats,
      signedAt: cert.signedAt,
      auditAnchor: cert.auditAnchor,
    });
  });

  // Embeddable SVG badge — paste into email signatures, website footers,
  // or LinkedIn. Renders "Themis Verified · <case>" with a brass border.
  // Browsers render <img src=".svg"> inline; firms wrap it in an <a> to
  // the public /verify/<hash> attestation page.
  app.get("/api/public/verify/:hash/badge.svg", (c) => {
    const hash = c.req.param("hash") ?? "";
    if (!hash) return c.text("missing hash", 400);
    const cert = getVerifiedByHash(db, hash);
    const ok = cert && !cert.revoked && cert.stats.authorities_not_found === 0 && cert.stats.bates_not_in_matter === 0;
    const labelText = cert
      ? (cert.revoked ? "Revoked" : ok ? "Verified" : "Verified · with notes")
      : "Not found";
    const matterText = cert ? truncate(cert.matterName, 36) : "(unknown attestation)";
    const fillColor = !cert ? "#8a7f6c" : cert.revoked ? "#b53d36" : ok ? "#2c7e5a" : "#a5631f";
    const bgColor = !cert ? "#f4ecda" : cert.revoked ? "#f8e4e2" : ok ? "#e7f4ec" : "#f7ecd9";
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="280" height="64" viewBox="0 0 280 64" role="img" aria-label="Themis Verified — ${escapeAttr(matterText)}">
  <rect x="1" y="1" width="278" height="62" rx="8" ry="8" fill="${bgColor}" stroke="${fillColor}" stroke-width="1.5"/>
  <g transform="translate(14,12)">
    <!-- tau-ish mark -->
    <rect x="0" y="0" width="32" height="32" rx="6" fill="${fillColor}"/>
    <text x="16" y="22" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="20" fill="${bgColor}">T</text>
  </g>
  <g transform="translate(58,18)">
    <text x="0" y="0" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-weight="700" font-size="13" fill="${fillColor}">Themis ${escapeAttr(labelText)}</text>
    <text x="0" y="17" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="10.5" fill="#5b5141">${escapeAttr(matterText)}</text>
    <text x="0" y="32" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="8.5" fill="#8a7f6c">${escapeAttr(hash.slice(0, 12))}</text>
  </g>
</svg>`;
    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        // Cache lookups for a minute. Revocation flips the rendered tone
        // so cache invalidation isn't critical for trust.
        "cache-control": "public, max-age=60",
      },
    });
  });

  // Public status — uptime + service availability. Lightweight check the
  // operator can point status.themis.law at. No PII.
  app.get("/api/public/status", async (c) => {
    const services = await Promise.allSettled([
      // CourtListener: HEAD the citation-lookup endpoint
      fetch("https://www.courtlistener.com/api/rest/v4/", { method: "HEAD", signal: AbortSignal.timeout(2500) })
        .then((r) => ({ name: "CourtListener", ok: r.ok || r.status === 401 || r.status === 405 })) // 401/405 means service is up, just rejecting unauthenticated HEAD
        .catch(() => ({ name: "CourtListener", ok: false })),
      // Anthropic: HEAD a known endpoint to confirm reachability
      fetch("https://api.anthropic.com/v1/messages", { method: "OPTIONS", signal: AbortSignal.timeout(2500) })
        .then((r) => ({ name: "Anthropic API", ok: r.ok || r.status === 401 || r.status === 405 }))
        .catch(() => ({ name: "Anthropic API", ok: false })),
    ]);
    return c.json({
      service: "themis-api",
      ok: true,
      uptime: process.uptime(),
      checkedAt: new Date().toISOString(),
      dependencies: services.map((s, i) => s.status === "fulfilled" ? s.value : { name: ["CourtListener", "Anthropic API"][i], ok: false }),
    });
  });

  // Simple lead-capture endpoint — drop your email after a clean Cite Check
  // to "save the report". We don't actually persist the report (free tier
  // has no save) but we collect the lead.
  app.post("/api/public/save-lead", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
    if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return c.json({ error: "invalid_email" }, 400);
    }
    db.prepare(
      `INSERT INTO public_cite_checks (id, ip, email, created_at, total, not_found, chars) VALUES (?, ?, ?, ?, 0, 0, 0)`,
    ).run(`lead-${randomUUID().slice(0, 8)}`, ip(c), body.email.trim().toLowerCase(), new Date().toISOString());
    return c.json({ ok: true });
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
