// Pricing page — the four paid tiers + the free wedge. Routed via the
// pathname /pricing so it can be linked from outside the app (marketing
// site, ABA Journal article, etc.). When the visitor is signed in,
// "Subscribe" hits Stripe Checkout; otherwise it bounces them through
// the magic-link login first and resumes after.

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cx } from "../lib/ui";
import { Tau } from "../components/BrandMark";

interface Tier {
  id: "free" | "solo" | "firm" | "firm_pro" | "enterprise";
  label: string;
  monthly: number;
  blurb: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "free",
    label: "Free",
    monthly: 0,
    blurb: "Cite Check only · the Mata shield",
    features: [
      "Public Cite Check, no account required",
      "CourtListener-verified authorities",
      "50 paste-checks per day",
      "No save · no matters · no chat",
    ],
    cta: "Use free →",
  },
  {
    id: "solo",
    label: "Solo",
    monthly: 99,
    blurb: "Solo practitioners",
    features: [
      "1 user · 5 active matters · 1,000 pages/mo",
      "Every Themis feature — Chat, Draft, Damages, Share, Depo",
      "Unlimited Bates verification",
      "Privilege log + chronology PDFs",
      "Email support",
    ],
    cta: "Start Solo",
  },
  {
    id: "firm",
    label: "Firm",
    monthly: 499,
    blurb: "2-10 attorney firms",
    features: [
      "5 users · 25 matters · 10,000 pages/mo",
      "Per-matter roles (admin/partner/associate/paralegal/readonly)",
      "Conflicts check at intake",
      "Clio / MyCase one-way import (coming Q1)",
      "Priority email support",
    ],
    cta: "Start Firm",
    highlight: true,
  },
  {
    id: "firm_pro",
    label: "Firm Pro",
    monthly: 1499,
    blurb: "10-50 attorney firms",
    features: [
      "25 users · unlimited matters · 100,000 pages/mo",
      "Ethical walls (hard-walled adverse-rep matters)",
      "SAML SSO · custom subdomain",
      "Outbound webhook to your SIEM",
      "Per-jurisdiction case-law packs",
      "Slack Connect + phone support",
    ],
    cta: "Start Firm Pro",
  },
  {
    id: "enterprise",
    label: "Enterprise",
    monthly: -1,
    blurb: "50+ attorney firms · regulated practice",
    features: [
      "Unlimited everything",
      "Dedicated VPC + customer-managed keys",
      "HIPAA BAA · SOC 2 Type II",
      "Same-business-day SLA",
      "White-glove onboarding + dedicated CSM",
    ],
    cta: "Talk to sales",
  },
];

export function PricingScreen() {
  const auth = useAuth();
  const status = useQuery({ queryKey: ["billing-status"], queryFn: api.billingStatus });
  const checkout = useMutation({ mutationFn: (plan: Tier["id"]) => api.billingCheckout(plan) });
  const [bouncePlan, setBouncePlan] = useState<Tier["id"] | null>(null);

  function pick(tier: Tier) {
    if (tier.id === "free") {
      window.location.href = "/cite-check";
      return;
    }
    if (tier.id === "enterprise") {
      window.location.href = "mailto:sales@themis.law?subject=Themis%20Enterprise%20inquiry";
      return;
    }
    if (!auth.user && auth.mode === "multi-tenant") {
      // Save the intent, bounce to login, return here.
      setBouncePlan(tier.id);
      window.location.href = `/?login_next=/pricing?plan=${tier.id}`;
      return;
    }
    checkout.mutate(tier.id, {
      onSuccess: (r) => {
        if (r.url) window.location.href = r.url;
      },
    });
  }

  const currentPlan = status.data?.plan ?? "free";

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink"><Tau size={18} tone="ink" /></div>
            <span className="font-display text-[18px] font-semibold leading-none text-ink">Themis</span>
          </a>
          <nav className="flex items-center gap-4 text-[13px]">
            <a href="/cite-check" className="text-ink-soft hover:text-ink">Try free</a>
            <a href="/" className="text-ink-soft hover:text-ink">App</a>
            {auth.user && <span className="font-mono text-[10.5px] text-ink-faint">{auth.user.email}</span>}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-center">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brass-deep">Themis · Evidence Intelligence</div>
          <h1 className="mt-2 font-display text-[36px] font-semibold leading-tight text-ink">
            Verifiable AI for litigation.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-soft">
            Every citation grounded. Every authority CourtListener-verified.
            Every action hash-chained. Post-Mata, that's the only category that matters.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-5">
          {TIERS.map((t) => {
            const isCurrent = currentPlan === t.id;
            return (
              <div
                key={t.id}
                className={cx(
                  "flex flex-col rounded-xl border bg-surface p-5",
                  t.highlight ? "border-brass shadow-[0_24px_64px_-24px_rgba(166,124,58,0.4)]" : "border-line",
                )}
              >
                {t.highlight && (
                  <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-brass-wash px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-brass-deep w-fit">
                    Most popular
                  </div>
                )}
                <div className="font-display text-[18px] font-semibold leading-tight text-ink">{t.label}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-soft">{t.blurb}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  {t.monthly === 0 ? (
                    <span className="font-display text-[28px] font-semibold text-ink">Free</span>
                  ) : t.monthly === -1 ? (
                    <span className="font-display text-[20px] font-semibold text-ink">Contact</span>
                  ) : (
                    <>
                      <span className="font-display text-[28px] font-semibold text-ink">${t.monthly}</span>
                      <span className="text-[12px] text-ink-soft">/mo</span>
                    </>
                  )}
                </div>
                <ul className="mt-3 flex-1 space-y-1.5">
                  {t.features.map((f, i) => (
                    <li key={i} className="text-[12px] leading-snug text-ink">
                      <span className="mr-1.5 text-brass">·</span>{f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => pick(t)}
                  disabled={isCurrent || checkout.isPending || bouncePlan === t.id}
                  className={cx(
                    "mt-4 rounded-md px-3 py-2 text-[12.5px] font-semibold transition",
                    isCurrent
                      ? "border border-line bg-surface-sunken text-ink-faint cursor-default"
                      : t.highlight
                        ? "bg-brass text-paper hover:bg-brass-deep"
                        : "border border-line bg-paper text-ink hover:border-brass-soft hover:text-brass-deep",
                    "disabled:opacity-50",
                  )}
                >
                  {isCurrent ? "Current plan" : checkout.isPending && bouncePlan === t.id ? "Redirecting…" : t.cta}
                </button>
                {status.data?.plan && t.id === currentPlan && status.data.planActiveUntil && (
                  <div className="mt-2 text-[10.5px] text-ink-faint">
                    Renews {status.data.planActiveUntil.slice(0, 10)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {checkout.error && (
          <div className="mx-auto mt-6 max-w-2xl rounded-md border border-flag/30 bg-flag-wash p-3 text-[12px] text-flag">
            {checkout.error instanceof Error ? checkout.error.message : "Checkout failed."}
          </div>
        )}

        <div className="mt-12 rounded-xl border border-line bg-surface px-6 py-5 text-center">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">Why Themis</div>
          <p className="mx-auto mt-2 max-w-2xl text-[13px] leading-relaxed text-ink">
            Themis is the evidence layer. Plug it into Clio, NetDocs, your DMS — whatever you use to manage matters.
            Themis adds the trust posture (verified citations, hash-chained audit, privilege wall) that nothing else does.
            Built specifically to keep your firm out of the next <em>Mata v. Avianca</em>.
          </p>
        </div>
      </main>

      <footer className="mt-12 border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-6 text-center text-[11px] text-ink-faint">
          Themis · Evidence Intelligence · Built for litigation paralegals + attorneys
        </div>
      </footer>
    </div>
  );
}
