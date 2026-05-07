import type { OpenClawConfig } from "../config/config.js";
import { resolveAgentConfig, resolveAgentModelPrimary } from "./agent-scope.js";
import { createOpenClawCodingTools } from "./pi-tools.js";
import { expandToolGroups, normalizeToolName } from "./tool-policy.js";

export type AgentCapabilityCheckResult =
  | { ok: true }
  | { ok: false; agentId: string; missing: string[] };

function parseProviderAndModel(modelStr?: string): {
  provider?: string;
  modelId?: string;
} {
  if (!modelStr) return {};
  const slash = modelStr.indexOf("/");
  if (slash <= 0) return { modelId: modelStr };
  return {
    provider: modelStr.slice(0, slash).trim() || undefined,
    modelId: modelStr.slice(slash + 1).trim() || undefined,
  };
}

/**
 * Validate that an agent's declared capabilities (`capabilities.required`) are
 * reachable under the resolved tool policy for that agent. Run at schedule
 * time so failures surface up-front, not as 404s mid-run.
 *
 * Strategy: build the agent's effective tool list via `createOpenClawCodingTools`
 * and read the names. Same path the agent uses at run time, so policy chain
 * + plugin/channel discovery stay in sync without a parallel registry.
 *
 * Provider filtering: if the agent has a primary model configured, we apply
 * provider-specific tool rules using that provider. Without a primary model,
 * provider-specific rules don't apply and the result is more permissive than
 * runtime. This is a known limitation documented in the capability docs.
 */
export function validateAgentCapabilities(params: {
  config: OpenClawConfig;
  agentId: string;
}): AgentCapabilityCheckResult {
  const agentConfig = resolveAgentConfig(params.config, params.agentId);
  const required = agentConfig?.capabilities?.required;
  if (!Array.isArray(required) || required.length === 0) return { ok: true };

  const requiredExpanded = expandToolGroups(required);
  if (requiredExpanded.length === 0) return { ok: true };

  const primaryModel = resolveAgentModelPrimary(params.config, params.agentId);
  const { provider, modelId } = parseProviderAndModel(primaryModel);

  const tools = createOpenClawCodingTools({
    config: params.config,
    sessionKey: `agent:${params.agentId}`,
    modelProvider: provider,
    modelId,
  });
  const available = new Set(tools.map((tool) => normalizeToolName(tool.name)));

  const missing = requiredExpanded.filter((name) => !available.has(name));
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    agentId: params.agentId,
    missing: Array.from(new Set(missing)),
  };
}
