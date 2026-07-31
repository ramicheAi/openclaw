// Archive — closed matters. Hash-chained audit + docs + chronology
// preserved entirely; just hidden from the active dashboard.
// Hover any row to unarchive (returns it to the main dashboard).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "../lib/queries";
import { cx } from "../lib/ui";
import type { MatterSummary } from "../types";

function fmt(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

export function ArchiveScreen({ onOpenMatter }: { onOpenMatter: (id: string) => void }) {
  const qc = useQueryClient();
  const archived = useQuery({ queryKey: ["archived-matters"], queryFn: api.listArchivedMatters });
  const unarchive = useMutation({
    mutationFn: (id: string) => api.setMatterArchived(id, false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archived-matters"] });
      qc.invalidateQueries({ queryKey: qk.matters });
    },
  });

  const list = archived.data ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-line bg-surface px-8 py-5">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
            Archive
          </div>
          <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">Closed matters</h1>
          <p className="mt-0.5 max-w-2xl text-[12.5px] text-ink-soft">
            Archived matters are hidden from the active dashboard but preserved entirely — every document, chronology
            event, audit row, and share link remains intact. Unarchive any matter to return it to the main view.
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {archived.isLoading ? (
          <div className="text-[12.5px] text-ink-soft">Loading archived matters…</div>
        ) : list.length === 0 ? (
          <div className="mx-auto mt-16 max-w-md rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center text-[12.5px] text-ink-soft">
            No archived matters. Use the Archive action on any matter's settings to move it here when the case closes.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <ArchiveCard
                key={m.id}
                m={m}
                onOpen={() => onOpenMatter(m.id)}
                onUnarchive={() => unarchive.mutate(m.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ArchiveCard({ m, onOpen, onUnarchive }: { m: MatterSummary; onOpen: () => void; onUnarchive: () => void }) {
  return (
    <li className="group rounded-xl border border-line bg-surface p-4">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="line-clamp-1 font-display text-[16px] font-semibold leading-tight text-ink">{m.name}</h3>
          <span className="shrink-0 rounded-full border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">
            Archived
          </span>
        </div>
        <div className="mt-0.5 text-[12px] text-ink-soft">
          {m.matterType} · {m.client}
        </div>
        <div className="mt-3 flex items-center gap-3 font-mono text-[10.5px] text-ink-faint">
          <span>{fmt(m.pages)} pages</span>
          <span>·</span>
          <span>{fmt(m.docs)} docs</span>
          {m.hotDocs > 0 && (
            <>
              <span>·</span>
              <span className="text-danger">{m.hotDocs} hot</span>
            </>
          )}
        </div>
      </button>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onUnarchive}
          className={cx(
            "rounded-md border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink-soft transition",
            "hover:border-brass-soft hover:text-brass-deep",
          )}
        >
          Unarchive →
        </button>
        <button
          onClick={onOpen}
          className="rounded-md border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink-soft transition hover:border-brass-soft hover:text-brass-deep"
        >
          Open read-only
        </button>
      </div>
    </li>
  );
}
