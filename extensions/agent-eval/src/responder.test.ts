import { describe, expect, it } from "vitest";

import { createCommandResponder } from "./responder.js";

// `cat` reads stdin and writes it to stdout, so the command responder should
// echo the input straight back. Skipped on Windows where `cat` is not standard.
const describeIfPosix = process.platform === "win32" ? describe.skip : describe;

describeIfPosix("createCommandResponder", () => {
  it("pipes the input to stdin and returns stdout (cat echoes it back)", async () => {
    const responder = createCommandResponder("cat");
    const out = await responder("hello from stdin");
    expect(out).toBe("hello from stdin");
  });

  it("returns transformed stdout for a non-trivial command", async () => {
    const responder = createCommandResponder("tr a-z A-Z");
    const out = await responder("shout");
    expect(out.trim()).toBe("SHOUT");
  });

  it("rejects when the command exits non-zero", async () => {
    const responder = createCommandResponder("exit 3");
    await expect(responder("ignored")).rejects.toThrow(/code 3/);
  });

  it("rejects when the command runs past the timeout", async () => {
    const responder = createCommandResponder("sleep 5", { timeoutMs: 50 });
    await expect(responder("x")).rejects.toThrow(/timed out/);
  });

  it("caps captured output at maxOutputBytes", async () => {
    // `yes` emits an unbounded stream; the byte cap must stop and truncate it.
    const responder = createCommandResponder("yes abcdefghij", { maxOutputBytes: 100 });
    const out = await responder("");
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.length).toBeGreaterThan(0);
  });
});
