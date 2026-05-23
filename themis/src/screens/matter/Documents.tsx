import { useState } from "react";
import { Copy, FileText, Layers, Mail, Search, Sparkles } from "lucide-react";
import { documents } from "../../data/mock";
import {
  Card,
  ConfidenceDot,
  cx,
  HotTag,
  PrivilegePill,
  SectionLabel,
} from "../../lib/ui";
import type { DocItem } from "../../types";

function DocRow({
  d,
  active,
  onClick,
}: {
  d: DocItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "w-full border-l-2 px-4 py-3 text-left transition-colors",
        active
          ? "border-l-brass bg-brass-wash/50"
          : "border-l-transparent hover:bg-surface-sunken",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-ink-faint">{d.bates}</span>
        {d.hot && <HotTag />}
        <span className="ml-auto font-mono text-[11px] text-ink-faint">{d.date}</span>
      </div>
      <div className="mt-1 truncate text-[13px] font-medium text-ink">{d.title}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
          {d.type === "Email" ? <Mail size={12} /> : <FileText size={12} />}
          {d.type}
        </span>
        {d.threadLen && (
          <span className="inline-flex items-center gap-1 text-[11px] text-info">
            <Layers size={12} /> {d.threadPos}/{d.threadLen}
          </span>
        )}
        {d.privilege !== "none" && <PrivilegePill status={d.privilege} />}
      </div>
    </button>
  );
}

function Viewer({ d }: { d: DocItem }) {
  return (
    <div className="grid h-full grid-cols-1 overflow-hidden lg:grid-cols-2">
      {/* Original */}
      <div className="hidden min-h-0 flex-col border-r border-line bg-surface-sunken lg:flex">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-[12px] font-medium text-ink-soft">Original</span>
          <span className="font-mono text-[11px] text-ink-faint">{d.bates}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-md rounded-md border border-line bg-surface p-6 shadow-sm">
            <div className="mb-4 border-b border-line pb-3">
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">{d.type}</div>
              <div className="font-display mt-1 text-[15px] font-semibold text-ink">{d.title}</div>
              <div className="mt-2 space-y-0.5 text-[11px] text-ink-soft">
                <div>From: {d.author}</div>
                {d.recipients.length > 0 && <div>To: {d.recipients.join(", ")}</div>}
                <div>Date: {d.date}</div>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{d.body}</p>
            <div className="mt-6 text-right font-mono text-[10px] text-ink-faint">{d.bates}</div>
          </div>
        </div>
      </div>

      {/* Extracted */}
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-soft">
            <Sparkles size={13} className="text-brass" /> Themis extraction
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            OCR <ConfidenceDot level={d.ocrConfidence} withLabel />
          </span>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2">
            {d.hot && <HotTag />}
            {d.privilege !== "none" && <PrivilegePill status={d.privilege} />}
            {d.duplicates ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-soft">
                <Copy size={11} /> {d.duplicates} near-duplicates
              </span>
            ) : null}
          </div>

          <div>
            <SectionLabel>Summary</SectionLabel>
            <p className="text-[13.5px] leading-relaxed text-ink">{d.summary}</p>
          </div>

          {d.privilegeBasis && (
            <div className="rounded-lg border border-flag/30 bg-flag-wash px-3 py-2.5 text-[12px] leading-relaxed text-flag">
              <span className="font-semibold">Privilege basis (flag only): </span>
              {d.privilegeBasis}. Human review required — Themis does not decide privilege.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <SectionLabel>Metadata</SectionLabel>
              <dl className="space-y-1 text-[12.5px]">
                {[
                  ["Type", d.type],
                  ["Date", d.date],
                  ["Author", d.author],
                  ["Recipients", d.recipients.join(", ") || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="w-20 shrink-0 text-ink-faint">{k}</dt>
                    <dd className="text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <SectionLabel>Entities</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {d.entities.map((e) => (
                  <span
                    key={e}
                    className="rounded-md border border-line bg-surface-sunken px-2 py-0.5 text-[12px] text-ink-soft"
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Documents() {
  const [activeId, setActiveId] = useState(documents[0].id);
  const active = documents.find((d) => d.id === activeId)!;
  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex w-[340px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line p-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-faint">
            <Search size={15} />
            <input
              placeholder="Hybrid search — keyword + meaning"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-ink-faint">
            <span>{documents.length} of 11,920 docs</span>
            <span>Sorted: relevance</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {documents.map((d) => (
            <DocRow key={d.id} d={d} active={d.id === activeId} onClick={() => setActiveId(d.id)} />
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <Card className="m-0 h-full rounded-none border-0">
          <Viewer d={active} />
        </Card>
      </div>
    </div>
  );
}
