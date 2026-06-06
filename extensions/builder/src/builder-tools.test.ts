import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createDevTool, createDesignTool } from "./builder-tools.js";

function fakeApi(pluginConfig: any = {}) {
  return {
    id: "builder",
    name: "builder",
    source: "test",
    config: {},
    pluginConfig,
    runtime: { version: "test" },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    registerTool() {},
  };
}

function mockFetchOnce(content: string, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("builder tools", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("dispatches a dev task and returns the assistant summary", async () => {
    const fetchFn = mockFetchOnce("Bumped version and added tests.\nSUMMARY: edited app.js.");
    const tool = createDevTool(fakeApi() as any);
    const res: any = await tool.execute("id", { task: "bump version", workingDir: "/tmp/proj" });
    expect(res.content[0].text).toContain("SUMMARY");
    expect(res.details.tool).toBe("dev");
    // The prompt must carry the absolute working directory.
    const body = JSON.parse((fetchFn.mock.calls[0] as any)[1].body);
    expect(body.messages[0].content).toContain("/tmp/proj");
    expect(body.model).toBe("claude-sonnet-4-5");
  });

  it("design tool uses designModel when configured", async () => {
    const fetchFn = mockFetchOnce("Built a hero section.");
    const tool = createDesignTool(fakeApi({ designModel: "claude-opus-4-6" }) as any);
    await tool.execute("id", { task: "make a hero", workingDir: "/tmp/site" });
    const body = JSON.parse((fetchFn.mock.calls[0] as any)[1].body);
    expect(body.model).toBe("claude-opus-4-6");
  });

  it("rejects a non-absolute workingDir", async () => {
    mockFetchOnce("unused");
    const tool = createDevTool(fakeApi() as any);
    await expect(tool.execute("id", { task: "x", workingDir: "relative/path" })).rejects.toThrow(/absolute/);
  });

  it("enforces allowedRoots containment", async () => {
    mockFetchOnce("unused");
    const tool = createDevTool(fakeApi({ allowedRoots: ["/Users/admin/safe"] }) as any);
    await expect(
      tool.execute("id", { task: "x", workingDir: "/Users/admin/secret" }),
    ).rejects.toThrow(/allowedRoots/);
    // boundary-safe: /safe-other must not pass as within /safe
    await expect(
      tool.execute("id", { task: "x", workingDir: "/Users/admin/safe-other" }),
    ).rejects.toThrow(/allowedRoots/);
  });

  it("allows a workingDir nested under an allowed root", async () => {
    const fetchFn = mockFetchOnce("done");
    const tool = createDevTool(fakeApi({ allowedRoots: ["/Users/admin/safe"] }) as any);
    const res: any = await tool.execute("id", { task: "x", workingDir: "/Users/admin/safe/app" });
    expect(res.details.workingDir).toBe("/Users/admin/safe/app");
    expect(fetchFn).toHaveBeenCalled();
  });

  it("enforces allowedRoots from api.config entry when pluginConfig is empty (per-pilot context)", async () => {
    mockFetchOnce("unused");
    // pluginConfig empty (as in per-pilot load), but config entry carries the roots.
    const api = {
      ...fakeApi({}),
      config: { plugins: { entries: { builder: { config: { allowedRoots: ["/Users/admin/safe"] } } } } },
    };
    const tool = createDevTool(api as any);
    await expect(tool.execute("id", { task: "x", workingDir: "/Users/admin/secret" })).rejects.toThrow(/allowedRoots/);
  });

  it("requires task and workingDir", async () => {
    mockFetchOnce("unused");
    const tool = createDevTool(fakeApi() as any);
    await expect(tool.execute("id", { workingDir: "/tmp/x" })).rejects.toThrow(/task required/);
    await expect(tool.execute("id", { task: "x" })).rejects.toThrow(/workingDir required/);
  });

  it("surfaces proxy HTTP errors", async () => {
    mockFetchOnce("upstream boom", false, 502);
    const tool = createDevTool(fakeApi() as any);
    await expect(tool.execute("id", { task: "x", workingDir: "/tmp/x" })).rejects.toThrow(/HTTP 502/);
  });
});
