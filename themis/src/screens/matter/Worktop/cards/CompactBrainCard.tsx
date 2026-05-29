import type { MatterDetail } from "../../../../types";
import { Tau } from "../../../../components/BrandMark";

// Cinematic mini-canvas. Real force-directed render is wired in the Brain mode
// port; for the Worktop side rail we ship a tasteful placeholder that
// communicates the same idea (the mark breathing on dark) and a clear
// affordance to open the full Brain.

export function CompactBrainCard({ matter, onOpen }: { matter: MatterDetail; onOpen: () => void }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-brass-soft bg-gradient-to-b from-[#0c1622] to-[#070b13] shadow-[0_8px_24px_-12px_rgba(7,11,19,0.6)]">
      <div className="flex items-center justify-between px-3.5 pt-3">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-soft">
          Case Brain
        </span>
        <button
          onClick={onOpen}
          className="text-[11px] font-medium text-brass-soft hover:text-brass-light"
        >
          open ›
        </button>
      </div>
      <div className="relative grid h-[220px] place-items-center">
        <Tau size={108} tone="ink" breathe />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(166,124,58,0.18),transparent_60%)]" />
      </div>
      <div className="border-t border-white/5 px-3.5 py-2 font-mono text-[10px] text-brass-soft/70">
        {matter.docs.toLocaleString()} docs · {matter.pages.toLocaleString()} pg · ingest {matter.ingestPercent}%
      </div>
    </div>
  );
}
