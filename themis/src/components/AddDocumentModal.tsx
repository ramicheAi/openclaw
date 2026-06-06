// AddDocumentModal — drop ANY number of files (PDFs, .txt, .md, video).
// For each: extract text → auto-suggest metadata → auto-assign next Bates.
// Operator reviews + edits any low-confidence fields, then "Save all" in one
// click commits the whole batch. Videos route to the AssemblyAI transcribe
// path instead of the direct doc-create path.

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/queries";
import { cx } from "../lib/ui";
import { IconAdd, IconClose, IconVerified } from "../icons";

interface Props {
  open: boolean;
  matterId: string;
  defaultBatesPrefix?: string;
  onClose: () => void;
  onCreated?: (docId: string) => void;
}

type Status = "parsing" | "ready" | "saving" | "saved" | "error";

interface BatchItem {
  key: string;
  filename: string;
  bates: string;
  title: string;
  type: string;
  date: string;
  author: string;
  recipients: string; // comma-separated
  body: string;
  confidence: "high" | "medium" | "low";
  status: Status;
  error?: string;
  // Video transcription (AssemblyAI) — kept here for the video path; the
  // backend writes the document once transcription completes.
  isVideo?: boolean;
  videoFile?: File;
  transcriptId?: string;
}

const DOC_TYPES = ["Email", "Memo", "Letter", "Contract", "Deposition", "Pleading", "Report", "Note", "Document"];

export function AddDocumentModal({ open, matterId, defaultBatesPrefix, onClose }: Props) {
  // onCreated callback removed from per-doc events; the batch is committed
  // via qc.invalidateQueries on saveAll completion.
  const qc = useQueryClient();
  const [prefix, setPrefix] = useState<string>(defaultBatesPrefix ?? "DOC");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [parsingCount, setParsingCount] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const nextBatesRef = useRef<number>(1);

  // When the prefix changes, re-Bates every row that hasn't been saved yet.
  // Rebases from the API's next-Bates seed for the new prefix so we don't
  // collide with existing matter documents.
  useEffect(() => {
    if (!open) return;
    api.nextBates(matterId, prefix).then((r) => {
      const m = r.next.match(/-(\d+)$/);
      const start = m ? Number(m[1]) : 1;
      nextBatesRef.current = start;
      setItems((xs) => {
        let n = start;
        return xs.map((x) => {
          if (x.status === "saved") return x;
          const bates = `${prefix}-${String(n).padStart(6, "0")}`;
          n++;
          return { ...x, bates };
        });
      });
      // Roll the next-Bates ref forward past any rows we just re-Bates'd so
      // future drops keep ascending without collision.
      const unsaved = (s: BatchItem) => s.status !== "saved";
      setItems((xs) => {
        nextBatesRef.current = start + xs.filter(unsaved).length;
        return xs;
      });
    }).catch(() => {});
  }, [open, matterId, prefix]);

  if (!open) return null;

  function freshBates(): string {
    const n = nextBatesRef.current++;
    return `${prefix}-${String(n).padStart(6, "0")}`;
  }

  async function ingestFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    setParsingCount((c) => c + arr.length);
    for (const f of arr) {
      const key = `${f.name}-${f.size}-${f.lastModified}-${Math.random()}`;
      const isVideo = /^video\//i.test(f.type) || /\.(mp4|mov|m4v|webm|m4a|mp3|wav)$/i.test(f.name);
      // Push the placeholder row immediately so the UI feels alive while we
      // parse and call the extractor.
      const placeholder: BatchItem = {
        key,
        filename: f.name,
        bates: freshBates(),
        title: f.name.replace(/\.[^.]+$/, ""),
        type: isVideo ? "Deposition" : "Document",
        date: new Date().toISOString().slice(0, 10),
        author: "",
        recipients: "",
        body: "",
        confidence: "low",
        status: "parsing",
        isVideo,
        videoFile: isVideo ? f : undefined,
      };
      setItems((xs) => [...xs, placeholder]);
      try {
        if (isVideo) {
          // Video path: defer body extraction to the transcribe call on save.
          // Show a clear placeholder so the operator knows what's queued.
          patch(key, { body: `[Video — will transcribe via AssemblyAI on Save: ${f.name}]`, status: "ready", confidence: "medium" });
        } else {
          const text = await extractText(f);
          const meta = await api.extractMetadata(text, f.name).catch(() => null);
          patch(key, {
            body: text,
            title: meta?.title ?? placeholder.title,
            type: meta?.type ?? placeholder.type,
            date: meta?.date ?? placeholder.date,
            author: meta?.author ?? "",
            recipients: (meta?.recipients ?? []).join(", "),
            confidence: meta?.confidence ?? "low",
            status: "ready",
          });
        }
      } catch (err) {
        patch(key, { status: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        setParsingCount((c) => c - 1);
      }
    }
  }

  function patch(key: string, p: Partial<BatchItem>) {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }

  async function saveAll() {
    setSavingAll(true);
    // Re-seed the next-Bates pointer from the server right before saving so
    // we don't collide with anything that landed since the modal opened.
    let seed = nextBatesRef.current;
    try {
      const r = await api.nextBates(matterId, prefix);
      const m = r.next.match(/-(\d+)$/);
      if (m) seed = Math.max(seed, Number(m[1]));
    } catch {
      /* fall back to current ref */
    }

    function nextBates(): string {
      const n = seed++;
      nextBatesRef.current = seed;
      return `${prefix}-${String(n).padStart(6, "0")}`;
    }

    for (const it of items) {
      if (it.status === "saved") continue;
      // Re-Bates each row right before save against the freshest seed —
      // belt-and-suspenders against collisions if the user changed prefix
      // mid-batch or if a previous save happened in another tab.
      const bates = nextBates();
      patch(it.key, { status: "saving", bates });
      try {
        if (it.isVideo && it.videoFile) {
          const fd = new FormData();
          fd.append("file", it.videoFile);
          fd.append("bates", bates);
          fd.append("title", it.title);
          fd.append("type", it.type);
          fd.append("date", it.date);
          const r = await fetch(`/api/matters/${matterId}/transcribe`, { method: "POST", body: fd });
          if (!r.ok) {
            const detail = await r.text();
            throw new Error(parseServerError(detail));
          }
          patch(it.key, { status: "saved" });
        } else {
          await saveDocWithRetry(matterId, {
            ...itemToPayload(it, bates),
          }, nextBates);
          patch(it.key, { status: "saved" });
        }
      } catch (err) {
        patch(it.key, { status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }
    setSavingAll(false);
    qc.invalidateQueries({ queryKey: qk.documents(matterId) });
    qc.invalidateQueries({ queryKey: qk.matter(matterId) });
    qc.invalidateQueries({ queryKey: qk.matters });
  }

  function itemToPayload(it: BatchItem, bates: string) {
    return {
      bates,
      title: it.title,
      type: it.type,
      date: it.date,
      author: it.author,
      recipients: it.recipients.split(",").map((s) => s.trim()).filter(Boolean),
      body: it.body,
    };
  }

  const readyCount = items.filter((i) => i.status === "ready").length;
  const savedCount = items.filter((i) => i.status === "saved").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-[1040px] max-w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line bg-surface-sunken px-5 py-4">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              Add documents
            </div>
            <h3 className="mt-0.5 font-display text-[18px] font-semibold leading-snug text-ink">
              Drop one or many files
            </h3>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              Themis auto-extracts metadata, auto-assigns Bates, and saves the whole batch in one click. Videos transcribe via AssemblyAI.
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

        {/* Dropzone + prefix */}
        <div className="border-b border-line bg-paper px-5 py-3">
          <div className="flex items-center gap-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) void ingestFiles(e.dataTransfer.files);
              }}
              className="flex-1 rounded-md border border-dashed border-line-strong bg-surface-sunken/40 px-4 py-3 text-[12px] text-ink-soft"
            >
              <span className="font-medium text-ink">Drop files here</span> — PDFs, .txt, .md, videos. Or{" "}
              <button onClick={() => fileRef.current?.click()} className="underline decoration-brass-soft text-brass-deep">
                choose files
              </button>
              .
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                accept=".pdf,.txt,.md,.eml,.mp4,.mov,.m4v,.webm,.m4a,.mp3,.wav,text/plain,video/*,audio/*"
                onChange={(e) => {
                  if (e.target.files?.length) void ingestFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[12px]">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">Bates</span>
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                className="w-24 bg-transparent font-mono text-[12px] text-ink outline-none"
              />
              <span className="font-mono text-[11px] text-ink-faint">— next: {String(nextBatesRef.current).padStart(6, "0")}</span>
            </div>
          </div>
        </div>

        {/* Batch list */}
        <div className="min-h-[280px] flex-1 overflow-y-auto px-5 py-3">
          {items.length === 0 ? (
            <div className="grid h-full place-items-center text-[12.5px] text-ink-soft">
              Drop files to start. Each one gets a Bates, title, author, and recipients auto-filled.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li key={it.key} className={cx("rounded-md border bg-surface", borderForStatus(it.status))}>
                  <button
                    onClick={() => setExpanded(expanded === it.key ? null : it.key)}
                    className="grid w-full grid-cols-[auto_120px_1fr_120px_140px_auto] items-center gap-3 px-3 py-2 text-left"
                  >
                    <StatusDot status={it.status} confidence={it.confidence} />
                    <span className="font-mono text-[11px] text-brass-deep">{it.bates}</span>
                    <span className="min-w-0 truncate text-[12.5px] font-medium text-ink" title={it.title}>
                      {it.title}
                    </span>
                    <span className="truncate text-[11px] text-ink-soft" title={it.author}>
                      {it.author || (it.isVideo ? "Video / audio" : "—")}
                    </span>
                    <span className="truncate font-mono text-[11px] text-ink-faint">
                      {it.type} · {it.date}
                    </span>
                    <span className={cx(
                      "font-mono text-[9.5px] uppercase tracking-wider",
                      it.status === "error" ? "text-danger" : "text-ink-faint",
                    )}>
                      {it.status}
                    </span>
                  </button>
                  {/* Inline error preview so the operator sees WHY this row
                   * failed without expanding — most common are 'Can't read'
                   * for unsupported extensions and 'Invalid PDF structure'
                   * for image-only / encrypted PDFs. */}
                  {it.status === "error" && it.error && (
                    <div className="border-t border-danger/20 bg-danger-wash px-3 py-1.5 text-[11px] text-danger">
                      <span className="font-mono uppercase tracking-wider">why: </span>
                      {it.error}
                    </div>
                  )}
                  {expanded === it.key && <EditRow item={it} onChange={(p) => patch(it.key, p)} />}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface-sunken px-5 py-3">
          <div className="text-[11.5px] text-ink-soft">
            {items.length === 0 ? "Drop to start." : (
              <span>
                {readyCount} ready · {savedCount} saved
                {errorCount > 0 ? ` · ${errorCount} error${errorCount === 1 ? "" : "s"}` : ""}
                {parsingCount > 0 ? ` · ${parsingCount} parsing` : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
            >
              Done
            </button>
            <button
              onClick={saveAll}
              disabled={readyCount === 0 || savingAll}
              className="inline-flex items-center gap-1.5 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconAdd size={13} /> {savingAll ? "Saving…" : `Save all (${readyCount})`}
            </button>
          </div>
        </footer>
        <style>{`.input { background: var(--color-paper); border: 1px solid var(--color-line); border-radius: 6px; padding: 6px 9px; font-size: 12.5px; color: var(--color-ink); width: 100%; outline: none; }
        .input:focus { border-color: var(--color-brass); }`}</style>
      </div>
    </div>
  );
}

function borderForStatus(s: Status): string {
  if (s === "saved") return "border-verify/30";
  if (s === "error") return "border-danger/30";
  if (s === "ready") return "border-line";
  return "border-line bg-surface-sunken/40";
}

function StatusDot({ status, confidence }: { status: Status; confidence: BatchItem["confidence"] }) {
  if (status === "saved") return <IconVerified size={14} className="text-verify" />;
  if (status === "error") return <span className="h-2.5 w-2.5 rounded-full bg-danger" />;
  if (status === "parsing" || status === "saving")
    return <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brass" />;
  const tone = confidence === "high" ? "bg-verify" : confidence === "medium" ? "bg-flag" : "bg-ink-faint";
  return <span className={cx("h-2.5 w-2.5 rounded-full", tone)} title={`Confidence: ${confidence}`} />;
}

function EditRow({ item, onChange }: { item: BatchItem; onChange: (p: Partial<BatchItem>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-line bg-paper px-3 py-3">
      <label className="text-[11px] text-ink-soft">
        Title
        <input className="input mt-1" value={item.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label className="text-[11px] text-ink-soft">
        Bates
        <input className="input mt-1 font-mono" value={item.bates} onChange={(e) => onChange({ bates: e.target.value })} />
      </label>
      <label className="text-[11px] text-ink-soft">
        Type
        <select className="input mt-1" value={item.type} onChange={(e) => onChange({ type: e.target.value })}>
          {DOC_TYPES.map((t) => (<option key={t}>{t}</option>))}
        </select>
      </label>
      <label className="text-[11px] text-ink-soft">
        Date
        <input type="date" className="input mt-1 font-mono" value={item.date} onChange={(e) => onChange({ date: e.target.value })} />
      </label>
      <label className="text-[11px] text-ink-soft">
        Author
        <input className="input mt-1" value={item.author} onChange={(e) => onChange({ author: e.target.value })} />
      </label>
      <label className="text-[11px] text-ink-soft">
        Recipients (comma-separated)
        <input className="input mt-1" value={item.recipients} onChange={(e) => onChange({ recipients: e.target.value })} />
      </label>
      {!item.isVideo && (
        <label className="col-span-2 text-[11px] text-ink-soft">
          Body
          <textarea
            className="input mt-1 font-mono text-[11.5px] leading-relaxed"
            rows={6}
            value={item.body}
            onChange={(e) => onChange({ body: e.target.value })}
          />
        </label>
      )}
      {item.error && <div className="col-span-2 text-[11px] text-danger">{item.error}</div>}
    </div>
  );
}

// Save a doc; on Bates conflict, bump to the next id and retry once. The
// server returns 409 { error: 'bates_already_exists' } when it spots a
// UNIQUE collision; we re-Bates from the local seed and try again.
async function saveDocWithRetry(
  matterId: string,
  payload: { bates: string; title: string; type: string; date: string; author: string; recipients: string[]; body: string },
  nextBates: () => string,
  attemptsLeft = 3,
): Promise<void> {
  try {
    await api.createDocument(matterId, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (attemptsLeft > 0 && /bates_already_exists|UNIQUE/i.test(msg)) {
      // Bump and retry once.
      await saveDocWithRetry(matterId, { ...payload, bates: nextBates() }, nextBates, attemptsLeft - 1);
      return;
    }
    throw new Error(parseServerError(msg));
  }
}

// Server returns either a JSON-encoded error body or a plain message. Pull
// out the human-readable bit so the row's WHY strip reads cleanly.
function parseServerError(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      return obj.message ?? obj.detail ?? obj.error ?? raw;
    }
  } catch { /* not JSON */ }
  return raw.length > 200 ? raw.slice(0, 200) + "…" : raw;
}

// Client-side text extraction. Routes by file extension; PDFs go through
// pdfjs-dist (lazy-imported). Resilient: an image-only / encrypted PDF
// returns a placeholder body instead of throwing so the row still saves
// with its metadata + Bates and the operator can OCR it elsewhere.
async function extractText(file: File): Promise<string> {
  if (/\.(txt|md|eml|rtf)$/i.test(file.name) || file.type.startsWith("text/")) {
    return await file.text();
  }
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
    return await extractPdfText(file);
  }
  // Unknown text-format — try reading as text anyway, fall back to a clear
  // placeholder. The doc still saves; chat will treat it as 'located, not
  // entailed' if the body is empty.
  try {
    const text = await file.text();
    if (text && /\S/.test(text)) return text;
  } catch {
    /* binary file — fall through */
  }
  return `[File ${file.name} — could not extract text client-side. Saved as a record. OCR / convert separately and paste body to enable grounded answers.]`;
}

async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await import("pdfjs-dist");
  } catch (err) {
    return `[PDF ${file.name} — pdfjs failed to load (${err instanceof Error ? err.message : String(err)}). Saved as a record.]`;
  }
  try {
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;
  } catch {
    /* fall through to main-thread parse */
  }
  try {
    const pdf = await pdfjs.getDocument({ data: buf, disableAutoFetch: true, disableStream: true }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const text = tc.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push(text);
    }
    const joined = pages.join("\n\n").trim();
    if (joined.length === 0) {
      return `[PDF ${file.name} — appears to be image-only (no text layer). Saved as a record; OCR separately to enable grounded answers.]`;
    }
    return joined;
  } catch (err) {
    return `[PDF ${file.name} — could not parse (${err instanceof Error ? err.message : String(err)}). Saved as a record.]`;
  }
}
