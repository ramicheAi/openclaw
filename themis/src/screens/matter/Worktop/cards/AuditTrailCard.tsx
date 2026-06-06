// AuditTrailCard — dense, action-tagged feed. The actions are written long-
// form server-side (e.g. "chronology.accept", "privilege.flag", "chat.query")
// but the user-facing tag is the verb only ("ACCEPTED", "FLAGGED", "ASKED").

import { Card, SectionLabel } from "../../../../lib/ui";
import type { AuditEntry } from "../../../../types";

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

// Map dotted server actions to clean uppercase verbs for the trail.
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
  "doc.hot.set": "HOT",
  "doc.hot.cleared": "COOLED",
  "doc.review": "REVIEWED",
  "binder.add": "BINDER+",
  "binder.remove": "BINDER−",
  "binder.create": "BINDER NEW",
  "binder.rename": "BINDER",
  "binder.delete": "BINDER−",
  "chain.create": "CHAIN+",
  "chain.rename": "CHAIN",
  "chain.delete": "CHAIN−",
};

function tagOf(action: string): string {
  return ACTION_TAG[action] ?? action.split(".").pop()?.toUpperCase() ?? action.toUpperCase();
}

// Pull the most identifying token out of the detail so the row reads at a
// glance. Bates first, then short prefix.
function leadOf(detail: string): string {
  const bates = detail.match(/[A-Z]{2,}-\d{3,}/);
  if (bates) return bates[0];
  return detail.split(/[·:]/, 1)[0]?.trim() || detail.slice(0, 32);
}

export function AuditTrailCard({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Audit Trail</SectionLabel>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">append-only</span>
      </div>
      {entries.length === 0 ? (
        <div className="mt-2 text-[12px] text-ink-faint">No activity yet.</div>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {entries.slice(0, 5).map((e) => (
            <li key={e.id} className="py-2 first:pt-1 last:pb-1">
              <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2">
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-brass-deep">
                  {tagOf(e.action)}
                </span>
                <span className="truncate font-mono text-[11px] text-ink" title={e.detail}>
                  {leadOf(e.detail)}
                </span>
                <span className="font-mono text-[10px] text-ink-faint" title={e.ts}>
                  {relTime(e.ts)}
                </span>
              </div>
              <div className="mt-0.5 ml-[0px] truncate text-[10.5px] text-ink-soft" title={e.actor}>
                {e.actor}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
