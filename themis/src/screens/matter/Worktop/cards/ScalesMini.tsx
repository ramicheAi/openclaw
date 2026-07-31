// Scales of Themis — mini. Per Claude Design source (worktop.jsx §ScalesMini)
// and design brief §5.4b. The beam tilts as accepted-and-verified evidence
// accrues to plaintiff vs defense; unverified is weightless. 800ms cubic-
// bezier spring on the rotation. Below the SVG: PLAINTIFF and DEFENSE pills
// flank a horizontal weight ratio bar with the big Fraunces numerals on the
// outside.

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
  // Match the design source: ratio drives a tilt up to ±14°.
  const tilt = total === 0 ? 0 : ((plaintiff - defense) / total) * 14;
  return { plaintiff, defense, pending, tilt };
}

export function ScalesMini({ events }: { events: ChronEvent[] }) {
  const { plaintiff, defense, pending, tilt } = computeScales(events);
  const total = plaintiff + defense;
  const ratio = total === 0 ? 0.5 : plaintiff / total;
  const tiltLabel = total === 0 ? (pending > 0 ? `${pending} pending` : "even") : `tipped ${Math.abs(tilt).toFixed(1)}°`;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Scales of Themis</SectionLabel>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">{tiltLabel}</span>
      </div>

      {/* SVG composition follows worktop.jsx §ScalesMini exactly: linear-
       * gradient brass on the beam + pans, hairline chains, ellipse pans,
       * stem and base from a separate gradient, fulcrum dot. */}
      <div className="mt-2.5 w-full">
        <svg viewBox="0 0 200 100" className="w-full" aria-label="Scales of Themis">
          <defs>
            <linearGradient id="brassMini" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#e9cf95" />
              <stop offset="1" stopColor="#a67c3a" />
            </linearGradient>
          </defs>
          {/* Base + plumb (static — the foundation never moves) */}
          <rect x={90} y={80} width={20} height={6} rx={1} fill="url(#brassMini)" />
          <rect x={96} y={22} width={8} height={60} fill="url(#brassMini)" />
          <circle cx={100} cy={22} r={5} fill="url(#brassMini)" stroke="#3a2a14" strokeWidth={0.6} />

          {/* Beam group — tilts with the spring. Origin at fulcrum (100,22). */}
          <g
            style={{
              transformOrigin: "100px 22px",
              transform: `rotate(${tilt}deg)`,
              transition: "transform 800ms cubic-bezier(.4,1.6,.4,1)",
            }}
          >
            <rect x={20} y={20} width={160} height={4} rx={1.5} fill="url(#brassMini)" />
            <line x1={40} y1={22} x2={40} y2={50} stroke="#caa05c" strokeWidth={0.8} />
            <line x1={160} y1={22} x2={160} y2={50} stroke="#caa05c" strokeWidth={0.8} />
            <ellipse cx={40} cy={56} rx={22} ry={5} fill="#e9cf95" stroke="#7a5c2a" strokeWidth={0.6} />
            <ellipse cx={160} cy={56} rx={22} ry={5} fill="#e9cf95" stroke="#7a5c2a" strokeWidth={0.6} />
          </g>
        </svg>
      </div>

      {/* Readout — PLAINTIFF pill + big numeral · weight bar · DEFENSE pill */}
      <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-end gap-3">
        <div>
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
