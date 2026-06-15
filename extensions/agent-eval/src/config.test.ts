import { describe, expect, it } from "vitest";

import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_JUDGE_MODEL,
  DEFAULT_MODEL,
  DEFAULT_PASS_THRESHOLD,
  parseEvalConfig,
} from "./config.js";

describe("parseEvalConfig", () => {
  it("applies all defaults for empty input", () => {
    const { config, errors } = parseEvalConfig({});
    expect(errors).toEqual([]);
    expect(config).toEqual({
      judgeModel: DEFAULT_JUDGE_MODEL,
      defaultResponder: "command",
      model: DEFAULT_MODEL,
      apiKeyEnv: DEFAULT_API_KEY_ENV,
      passThreshold: DEFAULT_PASS_THRESHOLD,
    });
  });

  it("honors provided overrides", () => {
    const { config } = parseEvalConfig({
      judgeModel: "gpt-4o",
      defaultResponder: "openai",
      model: "gpt-4o",
      apiKeyEnv: "MY_KEY",
      passThreshold: 0.9,
    });
    expect(config.judgeModel).toBe("gpt-4o");
    expect(config.defaultResponder).toBe("openai");
    expect(config.model).toBe("gpt-4o");
    expect(config.apiKeyEnv).toBe("MY_KEY");
    expect(config.passThreshold).toBe(0.9);
  });

  it("clamps passThreshold into 0..1", () => {
    expect(parseEvalConfig({ passThreshold: 5 }).config.passThreshold).toBe(1);
    expect(parseEvalConfig({ passThreshold: -3 }).config.passThreshold).toBe(0);
    expect(parseEvalConfig({ passThreshold: "nope" }).config.passThreshold).toBe(DEFAULT_PASS_THRESHOLD);
  });

  it("records an error for an invalid responder kind but keeps the default", () => {
    const { config, errors } = parseEvalConfig({ defaultResponder: "telepathy" });
    expect(config.defaultResponder).toBe("command");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("defaultResponder");
  });

  it("tolerates non-object input", () => {
    expect(parseEvalConfig(undefined).config.judgeModel).toBe(DEFAULT_JUDGE_MODEL);
    expect(parseEvalConfig("nope").config.passThreshold).toBe(DEFAULT_PASS_THRESHOLD);
    expect(parseEvalConfig(123).config.defaultResponder).toBe("command");
  });
});
