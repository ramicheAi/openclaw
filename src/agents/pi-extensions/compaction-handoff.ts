/**
 * Compaction Handoff Extension
 *
 * Before compaction wipes context, writes a structured HANDOFF block
 * to memory/YYYY-MM-DD.md so the next session can recover exactly
 * where we left off.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/** Extract text content from a message */
function extractMessageText(msg: AgentMessage): string | null {
  if (!msg || typeof msg !== "object") return null;
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
        const text = (block as { text?: string }).text;
        if (text) return text;
      }
    }
  }
  return null;
}

/** Extract the last meaningful exchange from messages */
function extractLastExchange(messages: AgentMessage[], maxMessages = 6): string[] {
  const lines: string[] = [];
  const recent = messages.slice(-maxMessages);

  for (const msg of recent) {
    const role = (msg as { role?: string }).role;
    if (role !== "user" && role !== "assistant") continue;
    const text = extractMessageText(msg);
    if (!text || text.startsWith("/")) continue;
    // Truncate long messages
    const truncated = text.length > 200 ? text.slice(0, 200) + "..." : text;
    lines.push(`[${role}] ${truncated}`);
  }

  return lines;
}

/** Infer task/status/next from recent messages */
function inferHandoff(messages: AgentMessage[]): {
  task: string;
  status: string;
  files: string[];
  next: string;
} {
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => (m as { role?: string }).role === "assistant");
  const lastUser = [...messages].reverse().find((m) => (m as { role?: string }).role === "user");

  const assistantText = lastAssistant ? (extractMessageText(lastAssistant) ?? "") : "";
  const userText = lastUser ? (extractMessageText(lastUser) ?? "") : "";

  // Extract file paths mentioned (simple heuristic)
  const filePattern = /(?:\/[\w.-]+)+(?:\.[\w]+)/g;
  const allText = assistantText + " " + userText;
  const files = [...new Set(allText.match(filePattern) ?? [])].slice(0, 3);

  // Infer task from user's last request
  const task = userText.length > 100 ? userText.slice(0, 100) + "..." : userText || "unknown";

  // Infer status — if assistant replied with actionable content, likely in-progress
  const status =
    assistantText.includes("done") || assistantText.includes("completed")
      ? "completed"
      : "in-progress";

  // Infer next step from assistant's last message
  const nextMatch = assistantText.match(/(?:next|todo|will|need to)[:\s]+([^\n.]+)/i);
  const next = nextMatch ? nextMatch[1]!.trim() : "resume from last context";

  return { task, status, files, next };
}

export default function compactionHandoffExtension(api: ExtensionAPI): void {
  console.log("[compaction-handoff] Extension registered, listening for session_before_compact");
  api.on("session_before_compact", async (event, ctx) => {
    console.log("[compaction-handoff] EVENT FIRED — session_before_compact received");
    const fsSync = await import("node:fs");
    const debugLog = (msg: string) => {
      try {
        fsSync.default.mkdirSync("/tmp/openclaw", { recursive: true });
        fsSync.default.appendFileSync(
          "/tmp/openclaw/compaction-handoff-debug.log",
          `[${new Date().toISOString()}] ${msg}\n`,
        );
      } catch {
        /* ignore */
      }
    };
    debugLog(`session_before_compact fired. cwd=${ctx.cwd}`);
    debugLog(`event keys: ${Object.keys(event || {}).join(", ")}`);
    debugLog(
      `event.preparation keys: ${Object.keys((event as unknown as Record<string, unknown>)?.preparation || {}).join(", ")}`,
    );
    const msgs = (event as unknown as Record<string, unknown>)?.preparation
      ? ((event as unknown as Record<string, Record<string, unknown>>).preparation
          .messagesToSummarize as unknown[])
      : undefined;
    debugLog(
      `messagesToSummarize: type=${typeof msgs}, isArray=${Array.isArray(msgs)}, length=${Array.isArray(msgs) ? msgs.length : "N/A"}`,
    );
    try {
      const cwd = ctx.cwd;
      if (!cwd) {
        debugLog("No cwd available, skipping");
        return;
      }

      // Each agent writes to its OWN <cwd>/memory/. Don't redirect temp-dir
      // agents into the main workspace — that pollutes the user's daily log
      // with HANDOFF blocks from short-lived helper agents (slug generator,
      // session-summary helper, etc.) that have no real continuity to preserve.
      const memoryDir = path.join(cwd, "memory");

      debugLog(`memoryDir resolved to: ${memoryDir}`);

      // Get current date in ET
      const now = new Date();
      const dateStr = now
        .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
        .replace(/\//g, "-");
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/New_York",
      });

      const dailyLogPath = path.join(memoryDir, `${dateStr}.md`);
      debugLog(`dailyLogPath: ${dailyLogPath}`);

      // Extract handoff data from messages being compacted.
      // Pi may stash messages in any of three places:
      //   - preparation.messagesToSummarize (typical case)
      //   - preparation.turnPrefixMessages (split-turn compactions)
      //   - event.branchEntries (some Pi versions; entries may wrap messages)
      // Read all three and merge.
      const prep = (event as unknown as Record<string, Record<string, unknown>>)?.preparation;
      const summarize = (prep?.messagesToSummarize as AgentMessage[] | undefined) ?? [];
      const turnPrefix = (prep?.turnPrefixMessages as AgentMessage[] | undefined) ?? [];
      const tokensBefore = prep?.tokensBefore;
      const isSplitTurn = prep?.isSplitTurn;

      // branchEntries shape: array of {entry, message?, ...}; unwrap to messages
      const branchEntriesRaw = (event as unknown as Record<string, unknown>)?.branchEntries;
      const branchEntries = Array.isArray(branchEntriesRaw) ? branchEntriesRaw : [];
      const fromBranch: AgentMessage[] = [];
      for (const e of branchEntries) {
        if (!e || typeof e !== "object") continue;
        const candidate = (e as { message?: unknown }).message ?? e;
        if (candidate && typeof candidate === "object") {
          fromBranch.push(candidate as AgentMessage);
        }
      }
      debugLog(
        `tokensBefore=${tokensBefore} isSplitTurn=${isSplitTurn} ` +
          `summarize=${summarize.length} turnPrefix=${turnPrefix.length} ` +
          `branchEntries=${branchEntries.length} (unwrapped=${fromBranch.length})`,
      );

      const messages: AgentMessage[] = [...summarize, ...turnPrefix];
      // Only fall back to branchEntries if the primary sources are empty.
      if (messages.length === 0 && fromBranch.length > 0) {
        messages.push(...fromBranch);
        debugLog(`Falling back to branchEntries → ${messages.length} messages`);
      }
      if (messages.length === 0) {
        debugLog("No messages in summarize, turnPrefix, OR branchEntries — early exit");
        return;
      }

      // Quality threshold — heartbeat/poll sessions fire session_before_compact
      // constantly with near-empty conversations. Writing HANDOFF blocks for
      // those bloats the daily log with hundreds of duplicates and dilutes the
      // real handoffs that session-handoff-boot needs to surface. Require at
      // least a few meaningful turns of conversation before persisting.
      const QUALITY_MIN_TURNS = 3;
      const QUALITY_MIN_CHARS = 300;
      const meaningful = messages.filter((m) => {
        const role = (m as { role?: string }).role;
        if (role !== "user" && role !== "assistant") return false;
        const text = extractMessageText(m);
        return !!text && text.trim().length > 20;
      });
      const totalChars = meaningful
        .map((m) => extractMessageText(m) ?? "")
        .reduce((a, b) => a + b.length, 0);
      debugLog(`quality: meaningful=${meaningful.length} totalChars=${totalChars}`);
      if (meaningful.length < QUALITY_MIN_TURNS || totalChars < QUALITY_MIN_CHARS) {
        debugLog(
          `Skipping HANDOFF — below quality threshold (need ≥${QUALITY_MIN_TURNS} turns and ≥${QUALITY_MIN_CHARS} chars)`,
        );
        return;
      }

      // Rate limit — Pi fires session_before_compact in rapid bursts (often
      // multiple times within the same second under sustained load). Without
      // this guard each firing appends a near-identical HANDOFF block. Cap to
      // at most one HANDOFF per minute by comparing the most recent
      // `## HANDOFF — HH:MM` timestamp in the file with the current minute.
      try {
        const existing = await fs.readFile(dailyLogPath, "utf-8");
        const all = [...existing.matchAll(/^## HANDOFF — (\d{2}):(\d{2}) /gm)];
        if (all.length > 0) {
          const last = all[all.length - 1]!;
          const lastStamp = `${last[1]}:${last[2]}`;
          if (lastStamp === timeStr) {
            debugLog(`Rate limit — last HANDOFF was at ${lastStamp} (same minute), skipping`);
            return;
          }
        }
      } catch {
        // file doesn't exist yet — no rate limit applies
      }

      const handoff = inferHandoff(messages);
      const exchange = extractLastExchange(messages);

      // Build HANDOFF block
      const lines: string[] = [
        "",
        `## HANDOFF — ${timeStr} (pre-compaction)`,
        `- TASK: ${handoff.task}`,
        `- STATUS: ${handoff.status}`,
      ];
      if (handoff.files.length > 0) {
        lines.push(`- FILES: ${handoff.files.join(", ")}`);
      }
      lines.push(`- NEXT: ${handoff.next}`);
      if (exchange.length > 0) {
        lines.push(`- CONTEXT:`);
        for (const line of exchange.slice(-3)) {
          lines.push(`  ${line}`);
        }
      }
      lines.push("---", "");

      const block = lines.join("\n");

      // Ensure memory dir exists
      await fs.mkdir(memoryDir, { recursive: true });

      // Check if daily log exists
      try {
        await fs.access(dailyLogPath);
      } catch {
        // Create with header
        await fs.writeFile(dailyLogPath, `# Daily Log: ${dateStr}\n`, "utf-8");
      }

      // Append HANDOFF block
      await fs.appendFile(dailyLogPath, block, "utf-8");
      debugLog(`SUCCESS — Wrote HANDOFF to ${dailyLogPath}`);
      console.log(`[compaction-handoff] Wrote HANDOFF to ${dailyLogPath}`);

      // Self-rotate — keep only the last MAX_HANDOFFS in the daily log so
      // long sessions (which can rack up hundreds of legitimate HANDOFFs)
      // don't bloat the file or slow down session-handoff-boot's read.
      const MAX_HANDOFFS = 20;
      try {
        const current = await fs.readFile(dailyLogPath, "utf-8");
        const fileLines = current.split("\n");
        const blockStarts: number[] = [];
        for (let i = 0; i < fileLines.length; i++) {
          if (fileLines[i]!.startsWith("## HANDOFF —")) blockStarts.push(i);
        }
        if (blockStarts.length > MAX_HANDOFFS) {
          const dropCount = blockStarts.length - MAX_HANDOFFS;
          const keepFromIdx = blockStarts[dropCount]!;
          // Find each block's end (next "## " or "---") so we strip whole blocks.
          const dropRanges: Array<[number, number]> = [];
          for (let b = 0; b < dropCount; b++) {
            const start = blockStarts[b]!;
            let end = fileLines.length;
            for (let j = start + 1; j < fileLines.length; j++) {
              const ln = fileLines[j]!;
              if (ln.startsWith("## ") || ln.trim() === "---") {
                end = j + 1;
                break;
              }
            }
            dropRanges.push([start, Math.min(end, keepFromIdx)]);
          }
          const drop = new Set<number>();
          for (const [s, e] of dropRanges) {
            for (let i = s; i < e; i++) drop.add(i);
          }
          const kept = fileLines.filter((_, i) => !drop.has(i));
          await fs.writeFile(dailyLogPath, kept.join("\n"), "utf-8");
          debugLog(
            `Self-rotate — stripped ${dropCount} oldest HANDOFF block(s); kept last ${MAX_HANDOFFS}`,
          );
        }
      } catch (rotateErr) {
        // Non-fatal — leaving the file as-is is safer than crashing compaction
        debugLog(
          `Self-rotate failed (non-fatal): ${
            rotateErr instanceof Error ? rotateErr.message : String(rotateErr)
          }`,
        );
      }
    } catch (err) {
      // Non-fatal — don't block compaction
      const errMsg = err instanceof Error ? err.message : String(err);
      debugLog(`FAILED to write handoff: ${errMsg}`);
      console.warn(`[compaction-handoff] Failed to write handoff: ${errMsg}`);
    }

    // Don't return a compaction result — let compaction-safeguard handle that
    return undefined;
  });
}
