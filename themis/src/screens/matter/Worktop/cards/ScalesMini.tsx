// Scales of Themis — mini. The beam tilts as verified, accepted evidence
// accrues to plaintiff vs defense. Spring 800ms cubic-bezier per spec.
//
// Weight model: each chronology event where accepted === true contributes
// weight by confidence (high=3, medium=2, low=1). Side is decided by issue
// tags — plaintiff theory tags weigh plaintiff; defense tags otherwise.
// Unverified or pending events show as translucent and weightless — the
// brand promise restated.

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
  const tiltLabel =
    total === 0 ? `${pending} pending` : `tipped ${Math.abs(tilt).toFixed(1)}°`;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Scales of Themis</SectionLabel>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">
          {tiltLabel}
        </span>
      </div>

      {/* The scale — larger, more dramatic. Filled brass pans render the weight. */}
      <svg viewBox="0 0 220 130" className="mt-3 w-full" aria-label="Scales of Themis">
        {/* Plumb */}
        <line x1={110} y1={14} x2={110} y2={104} stroke="currentColor" className="text-brass" strokeWidth={2} opacity={0.55} />
        <rect x={84} y={102} width={52} height={6} rx={1.5} fill="currentColor" className="text-brass-deep" opacity={0.7} />
        <rect x={70} y={108} width={80} height={3} rx={1.5} fill="currentColor" className="text-brass" opacity={0.35} />

        {/* Beam — tilts with spring */}
        <g
          style={{
            transformOrigin: "110px 20px",
            transform: `rotate(${-tilt}deg)`,
            transition: "transform 800ms cubic-bezier(.4,1.6,.4,1)",
          }}
        >
          <line x1={20} y1={20} x2={200} y2={20} stroke="currentColor" className="text-brass" strokeWidth={2.4} />
          {/* Left pan — plaintiff (filled brass scallop, the brand) */}
          <line x1={46} y1={20} x2={46} y2={56} stroke="currentColor" className="text-brass" strokeWidth={1.4} opacity={0.85} />
          <path
            d="M22 56 Q46 78 70 56 L66 60 Q46 70 26 60 Z"
            fill="currentColor"
            className="text-brass"
            opacity={total === 0 ? 0.25 : 0.85}
          />
          <path d="M22 56 Q46 78 70 56" fill="none" stroke="currentColor" className="text-brass-deep" strokeWidth={1.4} />
          {/* Right pan — defense */}
          <line x1={174} y1={20} x2={174} y2={56} stroke="currentColor" className="text-brass" strokeWidth={1.4} opacity={0.85} />
          <path
            d="M150 56 Q174 78 198 56 L194 60 Q174 70 154 60 Z"
            fill="currentColor"
            className="text-brass"
            opacity={total === 0 ? 0.25 : 0.85}
          />
          <path d="M150 56 Q174 78 198 56" fill="none" stroke="currentColor" className="text-brass-deep" strokeWidth={1.4} />
          {/* Fulcrum */}
          <circle cx={110} cy={20} r={3.5} fill="currentColor" className="text-brass-deep" />
        </g>
      </svg>

      {/* Bottom row — labels on outside, big numbers on outside, weight bar between */}
      <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-end gap-3">
        <div className="text-left">
          <div className="font-mono text-[9.5px] uppercase tracking-wider text-brass-deep">▲ Plaintiff</div>
          <div className="mt-1 font-display text-[28px] font-semibold leading-none text-ink">{plaintiff}</div>
        </div>
        <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full bg-brass"
            style={{
              width: `${ratio * 100}%`,
              transition: "width 800ms cubic-bezier(.4,1.6,.4,1)",
            }}
          />
        </div>
        <div className="text-right">
          <div className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft">▽ Defense</div>
          <div className="mt-1 font-display text-[28px] font-semibold leading-none text-ink">{defense}</div>
        </div>
      </div>
    </Card>
  );
}
