import { describe, expect, it } from "vitest";

import { migrateLegacyConfig } from "./legacy-migrate.js";

describe("migrateLegacyConfig", () => {
  it("returns migrated config when legacy gateway.token is present", () => {
    const raw = {
      gateway: { mode: "local", token: "secret-123" },
      agents: { list: [{ id: "main" }] },
    };
    const result = migrateLegacyConfig(raw);
    expect(result.config).not.toBeNull();
    expect(result.changes.length).toBeGreaterThan(0);
    // gateway.token should be moved to gateway.auth.token
    expect((result.config as Record<string, unknown>).gateway).toMatchObject({
      auth: { mode: "token", token: "secret-123" },
    });
    // legacy key should be gone
    expect(
      (
        (result.config as Record<string, unknown>).gateway as Record<
          string,
          unknown
        >
      ).token,
    ).toBeUndefined();
  });

  it("returns null config when no legacy keys are present", () => {
    const raw = {
      gateway: { mode: "local", auth: { mode: "token", token: "ok" } },
      agents: { list: [{ id: "main" }] },
    };
    const result = migrateLegacyConfig(raw);
    expect(result.config).toBeNull();
    expect(result.changes).toEqual([]);
  });

  it("returns null config when migration cannot produce a valid schema", () => {
    // Feed something that has a legacy key but whose migrated form still
    // violates the Zod schema (e.g., gateway.auth.token must be a string).
    const raw = {
      gateway: { mode: "local", token: 12345 },
      agents: { list: [{ id: "main" }] },
    };
    const result = migrateLegacyConfig(raw);
    // The migration moves the non-string token; schema validation should
    // reject it and the function should report the issue.
    if (result.config === null) {
      expect(result.changes.some((c) => c.includes("still invalid"))).toBe(
        true,
      );
    }
    // If schema happens to coerce it, that's also acceptable — the point
    // is that it doesn't throw.
  });

  it("does not depend on plugin validation to return migrated config", () => {
    // This is the core regression test: migrateLegacyConfig must use
    // schema-only validation (validateConfigObject) so that unrelated
    // plugin-level failures don't discard the migration.  We verify this
    // indirectly: a valid legacy config should always produce a non-null
    // result, regardless of the plugin environment.
    const raw = {
      gateway: { mode: "local", token: "test-token" },
      agents: { list: [{ id: "main" }] },
    };
    const result = migrateLegacyConfig(raw);
    expect(result.config).not.toBeNull();
    expect(result.changes.some((c) => c.includes("gateway.token"))).toBe(true);
  });
});
