// AddDocumentModal — paste / drop a document into an existing matter.
// Accepts: pasted text, .txt / .md drop, or a PDF that we text-extract
// client-side via pdfjs-dist. Operator fills minimal metadata (Bates,
// title, type, date, author) and clicks Save.

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/queries";
import { IconAdd, IconClose } from "../icons";

interface Props {
  open: boolean;
  matterId: string;
  defaultBatesPrefix?: string;
  onClose: () => void;
  onCreated?: (docId: string) => void;
}

const DOC_TYPES = ["Email", "Memo", "Letter", "Contract", "Deposition", "Pleading", "Report", "Note", "Document"];

export function AddDocumentModal({ open, matterId, defaultBatesPrefix, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [bates, setBates] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Document");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [author, setAuthor] = useState("");
  const [recipientsCsv, setRecipientsCsv] = useState("");
  const [body, setBody] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.createDocument(matterId, {
        bates: bates.trim(),
        title: title.trim(),
        type,
        date,
        author: author.trim(),
        recipients: recipientsCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        body,
      }),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: qk.documents(matterId) });
      qc.invalidateQueries({ queryKey: qk.matter(matterId) });
      qc.invalidateQueries({ queryKey: qk.matters });
      // Reset for next paste — keep the Bates prefix incremented automatically.
      setBates(autoIncBates(bates));
      setTitle("");
      setBody("");
      setRecipientsCsv("");
      onCreated?.(doc.id);
    },
  });

  if (!open) return null;
  const canSubmit = bates.trim().length > 0 && title.trim().length > 0 && body.trim().length > 0 && !create.isPending;

  async function handleFile(file: File) {
    setParseError(null);
    setParsing(true);
    try {
      if (/\.txt$|\.md$/i.test(file.name)) {
        const text = await file.text();
        setBody(text);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
      } else if (/\.pdf$/i.test(file.name)) {
        const text = await extractPdfText(file);
        setBody(text);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
      } else if (file.type.startsWith("text/")) {
        const text = await file.text();
        setBody(text);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
      } else {
        setParseError("Unsupported file. Drop a PDF, .txt, or .md — or paste the text directly.");
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-[840px] max-w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line bg-surface-sunken px-5 py-4">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              Add document
            </div>
            <h3 className="mt-0.5 font-display text-[18px] font-semibold leading-snug text-ink">
              Drop a PDF or paste the text
            </h3>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              The body is what Themis grounds answers against. Pick a Bates id (any prefix you like — e.g. {defaultBatesPrefix ?? "DOC"}-000001).
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

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_240px] gap-4 overflow-hidden px-5 py-4">
          {/* Body + dropzone */}
          <div className="flex min-h-0 flex-col">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className="mb-2 flex items-center justify-between gap-2 rounded-md border border-dashed border-line-strong bg-surface-sunken/40 px-3 py-2 text-[11.5px] text-ink-soft"
            >
              <span>
                {parsing
                  ? "Parsing PDF…"
                  : "Drop a PDF / .txt / .md here, or paste the body directly →"}
              </span>
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:border-brass-soft"
              >
                Choose file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.md,text/plain"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            {parseError && (
              <div className="mb-2 rounded-md border border-danger/30 bg-danger-wash p-2 text-[12px] text-danger">
                {parseError}
              </div>
            )}
            <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              Body *
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Paste the document text here. Themis grounds every answer against this body."
              className="mt-1 flex-1 min-h-[260px] resize-none rounded-md border border-line bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed text-ink placeholder:text-ink-faint focus:border-brass focus:outline-none"
            />
            <div className="mt-1 text-[10px] text-ink-faint">
              {body.length.toLocaleString()} chars · ~{Math.max(1, Math.ceil(body.length / 2400))} pages
            </div>
          </div>

          {/* Metadata */}
          <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto">
            <Field label="Bates *">
              <input
                value={bates}
                onChange={(e) => setBates(e.target.value)}
                placeholder={`${defaultBatesPrefix ?? "DOC"}-000001`}
                className="input font-mono"
              />
            </Field>
            <Field label="Title *">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Email · Reply re: contract"
                className="input"
              />
            </Field>
            <Field label="Type">
              <select value={type} onChange={(e) => setType(e.target.value)} className="input">
                {DOC_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input font-mono" />
            </Field>
            <Field label="Author">
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Jane Smith" className="input" />
            </Field>
            <Field label="Recipients" hint="Comma-separated">
              <input
                value={recipientsCsv}
                onChange={(e) => setRecipientsCsv(e.target.value)}
                placeholder="Alice, Bob, Counsel"
                className="input"
              />
            </Field>
          </aside>
        </div>

        {create.isError && (
          <div className="mx-5 mb-2 rounded-md border border-danger/30 bg-danger-wash p-2 text-[12px] text-danger">
            Save failed — check the Bates id (must be unique) and try again.
          </div>
        )}

        <footer className="flex items-center justify-between border-t border-line bg-surface-sunken px-5 py-3">
          <span className="text-[11px] text-ink-soft">
            {create.data ? `Saved · ${create.data.bates}` : "* required"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
            >
              Done
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconAdd size={13} /> {create.isPending ? "Saving…" : "Save document"}
            </button>
          </div>
        </footer>
        <style>{`.input { background: var(--color-paper); border: 1px solid var(--color-line); border-radius: 6px; padding: 6px 9px; font-size: 12.5px; color: var(--color-ink); width: 100%; outline: none; }
        .input:focus { border-color: var(--color-brass); }`}</style>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-0.5 text-[10px] text-ink-faint">{hint}</div>}
    </div>
  );
}

function autoIncBates(prev: string): string {
  // Best-effort auto-increment for repeat adds: "ACME-000004" -> "ACME-000005".
  const m = prev.match(/^(.*?)(\d+)$/);
  if (!m) return prev;
  const [, prefix, num] = m;
  const next = String(Number(num) + 1).padStart(num.length, "0");
  return `${prefix}${next}`;
}

// Client-side PDF text extraction. Loads pdfjs from the bundled
// dependency (already pulled in via the binder export path) lazily so
// it only fires when the user actually drops a PDF.
async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  // Vite handles the ESM build at runtime; the worker is co-resolved.
  const pdfjs: typeof import("pdfjs-dist") = await import("pdfjs-dist");
  // Workers are configured by pdfjs-dist itself in modern builds. If
  // worker resolution fails, fall back to running on the main thread.
  try {
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;
  } catch {
    /* fall through to main-thread parse */
  }
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
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
  return pages.join("\n\n");
}
