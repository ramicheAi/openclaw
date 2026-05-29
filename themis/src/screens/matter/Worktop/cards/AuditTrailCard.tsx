import { Card, SectionLabel } from "../../../../lib/ui";
import type { AuditEntry } from "../../../../types";

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function AuditTrailCard({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card className="p-4">
      <SectionLabel>Audit Trail · Append-only</SectionLabel>
      {entries.length === 0 ? (
        <div className="mt-2 text-[12px] text-ink-faint">No activity yet.</div>
      ) : (
        <ul className="mt-1 space-y-2">
          {entries.slice(0, 4).map((e) => (
            <li key={e.id} className="text-[11.5px] leading-snug">
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-brass-deep">
                {e.action}
              </div>
              <div className="text-ink">{e.detail}</div>
              <div className="text-ink-faint">
                {e.actor} · <span title={e.ts}>{relTime(e.ts)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
