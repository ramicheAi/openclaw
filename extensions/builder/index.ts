import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { createDevTool, createDesignTool, resolveCfg } from "./src/builder-tools.js";

export default function register(api: OpenClawPluginApi) {
  // Both tools are optional so a fleet without the proxy running degrades gracefully.
  api.registerTool(createDevTool(api), { optional: true });
  api.registerTool(createDesignTool(api), { optional: true });
  const roots = resolveCfg(api).allowedRoots ?? [];
  const label = roots.length > 0 ? roots.join(", ") : "(UNRESTRICTED — set allowedRoots)";
  api.logger?.info?.(`[builder] registered — tools: dev, design — allowedRoots: ${label}`);
}
