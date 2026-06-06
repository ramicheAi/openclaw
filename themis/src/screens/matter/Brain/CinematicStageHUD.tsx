// CinematicStageHUD — the floating stage label + progress overlay that
// shows during ingest assembly replay. Per design brief §2.4 ("the moment
// that wins the demo") and brain.jsx stage schedule:
//   0→1800ms   uploading (docs stream in)
//   1800→2800  OCR · Azure DI
//   2800→3600  Bates stamp
//   3600→4600  Dedup + threading
//   4600→6800  Entity extraction
//   6800→8200  Privilege scan
//   8200→∞     Settled · breathing
//
// Surfaces as a glass card in the top-center during replay only. Counters
// (docs / pages / entities / privilege flagged) tick up as the simulation
// advances, computed from how many nodes have revealAt <= tick.

import { cx } from "../../../lib/ui";
import { ASSEMBLY_DURATION_MS } from "../../../lib/graph";
import type { GraphData } from "../../../lib/graph";

const STAGES = [
  { key: "upload", label: "Streaming documents", from: 0, to: 1800 },
  { key: "ocr", label: "OCR · Azure DI", from: 1800, to: 2800 },
  { key: "bates", label: "Bates stamp", from: 2800, to: 3600 },
  { key: "dedup", label: "Dedup + threading", from: 3600, to: 4600 },
  { key: "extract", label: "Entity extraction", from: 4600, to: 6800 },
  { key: "privilege", label: "Privilege scan", from: 6800, to: 8200 },
  { key: "settled", label: "Brain ready · breathing", from: 8200, to: Infinity },
];

function stageAt(t: number) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (t >= STAGES[i].from) return STAGES[i];
  }
  return STAGES[0];
}

interface Props {
  tick: number | null;
  graph: GraphData;
  totalDocs: number;
  totalPages: number;
}

export function CinematicStageHUD({ tick, graph, totalDocs, totalPages }: Props) {
  // Only render during replay (tick !== null). Once assembly is done the
  // canvas takes over; the HUD silently retires.
  if (tick === null) return null;

  const t = Math.min(tick, ASSEMBLY_DURATION_MS);
  const pct = (t / ASSEMBLY_DURATION_MS) * 100;
  const stage = stageAt(t);
  const stageIdx = STAGES.indexOf(stage);

  // Live counters — fraction of nodes revealed so far. Maps onto the real
  // corpus numbers for the cinematic effect.
  const revealedNodes = graph.nodes.filter((n) => (n.revealAt ?? 0) <= t);
  const revealedDocs = revealedNodes.filter((n) => n.kind === "doc").length;
  const totalGraphDocs = Math.max(1, graph.nodes.filter((n) => n.kind === "doc").length);
  const docsShown = Math.min(totalDocs, Math.round((revealedDocs / totalGraphDocs) * totalDocs));
  const pagesShown = Math.min(totalPages, Math.round((revealedDocs / totalGraphDocs) * totalPages));
  const entitiesShown = revealedNodes.filter((n) => n.kind === "entity").length;
  const flagged = revealedNodes.filter((n) => n.privileged).length;

  return (
    <div className="pointer-events-none absolute left-1/2 top-[88px] z-20 -translate-x-1/2 select-none">
      <div className="rounded-xl border border-white/10 bg-[rgba(13,22,34,0.78)] px-5 py-3 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-md">
        {/* Stage label + progress bar */}
        <div className="flex items-baseline gap-3">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.2em] text-brass-soft">
            stage {stageIdx + 1}/{STAGES.length}
          </div>
          <div className="font-display text-[16px] font-semibold text-ink">{stage.label}</div>
        </div>
        <div className="mt-2 h-1 w-[440px] overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-brass-soft via-brass-light to-brass-soft transition-[width] duration-[180ms]"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Tickers */}
        <div className="mt-2.5 grid grid-cols-4 gap-4 text-center font-mono">
          <Ticker label="docs" value={docsShown.toLocaleString()} accent={stageIdx <= 1 ? "live" : "done"} />
          <Ticker label="pages" value={pagesShown.toLocaleString()} accent={stageIdx <= 2 ? "live" : "done"} />
          <Ticker label="entities" value={entitiesShown.toLocaleString()} accent={stageIdx === 4 ? "live" : stageIdx > 4 ? "done" : "dim"} />
          <Ticker label="flagged" value={flagged.toLocaleString()} accent={stageIdx === 5 ? "live" : stageIdx > 5 ? "done" : "dim"} />
        </div>
      </div>
    </div>
  );
}

function Ticker({ label, value, accent }: { label: string; value: string; accent: "live" | "done" | "dim" }) {
  return (
    <div>
      <div
        className={cx(
          "text-[15px] font-semibold tabular-nums",
          accent === "live" ? "text-brass-light" : accent === "done" ? "text-verify" : "text-ink-faint",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[8.5px] uppercase tracking-[0.18em] text-ink-faint">{label}</div>
    </div>
  );
}
