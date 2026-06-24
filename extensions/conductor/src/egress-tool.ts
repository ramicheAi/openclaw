import { Type } from "@sinclair/typebox";

import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

import { checkEgress, DEFAULT_POLICY, type TrustPolicy } from "./model-trust.js";

type PluginCfg = {
  // Optional policy override. Same shape as TrustPolicy.allow:
  // { "allow": { "pii": ["anthropic","google"], ... } }
  policy?: TrustPolicy;
};

function resolvePolicy(api: OpenClawPluginApi): TrustPolicy {
  const cfg = (api.pluginConfig ?? {}) as PluginCfg;
  if (cfg.policy && typeof cfg.policy === "object" && cfg.policy.allow) {
    // Merge over defaults so a partial override can't silently un-set a class.
    return { allow: { ...DEFAULT_POLICY.allow, ...cfg.policy.allow } };
  }
  return DEFAULT_POLICY;
}

// A pure, offline pre-flight check. The orchestration router calls this before
// dispatching a draft/critique/task to any non-primary model; agents can call it
// directly to confirm a payload is safe to egress to a given lab.
export function createEgressCheckTool(api: OpenClawPluginApi) {
  const policy = resolvePolicy(api);
  return {
    name: "conductor_egress_check",
    label: "Egress Check",
    description:
      "Pre-flight data-egress guard. Given content and a target model (provider/model key), returns whether " +
      "it is safe to send — blocking secrets to every vendor and sensitive (financial/identity/pii) data to " +
      "labs not on the trust allowlist. Pure/offline; call BEFORE routing to a non-primary model.",
    parameters: Type.Object({
      content: Type.String({ description: "The prompt/payload that would be sent to the model." }),
      model: Type.String({ description: "Target model key, e.g. 'google-gemini-cli/gemini-2.5-pro' or 'claude-opus-4-8'." }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const content = String(params.content ?? "");
      const model = String(params.model ?? "");
      const decision = checkEgress(content, model, policy);
      const summary = decision.allowed
        ? `ALLOWED → ${decision.vendor}`
        : `BLOCKED → ${decision.vendor}: ${decision.violations.map((v) => `${v.class} (${v.label})`).join(", ")}`;
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ summary, ...decision }, null, 2) }],
        details: { decision },
      };
    },
  };
}
