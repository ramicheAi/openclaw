// CiteCheckModal — paste a draft brief, get every Bates citation verified
// against the matter's corpus with entailment scores. Per design brief
// section 11 sprint 3 ("Cite-check tool — paste a draft, verify all Bates
// citations").
//
// The same trust posture every other surface uses: existence + entailment.
// A cite is GREEN only when both layers pass; AMBER if it resolves but the
// surrounding paragraph doesn't entail it (the Mata failure mode); RED if
// the Bates id doesn't resolve to a real document in this matter.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { cx } from "../lib/ui";
import { IconClose, IconVerified, IconAsk } from "../icons";

interface Props {
  open: boolean;
  matterId: string;
  onClose: () => void;
}

type Finding = Awaited<ReturnType<typeof api.citeCheck>>["findings"][number];

export function CiteCheckModal({ open, matterId, onClose }: Props) {
  const [draft, setDraft] = useState("");
  const check = useMutation({
    mutationFn: () => api.citeCheck(matterId, draft),
  });

  if (!open) return null;

  const result = check.data;
  const total = result?.total ?? 0;
  const existed = result?.existed ?? 0;
  const entailed = result?.entailed ?? 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-[820px] max-w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface-sunken px-6 py-4">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              Cite-check
            </div>
            <h3 className="mt-0.5 font-display text-[18px] font-semibold leading-snug text-ink">
              Verify a draft's citations
            </h3>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              Paste any draft. Themis scans for Bates ids, resolves each against the matter, and scores
              entailment against the surrounding paragraph.
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {/* Paste box */}
            <div className="flex flex-col">
              <label className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                Draft text
              </label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste the brief, declaration, or memo here — Themis will scan for every Bates citation and verify each one."
                rows={14}
                className="flex-1 min-h-[280px] resize-y rounded-md border border-line bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed text-ink placeholder:text-ink-faint focus:border-brass focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="font-mono text-[10px] text-ink-faint">{draft.length.toLocaleString()} chars</span>
                <button
                  onClick={() => check.mutate()}
                  disabled={!draft.trim() || check.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <IconAsk size={13} /> {check.isPending ? "Checking…" : "Check citations"}
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="flex flex-col">
              <label className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                Findings
              </label>
              {!result && !check.isPending && !check.isError && (
                <div className="grid flex-1 place-items-center rounded-md border border-dashed border-line-strong bg-surface-sunken/40 p-6 text-center text-[12px] text-ink-soft">
                  Paste a draft and click <span className="font-medium text-ink">Check citations</span> to verify every
                  Bates id against this matter's corpus.
                </div>
              )}
              {check.isPending && (
                <div className="grid flex-1 place-items-center text-[12px] text-ink-soft">
                  Scanning corpus…
                </div>
              )}
              {check.isError && (
                <div className="rounded-md border border-danger/30 bg-danger-wash p-3 text-[12px] text-danger">
                  Cite-check failed. Try again.
                </div>
              )}
              {result && (
                <>
                  <Summary total={total} existed={existed} entailed={entailed} />
                  {result.findings.length === 0 ? (
                    <div className="mt-3 rounded-md border border-dashed border-line-strong bg-surface-sunken/40 p-4 text-center text-[12px] text-ink-soft">
                      No Bates citations found in the draft.
                    </div>
                  ) : (
                    <ul className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
                      {result.findings.map((f, i) => (
                        <FindingRow key={`${f.bates}-${f.page}-${i}`} f={f} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-line bg-surface-sunken px-6 py-3 text-[11.5px] text-ink-soft">
          <span>
            Every result grounds in the same existence + entailment check used by the chat. Same primitive — same
            promise.
          </span>
          <button
            onClick={onClose}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function Summary({ total, existed, entailed }: { total: number; existed: number; entailed: number }) {
  const missing = total - existed;
  const located = existed - entailed;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat value={entailed} label="entailed" tone="verify" />
      <Stat value={located} label="located only" tone="flag" />
      <Stat value={missing} label="not resolved" tone="danger" />
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "verify" | "flag" | "danger" }) {
  const cls = {
    verify: "border-verify/30 bg-verify-wash text-verify",
    flag: "border-flag/30 bg-flag-wash text-flag",
    danger: "border-danger/30 bg-danger-wash text-danger",
  }[tone];
  return (
    <div className={cx("rounded-md border px-2.5 py-1.5", cls)}>
      <div className="font-display text-[20px] font-semibold leading-none">{value}</div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-wider">{label}</div>
    </div>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const state: "entailed" | "located" | "missing" = !f.existed ? "missing" : f.entailed ? "entailed" : "located";
  const cls = {
    entailed: "border-verify/30 bg-verify-wash/60",
    located: "border-flag/30 bg-flag-wash/40",
    missing: "border-danger/30 bg-danger-wash/40",
  }[state];
  const stateLabel = { entailed: "Entailed", located: "Located", missing: "Not in corpus" }[state];
  const stateColor = { entailed: "text-verify", located: "text-flag", missing: "text-danger" }[state];
  return (
    <li className={cx("rounded-md border px-2.5 py-1.5", cls)}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] font-semibold text-ink">
            {f.bates}
            <span className="text-ink-faint"> · p.{f.page}</span>
          </span>
          {f.privilege === "flagged" || f.privilege === "withheld" ? (
            <span className="rounded-full border border-flag/30 bg-flag-wash px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-flag">
              privilege
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {f.existed && (
            <span className="font-mono text-[10px] text-ink-faint" title="support score">
              {(f.supportScore * 100).toFixed(0)}%
            </span>
          )}
          <span className={cx("inline-flex items-center gap-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider", stateColor)}>
            {state === "entailed" && <IconVerified size={10} />} {stateLabel}
          </span>
        </div>
      </div>
      {f.title && (
        <div className="mt-0.5 truncate text-[11.5px] text-ink-soft" title={f.title}>
          {f.title} <span className="text-ink-faint">· {f.date}</span>
        </div>
      )}
    </li>
  );
}
