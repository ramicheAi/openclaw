import { describe, expect, it } from "vitest";

import {
  assertRoutable,
  checkEgress,
  classify,
  DEFAULT_POLICY,
  EgressBlockedError,
  redactSecrets,
  resolveVendor,
  type TrustPolicy,
} from "./model-trust.js";

describe("resolveVendor", () => {
  it("maps model keys to the owning lab", () => {
    expect(resolveVendor("anthropic/claude-opus-4-8")).toBe("anthropic");
    expect(resolveVendor("claude-sonnet-4-5")).toBe("anthropic");
    expect(resolveVendor("google-gemini-cli/gemini-2.5-pro")).toBe("google");
    expect(resolveVendor("qwen-portal/qwen-max")).toBe("alibaba");
    expect(resolveVendor("copilot/gpt-4o")).toBe("github");
    expect(resolveVendor("openai-codex/gpt-5.2")).toBe("openai");
  });

  it("treats anything unrecognized as untrusted 'unknown'", () => {
    expect(resolveVendor("some-new-lab/mystery-1")).toBe("unknown");
    expect(resolveVendor("")).toBe("unknown");
  });

  it("treats on-machine runtimes as 'local' even when the model name is a cloud lab's", () => {
    expect(resolveVendor("lmstudio/qwen3-14b")).toBe("local");
    expect(resolveVendor("ollama/gemma-4-e4b")).toBe("local");
    // a CLOUD qwen endpoint is still untrusted alibaba — only the local RUNTIME is trusted
    expect(resolveVendor("qwen-portal/qwen-max")).toBe("alibaba");
  });
});

describe("local models are trusted for sensitive data (no egress off-machine)", () => {
  it("allows financial/identity/PII to a local model but still blocks secrets", () => {
    expect(checkEgress("client card 4242 4242 4242 4242", "lmstudio/qwen3-14b").allowed).toBe(true);
    expect(checkEgress("SSN 123-45-6789", "ollama/gemma-4-e4b").allowed).toBe(true);
    expect(checkEgress("sk-ant-abcdef0123456789xyz", "lmstudio/qwen3-14b").allowed).toBe(false);
  });
});

describe("classify", () => {
  it("flags secrets", () => {
    const det = classify("export AWS_KEY=AKIAIOSFODNN7EXAMPLE and sk-ant-abcdef0123456789xyz");
    const classes = det.map((d) => d.class);
    expect(classes).toContain("secret");
    // never echoes the raw secret back
    expect(det.every((d) => !d.sample.includes("AKIAIOSFODNN7EXAMPLE"))).toBe(true);
  });

  it("flags a Luhn-valid payment card but not arbitrary digit runs", () => {
    expect(classify("card 4242 4242 4242 4242").some((d) => d.label === "payment card number")).toBe(true);
    // 16 digits that fail Luhn should NOT be flagged as a card
    expect(classify("ref 1234 5678 9012 3457").some((d) => d.label === "payment card number")).toBe(false);
  });

  it("flags SSN as identity and email/phone as pii", () => {
    const det = classify("SSN 123-45-6789, reach me at ramon@example.com or 954-882-8523");
    const classes = new Set(det.map((d) => d.class));
    expect(classes.has("identity")).toBe(true);
    expect(classes.has("pii")).toBe(true);
  });

  it("does not flag clean prose", () => {
    expect(classify("Draft a 3-line hook for the SCOWW reel, proof-first.")).toHaveLength(0);
  });
});

describe("checkEgress — default policy", () => {
  it("blocks secrets to EVERY vendor, including anthropic", () => {
    const content = "here is the key sk-ant-abcdef0123456789xyz";
    for (const model of ["anthropic/claude-opus-4-8", "google-gemini-cli/gemini-2.5-pro", "qwen-portal/qwen-max"]) {
      expect(checkEgress(content, model).allowed).toBe(false);
    }
  });

  it("allows financial data to anthropic but blocks it to other labs", () => {
    const content = "client card on file 4242 4242 4242 4242";
    expect(checkEgress(content, "anthropic/claude-opus-4-8").allowed).toBe(true);
    expect(checkEgress(content, "google-gemini-cli/gemini-2.5-pro").allowed).toBe(false);
    expect(checkEgress(content, "qwen-portal/qwen-max").allowed).toBe(false);
  });

  it("blocks identity (SSN) to untrusted labs", () => {
    const d = checkEgress("athlete SSN 123-45-6789", "qwen-portal/qwen-max");
    expect(d.allowed).toBe(false);
    expect(d.violations[0]?.class).toBe("identity");
  });

  it("passes clean content to any vendor", () => {
    const content = "Summarize the Business Bible S-Tier screen in 5 bullets.";
    for (const model of ["anthropic/claude-opus-4-8", "openai-codex/gpt-5.2", "some-unknown/model"]) {
      expect(checkEgress(content, model).allowed).toBe(true);
    }
  });

  it("reports one violation per class, not per match", () => {
    const d = checkEgress("emails a@b.com and c@d.com", "qwen-portal/qwen-max");
    expect(d.violations.filter((v) => v.class === "pii")).toHaveLength(1);
  });
});

describe("policy override", () => {
  it("can loosen a class to an additional vendor", () => {
    const policy: TrustPolicy = { ...DEFAULT_POLICY, allow: { ...DEFAULT_POLICY.allow, pii: ["anthropic", "google"] } };
    const content = "contact ramon@example.com";
    expect(checkEgress(content, "google-gemini-cli/gemini-2.5-pro", policy).allowed).toBe(true);
    // secrets remain blocked regardless
    expect(checkEgress("sk-ant-abcdef0123456789xyz", "google-gemini-cli/gemini-2.5-pro", policy).allowed).toBe(false);
  });
});

describe("assertRoutable", () => {
  it("throws EgressBlockedError on an unsafe route", () => {
    expect(() => assertRoutable("SSN 123-45-6789", "qwen-portal/qwen-max")).toThrow(EgressBlockedError);
  });

  it("returns the decision on a safe route", () => {
    const d = assertRoutable("write me a haiku about open water", "openai-codex/gpt-5.2");
    expect(d.allowed).toBe(true);
  });
});

describe("redactSecrets", () => {
  it("masks secret spans so a scrubbed prompt can still be sent", () => {
    const out = redactSecrets("token sk-ant-abcdef0123456789xyz done");
    expect(out).not.toContain("sk-ant-abcdef0123456789xyz");
    expect(out).toContain("[REDACTED:");
  });
});
