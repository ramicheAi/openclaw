import { describe, it, expect } from "vitest";
import path from "node:path";

import { buildRenderArgs, remotionBinPath, resolveStudioDir } from "./remotion-render-tool.js";

describe("resolveStudioDir", () => {
  it("prefers explicit config", () => {
    const dir = resolveStudioDir({ studioDir: "/tmp/my-studio" }, {});
    expect(dir).toBe(path.resolve("/tmp/my-studio"));
  });

  it("falls back to REMOTION_STUDIO_DIR", () => {
    const dir = resolveStudioDir({}, { REMOTION_STUDIO_DIR: "/tmp/env-studio" } as NodeJS.ProcessEnv);
    expect(dir).toBe(path.resolve("/tmp/env-studio"));
  });

  it("defaults to the bundled sibling studio dir", () => {
    const dir = resolveStudioDir({}, {});
    expect(dir.endsWith(path.join("extensions", "remotion", "studio"))).toBe(true);
  });
});

describe("remotionBinPath", () => {
  it("points at the studio-local remotion binary", () => {
    expect(remotionBinPath("/x/studio")).toBe(path.join("/x/studio", "node_modules", ".bin", "remotion"));
  });
});

describe("buildRenderArgs", () => {
  it("builds minimal render args", () => {
    expect(buildRenderArgs({ composition: "TitleCard", outPath: "/out/a.mp4" })).toEqual([
      "render",
      "src/index.ts",
      "TitleCard",
      "/out/a.mp4",
    ]);
  });

  it("includes props, codec and scale when provided", () => {
    const args = buildRenderArgs({
      composition: "QuoteReel",
      outPath: "/out/q.mp4",
      propsFile: "/tmp/props.json",
      codec: "h264",
      scale: 2,
    });
    expect(args).toContain("--props=/tmp/props.json");
    expect(args).toContain("--codec=h264");
    expect(args).toContain("--scale=2");
  });

  it("omits scale when zero or negative", () => {
    const args = buildRenderArgs({ composition: "X", outPath: "/o.mp4", scale: 0 });
    expect(args.some((a) => a.startsWith("--scale"))).toBe(false);
  });
});
