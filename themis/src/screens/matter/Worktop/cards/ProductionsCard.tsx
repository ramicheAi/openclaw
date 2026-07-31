// ProductionsCard — discovery audit trail at a glance. Logs every Bates
// range produced TO or FROM each side, the date, the doc count, and whether
// a privilege log went with it. This is what solo/mid-size firms keep in
// Excel today, with all the failure modes that implies ("you never gave
// us X", "produced May 4, not May 6", etc.).
//
// Sits in the Worktop right rail under Deadlines so the operator sees both
// the calendar and the production state at every glance.

import { useState } from "react";
import { Card, SectionLabel, cx } from "../../../../lib/ui";
import { IconAdd, IconClose, IconExport } from "../../../../icons";
import { useProductions, useCreateProduction, useDeleteProduction } from "../../../../lib/queries";
import type { Production, ProductionDirection } from "../../../../types";

export function ProductionsCard({ matterId }: { matterId: string }) {
  const { data: productions } = useProductions(matterId);
  const del = useDeleteProduction(matterId);
  const [adding, setAdding] = useState(false);

  const list = productions ?? [];
  const sent = list.filter((p) => p.direction === "sent");
  const received = list.filter((p) => p.direction === "received");
  const totalDocsSent = sent.reduce((n, p) => n + p.docCount, 0);
  const totalDocsReceived = received.reduce((n, p) => n + p.docCount, 0);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Productions</SectionLabel>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-md border border-brass-soft bg-brass-wash px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-brass-deep hover:border-brass"
        >
          <IconAdd size={10} /> Log production
        </button>
      </div>

      {list.length === 0 ? (
        <div className="mt-2 text-[11.5px] text-ink-faint">
          No productions tracked yet. Log every Bates range produced to or from
          each side so the manifest never lives in someone's email.
        </div>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-ink-soft">
            <Tally label="Sent" docs={totalDocsSent} count={sent.length} />
            <Tally label="Received" docs={totalDocsReceived} count={received.length} />
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {list.slice(0, 6).map((p) => (
              <ProductionRow key={p.id} p={p} onDelete={() => del.mutate(p.id)} />
            ))}
          </ul>
          {list.length > 6 && (
            <div className="mt-2 text-[10px] text-ink-faint">+ {list.length - 6} more</div>
          )}
        </>
      )}

      {adding && <AddProductionModal matterId={matterId} onClose={() => setAdding(false)} />}
    </Card>
  );
}

function Tally({ label, docs, count }: { label: string; docs: number; count: number }) {
  return (
    <div className="rounded-md border border-line bg-paper px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="mt-0.5 font-display text-[15px] font-semibold leading-none text-ink">
        {docs.toLocaleString()}<span className="ml-1 text-[10px] font-normal text-ink-soft">docs / {count} prod</span>
      </div>
    </div>
  );
}

function ProductionRow({ p, onDelete }: { p: Production; onDelete: () => void }) {
  return (
    <li className="group flex items-start gap-2">
      <span className={cx(
        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold",
        p.direction === "sent" ? "bg-brass-wash text-brass-deep" : "bg-info-wash text-info",
      )}>
        {p.direction === "sent" ? "↑" : "↓"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[12px] text-ink">
          <span className="truncate font-medium" title={p.label || p.party}>
            {p.label || (p.direction === "sent" ? "to" : "from") + " " + p.party}
          </span>
          {p.privilegeLog && (
            <span className="rounded border border-flag/30 bg-flag-wash px-1 py-px font-mono text-[8px] uppercase tracking-wider text-flag" title="Privilege log served with this production">
              priv log
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[9.5px] text-ink-faint">
          <span>{p.prodDate}</span>
          <span>·</span>
          <span className="rounded border border-line bg-surface px-1 py-px">{p.batesStart}–{p.batesEnd}</span>
          <span>·</span>
          <span>{p.docCount} docs</span>
        </div>
      </div>
      <button
        onClick={() => {
          if (window.confirm(`Delete production "${p.label || p.party}"?`)) onDelete();
        }}
        aria-label="Delete production"
        className="opacity-0 transition group-hover:opacity-100"
      >
        <IconClose size={11} className="text-ink-faint hover:text-danger" />
      </button>
    </li>
  );
}

function AddProductionModal({ matterId, onClose }: { matterId: string; onClose: () => void }) {
  const create = useCreateProduction(matterId);
  const [direction, setDirection] = useState<ProductionDirection>("received");
  const [party, setParty] = useState("");
  const [prodDate, setProdDate] = useState(new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState("");
  const [batesStart, setBatesStart] = useState("");
  const [batesEnd, setBatesEnd] = useState("");
  const [privilegeLog, setPrivilegeLog] = useState(false);
  const [notes, setNotes] = useState("");

  function submit() {
    create.mutate(
      { direction, party, prodDate, label, batesStart, batesEnd, privilegeLog, notes },
      { onSuccess: onClose },
    );
  }

  const ready = party.trim() && prodDate && batesStart.trim() && batesEnd.trim();

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-full overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="border-b border-line bg-surface-sunken px-5 py-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">Discovery audit</div>
          <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-tight text-ink">Log a production</h3>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            Record every Bates range produced to or from each side. Themis counts
            how many of this matter's docs fall in the range automatically.
          </p>
        </header>
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction">
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as ProductionDirection)}
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              >
                <option value="sent">Sent (we produced)</option>
                <option value="received">Received (from other side)</option>
              </select>
            </Field>
            <Field label="Production date">
              <input
                type="date"
                value={prodDate}
                onChange={(e) => setProdDate(e.target.value)}
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
          </div>
          <Field label={direction === "sent" ? "Receiving party" : "Producing party"}>
            <input
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder="e.g. Allstate Insurance Co."
              className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            />
          </Field>
          <Field label="Label (optional)">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Defendant's First Production"
              className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bates start">
              <input
                value={batesStart}
                onChange={(e) => setBatesStart(e.target.value.toUpperCase())}
                placeholder="OLIV-000001"
                spellCheck={false}
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
            <Field label="Bates end">
              <input
                value={batesEnd}
                onChange={(e) => setBatesEnd(e.target.value.toUpperCase())}
                placeholder="OLIV-000050"
                spellCheck={false}
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-ink">
            <input
              type="checkbox"
              checked={privilegeLog}
              onChange={(e) => setPrivilegeLog(e.target.checked)}
              className="accent-brass"
            />
            Privilege log served with this production
          </label>
          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cover letter ref, transmittal email date, etc."
              className="h-16 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            />
          </Field>
          {create.error && (
            <div className="rounded-md border border-flag/30 bg-flag-wash p-2 text-[11.5px] text-flag">
              {create.error instanceof Error ? create.error.message : "Could not log the production."}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!ready || create.isPending}
            className="inline-flex items-center gap-1 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
          >
            <IconExport size={12} /> {create.isPending ? "Logging…" : "Log production"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
