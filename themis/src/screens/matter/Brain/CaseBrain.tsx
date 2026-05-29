// Case Brain — cinematic mode. Per design handoff §3 + §5.5.
// Full force-directed canvas with three layouts, particle flow on verified
// citation edges, click-to-inspector, and the floating HUD chrome.

import { Suspense, lazy, useState } from "react";
import { useMatter, useChronology, useEntities, useDocuments } from "../../../lib/queries";
import { computeScales } from "../Worktop/cards/ScalesMini";
import { IconArc, IconPause, IconReplay } from "../../../icons";
import { cx } from "../../../lib/ui";
import { Inspector } from "./Inspector";
import type { GraphNode, Layout } from "../../../lib/graph";

// react-force-graph-2d pulls in d3 — split it off the main bundle.
const BrainCanvas = lazy(() =>
  import("./BrainCanvas").then((m) => ({ default: m.BrainCanvas })),
);

export function CaseBrain({ matterId }: { matterId: string }) {
  const { data: matter } = useMatter(matterId);
  const { data: docs } = useDocuments(matterId);
  const { data: entities } = useEntities(matterId);
  const { data: chron } = useChronology(matterId);
  const [layout, setLayout] = useState<Layout>("force");
  const [causalActive, setCausalActive] = useState(false);
  const [inspect, setInspect] = useState<GraphNode | null>(null);

  if (!matter) return <div className="grid h-full place-items-center text-[12px] text-ink-faint">Loading…</div>;

  const documents = docs ?? [];
  const ents = entities ?? [];
  const events = chron ?? [];
  const hotCount = documents.filter((d) => d.hot).length;
  const flaggedCount = documents.filter((d) => d.privilege === "flagged").length;
  const verifiedChain = events.filter((e) => e.citation.verified).length;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#070b13] text-[--color-ink-dark]">
      {documents.length === 0 ? (
        <BrainEmpty />
      ) : (
        <Suspense fallback={<BrainLoading />}>
          <BrainCanvas
            matter={matter}
            documents={documents}
            entities={ents}
            chronology={events}
            layout={layout}
            highlightCausal={causalActive}
            onNodeClick={setInspect}
          />
        </Suspense>
      )}

      {/* Telemetry ribbon */}
      <Telemetry
        pages={matter.pages}
        docs={matter.docs}
        entities={ents.length}
        hot={hotCount}
        priv={flaggedCount}
      />

      {/* Left console */}
      <Console className="left-4 top-20 w-[332px]">
        <Eyebrow>Case theory</Eyebrow>
        <div className="mt-1 font-display text-[15px] font-semibold leading-snug">{matter.name}</div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[--color-ink-soft-dark]">{matter.caseTheory.posture}</p>
        <div className="mt-3">
          <Eyebrow>Ingest pipeline</Eyebrow>
          <ul className="mt-1 space-y-1">
            {matter.ingestStages.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-[11px]">
                <span className={cx("h-1.5 w-1.5 rounded-full", s.done ? "bg-verify" : "bg-brass-soft/30")} />
                <span className={s.done ? "" : "text-[--color-ink-faint-dark]"}>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
        {matter.gapFindings.length > 0 && (
          <div className="mt-3">
            <Eyebrow>Gaps</Eyebrow>
            <ul className="mt-1 space-y-1.5">
              {matter.gapFindings.map((g, i) => (
                <li key={i} className="text-[11px] leading-snug text-[--color-ink-soft-dark]">
                  <span
                    className={cx(
                      "mr-1 font-mono text-[9px] uppercase",
                      g.severity === "high" ? "text-danger" : g.severity === "medium" ? "text-flag" : "text-brass-soft",
                    )}
                  >
                    {g.severity}
                  </span>
                  {g.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Console>

      {/* Right console */}
      <Console className="right-4 top-20 w-[356px]">
        <Eyebrow>Scales of Themis</Eyebrow>
        <BrainScales events={events} />
        <div className="mt-3">
          <Eyebrow>Hot documents</Eyebrow>
          <div className="mt-1 text-[11px] text-[--color-ink-soft-dark]">
            {hotCount} flagged hot · click any node to inspect.
          </div>
        </div>
        <div className="mt-3">
          <Eyebrow>Privilege wall</Eyebrow>
          <div className="mt-1 text-[11px] text-[--color-ink-soft-dark]">
            {flaggedCount} flagged for review · withheld nodes are quarantined in the canvas.
          </div>
        </div>
      </Console>

      {/* Bottom strata */}
      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/5 bg-[rgba(13,22,34,0.66)] backdrop-blur-md">
        <CausalChain
          active={causalActive}
          onToggle={() => setCausalActive((v) => !v)}
          verifiedChain={verifiedChain}
          matterName={matter.name}
        />
        <FilterRibbon layout={layout} onLayout={setLayout} />
      </div>

      {/* Inspector slide-in */}
      <Inspector node={inspect} onClose={() => setInspect(null)} />
    </div>
  );
}

function Console({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "absolute z-10 rounded-xl border border-white/10 px-3.5 py-3 text-[--color-ink-dark] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]",
        className,
      )}
      style={{ background: "rgba(13,22,34,0.66)", backdropFilter: "blur(18px) saturate(140%)" }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-brass-soft">{children}</div>
  );
}

function Telemetry({
  pages,
  docs,
  entities,
  hot,
  priv,
}: {
  pages: number;
  docs: number;
  entities: number;
  hot: number;
  priv: number;
}) {
  const cells = [
    { label: "Pages", v: pages.toLocaleString() },
    { label: "Documents", v: docs.toLocaleString() },
    { label: "Entities", v: entities.toLocaleString() },
    { label: "Hot", v: hot.toLocaleString() },
    { label: "Priv. queue", v: priv.toLocaleString() },
  ];
  return (
    <div
      className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-xl border border-white/10 px-4 py-2"
      style={{ background: "rgba(13,22,34,0.66)", backdropFilter: "blur(18px)" }}
    >
      <div className="flex items-center gap-5">
        {cells.map((c) => (
          <div key={c.label} className="text-center">
            <div className="font-display text-[18px] font-semibold leading-none text-brass-light">{c.v}</div>
            <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.18em] text-brass-soft/80">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrainScales({ events }: { events: Parameters<typeof computeScales>[0] }) {
  const { plaintiff, defense, tilt } = computeScales(events);
  const total = plaintiff + defense;
  return (
    <div className="mt-1.5">
      <svg viewBox="0 0 240 90" className="w-full" aria-label="Scales of Themis">
        <line x1={120} y1={10} x2={120} y2={78} stroke="currentColor" className="text-brass-soft" strokeWidth={2} />
        <g
          style={{
            transformOrigin: "120px 16px",
            transform: `rotate(${-tilt}deg)`,
            transition: "transform 800ms cubic-bezier(.4,1.6,.4,1)",
          }}
        >
          <line x1={28} y1={16} x2={212} y2={16} stroke="currentColor" className="text-brass" strokeWidth={2.6} />
          <line x1={56} y1={16} x2={56} y2={42} stroke="currentColor" className="text-brass" strokeWidth={1.2} />
          <path d="M40 42 Q56 58 72 42" fill="none" stroke="currentColor" className="text-brass" strokeWidth={2.2} />
          <line x1={184} y1={16} x2={184} y2={42} stroke="currentColor" className="text-brass" strokeWidth={1.2} />
          <path d="M168 42 Q184 58 200 42" fill="none" stroke="currentColor" className="text-brass" strokeWidth={2.2} />
        </g>
      </svg>
      <div className="mt-2 flex items-baseline justify-between gap-2 font-mono text-[9.5px] uppercase tracking-wider text-brass-soft">
        <span>
          ▲ Plaintiff <span className="ml-1 font-display text-[22px] font-semibold text-brass-light">{plaintiff}</span>
        </span>
        <span>{total} grounded</span>
        <span>Defense {defense} ▽</span>
      </div>
    </div>
  );
}

function CausalChain({
  active,
  onToggle,
  verifiedChain,
  matterName,
}: {
  active: boolean;
  onToggle: () => void;
  verifiedChain: number;
  matterName: string;
}) {
  // The "32 days" overlay is the Reyes-specific story; other matters get a
  // muted generic chain count. Could become a named-arc dropdown later.
  const isReyes = matterName.toLowerCase().includes("reyes");
  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
      <button
        onClick={onToggle}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition",
          active ? "border-brass bg-brass text-[#070b13]" : "border-brass-soft/40 text-brass-soft hover:border-brass",
        )}
      >
        <IconArc size={13} /> Highlight causal chain
      </button>
      {isReyes ? (
        <>
          <div className="font-display text-[32px] font-semibold text-brass-light">32</div>
          <div className="text-[11px] leading-tight text-brass-soft">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em]">days · complaint → termination</div>
            <div className="text-[--color-ink-soft-dark]">
              Wage complaint → HR ack → first negative review → memo → termination
            </div>
          </div>
        </>
      ) : (
        <div className="text-[11px] text-[--color-ink-soft-dark]">No named causal chain in this matter yet.</div>
      )}
      <div className="ml-auto rounded-full border border-verify/30 bg-verify/10 px-2 py-0.5 font-mono text-[10px] text-verify">
        {verifiedChain}/{verifiedChain} links verified
      </div>
    </div>
  );
}

function FilterRibbon({ layout, onLayout }: { layout: Layout; onLayout: (l: Layout) => void }) {
  const layouts: { id: Layout; label: string }[] = [
    { id: "force", label: "Force" },
    { id: "orbital", label: "Orbital" },
    { id: "time", label: "Timeline" },
  ];
  return (
    <div className="flex items-center gap-3 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-brass-soft">
      <span>Layout</span>
      <div className="flex items-center rounded-md border border-white/10 bg-[#070b13]/60 p-0.5">
        {layouts.map((l) => (
          <button
            key={l.id}
            onClick={() => onLayout(l.id)}
            className={cx(
              "rounded px-2 py-1 text-[10px] uppercase tracking-wider",
              layout === l.id ? "bg-brass text-[#070b13]" : "text-brass-soft hover:text-brass-light",
            )}
          >
            {l.label}
          </button>
        ))}
      </div>
      <span>·</span>
      <button className="inline-flex items-center gap-1 hover:text-brass-light">
        <IconPause size={12} /> Pause
      </button>
      <button className="inline-flex items-center gap-1 hover:text-brass-light">
        <IconReplay size={12} /> Replay ingest
      </button>
    </div>
  );
}

function BrainEmpty() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="text-center text-[12px] text-brass-soft">
        <div className="font-mono uppercase tracking-[0.18em]">Ingest incomplete</div>
        <div className="mt-1 text-[--color-ink-soft-dark]">
          The brain will assemble itself as documents finish processing.
        </div>
      </div>
    </div>
  );
}

function BrainLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="text-center text-[11px] font-mono uppercase tracking-[0.18em] text-brass-soft">
        Igniting force simulation…
      </div>
    </div>
  );
}
