// Subscription plans. The free tier is Cite-Check-only (the marketing
// wedge); paid tiers light up the rest of the product. Limits are
// enforced at every create-shape route (createMatter, document upload).
//
// Stripe holds the source of truth for *whether* a user is subscribed
// (via webhook → users.plan). This module describes what each plan
// includes so the limits + UI can be deterministic.

export type PlanId = "free" | "solo" | "firm" | "firm_pro" | "enterprise";

export interface PlanSpec {
  id: PlanId;
  label: string;
  /** Monthly price in USD. 0 = free, -1 = sales-led. */
  monthlyUsd: number;
  /** Per-seat-month for the marketing breakdown ($/user). */
  perSeatUsd: number;
  /** Seats included (Infinity = unlimited). */
  seats: number;
  /** Active matters allowed at once. */
  matters: number;
  /** Pages of corpus storage per month. */
  pagesPerMonth: number;
  /** Whether the operator can save Cite Check reports + use other features.
   *  Free tier is "Cite Check only, no save". */
  canPersist: boolean;
  /** Marketing one-liner. */
  blurb: string;
  /** Feature highlights for the pricing page. */
  features: string[];
}

export const PLANS: Record<PlanId, PlanSpec> = {
  free: {
    id: "free",
    label: "Free",
    monthlyUsd: 0,
    perSeatUsd: 0,
    seats: 1,
    matters: 0,
    pagesPerMonth: 0,
    canPersist: false,
    blurb: "Cite Check only · the Mata shield · no account needed",
    features: [
      "Public Cite Check — paste any brief",
      "CourtListener authority verification",
      "Up to 50 paste-checks per day, per IP",
      "No save, no matters, no chat",
    ],
  },
  solo: {
    id: "solo",
    label: "Solo",
    monthlyUsd: 99,
    perSeatUsd: 99,
    seats: 1,
    matters: 5,
    pagesPerMonth: 1_000,
    canPersist: true,
    blurb: "Solo practitioners",
    features: [
      "1 user · 5 active matters · 1,000 pages/mo",
      "All features (Analyze, Chat, Draft, Damages, Cite Check, Share)",
      "Unlimited Bates verification",
      "Audit-trail PDFs + privilege log",
      "Email support",
    ],
  },
  firm: {
    id: "firm",
    label: "Firm",
    monthlyUsd: 499,
    perSeatUsd: 99,
    seats: 5,
    matters: 25,
    pagesPerMonth: 10_000,
    canPersist: true,
    blurb: "2-10 attorney firms",
    features: [
      "5 users · 25 active matters · 10,000 pages/mo",
      "Per-matter access lists + 5 roles",
      "Clio one-way import (when available)",
      "Conflicts check at intake",
      "Shared depo outline templates",
      "Priority email support",
    ],
  },
  firm_pro: {
    id: "firm_pro",
    label: "Firm Pro",
    monthlyUsd: 1499,
    perSeatUsd: 60,
    seats: 25,
    matters: Number.POSITIVE_INFINITY,
    pagesPerMonth: 100_000,
    canPersist: true,
    blurb: "10-50 attorney firms",
    features: [
      "25 users · unlimited matters · 100,000 pages/mo",
      "Ethical walls (hard-walled matters)",
      "SAML SSO + custom subdomain",
      "Audit-log outbound webhook (SIEM)",
      "Per-jurisdiction case-law packs",
      "Phone + Slack Connect support",
    ],
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    monthlyUsd: -1,
    perSeatUsd: 50,
    seats: Number.POSITIVE_INFINITY,
    matters: Number.POSITIVE_INFINITY,
    pagesPerMonth: Number.POSITIVE_INFINITY,
    canPersist: true,
    blurb: "50+ attorney firms · regulated practice",
    features: [
      "Unlimited everything",
      "Dedicated VPC + customer-managed keys",
      "HIPAA BAA + SOC 2 Type II report",
      "Same-business-day SLA",
      "White-glove onboarding + dedicated CSM",
      "Custom integrations",
    ],
  },
};

export function planSpec(plan: string | null | undefined): PlanSpec {
  if (plan && plan in PLANS) return PLANS[plan as PlanId];
  return PLANS.free;
}

export function canCreateMatter(plan: PlanSpec, currentCount: number): boolean {
  return currentCount < plan.matters;
}
