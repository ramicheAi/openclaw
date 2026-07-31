// Firm-wide audit feed — every action across every matter the operator
// can see (or every matter in single-user mode). Each row shows the matter
// it belongs to with a click-through that opens the matter at the Ask tab.
//
// Reuses the matter-level audit display conventions (action tag, leadOf
// detail, relative time, display-actor swap for legacy "D. Okafor" rows).

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { cx } from "../lib/ui";
import { IconSearch } from "../icons";
import type { FirmAuditEntry } from "../types";

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

const ACTION_TAG: Record<string, string> = {
  "chronology.accept": "ACCEPTED",
  "chronology.reject": "REJECTED",
  "chronology.reset": "RESET",
  "privilege.flag": "FLAGGED",
  "privilege.cleared": "CLEARED",
  "privilege.withheld": "WITHHELD",
  "privilege.scan": "RE-SCAN",
  "chat.query": "ASKED",
  "chat.answer": "ANSWERED",
  "chat.refused": "REFUSED",
  "ingest.complete": "INGEST",
  "matter.create": "CREATED",
  "matter.analyze": "ANALYZED",
  "doc.create": "DOC ADDED",
  "doc.review": "REVIEWED",
  "verify.run": "CITE CHECK",
  "verify.authorities": "AUTH CHECK",
  "verify.certify": "CERTIFIED",
  "deposition.outline": "DEPO OUTLINE",
  "draft.generate": "DRAFTED",
  "deadlines.extract": "DEADLINES",
  "share.create": "SHARED",
  "share.revoke": "REVOKED",
  "damages.add": "DAMAGES+",
  "damages.update": "DAMAGES",
  "damages.delete": "DAMAGES−",
  "production.sent": "PRODUCED ↑",
  "production.received": "PRODUCED ↓",
};

function tagOf(action: string): string {
  return ACTION_TAG[action] ?? action.split(".").pop()?.toUpperCase() ?? action.toUpperCase();
}

function displayActor(raw: string): string {
  if (!raw) return "—";
  if (raw === "D. Okafor") return "you";
  return raw;
}

export function FirmAuditScreen({ onOpenMatter }: { onOpenMatter: (id: string) => void }) {
  const audit = useQuery({ queryKey: ["firm-audit"], queryFn: () => api.listFirmAudit(500) });
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const entries = audit.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.matterName.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q),
    );
  }, [audit.data, filter]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-line bg-surface px-8 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-semibold leading-tight text-ink">Firm activity</h1>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">
              Every accept, reject, draft, cite check, and share across every matter you can see. Hash-chained, append-only.
              {audit.data && <span className="ml-2 font-mono text-[11px] text-ink-faint">{audit.data.length} entries</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-line bg-paper px-2.5 py-1.5">
            <IconSearch size={14} className="text-brass" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter matter, actor, action…"
              className="w-64 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {audit.isLoading ? (
          <div className="text-[12.5px] text-ink-soft">Loading firm activity…</div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto mt-16 max-w-md rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center text-[12.5px] text-ink-soft">
            {filter ? "Nothing matches that filter." : "No firm activity yet. Once you start working on matters, every action will land here."}
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {filtered.map((e) => (
              <Row key={e.id} e={e} onOpenMatter={onOpenMatter} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ e, onOpenMatter }: { e: FirmAuditEntry; onOpenMatter: (id: string) => void }) {
  return (
    <li>
      <button
        onClick={() => onOpenMatter(e.matterId)}
        className="grid w-full grid-cols-[110px_220px_1fr_auto_70px] items-baseline gap-3 px-4 py-2.5 text-left transition hover:bg-surface-sunken"
      >
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
          {tagOf(e.action)}
        </span>
        <span className="truncate text-[12.5px] font-medium text-ink" title={e.matterName}>
          {e.matterName}
        </span>
        <span className="truncate font-mono text-[11.5px] text-ink-soft" title={e.detail}>
          {e.detail || "—"}
        </span>
        <span className={cx("font-mono text-[10.5px]", e.actor === "themis" ? "text-brass-deep" : "text-ink-soft")} title={e.actor}>
          {displayActor(e.actor)}
        </span>
        <span className="text-right font-mono text-[10px] text-ink-faint" title={e.ts}>
          {relTime(e.ts)}
        </span>
      </button>
    </li>
  );
}
