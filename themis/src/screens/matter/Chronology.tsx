import { useState } from "react";
import { Check, Download, Plus, X } from "lucide-react";
import { chronology } from "../../data/mock";
import { CitationChip, ConfidenceDot, cx, Pill } from "../../lib/ui";
import type { ChronEvent } from "../../types";

export function Chronology() {
  const [rows, setRows] = useState<ChronEvent[]>(chronology);

  function setStatus(id: string, accepted: boolean) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, accepted: r.accepted === accepted ? null : accepted } : r)),
    );
  }

  const pending = rows.filter((r) => r.accepted === null).length;
  const accepted = rows.filter((r) => r.accepted === true).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3">
        <div className="flex items-center gap-2 text-[13px] text-ink-soft">
          <Pill tone="verify">{accepted} accepted</Pill>
          <Pill tone="brass">{pending} pending review</Pill>
          <span className="text-ink-faint">Draft chronology — every row cites a verified source</span>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink">
          <Download size={15} /> Export (DOCX)
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-4xl">
          <ol className="relative border-l-2 border-line pl-6">
            {rows.map((r) => (
              <li key={r.id} className="relative mb-5 last:mb-0">
                <span
                  className={cx(
                    "absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-paper",
                    r.accepted === true
                      ? "bg-verify"
                      : r.accepted === false
                        ? "bg-ink-faint"
                        : "bg-brass",
                  )}
                />
                <div
                  className={cx(
                    "rounded-xl border bg-surface p-4 transition-opacity",
                    r.accepted === false ? "border-line opacity-50" : "border-line",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold text-ink">{r.date}</span>
                        <ConfidenceDot level={r.confidence} />
                      </div>
                      <p className="mt-1 text-[14px] leading-relaxed text-ink">{r.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <CitationChip c={r.citation} />
                        {r.issueTags.map((t) => (
                          <span
                            key={t}
                            className="rounded border border-brass-soft bg-brass-wash px-1.5 py-0.5 text-[10px] font-medium text-brass-deep"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setStatus(r.id, true)}
                        title="Accept row"
                        className={cx(
                          "grid h-8 w-8 place-items-center rounded-lg border transition-colors",
                          r.accepted === true
                            ? "border-verify bg-verify text-white"
                            : "border-line text-ink-soft hover:border-verify hover:text-verify",
                        )}
                      >
                        <Check size={16} strokeWidth={2.6} />
                      </button>
                      <button
                        onClick={() => setStatus(r.id, false)}
                        title="Reject row"
                        className={cx(
                          "grid h-8 w-8 place-items-center rounded-lg border transition-colors",
                          r.accepted === false
                            ? "border-ink-faint bg-ink-faint text-white"
                            : "border-line text-ink-soft hover:border-danger hover:text-danger",
                        )}
                      >
                        <X size={16} strokeWidth={2.6} />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <button className="mt-5 inline-flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-brass hover:text-brass">
            <Plus size={15} /> Add event manually
          </button>
        </div>
      </div>
    </div>
  );
}
