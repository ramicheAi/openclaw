/**
 * Session end log hook handler
 *
 * Appends an LLM-generated session summary to the daily memory log
 * (memory/YYYY-MM-DD.md) when /new command is triggered.
 *
 * Closes the continuity gap: ensures every session's key decisions,
 * actions, and next steps are captured in the daily log automatically.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { OpenClawConfig } from "../../../config/config.js";
import { resolveAgentWorkspaceDir } from "../../../agents/agent-scope.js";
import { resolveAgentIdFromSessionKey } from "../../../routing/session-key.js";
import { resolveHookConfig } from "../../config.js";
import type { HookHandler } from "../../hooks.js";

/**
 * Read recent messages from session file
 */
async function getRecentSessionContent(
  sessionFilePath: string,
  messageCount: number = 20,
): Promise<string | null> {
  try {
    const content = await fs.readFile(sessionFilePath, "utf-8");
    const lines = content.trim().split("\n");

    const allMessages: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "message" && entry.message) {
          const msg = entry.message;
          const role = msg.role;
          if ((role === "user" || role === "assistant") && msg.content) {
            const text = Array.isArray(msg.content)
              ? msg.content.find((c: any) => c.type === "text")?.text
              : msg.content;
            if (text && !text.startsWith("/")) {
              allMessages.push(`${role}: ${text}`);
            }
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    return allMessages.slice(-messageCount).join("\n");
  } catch {
    return null;
  }
}

/**
 * Generate a session summary via LLM using the embedded pi agent
 */
async function generateSummaryViaLLM(params: {
  sessionContent: string;
  cfg: OpenClawConfig;
}): Promise<{ slug: string; summary: string } | null> {
  let tempSessionFile: string | null = null;

  try {
    const openclawRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

    // Import dependencies dynamically (same pattern as session-memory)
    const agentScopePath = path.join(openclawRoot, "agents", "agent-scope.js");
    const piEmbeddedPath = path.join(openclawRoot, "agents", "pi-embedded.js");

    const {
      resolveDefaultAgentId,
      resolveAgentWorkspaceDir: resolveWs,
      resolveAgentDir,
    } = await import(agentScopePath);
    const { runEmbeddedPiAgent } = await import(piEmbeddedPath);

    const agentId = resolveDefaultAgentId(params.cfg);
    const workspaceDir = resolveWs(params.cfg, agentId);
    const agentDir = resolveAgentDir(params.cfg, agentId);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-sesslog-"));
    tempSessionFile = path.join(tempDir, "session.jsonl");

    const prompt = `You are a session logger. Given this conversation, produce EXACTLY this format (no extra text):

SLUG: <1-2 word lowercase hyphenated slug>
SUMMARY:
- TASK: <what was being worked on — one line>
- STATUS: <completed | in-progress | blocked>
- FILE: <primary file path touched, or "none">
- NEXT: <exact next step>
- KEY: <one key decision or outcome, if any>

Be specific — include file paths, function names. Max 15 words per line. Focus on actions and outcomes, not greetings.

Conversation:
${params.sessionContent.slice(0, 3000)}`;

    const result = await runEmbeddedPiAgent({
      sessionId: `session-log-${Date.now()}`,
      sessionKey: "temp:session-log",
      sessionFile: tempSessionFile,
      workspaceDir,
      agentDir,
      config: params.cfg,
      prompt,
      timeoutMs: 20_000,
      runId: `sess-log-${Date.now()}`,
    });

    if (result.payloads && result.payloads.length > 0) {
      const text = result.payloads[0]?.text?.trim();
      if (text) {
        // Parse the structured response
        const slugMatch = text.match(/SLUG:\s*(.+)/i);
        const summaryMatch = text.match(/SUMMARY:\s*([\s\S]+)/i);

        const slug = slugMatch
          ? slugMatch[1]!
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "-")
              .replace(/-+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 30)
          : null;

        const summary = summaryMatch ? summaryMatch[1]!.trim() : null;

        if (slug && summary) {
          return { slug, summary };
        }

        // Fallback: treat the whole response as summary
        if (text.includes("-")) {
          return {
            slug: slug || "session",
            summary: text,
          };
        }
      }
    }

    return null;
  } catch (err) {
    console.error("[session-end-log] LLM summary generation failed:", err);
    return null;
  } finally {
    if (tempSessionFile) {
      try {
        await fs.rm(path.dirname(tempSessionFile), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Append session summary to daily memory log when /new command is triggered
 */
const appendSessionToDaily: HookHandler = async (event) => {
  if (event.type !== "command" || event.action !== "new") {
    return;
  }

  try {
    console.log("[session-end-log] Hook triggered for /new command");

    const context = event.context || {};
    const cfg = context.cfg as OpenClawConfig | undefined;
    const agentId = resolveAgentIdFromSessionKey(event.sessionKey);
    const workspaceDir = cfg
      ? resolveAgentWorkspaceDir(cfg, agentId)
      : path.join(os.homedir(), ".openclaw", "workspace");
    const memoryDir = path.join(workspaceDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });

    // Resolve the session file from the ending session
    const sessionEntry = (context.previousSessionEntry || context.sessionEntry || {}) as Record<
      string,
      unknown
    >;
    const sessionFile = (sessionEntry.sessionFile as string) || undefined;

    if (!sessionFile) {
      console.log("[session-end-log] No session file found, skipping");
      return;
    }

    // Read hook config
    const hookConfig = resolveHookConfig(cfg, "session-end-log");
    const messageCount =
      typeof hookConfig?.messages === "number" && hookConfig.messages > 0
        ? hookConfig.messages
        : 20;

    const sessionContent = await getRecentSessionContent(sessionFile, messageCount);
    if (!sessionContent || sessionContent.length < 50) {
      console.log("[session-end-log] Session too short to log, skipping");
      return;
    }

    // Get current time in operator timezone (fallback to UTC)
    const now = new Date(event.timestamp);
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const dailyLogPath = path.join(memoryDir, `${dateStr}.md`);

    // Format time as HH:MM (local-ish via toLocaleTimeString)
    const timeStr = now
      .toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/New_York",
      })
      .replace(":", ":");

    // Generate summary via LLM
    let slug = "session";
    let summaryLines = "- Session ended (summary generation unavailable)";

    if (cfg) {
      const result = await generateSummaryViaLLM({ sessionContent, cfg });
      if (result) {
        slug = result.slug;
        summaryLines = result.summary;
      }
    }

    // Build the entry (structured format for easy parsing on session boot)
    const entry = `\n## ${timeStr} — ${slug}\n${summaryLines}\n---\n`;

    // Check if daily log exists; create with header if not
    let fileExists = false;
    try {
      await fs.access(dailyLogPath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    if (!fileExists) {
      const header = `# Daily Log: ${dateStr}\n`;
      await fs.writeFile(dailyLogPath, header + entry, "utf-8");
    } else {
      await fs.appendFile(dailyLogPath, entry, "utf-8");
    }

    console.log(`[session-end-log] Appended summary to ${dailyLogPath}`);
  } catch (err) {
    console.error(
      "[session-end-log] Failed to append session log:",
      err instanceof Error ? err.message : String(err),
    );
  }
};

export default appendSessionToDaily;
