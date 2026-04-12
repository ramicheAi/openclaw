import type { SessionConfig } from "./types.base.js";
import type { OpenClawConfig } from "./types.openclaw.js";

/** Session persistence, compaction, and delivery slice of {@link OpenClawConfig}. */
export type OpenClawSessionSettings = SessionConfig;

/** Session persistence, compaction, and delivery defaults from the active config. */
export function getSessionConfig(config: OpenClawConfig): SessionConfig | undefined {
  return config.session;
}
