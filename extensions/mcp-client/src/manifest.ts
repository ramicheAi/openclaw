// On-disk cache of each MCP server's discovered tool list.
//
// Why a cache: the plugin loader does NOT await async `register()`, so tools
// must be registered synchronously. We therefore discover tools out-of-band
// (`openclaw mcp sync`) and persist them here; the synchronous tool factory
// reads these manifests at agent-session start. A down server can never block
// boot — it simply contributes no tools until the next successful sync.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { fnv1aShort, sanitizeNameSegment } from "./config.js";

export type McpToolManifestEntry = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpServerManifest = {
  server: string;
  updatedAt: string;
  tools: McpToolManifestEntry[];
};

/**
 * Local mirror of core `resolveStateDir` (src/config/paths.ts) so this plugin
 * stays self-contained when published outside the monorepo. Keep in sync with
 * core: honor OPENCLAW_STATE_DIR / CLAWDBOT_STATE_DIR, else ~/.openclaw, else a
 * pre-existing legacy dir.
 */
export function resolveMcpStateDir(env: NodeJS.ProcessEnv = process.env): string {
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

export function manifestDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveMcpStateDir(env), "mcp-client");
}

export function manifestPath(server: string, env: NodeJS.ProcessEnv = process.env): string {
  // Fall back to a stable hashed segment when sanitization empties the name
  // (e.g. server named "." or ".."), so distinct servers never collide on ".json".
  const safe = sanitizeNameSegment(server) || `srv_${fnv1aShort(server)}`;
  return path.join(manifestDir(env), `${safe}.json`);
}

export function readManifestSync(
  server: string,
  env: NodeJS.ProcessEnv = process.env,
): McpServerManifest | null {
  try {
    const raw = fs.readFileSync(manifestPath(server, env), "utf8");
    const parsed = JSON.parse(raw) as McpServerManifest;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tools)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeManifest(
  manifest: McpServerManifest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const file = manifestPath(manifest.server, env);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, JSON.stringify(manifest, null, 2), "utf8");
  return file;
}

export async function deleteManifest(
  server: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  try {
    await fs.promises.unlink(manifestPath(server, env));
  } catch {
    /* already absent */
  }
}
