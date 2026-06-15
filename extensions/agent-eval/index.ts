// OpenClaw agent-eval plugin.
//
// An evaluation harness that scores agent/model outputs against deterministic
// checks (contains / notContains / regex / equals) and optional LLM-judged
// rubric criteria, so deployments can MEASURE agent quality and catch
// regressions. v1 surfaces no agent tool — it is driven entirely through the
// `openclaw eval` CLI, so all network work happens inside CLI actions and
// `register()` stays synchronous (the loader ignores async return values).

import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { parseEvalConfig } from "./src/config.js";
import { registerEvalCli } from "./src/cli.js";

export default function register(api: OpenClawPluginApi): void {
  const { config, errors } = parseEvalConfig(api.pluginConfig);
  for (const message of errors) api.logger.warn(`[agent-eval] ${message}`);

  api.logger.info(
    `[agent-eval] ready (responder=${config.defaultResponder}, judge=${config.judgeModel}, threshold=${config.passThreshold})`,
  );

  // Management CLI: openclaw eval run|report
  api.registerCli(
    ({ program }) => registerEvalCli({ program, config, logger: api.logger }),
    { commands: ["eval"] },
  );

  // No-op service: keeps the plugin visible in the service registry and gives a
  // clean lifecycle hook for future async work (e.g. scheduled regression runs).
  api.registerService({
    id: "agent-eval",
    start: () => {},
  });
}
