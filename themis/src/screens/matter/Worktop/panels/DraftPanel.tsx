// Draft Studio — turn the chronology + theory into a first draft. Pick the
// document kind, optionally narrow which events Themis should cite, fill any
// per-kind extras (addressee, demand amount), and Themis emits a draft with
// inline (BATES-ID) citations and [AUTHORITY: ...] placeholders where a real
// authority must be sourced through Cite Check before filing.
//
// The draft renders with Bates ids styled as brass chips and AUTHORITY
// placeholders styled in flag (yellow) so the operator can scan them at a
// glance. Copy as text or download as a .txt for the lawyer to edit in Word.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../../../lib/api";
import { useChronology } from "../../../../lib/queries";
import { cx } from "../../../../lib/ui";
import { IconCite, IconCopy, IconExport, IconAdd } from "../../../../icons";
import type { ChronEvent, DraftKind } from "../../../../types";
import { PanelAction, PanelHead } from "./PanelHead";

export function DraftPanel({ matterId }: { matterId: string }) {
  const kinds = useQuery({ queryKey: ["draft-kinds"], queryFn: api.listDraftKinds });
  const { data: chron } = useChronology(matterId);
  const events = useMemo(() => (chron ?? []).filter((e) => e.accepted !== false), [chron]);

  const [kind, setKind] = useState<DraftKind>("demand-letter");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allEvents, setAllEvents] = useState(true);
  const [addressee, setAddressee] = useState("");
  const [demandAmount, setDemandAmount] = useState("");
  const [instructions, setInstructions] = useState("");

  // When chronology loads, default to "all events" if user hasn't picked any.
  useEffect(() => {
    if (allEvents) setPicked(new Set(events.map((e) => e.citation.bates)));
  }, [events, allEvents]);

  const draft = useMutation({
    mutationFn: () =>
      api.generateDraft(matterId, {
        kind,
        eventBates: allEvents ? undefined : Array.from(picked),
        addressee: addressee.trim() || undefined,
        demandAmount: demandAmount.trim() || undefined,
        instructions: instructions.trim() || undefined,
      }),
  });

  const needsAddressee = kind === "demand-letter";
  const needsDemand = kind === "demand-letter" || kind === "settlement-statement";

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PanelHead
        eyebrow="Draft · grounded composition"
        title="Generate a first draft"
        sub="Themis composes the prose from your chronology + case theory. Every factual sentence is cited to a Bates id you've accepted. Authority slots are placeholders for Cite Check."
        actions={
          <PanelAction
            primary
            onClick={() => draft.mutate()}
            disabled={draft.isPending || events.length === 0}
          >
            <IconCite size={13} /> {draft.isPending ? "Drafting…" : "Generate draft"}
          </PanelAction>
        }
      />

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "minmax(320px, 380px) 1fr" }}>
        {/* Left rail — choose what to draft + what to ground in */}
        <aside className="min-h-0 overflow-y-auto border-r border-line bg-surface px-4 py-4 space-y-4">
          <Field label="Document type">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as DraftKind)}
              className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            >
              {(kinds.data ?? []).map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
          </Field>

          {needsAddressee && (
            <Field label="Addressee">
              <input
                value={addressee}
                onChange={(e) => setAddressee(e.target.value)}
                placeholder="e.g. Allstate Claims Dept., Adjuster J. Smith"
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
          )}
          {needsDemand && (
            <Field label="Demand / settlement value">
              <input
                value={demandAmount}
                onChange={(e) => setDemandAmount(e.target.value)}
                placeholder="e.g. $250,000"
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </Field>
          )}
          <Field label="Extra instructions (optional)">
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Tone, length, sections to emphasize, etc."
              className="h-20 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            />
          </Field>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">Ground in</span>
              <label className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-soft">
                <input
                  type="checkbox"
                  checked={allEvents}
                  onChange={(e) => setAllEvents(e.target.checked)}
                  className="accent-brass"
                />
                All events
              </label>
            </div>
            {events.length === 0 ? (
              <div className="rounded-md border border-dashed border-flag/30 bg-flag-wash/40 px-2.5 py-2 text-[11.5px] text-flag">
                No accepted chronology events to cite. Open Chronology and accept events first, or run Analyze with Themis.
              </div>
            ) : (
              <ul className={cx("max-h-[320px] space-y-1 overflow-y-auto rounded-md border border-line bg-paper p-1.5", allEvents && "opacity-50 pointer-events-none")}>
                {events.map((e) => (
                  <EventPick
                    key={e.id}
                    event={e}
                    checked={picked.has(e.citation.bates)}
                    onToggle={() => {
                      const next = new Set(picked);
                      if (next.has(e.citation.bates)) next.delete(e.citation.bates);
                      else next.add(e.citation.bates);
                      setPicked(next);
                    }}
                  />
                ))}
              </ul>
            )}
            {!allEvents && (
              <div className="mt-1 text-[10px] text-ink-faint">
                {picked.size} of {events.length} events selected
              </div>
            )}
          </div>
        </aside>

        {/* Right — the draft */}
        <section className="min-h-0 overflow-y-auto bg-paper px-6 py-5">
          {!draft.data && !draft.isPending && !draft.error && (
            <EmptyDraft />
          )}
          {draft.isPending && (
            <div className="grid h-40 place-items-center text-[12.5px] text-ink-soft">
              Composing draft from the case record…
            </div>
          )}
          {draft.error && (
            <div className="rounded-md border border-flag/30 bg-flag-wash p-3 text-[12px] text-flag">
              {draft.error instanceof Error ? draft.error.message : "Draft generation failed."}
            </div>
          )}
          {draft.data && <RenderedDraft text={draft.data.draft} kind={draft.data.kind} matterId={matterId} />}
        </section>
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

function EventPick({ event, checked, onToggle }: { event: ChronEvent; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        onClick={onToggle}
        className={cx(
          "flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-[11.5px] transition",
          checked ? "bg-brass-wash" : "hover:bg-surface-sunken",
        )}
      >
        <span className={cx("mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded border", checked ? "border-brass bg-brass" : "border-line")}>
          {checked && <span className="h-1.5 w-1.5 rounded-sm bg-paper" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-ink">{event.description}</div>
          <div className="mt-0.5 flex items-center gap-1 font-mono text-[9.5px] text-ink-faint">
            <span>{event.date}</span>
            <span className="rounded border border-line bg-surface px-0.5">{event.citation.bates}</span>
          </div>
        </div>
      </button>
    </li>
  );
}

function EmptyDraft() {
  return (
    <div className="mx-auto mt-10 max-w-md text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brass-wash text-brass-deep">
        <IconCite size={22} />
      </div>
      <h3 className="mt-3 font-display text-[16px] font-semibold text-ink">No draft yet</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
        Pick a document kind, narrow which events to ground in if you want, and click Generate draft.
        Every factual sentence will carry a Bates citation; authorities come back as
        <span className="mx-1 rounded border border-flag/40 bg-flag-wash px-1 py-px font-mono text-[10.5px] text-flag">[AUTHORITY: ...]</span>
        placeholders for you to sweep through Cite Check.
      </p>
    </div>
  );
}

function RenderedDraft({ text, kind, matterId: _matterId }: { text: string; kind: DraftKind; matterId: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }
  function download() {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const placeholderCount = (text.match(/\[AUTHORITY:/g) ?? []).length;
  const batesCount = new Set(text.match(/[A-Z]{2,}-\d{3,}/g) ?? []).size;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[11px] text-ink-faint">
          {batesCount} Bates citation{batesCount === 1 ? "" : "s"}
          {placeholderCount > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-flag">{placeholderCount} authority placeholder{placeholderCount === 1 ? "" : "s"} to sweep through Cite Check</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={download} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink">
            <IconExport size={12} /> Download .txt
          </button>
          <button onClick={copy} className="inline-flex items-center gap-1 rounded-md bg-brass px-2.5 py-1 text-[11.5px] font-semibold text-paper hover:bg-brass-deep">
            <IconCopy size={12} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <article className="rounded-lg border-l-2 border-brass bg-paper px-6 py-5 font-display text-[13.5px] leading-[1.7] text-ink whitespace-pre-wrap">
        {renderDraftInline(text)}
      </article>
      <div className="mt-3 flex items-center justify-end gap-1 text-[10.5px] text-ink-faint">
        <IconAdd size={11} className="text-brass" />
        Next: open Cite Check (⌘6) and paste this draft to verify every citation before filing.
      </div>
    </div>
  );
}

// Render Bates ids as brass chips and [AUTHORITY: ...] placeholders as flag
// chips so the operator can scan the draft at a glance.
function renderDraftInline(text: string) {
  const nodes: React.ReactNode[] = [];
  const re = /(\[AUTHORITY:[^\]]+\]|\b[A-Z]{2,}-\d{3,}(?:,\s*p\.\s*\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    const tok = m[0];
    if (tok.startsWith("[AUTHORITY:")) {
      nodes.push(
        <span
          key={key++}
          className="rounded border border-flag/40 bg-flag-wash px-1.5 py-0.5 font-mono text-[11px] text-flag"
          title="Source this authority via Cite Check before filing"
        >
          {tok}
        </span>,
      );
    } else {
      nodes.push(
        <span
          key={key++}
          className="rounded border border-brass-soft bg-brass-wash px-1 py-px font-mono text-[11px] text-brass-deep"
        >
          {tok}
        </span>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(<span key={key++}>{text.slice(last)}</span>);
  return <>{nodes}</>;
}
