import type { ChannelsConfig } from "./types.channels.js";
import type { OpenClawConfig } from "./types.openclaw.js";

/** Channel / messaging slice of {@link OpenClawConfig}. */
export type OpenClawChannelsSettings = ChannelsConfig;

/** Channel / messaging surface configuration (WhatsApp, Telegram, Slack, etc.). */
export function getChannelsConfig(config: OpenClawConfig): ChannelsConfig | undefined {
  return config.channels;
}
