import { applyLegacyMigrations } from "./legacy.js";
import type { OpenClawConfig } from "./types.js";
import { validateConfigObject } from "./validation.js";

export function migrateLegacyConfig(raw: unknown): {
  config: OpenClawConfig | null;
  changes: string[];
} {
  const { next, changes } = applyLegacyMigrations(raw);
  if (!next) return { config: null, changes: [] };
  // Use schema-only validation (not validateConfigObjectWithPlugins) so that
  // unrelated plugin-level validation failures don't discard a structurally
  // correct migration.  Plugin issues are a runtime concern and should not
  // prevent doctor --fix from persisting legacy-key migrations to disk.
  const validated = validateConfigObject(next);
  if (!validated.ok) {
    changes.push("Migration applied, but config still invalid; fix remaining issues manually.");
    return { config: null, changes };
  }
  return { config: validated.config, changes };
}
