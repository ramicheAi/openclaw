import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Type } from "@sinclair/typebox";

import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

type PluginCfg = {
  studioDir?: string;
  outputDir?: string;
  timeoutMs?: number;
};

/**
 * Resolve the Remotion studio directory.
 * Order: explicit config -> $REMOTION_STUDIO_DIR -> bundled ../studio.
 * Exported for unit testing.
 */
export function resolveStudioDir(cfg?: PluginCfg, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = cfg?.studioDir?.trim();
  if (explicit) return path.resolve(explicit);
  const fromEnv = env.REMOTION_STUDIO_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  // Source layout: extensions/remotion/src -> ../studio. Built layout keeps the
  // same sibling relationship, so one resolution covers both.
  return path.resolve(HERE, "..", "studio");
}

/** Path to the studio's local Remotion binary. */
export function remotionBinPath(studioDir: string): string {
  return path.join(studioDir, "node_modules", ".bin", "remotion");
}

/**
 * Build the argv for `remotion render`. Exported for unit testing.
 * Entry is relative to the studio dir (we spawn with cwd=studioDir).
 */
export function buildRenderArgs(opts: {
  composition: string;
  outPath: string;
  propsFile?: string;
  codec?: string;
  scale?: number;
}): string[] {
  const args = ["render", "src/index.ts", opts.composition, opts.outPath];
  if (opts.propsFile) args.push(`--props=${opts.propsFile}`);
  if (opts.codec) args.push(`--codec=${opts.codec}`);
  if (typeof opts.scale === "number" && opts.scale > 0) args.push(`--scale=${opts.scale}`);
  return args;
}

export function createRemotionRenderTool(api: OpenClawPluginApi) {
  return {
    name: "remotion-render",
    description:
      "Render a branded video locally from the OpenClaw Remotion studio. Pick a registered composition " +
      "(TitleCard, LowerThird, QuoteReel, CaptionedClip) and pass props as JSON. Returns the output MP4 path. " +
      "Rendering is local (no cloud) and can take tens of seconds.",
    parameters: Type.Object({
      composition: Type.String({
        description: "Composition id registered in the studio (e.g. TitleCard, QuoteReel, CaptionedClip).",
      }),
      props: Type.Optional(
        Type.Unknown({ description: "JSON props object passed to the composition (overrides defaults)." }),
      ),
      out: Type.Optional(
        Type.String({ description: "Output file path. Defaults to <outputDir>/<composition>-<timestamp>.mp4." }),
      ),
      codec: Type.Optional(Type.String({ description: "Codec override (h264, h265, vp8, vp9, prores, gif)." })),
      scale: Type.Optional(Type.Number({ description: "Render scale multiplier (e.g. 2 for 2x)." })),
      timeoutMs: Type.Optional(Type.Number({ description: "Render timeout in ms (default 600000)." })),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const composition = String(params.composition ?? "").trim();
      if (!composition) throw new Error("composition required");

      const cfg = (api.pluginConfig ?? {}) as PluginCfg;
      const studioDir = resolveStudioDir(cfg);

      if (!existsSync(studioDir)) {
        throw new Error(`Remotion studio not found at ${studioDir}. Set studioDir in the plugin config or $REMOTION_STUDIO_DIR.`);
      }
      const bin = remotionBinPath(studioDir);
      if (!existsSync(bin)) {
        throw new Error(
          `Remotion is not installed in the studio (${bin} missing). Run the setup script first:\n` +
            `  skills/remotion/scripts/setup.sh\n` +
            `or: (cd ${studioDir} && npm install)`,
        );
      }

      const outputDir = cfg.outputDir?.trim()
        ? path.resolve(cfg.outputDir.trim())
        : path.join(studioDir, "out");
      await fs.mkdir(outputDir, { recursive: true });

      const outPath = params.out
        ? path.resolve(String(params.out))
        : path.join(outputDir, `${composition}-${Date.now()}.mp4`);

      const timeoutMs =
        (typeof params.timeoutMs === "number" && params.timeoutMs > 0 ? params.timeoutMs : undefined) ??
        (typeof cfg.timeoutMs === "number" && cfg.timeoutMs > 0 ? cfg.timeoutMs : undefined) ??
        600_000;

      // Write props to a temp file (avoids shell-escaping issues with --props inline).
      let tmpDir: string | null = null;
      let propsFile: string | undefined;
      try {
        if (params.props !== undefined && params.props !== null) {
          tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-remotion-"));
          propsFile = path.join(tmpDir, "props.json");
          await fs.writeFile(propsFile, JSON.stringify(params.props), "utf8");
        }

        const args = buildRenderArgs({
          composition,
          outPath,
          propsFile,
          codec: typeof params.codec === "string" ? params.codec : undefined,
          scale: typeof params.scale === "number" ? params.scale : undefined,
        });

        const { code, stderr } = await runRemotion(bin, args, studioDir, timeoutMs);
        if (code !== 0) {
          const tail = stderr.split("\n").slice(-25).join("\n");
          throw new Error(`remotion render exited with code ${code}:\n${tail}`);
        }

        return {
          content: [{ type: "text", text: `Rendered ${composition} -> ${outPath}` }],
          details: { output: outPath, composition, studioDir },
        };
      } finally {
        if (tmpDir) {
          try {
            await fs.rm(tmpDir, { recursive: true, force: true });
          } catch {
            // ignore
          }
        }
      }
    },
  };
}

function runRemotion(
  bin: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: process.env });
    let stderr = "";
    let stdout = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`remotion render timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}
