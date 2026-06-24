import { describe, expect, it, vi } from "vitest";

import { collectText, createModelCaller, type EmbeddedRunner, parseModelKey } from "./model-caller.js";

describe("parseModelKey", () => {
  it("splits provider/model on the first slash", () => {
    expect(parseModelKey("claude-max/claude-opus-4-8")).toEqual({ provider: "claude-max", model: "claude-opus-4-8" });
    expect(parseModelKey("lmstudio/google/gemma-4-e4b")).toEqual({ provider: "lmstudio", model: "google/gemma-4-e4b" });
  });
  it("handles a bare model id", () => {
    expect(parseModelKey("claude-opus-4-8")).toEqual({ provider: "", model: "claude-opus-4-8" });
  });
});

describe("collectText", () => {
  it("joins non-error text payloads and drops errors", () => {
    expect(collectText([{ text: "a" }, { text: "b" }, { text: "x", isError: true }])).toBe("a\nb");
    expect(collectText(undefined)).toBe("");
  });
});

describe("createModelCaller", () => {
  it("parses the model key and forwards provider/model to the runner, returning its text", async () => {
    const runner: EmbeddedRunner = vi.fn(async (params) => {
      expect(params.provider).toBe("claude-max");
      expect(params.model).toBe("claude-opus-4-8");
      expect(params.disableTools).toBe(true);
      return { payloads: [{ text: "the answer" }] };
    });
    const call = createModelCaller({ runner, config: {}, workspaceDir: "/tmp" });
    const out = await call({ modelKey: "claude-max/claude-opus-4-8", prompt: "hi", role: "draft" });
    expect(out).toBe("the answer");
    expect(runner).toHaveBeenCalledOnce();
  });

  it("rejects a malformed model key before calling the runner", async () => {
    const runner: EmbeddedRunner = vi.fn(async () => ({ payloads: [] }));
    const call = createModelCaller({ runner, config: {}, workspaceDir: "/tmp" });
    await expect(call({ modelKey: "no-slash-here", prompt: "x", role: "draft" })).rejects.toThrow(/bad model key/);
    expect(runner).not.toHaveBeenCalled();
  });
});
