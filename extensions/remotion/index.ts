import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { createRemotionRenderTool } from "./src/remotion-render-tool.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(createRemotionRenderTool(api), { optional: true });
}
