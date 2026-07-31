import { Card, SectionLabel } from "../../../../lib/ui";
import type { MatterDetail } from "../../../../types";

export function CaseSnapshotCard({ matter }: { matter: MatterDetail }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Case</SectionLabel>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">
          {matter.docs.toLocaleString()} docs · {matter.pages.toLocaleString()} pg
        </span>
      </div>
      <h3 className="mt-1 font-display text-[16px] font-semibold text-ink">{matter.name}</h3>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">{matter.caseTheory.posture}</p>
      <div className="mt-3 text-[9.5px] font-semibold uppercase tracking-wider text-brass-deep">Plaintiff theory</div>
      <ul className="mt-1.5 space-y-1">
        {matter.caseTheory.claims.map((c) => (
          <li key={c} className="text-[12px] text-ink">
            <span className="text-brass">·</span> {c}
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-line pt-2.5">
        <div className="text-[9.5px] font-semibold uppercase tracking-wider text-brass-deep">Key dates</div>
        <ul className="mt-1.5 divide-y divide-line">
          {matter.caseTheory.keyDates.map((d) => (
            <li key={d.label} className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
              <span className="text-ink-soft">{d.label}</span>
              <span className="font-mono text-[11px] text-ink">{d.date}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
