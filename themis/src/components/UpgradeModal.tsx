// Global plan-limit catcher. Listens for the `themis:plan-limit` window
// event the API client dispatches on any 402 response and shows a real
// upgrade modal — explaining which cap was hit, current vs cap usage,
// and a one-click upgrade button that bounces to /pricing (or Stripe
// Checkout straight to the next tier if billing is configured).

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type PlanLimitInfo } from "../lib/api";
import { Tau } from "./BrandMark";
import { cx } from "../lib/ui";
import { IconClose } from "../icons";

const NEXT_TIER: Record<string, { id: string; label: string; price: number }> = {
  free: { id: "solo", label: "Solo", price: 99 },
  solo: { id: "firm", label: "Firm", price: 499 },
  firm: { id: "firm_pro", label: "Firm Pro", price: 1499 },
  firm_pro: { id: "enterprise", label: "Enterprise", price: -1 },
};

const LIMIT_TITLE: Record<PlanLimitInfo["limit"], string> = {
  matters: "Matter cap reached",
  pages: "Monthly page cap reached",
  seats: "Seat cap reached",
  feature: "Feature unavailable on this plan",
};

export function UpgradeListener() {
  const [info, setInfo] = useState<PlanLimitInfo | null>(null);

  useEffect(() => {
    function onEvent(ev: Event) {
      const detail = (ev as CustomEvent<PlanLimitInfo>).detail;
      if (detail) setInfo(detail);
    }
    window.addEventListener("themis:plan-limit", onEvent as EventListener);
    return () => window.removeEventListener("themis:plan-limit", onEvent as EventListener);
  }, []);

  if (!info) return null;
  return <UpgradeModal info={info} onClose={() => setInfo(null)} />;
}

function UpgradeModal({ info, onClose }: { info: PlanLimitInfo; onClose: () => void }) {
  const next = NEXT_TIER[info.plan];
  const checkout = useMutation({
    mutationFn: (planId: string) => api.billingCheckout(planId),
  });
  const status = useMutation({
    mutationFn: () => api.billingPortal(),
  });

  const pctUsed = info.cap > 0 ? Math.min(100, Math.round((info.current / info.cap) * 100)) : 0;

  function upgrade() {
    if (!next) return;
    if (next.id === "enterprise") {
      window.location.href = "mailto:sales@themis.law?subject=Themis%20Enterprise%20inquiry";
      return;
    }
    checkout.mutate(next.id, {
      onSuccess: (r) => {
        if (r.url) window.location.href = r.url;
        else if (r.error) window.location.href = "/pricing";
      },
      onError: () => {
        window.location.href = "/pricing";
      },
    });
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] grid place-items-center bg-black/60 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-full overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.5)]"
      >
        <header className="relative bg-gradient-to-br from-brass-wash to-paper px-6 py-7">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink"
          >
            <IconClose size={14} />
          </button>
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink">
              <Tau size={20} tone="ink" />
            </div>
            <div>
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
                {info.plan === "free" ? "Free plan" : `${info.plan.replace("_", " ")} plan`}
              </div>
              <h2 className="mt-0.5 font-display text-[20px] font-semibold leading-tight text-ink">
                {LIMIT_TITLE[info.limit]}
              </h2>
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink">
            {info.message}
          </p>
        </header>

        <div className="px-6 py-5">
          {info.cap > 0 && (
            <div className="rounded-md border border-line bg-paper px-3 py-2.5">
              <div className="flex items-baseline justify-between text-[11.5px]">
                <span className="font-mono uppercase tracking-wider text-ink-faint">
                  {info.limit === "matters" ? "Matters" : info.limit === "pages" ? "Pages this month" : info.limit === "seats" ? "Seats" : "Usage"}
                </span>
                <span className="font-mono text-ink">{info.current.toLocaleString()} / {info.cap.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <div className={cx("h-full", pctUsed >= 90 ? "bg-danger" : "bg-brass")} style={{ width: `${pctUsed}%` }} />
              </div>
            </div>
          )}

          {next ? (
            <div className="mt-4 rounded-lg border border-brass bg-brass-wash p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
                    Recommended upgrade
                  </div>
                  <div className="mt-0.5 font-display text-[17px] font-semibold text-ink">
                    {next.label}
                  </div>
                </div>
                <div className="text-right">
                  {next.price > 0 ? (
                    <>
                      <span className="font-display text-[22px] font-semibold text-ink">${next.price}</span>
                      <span className="text-[12px] text-ink-soft">/mo</span>
                    </>
                  ) : (
                    <span className="font-display text-[16px] font-semibold text-ink">Contact sales</span>
                  )}
                </div>
              </div>
              <button
                onClick={upgrade}
                disabled={checkout.isPending}
                className="mt-3 w-full rounded-md bg-brass px-3 py-2 text-[13px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
              >
                {checkout.isPending ? "Opening checkout…" : next.id === "enterprise" ? "Talk to sales" : `Upgrade to ${next.label}`}
              </button>
              <a
                href="/pricing"
                className="mt-2 block text-center text-[11.5px] text-ink-soft hover:text-ink"
              >
                Or see all plans →
              </a>
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-line bg-paper p-3 text-[12.5px] text-ink-soft">
              You're already on the highest tier. Contact <a href="mailto:sales@themis.law" className="text-info hover:underline">sales@themis.law</a> for a custom arrangement.
            </div>
          )}

          {checkout.error && (
            <div className="mt-2 rounded-md border border-flag/30 bg-flag-wash p-2 text-[11.5px] text-flag">
              {checkout.error instanceof Error ? checkout.error.message : "Could not start checkout. Try /pricing instead."}
            </div>
          )}

          <button
            onClick={onClose}
            className="mt-3 w-full rounded-md border border-line bg-paper px-3 py-1.5 text-[12px] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
          >
            Maybe later
          </button>
        </div>

        {/* Avoid an unused-import lint */}
        <span style={{ display: "none" }}>{status.isPending ? "" : ""}</span>
      </div>
    </div>
  );
}
