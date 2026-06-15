// Magic-link auth routes + the middleware that gates every other route
// when THEMIS_AUTH_REQUIRED=1. Mounted before all other route registrars
// so the middleware fires first.

import type { Context, Hono, Next } from "hono";
import type { DB } from "../db.js";
import {
  clearedCookie,
  consumeMagicLinkToken,
  createMagicLinkToken,
  createSession,
  destroySession,
  isAuthRequired,
  normalizeEmail,
  readSessionCookie,
  resolveSession,
  sessionCookieValue,
  upsertUser,
  type Session,
} from "../auth.js";
import { magicLinkEmail, sendEmail } from "../email.js";

// Paths that NEVER require auth even in multi-tenant mode:
//   /api/health         — uptime probes
//   /api/auth/*         — the login flow itself
//   /api/shared/*       — tokenized read-only share links (the token IS the auth)
//   /api/verify/status  — public status indicator for the cite-check tier
const PUBLIC_PREFIXES = [
  "/api/health",
  "/api/auth/",
  "/api/shared/",
  "/api/verify/status",
  "/api/public/",          // free-tier Cite Check + lead capture
  "/api/billing/webhook",  // Stripe signs the body, not a session cookie
];

function isPublic(path: string): boolean {
  // Entries ending in "/" are prefixes: they match themselves (sans slash)
  // and any sub-path. Everything else is an EXACT match only — otherwise
  // "/api/health" would also bless "/api/healthcheck" and "/api/verify/status"
  // would bless "/api/verify/status-anything" (#7).
  return PUBLIC_PREFIXES.some((p) =>
    p.endsWith("/") ? path === p.slice(0, -1) || path.startsWith(p) : path === p,
  );
}

function ip(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    ""
  );
}

function baseUrl(c: Context): string {
  // Prefer the explicit env var (fly / production), fall back to request.
  const env = process.env.THEMIS_PUBLIC_URL;
  if (env) return env.replace(/\/$/, "");
  const proto = c.req.header("x-forwarded-proto") ?? "http";
  const host = c.req.header("host") ?? "localhost:5180";
  return `${proto}://${host}`;
}

export function attachAuth(app: Hono, db: DB) {
  // Middleware: when auth is required, every /api/* request resolves the
  // session cookie. Public prefixes skip the check. Authed requests get
  // c.set("session", session) so handlers can read identity.
  app.use("/api/*", async (c, next: Next) => {
    if (!isAuthRequired()) {
      return next();
    }
    if (isPublic(c.req.path)) return next();
    const sid = readSessionCookie(c.req.header("cookie"));
    if (!sid) return c.json({ error: "unauthorized" }, 401);
    const session = resolveSession(db, sid);
    if (!session) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json", "set-cookie": clearedCookie() },
      });
    }
    c.set("session" as never, session as never);
    return next();
  });

  // ── Routes ────────────────────────────────────────────────────────────

  app.get("/api/auth/me", (c) => {
    if (!isAuthRequired()) {
      return c.json({ mode: "single-user", user: null });
    }
    // This route is in the public-prefix list (so it can answer "no, not
    // signed in" without 401-bouncing), so the middleware skipped it. We
    // resolve the cookie ourselves to surface the user when a session
    // does exist.
    const sid = readSessionCookie(c.req.header("cookie"));
    if (!sid) return c.json({ mode: "multi-tenant", user: null });
    const session = resolveSession(db, sid);
    if (!session) return c.json({ mode: "multi-tenant", user: null });
    return c.json({
      mode: "multi-tenant",
      user: { email: session.email, name: session.name },
    });
  });

  // Request a magic link. We always return 200 with { ok: true } so
  // attackers can't enumerate which emails have accounts.
  app.post("/api/auth/request-link", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
    if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return c.json({ error: "invalid_email" }, 400);
    }
    if (!isAuthRequired()) {
      return c.json({ ok: true, mode: "single-user", message: "Auth is disabled on this instance — no email sent. Go to / to use Themis." });
    }
    const email = normalizeEmail(body.email);
    const requestIp = ip(c);
    const { token } = createMagicLinkToken(db, email, requestIp);
    const url = `${baseUrl(c)}/api/auth/verify?token=${encodeURIComponent(token)}`;
    const sent = await sendEmail(magicLinkEmail({ to: email, url, ip: requestIp }));
    // Surface the URL whenever delivery isn't confirmed — console fallback
    // mode OR a Resend failure (domain not verified, key revoked, rate
    // limit). The user can always paste it in their browser. Production
    // deploys with a properly verified domain hide the URL.
    const showUrl = sent.via === "console" || sent.delivered === false;
    return c.json({
      ok: true,
      via: sent.via,
      delivered: sent.delivered,
      error: sent.error,
      url: showUrl ? url : undefined,
    });
  });

  // Click handler. Consumes the token (single-use), creates the user if
  // needed, mints a session cookie, redirects to /.
  app.get("/api/auth/verify", (c) => {
    const token = c.req.query("token") ?? "";
    if (!token) return c.text("Missing token.", 400);
    const email = consumeMagicLinkToken(db, token);
    if (!email) {
      // Friendly HTML rather than a JSON blob — the user clicked a link.
      return new Response(
        landingHtml(
          "Link expired or invalid",
          "This sign-in link has expired or has already been used. Request a fresh one from the sign-in page.",
        ),
        { status: 410, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    const user = upsertUser(db, email);
    const session = createSession(db, user.id);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        "set-cookie": sessionCookieValue(session.id, session.expiresAt),
      },
    });
  });

  app.post("/api/auth/logout", (c) => {
    const sid = readSessionCookie(c.req.header("cookie"));
    if (sid) destroySession(db, sid);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", "set-cookie": clearedCookie() },
    });
  });
}

function landingHtml(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} — Themis</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#f4ecda;color:#1f1a14;padding:64px 24px;margin:0}
.box{max-width:480px;margin:0 auto;background:#fff;border:1px solid #d6caa8;border-radius:12px;padding:32px}
h1{font-family:Georgia,serif;font-size:22px;margin:0 0 12px}
p{font-size:14px;line-height:1.55;margin:0 0 16px;color:#5b5141}
a{color:#8a5a1f;text-decoration:none;font-weight:600}</style></head>
<body><div class="box"><h1>${title}</h1><p>${body}</p><p><a href="/">← Back to Themis</a></p></div></body></html>`;
}

/** Helper for other route files: returns the authed actor (email) when
 * multi-tenant mode is on; falls back to the legacy x-themis-actor header
 * (or "you") in single-user mode. Centralizes the audit-actor decision so
 * the rest of the app doesn't have to branch on isAuthRequired(). */
export function authedActor(c: Context): string {
  if (isAuthRequired()) {
    const s = c.get("session" as never) as Session | undefined;
    return s?.email ?? "anon";
  }
  return c.req.header("x-themis-actor") ?? "you";
}
