// Explicit state components per design handoff §14.
// First-run splash (cold start, 0 matters, breathing Tau) and dashboard-empty
// (dashed-border empty card with Create / Import). Built as standalone exports
// so they can render in isolation (Storybook-ready when desired).

import { Tau } from "../components/BrandMark";
import { IconAdd, IconExport } from "../icons";

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

export function DashboardEmpty({ onCreate, onImport }: { onCreate?: () => void; onImport?: () => void }) {
  return (
    <div className="grid h-full place-items-center bg-paper">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto grid h-32 w-full place-items-center rounded-xl border-2 border-dashed border-line-strong">
          <Tau size={56} tone="paper" />
        </div>
        <div className="mt-4 font-display text-[18px] font-semibold text-ink">No matters yet</div>
        <p className="mt-1 text-[12.5px] text-ink-soft">
          Start by spinning up a new case brain, or pull an existing matter in from your e-discovery platform.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-1.5 rounded-md border border-brass bg-brass px-3 py-1.5 text-[12px] font-semibold text-paper transition hover:bg-brass-deep"
          >
            <IconAdd size={13} /> New matter
          </button>
          <button
            onClick={onImport}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft transition hover:border-line-strong hover:text-ink"
          >
            <IconExport size={13} /> Import from Relativity
          </button>
        </div>
      </div>
    </div>
  );
}
