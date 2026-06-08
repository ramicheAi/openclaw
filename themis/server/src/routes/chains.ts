import type { Context, Hono } from "hono";
import { authedActor } from "./auth.js";
import type { DB } from "../db.js";
import {
  audit,
  createCausalChain,
  deleteCausalChain,
  listCausalChains,
  matterExists,
  updateCausalChain,
} from "../repo.js";
import type { CausalChainNode } from "../types.js";

function actor(c: Context): string {
  return authedActor(c);
}

function isNodeArray(v: unknown): v is CausalChainNode[] {
  return (
    Array.isArray(v) &&
    v.every(
      (n) =>
        n !== null &&
        typeof n === "object" &&
        typeof (n as CausalChainNode).id === "string" &&
        ["event", "doc", "entity"].includes((n as CausalChainNode).kind),
    )
  );
}

export function registerChainRoutes(app: Hono, db: DB) {
  app.get("/api/matters/:id/chains", (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    return c.json({ chains: listCausalChains(db, id) });
  });

  app.post("/api/matters/:id/chains", async (c) => {
    const id = c.req.param("id");
    if (!matterExists(db, id)) return c.json({ error: "matter_not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; nodes?: unknown };
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return c.json({ error: "invalid_name" }, 400);
    }
    if (!isNodeArray(body.nodes)) return c.json({ error: "invalid_nodes" }, 400);
    const chain = createCausalChain(db, id, body.name.trim(), body.nodes, actor(c));
    audit(db, id, actor(c), "chain.create", `${chain.name} (${chain.nodes.length} nodes)`);
    return c.json(chain);
  });

  app.patch("/api/matters/:id/chains/:chainId", async (c) => {
    const matterId = c.req.param("id");
    const chainId = c.req.param("chainId");
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; nodes?: unknown };
    const patch: { name?: string; nodes?: CausalChainNode[] } = {};
    if (typeof body.name === "string" && body.name.trim().length > 0) patch.name = body.name.trim();
    if (body.nodes !== undefined) {
      if (!isNodeArray(body.nodes)) return c.json({ error: "invalid_nodes" }, 400);
      patch.nodes = body.nodes;
    }
    if (Object.keys(patch).length === 0) return c.json({ error: "invalid_patch" }, 400);
    const updated = updateCausalChain(db, matterId, chainId, patch);
    if (!updated) return c.json({ error: "chain_not_found" }, 404);
    audit(db, matterId, actor(c), "chain.update", `${updated.name} (${updated.nodes.length} nodes)`);
    return c.json(updated);
  });

  app.delete("/api/matters/:id/chains/:chainId", (c) => {
    const matterId = c.req.param("id");
    const chainId = c.req.param("chainId");
    if (!deleteCausalChain(db, matterId, chainId)) return c.json({ error: "chain_not_found" }, 404);
    audit(db, matterId, actor(c), "chain.delete", chainId);
    return c.json({ ok: true });
  });
}
