// Case Brain — cinematic mode. Per design handoff §3 + §5.5.
// Force-directed canvas + three layouts + verified-citation particle flow,
// named causal chains, ingest assembly replay, click-to-Inspector.

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  useCausalChains,
  useChronology,
  useDeleteChain,
  useDocuments,
  useEntities,
  useMatter,
  useUpdateChain,
} from "../../../lib/queries";
import { useTheme } from "../../../lib/theme";
import { computeScales } from "../Worktop/cards/ScalesMini";
import { IconArc, IconClose, IconPause, IconReplay } from "../../../icons";
import { cx } from "../../../lib/ui";
import { ASSEMBLY_DURATION_MS, annotateRevealTiming, buildGraph } from "../../../lib/graph";
import { Inspector } from "./Inspector";
import { CinematicStageHUD } from "./CinematicStageHUD";
import { CausalCinematic } from "./CausalCinematic";
import { TimeScrubber } from "./TimeScrubber";
import { NewChainModal } from "./NewChainModal";
import type { CausalChain } from "../../../types";
import type { GraphNode, Layout } from "../../../lib/graph";

const BrainCanvas = lazy(() =>
  import("./BrainCanvas").then((m) => ({ default: m.BrainCanvas })),
);

export function CaseBrain({ matterId }: { matterId: string }) {
  const { data: matter } = useMatter(matterId);
  const { data: docs } = useDocuments(matterId);
  const { data: entities } = useEntities(matterId);
  const { data: chron } = useChronology(matterId);
  const { data: chains } = useCausalChains(matterId);
  const updateChain = useUpdateChain(matterId);
  const deleteChain = useDeleteChain(matterId);
  // Honor the app theme — when the operator is in light mode we render the
  // canvas + consoles on warm paper instead of forcing the deep-ink look.
  const [theme] = useTheme();
  const isLight = theme === "light";
  const [layout, setLayout] = useState<Layout>("force");
  const [highlightActive, setHighlightActive] = useState(false);
  const [activeChainId, setActiveChainId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<GraphNode | null>(null);
  const [assemblyTick, setAssemblyTick] = useState<number | null>(null);
  const [timeCursor, setTimeCursor] = useState<string | null>(null);
  const [newChainOpen, setNewChainOpen] = useState(false);
  const tickRafRef = useRef<number | null>(null);
  const tickStartRef = useRef<number>(0);

  // Default to the first chain when available.
  useEffect(() => {
    if (!activeChainId && chains && chains[0]) setActiveChainId(chains[0].id);
  }, [activeChainId, chains]);

  // Ingest replay — animates assemblyTick from 0 to ASSEMBLY_DURATION_MS.
  function startReplay() {
    if (tickRafRef.current !== null) cancelAnimationFrame(tickRafRef.current);
    tickStartRef.current = performance.now();
    setAssemblyTick(0);
    const step = () => {
      const t = performance.now() - tickStartRef.current;
      if (t >= ASSEMBLY_DURATION_MS) {
        setAssemblyTick(null);
        tickRafRef.current = null;
        return;
      }
      setAssemblyTick(t);
      tickRafRef.current = requestAnimationFrame(step);
    };
    tickRafRef.current = requestAnimationFrame(step);
  }
  function pauseReplay() {
    if (tickRafRef.current !== null) {
      cancelAnimationFrame(tickRafRef.current);
      tickRafRef.current = null;
    }
  }
  useEffect(() => () => pauseReplay(), []);

  if (!matter) return <div className="grid h-full place-items-center text-[12px] text-ink-faint">Loading…</div>;

  const documents = docs ?? [];
  const ents = entities ?? [];
  const events = chron ?? [];
  const allChains = chains ?? [];
  const activeChain = allChains.find((c) => c.id === activeChainId) ?? null;
  const highlightNodeIds = computeChainNodeIds(activeChain);
  const hotCount = documents.filter((d) => d.hot).length;
  const flaggedCount = documents.filter((d) => d.privilege === "flagged").length;
  const verifiedChain = activeChain
    ? activeChain.nodes.filter((n) =>
        n.kind === "event" ? events.find((e) => e.id === n.id)?.citation.verified : true,
      ).length
    : 0;

  return (
    // Brain mode honors the app theme. Dark = the cinematic instrument from
    // the design brief (deep-ink canvas, glass consoles). Light = warm paper
    // canvas so paralegals in bright offices can read it. The data-theme
    // attribute pins every utility-class token (surface, ink, line, etc.) to
    // the chosen palette so consoles + HUD remain legible either way.
    <div
      data-theme={isLight ? "light" : "dark"}
      className={cx(
        "relative min-h-0 flex-1 overflow-hidden text-ink",
        isLight ? "bg-[#f4ecda]" : "bg-[#070b13]",
      )}
    >
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
            highlightNodeIds={highlightNodeIds}
            highlightActive={highlightActive}
            assemblyTick={assemblyTick}
            timeCursor={timeCursor}
            onNodeClick={setInspect}
            theme={isLight ? "light" : "dark"}
          />
        </Suspense>
      )}

      <CinematicStageHUD
        tick={assemblyTick}
        graph={annotateRevealTiming(buildGraph(matter, documents, ents, events))}
        totalDocs={matter.docs}
        totalPages={matter.pages}
      />

      <CausalCinematic
        chain={activeChain}
        events={events}
        active={highlightActive}
        docCount={documents.length}
        verifiedCount={verifiedChain}
        flaggedCount={flaggedCount}
      />

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
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-soft">{matter.caseTheory.posture}</p>
        <div className="mt-3">
          <Eyebrow>Ingest pipeline</Eyebrow>
          <ul className="mt-1 space-y-1">
            {matter.ingestStages.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-[11px]">
                <span className={cx("h-1.5 w-1.5 rounded-full", s.done ? "bg-verify" : "bg-brass-soft/30")} />
                <span className={s.done ? "" : "text-ink-faint"}>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
        {matter.gapFindings.length > 0 && (
          <div className="mt-3">
            <Eyebrow>Gaps</Eyebrow>
            <ul className="mt-1 space-y-1.5">
              {matter.gapFindings.map((g, i) => (
                <li key={i} className="text-[11px] leading-snug text-ink-soft">
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
          <div className="mt-1 text-[11px] text-ink-soft">
            {hotCount} flagged hot · click any node to inspect.
          </div>
        </div>
        <div className="mt-3">
          <Eyebrow>Privilege wall</Eyebrow>
          <div className="mt-1 text-[11px] text-ink-soft">
            {flaggedCount} flagged for review · withheld nodes are quarantined.
          </div>
        </div>
      </Console>

      {/* Bottom strata */}
      <div
        className={cx(
          "absolute inset-x-0 bottom-0 z-10 border-t backdrop-blur-md",
          isLight ? "border-line/40 bg-[rgba(248,242,229,0.78)]" : "border-white/5 bg-[rgba(13,22,34,0.66)]",
        )}
      >
        <CausalChainRibbon
          chains={allChains}
          active={activeChain}
          highlightActive={highlightActive}
          onHighlightToggle={() => setHighlightActive((v) => !v)}
          onSelectChain={(id) => {
            setActiveChainId(id);
            setHighlightActive(true);
          }}
          onNewChain={() => setNewChainOpen(true)}
          onRename={(name) => activeChain && updateChain.mutate({ chainId: activeChain.id, patch: { name } })}
          onDelete={() =>
            activeChain &&
            window.confirm(`Delete chain "${activeChain.name}"?`) &&
            deleteChain.mutate(activeChain.id, { onSuccess: () => setActiveChainId(null) })
          }
          verifiedCount={verifiedChain}
          totalCount={activeChain?.nodes.length ?? 0}
        />
        <FilterRibbon
          layout={layout}
          onLayout={setLayout}
          replaying={assemblyTick !== null}
          onReplay={startReplay}
          onPause={pauseReplay}
          tick={assemblyTick}
          scrubber={
            layout === "time" ? (
              <TimeScrubber
                documents={documents}
                chronology={events}
                value={timeCursor}
                onChange={setTimeCursor}
              />
            ) : null
          }
        />
      </div>

      <Inspector node={inspect} onClose={() => setInspect(null)} />

      <NewChainModal
        open={newChainOpen}
        matterId={matterId}
        events={events}
        documents={documents}
        onClose={() => setNewChainOpen(false)}
        onCreated={(id) => {
          setActiveChainId(id);
          setHighlightActive(true);
        }}
      />
    </div>
  );
}

function computeChainNodeIds(chain: CausalChain | null): Set<string> {
  if (!chain) return new Set();
  return new Set(
    chain.nodes.map((n) => (n.kind === "event" ? `v:${n.id}` : n.kind === "doc" ? `d:${n.id}` : `e:${n.id}`)),
  );
}

function Console({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "absolute z-10 rounded-xl border px-3.5 py-3 text-ink shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)]",
        "border-[color-mix(in_srgb,var(--color-line)_60%,transparent)]",
        "bg-[color-mix(in_srgb,var(--color-surface)_85%,transparent)]",
        "backdrop-blur-[18px] backdrop-saturate-150",
        className,
      )}
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
      className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-xl border border-[color-mix(in_srgb,var(--color-line)_60%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_85%,transparent)] px-4 py-2 backdrop-blur-[18px]"
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

function CausalChainRibbon({
  chains,
  active,
  highlightActive,
  onHighlightToggle,
  onSelectChain,
  onNewChain,
  onRename,
  onDelete,
  verifiedCount,
  totalCount,
}: {
  chains: CausalChain[];
  active: CausalChain | null;
  highlightActive: boolean;
  onHighlightToggle: () => void;
  onSelectChain: (id: string) => void;
  onNewChain: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  verifiedCount: number;
  totalCount: number;
}) {
  // Reyes default chain gets the cinematic "32" overlay.
  const isReyesArc = active?.name.toLowerCase().includes("32 days");
  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
      <button
        onClick={onHighlightToggle}
        disabled={!active}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition disabled:opacity-40",
          highlightActive && active
            ? "border-brass bg-brass text-[#070b13]"
            : "border-brass-soft/40 text-brass-soft hover:border-brass",
        )}
      >
        <IconArc size={13} /> Highlight causal chain
      </button>

      {chains.length === 0 ? (
        <div className="text-[11px] text-ink-soft">
          No saved causal chains. Create one to bind a story to the case.
        </div>
      ) : (
        <>
          {isReyesArc && <div className="font-display text-[32px] font-semibold text-brass-light">32</div>}
          <select
            value={active?.id ?? ""}
            onChange={(e) => onSelectChain(e.target.value)}
            className="rounded border border-white/10 bg-[#070b13]/60 px-2 py-1 text-[11px] text-brass-light outline-none focus:border-brass"
          >
            {chains.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#0c1622] text-brass-light">
                {c.name}
              </option>
            ))}
          </select>
          {active && (
            <>
              <button
                onClick={() => {
                  const name = window.prompt("Rename chain", active.name);
                  if (name && name.trim()) onRename(name.trim());
                }}
                className="text-[10px] text-brass-soft hover:text-brass-light"
              >
                rename
              </button>
              <button
                onClick={onDelete}
                aria-label="Delete chain"
                className="grid h-5 w-5 place-items-center rounded text-brass-soft/60 hover:bg-danger-wash/20 hover:text-danger"
              >
                <IconClose size={11} />
              </button>
            </>
          )}
        </>
      )}

      {/* "+ New chain" — saves another narrative arc for this matter.
       * Per design brief sprint 3: causal-chain management as multi-arc
       * save/name/load. Available whether or not chains exist. */}
      <button
        onClick={onNewChain}
        className="inline-flex items-center gap-1 rounded border border-brass-soft/30 px-1.5 py-0.5 font-mono text-[10px] text-brass-soft hover:border-brass hover:text-brass-light"
      >
        + new chain
      </button>

      <div className="ml-auto rounded-full border border-verify/30 bg-verify/10 px-2 py-0.5 font-mono text-[10px] text-verify">
        {verifiedCount}/{totalCount} links verified
      </div>
    </div>
  );
}

function FilterRibbon({
  layout,
  onLayout,
  replaying,
  onReplay,
  onPause,
  tick,
  scrubber,
}: {
  layout: Layout;
  onLayout: (l: Layout) => void;
  replaying: boolean;
  onReplay: () => void;
  onPause: () => void;
  tick: number | null;
  scrubber?: React.ReactNode;
}) {
  const layouts: { id: Layout; label: string }[] = [
    { id: "force", label: "Force" },
    { id: "orbital", label: "Orbital" },
    { id: "time", label: "Timeline" },
  ];
  const tickLabel =
    tick === null
      ? "settled"
      : tick < 1800
        ? "upload"
        : tick < 2800
          ? "ocr"
          : tick < 3600
            ? "bates"
            : tick < 4600
              ? "dedup + thread"
              : tick < 6800
                ? "extraction"
                : tick < 8200
                  ? "privilege scan"
                  : "settling";
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
      {replaying ? (
        <button onClick={onPause} className="inline-flex items-center gap-1 text-brass-light">
          <IconPause size={12} /> Pause
        </button>
      ) : (
        <button onClick={onReplay} className="inline-flex items-center gap-1 hover:text-brass-light">
          <IconReplay size={12} /> Replay ingest
        </button>
      )}
      <span className="ml-2 rounded-full border border-brass-soft/30 bg-brass-soft/10 px-2 py-0.5 text-brass-light">
        stage · {tickLabel}
      </span>
      {scrubber}
    </div>
  );
}

function BrainEmpty() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="text-center text-[12px] text-brass-soft">
        <div className="font-mono uppercase tracking-[0.18em]">Ingest incomplete</div>
        <div className="mt-1 text-ink-soft">
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
