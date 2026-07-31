// Deposition outline modal — launched from a witness's dossier. Generates an
// examination outline grounded in the matter's chronology + documents, then
// lets the operator copy it or print it for the attorney. Every exhibit
// reference is a Bates id the attorney can pull mid-deposition.

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { cx } from "../lib/ui";
import { IconClose, IconCopy } from "../icons";
import type { DepoOutline } from "../types";

export function DepositionOutlineModal({
  matterId,
  witness,
  onClose,
}: {
  matterId: string;
  witness: string;
  onClose: () => void;
}) {
  const gen = useMutation({ mutationFn: () => api.buildDepositionOutline(matterId, witness) });
  const outline = gen.data;
  const [copied, setCopied] = useState(false);

  // Kick off generation once on mount.
  const mutate = gen.mutate;
  useEffect(() => {
    mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copyText() {
    if (!outline) return;
    navigator.clipboard?.writeText(outlineToText(outline)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[720px] max-w-full flex-col overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="flex items-start justify-between border-b border-line bg-surface-sunken px-5 py-4">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              Deposition prep
            </div>
            <h3 className="mt-0.5 font-display text-[18px] font-semibold leading-tight text-ink">
              Examination outline — {witness}
            </h3>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              Built from the chronology, documents, and hot docs this witness touches. Exhibits are Bates-cited.
            </p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink">
            <IconClose size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {gen.isPending && (
            <div className="grid h-40 place-items-center text-[12.5px] text-ink-soft">
              Drafting the outline across the witness's record…
            </div>
          )}
          {gen.error && (
            <div className="rounded-md border border-flag/30 bg-flag-wash p-3 text-[12px] text-flag">
              {gen.error instanceof Error ? gen.error.message : "Could not build the outline."}
            </div>
          )}
          {outline && <OutlineView outline={outline} />}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface-sunken px-5 py-3">
          <div className="text-[10.5px] text-ink-faint">
            {outline ? `${outline.topics.length} topics · ${outline.topics.reduce((n, t) => n + t.questions.length, 0)} questions` : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => gen.mutate()}
              disabled={gen.isPending}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              Regenerate
            </button>
            <button
              onClick={copyText}
              disabled={!outline}
              className="inline-flex items-center gap-1.5 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
            >
              <IconCopy size={13} /> {copied ? "Copied" : "Copy outline"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function OutlineView({ outline }: { outline: DepoOutline }) {
  return (
    <div className="space-y-4">
      {outline.background && (
        <div className="rounded-lg border border-brass-soft/40 bg-brass-wash/40 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
          <span className="font-semibold">Why this witness: </span>
          {outline.background}
        </div>
      )}
      <ol className="space-y-4">
        {outline.topics.map((t, i) => (
          <li key={i} className="rounded-lg border border-line bg-paper px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] font-semibold text-brass-deep">{i + 1}.</span>
              <h4 className="font-display text-[15px] font-semibold leading-snug text-ink">{t.topic}</h4>
            </div>
            {t.goal && <div className="mt-0.5 pl-5 text-[11.5px] italic text-ink-soft">Goal: {t.goal}</div>}
            <ul className="mt-2 space-y-1.5 pl-5">
              {t.questions.map((q, j) => (
                <li key={j} className="flex gap-2 text-[12.5px] leading-relaxed text-ink">
                  <span className="select-none font-mono text-[10px] text-ink-faint">{String.fromCharCode(97 + (j % 26))}.</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
            {t.exhibits.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
                <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Exhibits</span>
                {t.exhibits.map((b) => (
                  <span key={b} className={cx("rounded border border-brass-soft bg-brass-wash px-1.5 py-0.5 font-mono text-[10px] text-brass-deep")}>
                    {b}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function outlineToText(o: DepoOutline): string {
  const lines: string[] = [];
  lines.push(`DEPOSITION OUTLINE — ${o.witness}`);
  if (o.role) lines.push(o.role);
  if (o.background) lines.push("", o.background);
  lines.push("");
  o.topics.forEach((t, i) => {
    lines.push(`${i + 1}. ${t.topic}`);
    if (t.goal) lines.push(`   [Goal: ${t.goal}]`);
    t.questions.forEach((q, j) => lines.push(`   ${String.fromCharCode(97 + (j % 26))}. ${q}`));
    if (t.exhibits.length) lines.push(`   Exhibits: ${t.exhibits.join(", ")}`);
    lines.push("");
  });
  return lines.join("\n");
}
