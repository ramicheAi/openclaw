import { useState } from "react";
import { ArrowRight, FileStack, Files, Plus, ShieldAlert, TriangleAlert } from "lucide-react";
import { useMatters } from "../lib/queries";
import { Card, cx, Pill } from "../lib/ui";
import { FirstRunEmpty, FirstRunSplash } from "./States";
import { NewMatterModal } from "../components/NewMatterModal";
import type { MatterSummary } from "../types";

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

// Deterministic mini-constellation per matter card. Per design brief §5
// ("each card a miniature brain preview + status"). Density encodes corpus
// size; hot-doc and privilege counts drive the gold/lock node mix. Same
// matter id → same constellation every render (FNV-1a hash on position).
function hash(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function MatterCardBrain({ m }: { m: MatterSummary }) {
  const cx0 = 100;
  const cy = 56;
  // Density: small for tiny corpora, capped for legibility.
  const total = Math.min(28, 8 + Math.floor(Math.log2(Math.max(2, m.pages / 100))));
  const hotIdx = new Set<number>();
  const privIdx = new Set<number>();
  for (let i = 0; i < Math.min(m.hotDocs, total); i++) hotIdx.add((hash(m.id, 7 + i) % total));
  for (let i = 0; i < Math.min(m.privilegeQueue, total); i++) privIdx.add((hash(m.id, 31 + i) % total));

  const pts: { x: number; y: number; r: number; hot: boolean; priv: boolean }[] = [];
  for (let i = 0; i < total; i++) {
    const h = hash(m.id, i * 13);
    const angle = ((h & 0xfff) / 0xfff) * Math.PI * 2;
    const ring = (((h >>> 12) & 0xff) / 0xff) * 36 + 14;
    const x = cx0 + Math.cos(angle) * ring;
    const y = cy + Math.sin(angle) * ring * 0.7;
    pts.push({
      x,
      y,
      r: hotIdx.has(i) ? 3.2 : 2,
      hot: hotIdx.has(i),
      priv: privIdx.has(i),
    });
  }
  // Centroid claim
  pts.push({ x: cx0, y: cy, r: 3.8, hot: false, priv: false });
  // Edges — connect a few pts to the centroid + each other for the constellation feel.
  const edges: { a: number; b: number }[] = [];
  for (let i = 0; i < total; i++) {
    if ((hash(m.id, i * 7 + 1) & 0x3) === 0) edges.push({ a: i, b: total });
  }
  for (let i = 0; i < total - 1; i++) {
    if ((hash(m.id, i * 5 + 2) & 0x7) === 0) edges.push({ a: i, b: (i + 3) % total });
  }
  return (
    <svg viewBox="0 0 200 112" className="h-[100px] w-full" aria-hidden>
      <defs>
        <radialGradient id={`glow-${m.id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(208,164,90,0.18)" />
          <stop offset="70%" stopColor="rgba(208,164,90,0)" />
        </radialGradient>
      </defs>
      <rect width={200} height={112} fill={`url(#glow-${m.id})`} />
      {edges.map((e, i) => (
        <line
          key={`e-${i}`}
          x1={pts[e.a].x}
          y1={pts[e.a].y}
          x2={pts[e.b].x}
          y2={pts[e.b].y}
          stroke="rgba(208,164,90,0.18)"
          strokeWidth={0.6}
        />
      ))}
      {pts.map((p, i) => (
        <g key={i}>
          {p.hot && <circle cx={p.x} cy={p.y} r={p.r + 3} fill="rgba(208,164,90,0.18)" />}
          <circle
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill={p.hot ? "#d0a45a" : p.priv ? "#3a3a40" : i === total ? "#d0a45a" : "#74a4ea"}
            opacity={i === total ? 0.95 : 0.7}
          />
        </g>
      ))}
    </svg>
  );
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
      <Card className="h-full overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_8px_24px_rgba(24,34,46,0.08)]">
        {/* Mini brain preview — the brief's "miniature brain per card" */}
        <div className="relative bg-gradient-to-b from-[#0c1622] to-[#070b13]">
          <MatterCardBrain m={m} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(208,164,90,0.10),transparent_70%)]" />
        </div>
        <div className="p-5">
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
        </div>
      </Card>
    </button>
  );
}

export function MattersDashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: matters, isLoading } = useMatters();
  const list = matters ?? [];
  const totalPages = list.reduce((s, m) => s + m.pages, 0);
  const [newMatterOpen, setNewMatterOpen] = useState(false);

  // Cold-start splash on the very first run (server unreachable / 0 matters)
  // vs. the polished dashboard-empty when we know the list is genuinely empty.
  if (!isLoading && list.length === 0 && totalPages === 0 && !matters) {
    return (
      <>
        <FirstRunSplash onCreate={() => setNewMatterOpen(true)} />
        <NewMatterModal open={newMatterOpen} onClose={() => setNewMatterOpen(false)} onCreated={(id) => onOpen(id)} />
      </>
    );
  }
  if (!isLoading && list.length === 0) {
    return (
      <>
        <FirstRunEmpty onCreate={() => setNewMatterOpen(true)} />
        <NewMatterModal open={newMatterOpen} onClose={() => setNewMatterOpen(false)} onCreated={(id) => onOpen(id)} />
      </>
    );
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
        <button
          onClick={() => setNewMatterOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-3.5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink/90"
        >
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
            onClick={() => setNewMatterOpen(true)}
            className="grid min-h-[230px] place-items-center rounded-xl border border-dashed border-line-strong text-ink-faint transition-colors hover:border-brass hover:text-brass"
          >
            <div className="flex flex-col items-center gap-2">
              <Plus size={22} />
              <span className="text-sm font-medium">Create a new case brain</span>
            </div>
          </button>
        </div>
      </div>
      <NewMatterModal
        open={newMatterOpen}
        onClose={() => setNewMatterOpen(false)}
        onCreated={(id) => onOpen(id)}
      />
    </div>
  );
}
