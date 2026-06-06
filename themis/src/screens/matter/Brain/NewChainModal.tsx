// NewChainModal — start a new causal chain. The user picks a name + a set
// of chronology events and/or hot documents that, in date order, form the
// narrative arc. Posts to the existing causal-chains backend via
// useCreateChain; the brain mode picks it up on the next refetch.

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { qk } from "../../../lib/queries";
import { cx } from "../../../lib/ui";
import { IconAdd, IconClose, IconVerified } from "../../../icons";
import type { ChronEvent, DocItem, CausalChainNode } from "../../../types";

interface Props {
  open: boolean;
  matterId: string;
  events: ChronEvent[];
  documents: DocItem[];
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function NewChainModal({ open, matterId, events, documents, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<CausalChainNode[]>([]);

  const create = useMutation({
    mutationFn: () => api.createChain(matterId, name.trim(), picked),
    onSuccess: (chain) => {
      qc.invalidateQueries({ queryKey: qk.chains(matterId) });
      setName("");
      setPicked([]);
      onCreated?.(chain.id);
      onClose();
    },
  });

  // Sort options by date for a sensible default ordering.
  const eventOptions = useMemo(
    () => [...events].sort((a, b) => a.date.localeCompare(b.date)),
    [events],
  );
  const docOptions = useMemo(
    () => [...documents].filter((d) => d.hot).sort((a, b) => a.date.localeCompare(b.date)),
    [documents],
  );

  if (!open) return null;

  function toggle(node: CausalChainNode) {
    setPicked((p) => {
      const ix = p.findIndex((n) => n.kind === node.kind && n.id === node.id);
      if (ix >= 0) return p.filter((_, i) => i !== ix);
      return [...p, node];
    });
  }

  function isPicked(node: CausalChainNode) {
    return picked.some((n) => n.kind === node.kind && n.id === node.id);
  }

  const canCreate = name.trim().length > 0 && picked.length >= 2 && !create.isPending;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-[760px] max-w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface-sunken px-5 py-4">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              Causal chain
            </div>
            <h3 className="mt-0.5 font-display text-[18px] font-semibold leading-snug text-ink">
              Build a new chain
            </h3>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              Name the narrative, then pick the events and hot documents that — in date order — tell the story.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink"
          >
            <IconClose size={14} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_220px] overflow-hidden">
          {/* Picker */}
          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pretext sequence"
              className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-brass focus:outline-none"
            />

            <h4 className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              Chronology events ({eventOptions.length})
            </h4>
            <ul className="mt-1 space-y-1">
              {eventOptions.map((e) => {
                const node: CausalChainNode = { kind: "event", id: e.id };
                const sel = isPicked(node);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => toggle(node)}
                      className={cx(
                        "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-[12px] transition",
                        sel
                          ? "border-brass bg-brass-wash text-brass-deep"
                          : "border-line hover:border-line-strong hover:bg-surface-sunken",
                      )}
                    >
                      <span className="mt-0.5 font-mono text-[10px] text-ink-faint">{e.date}</span>
                      <span className="min-w-0 flex-1 truncate text-ink" title={e.description}>
                        {e.description}
                      </span>
                      {sel && <IconVerified size={12} className="mt-0.5 text-brass" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            {docOptions.length > 0 && (
              <>
                <h4 className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                  Hot documents ({docOptions.length})
                </h4>
                <ul className="mt-1 space-y-1">
                  {docOptions.map((d) => {
                    const node: CausalChainNode = { kind: "doc", id: d.id };
                    const sel = isPicked(node);
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => toggle(node)}
                          className={cx(
                            "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[12px] transition",
                            sel
                              ? "border-brass bg-brass-wash text-brass-deep"
                              : "border-line hover:border-line-strong hover:bg-surface-sunken",
                          )}
                        >
                          <span className="rounded border border-line bg-surface px-1 py-0.5 font-mono text-[10px] text-ink-soft">
                            {d.bates}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-ink" title={d.title}>
                            {d.title}
                          </span>
                          <span className="font-mono text-[10px] text-ink-faint">{d.date}</span>
                          {sel && <IconVerified size={12} className="text-brass" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {/* Picked summary */}
          <aside className="min-h-0 border-l border-line bg-surface-sunken px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-brass-deep">
                In chain
              </span>
              <span className="font-mono text-[10px] text-ink-faint">{picked.length}</span>
            </div>
            {picked.length === 0 ? (
              <div className="mt-3 text-[11px] leading-snug text-ink-soft">
                Pick at least 2 items. The chain renders in date order — first → last drives the "32 days" overlay span.
              </div>
            ) : (
              <ol className="mt-2 space-y-1">
                {picked.map((n, i) => {
                  const label =
                    n.kind === "event"
                      ? events.find((e) => e.id === n.id)?.date ?? n.id
                      : documents.find((d) => d.id === n.id)?.bates ?? n.id;
                  return (
                    <li
                      key={`${n.kind}-${n.id}`}
                      className="flex items-baseline gap-2 rounded-md border border-line bg-surface px-2 py-1 font-mono text-[10.5px] text-ink"
                    >
                      <span className="text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                      <span className="truncate">{label}</span>
                      <button
                        onClick={() => toggle(n)}
                        aria-label="Remove from chain"
                        className="ml-auto text-ink-faint hover:text-danger"
                      >
                        <IconClose size={11} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </aside>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-sunken px-5 py-3">
          <div className="text-[11px] text-ink-soft">
            {picked.length < 2 ? "Pick at least 2 items." : "Items render in date order in the brain ribbon."}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={!canCreate}
              className="inline-flex items-center gap-1.5 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconAdd size={13} /> {create.isPending ? "Saving…" : "Save chain"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
