import { useEffect, useMemo, useState } from "react";
import { CitationChip, HotTag, PrivilegePill, cx } from "../../../../lib/ui";
import { IconCopy, IconAdd, IconHot, IconVerified, IconSearch } from "../../../../icons";
import { useDocuments, useSetDocReview } from "../../../../lib/queries";
import type { DocItem } from "../../../../types";
import { PanelHead } from "./PanelHead";

export function DocumentsPanel({ matterId, initialFilter }: { matterId: string; initialFilter?: string }) {
  const { data: docs } = useDocuments(matterId);
  const review = useSetDocReview(matterId);
  const [filter, setFilter] = useState(initialFilter ?? "");
  // When a new initialFilter arrives (e.g. user clicked through from an
  // entity dossier), adopt it without clobbering manual edits the user
  // makes afterward.
  useEffect(() => {
    if (initialFilter) setFilter(initialFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilter]);
  const [selA, setSelA] = useState<string | null>(null);
  const [selB, setSelB] = useState<string | null>(null);

  function toggleHot(d: DocItem) {
    review.mutate({ docId: d.id, patch: { hot: !d.hot } });
  }
  function toggleReviewed(d: DocItem) {
    review.mutate({ docId: d.id, patch: { reviewed: !d.reviewed } });
  }

  const list = docs ?? [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.bates.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.entities.some((e) => e.toLowerCase().includes(q)),
    );
  }, [filter, list]);

  const docA = list.find((d) => d.id === selA) ?? filtered[0] ?? null;
  const docB = list.find((d) => d.id === selB) ?? null;

  function selectRow(d: DocItem, ev: React.MouseEvent) {
    if (ev.shiftKey && docA && docA.id !== d.id) setSelB(d.id);
    else {
      setSelA(d.id);
      setSelB(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PanelHead
        eyebrow="Documents · Corpus"
        title="Browse the source"
        sub="Click a row to open. Shift-click another row to compare side-by-side."
      />
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "280px 1fr" }}>
        <aside className="flex min-h-0 flex-col border-r border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <IconSearch size={14} className="text-brass" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter Bates, title, entity…"
              className="flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
            />
            <span className="font-mono text-[10px] text-ink-faint">{filtered.length}/{list.length}</span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {filtered.map((d) => {
              const isA = d.id === docA?.id;
              const isB = d.id === docB?.id;
              return (
                <li key={d.id}>
                  <button
                    onClick={(e) => selectRow(d, e)}
                    className={cx(
                      "flex w-full flex-col items-start gap-1 border-b border-line px-3 py-2 text-left transition",
                      isA
                        ? "bg-brass-wash"
                        : isB
                          ? "bg-info-wash"
                          : "hover:bg-surface-sunken",
                    )}
                  >
                    <div className="flex w-full items-center gap-1.5">
                      <span className="rounded border border-line bg-surface px-1 py-0.5 font-mono text-[10px] text-ink-soft">
                        {d.bates}
                      </span>
                      {d.hot && <HotMini />}
                      <PrivilegePill status={d.privilege} />
                      {d.reviewed && (
                        <span className="inline-flex items-center gap-0.5 rounded border border-verify/30 bg-verify-wash px-1 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-verify">
                          <IconVerified size={10} /> rev
                        </span>
                      )}
                      <span className="ml-auto font-mono text-[10px] text-ink-faint">{d.date}</span>
                    </div>
                    <div className="line-clamp-1 text-[12.5px] font-medium text-ink">{d.title}</div>
                    <div className="line-clamp-1 text-[10.5px] text-ink-soft">{d.author}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="min-h-0 overflow-y-auto px-6 py-6">
          {!docA ? (
            <div className="mx-auto mt-20 max-w-md text-center text-[12.5px] text-ink-soft">
              Select a document to preview the source.
            </div>
          ) : (
            <div className={cx("grid gap-5", docB && "grid-cols-2")}>
              <DocView doc={docA} side="A" onToggleHot={() => toggleHot(docA)} onToggleReviewed={() => toggleReviewed(docA)} />
              {docB && <DocView doc={docB} side="B" onToggleHot={() => toggleHot(docB)} onToggleReviewed={() => toggleReviewed(docB)} />}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function HotMini() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-danger/30 bg-danger-wash px-1 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-danger">
      <IconHot size={10} /> Hot
    </span>
  );
}

function DocView({
  doc,
  side,
  onToggleHot,
  onToggleReviewed,
}: {
  doc: DocItem;
  side: "A" | "B";
  onToggleHot: () => void;
  onToggleReviewed: () => void;
}) {
  const sideColor = side === "A" ? "bg-brass" : "bg-info";
  return (
    <article className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex">
        <div className={cx("w-1 shrink-0", sideColor)} />
        <div className="min-w-0 flex-1">
          <header className="border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={cx("grid h-6 w-6 place-items-center rounded font-mono text-[10px] font-bold text-paper", sideColor)}>
                {side}
              </span>
              <CitationChip c={{ bates: doc.bates, page: 1, verified: true }} />
              {doc.hot && <HotTag />}
              <span className="ml-auto font-mono text-[11px] text-ink-faint">{doc.date}</span>
            </div>
            <h3 className="mt-1.5 font-display text-[17px] font-semibold leading-tight text-ink">{doc.title}</h3>
            <div className="mt-2 grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-[11.5px]">
              <Field label="From">{doc.author}</Field>
              <Field label="To">{doc.recipients.join(", ")}</Field>
              <Field label="Type">{doc.type}</Field>
              {doc.threadId && <Field label="Thread">#{doc.threadId} ({doc.threadPos}/{doc.threadLen})</Field>}
              <Field label="OCR">{doc.ocrConfidence}</Field>
            </div>
          </header>
          {doc.privilege === "flagged" || doc.privilege === "withheld" ? (
            <PrivilegeWall basis={doc.privilegeBasis} />
          ) : (
            <pre className="border-l-2 border-brass whitespace-pre-wrap bg-paper px-4 py-4 font-mono text-[12px] leading-relaxed text-ink">
              {doc.body}
            </pre>
          )}
          <div className="border-t border-line bg-surface px-4 py-2">
            <div className="flex flex-wrap gap-1 text-[11px] text-ink-soft">
              <ActionLink
                icon={<IconCopy size={12} />}
                onClick={() => navigator.clipboard?.writeText(`${doc.bates}, p.1`).catch(() => {})}
              >
                Copy Bates cite
              </ActionLink>
              <ActionLink icon={<IconAdd size={12} />}>Add to binder</ActionLink>
              <ActionLink
                icon={<IconHot size={12} />}
                active={doc.hot}
                onClick={onToggleHot}
              >
                {doc.hot ? "Unmark hot" : "Mark hot"}
              </ActionLink>
              <ActionLink
                icon={<IconVerified size={12} />}
                active={doc.reviewed}
                onClick={onToggleReviewed}
              >
                {doc.reviewed ? "Reviewed ✓" : "Reviewed"}
              </ActionLink>
            </div>
            {(doc.reviewed && doc.reviewedBy) && (
              <div className="mt-1 text-[10px] text-ink-faint">
                Reviewed by {doc.reviewedBy}
                {doc.reviewedAt && ` · ${new Date(doc.reviewedAt).toLocaleString()}`}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function PrivilegeWall({ basis }: { basis?: string }) {
  return (
    <div
      className="border-l-2 border-flag px-4 py-6 text-center"
      style={{
        background:
          "repeating-linear-gradient(45deg, var(--color-flag-wash) 0 8px, transparent 8px 16px)",
      }}
    >
      <div className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-flag">
        Privilege wall — body withheld
      </div>
      {basis && <div className="mt-1 text-[12px] italic text-flag">{basis}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="text-ink">{children}</div>
    </>
  );
}

function ActionLink({
  children,
  icon,
  onClick,
  active = false,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition",
        active
          ? "bg-brass-wash text-brass-deep"
          : "hover:bg-surface-sunken hover:text-ink",
      )}
    >
      <span className={active ? "text-brass-deep" : "text-brass"}>{icon}</span>
      {children}
    </button>
  );
}
