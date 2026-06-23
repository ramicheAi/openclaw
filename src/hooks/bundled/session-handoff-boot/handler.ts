/**
 * Session handoff boot hook
 *
 * On agent bootstrap, finds the most recent `## HANDOFF` block in
 * `<workspace>/memory/YYYY-MM-DD.md` (the block the `compaction-handoff`
 * Pi extension writes before each compaction) and prepends it as a
 * `## Recent HANDOFF` section into the in-memory MEMORY.md bootstrap
 * file content. This way every fresh session boots with the exact
 * TASK / STATUS / FILES / NEXT from where the previous session was
 * compacted.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DEFAULT_MEMORY_FILENAME, type WorkspaceBootstrapFile } from "../../../agents/workspace.js";
import { resolveHookConfig } from "../../config.js";
import { isAgentBootstrapEvent, type HookHandler } from "../../hooks.js";

const HOOK_KEY = "session-handoff-boot";
const HANDOFF_HEADING_RE = /^## HANDOFF —/m;

export function extractLatestHandoffBlock(dailyLog: string): string | null {
  // Accept both `## HANDOFF — <timestamp>` (current compaction-handoff format)
  // and bare `## HANDOFF` (manual / older format) so handoff blocks written
  // by either path are picked up.
  const lines = dailyLog.split("\n");
  let lastStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (
      line.startsWith("## HANDOFF —") ||
      line === "## HANDOFF" ||
      line.startsWith("## HANDOFF ")
    ) {
      lastStart = i;
      break;
    }
  }
  if (lastStart === -1) return null;

  // End at the next '---' separator or '## ' heading after the HANDOFF block.
  let end = lines.length;
  for (let i = lastStart + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("## ") || line.trim() === "---") {
      end = i;
      break;
    }
  }
  return lines.slice(lastStart, end).join("\n").trim();
}

async function listDailyLogsDescending(memoryDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(memoryDir);
    return entries
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function findLatestHandoff(params: {
  memoryDir: string;
  lookbackDays: number;
  now: Date;
}): Promise<{ block: string; sourceFile: string } | null> {
  const todayStr = params.now.toISOString().split("T")[0]!;
  const todayPath = path.join(params.memoryDir, `${todayStr}.md`);

  // Try today first.
  try {
    const content = await fs.readFile(todayPath, "utf-8");
    const block = extractLatestHandoffBlock(content);
    if (block) return { block, sourceFile: todayPath };
  } catch {
    // fall through to lookback
  }

  // Walk previous logs up to lookbackDays.
  const candidates = await listDailyLogsDescending(params.memoryDir);
  const cutoff = new Date(params.now.getTime() - params.lookbackDays * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().split("T")[0]!;

  for (const filename of candidates) {
    const dateStr = filename.replace(/\.md$/, "");
    if (dateStr === todayStr) continue;
    if (dateStr < cutoffStr) break;
    const filePath = path.join(params.memoryDir, filename);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const block = extractLatestHandoffBlock(content);
      if (block) return { block, sourceFile: filePath };
    } catch {
      // keep searching
    }
  }
  return null;
}

function injectHandoffIntoMemory(
  files: WorkspaceBootstrapFile[],
  handoffBlock: string,
  sourceFile: string,
): WorkspaceBootstrapFile[] {
  const header = `## Recent HANDOFF\n_Source: ${path.basename(sourceFile)}_\n`;
  const injection = `${header}\n${handoffBlock}\n\n---\n`;

  const idx = files.findIndex((f) => f.name === DEFAULT_MEMORY_FILENAME);
  if (idx >= 0) {
    const existing = files[idx]!;
    const newContent = existing.content ? `${injection}\n${existing.content}` : injection;
    files[idx] = { ...existing, content: newContent, missing: false };
    return files;
  }

  // No MEMORY.md was loaded — synthesize one so the handoff still gets injected.
  files.unshift({
    name: DEFAULT_MEMORY_FILENAME,
    path: "<session-handoff-boot>",
    content: injection,
    missing: false,
  });
  return files;
}

const sessionHandoffBootHook: HookHandler = async (event) => {
  if (!isAgentBootstrapEvent(event)) return;

  const context = event.context;
  const cfg = context.cfg;
  const hookConfig = resolveHookConfig(cfg, HOOK_KEY);
  if (hookConfig?.enabled === false) return;

  const lookbackDays =
    typeof hookConfig?.lookbackDays === "number" && hookConfig.lookbackDays > 0
      ? Math.floor(hookConfig.lookbackDays)
      : 7;

  if (!Array.isArray(context.bootstrapFiles)) return;

  // Always read from the canonical user workspace memory dir. context.workspaceDir
  // can point at a compaction sandbox or worktree on resume, which would miss the
  // HANDOFF block written by the main agent.
  const memoryDir = path.join(os.homedir(), ".openclaw", "workspace", "memory");
  let result: { block: string; sourceFile: string } | null = null;
  try {
    result = await findLatestHandoff({ memoryDir, lookbackDays, now: new Date() });
  } catch (err) {
    console.warn(
      `[session-handoff-boot] failed to read memory dir: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return;
  }
  if (!result) return;
  if (!HANDOFF_HEADING_RE.test(result.block)) return;

  context.bootstrapFiles = injectHandoffIntoMemory(
    context.bootstrapFiles,
    result.block,
    result.sourceFile,
  );
  console.log(
    `[session-handoff-boot] Injected HANDOFF from ${path.basename(result.sourceFile)} into MEMORY.md`,
  );
};

export default sessionHandoffBootHook;
