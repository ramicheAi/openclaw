import { useState } from "react";
import { CitationChip, ConfidenceDot, cx } from "../../../../lib/ui";
import { IconExport, IconVerified, IconClose, IconReplay, IconPrivileged } from "../../../../icons";
import { useChronology, useMatter, useSetChronologyAccepted } from "../../../../lib/queries";
import { exportChronologyDoc, exportChronologyPdf } from "../../../../lib/exports";
import { PanelAction, PanelHead } from "./PanelHead";
import { ChronologyExportPreview } from "./ExportPreviewModal";

function dayDelta(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function ChronologyPanel({
  matterId,
  exportsLocked,
  lockReason,
}: {
  matterId: string;
  exportsLocked: boolean;
  lockReason?: string;
}) {
  const { data: events } = useChronology(matterId);
  const { data: matter } = useMatter(matterId);
  const setAccepted = useSetChronologyAccepted(matterId);
  const [exportFormat, setExportFormat] = useState<null | "pdf" | "docx">(null);

  const rows = events ?? [];
  const accepted = rows.filter((e) => e.accepted === true).length;
  const pending = rows.filter((e) => e.accepted === null).length;
  const rejected = rows.filter((e) => e.accepted === false).length;
  const verifiedPct =
    rows.length === 0 ? 0 : Math.round((rows.filter((e) => e.citation.verified).length / rows.length) * 100);

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PanelHead
        eyebrow="Chronology · Draft until accepted"
        title="Timeline"
        sub="Every event is grounded in a verified citation. Accept to advance the case theory; reject to exclude."
        actions={
          <>
            <PanelAction
              disabled={exportsLocked || !matter}
              onClick={() => setExportFormat("docx")}
            >
              <IconExport size={13} /> Word
            </PanelAction>
            <PanelAction
              primary
              disabled={exportsLocked || !matter}
              onClick={() => setExportFormat("pdf")}
            >
              <IconExport size={13} /> Court PDF
            </PanelAction>
          </>
        }
      />
      {exportFormat && matter && (
        <ChronologyExportPreview
          matter={matter}
          format={exportFormat}
          events={rows}
          onClose={() => setExportFormat(null)}
          onDownload={() => {
            if (exportFormat === "pdf") exportChronologyPdf(matter, rows);
            else exportChronologyDoc(matter, rows);
            setExportFormat(null);
          }}
        />
      )}
      {exportsLocked && (
        <DraftWatermark reason={lockReason} />
      )}
      <div className="grid grid-cols-4 border-b border-line bg-surface px-6 py-3">
        <StatCell label="On timeline" value={accepted} accent="brass" />
        <StatCell label="Pending review" value={pending} accent="flag" />
        <StatCell label="Excluded" value={rejected} accent="muted" />
        <StatCell label={`${verifiedPct}% citations verified`} value="" accent="verify" small />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <ol className="relative mx-auto max-w-3xl">
          <span className="absolute left-[88px] top-0 bottom-0 w-px bg-brass-soft" aria-hidden />
          {rows.map((e, i) => {
            const prev = i > 0 ? rows[i - 1] : null;
            return (
              <li key={e.id} className="relative pb-6">
                {prev && (
                  <div className="ml-[16px] mb-2 inline-block rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[10px] text-ink-soft">
                    +{dayDelta(prev.date, e.date)} days
                  </div>
                )}
                <div className="flex items-start gap-4">
                  <div className="w-[72px] shrink-0 text-right">
                    <div className="font-mono text-[11px] font-semibold text-ink">{e.date}</div>
                  </div>
                  <span
                    className={cx(
                      "relative z-10 mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 border-paper",
                      e.accepted === null
                        ? "bg-flag"
                        : e.accepted
                          ? "bg-brass"
                          : "bg-ink-faint",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip accepted={e.accepted} />
                      <ConfidenceDot level={e.confidence} />
                      <CitationChip c={e.citation} />
                      {e.issueTags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-full border border-brass-soft bg-brass-wash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-brass-deep"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{e.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <RowAction
                      title="Accept"
                      tone="verify"
                      onClick={() => setAccepted.mutate({ eventId: e.id, accepted: true })}
                      disabled={e.accepted === true || setAccepted.isPending}
                    >
                      <IconVerified size={14} />
                    </RowAction>
                    <RowAction
                      title="Reopen"
                      tone="muted"
                      onClick={() => setAccepted.mutate({ eventId: e.id, accepted: null })}
                      disabled={e.accepted === null || setAccepted.isPending}
                    >
                      <IconReplay size={14} />
                    </RowAction>
                    <RowAction
                      title="Reject"
                      tone="danger"
                      onClick={() => setAccepted.mutate({ eventId: e.id, accepted: false })}
                      disabled={e.accepted === false || setAccepted.isPending}
                    >
                      <IconClose size={14} />
                    </RowAction>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
  small = false,
}: {
  label: string;
  value: number | string;
  accent: "brass" | "flag" | "muted" | "verify";
  small?: boolean;
}) {
  const accentText = {
    brass: "text-brass-deep",
    flag: "text-flag",
    muted: "text-ink-soft",
    verify: "text-verify",
  }[accent];
  const accentBg = accent === "flag" ? "bg-flag-wash/60" : "";
  return (
    <div className={cx("flex items-baseline gap-3 rounded-md px-3 py-1.5", accentBg)}>
      {value !== "" && (
        <div className={cx("font-display font-semibold leading-none", accentText, small ? "text-[15px]" : "text-[22px]")}>
          {value}
        </div>
      )}
      <div className={cx("font-mono text-[9.5px] uppercase tracking-wider", small ? "text-verify" : "text-ink-soft")}>
        {label}
      </div>
    </div>
  );
}

function StatusChip({ accepted }: { accepted: boolean | null }) {
  if (accepted === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-brass-soft bg-brass-wash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-brass-deep">
        on timeline
      </span>
    );
  }
  if (accepted === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">
        excluded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-flag/30 bg-flag-wash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-flag">
      draft
    </span>
  );
}

function DraftWatermark({ reason }: { reason?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-flag/30 bg-flag-wash/40 px-6 py-2 text-[11.5px] text-flag">
      <IconPrivileged size={14} />
      <span className="font-mono font-semibold uppercase tracking-wider">Draft · ingest incomplete</span>
      <span className="text-flag/80">{reason ?? "Exports unlock when the corpus finishes processing."}</span>
    </div>
  );
}

function RowAction({
  title,
  tone,
  onClick,
  disabled,
  children,
}: {
  title: string;
  tone: "verify" | "muted" | "danger";
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls = {
    verify: "text-verify hover:bg-verify-wash",
    muted: "text-ink-soft hover:bg-surface-sunken",
    danger: "text-danger hover:bg-danger-wash",
  }[tone];
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cx("grid h-7 w-7 place-items-center rounded-md transition disabled:opacity-30", cls)}
    >
      {children}
    </button>
  );
}
