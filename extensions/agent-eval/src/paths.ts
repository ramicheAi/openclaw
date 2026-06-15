// On-disk location for evaluation run reports.
//
// The harness writes one JSON report per `eval run` so quality can be tracked
// over time and regressions caught. Reports live under the OpenClaw state dir so
// they sit alongside the rest of the runtime's data.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Local mirror of core `resolveStateDir` (src/config/paths.ts) so this plugin
 * stays self-contained when published outside the monorepo. Keep in sync with
 * core: honor OPENCLAW_STATE_DIR / CLAWDBOT_STATE_DIR, else ~/.openclaw, else a
 * pre-existing legacy dir.
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

/** Directory where eval run reports are written: `<stateDir>/agent-eval`. */
export function evalReportDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "agent-eval");
}
