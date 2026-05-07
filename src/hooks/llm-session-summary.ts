/**
 * Shared LLM helper that produces a structured 5-line session summary
 * (SLUG + TASK / STATUS / FILE / NEXT / KEY) used by both `session-memory`
 * and `session-end-log` so the two hooks emit the same scannable format.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../agents/agent-scope.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import type { OpenClawConfig } from "../config/config.js";

export type SessionSummary = {
  slug: string;
  summary: string;
};

const SUMMARY_PROMPT = `You are a session logger. Given this conversation, produce EXACTLY this format (no extra text):

SLUG: <1-2 word lowercase hyphenated slug>
SUMMARY:
- TASK: <what was being worked on — one line>
- STATUS: <completed | in-progress | blocked>
- FILE: <primary file path touched, or "none">
- NEXT: <exact next step>
- KEY: <one key decision or outcome, if any>

Be specific — include file paths, function names. Max 15 words per line. Focus on actions and outcomes, not greetings.

Conversation:
`;

function sanitizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

export async function generateSessionSummaryViaLLM(params: {
  sessionContent: string;
  cfg: OpenClawConfig;
  timeoutMs?: number;
}): Promise<SessionSummary | null> {
  let tempSessionFile: string | null = null;

  try {
    const agentId = resolveDefaultAgentId(params.cfg);
    const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
    const agentDir = resolveAgentDir(params.cfg, agentId);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-summary-"));
    tempSessionFile = path.join(tempDir, "session.jsonl");

    const prompt = `${SUMMARY_PROMPT}${params.sessionContent.slice(0, 3000)}`;

    const result = await runEmbeddedPiAgent({
      sessionId: `session-summary-${Date.now()}`,
      sessionKey: "temp:session-summary",
      sessionFile: tempSessionFile,
      workspaceDir,
      agentDir,
      config: params.cfg,
      prompt,
      timeoutMs: params.timeoutMs ?? 20_000,
      runId: `sess-summary-${Date.now()}`,
    });

    const text = result.payloads?.[0]?.text?.trim();
    if (!text) return null;

    const slugMatch = text.match(/SLUG:\s*(.+)/i);
    const summaryMatch = text.match(/SUMMARY:\s*([\s\S]+)/i);

    const slug = slugMatch ? sanitizeSlug(slugMatch[1]!) : null;
    const summary = summaryMatch ? summaryMatch[1]!.trim() : null;

    if (slug && summary) return { slug, summary };
    if (text.includes("-")) return { slug: slug ?? "session", summary: text };
    return null;
  } catch (err) {
    console.error("[llm-session-summary] Failed to generate summary:", err);
    return null;
  } finally {
    if (tempSessionFile) {
      try {
        await fs.rm(path.dirname(tempSessionFile), { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}
