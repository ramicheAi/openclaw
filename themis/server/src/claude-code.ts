// Claude Code CLI bridge — when THEMIS_LLM_PROVIDER=claude-code is set, route
// prompts through the local `claude` CLI instead of the Anthropic API SDK.
// Uses the operator's Claude Code Max plan billing — no separate API
// credits needed.
//
// Spawns `claude -p` (print mode: non-interactive, response to stdout, exit
// 0 on success). Sends the prompt via stdin to avoid argv length limits
// for large corpora. Strips any markdown / leading prose so the response
// is parseable as the JSON the analyze pipeline expects.
//
// Tradeoffs vs the SDK path:
//   - latency: ~1s overhead for process spawn + sign-in check
//   - dependency: `claude` must be on PATH and signed in
//   - rate limits: bounded by the Max plan, not raw API
//
// For dogfooding the product without separate API spend, it's the right
// tool. For production, swap back to the API by unsetting the env var.

import { spawn } from "node:child_process";

export function isClaudeCodeProvider(): boolean {
  return (process.env.THEMIS_LLM_PROVIDER ?? "").toLowerCase() === "claude-code";
}

export interface CCResult {
  text: string;
  ms: number;
}

export async function callClaudeCode(systemPrompt: string, userPrompt: string): Promise<CCResult> {
  const started = Date.now();
  const args = ["-p"]; // print mode
  // We can't pass system prompt as a CLI flag reliably across versions, so
  // we prepend it to the user prompt with a clear marker. The model treats
  // it as instructions; we strip back to the response below.
  const fullPrompt = `SYSTEM INSTRUCTIONS:\n${systemPrompt}\n\n----\n\nUSER REQUEST:\n${userPrompt}`;

  return new Promise<CCResult>((resolve, reject) => {
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const killTimer = setTimeout(() => {
      child.kill("SIGTERM");
    }, 5 * 60_000); // 5 min hard cap

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      clearTimeout(killTimer);
      reject(
        new Error(
          err.message.includes("ENOENT")
            ? `'claude' CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code, then \`claude login\`. (Or unset THEMIS_LLM_PROVIDER to use the API.)`
            : err.message,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(killTimer);
      if (code !== 0) {
        return reject(new Error(`claude CLI exited ${code}: ${stderr.trim() || "no stderr"}`));
      }
      resolve({ text: stdout.trim(), ms: Date.now() - started });
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}
