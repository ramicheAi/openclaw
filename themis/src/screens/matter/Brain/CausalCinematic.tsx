// CausalCinematic — the "32 days" hero numeral overlay per design brief
// section 5.5 and design source app.jsx CinematicOverlay. Renders only when
// a causal chain is active AND highlightActive is true.
//
// The overlay floats over the canvas with low alpha so it never obscures
// the brain — it amplifies it. Fraunces 200pt+ for the numeral, the
// "PROTECTED ACTIVITY → ADVERSE ACTION" eyebrow above, days/arc/meta below.
//
// Auto-dismisses 1.5s after first paint per the brief unless held by hover.

import { useEffect, useState } from "react";
import type { CausalChain, ChronEvent } from "../../../types";

interface Props {
  chain: CausalChain | null;
  events: ChronEvent[];
  active: boolean;
  docCount: number;
  verifiedCount: number;
  flaggedCount: number;
}

function dayDelta(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function CausalCinematic({ chain, events, active, docCount, verifiedCount, flaggedCount }: Props) {
  const [visible, setVisible] = useState(false);

  // Fade in immediately when active becomes true; auto-fade after 1.5s.
  useEffect(() => {
    if (!active || !chain) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 1500);
    return () => window.clearTimeout(t);
  }, [active, chain?.id]);

  if (!chain || !active) return null;

  // Compute span between first and last accepted event in the chain.
  const chainEventIds = chain.nodes.filter((n) => n.kind === "event").map((n) => n.id);
  const chainEvents = events
    .filter((e) => chainEventIds.includes(e.id))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (chainEvents.length < 2) return null;

  const span = dayDelta(chainEvents[0].date, chainEvents[chainEvents.length - 1].date);
  const firstLabel = chainEvents[0].description.split(/[.,]/)[0].slice(0, 28);
  const lastLabel = chainEvents[chainEvents.length - 1].description.split(/[.,]/)[0].slice(0, 28);
  const eyebrow = chain.name.toUpperCase();

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 grid place-items-center transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden
    >
      <div className="select-none text-center">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.32em] text-brass-soft/80">
          {eyebrow}
        </div>
        <div
          className="font-display font-semibold leading-[0.9] text-brass-light"
          style={{ fontSize: "260px", textShadow: "0 8px 60px rgba(0,0,0,0.55)" }}
        >
          {span}
        </div>
        <div className="font-display text-[34px] font-light leading-none text-brass-soft">days</div>
        <div className="mt-5 flex items-center justify-center gap-3 text-[12.5px] uppercase tracking-[0.18em] text-ink-soft">
          <span>{firstLabel}</span>
          <span className="inline-block h-px w-12 bg-gradient-to-r from-transparent via-brass to-transparent" />
          <span>{lastLabel}</span>
        </div>
        <div className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-faint">
          {docCount} documents · {verifiedCount} verified citations · {flaggedCount} privilege-walled · {chainEvents.length} chronology events
        </div>
      </div>
    </div>
  );
}
