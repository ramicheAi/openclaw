// Drop the original file onto an older doc whose media wasn't persisted
// (uploaded before the binary-persistence path shipped). PUTs to
// /by-bates/:bates/media so the existing doc row picks up the source PDF
// or audio/video without losing its Bates, metadata, or chain hash.

import { useRef, useState } from "react";
import { cx } from "../lib/ui";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../lib/queries";

interface Props {
  matterId: string;
  bates: string;
  /** "pdf" / "video" / "audio" — affects the copy and the accept filter. */
  kind: "pdf" | "media";
  onReattached: () => void;
}

export function MediaReattach({ matterId, bates, kind, onReattached }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/matters/${matterId}/documents/by-bates/${bates}/media`,
        { method: "PUT", body: fd },
      );
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`upload failed: ${res.status} ${msg.slice(0, 200)}`);
      }
      qc.invalidateQueries({ queryKey: qk.documents(matterId) });
      onReattached();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const accept = kind === "pdf" ? ".pdf,application/pdf" : "audio/*,video/*";
  const label = kind === "pdf" ? "PDF" : "audio or video file";

  return (
    <div className="mx-auto my-6 max-w-lg">
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
        className={cx(
          "cursor-pointer rounded-lg border-2 border-dashed px-5 py-8 text-center transition",
          dragging
            ? "border-brass bg-brass-wash"
            : "border-line bg-surface hover:border-brass-soft hover:bg-surface-sunken",
        )}
      >
        <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
          {bates} · no source on file
        </div>
        <div className="mt-2 font-display text-[15px] font-semibold text-ink">
          {busy ? "Uploading…" : `Drop the original ${label} here`}
        </div>
        <p className="mt-1 text-[12px] text-ink-soft">
          This doc was added before file persistence shipped. Re-attach the
          source and the viewer will work going forward — Bates id, metadata,
          and chain hash stay intact.
        </p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          disabled={busy}
          className="mt-3 rounded-md border border-brass-soft bg-surface px-3 py-1.5 text-[12px] font-medium text-brass-deep hover:border-brass disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Choose file"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        {err && (
          <div className="mt-3 rounded-md border border-flag/30 bg-flag-wash p-2 text-[11px] text-flag">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
