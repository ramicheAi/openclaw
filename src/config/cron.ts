import type { CronConfig } from "./types.cron.js";
import type { OpenClawConfig } from "./types.openclaw.js";

/** Cron / scheduling slice of {@link OpenClawConfig}. */
export type OpenClawCronSettings = CronConfig;

/** Cron / isolated agent scheduler configuration. */
export function getCronConfig(config: OpenClawConfig): CronConfig | undefined {
  return config.cron;
}
