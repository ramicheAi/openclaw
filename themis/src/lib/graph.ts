// Graph builder — transforms API data into nodes/links for the Case Brain
// canvas. Pure function; no rendering concerns.

import type { ChronEvent, DocItem, Entity, MatterDetail } from "../types";

export type NodeKind = "entity" | "doc" | "event" | "claim" | "defense";
export type LinkType = "thread" | "relationship" | "citation" | "support";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  hot?: boolean;
  privileged?: boolean;
  verified?: boolean;
  accepted?: boolean | null;
  date?: string;
  bates?: string;
  // payload (untyped to avoid widening; consumers cast back as needed)
  doc?: DocItem;
  entity?: Entity;
  event?: ChronEvent;
  // optional fixed positions for orbital / timeline layouts
  fx?: number;
  fy?: number;
  // mutable runtime (set by react-force-graph)
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: LinkType;
  verified?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// The Reyes causal chain — the 5-node retaliation arc per design handoff §5.5.
// Other matters won't have this; the Brain mode shows nothing if empty.
const CAUSAL_CHAIN_BY_MATTER: Record<string, string[]> = {
  "reyes-northwind": ["c2", "c3", "c4", "c5", "c6"],
};

export function causalChainFor(matterId: string): string[] {
  return CAUSAL_CHAIN_BY_MATTER[matterId] ?? [];
}

export function buildGraph(
  matter: MatterDetail,
  docs: DocItem[],
  entities: Entity[],
  events: ChronEvent[],
): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // Entities
  for (const e of entities) {
    nodes.push({
      id: `e:${e.id}`,
      kind: "entity",
      label: e.name,
      entity: e,
    });
  }

  // Documents
  for (const d of docs) {
    nodes.push({
      id: `d:${d.id}`,
      kind: "doc",
      label: d.bates,
      bates: d.bates,
      hot: d.hot,
      privileged: d.privilege === "flagged" || d.privilege === "withheld",
      date: d.date,
      doc: d,
    });
  }

  // Events
  for (const ev of events) {
    nodes.push({
      id: `v:${ev.id}`,
      kind: "event",
      label: ev.description.length > 40 ? ev.description.slice(0, 37) + "…" : ev.description,
      accepted: ev.accepted,
      verified: ev.citation.verified,
      date: ev.date,
      event: ev,
    });
  }

  // Claims + defenses
  matter.caseTheory.claims.forEach((c, i) => {
    nodes.push({ id: `c:${i}`, kind: "claim", label: c });
  });
  matter.caseTheory.defenses.forEach((d, i) => {
    nodes.push({ id: `f:${i}`, kind: "defense", label: d });
  });

  // --- Edges ---

  // Thread edges (sibling docs share thread_id)
  const threadIndex = new Map<string, string[]>();
  for (const d of docs) {
    if (!d.threadId) continue;
    const arr = threadIndex.get(d.threadId) ?? [];
    arr.push(d.id);
    threadIndex.set(d.threadId, arr);
  }
  for (const ids of threadIndex.values()) {
    for (let i = 0; i + 1 < ids.length; i++) {
      links.push({ source: `d:${ids[i]}`, target: `d:${ids[i + 1]}`, type: "thread" });
    }
  }

  // Relationship edges (entity → entity)
  const entityIdByName = new Map<string, string>();
  for (const e of entities) entityIdByName.set(e.name, e.id);
  for (const e of entities) {
    for (const r of e.relationships) {
      const targetId = entityIdByName.get(r.name);
      if (!targetId) continue;
      links.push({ source: `e:${e.id}`, target: `e:${targetId}`, type: "relationship" });
    }
  }

  // Citation edges — event → cited doc.
  const docIdByBates = new Map<string, string>();
  for (const d of docs) docIdByBates.set(d.bates, d.id);
  for (const ev of events) {
    const targetDoc = docIdByBates.get(ev.citation.bates);
    if (!targetDoc) continue;
    links.push({
      source: `v:${ev.id}`,
      target: `d:${targetDoc}`,
      type: "citation",
      verified: ev.citation.verified,
    });
  }

  // Support edges — claim/defense ← event, decided by issue-tag mapping. The
  // server-side ScalesMini.computeScales uses the same tag set; the visual
  // here matches the trust thesis.
  const PLAINTIFF_TAGS = new Set([
    "Retaliatory Motive",
    "Pretext",
    "Causation",
    "Protected Activity",
    "Adverse Action",
    "Employer Knowledge",
    "Wage Claim",
  ]);
  const claimIds = matter.caseTheory.claims.map((_, i) => `c:${i}`);
  const defenseIds = matter.caseTheory.defenses.map((_, i) => `f:${i}`);
  for (const ev of events) {
    if (ev.accepted !== true || !ev.citation.verified) continue;
    const plaintiffSide = ev.issueTags.some((t) => PLAINTIFF_TAGS.has(t));
    const anchor = plaintiffSide ? claimIds[0] : defenseIds[0];
    if (!anchor) continue;
    links.push({ source: anchor, target: `v:${ev.id}`, type: "support", verified: true });
  }

  return { nodes, links };
}

// --- Layout positioning helpers ---
// Force layout: no fixed positions, let the simulation do its job.
// Orbital: concentric rings by kind.
// Timeline: x by date, y banded by kind.

export type Layout = "force" | "orbital" | "time";

export function applyLayout(data: GraphData, layout: Layout, width: number, height: number): GraphData {
  const nodes = data.nodes.map((n) => ({ ...n, fx: undefined as number | undefined, fy: undefined as number | undefined }));

  if (layout === "force") return { nodes, links: data.links };

  if (layout === "orbital") {
    const cx = width / 2;
    const cy = height / 2;
    const rings: { kind: NodeKind; r: number }[] = [
      { kind: "entity", r: Math.min(width, height) * 0.18 },
      { kind: "event", r: Math.min(width, height) * 0.3 },
      { kind: "doc", r: Math.min(width, height) * 0.42 },
      { kind: "claim", r: Math.min(width, height) * 0.5 },
      { kind: "defense", r: Math.min(width, height) * 0.5 },
    ];
    for (const ring of rings) {
      const ring_nodes = nodes.filter((n) => n.kind === ring.kind);
      const n = ring_nodes.length;
      const offset = ring.kind === "defense" ? Math.PI : 0;
      ring_nodes.forEach((node, i) => {
        const t = (i / Math.max(1, n)) * Math.PI * 2 + offset;
        // Constrain claims/defenses to top/bottom arc rather than full circle.
        const theta =
          ring.kind === "claim"
            ? -Math.PI / 2 + ((i + 0.5) / Math.max(1, n)) * Math.PI * 0.4 - Math.PI * 0.2
            : ring.kind === "defense"
              ? Math.PI / 2 + ((i + 0.5) / Math.max(1, n)) * Math.PI * 0.4 - Math.PI * 0.2
              : t;
        node.fx = cx + ring.r * Math.cos(theta);
        node.fy = cy + ring.r * Math.sin(theta);
      });
    }
    return { nodes, links: data.links };
  }

  // time
  const datedNodes = nodes.filter((n) => n.date);
  if (datedNodes.length === 0) return { nodes, links: data.links };
  const times = datedNodes.map((n) => new Date(n.date!).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const range = Math.max(1, max - min);
  const xPad = 80;
  const bands: Record<NodeKind, number> = {
    entity: height * 0.2,
    event: height * 0.42,
    doc: height * 0.66,
    claim: height * 0.1,
    defense: height * 0.88,
  };
  for (const n of nodes) {
    if (!n.date) {
      // park untimed nodes off-canvas to the right
      n.fx = width - 30;
      n.fy = bands[n.kind];
      continue;
    }
    const t = (new Date(n.date).getTime() - min) / range;
    n.fx = xPad + t * (width - xPad * 2);
    n.fy = bands[n.kind];
  }
  return { nodes, links: data.links };
}
