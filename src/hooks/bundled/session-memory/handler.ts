/**
 * Session memory hook handler
 *
 * On `/new`, writes a per-session memory file with a structured
 * 5-line summary (SLUG + TASK/STATUS/FILE/NEXT/KEY) instead of the
 * full conversation blob. The compact format keeps `memory/` scannable
 * and makes session boot able to extract context cheaply.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveAgentWorkspaceDir } from "../../../agents/agent-scope.js";
import type { OpenClawConfig } from "../../../config/config.js";
import { resolveAgentIdFromSessionKey } from "../../../routing/session-key.js";
import { resolveHookConfig } from "../../config.js";
import type { HookHandler } from "../../hooks.js";
import { generateSessionSummaryViaLLM } from "../../llm-session-summary.js";

async function getRecentSessionContent(
  sessionFilePath: string,
  messageCount: number,
): Promise<string | null> {
  try {
    const content = await fs.readFile(sessionFilePath, "utf-8");
    const lines = content.trim().split("\n");
    const allMessages: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "message" || !entry.message) continue;
        const msg = entry.message;
        const role = msg.role;
        if (role !== "user" && role !== "assistant") continue;
        const text = Array.isArray(msg.content)
          ? msg.content.find((c: { type?: string }) => c?.type === "text")?.text
          : msg.content;
        if (text && !String(text).startsWith("/")) {
          allMessages.push(`${role}: ${text}`);
        }
      } catch {
        // skip invalid JSON lines
      }
    }
    return allMessages.slice(-messageCount).join("\n");
  } catch {
    return null;
  }
}

const saveSessionToMemory: HookHandler = async (event) => {
  if (event.type !== "command" || event.action !== "new") {
    return;
  }

  try {
    const context = event.context || {};
    const cfg = context.cfg as OpenClawConfig | undefined;
    const agentId = resolveAgentIdFromSessionKey(event.sessionKey);
    const workspaceDir = cfg
      ? resolveAgentWorkspaceDir(cfg, agentId)
      : path.join(os.homedir(), ".openclaw", "workspace");
    const memoryDir = path.join(workspaceDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });

    const now = new Date(event.timestamp);
    const dateStr = now.toISOString().split("T")[0]!;

    const sessionEntry = (context.previousSessionEntry || context.sessionEntry || {}) as Record<
      string,
      unknown
    >;
    const sessionFile = (sessionEntry.sessionFile as string) || undefined;
    const sessionId = (sessionEntry.sessionId as string) || "unknown";
    const source = (context.commandSource as string) || "unknown";

    const hookConfig = resolveHookConfig(cfg, "session-memory");
    const messageCount =
      typeof hookConfig?.messages === "number" && hookConfig.messages > 0
        ? hookConfig.messages
        : 15;

    let slug: string | null = null;
    let structuredSummary: string | null = null;

    if (sessionFile && cfg) {
      const sessionContent = await getRecentSessionContent(sessionFile, messageCount);
      if (sessionContent && sessionContent.length >= 50) {
        const result = await generateSessionSummaryViaLLM({ sessionContent, cfg });
        if (result) {
          slug = result.slug;
          structuredSummary = result.summary;
        }
      }
    }

    if (!slug) {
      const hhmm = now.toISOString().split("T")[1]!.split(".")[0]!.replace(/:/g, "");
      slug = hhmm.slice(0, 4);
    }

    const filename = `${dateStr}-${slug}.md`;
    const memoryFilePath = path.join(memoryDir, filename);
    const timeStr = now.toISOString().split("T")[1]!.split(".")[0];

    const lines = [
      `# Session: ${dateStr} ${timeStr} UTC`,
      "",
      `- **Session Key**: ${event.sessionKey}`,
      `- **Session ID**: ${sessionId}`,
      `- **Source**: ${source}`,
      "",
    ];
    if (structuredSummary) {
      lines.push("## Summary", "", structuredSummary, "");
    } else {
      lines.push("## Summary", "", "- (summary unavailable)", "");
    }

    await fs.writeFile(memoryFilePath, lines.join("\n"), "utf-8");
    console.log(
      `[session-memory] Wrote structured summary to ${memoryFilePath.replace(os.homedir(), "~")}`,
    );
  } catch (err) {
    console.error(
      "[session-memory] Failed to save session memory:",
      err instanceof Error ? err.message : String(err),
    );
  }
};

export default saveSessionToMemory;
