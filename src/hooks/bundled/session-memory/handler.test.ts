import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import handler from "./handler.js";
import { createHookEvent } from "../../hooks.js";
import type { OpenClawConfig } from "../../../config/config.js";
import { makeTempWorkspace, writeWorkspaceFile } from "../../../test-helpers/workspace.js";

/**
 * Create a mock session JSONL file with various entry types
 */
function createMockSessionContent(
  entries: Array<{ role: string; content: string } | { type: string }>,
): string {
  return entries
    .map((entry) => {
      if ("role" in entry) {
        return JSON.stringify({
          type: "message",
          message: {
            role: entry.role,
            content: entry.content,
          },
        });
      }
      return JSON.stringify(entry);
    })
    .join("\n");
}

describe("session-memory hook", () => {
  it("skips non-command events", async () => {
    const tempDir = await makeTempWorkspace("openclaw-session-memory-");

    const event = createHookEvent("agent", "bootstrap", "agent:main:main", {
      workspaceDir: tempDir,
    });

    await handler(event);

    const memoryDir = path.join(tempDir, "memory");
    await expect(fs.access(memoryDir)).rejects.toThrow();
  });

  it("skips commands other than new", async () => {
    const tempDir = await makeTempWorkspace("openclaw-session-memory-");

    const event = createHookEvent("command", "help", "agent:main:main", {
      workspaceDir: tempDir,
    });

    await handler(event);

    const memoryDir = path.join(tempDir, "memory");
    await expect(fs.access(memoryDir)).rejects.toThrow();
  });

  it("writes a structured per-session memory file on /new (no raw conversation blob)", async () => {
    const tempDir = await makeTempWorkspace("openclaw-session-memory-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const sessionContent = createMockSessionContent([
      { role: "user", content: "Hello there" },
      { role: "assistant", content: "Hi! How can I help?" },
      { role: "user", content: "What is 2+2?" },
      { role: "assistant", content: "2+2 equals 4" },
    ]);
    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "test-session.jsonl",
      content: sessionContent,
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "test-123",
        sessionFile,
      },
    });

    await handler(event);

    const memoryDir = path.join(tempDir, "memory");
    const files = await fs.readdir(memoryDir);
    expect(files.length).toBe(1);

    const memoryContent = await fs.readFile(path.join(memoryDir, files[0]!), "utf-8");

    // Metadata header is present
    expect(memoryContent).toMatch(/# Session:/);
    expect(memoryContent).toContain("Session ID");
    expect(memoryContent).toContain("test-123");

    // The verbose conversation blob is NOT written (the whole point of the rewrite)
    expect(memoryContent).not.toContain("user: Hello there");
    expect(memoryContent).not.toContain("assistant: 2+2 equals 4");

    // Either a structured summary or the unavailable sentinel — not raw conversation
    expect(memoryContent).toMatch(/## Summary/);
  });

  it("handles empty session files gracefully", async () => {
    const tempDir = await makeTempWorkspace("openclaw-session-memory-");
    const sessionsDir = path.join(tempDir, "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const sessionFile = await writeWorkspaceFile({
      dir: sessionsDir,
      name: "test-session.jsonl",
      content: "",
    });

    const cfg: OpenClawConfig = {
      agents: { defaults: { workspace: tempDir } },
    };

    const event = createHookEvent("command", "new", "agent:main:main", {
      cfg,
      previousSessionEntry: {
        sessionId: "test-123",
        sessionFile,
      },
    });

    await handler(event);

    const memoryDir = path.join(tempDir, "memory");
    const files = await fs.readdir(memoryDir);
    expect(files.length).toBe(1);
  });
});
