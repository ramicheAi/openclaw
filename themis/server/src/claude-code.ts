// Claude Code CLI bridge — when THEMIS_LLM_PROVIDER=claude-code is set,
// route prompts through the local `claude` CLI instead of the Anthropic
// SDK so the operator's Max-plan billing powers the call.
//
// Invocation: `claude -p "<prompt>" --output-format text` (or stream-json).
// The `-p` flag takes the prompt as a POSITIONAL argument (not stdin).
// argv supports up to ~128KB on macOS so our ~80KB analyze prompts fit;
// for larger inputs the SDK path is still the right answer.
//
// On exit-non-zero we surface both stdout and stderr (last 500 chars
// each) so the operator can diagnose what the CLI actually said. ENOENT
// gives a clear install-and-login hint.

import { spawn } from "node:child_process";

export function isClaudeCodeProvider(): boolean {
  return (process.env.THEMIS_LLM_PROVIDER ?? "").toLowerCase() === "claude-code";
}

export interface CCResult {
  text: string;
  ms: number;
}

const MAX_TIMEOUT_MS = 5 * 60_000;

export async function callClaudeCode(systemPrompt: string, userPrompt: string): Promise<CCResult> {
  const started = Date.now();
  // We can't pass a separate system prompt across CLI versions reliably,
  // so we prepend it as instructions and let the model treat the whole
  // thing as the user message.
  const fullPrompt = `${systemPrompt}\n\n----\n\n${userPrompt}`;

  // Sanity check: argv limit varies by OS but ~128KB is the common floor.
  if (Buffer.byteLength(fullPrompt, "utf8") > 110_000) {
    throw new Error(
      `prompt too large for CLI invocation (${Buffer.byteLength(fullPrompt, "utf8")} bytes). Unset THEMIS_LLM_PROVIDER to use the SDK for this matter.`,
    );
  }

  // `--output-format text` is the default and most stable across versions;
  // we strip any markdown fences in the analyzer's JSON extractor anyway.
  const args = ["-p", fullPrompt];

  return new Promise<CCResult>((resolve, reject) => {
    let child;
    try {
      child = spawn("claude", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
    } catch (err) {
      return reject(
        new Error(
          err instanceof Error && err.message.includes("ENOENT")
            ? `'claude' CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code, then \`claude login\`.`
            : err instanceof Error
              ? err.message
              : String(err),
        ),
      );
    }

    let stdout = "";
    let stderr = "";

    const killTimer = setTimeout(() => {
      child.kill("SIGTERM");
    }, MAX_TIMEOUT_MS);

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
        const errPreview = [
          stderr.trim() ? `stderr: ${stderr.trim().slice(-500)}` : "stderr: (empty)",
          stdout.trim() ? `stdout: ${stdout.trim().slice(-500)}` : "stdout: (empty)",
        ].join(" · ");
        return reject(new Error(`claude CLI exited ${code}. ${errPreview}`));
      }
      const text = stdout.trim();
      if (!text) {
        return reject(
          new Error(
            "claude CLI returned no output. Check that `claude` is signed in (`claude login`) and that your Max plan is active.",
          ),
        );
      }
      resolve({ text, ms: Date.now() - started });
    });
  });
}

/** One-shot health check against the CLI — used by /api/engine/test. */
export async function probeClaudeCode(): Promise<{ ok: boolean; ms?: number; error?: string }> {
  try {
    const r = await callClaudeCode("Reply with exactly the word: ok", "ok");
    return { ok: /\bok\b/i.test(r.text), ms: r.ms };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
