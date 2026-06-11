// Stripe billing routes — Checkout, customer portal, and the webhook
// that flips user.plan when a subscription event lands.
//
// Stripe holds the source of truth for "is this user subscribed". The DB
// caches plan + plan_active_until + stripe_customer_id for fast reads.
// On any subscription.{created,updated,deleted,checkout.session.completed}
// event we re-sync from the Stripe object.

import Stripe from "stripe";
import type { Context, Hono } from "hono";
import type { DB } from "../db.js";
import { findUserByStripeCustomer, getUserByEmail, isAuthRequired, readSessionCookie, resolveSession, setUserPlan } from "../auth.js";
import { PLANS, type PlanId } from "../plans.js";
import { audit } from "../repo.js";

// Lazy-init the Stripe client so the server boots without a key (free
// tier + dev). When STRIPE_SECRET_KEY isn't set, the billing routes
// return a friendly 503 instead of crashing.
let stripeClient: Stripe | null | undefined;
function getStripe(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    stripeClient = null;
    return null;
  }
  stripeClient = new Stripe(key);
  return stripeClient;
}

export function isBillingConfigured(): boolean {
  return getStripe() !== null;
}

// Map our plan ids to Stripe Price IDs via env vars. Configure on Fly:
//   fly secrets set STRIPE_PRICE_SOLO=price_... STRIPE_PRICE_FIRM=price_...
const PRICE_ENV: Record<Exclude<PlanId, "free" | "enterprise">, string> = {
  solo: "STRIPE_PRICE_SOLO",
  firm: "STRIPE_PRICE_FIRM",
  firm_pro: "STRIPE_PRICE_FIRM_PRO",
};

function priceFor(plan: PlanId): string | null {
  if (plan === "free" || plan === "enterprise") return null;
  return process.env[PRICE_ENV[plan]] ?? null;
}

function publicUrl(): string {
  return process.env.THEMIS_PUBLIC_URL?.replace(/\/$/, "") ?? "http://localhost:5180";
}

function currentEmail(c: Context, db: DB): string | null {
  if (!isAuthRequired()) return null;
  const sid = readSessionCookie(c.req.header("cookie"));
  if (!sid) return null;
  const session = resolveSession(db, sid);
  return session?.email ?? null;
}

// Stripe SDK v22 (API "Basil") moved current_period_end off the
// subscription onto its items. Read the item first, fall back to the
// legacy top-level field for older API versions (#8).
function subPeriodEnd(sub: Stripe.Subscription): string | undefined {
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const ts = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : undefined;
}

// Never persist a plan id Stripe metadata claims unless we actually know
// it — a typo'd or stale themis_plan must not grant a free upgrade (#8).
function validPlan(raw: unknown, fallback: string): string {
  return typeof raw === "string" && raw in PLANS ? raw : fallback;
}

export function registerBillingRoutes(app: Hono, db: DB) {
  // Returns the user's current plan + quota usage + whether checkout is
  // available. Computes monthly page usage live across every matter the
  // user owns.
  app.get("/api/billing/status", (c) => {
    const email = currentEmail(c, db);
    const user = email ? getUserByEmail(db, email) : null;
    const plan = (user?.plan ?? "free") as keyof typeof PLANS;
    const spec = PLANS[plan];
    let mattersUsed = 0;
    let pagesUsedThisMonth = 0;
    if (email) {
      // Must match the cap-enforcement query in routes/matters.ts exactly
      // (archived excluded) or the meter and the gate disagree (#6).
      mattersUsed = (db.prepare(`SELECT COUNT(*) AS n FROM matters WHERE owner_email = ? AND archived = 0`).get(email) as { n: number }).n;
      const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      pagesUsedThisMonth = (db
        .prepare(
          `SELECT COALESCE(SUM(d.pages), 0) AS n FROM documents d
            JOIN matters m ON m.id = d.matter_id
            WHERE m.owner_email = ? AND d.created_at >= ?`,
        )
        .get(email, since) as { n: number }).n;
    }
    return c.json({
      configured: isBillingConfigured(),
      plan,
      planLabel: spec.label,
      planActiveUntil: user?.planActiveUntil ?? null,
      hasSubscription: !!user?.stripeSubscriptionId,
      stripeCustomerId: user?.stripeCustomerId ?? null,
      usage: {
        matters: { used: mattersUsed, cap: spec.matters },
        pages: { used: pagesUsedThisMonth, cap: spec.pagesPerMonth },
        seats: { used: 1, cap: spec.seats },
      },
    });
  });

  // Start a Stripe Checkout session. Returns { url } the client redirects to.
  app.post("/api/billing/checkout", async (c) => {
    const stripe = getStripe();
    if (!stripe) {
      return c.json({ error: "billing_not_configured", message: "Stripe is not configured on this server. Contact support to subscribe." }, 503);
    }
    const email = currentEmail(c, db);
    if (!email) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { plan?: unknown };
    if (typeof body.plan !== "string" || !(body.plan in PLANS)) {
      return c.json({ error: "invalid_plan" }, 400);
    }
    const price = priceFor(body.plan as PlanId);
    if (!price) {
      if (body.plan === "enterprise") {
        return c.json({ error: "contact_sales", url: "mailto:sales@themis.law" }, 200);
      }
      return c.json({ error: "plan_not_configured", message: `Set ${PRICE_ENV[body.plan as keyof typeof PRICE_ENV]} in env vars.` }, 503);
    }

    const user = getUserByEmail(db, email);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer: user?.stripeCustomerId ?? undefined,
      customer_email: user?.stripeCustomerId ? undefined : email,
      client_reference_id: email,
      success_url: `${publicUrl()}/?billing=success`,
      cancel_url: `${publicUrl()}/pricing?billing=cancel`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { themis_email: email, themis_plan: body.plan } },
    });
    if (!session.url) return c.json({ error: "stripe_no_url" }, 502);
    return c.json({ url: session.url });
  });

  // Customer portal — let the user manage payment method, invoices, cancel.
  app.post("/api/billing/portal", async (c) => {
    const stripe = getStripe();
    if (!stripe) return c.json({ error: "billing_not_configured" }, 503);
    const email = currentEmail(c, db);
    if (!email) return c.json({ error: "unauthorized" }, 401);
    const user = getUserByEmail(db, email);
    if (!user?.stripeCustomerId) return c.json({ error: "no_subscription" }, 404);
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${publicUrl()}/`,
    });
    return c.json({ url: portal.url });
  });

  // Stripe webhook — signature-verified. Maps subscription state into
  // users.plan. Stripe is the source of truth; we just cache for speed.
  // Mount as a raw-body route — Stripe requires the exact bytes for sig
  // verification.
  app.post("/api/billing/webhook", async (c) => {
    const stripe = getStripe();
    if (!stripe) return c.json({ error: "billing_not_configured" }, 503);
    const sigHeader = c.req.header("stripe-signature");
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sigHeader || !secret) {
      return c.json({ error: "missing_signature_or_secret" }, 400);
    }
    const raw = await c.req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, sigHeader, secret);
    } catch (err) {
      return c.json({ error: "invalid_signature", detail: err instanceof Error ? err.message : String(err) }, 400);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const s = event.data.object as Stripe.Checkout.Session;
          const email = (s.client_reference_id ?? s.customer_email ?? "").toString();
          const customerId = (typeof s.customer === "string" ? s.customer : s.customer?.id) ?? null;
          const subId = (typeof s.subscription === "string" ? s.subscription : s.subscription?.id) ?? null;
          if (email && customerId) {
            // Look up the subscription to read the plan + period end.
            let plan: string = "solo";
            let activeUntil: string | undefined;
            if (subId) {
              const sub = await stripe.subscriptions.retrieve(subId);
              plan = validPlan(sub.metadata?.themis_plan, plan);
              activeUntil = subPeriodEnd(sub);
            }
            setUserPlan(db, email, plan, activeUntil, customerId, subId ?? undefined);
            // Per-user audit (no matter context, so use a synthetic "billing"
            // matter id of empty string — most audit consumers filter by
            // matter_id so this is invisible to normal matter views).
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.created": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const user = findUserByStripeCustomer(db, customerId);
          if (user) {
            const plan = validPlan(sub.metadata?.themis_plan, user.plan);
            const activeUntil = subPeriodEnd(sub);
            setUserPlan(db, user.email, sub.status === "active" || sub.status === "trialing" ? plan : "free", activeUntil, customerId, sub.id);
          }
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const user = findUserByStripeCustomer(db, customerId);
          if (user) {
            setUserPlan(db, user.email, "free", undefined, customerId, sub.id);
          }
          break;
        }
      }
    } catch (err) {
      console.error("[stripe-webhook]", event.type, err);
      // Return 200 anyway so Stripe doesn't retry forever on a one-off bug;
      // the dashboard event log keeps the failure for diagnosis.
    }

    return c.json({ received: true });
  });
}

// Re-export so other route files can fetch the audit() they already import.
export { audit };
