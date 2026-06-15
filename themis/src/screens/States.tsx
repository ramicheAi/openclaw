// Explicit state components per design handoff §14.
// First-run splash (cold start, 0 matters, breathing Tau) and the first-run
// empty dashboard (welcome + next-step tiles). Built as standalone exports
// so they can render in isolation (Storybook-ready when desired).

import { Tau } from "../components/BrandMark";
import { IconAdd, IconCite, IconArrow } from "../icons";
import { useAuth } from "../lib/auth";

export function FirstRunSplash({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="grid h-full place-items-center bg-[#070b13] text-brass-soft">
      <div className="text-center">
        <Tau size={160} tone="ink" breathe />
        <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-brass-light">
          Welcome to Themis
        </div>
        <div className="mt-1 font-display text-[22px] font-semibold text-[#e4eaf1]">Evidence intelligence for litigation</div>
        <p className="mx-auto mt-3 max-w-md text-[12.5px] leading-relaxed text-[#9aa6b3]">
          Drop a matter's document corpus in and Themis ingests it into a living, navigable case brain.
          Every claim is grounded in a verified citation.
        </p>
        <button
          onClick={onCreate}
          className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-brass bg-brass px-4 py-2 text-[13px] font-semibold text-[#070b13] transition hover:bg-brass-deep"
        >
          <IconAdd size={14} /> Create your first matter
        </button>
      </div>
    </div>
  );
}

/**
 * First-run dashboard for a brand new authed user with zero matters.
 * Warm welcome + three next-step tiles.
 */
export function FirstRunEmpty({ onCreate }: { onCreate?: () => void }) {
  const auth = useAuth();
  const firstName = auth.user?.name?.split(/\s+/)[0] ?? auth.user?.email?.split("@")[0] ?? "there";
  return (
    <div className="grid h-full place-items-center bg-paper px-6 py-10">
      <div className="w-full max-w-3xl">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ink">
            <Tau size={26} tone="ink" />
          </div>
          <div className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brass-deep">
            Welcome to Themis
          </div>
          <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight text-ink">
            Hi {firstName} — let's open your first matter.
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-ink-soft">
            Themis turns a matter's document corpus into a verifiable case brain. Pick how you'd like to start.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Tile
            primary
            icon={<IconAdd size={18} />}
            title="Create a matter"
            blurb="Pick a practice-area pack, upload PDFs + emails + depo transcripts, and Themis builds the brain in seconds."
            onClick={onCreate}
            cta="Create matter →"
          />
          <Tile
            href="/cite-check"
            icon={<IconCite size={18} />}
            title="Try Cite Check first"
            blurb="Paste any draft brief — Themis verifies every case citation against CourtListener. No matter required."
            cta="Open Cite Check →"
          />
          <Tile
            href="https://docs.themis.law"
            external
            icon={<IconArrow direction="right" size={18} />}
            title="Read the 5-minute tour"
            blurb="Quick guided walkthrough of the 8 tabs, the trust posture, and what Themis won't do (no fabricated cites — ever)."
            cta="Open the docs →"
          />
        </div>

        <div className="mt-10 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
          Need help? Email <a href="mailto:hello@themis.law" className="text-ink-soft hover:text-ink">hello@themis.law</a>
        </div>
      </div>
    </div>
  );
}

function Tile({
  title,
  blurb,
  icon,
  cta,
  onClick,
  href,
  external,
  primary,
}: {
  title: string;
  blurb: string;
  icon: React.ReactNode;
  cta: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  primary?: boolean;
}) {
  const inner = (
    <>
      <div className={primary ? "grid h-9 w-9 place-items-center rounded-lg bg-brass text-paper" : "grid h-9 w-9 place-items-center rounded-lg bg-brass-wash text-brass-deep"}>
        {icon}
      </div>
      <h3 className="mt-3 font-display text-[15.5px] font-semibold leading-snug text-ink">{title}</h3>
      <p className="mt-1.5 flex-1 text-[12px] leading-relaxed text-ink-soft">{blurb}</p>
      <div className={primary ? "mt-3 font-semibold text-brass-deep" : "mt-3 font-medium text-ink-soft"}>{cta}</div>
    </>
  );
  const className = primary
    ? "flex flex-col rounded-xl border-2 border-brass bg-surface p-5 text-left transition hover:bg-brass-wash"
    : "flex flex-col rounded-xl border border-line bg-surface p-5 text-left transition hover:border-brass-soft";
  if (href) {
    return (
      <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} className={className}>
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

