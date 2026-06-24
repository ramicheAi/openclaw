import os from "node:os";
import path from "node:path";

import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { registerSocialCli } from "./src/cli.js";
import { createSocialCreateTool, createSocialDraftTool, createSocialFanoutTool, createSocialQueueTool } from "./src/tools.js";

// SOCIAL MANAGER — the publish-to-post layer on top of the conductor brain + Pantheon.
// This release ships the safe + correct foundation: a platform-correct, brand-safe
// formatter and a HARD-GATED draft queue. Agents can prepare and queue drafts; only a
// human can approve, and there is no agent-reachable send path. Content generation
// (route the caption/concept through conductor_run + the Pantheon disciplines) and the
// real platform-API posting are the next increments — both land behind this same gate.
export default function register(api: OpenClawPluginApi) {
  api.registerTool(createSocialCreateTool(api), { optional: true });
  api.registerTool(createSocialFanoutTool(api), { optional: true });
  api.registerTool(createSocialDraftTool(api), { optional: true });
  api.registerTool(createSocialQueueTool(api), { optional: true });

  // The human side of the gate: `openclaw social list|show|approve|reject`. A terminal
  // command a person runs — deliberately NOT an agent tool, so only a human can approve.
  const cfg = (api.pluginConfig ?? {}) as { queuePath?: string };
  const queuePath = cfg.queuePath ?? path.join(os.homedir(), ".openclaw", "social", "queue.json");
  api.registerCli(({ program }) => registerSocialCli({ program, queuePath, logger: api.logger }), { commands: ["social"] });
}
