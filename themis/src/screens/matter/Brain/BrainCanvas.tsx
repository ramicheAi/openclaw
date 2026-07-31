// Force-directed Case Brain canvas. react-force-graph-2d (Canvas2D) with
// custom node + link drawing tuned to the brand palette and the trust UX:
// verified citation edges emit a particle (visual delight + cognitive payoff
// — grounded = animated); unverified edges are dashed; privileged nodes are
// quarantined visually.

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import {
  annotateRevealTiming,
  applyLayout,
  buildGraph,
  filterToTick,
  filterToDate,
  type GraphData,
  type GraphNode,
  type Layout,
} from "../../../lib/graph";
import type { ChronEvent, DocItem, Entity, MatterDetail } from "../../../types";

// Canvas2D needs raw colors; CSS vars are inaccessible from the 2d context.
// Dark = the cinematic deep-ink instrument (design brief §5.5).
// Light = warm paper canvas so the graph reads in a sunlit office.
const C_DARK = {
  bg: "#070b13",
  brass: "#a67c3a",
  brassLight: "#e9cf95",
  brassSoft: "#ddc79a",
  info: "#5a8fd4",
  verify: "#4caa84",
  flag: "#d88f3a",
  danger: "#e15a52",
  ink: "#cdd6e0",
  inkSoft: "#8a98a8",
  inkFaint: "#5f6973",
};
const C_LIGHT = {
  bg: "#f4ecda",
  brass: "#8a5a1f",
  brassLight: "#7c5621",
  brassSoft: "#9d743a",
  info: "#2f5e9e",
  verify: "#2c7e5a",
  flag: "#a5631f",
  danger: "#b53d36",
  ink: "#1f1a14",
  inkSoft: "#5b5141",
  inkFaint: "#8a7f6c",
};

interface Props {
  matter: MatterDetail;
  documents: DocItem[];
  entities: Entity[];
  chronology: ChronEvent[];
  layout: Layout;
  highlightNodeIds: Set<string>;
  highlightActive: boolean;
  assemblyTick: number | null;
  /** Time-scrubber cursor (ISO YYYY-MM-DD); when set, only nodes on/before it render. */
  timeCursor?: string | null;
  onNodeClick?: (node: GraphNode) => void;
  theme?: "light" | "dark";
}

export function BrainCanvas({
  matter,
  documents,
  entities,
  chronology,
  layout,
  highlightNodeIds,
  highlightActive,
  assemblyTick,
  timeCursor,
  onNodeClick,
  theme = "dark",
}: Props) {
  const C = theme === "light" ? C_LIGHT : C_DARK;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: Math.max(200, cr.width), h: Math.max(200, cr.height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const annotatedGraph = useMemo(
    () => annotateRevealTiming(buildGraph(matter, documents, entities, chronology)),
    [matter, documents, entities, chronology],
  );

  const filtered = useMemo(() => {
    let g = filterToTick(annotatedGraph, assemblyTick);
    // Time-scrubber active in Timeline layout only — applying it elsewhere
    // would silently hide nodes the user isn't expecting to disappear.
    if (layout === "time" && timeCursor) g = filterToDate(g, timeCursor);
    return g;
  }, [annotatedGraph, assemblyTick, layout, timeCursor]);

  const data: GraphData = useMemo(
    () => applyLayout(filtered, layout, size.w, size.h),
    [filtered, layout, size.w, size.h],
  );

  // Reheat sim on layout change or tick change.
  useEffect(() => {
    fgRef.current?.d3ReheatSimulation();
  }, [layout, assemblyTick]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        width={size.w}
        height={size.h}
        backgroundColor={C.bg}
        cooldownTicks={layout === "force" ? 200 : 0}
        d3VelocityDecay={0.32}
        warmupTicks={layout === "force" ? 30 : 0}
        nodeRelSize={4}
        nodeCanvasObjectMode={() => "replace"}
        nodeCanvasObject={(node, ctx, scale) =>
          drawNode(node as GraphNode, ctx, scale, highlightNodeIds, highlightActive, C)
        }
        linkColor={(l) => linkColor(l as { type: string; verified?: boolean; source: GraphNode; target: GraphNode }, highlightNodeIds, highlightActive, C)}
        linkWidth={(l) => linkWidth(l as { type: string; verified?: boolean; source: GraphNode; target: GraphNode }, highlightNodeIds, highlightActive)}
        linkLineDash={(l) => linkDash(l as { type: string; verified?: boolean })}
        linkDirectionalParticles={(l) => ((l as { type: string; verified?: boolean }).type === "citation" && (l as { verified?: boolean }).verified ? 1 : 0)}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleColor={() => C.brassLight}
        linkDirectionalParticleWidth={2.2}
        onNodeClick={(n) => onNodeClick?.(n as GraphNode)}
        onNodeHover={(n) => {
          if (containerRef.current) containerRef.current.style.cursor = n ? "pointer" : "default";
        }}
      />
    </div>
  );
}

type Palette = typeof C_DARK;
function nodeStyle(node: GraphNode, C: Palette): { r: number; fill: string; ring?: string; ringDashed?: boolean; label?: boolean } {
  switch (node.kind) {
    case "entity":
      return { r: 9, fill: C.info, label: true };
    case "claim":
      return { r: 11, fill: C.brassLight, label: true };
    case "defense":
      return { r: 11, fill: C.inkSoft, label: true };
    case "event": {
      const fill =
        node.accepted === true
          ? C.brass
          : node.accepted === false
            ? C.inkFaint
            : C.flag;
      return { r: 6, fill, ringDashed: !node.verified, ring: !node.verified ? C.flag : undefined };
    }
    case "doc": {
      if (node.privileged) return { r: 3.5, fill: C.flag, ringDashed: true, ring: C.flag };
      if (node.hot) return { r: 5, fill: C.danger, ring: C.danger };
      return { r: 3.2, fill: C.brass };
    }
  }
}

function drawNode(
  node: GraphNode,
  ctx: CanvasRenderingContext2D,
  scale: number,
  causalIds: Set<string>,
  causalActive: boolean,
  C: Palette,
) {
  const s = nodeStyle(node, C);
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const inCausal = causalIds.has(node.id);
  const glow = causalActive && inCausal;

  // Halo for causal-chain nodes.
  if (glow) {
    ctx.beginPath();
    ctx.arc(x, y, s.r + 10, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(x, y, s.r, x, y, s.r + 10);
    grad.addColorStop(0, "rgba(233,207,149,0.55)");
    grad.addColorStop(1, "rgba(233,207,149,0)");
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Glow for hot docs.
  if (node.kind === "doc" && node.hot) {
    ctx.beginPath();
    ctx.arc(x, y, s.r + 4, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(x, y, s.r, x, y, s.r + 4);
    grad.addColorStop(0, "rgba(225,90,82,0.5)");
    grad.addColorStop(1, "rgba(225,90,82,0)");
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Body
  ctx.beginPath();
  ctx.arc(x, y, s.r, 0, Math.PI * 2);
  ctx.fillStyle = s.fill;
  ctx.fill();

  // Outer ring (e.g. unverified, hot, privileged)
  if (s.ring) {
    ctx.beginPath();
    ctx.arc(x, y, s.r + 2.2, 0, Math.PI * 2);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = s.ring;
    if (s.ringDashed) ctx.setLineDash([2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Privileged: small lock indicator (a top tick)
  if (node.privileged) {
    ctx.beginPath();
    ctx.fillStyle = C.flag;
    ctx.fillRect(x - 1, y - s.r - 5, 2, 3);
  }

  // Label
  if (s.label && scale >= 0.6) {
    const fontSize = node.kind === "entity" ? 11 : 10;
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const label = node.label.length > 28 ? node.label.slice(0, 26) + "…" : node.label;
    // background pill for readability over the canvas
    const m = ctx.measureText(label);
    const pad = 4;
    const yL = y + s.r + 5;
    // Label backing pill — match the canvas bg so labels read against either palette.
    ctx.fillStyle = C.bg === "#070b13" ? "rgba(7,11,19,0.7)" : "rgba(244,236,218,0.85)";
    ctx.fillRect(x - m.width / 2 - pad, yL - 1, m.width + pad * 2, fontSize + 4);
    ctx.fillStyle = node.kind === "defense" ? C.ink : C.brass;
    ctx.fillText(label, x, yL + 1);
  }
}

function linkColor(
  l: { type: string; verified?: boolean; source: GraphNode; target: GraphNode },
  causalIds: Set<string>,
  causalActive: boolean,
  C: Palette,
): string {
  if (causalActive && causalIds.has(l.source.id) && causalIds.has(l.target.id)) return C.brassLight;
  switch (l.type) {
    case "citation":
      return l.verified ? "rgba(166,124,58,0.85)" : "rgba(216,143,58,0.45)";
    case "thread":
      return "rgba(138,152,168,0.35)";
    case "relationship":
      return "rgba(90,143,212,0.55)";
    case "support":
      return "rgba(76,170,132,0.75)";
    default:
      return "rgba(255,255,255,0.15)";
  }
}

function linkWidth(
  l: { type: string; verified?: boolean; source: GraphNode; target: GraphNode },
  causalIds: Set<string>,
  causalActive: boolean,
): number {
  if (causalActive && causalIds.has(l.source.id) && causalIds.has(l.target.id)) return 2.4;
  if (l.type === "support") return 1.6;
  if (l.type === "citation") return 1.1;
  return 0.6;
}

function linkDash(l: { type: string; verified?: boolean }): number[] {
  if (l.type === "citation" && !l.verified) return [3, 3];
  return [];
}
