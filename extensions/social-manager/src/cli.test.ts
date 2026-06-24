import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerSocialCli } from "./cli.js";
import { canSend, type QueuedPost } from "./post-queue.js";

let dir: string;
let queuePath: string;
let logs: string[];

function makeProgram() {
  logs = [];
  const program = new Command();
  program.exitOverride(); // throw instead of process.exit on errors
  registerSocialCli({
    program,
    queuePath,
    logger: { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(`ERR ${m}`) },
  });
  return program;
}

async function seed(posts: QueuedPost[]) {
  await fs.writeFile(queuePath, JSON.stringify(posts, null, 2));
}
async function readQueue(): Promise<QueuedPost[]> {
  return JSON.parse(await fs.readFile(queuePath, "utf8"));
}
const draft = (id: string): QueuedPost => ({
  id,
  platform: "tiktok",
  caption: "Proof first. Book the weekend.",
  hashtags: [],
  status: "draft",
  createdAt: "2026-06-24T00:00:00Z",
});

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "social-cli-"));
  queuePath = path.join(dir, "queue.json");
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("openclaw social CLI", () => {
  it("lists drafts", async () => {
    await seed([draft("p1"), draft("p2")]);
    await makeProgram().parseAsync(["node", "openclaw", "social", "list"]);
    expect(logs.join("\n")).toContain("p1");
    expect(logs.join("\n")).toContain("p2");
  });

  it("approve sets the human approver and makes the post sendable", async () => {
    await seed([draft("p1")]);
    await makeProgram().parseAsync(["node", "openclaw", "social", "approve", "p1", "--by", "Ramon"]);
    const [post] = await readQueue();
    expect(post.status).toBe("approved");
    expect(post.approvedBy).toBe("Ramon");
    expect(canSend(post).ok).toBe(true); // the gate now opens — only because a human approved
  });

  it("reject marks the draft rejected (cannot send)", async () => {
    await seed([draft("p1")]);
    await makeProgram().parseAsync(["node", "openclaw", "social", "reject", "p1", "--note", "off-brand"]);
    const [post] = await readQueue();
    expect(post.status).toBe("rejected");
    expect(canSend(post).ok).toBe(false);
  });

  it("errors on an unknown id without throwing", async () => {
    await seed([draft("p1")]);
    await makeProgram().parseAsync(["node", "openclaw", "social", "approve", "nope"]);
    expect(logs.join("\n")).toContain("ERR no draft nope");
  });
});
