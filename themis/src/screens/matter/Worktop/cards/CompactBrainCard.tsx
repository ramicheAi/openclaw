// Compact Case Brain — the mini constellation that sits at the top of the
// Worktop left rail. Renders a small force-laid SVG of the matter's hot
// documents + top entities + accepted chronology events, with their citation
// links. Same data shapes as the full BrainCanvas — this is just a
// resolution-reduced preview that hints at the cinema.

import { useMemo } from "react";
import type { MatterDetail, DocItem, Entity, ChronEvent } from "../../../../types";

interface Props {
  matter: MatterDetail;
  docs?: DocItem[];
  entities?: Entity[];
  chron?: ChronEvent[];
  onOpen: () => void;
}

type MiniNode = {
  id: string;
  kind: "doc" | "entity" | "event" | "claim";
  x: number;
  y: number;
  r: number;
  hot?: boolean;
  privileged?: boolean;
  verified?: boolean;
};

type MiniEdge = { a: string; b: string; verified?: boolean };

// Deterministic placement: each id hashes to an angle + radius around the
// centroid. Same matter → same constellation every render.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function place(id: string, ringRadius: number, jitter: number, cx: number, cy: number): { x: number; y: number } {
  const h = hash(id);
  const angle = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const radius = ringRadius + ((h >>> 16) & 0xff) / 0xff * jitter;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

export function CompactBrainCard({ matter, docs, entities, chron, onOpen }: Props) {
  const { nodes, edges } = useMemo(() => buildMini(matter, docs ?? [], entities ?? [], chron ?? []), [matter, docs, entities, chron]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-brass-soft bg-gradient-to-b from-[#0c1622] to-[#070b13] shadow-[0_8px_24px_-12px_rgba(7,11,19,0.6)]">
      <div className="flex items-center justify-between px-3.5 pt-3">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-soft">
          Case Brain
        </span>
        <button
          onClick={onOpen}
          className="text-[11px] font-medium text-brass-soft hover:text-brass-light"
        >
          open ›
        </button>
      </div>
      <div className="relative grid h-[220px] w-full place-items-center overflow-hidden">
        <svg viewBox="0 0 320 220" className="absolute inset-0 h-full w-full">
          {/* Edges first so they sit under the nodes */}
          {edges.map((e, i) => {
            const a = nodes.find((n) => n.id === e.a);
            const b = nodes.find((n) => n.id === e.b);
            if (!a || !b) return null;
            const color = e.verified ? "rgba(95,200,159,0.45)" : "rgba(208,164,90,0.22)";
            return (
              <line
                key={`e-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={e.verified ? 1.2 : 0.8}
              />
            );
          })}
          {/* Nodes */}
          {nodes.map((n) => {
            const fill =
              n.kind === "doc"
                ? n.hot
                  ? "#d0a45a"
                  : n.privileged
                    ? "#3a3a40"
                    : "#74a4ea"
                : n.kind === "entity"
                  ? "#5b8ad4"
                  : n.kind === "event"
                    ? n.verified
                      ? "#5fc89f"
                      : "#6b502a"
                    : "#d0a45a";
            const stroke = n.kind === "doc" && n.hot ? "rgba(241,208,145,0.7)" : "rgba(255,255,255,0.06)";
            return (
              <g key={n.id}>
                {n.hot && (
                  <circle cx={n.x} cy={n.y} r={n.r + 4} fill="rgba(208,164,90,0.18)" />
                )}
                <circle cx={n.x} cy={n.y} r={n.r} fill={fill} stroke={stroke} strokeWidth={0.8} />
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(208,164,90,0.10),transparent_70%)]" />
      </div>
      <div className="border-t border-white/5 px-3.5 py-2 font-mono text-[10px] text-brass-soft/70">
        {matter.docs.toLocaleString()} docs · {matter.pages.toLocaleString()} pg · ingest {matter.ingestPercent}%
      </div>
    </div>
  );
}

function buildMini(
  matter: MatterDetail,
  docs: DocItem[],
  entities: Entity[],
  chron: ChronEvent[],
): { nodes: MiniNode[]; edges: MiniEdge[] } {
  const cx = 160;
  const cy = 110;
  const nodes: MiniNode[] = [];
  const edges: MiniEdge[] = [];

  // Entities — the most-mentioned ~6 entities form the inner ring.
  const topEntities = [...entities]
    .sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0))
    .slice(0, 6);
  for (const e of topEntities) {
    const p = place(e.id, 38, 22, cx, cy);
    nodes.push({ id: `e:${e.id}`, kind: "entity", x: p.x, y: p.y, r: 5.5 });
  }

  // Docs — hot docs are gold + glow; privileged are quarantined; the rest form
  // a thin outer cloud. Limit visible count so the canvas stays legible.
  const sortedDocs = [...docs].sort((a, b) => {
    if (a.hot !== b.hot) return a.hot ? -1 : 1;
    if ((a.privilege === "flagged") !== (b.privilege === "flagged")) return a.privilege === "flagged" ? -1 : 1;
    return 0;
  });
  const visibleDocs = sortedDocs.slice(0, 18);
  for (const d of visibleDocs) {
    const p = place(d.id, d.hot ? 60 : 88, d.hot ? 16 : 22, cx, cy);
    nodes.push({
      id: `d:${d.id}`,
      kind: "doc",
      x: p.x,
      y: p.y,
      r: d.hot ? 4.5 : 3,
      hot: d.hot,
      privileged: d.privilege === "flagged" || d.privilege === "withheld",
    });
    // Wire doc → first entity it references (deterministic enough for the preview).
    const refEntity = topEntities.find((e) => d.entities?.some((name) => e.aliases?.includes(name) || e.name === name));
    if (refEntity) edges.push({ a: `d:${d.id}`, b: `e:${refEntity.id}`, verified: !d.privilege || d.privilege === "none" });
  }

  // Events — accepted chronology events as verify-green nodes around the centroid.
  const acceptedEvents = chron.filter((e) => e.accepted === true).slice(0, 6);
  for (const ev of acceptedEvents) {
    const p = place(ev.id, 24, 12, cx, cy);
    nodes.push({
      id: `ev:${ev.id}`,
      kind: "event",
      x: p.x,
      y: p.y,
      r: 4,
      verified: ev.citation?.verified === true,
    });
    // Wire event → its cited doc.
    const cited = visibleDocs.find((d) => d.bates === ev.citation?.bates);
    if (cited) edges.push({ a: `ev:${ev.id}`, b: `d:${cited.id}`, verified: ev.citation?.verified === true });
  }

  // A single anchor "claim" node at the centroid representing the matter theory.
  nodes.push({ id: "claim:matter", kind: "claim", x: cx, y: cy, r: 6.5 });

  // Connect events to the claim — the "what does it mean" spine.
  for (const ev of acceptedEvents) {
    edges.push({ a: `ev:${ev.id}`, b: "claim:matter", verified: true });
  }

  // Entity → claim faint connections so the inner ring reads as the case.
  for (const e of topEntities.slice(0, 3)) {
    edges.push({ a: `e:${e.id}`, b: "claim:matter" });
  }

  // Suppress the matter unused warning when matter has no docs at all.
  void matter;

  return { nodes, edges };
}
