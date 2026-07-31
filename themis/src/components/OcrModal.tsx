// OcrModal — run client-side OCR on a scanned PDF. Used for documents whose
// body is the "[PDF X — appears to be image-only ...]" placeholder we save
// when pdfjs can't extract text. Tesseract runs in the browser (no API
// credentials needed), and the recognized text is PATCH'd back to the
// document's body. Slow (~30s/page); we show per-page progress so the
// operator knows it's working.
//
// Page rendering goes through pdfjs (same as the text extractor) — we
// render each page to a Canvas at 2x DPI for OCR accuracy, then feed the
// canvas to Tesseract.

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../lib/queries";
import { IconClose, IconVerified } from "../icons";

interface Props {
  open: boolean;
  matterId: string;
  docId: string;
  docTitle: string;
  onClose: () => void;
}

type Phase = "idle" | "rendering" | "ocring" | "saving" | "done" | "error";

export function OcrModal({ open, matterId, docId, docTitle, onClose }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [outText, setOutText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setPageCount(0);
      setCurrentPage(0);
      setConfidence(null);
      setOutText("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleFile(file: File) {
    setError(null);
    setOutText("");
    if (!/\.pdf$/i.test(file.name)) {
      setError("Drop a PDF. (For .txt / .md just paste into the doc body directly.)");
      setPhase("error");
      return;
    }
    setPhase("rendering");
    try {
      const buf = await file.arrayBuffer();
      const pdfjs: typeof import("pdfjs-dist") = await import("pdfjs-dist");
      try {
        const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
        (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;
      } catch {
        /* ok */
      }
      const pdf = await pdfjs.getDocument({ data: buf, disableAutoFetch: true, disableStream: true }).promise;
      setPageCount(pdf.numPages);

      // Lazy-import Tesseract.
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, { logger: () => {} });

      setPhase("ocring");
      const pages: string[] = [];
      let confSum = 0;
      let confCount = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        setCurrentPage(i);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas 2d unavailable");
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const result = await worker.recognize(canvas);
        pages.push(result.data.text);
        if (typeof result.data.confidence === "number") {
          confSum += result.data.confidence;
          confCount++;
        }
      }
      await worker.terminate();

      const joined = pages.join("\n\n").trim();
      setOutText(joined);
      setConfidence(confCount > 0 ? Math.round(confSum / confCount) : null);

      setPhase("saving");
      await fetch(`/api/matters/${matterId}/documents/${docId}/body`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: joined, signal: "ocr.tesseract" }),
      });
      qc.invalidateQueries({ queryKey: qk.documents(matterId) });
      qc.invalidateQueries({ queryKey: qk.document(matterId, docId) });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  const progressPct = pageCount > 0 ? (currentPage / pageCount) * 100 : 0;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10 backdrop-blur-[2px]">
      <div onClick={(e) => e.stopPropagation()} className="flex w-[640px] max-w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
        <header className="flex items-start justify-between gap-4 border-b border-line bg-surface-sunken px-5 py-4">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
              OCR
            </div>
            <h3 className="mt-0.5 font-display text-[18px] font-semibold leading-snug text-ink">Run OCR on a scanned PDF</h3>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              For: <span className="font-medium text-ink">{docTitle}</span>. Drops the same PDF you uploaded — Themis re-renders each page and runs Tesseract in your browser. ~30s per page. The extracted text replaces the document's body so chat can ground on it.
            </p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink">
            <IconClose size={14} />
          </button>
        </header>

        <div className="px-5 py-4">
          {phase === "idle" && (
            <div
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
              className="grid h-40 place-items-center rounded-md border border-dashed border-line-strong bg-surface-sunken/40 text-[12.5px] text-ink-soft"
            >
              <div className="text-center">
                <div>Drop the PDF here</div>
                <button onClick={() => fileRef.current?.click()} className="mt-2 rounded-md border border-line bg-surface px-3 py-1 text-[11px] font-medium text-ink hover:border-brass-soft">
                  Choose file
                </button>
                <input ref={fileRef} type="file" accept=".pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
              </div>
            </div>
          )}
          {(phase === "rendering" || phase === "ocring" || phase === "saving") && (
            <div className="space-y-3">
              <div className="text-[12.5px] text-ink-soft">
                {phase === "rendering" ? "Loading PDF…" : phase === "ocring" ? `OCR page ${currentPage} of ${pageCount}` : "Saving extracted text…"}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full bg-brass transition-[width] duration-200" style={{ width: `${progressPct}%` }} />
              </div>
              {outText.length > 0 && (
                <div className="rounded-md border border-line bg-paper p-2 font-mono text-[10.5px] leading-snug text-ink-soft" style={{ maxHeight: 160, overflowY: "auto" }}>
                  {outText.slice(-1200)}
                </div>
              )}
            </div>
          )}
          {phase === "done" && (
            <div className="rounded-md border border-verify/30 bg-verify-wash px-3 py-2 text-[12.5px] text-verify">
              <div className="flex items-center gap-1.5"><IconVerified size={13} /> Done · {outText.length.toLocaleString()} chars extracted{confidence !== null ? ` · avg confidence ${confidence}%` : ""}</div>
              <div className="mt-1 text-ink-soft">The document body is updated. Chat can now ground on this source. Close to return.</div>
            </div>
          )}
          {phase === "error" && (
            <div className="rounded-md border border-danger/30 bg-danger-wash p-2 text-[12px] text-danger">{error}</div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink">
            {phase === "done" ? "Done" : "Close"}
          </button>
        </footer>
      </div>
    </div>
  );
}
