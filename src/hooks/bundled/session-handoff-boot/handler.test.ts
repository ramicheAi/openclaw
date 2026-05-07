import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import handler, { extractLatestHandoffBlock, findLatestHandoff } from "./handler.js";
import { createHookEvent } from "../../hooks.js";
import { DEFAULT_MEMORY_FILENAME, type WorkspaceBootstrapFile } from "../../../agents/workspace.js";
import type { OpenClawConfig } from "../../../config/config.js";
import { makeTempWorkspace } from "../../../test-helpers/workspace.js";

/**
 * Set up a temp HOME and the canonical `~/.openclaw/workspace/memory/` layout
 * inside it, so tests of the hook handler (which always reads from the
 * canonical path) operate on an isolated fixture.
 */
async function makeHandoffWorkspace(prefix: string): Promise<{
  home: string;
  memoryDir: string;
}> {
  const home = await makeTempWorkspace(prefix);
  const memoryDir = path.join(home, ".openclaw", "workspace", "memory");
  await fs.mkdir(memoryDir, { recursive: true });
  return { home, memoryDir };
}

const SAMPLE_LOG = `# Daily Log: 2026-05-06

## 14:32 — earlier-session
- TASK: build foo
- STATUS: completed

---

## HANDOFF — 18:45 (pre-compaction)
- TASK: rewrite session-memory handler
- STATUS: in-progress
- FILES: src/hooks/bundled/session-memory/handler.ts
- NEXT: add structured-format tests
- CONTEXT:
  [user] do it
  [assistant] starting now
---

## HANDOFF — 19:10 (pre-compaction)
- TASK: wire session-handoff-boot hook
- STATUS: in-progress
- FILES: src/hooks/bundled/session-handoff-boot/handler.ts
- NEXT: build and verify
---
`;

describe("extractLatestHandoffBlock", () => {
  it("returns the most recent HANDOFF block", () => {
    const block = extractLatestHandoffBlock(SAMPLE_LOG);
    expect(block).not.toBeNull();
    expect(block).toContain("## HANDOFF — 19:10 (pre-compaction)");
    expect(block).toContain("wire session-handoff-boot hook");
    expect(block).not.toContain("18:45");
  });

  it("returns null when no HANDOFF block exists", () => {
    const block = extractLatestHandoffBlock("# Daily Log\n\n## 14:00 — entry\n- TASK: x\n");
    expect(block).toBeNull();
  });
});

describe("findLatestHandoff", () => {
  it("prefers today's log when it has a HANDOFF", async () => {
    const tempDir = await makeTempWorkspace("openclaw-handoff-boot-");
    const memoryDir = path.join(tempDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });

    const now = new Date("2026-05-06T20:00:00Z");
    const todayStr = now.toISOString().split("T")[0]!;
    await fs.writeFile(path.join(memoryDir, `${todayStr}.md`), SAMPLE_LOG, "utf-8");

    const result = await findLatestHandoff({ memoryDir, lookbackDays: 7, now });
    expect(result).not.toBeNull();
    expect(result!.block).toContain("19:10");
    expect(path.basename(result!.sourceFile)).toBe(`${todayStr}.md`);
  });

  it("falls back to the most recent prior log if today is missing", async () => {
    const tempDir = await makeTempWorkspace("openclaw-handoff-boot-");
    const memoryDir = path.join(tempDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });

    const now = new Date("2026-05-06T20:00:00Z");
    await fs.writeFile(path.join(memoryDir, "2026-05-05.md"), SAMPLE_LOG, "utf-8");

    const result = await findLatestHandoff({ memoryDir, lookbackDays: 7, now });
    expect(result).not.toBeNull();
    expect(path.basename(result!.sourceFile)).toBe("2026-05-05.md");
  });

  it("returns null if no logs within lookback window have a HANDOFF", async () => {
    const tempDir = await makeTempWorkspace("openclaw-handoff-boot-");
    const memoryDir = path.join(tempDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });

    const now = new Date("2026-05-06T20:00:00Z");
    // 30 days ago — outside default 7-day lookback
    await fs.writeFile(path.join(memoryDir, "2026-04-06.md"), SAMPLE_LOG, "utf-8");

    const result = await findLatestHandoff({ memoryDir, lookbackDays: 7, now });
    expect(result).toBeNull();
  });
});

describe("session-handoff-boot hook", () => {
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  it("skips non-bootstrap events", async () => {
    const { home } = await makeHandoffWorkspace("openclaw-handoff-boot-");
    process.env.HOME = home;
    const event = createHookEvent("command", "new", "agent:main:main", {
      workspaceDir: home,
    });
    await handler(event);
    // Nothing to assert — just ensure no throw.
  });

  it("injects the latest HANDOFF block into MEMORY.md bootstrap content", async () => {
    const { home, memoryDir } = await makeHandoffWorkspace("openclaw-handoff-boot-");
    process.env.HOME = home;

    const today = new Date().toISOString().split("T")[0]!;
    await fs.writeFile(path.join(memoryDir, `${today}.md`), SAMPLE_LOG, "utf-8");

    const bootstrapFiles: WorkspaceBootstrapFile[] = [
      {
        name: DEFAULT_MEMORY_FILENAME,
        path: path.join(home, DEFAULT_MEMORY_FILENAME),
        content: "# Memory\n\n(no entries)\n",
        missing: false,
      },
    ];

    const cfg: OpenClawConfig = {};
    const event = createHookEvent("agent", "bootstrap", "agent:main:main", {
      // Deliberately point workspaceDir at a *different* dir to confirm the
      // hook ignores it and reads from the canonical $HOME/.openclaw/workspace.
      workspaceDir: await makeTempWorkspace("openclaw-handoff-boot-sandbox-"),
      bootstrapFiles,
      cfg,
    });

    await handler(event);

    const updated = (event.context.bootstrapFiles as WorkspaceBootstrapFile[]).find(
      (f) => f.name === DEFAULT_MEMORY_FILENAME,
    );
    expect(updated).toBeDefined();
    expect(updated!.content).toContain("## Recent HANDOFF");
    expect(updated!.content).toContain("19:10");
    expect(updated!.content).toContain("wire session-handoff-boot hook");
    // Original content preserved below the injection
    expect(updated!.content).toContain("(no entries)");
  });

  it("synthesizes a MEMORY.md entry if none was loaded", async () => {
    const { home, memoryDir } = await makeHandoffWorkspace("openclaw-handoff-boot-");
    process.env.HOME = home;

    const today = new Date().toISOString().split("T")[0]!;
    await fs.writeFile(path.join(memoryDir, `${today}.md`), SAMPLE_LOG, "utf-8");

    const bootstrapFiles: WorkspaceBootstrapFile[] = [];
    const event = createHookEvent("agent", "bootstrap", "agent:main:main", {
      workspaceDir: home,
      bootstrapFiles,
      cfg: {},
    });

    await handler(event);

    const updated = (event.context.bootstrapFiles as WorkspaceBootstrapFile[]).find(
      (f) => f.name === DEFAULT_MEMORY_FILENAME,
    );
    expect(updated).toBeDefined();
    expect(updated!.content).toContain("## Recent HANDOFF");
  });

  it("is a no-op when no HANDOFF block exists", async () => {
    const { home, memoryDir } = await makeHandoffWorkspace("openclaw-handoff-boot-");
    process.env.HOME = home;

    const today = new Date().toISOString().split("T")[0]!;
    await fs.writeFile(
      path.join(memoryDir, `${today}.md`),
      "# Daily Log\n\n## 12:00 — boring\n- nothing\n",
      "utf-8",
    );

    const bootstrapFiles: WorkspaceBootstrapFile[] = [
      {
        name: DEFAULT_MEMORY_FILENAME,
        path: path.join(home, DEFAULT_MEMORY_FILENAME),
        content: "ORIGINAL",
        missing: false,
      },
    ];
    const event = createHookEvent("agent", "bootstrap", "agent:main:main", {
      workspaceDir: home,
      bootstrapFiles,
      cfg: {},
    });

    await handler(event);

    const updated = (event.context.bootstrapFiles as WorkspaceBootstrapFile[]).find(
      (f) => f.name === DEFAULT_MEMORY_FILENAME,
    );
    expect(updated!.content).toBe("ORIGINAL");
  });

  it("respects enabled=false config", async () => {
    const { home, memoryDir } = await makeHandoffWorkspace("openclaw-handoff-boot-");
    process.env.HOME = home;
    const today = new Date().toISOString().split("T")[0]!;
    await fs.writeFile(path.join(memoryDir, `${today}.md`), SAMPLE_LOG, "utf-8");

    const bootstrapFiles: WorkspaceBootstrapFile[] = [
      {
        name: DEFAULT_MEMORY_FILENAME,
        path: path.join(home, DEFAULT_MEMORY_FILENAME),
        content: "ORIGINAL",
        missing: false,
      },
    ];

    const cfg: OpenClawConfig = {
      hooks: {
        internal: {
          entries: {
            "session-handoff-boot": { enabled: false },
          },
        },
      },
    };

    const event = createHookEvent("agent", "bootstrap", "agent:main:main", {
      workspaceDir: home,
      bootstrapFiles,
      cfg,
    });
    await handler(event);

    const updated = (event.context.bootstrapFiles as WorkspaceBootstrapFile[]).find(
      (f) => f.name === DEFAULT_MEMORY_FILENAME,
    );
    expect(updated!.content).toBe("ORIGINAL");
  });
});
