import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CitationChip, HotTag, PrivilegePill, cx } from "../../../../lib/ui";
import { IconCopy, IconAdd, IconHot, IconVerified, IconSearch } from "../../../../icons";
import { useDocuments, useEntities, useSetDocReview, qk } from "../../../../lib/queries";
import { api } from "../../../../lib/api";
import { AddDocumentModal } from "../../../../components/AddDocumentModal";
import { OcrModal } from "../../../../components/OcrModal";
import { TranscriptPlayer } from "../../../../components/TranscriptPlayer";
import { PdfViewer } from "../../../../components/PdfViewer";
import type { DocItem } from "../../../../types";
import { PanelAction, PanelHead } from "./PanelHead";

export function DocumentsPanel({
  matterId,
  initialFilter,
  initialPage,
}: {
  matterId: string;
  initialFilter?: string;
  initialPage?: number;
}) {
  const { data: docs } = useDocuments(matterId);
  const review = useSetDocReview(matterId);
  const [filter, setFilter] = useState(initialFilter ?? "");
  // When a citation jump-in arrives with a page, remember it so the right
  // pane auto-opens the PDF viewer at that page.
  const [pendingPage, setPendingPage] = useState<number | undefined>(initialPage);
  const [addOpen, setAddOpen] = useState(false);
  // Best-effort Bates prefix from any existing document — keeps newly added
  // docs grouped under the same prefix the user is already using.
  const batesPrefix = (docs?.[0]?.bates ?? "").match(/^([A-Z]{2,})-/)?.[1];
  // When a new initialFilter arrives (e.g. user clicked through from an
  // entity dossier), adopt it without clobbering manual edits the user
  // makes afterward.
  useEffect(() => {
    if (initialFilter) setFilter(initialFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilter]);
  // Pick up new initialPage when caller re-fires a click on the same Bates
  // with a different page.
  useEffect(() => {
    if (typeof initialPage === "number") setPendingPage(initialPage);
  }, [initialPage]);
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
        actions={
          <PanelAction primary onClick={() => setAddOpen(true)}>
            <IconAdd size={13} /> Add document
          </PanelAction>
        }
      />
      <AddDocumentModal
        open={addOpen}
        matterId={matterId}
        defaultBatesPrefix={batesPrefix}
        onClose={() => setAddOpen(false)}
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
              <DocView
                doc={docA}
                matterId={matterId}
                side="A"
                initialPage={pendingPage}
                onPageConsumed={() => setPendingPage(undefined)}
                onToggleHot={() => toggleHot(docA)}
                onToggleReviewed={() => toggleReviewed(docA)}
              />
              {docB && <DocView doc={docB} matterId={matterId} side="B" onToggleHot={() => toggleHot(docB)} onToggleReviewed={() => toggleReviewed(docB)} />}
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
  matterId,
  side,
  initialPage,
  onPageConsumed,
  onToggleHot,
  onToggleReviewed,
}: {
  doc: DocItem;
  matterId: string;
  side: "A" | "B";
  initialPage?: number;
  onPageConsumed?: () => void;
  onToggleHot: () => void;
  onToggleReviewed: () => void;
}) {
  const sideColor = side === "A" ? "bg-brass" : "bg-info";
  // Detect a transcript-style body: every line starts with a [HH:MM:SS]
  // timestamp + "SPEAKER X:" label. If so, we surface the Rename Speakers UI.
  const isTranscript = /^\[\d{2}:\d{2}:\d{2}\]\s+\S/m.test(doc.body);
  const speakers = isTranscript ? extractSpeakers(doc.body) : [];
  // Image-only / unparseable PDFs save with a [PDF X — appears to be
  // image-only ...] body. Surface a 'Run OCR' button on the doc head so
  // the operator can drop the PDF back in and Tesseract it.
  const isImageOnly = /^\[(?:PDF|File) [^\]]+ — (?:appears to be image-only|could not (?:parse|extract))/m.test(doc.body) || /^\[No text — saved as a record/.test(doc.body);
  const [renaming, setRenaming] = useState(false);
  const [ocring, setOcring] = useState(false);
  const [viewSource, setViewSource] = useState(false);
  // Arriving via a citation jump pre-opens the PDF viewer at the cited page.
  useEffect(() => {
    if (typeof initialPage === "number" && initialPage > 0) {
      setViewSource(true);
      onPageConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPage, doc.id]);
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
          {isTranscript && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-brass-wash/40 px-4 py-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-brass-deep">
                Transcript · {speakers.length} speaker{speakers.length === 1 ? "" : "s"} · {speakers.join(", ")}
              </div>
              <button
                onClick={() => setRenaming(true)}
                className="rounded-md border border-brass-soft bg-surface px-2 py-1 text-[11px] font-medium text-brass-deep hover:border-brass"
              >
                Rename speakers
              </button>
            </div>
          )}
          {isImageOnly && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-flag-wash/60 px-4 py-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-flag">
                No text layer — chat can't ground until OCR'd
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setViewSource((v) => !v)}
                  className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep"
                >
                  {viewSource ? "Hide source PDF" : "View source PDF"}
                </button>
                <button
                  onClick={() => setOcring(true)}
                  className="rounded-md border border-brass-soft bg-surface px-2 py-1 text-[11px] font-medium text-brass-deep hover:border-brass"
                >
                  Run OCR
                </button>
              </div>
            </div>
          )}
          {!isImageOnly && !isTranscript && doc.privilege !== "flagged" && doc.privilege !== "withheld" && (
            <div className="flex items-center justify-end border-b border-line bg-surface px-4 py-1.5">
              <button
                onClick={() => setViewSource((v) => !v)}
                className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep"
                title="Open the original PDF in a viewer"
              >
                {viewSource ? "Show extracted text" : "View source PDF"}
              </button>
            </div>
          )}
          {doc.privilege === "flagged" || doc.privilege === "withheld" ? (
            <PrivilegeWall basis={doc.privilegeBasis} />
          ) : isTranscript ? (
            // Inline video player + scrubbable transcript for transcribed
            // media docs. Click any line to scrub to that timestamp.
            <TranscriptPlayer matterId={matterId} docId={doc.id} bates={doc.bates} body={doc.body} />
          ) : viewSource ? (
            // Source PDF viewer for any non-transcript doc when the operator
            // asks for it. Persisted on upload to ~/.themis/media; 404 if the
            // doc was added before persistence shipped (we surface a
            // re-attach dropzone there so the operator can drop the original).
            <div className="h-[600px] border-l-2 border-brass">
              <PdfViewer matterId={matterId} docId={doc.id} bates={doc.bates} initialPage={initialPage} />
            </div>
          ) : (
            <FormattedBody body={doc.body} />
          )}
          {ocring && (
            <OcrModal
              open={ocring}
              matterId={matterId}
              docId={doc.id}
              docTitle={doc.title}
              onClose={() => setOcring(false)}
            />
          )}
          {renaming && (
            <RenameSpeakers
              matterId={matterId}
              docId={doc.id}
              speakers={speakers}
              onClose={() => setRenaming(false)}
            />
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

// FormattedBody — turn an unbroken wall of extracted PDF text into something
// a paralegal can actually read. We do four cheap passes:
//   1. Normalize whitespace runs to single spaces (PDF text extraction often
//      emits a space at every glyph boundary).
//   2. Split on sentence ends OR ALL-CAPS section headers OR all-caps name
//      lines so paragraphs break at natural pauses instead of "where the PDF
//      column happened to wrap."
//   3. Detect short ALL-CAPS lines as headings and render them larger.
//   4. Render in a comfortable serif at 13.5px with 1.6 line-height.
// Includes a "Raw text" toggle so the operator can still see the source if
// the formatter mangles something — trust costs nothing here.
function FormattedBody({ body }: { body: string }) {
  const [raw, setRaw] = useState(false);
  const blocks = useMemo(() => formatBody(body), [body]);
  return (
    <div className="border-l-2 border-brass bg-paper">
      <div className="flex items-center justify-end border-b border-line bg-surface/60 px-4 py-1.5">
        <button
          onClick={() => setRaw((r) => !r)}
          className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep"
          title="Toggle formatted / raw extracted text"
        >
          {raw ? "Formatted view" : "Raw text"}
        </button>
      </div>
      {raw ? (
        <pre className="whitespace-pre-wrap px-5 py-5 font-mono text-[11.5px] leading-relaxed text-ink">
          {body}
        </pre>
      ) : (
        <div className="prose-themis px-6 py-5 text-[13.5px] leading-[1.65] text-ink">
          {blocks.map((b, i) =>
            b.kind === "heading" ? (
              <h4 key={i} className="mt-5 mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep first:mt-0">
                {b.text}
              </h4>
            ) : (
              <p key={i} className="mt-0 mb-3 last:mb-0">
                {b.text}
              </p>
            ),
          )}
        </div>
      )}
    </div>
  );
}

interface Block { kind: "heading" | "para"; text: string; }
function formatBody(body: string): Block[] {
  // Preserve placeholder bodies as a single paragraph — they're already
  // formatted (e.g. "[PDF X — appears to be image-only ...]").
  if (/^\[/.test(body.trim()) && /\]$/.test(body.trim()) && body.length < 400) {
    return [{ kind: "para", text: body.trim() }];
  }
  // Normalize: collapse 3+ blank lines, strip lonely page numbers, soft-wrap
  // hyphens "exam-\nination" → "examination".
  const cleaned = body
    .replace(/-\s*\n\s*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^Page \d+ of \d+\s*$/gim, "")
    .trim();

  // Split into raw lines first.
  const lines = cleaned.split(/\n/);
  const blocks: Block[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    // Join with single spaces, then re-split on sentence boundaries so a
    // wall-of-text paragraph gets visual rhythm. Cap each "sentence" run
    // around 2-3 sentences per <p> for legibility.
    const joined = buf.join(" ").replace(/\s+/g, " ").trim();
    if (!joined) { buf = []; return; }
    const sents = joined.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [joined];
    const grouped: string[] = [];
    let acc = "";
    for (const s of sents) {
      acc += s;
      if (acc.length > 220 || /[.!?]\s*$/.test(acc) && acc.length > 140) {
        grouped.push(acc.trim());
        acc = "";
      }
    }
    if (acc.trim()) grouped.push(acc.trim());
    for (const g of grouped) blocks.push({ kind: "para", text: g });
    buf = [];
  };
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) { flush(); continue; }
    // ALL-CAPS short lines = section heading (e.g. "NARRATIVE", "VICTIM INFORMATION").
    const isHeading =
      t.length <= 64 &&
      /^[A-Z0-9][A-Z0-9 .,'/&()#:-]+$/.test(t) &&
      !/[.!?]$/.test(t) &&
      t.split(/\s+/).length <= 8;
    if (isHeading) {
      flush();
      blocks.push({ kind: "heading", text: t.replace(/:$/, "") });
      continue;
    }
    buf.push(t);
  }
  flush();
  return blocks;
}

// ── Transcript helpers ─────────────────────────────────────────────────
// extractSpeakers walks the body looking for "[HH:MM:SS]  NAME:" lines and
// returns the unique set of speaker names in first-seen order.
function extractSpeakers(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /^\[\d{2}:\d{2}:\d{2}\]\s+([A-Z][A-Z .'-]*?):/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const name = m[1].trim();
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

function RenameSpeakers({
  matterId,
  docId,
  speakers,
  onClose,
}: {
  matterId: string;
  docId: string;
  speakers: string[];
  onClose: () => void;
}) {
  // Per-line rename. Each row is a dropdown of the matter's known entities
  // (plaintiff, defendant, counsel, officers, witnesses…) plus a "Custom…"
  // option that drops in a free-text input. Saves on submit — the backend
  // rewrites the body so chat citations + binder + exports all read the
  // chosen names.
  const { data: entities } = useEntities(matterId);
  const options = useMemo(() => {
    const list = (entities ?? []).map((e) => ({
      name: e.name,
      hint: [e.role, e.org].filter((s) => s && s !== "—").join(" · "),
    }));
    // Sort: plaintiff/defendant first, then counsel, then officers, then rest.
    const rank = (role: string) => {
      const r = role.toLowerCase();
      if (r.includes("plaintiff")) return 0;
      if (r.includes("defendant")) return 1;
      if (r.includes("counsel") || r.includes("attorney")) return 2;
      if (r.includes("officer") || r.includes("deputy")) return 3;
      return 9;
    };
    return list.sort((a, b) => rank(a.hint) - rank(b.hint) || a.name.localeCompare(b.name));
  }, [entities]);

  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(speakers.map((s) => [s, ""])),
  );
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  async function save() {
    setSaving(true);
    try {
      // Map original NAME -> the leading letter (the backend keys on the
      // letter from AssemblyAI: "Speaker A" -> "A"). If the body shows
      // "SPEAKER A", we send {A: <new name>}.
      const payload: Record<string, string> = {};
      for (const [orig, val] of Object.entries(vals)) {
        const letter = orig.match(/SPEAKER\s+([A-Z])/i)?.[1] ?? orig;
        if (val.trim() && val.trim() !== orig) payload[letter] = val.trim();
      }
      await api.renameSpeakers(matterId, docId, payload);
      qc.invalidateQueries({ queryKey: qk.documents(matterId) });
      qc.invalidateQueries({ queryKey: qk.document(matterId, docId) });
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-full overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="border-b border-line bg-surface-sunken px-5 py-4">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
            Speakers
          </div>
          <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-tight text-ink">Name the speakers</h3>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            Pick from the matter's entity list, or choose Custom to type a name.
            Themis rewrites every line; timestamps stay valid.
          </p>
        </header>
        <div className="space-y-2.5 px-5 py-4 max-h-[420px] overflow-y-auto">
          {options.length === 0 && (
            <div className="rounded-md border border-flag/30 bg-flag-wash p-2 text-[11px] text-flag">
              No entities yet — run Analyze with Themis on the Overview tab first so the case cast populates here.
            </div>
          )}
          {speakers.map((s) => {
            const isCustom = custom[s] ?? false;
            return (
              <div key={s} className="grid grid-cols-[110px_1fr] items-center gap-3">
                <div className="font-mono text-[11.5px] text-ink-soft">{s}</div>
                {isCustom ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={vals[s] ?? ""}
                      onChange={(e) => setVals({ ...vals, [s]: e.target.value })}
                      placeholder="Type a name"
                      autoFocus
                      className="flex-1 rounded-md border border-line bg-paper px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brass"
                    />
                    <button
                      onClick={() => { setCustom({ ...custom, [s]: false }); setVals({ ...vals, [s]: "" }); }}
                      className="rounded border border-line bg-surface px-1.5 py-1 text-[10px] text-ink-soft hover:text-ink"
                      title="Back to dropdown"
                    >
                      ← list
                    </button>
                  </div>
                ) : (
                  <select
                    value={vals[s] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__custom__") {
                        setCustom({ ...custom, [s]: true });
                        setVals({ ...vals, [s]: "" });
                      } else {
                        setVals({ ...vals, [s]: v });
                      }
                    }}
                    className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[13px] text-ink outline-none focus:border-brass"
                  >
                    <option value="">— pick a person —</option>
                    {options.map((o) => (
                      <option key={o.name} value={o.name}>
                        {o.name}{o.hint ? ` · ${o.hint}` : ""}
                      </option>
                    ))}
                    <option value="__custom__">Custom…</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50">
            {saving ? "Saving…" : "Save names"}
          </button>
        </footer>
      </div>
    </div>
  );
}

