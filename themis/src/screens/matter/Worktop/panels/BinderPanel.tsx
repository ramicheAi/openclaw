// Binder panel — empty state.
//
// Per design handoff §10, full binder CRUD is new backend work scheduled for
// Sprint 2 (POST/PATCH /binders + export). Until those endpoints land, this
// panel renders the same empty state the design specifies — a meaningful
// affordance, not a placeholder.

import { IconBinder, IconAdd, IconCmdK } from "../../../../icons";
import { PanelHead } from "./PanelHead";

export function BinderPanel({ onOpenCmdK }: { onOpenCmdK: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PanelHead
        eyebrow="Binder · Exhibit assembly"
        title="Build the binder"
        sub="Drop documents into named binders to assemble exhibit sets for depo, motion, or trial."
      />
      <div className="grid min-h-0 flex-1 place-items-center px-6 py-10">
        <div className="max-w-md text-center">
          <div
            className="mx-auto grid h-32 w-full max-w-sm place-items-center rounded-xl border-2 border-dashed border-brass-soft/60 text-brass"
            style={{
              background:
                "repeating-linear-gradient(45deg, var(--color-brass-wash) 0 12px, transparent 12px 24px)",
            }}
          >
            <IconBinder size={36} />
          </div>
          <div className="mt-4 font-display text-[18px] font-semibold text-ink">No binders yet</div>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            Drag documents here from the Documents tab, or use{" "}
            <button
              onClick={onOpenCmdK}
              className="inline-flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-soft hover:border-brass-soft hover:text-brass-deep"
            >
              <IconCmdK size={10} className="text-brass" /> ⌘K
            </button>{" "}
            → <em>add to binder</em>.
          </p>
          <button className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-brass bg-brass px-3 py-1.5 text-[12px] font-semibold text-paper transition hover:bg-brass-deep">
            <IconAdd size={13} /> New binder
          </button>
          <div className="mt-3 font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">
            Binder CRUD lands in Sprint 2 — see design handoff §10
          </div>
        </div>
      </div>
    </div>
  );
}
