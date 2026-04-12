import type { ToolsConfig } from "./types.tools.js";
import type { OpenClawConfig } from "./types.openclaw.js";

/** Tools / policy slice of {@link OpenClawConfig}. */
export type OpenClawToolsSettings = ToolsConfig;

/** Tool allowlists, groups, and execution policy. */
export function getToolsConfig(config: OpenClawConfig): ToolsConfig | undefined {
  return config.tools;
}
