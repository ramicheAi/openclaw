// Scales of Themis — mini. The beam tilts as verified, accepted evidence
// accrues to plaintiff vs defense. Spring 800ms cubic-bezier per spec.
//
// Weight model: each chronology event where accepted === true contributes
// weight by confidence (high=3, medium=2, low=1). Side is decided by issue
// tags — plaintiff theory tags (Retaliatory Motive, Pretext, Causation,
// Protected Activity, Adverse Action, Employer Knowledge, Wage Claim,
// Incident) weigh plaintiff; defense tags otherwise. Unverified or pending
// events show as translucent and weightless — the brand promise restated.

import { Card, SectionLabel } from "../../../../lib/ui";
import type { ChronEvent } from "../../../../types";

const PLAINTIFF_TAGS = new Set([
  "Retaliatory Motive",
  "Pretext",
  "Causation",
  "Protected Activity",
  "Adverse Action",
  "Employer Knowledge",
  "Wage Claim",
  "Incident",
  "Notice",
]);

function weightOf(e: ChronEvent): number {
  if (e.accepted !== true || !e.citation.verified) return 0;
  return e.confidence === "high" ? 3 : e.confidence === "medium" ? 2 : 1;
}

export function computeScales(events: ChronEvent[]) {
  let plaintiff = 0;
  let defense = 0;
  let pending = 0;
  for (const e of events) {
    const w = weightOf(e);
    if (w === 0) {
      pending++;
      continue;
    }
    const plaintiffSide = e.issueTags.some((t) => PLAINTIFF_TAGS.has(t));
    if (plaintiffSide) plaintiff += w;
    else defense += w;
  }
  const total = plaintiff + defense;
  const tilt = total === 0 ? 0 : ((plaintiff - defense) / total) * 12; // ±12° max
  return { plaintiff, defense, pending, tilt };
}

export function ScalesMini({ events }: { events: ChronEvent[] }) {
  const { plaintiff, defense, pending, tilt } = computeScales(events);
  const total = plaintiff + defense;
  const ratio = total === 0 ? 0.5 : plaintiff / total;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Scales of Themis</SectionLabel>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">
          {pending > 0 ? `${pending} pending` : "grounded"}
        </span>
      </div>
      <svg viewBox="0 0 180 100" className="mt-2 w-full" aria-label="Scales of Themis">
        {/* Plumb */}
        <line x1={90} y1={12} x2={90} y2={86} stroke="currentColor" className="text-ink" strokeWidth={2} />
        <rect x={70} y={84} width={40} height={6} rx={1.5} fill="currentColor" className="text-ink" />
        {/* Beam — tilts with spring */}
        <g
          style={{
            transformOrigin: "90px 18px",
            transform: `rotate(${-tilt}deg)`,
            transition: "transform 800ms cubic-bezier(.4,1.6,.4,1)",
          }}
        >
          <line x1={18} y1={18} x2={162} y2={18} stroke="currentColor" className="text-brass" strokeWidth={2.4} />
          {/* Left pan (plaintiff) */}
          <line x1={36} y1={18} x2={36} y2={46} stroke="currentColor" className="text-brass" strokeWidth={1.2} />
          <path d="M22 46 Q36 60 50 46" fill="none" stroke="currentColor" className="text-brass" strokeWidth={2} />
          <text x={36} y={58} textAnchor="middle" className="fill-current text-brass-deep" style={{ fontSize: 10, fontWeight: 600 }}>
            {plaintiff}
          </text>
          {/* Right pan (defense) */}
          <line x1={144} y1={18} x2={144} y2={46} stroke="currentColor" className="text-brass" strokeWidth={1.2} />
          <path d="M130 46 Q144 60 158 46" fill="none" stroke="currentColor" className="text-brass" strokeWidth={2} />
          <text x={144} y={58} textAnchor="middle" className="fill-current text-brass-deep" style={{ fontSize: 10, fontWeight: 600 }}>
            {defense}
          </text>
          {/* Fulcrum */}
          <circle cx={90} cy={18} r={3} fill="currentColor" className="text-ink" />
        </g>
      </svg>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-brass-deep">▲ Plaintiff</div>
        <div className="font-display text-[26px] font-semibold leading-none text-ink">{plaintiff}</div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-ink-faint">▽ Defense {defense}</div>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full bg-brass" style={{ width: `${ratio * 100}%`, transition: "width 800ms cubic-bezier(.4,1.6,.4,1)" }} />
      </div>
    </Card>
  );
}
