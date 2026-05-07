import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import compactionHandoffExtension from "./compaction-handoff.js";

type CapturedHandler = (event: any, ctx: any) => Promise<unknown>;

function createStubApi() {
  const handlers: Record<string, CapturedHandler> = {};
  const api = {
    on(eventName: string, handler: CapturedHandler) {
      handlers[eventName] = handler;
    },
  } as any;
  return { api, handlers };
}

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

beforeAll(async () => {
  // The handler unconditionally appends to /tmp/openclaw/compaction-handoff-debug.log.
  // Make sure the directory exists so the test does not surface a misleading
  // ENOENT during the unrelated debug write.
  await fs.mkdir("/tmp/openclaw", { recursive: true });
});

describe("compactionHandoffExtension", () => {
  it("registers a session_before_compact handler", () => {
    const { api, handlers } = createStubApi();
    compactionHandoffExtension(api);
    expect(typeof handlers.session_before_compact).toBe("function");
  });

  it("writes a structured HANDOFF block to today's daily log when fired", async () => {
    const { api, handlers } = createStubApi();
    compactionHandoffExtension(api);
    const handler = handlers.session_before_compact!;
    expect(handler).toBeDefined();

    const cwd = await makeTempDir("openclaw-compaction-handoff-");

    const event = {
      preparation: {
        messagesToSummarize: [
          { role: "user", content: "Please refactor src/foo/bar.ts to use the new API." },
          {
            role: "assistant",
            content:
              "Done. Touched src/foo/bar.ts and added tests. Next: wire the new export into src/index.ts.",
          },
        ],
      },
      customInstructions: undefined,
    };

    const result = await handler(event, { cwd });

    // Handler returns undefined — it lets compaction-safeguard own the actual summary
    expect(result).toBeUndefined();

    const memoryDir = path.join(cwd, "memory");
    const entries = await fs.readdir(memoryDir);
    expect(entries.length).toBe(1);

    const dailyLog = await fs.readFile(path.join(memoryDir, entries[0]!), "utf-8");
    expect(dailyLog).toMatch(/^# Daily Log: \d{4}-\d{2}-\d{2}/);
    expect(dailyLog).toMatch(/## HANDOFF — \d{2}:\d{2} \(pre-compaction\)/);
    expect(dailyLog).toMatch(/- TASK: /);
    expect(dailyLog).toMatch(/- STATUS: /);
    expect(dailyLog).toMatch(/- NEXT: /);
    // The captured next-step heuristic should pick up "next:" from assistant text
    expect(dailyLog).toContain("wire the new export into src/index.ts");
  });

  it("is a no-op when there are no messages to summarize", async () => {
    const { api, handlers } = createStubApi();
    compactionHandoffExtension(api);
    const handler = handlers.session_before_compact!;

    const cwd = await makeTempDir("openclaw-compaction-handoff-");
    await handler({ preparation: { messagesToSummarize: [] } }, { cwd });

    // No memory dir should be created — handler bails before writes
    await expect(fs.access(path.join(cwd, "memory"))).rejects.toThrow();
  });

  it("does not throw when ctx.cwd is missing", async () => {
    const { api, handlers } = createStubApi();
    compactionHandoffExtension(api);
    const handler = handlers.session_before_compact!;

    await expect(
      handler(
        {
          preparation: {
            messagesToSummarize: [{ role: "user", content: "x" }],
          },
        },
        {},
      ),
    ).resolves.toBeUndefined();
  });
});
