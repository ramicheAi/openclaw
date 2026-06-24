import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { createEgressCheckTool } from "./src/egress-tool.js";
import { createFortifyTool } from "./src/firewall-tool.js";
import { createRunTool } from "./src/run-tool.js";

// CONDUCTOR — the fleet's multi-model orchestration brain.
// Phase 1 (security): the data-egress trust guard (conductor_egress_check).
// Phase 2 (security): the inter-model injection firewall (conductor_fortify).
// Subsequent phases add the difficulty router, cross-lab panel/relay/trinity
// modes, the live quality floor, the evidence fact-check, and the learning loop.
// See README.md.
export default function register(api: OpenClawPluginApi) {
  api.registerTool(createEgressCheckTool(api), { optional: true });
  api.registerTool(createFortifyTool(api), { optional: true });
  api.registerTool(createRunTool(api), { optional: true });
}
