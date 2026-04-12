import type { ModelsConfig } from "./types.models.js";
import type { OpenClawConfig } from "./types.openclaw.js";

/** Models / routing slice of {@link OpenClawConfig}. */
export type OpenClawModelsSettings = ModelsConfig;

/** Model catalog, routing, aliases, and provider auth wiring. */
export function getModelsConfig(config: OpenClawConfig): ModelsConfig | undefined {
  return config.models;
}
