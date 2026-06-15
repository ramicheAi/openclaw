// Responders: the system under test.
//
// A `Responder` turns a case input into the output to be scored. The harness is
// deliberately responder-agnostic — anything that maps string→string can be
// evaluated. Two implementations ship: a shell command (great for testing the
// `openclaw` CLI itself or any script) and a direct OpenAI chat model.
//
// Both touch the outside world, so they are injected into the runner; tests pass
// trivial fakes and never spawn or call out.

import { spawn } from "node:child_process";
import path from "node:path";

import OpenAI from "openai";

export type Responder = (input: string) => Promise<string>;

export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
/** Cap captured stdout so a runaway command can't exhaust memory. */
export const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;

export type CommandResponderOptions = {
  timeoutMs?: number;
  maxOutputBytes?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

/**
 * Resolve a shell to run the command with. Mirrors core's shell selection
 * (src/agents/shell-utils.ts) but stays self-contained so the extension carries
 * no `src/` dependency.
 */
function getShellConfig(): { shell: string; args: string[] } {
  if (process.platform === "win32") {
    return { shell: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command"] };
  }
  const envShell = process.env.SHELL?.trim();
  const shellName = envShell ? path.basename(envShell) : "";
  // Fish rejects common POSIX-isms; fall back to sh when it is the login shell.
  if (shellName === "fish") return { shell: "sh", args: ["-c"] };
  const shell = envShell && envShell.length > 0 ? envShell : "sh";
  return { shell, args: ["-c"] };
}

/**
 * Build a `Responder` that runs `command` in a shell, writes the case input to
 * the child's stdin, and resolves with its stdout. Includes a wall-clock timeout
 * (kills the process tree on overrun) and a max-bytes cap on captured output.
 */
export function createCommandResponder(command: string, opts: CommandResponderOptions = {}): Responder {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return (input: string) =>
    new Promise<string>((resolve, reject) => {
      const { shell, args } = getShellConfig();
      const child = spawn(shell, [...args, command], {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const stdoutChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderr = "";
      let settled = false;
      let truncated = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        finish(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* process already gone */
          }
          reject(new Error(`command responder timed out after ${timeoutMs}ms`));
        });
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        if (truncated) return;
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxOutputBytes) {
          truncated = true;
          // Keep just enough to honor the cap, then stop the child.
          const room = maxOutputBytes - (stdoutBytes - chunk.length);
          if (room > 0) stdoutChunks.push(chunk.subarray(0, room));
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          return;
        }
        stdoutChunks.push(chunk);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < 4_000) stderr += chunk.toString("utf8");
      });

      child.on("error", (err) => {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      });

      child.on("close", (code) => {
        finish(() => {
          const out = Buffer.concat(stdoutChunks).toString("utf8");
          if (truncated) {
            resolve(out);
            return;
          }
          if (code === 0 || code === null) {
            resolve(out);
          } else {
            // Non-zero exit: reject so the case is marked errored, surfacing
            // stderr for debugging the command under test.
            reject(new Error(`command exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
          }
        });
      });

      // Feed the case input and close stdin so stdin-reading commands (e.g. cat)
      // see EOF and terminate.
      child.stdin.on("error", () => {
        /* ignore EPIPE when the child exits before consuming stdin */
      });
      child.stdin.end(input);
    });
}

/**
 * Build a `Responder` backed by an OpenAI chat model — the input is sent as a
 * single user message and the assistant's text is returned as the output.
 */
export function createOpenAIResponder(params: { apiKey: string; model: string }): Responder {
  const client = new OpenAI({ apiKey: params.apiKey });
  return async (input: string) => {
    const completion = await client.chat.completions.create({
      model: params.model,
      messages: [{ role: "user", content: input }],
    });
    return completion.choices[0]?.message?.content ?? "";
  };
}
