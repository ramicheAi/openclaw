import { useEffect, useState } from "react";
import { cx } from "../../../../lib/ui";
import { IconExport, IconPrivileged, IconVerified } from "../../../../icons";
import { useDecidePrivilege, useMatter, usePrivilegeQueue } from "../../../../lib/queries";
import { exportPrivilegeLogPdf } from "../../../../lib/exports";
import type { DocItem } from "../../../../types";
import { PanelAction, PanelHead } from "./PanelHead";

export function PrivilegePanel({
  matterId,
  exportsLocked,
  lockReason,
}: {
  matterId: string;
  exportsLocked: boolean;
  lockReason?: string;
}) {
  const { data: queue } = usePrivilegeQueue(matterId);
  const { data: matter } = useMatter(matterId);
  const decide = useDecidePrivilege(matterId);
  const [activeId, setActiveId] = useState<string | null>(null);

  const docs = queue ?? [];
  const flagged = docs.filter((d) => d.privilege === "flagged");
  const decided = docs.filter((d) => d.privilege === "cleared" || d.privilege === "withheld");

  // Default to first flagged doc.
  useEffect(() => {
    if (!activeId && flagged[0]) setActiveId(flagged[0].id);
  }, [activeId, flagged]);

  const active = docs.find((d) => d.id === activeId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PanelHead
        eyebrow="Privilege · Flag, then decide"
        title="Review queue"
        sub="Themis flags potential privilege; a human clears or withholds. Every decision is logged."
        actions={
          <PanelAction
            primary
            disabled={exportsLocked || !matter}
            onClick={() => matter && exportPrivilegeLogPdf(matter, docs)}
          >
            <IconExport size={13} /> Generate privilege log
          </PanelAction>
        }
      />
      {exportsLocked && (
        <div className="flex items-center gap-2 border-b border-flag/30 bg-flag-wash/40 px-6 py-2 text-[11.5px] text-flag">
          <IconPrivileged size={14} />
          <span className="font-mono font-semibold uppercase tracking-wider">Draft · ingest incomplete</span>
          <span className="text-flag/80">{lockReason ?? "Privilege log unlocks when the corpus finishes processing."}</span>
        </div>
      )}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "320px 1fr" }}>
        <aside className="min-h-0 overflow-y-auto border-r border-line bg-surface px-3 py-3">
          <SectionHeader>Review queue</SectionHeader>
          {flagged.length === 0 && (
            <div className="rounded-md border border-dashed border-verify/30 bg-verify-wash/30 px-3 py-4 text-center text-[12px] text-verify">
              ✓ No open flags
            </div>
          )}
          <ul className="space-y-1.5">
            {flagged.map((d) => (
              <li key={d.id}>
                <QueueCard doc={d} active={d.id === activeId} onSelect={() => setActiveId(d.id)} />
              </li>
            ))}
          </ul>
          {decided.length > 0 && (
            <>
              <div className="mt-4">
                <SectionHeader>Decided · append-only</SectionHeader>
              </div>
              <ul className="space-y-1.5">
                {decided.map((d) => (
                  <li key={d.id}>
                    <DecidedCard doc={d} active={d.id === activeId} onSelect={() => setActiveId(d.id)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
        <section className="min-h-0 overflow-y-auto px-6 py-6">
          {!active ? (
            <Empty />
          ) : (
            <Reviewer
              doc={active}
              onDecide={(decision) => decide.mutate({ docId: active.id, decision })}
              pending={decide.isPending}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 px-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">
      {children}
    </div>
  );
}

function QueueCard({ doc, active, onSelect }: { doc: DocItem; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cx(
        "w-full rounded-md border px-2.5 py-2 text-left transition",
        active
          ? "border-flag bg-flag-wash shadow-[inset_0_0_0_1px_var(--color-flag)]"
          : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="rounded border border-line bg-surface-sunken px-1 py-0.5 font-mono text-[10px] text-ink-soft">
          {doc.bates}
        </span>
        <span className="font-mono text-[10px] text-ink-faint">{doc.date}</span>
      </div>
      <div className="mt-1 text-[12.5px] font-medium leading-snug text-ink">{doc.title}</div>
      {doc.privilegeBasis && (
        <div className="mt-0.5 text-[11px] italic leading-snug text-flag">{doc.privilegeBasis}</div>
      )}
    </button>
  );
}

function DecidedCard({ doc, active, onSelect }: { doc: DocItem; active: boolean; onSelect: () => void }) {
  const cleared = doc.privilege === "cleared";
  return (
    <button
      onClick={onSelect}
      className={cx(
        "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition",
        active ? "border-brass-soft bg-brass-wash" : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <span
        className={cx(
          "grid h-5 w-5 place-items-center rounded-full",
          cleared ? "bg-verify-wash text-verify" : "bg-flag-wash text-flag",
        )}
      >
        {cleared ? <IconVerified size={11} /> : <IconPrivileged size={11} />}
      </span>
      <span className="font-mono text-[10px] text-ink-soft">{doc.bates}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{doc.title}</span>
      <span
        className={cx(
          "rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
          cleared ? "text-verify" : "text-flag",
        )}
      >
        {cleared ? "cleared" : "withheld"}
      </span>
    </button>
  );
}

function Reviewer({
  doc,
  onDecide,
  pending,
}: {
  doc: DocItem;
  onDecide: (d: "cleared" | "withheld") => void;
  pending: boolean;
}) {
  const isFlagged = doc.privilege === "flagged";
  return (
    <article className="mx-auto max-w-3xl">
      <header className="flex items-center gap-2">
        <span className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
          {doc.bates}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-flag/30 bg-flag-wash px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-flag">
          <IconPrivileged size={11} /> Privilege flag
        </span>
        <span className="font-mono text-[11px] text-ink-faint">{doc.date}</span>
      </header>
      <h3 className="mt-2 font-display text-[22px] font-semibold leading-tight text-ink">{doc.title}</h3>

      <div className="mt-4 grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 rounded-lg border border-line bg-surface px-4 py-3 text-[12.5px]">
        <Meta label="From" value={doc.author} />
        <Meta label="To" value={doc.recipients.join(", ")} />
        <Meta label="Type" value={doc.type} />
        <Meta label="Basis" value={doc.privilegeBasis ?? "—"} italic />
      </div>

      <section className="mt-4 overflow-hidden rounded-lg border-l-2 border-flag bg-surface">
        <div className="border-b border-line bg-flag-wash/40 px-3 py-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-flag">
          Source · withheld from non-privileged workspace
        </div>
        <pre className="whitespace-pre-wrap px-3 py-3 font-mono text-[12px] leading-relaxed text-ink">
          {doc.body}
        </pre>
      </section>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PanelAction
            onClick={() => onDecide("cleared")}
            disabled={!isFlagged || pending}
          >
            <IconVerified size={13} className="text-verify" /> Clear — not privileged
          </PanelAction>
          <PanelAction
            onClick={() => onDecide("withheld")}
            disabled={!isFlagged || pending}
          >
            <IconPrivileged size={13} className="text-flag" /> Withhold — log as privileged
          </PanelAction>
        </div>
        <div className="text-[10.5px] text-ink-faint">
          decided by D. Okafor · logged to audit
        </div>
      </div>
    </article>
  );
}

function Meta({ label, value, italic = false }: { label: string; value: string; italic?: boolean }) {
  return (
    <>
      <div className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={cx("text-ink", italic && "italic")}>{value}</div>
    </>
  );
}

function Empty() {
  return (
    <div className="mx-auto mt-20 max-w-md text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-verify-wash text-verify">
        <IconVerified size={22} />
      </div>
      <div className="mt-3 font-display text-[18px] font-semibold text-ink">Queue cleared</div>
      <div className="mt-1 text-[12.5px] text-ink-soft">
        Every flagged document has a decision. Generate the privilege log when ready.
      </div>
    </div>
  );
}
