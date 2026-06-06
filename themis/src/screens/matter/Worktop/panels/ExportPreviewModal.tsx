// ExportPreviewModal — the court-style document preview from design brief
// section 5.3c (chronology) and section 5.3d (privilege log). Renders the
// actual filing the user is about to download, in Georgia serif on warm
// paper, FRCP-aligned column layout. The trust-thesis closing line is
// always present: every citation in the export grounds in a verified
// source page.
//
// Two flavors:
//   "chronology"   — Date | Event | Source columns
//   "privilege"    — #, Bates, Date, Type, Author, Recipients, Basis,
//                    Decision columns; foot cites FRCP 26(b)(5)(A).

import type { ChronEvent, DocItem, MatterDetail, PrivilegeFlag } from "../../../../types";
import { IconClose, IconExport } from "../../../../icons";

interface CommonProps {
  matter: MatterDetail;
  format: "pdf" | "docx";
  onClose: () => void;
  onDownload: () => void;
}

export function ChronologyExportPreview({
  matter,
  format,
  events,
  onClose,
  onDownload,
}: CommonProps & { events: ChronEvent[] }) {
  const accepted = events.filter((e) => e.accepted === true);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Shroud onClose={onClose}>
      <ModalHead
        eyebrow={`${format === "pdf" ? "Court PDF" : "Word Doc"} · Preview`}
        title={`Chronology of events — ${matter.name}`}
        onClose={onClose}
      />
      <div className="export-paper">
        <div className="export-paper-head">
          <div className="font-display text-[22px] font-semibold leading-tight">Chronology of Events</div>
          <div className="mt-1 text-[12.5px] leading-snug">
            {matter.name} · {matter.matterType}
            <br />
            Prepared {today} · Lead {matter.leadAttorney}
          </div>
        </div>
        <table className="export-paper-table">
          <thead>
            <tr>
              <th style={{ width: "120px" }}>Date</th>
              <th>Event</th>
              <th style={{ width: "180px" }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {accepted.map((e) => (
              <tr key={e.id}>
                <td className="font-mono">{e.date}</td>
                <td>{e.description}</td>
                <td className="font-mono">
                  {e.citation.bates}, p. {e.citation.page}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="export-paper-foot">
          Every citation in this chronology has been verified against its source page. Confidence and acceptance
          status are recorded in the matter audit trail.
        </div>
      </div>
      <ModalFoot format={format} onClose={onClose} onDownload={onDownload} />
    </Shroud>
  );
}

export function PrivilegeLogPreview({
  matter,
  format,
  documents,
  onClose,
  onDownload,
}: CommonProps & {
  flags?: PrivilegeFlag[]; // reserved for jurisdiction-specific log variants
  documents: DocItem[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  // Build the FRCP log: every doc with a privilege decision (cleared or
  // withheld) and every still-flagged candidate. Order: withheld first.
  const order = { withheld: 0, flagged: 1, cleared: 2, none: 3 } as const;
  const docsForLog = [...documents]
    .filter((d) => d.privilege !== "none")
    .sort((a, b) => order[a.privilege as keyof typeof order] - order[b.privilege as keyof typeof order]);

  return (
    <Shroud onClose={onClose}>
      <ModalHead
        eyebrow={`${format === "pdf" ? "Court PDF" : "Spreadsheet"} · Preview`}
        title={`Privilege log — ${matter.name}`}
        onClose={onClose}
      />
      <div className="export-paper">
        <div className="export-paper-head">
          <div className="font-display text-[22px] font-semibold leading-tight">Privilege Log</div>
          <div className="mt-1 text-[12.5px] leading-snug">
            {matter.name} · {matter.matterType}
            <br />
            Prepared {today} · Lead {matter.leadAttorney} · Per FRCP 26(b)(5)(A)
          </div>
        </div>
        <table className="export-paper-table">
          <thead>
            <tr>
              <th style={{ width: "32px" }}>#</th>
              <th style={{ width: "110px" }}>Bates</th>
              <th style={{ width: "92px" }}>Date</th>
              <th style={{ width: "76px" }}>Type</th>
              <th>Basis</th>
              <th style={{ width: "90px" }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {docsForLog.map((d, i) => (
              <tr key={d.id}>
                <td className="font-mono">{i + 1}</td>
                <td className="font-mono">{d.bates}</td>
                <td className="font-mono">{d.date}</td>
                <td>{d.type}</td>
                <td>{d.privilegeBasis ?? "—"}</td>
                <td className="font-mono uppercase" style={{ fontSize: "11px" }}>
                  {d.privilege === "withheld" ? "Withhold" : d.privilege === "cleared" ? "Cleared" : "Pending"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="export-paper-foot">
          Pursuant to FRCP 26(b)(5)(A), each document withheld on a claim of privilege is described above in a
          manner that will enable other parties to assess the claim. Decisions are append-only and logged to the
          matter audit trail.
        </div>
      </div>
      <ModalFoot format={format} onClose={onClose} onDownload={onDownload} />
    </Shroud>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Shared chrome
// ────────────────────────────────────────────────────────────────────────

function Shroud({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-6 py-10 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-[860px] max-w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        {children}
      </div>
    </div>
  );
}

function ModalHead({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface-sunken px-6 py-4">
      <div>
        <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
          {eyebrow}
        </div>
        <h3 className="mt-0.5 font-display text-[18px] font-semibold leading-snug text-ink">{title}</h3>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink"
      >
        <IconClose size={14} />
      </button>
    </header>
  );
}

function ModalFoot({
  format,
  onClose,
  onDownload,
}: {
  format: "pdf" | "docx";
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-sunken px-6 py-3">
      <button
        onClick={onClose}
        className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
      >
        Close
      </button>
      <button
        onClick={onDownload}
        className="inline-flex items-center gap-1.5 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep"
      >
        <IconExport size={13} /> Download {format === "pdf" ? "PDF" : ".docx"}
      </button>
    </footer>
  );
}
