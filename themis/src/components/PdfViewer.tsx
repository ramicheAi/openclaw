// PdfViewer — embed the persisted source PDF for a document. Uses pdfjs to
// render pages to a Canvas so we get text selection later (the browser's
// native <iframe src=".pdf"> works too but loses our font/scale control).
// Stripped to the essentials — page navigation + zoom — because the chat
// citations already give the operator the verified Bates-and-page so they
// know exactly where to land.

import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/ui";
import { IconArrow, IconClose } from "../icons";

interface Props {
  matterId: string;
  docId: string;
  /** Optional page to land on; defaults to 1. */
  initialPage?: number;
  /** When provided, shows a Close X — embed mode hides it. */
  onClose?: () => void;
}

export function PdfViewer({ matterId, docId, initialPage = 1, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdf, setPdf] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage);
  const [scale, setScale] = useState(1.25);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/matters/${matterId}/documents/${docId}/media`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("No source PDF on file. (Older doc — uploaded before file persistence shipped.)");
          }
          throw new Error(`Could not load PDF: ${res.status}`);
        }
        const buf = await res.arrayBuffer();
        const pdfjs: typeof import("pdfjs-dist") = await import("pdfjs-dist");
        try {
          const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
          (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;
        } catch { /* main thread fallback */ }
        const doc = await pdfjs.getDocument({ data: buf, disableAutoFetch: true, disableStream: true }).promise;
        if (cancelled) return;
        setPdf(doc);
        setPage(Math.min(Math.max(1, initialPage), doc.numPages));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [matterId, docId, initialPage]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const p = await pdf.getPage(page);
      if (cancelled || !canvasRef.current) return;
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await p.render({ canvasContext: ctx, viewport, canvas }).promise;
    })();
    return () => { cancelled = true; };
  }, [pdf, page, scale]);

  const total = pdf?.numPages ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-line bg-surface-sunken px-3 py-2">
        <div className="flex items-center gap-1 text-[12px] text-ink-soft">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="grid h-6 w-6 place-items-center rounded text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-30"
          >
            <IconArrow direction="left" size={13} />
          </button>
          <span className="font-mono text-[11px]">
            page {page} / {total || "?"}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(total || 1, p + 1))}
            disabled={page >= total}
            className="grid h-6 w-6 place-items-center rounded text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-30"
          >
            <IconArrow direction="right" size={13} />
          </button>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-soft">
          <button onClick={() => setScale((s) => Math.max(0.5, s - 0.25))} className="rounded border border-line bg-surface px-1.5 py-0.5 hover:border-line-strong">−</button>
          <span className="font-mono">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(3, s + 0.25))} className="rounded border border-line bg-surface px-1.5 py-0.5 hover:border-line-strong">+</button>
          {onClose && (
            <button onClick={onClose} className="ml-1 grid h-6 w-6 place-items-center rounded text-ink-soft hover:bg-surface hover:text-ink">
              <IconClose size={13} />
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto bg-[#1a1a1a]">
        {loading && <div className="grid h-full place-items-center text-[12.5px] text-ink-faint">Loading PDF…</div>}
        {error && (
          <div className="mx-auto mt-10 max-w-md rounded-md border border-flag/30 bg-flag-wash p-3 text-[12px] text-flag">
            {error}
          </div>
        )}
        {!error && (
          <div className="grid place-items-center py-4">
            <canvas ref={canvasRef} className={cx("rounded shadow-[0_8px_24px_rgba(0,0,0,0.4)]", loading && "opacity-0")} />
          </div>
        )}
      </div>
    </div>
  );
}
