// On-disk locations for the knowledge base.
//
// Each collection is a single SQLite file at `<stateDir>/knowledge/<collection>.sqlite`.
// The state-dir resolver below is a local mirror of core `resolveStateDir`
// (src/config/paths.ts) so this plugin stays self-contained when published
// outside the monorepo — see mcp-client/src/manifest.ts for the same pattern.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Local mirror of core `resolveStateDir`. Keep in sync with core: honor
 * OPENCLAW_STATE_DIR / CLAWDBOT_STATE_DIR, else ~/.openclaw, else a pre-existing
 * legacy dir.
 */
export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = (env.OPENCLAW_STATE_DIR || env.CLAWDBOT_STATE_DIR || "").trim();
  if (override) {
    const expanded = override.startsWith("~")
      ? override.replace(/^~(?=$|[\\/])/, os.homedir())
      : override;
    return path.resolve(expanded);
  }
  const current = path.join(os.homedir(), ".openclaw");
  if (safeExists(current)) return current;
  for (const legacy of [".clawdbot", ".moltbot", ".moldbot"]) {
    const dir = path.join(os.homedir(), legacy);
    if (safeExists(dir)) return dir;
  }
  return current;
}

function safeExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** Directory holding all per-collection SQLite databases. */
export function knowledgeDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "knowledge");
}

/** Absolute path to a collection's SQLite database (caller ensures dir exists). */
export function dbPath(collection: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(knowledgeDir(env), `${collection}.sqlite`);
}
