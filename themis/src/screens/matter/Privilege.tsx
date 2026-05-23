import { useState } from "react";
import { FileLock2, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { documents } from "../../data/mock";
import { Card, cx, SectionLabel } from "../../lib/ui";

type Decision = "pending" | "cleared" | "withheld";

export function Privilege() {
  const flagged = documents.filter((d) => d.privilege === "flagged");
  const [decisions, setDecisions] = useState<Record<string, Decision>>(
    Object.fromEntries(flagged.map((d) => [d.id, "pending"])),
  );

  const counts = {
    pending: Object.values(decisions).filter((d) => d === "pending").length,
    cleared: Object.values(decisions).filter((d) => d === "cleared").length,
    withheld: Object.values(decisions).filter((d) => d === "withheld").length,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[13px]">
            <ShieldAlert size={16} className="text-flag" />
            <span className="font-medium text-ink">Privilege review queue</span>
          </div>
          <div className="flex gap-1.5 text-[12px]">
            <span className="rounded-full bg-flag-wash px-2 py-0.5 font-medium text-flag">
              {counts.pending} pending
            </span>
            <span className="rounded-full bg-verify-wash px-2 py-0.5 font-medium text-verify">
              {counts.cleared} cleared
            </span>
            <span className="rounded-full bg-danger-wash px-2 py-0.5 font-medium text-danger">
              {counts.withheld} withheld
            </span>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink">
          <FileLock2 size={15} /> Generate privilege log
        </button>
      </div>

      <div className="border-b border-line bg-flag-wash/40 px-6 py-2.5 text-[12px] text-flag">
        Themis <span className="font-semibold">flags</span> potential privilege; it never decides.
        A human must clear or withhold every document before production.
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-3">
          {flagged.map((d) => {
            const decision = decisions[d.id];
            return (
              <Card
                key={d.id}
                className={cx(
                  "p-4",
                  decision === "cleared" && "border-verify/30",
                  decision === "withheld" && "border-danger/30",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-ink-faint">{d.bates}</span>
                      <span className="text-[11px] text-ink-faint">· {d.date} ·</span>
                      <span className="text-[11px] text-ink-faint">{d.type}</span>
                    </div>
                    <div className="mt-0.5 text-[14px] font-medium text-ink">{d.title}</div>
                  </div>
                  {decision !== "pending" && (
                    <span
                      className={cx(
                        "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                        decision === "cleared"
                          ? "bg-verify-wash text-verify"
                          : "bg-danger-wash text-danger",
                      )}
                    >
                      {decision === "cleared" ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                      {decision === "cleared" ? "Cleared for production" : "Withheld"}
                    </span>
                  )}
                </div>

                <div className="mt-2.5 rounded-lg border border-flag/25 bg-flag-wash/60 px-3 py-2">
                  <SectionLabel>Why flagged</SectionLabel>
                  <p className="text-[12.5px] leading-relaxed text-ink">{d.privilegeBasis}</p>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => setDecisions((p) => ({ ...p, [d.id]: "withheld" }))}
                    className={cx(
                      "flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
                      decision === "withheld"
                        ? "border-danger bg-danger text-white"
                        : "border-line text-ink-soft hover:border-danger hover:text-danger",
                    )}
                  >
                    Withhold (privileged)
                  </button>
                  <button
                    onClick={() => setDecisions((p) => ({ ...p, [d.id]: "cleared" }))}
                    className={cx(
                      "flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
                      decision === "cleared"
                        ? "border-verify bg-verify text-white"
                        : "border-line text-ink-soft hover:border-verify hover:text-verify",
                    )}
                  >
                    Clear (not privileged)
                  </button>
                </div>
              </Card>
            );
          })}

          <div className="flex items-center justify-center gap-2 pt-2 text-[12px] text-ink-faint">
            <Scale size={14} /> Decisions are logged to the matter audit trail with reviewer and timestamp.
          </div>
        </div>
      </div>
    </div>
  );
}
