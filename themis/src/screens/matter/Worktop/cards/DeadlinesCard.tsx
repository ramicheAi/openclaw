// DeadlinesCard — the litigation calendar at a glance. Sits in the Worktop
// right rail. Shows upcoming court deadlines sorted by date with an urgency
// dot (overdue / this week / soon / later), a checkbox to mark done, and an
// "Add from order" action that extracts deadlines from a pasted scheduling
// order via the LLM. Missing a deadline is malpractice-grade; this keeps them
// in the operator's face.

import { useState } from "react";
import { Card, SectionLabel, cx } from "../../../../lib/ui";
import { IconAdd, IconClose, IconVerified } from "../../../../icons";
import { useDeadlines, useExtractDeadlines, useSetDeadlineDone, useDeleteDeadline } from "../../../../lib/queries";
import type { Deadline, DeadlineKind } from "../../../../types";

const KIND_LABEL: Record<DeadlineKind, string> = {
  deadline: "Deadline",
  hearing: "Hearing",
  conference: "Conference",
  trial: "Trial",
  disclosure: "Disclosure",
};

function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00").getTime();
  if (!Number.isFinite(d)) return null;
  return Math.round((d - Date.now()) / 86_400_000);
}

function urgency(days: number | null): { dot: string; label: string } {
  if (days === null) return { dot: "bg-ink-faint", label: "no date" };
  if (days < 0) return { dot: "bg-danger", label: `${Math.abs(days)}d overdue` };
  if (days === 0) return { dot: "bg-danger", label: "today" };
  if (days <= 7) return { dot: "bg-flag", label: `${days}d` };
  if (days <= 30) return { dot: "bg-brass", label: `${days}d` };
  return { dot: "bg-verify", label: `${days}d` };
}

export function DeadlinesCard({ matterId }: { matterId: string }) {
  const { data: deadlines } = useDeadlines(matterId);
  const setDone = useSetDeadlineDone(matterId);
  const del = useDeleteDeadline(matterId);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const all = deadlines ?? [];
  const open = all.filter((d) => !d.done);
  const done = all.filter((d) => d.done);
  const shown = showDone ? all : open;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Deadlines</SectionLabel>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-md border border-brass-soft bg-brass-wash px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-brass-deep hover:border-brass"
        >
          <IconAdd size={10} /> Add from order
        </button>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <div className="mt-2 text-[11.5px] text-ink-faint">
          No deadlines tracked. Paste a scheduling order to extract them.
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {shown.map((d) => (
            <DeadlineRow
              key={d.id}
              d={d}
              onToggle={() => setDone.mutate({ dlId: d.id, done: !d.done })}
              onDelete={() => del.mutate(d.id)}
            />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <button
          onClick={() => setShowDone((v) => !v)}
          className="mt-2 font-mono text-[9.5px] uppercase tracking-wider text-ink-faint hover:text-ink-soft"
        >
          {showDone ? "Hide" : "Show"} {done.length} completed
        </button>
      )}

      {adding && <AddDeadlinesModal matterId={matterId} onClose={() => setAdding(false)} />}
    </Card>
  );
}

function DeadlineRow({ d, onToggle, onDelete }: { d: Deadline; onToggle: () => void; onDelete: () => void }) {
  const days = daysUntil(d.dueDate);
  const u = urgency(days);
  return (
    <li className="group flex items-start gap-2">
      <button
        onClick={onToggle}
        aria-label={d.done ? "Reopen" : "Mark done"}
        className={cx(
          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition",
          d.done ? "border-verify bg-verify text-paper" : "border-line hover:border-brass",
        )}
      >
        {d.done && <IconVerified size={10} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cx("flex items-center gap-1.5", d.done && "opacity-50")}>
          {!d.done && <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", u.dot)} />}
          <span className={cx("truncate text-[12px] font-medium text-ink", d.done && "line-through")} title={d.detail || d.title}>
            {d.title}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-faint">
          <span className="font-mono">{d.dueDate || "date TBD"}</span>
          {!d.done && (
            <span className={cx(days !== null && days <= 7 ? "font-semibold text-flag" : "")}>· {u.label}</span>
          )}
          <span className="rounded bg-surface-sunken px-1 py-px font-mono uppercase tracking-wider">{KIND_LABEL[d.kind]}</span>
        </div>
      </div>
      <button
        onClick={onDelete}
        aria-label="Delete deadline"
        className="opacity-0 transition group-hover:opacity-100"
      >
        <IconClose size={11} className="text-ink-faint hover:text-danger" />
      </button>
    </li>
  );
}

function AddDeadlinesModal({ matterId, onClose }: { matterId: string; onClose: () => void }) {
  const extract = useExtractDeadlines(matterId);
  const [text, setText] = useState("");
  const [source, setSource] = useState("Scheduling Order");

  function run() {
    extract.mutate(
      { text, source },
      {
        onSuccess: (r) => {
          if (r.added > 0) onClose();
        },
      },
    );
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[640px] max-w-full flex-col overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="border-b border-line bg-surface-sunken px-5 py-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
            Calendar
          </div>
          <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-tight text-ink">Extract deadlines from an order</h3>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            Paste the text of a scheduling order or any order with dates. Themis pulls out every deadline, hearing, and disclosure date. Relative dates resolve only when the anchor date is in the text — otherwise they come back date-TBD for you to confirm.
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">Source label</label>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
          />
          <label className="mt-3 block font-mono text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">Order text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the scheduling order here…"
            spellCheck={false}
            className="mt-1 h-56 w-full resize-none rounded-md border border-line bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed text-ink outline-none focus:border-brass"
          />
          {extract.error && (
            <div className="mt-2 rounded-md border border-flag/30 bg-flag-wash p-2 text-[11.5px] text-flag">
              {extract.error instanceof Error ? extract.error.message : "Extraction failed."}
            </div>
          )}
          {extract.data && extract.data.added === 0 && (
            <div className="mt-2 rounded-md border border-flag/30 bg-flag-wash p-2 text-[11.5px] text-flag">
              No deadlines found in that text. Check it includes dated obligations.
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink">
            Cancel
          </button>
          <button
            onClick={run}
            disabled={extract.isPending || text.trim().length === 0}
            className="rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
          >
            {extract.isPending ? "Extracting…" : "Extract deadlines"}
          </button>
        </footer>
      </div>
    </div>
  );
}
