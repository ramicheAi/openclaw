import { ArrowUpRight, Check, CircleAlert, Gavel, Scale, ShieldCheck } from "lucide-react";
import {
  caseTheory,
  documents,
  gapFindings,
  ingestStages,
} from "../../data/mock";
import { Card, cx, HotTag, Pill, SectionLabel } from "../../lib/ui";
import type { MatterTab } from "./MatterShell";

const gapTone = {
  high: "border-l-danger bg-danger-wash/40",
  medium: "border-l-flag bg-flag-wash/40",
  low: "border-l-info bg-info-wash/40",
};

export function Overview({ onTab }: { onTab: (t: MatterTab) => void }) {
  const hot = documents.filter((d) => d.hot).slice(0, 4);
  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Case theory */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Gavel size={16} className="text-brass" />
            <SectionLabel>Case theory · context.md</SectionLabel>
          </div>
          <p className="text-[14px] leading-relaxed text-ink">{caseTheory.posture}</p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[12px] font-semibold text-ink">Claims</div>
              <ul className="space-y-1">
                {caseTheory.claims.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[13px] text-ink-soft">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brass" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1.5 text-[12px] font-semibold text-ink">Defenses asserted</div>
              <ul className="space-y-1">
                {caseTheory.defenses.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[13px] text-ink-soft">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
            {caseTheory.keyDates.map((k) => (
              <span
                key={k.label}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-sunken px-2 py-1 text-[11px] text-ink-soft"
              >
                <span className="font-mono text-ink">{k.date}</span>
                <span className="text-ink-faint">·</span>
                {k.label}
              </span>
            ))}
          </div>
        </Card>

        {/* Ingest pipeline */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-verify" />
            <SectionLabel>Pipeline</SectionLabel>
          </div>
          <ol className="space-y-2.5">
            {ingestStages.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
                <span
                  className={cx(
                    "grid h-5 w-5 place-items-center rounded-full",
                    s.done ? "bg-verify text-white" : "bg-surface-sunken text-ink-faint",
                  )}
                >
                  {s.done && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={s.done ? "text-ink" : "text-ink-faint"}>{s.label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
            Premium OCR + dedup + email threading applied. Every extracted claim is
            citation-verified against its Bates page before display.
          </div>
        </Card>

        {/* Hot docs */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale size={16} className="text-brass" />
              <SectionLabel>Hot documents</SectionLabel>
            </div>
            <button
              onClick={() => onTab("documents")}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-brass-deep hover:underline"
            >
              Open binder <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="space-y-2">
            {hot.map((d) => (
              <button
                key={d.id}
                onClick={() => onTab("documents")}
                className="flex w-full items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-sunken"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-ink-faint">{d.bates}</span>
                    <HotTag />
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-medium text-ink">{d.title}</div>
                  <div className="mt-0.5 line-clamp-1 text-[12px] text-ink-soft">{d.summary}</div>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">{d.date}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Gap analysis */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <CircleAlert size={16} className="text-flag" />
            <SectionLabel>Gap analysis</SectionLabel>
          </div>
          <div className="space-y-2.5">
            {gapFindings.map((g, i) => (
              <div
                key={i}
                className={cx("rounded-r-lg border-l-2 px-3 py-2 text-[12px] leading-snug text-ink-soft", gapTone[g.severity])}
              >
                {g.text}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Pill tone="info">Draft RFPs from gaps</Pill>
          </div>
        </Card>
      </div>
    </div>
  );
}
