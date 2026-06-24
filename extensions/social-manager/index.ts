import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { createSocialDraftTool, createSocialQueueTool } from "./src/tools.js";

// SOCIAL MANAGER — the publish-to-post layer on top of the conductor brain + Pantheon.
// This release ships the safe + correct foundation: a platform-correct, brand-safe
// formatter and a HARD-GATED draft queue. Agents can prepare and queue drafts; only a
// human can approve, and there is no agent-reachable send path. Content generation
// (route the caption/concept through conductor_run + the Pantheon disciplines) and the
// real platform-API posting are the next increments — both land behind this same gate.
export default function register(api: OpenClawPluginApi) {
  api.registerTool(createSocialDraftTool(api), { optional: true });
  api.registerTool(createSocialQueueTool(api), { optional: true });
}
