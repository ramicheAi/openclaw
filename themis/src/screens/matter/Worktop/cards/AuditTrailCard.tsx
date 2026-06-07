// AuditTrailCard — dense, action-tagged feed. The actions are written long-
// form server-side (e.g. "chronology.accept", "privilege.flag", "chat.query")
// but the user-facing tag is the verb only ("ACCEPTED", "FLAGGED", "ASKED").

import { Card, SectionLabel } from "../../../../lib/ui";
import type { AuditEntry, DocItem } from "../../../../types";

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

// When the audit row is about a specific document (ACCEPTED OLIV-000016,
// doc.body.update, etc.), the trust-relevant attribution isn't who clicked
// the button — it's who AUTHORED the underlying evidence. Show the author
// inline next to the operator. Falls back to operator-only when no Bates
// resolves (chat queries, binder ops, ingest events).
function authorFor(detail: string, documents: DocItem[]): string | null {
  const m = detail.match(/[A-Z]{2,}-\d{3,}/);
  if (!m) return null;
  const doc = documents.find((d) => d.bates === m[0]);
  if (!doc) return null;
  const a = doc.author?.trim();
  if (!a || a === "—") return null;
  return a;
}

// "D. Okafor" was the demo persona used as the seed/default actor before we
// flipped the default to "you". Old audit rows still bear that name and
// they're hash-chained so we can't mutate them in the DB. Display-only swap
// keeps the trail honest without breaking the chain.
function displayActor(raw: string): string {
  if (!raw) return "—";
  if (raw === "D. Okafor") return "you";
  return raw;
}

export function AuditTrailCard({ entries, documents = [] }: { entries: AuditEntry[]; documents?: DocItem[] }) {
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
          {entries.slice(0, 5).map((e) => {
            const author = authorFor(e.detail, documents);
            return (
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
                <div className="mt-0.5 truncate text-[10.5px] text-ink-soft">
                  {author ? (
                    <span>
                      <span className="text-ink">{author}</span>
                      <span className="text-ink-faint"> · authored</span>
                      <span className="text-ink-faint"> · {displayActor(e.actor)}</span>
                    </span>
                  ) : (
                    <span title={e.actor}>{displayActor(e.actor)}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
