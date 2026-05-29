import { ArrowRight, FileStack, Files, Plus, ShieldAlert, TriangleAlert } from "lucide-react";
import { useMatters } from "../lib/queries";
import { Card, cx, Pill } from "../lib/ui";
import { DashboardEmpty, FirstRunSplash } from "./States";
import type { MatterSummary } from "../types";

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

const statusTone: Record<MatterSummary["status"], string> = {
  Ingesting: "border-info/25 bg-info-wash text-info",
  Ready: "border-verify/25 bg-verify-wash text-verify",
  "In Review": "border-brass-soft bg-brass-wash text-brass-deep",
};

function MatterCard({ m, onOpen }: { m: MatterSummary; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(m.id)}
      className="group text-left focus:outline-none"
    >
      <Card className="h-full p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_8px_24px_rgba(24,34,46,0.08)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span
              className={cx(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                statusTone[m.status],
              )}
            >
              {m.status === "Ingesting" && (
                <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
              )}
              {m.status}
            </span>
          </div>
          <ArrowRight
            size={18}
            className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brass"
          />
        </div>

        <h3 className="font-display mt-3 text-[17px] font-semibold leading-snug text-ink">
          {m.name}
        </h3>
        <div className="mt-1 text-[13px] text-ink-soft">{m.matterType}</div>
        <div className="mt-0.5 text-xs text-ink-faint">
          Client: {m.client} · Lead: {m.leadAttorney}
        </div>

        {m.status === "Ingesting" && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] text-ink-faint">
              <span>Ingesting & indexing</span>
              <span className="font-medium text-info">{m.ingestPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full bg-info transition-all"
                style={{ width: `${m.ingestPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
          <div className="flex items-center gap-2">
            <Files size={15} className="text-ink-faint" />
            <span className="text-[13px] text-ink-soft">
              <span className="font-semibold text-ink">{fmt(m.pages)}</span> pages
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FileStack size={15} className="text-ink-faint" />
            <span className="text-[13px] text-ink-soft">
              <span className="font-semibold text-ink">{fmt(m.docs)}</span> docs
            </span>
          </div>
        </div>

        {(m.hotDocs > 0 || m.privilegeQueue > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {m.hotDocs > 0 && (
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-danger">
                <TriangleAlert size={13} /> {m.hotDocs} hot docs
              </span>
            )}
            {m.privilegeQueue > 0 && (
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-flag">
                <ShieldAlert size={13} /> {m.privilegeQueue} privilege flags
              </span>
            )}
          </div>
        )}

        <div className="mt-3 text-[11px] text-ink-faint">Updated {m.lastActivity}</div>
      </Card>
    </button>
  );
}

export function MattersDashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: matters, isLoading } = useMatters();
  const list = matters ?? [];
  const totalPages = list.reduce((s, m) => s + m.pages, 0);

  // Cold-start splash on the very first run (server unreachable / 0 matters)
  // vs. the polished dashboard-empty when we know the list is genuinely empty.
  if (!isLoading && list.length === 0 && totalPages === 0 && !matters) {
    return <FirstRunSplash />;
  }
  if (!isLoading && list.length === 0) {
    return <DashboardEmpty />;
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-8 py-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Matters</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {isLoading
              ? "Loading…"
              : `${list.length} active case brains · ${fmt(totalPages)} pages under management · each isolated behind a conflict wall`}
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink/90">
          <Plus size={17} strokeWidth={2.4} />
          New Matter
        </button>
      </header>

      <div className="px-8 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pill tone="brass">All matters</Pill>
          <Pill>Employment</Pill>
          <Pill>Commercial</Pill>
          <Pill>Personal Injury</Pill>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => (
            <MatterCard key={m.id} m={m} onOpen={onOpen} />
          ))}
          <button
            className="grid min-h-[230px] place-items-center rounded-xl border border-dashed border-line-strong text-ink-faint transition-colors hover:border-brass hover:text-brass"
          >
            <div className="flex flex-col items-center gap-2">
              <Plus size={22} />
              <span className="text-sm font-medium">Create a new case brain</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
