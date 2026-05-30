/**
 * Integration test: legacy config migration must persist even when plugin validation fails.
 *
 * The fix under test: `migrateLegacyConfig` in `src/config/legacy-migrate.ts` should call
 * `validateConfigObject` (core-only validation) instead of `validateConfigObjectWithPlugins`
 * (which also validates plugin manifests and can fail for unrelated reasons).
 *
 * This test mocks `validateConfigObjectWithPlugins` to return `ok: false`, proving that:
 * - With the fix: migration succeeds because `migrateLegacyConfig` calls `validateConfigObject` (unmocked).
 * - Without the fix (reverted): migration is discarded because `migrateLegacyConfig` would call
 *   the mocked `validateConfigObjectWithPlugins` which returns `ok: false`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let originalIsTTY: boolean | undefined;
let originalStateDir: string | undefined;
let originalUpdateInProgress: string | undefined;
let tempStateDir: string | undefined;

function setStdinTty(value: boolean | undefined) {
  try {
    Object.defineProperty(process.stdin, "isTTY", {
      value,
      configurable: true,
    });
  } catch {
    // ignore
  }
}

beforeEach(() => {
  confirm.mockReset().mockResolvedValue(true);
  select.mockReset().mockResolvedValue("node");
  note.mockClear();

  readConfigFileSnapshot.mockReset();
  writeConfigFile.mockReset().mockResolvedValue(undefined);
  resolveOpenClawPackageRoot.mockReset().mockResolvedValue(null);
  runGatewayUpdate.mockReset().mockResolvedValue({
    status: "skipped",
    mode: "unknown",
    steps: [],
    durationMs: 0,
  });
  legacyReadConfigFileSnapshot.mockReset().mockResolvedValue({
    path: "/tmp/openclaw.json",
    exists: false,
    raw: null,
    parsed: {},
    valid: true,
    config: {},
    issues: [],
    legacyIssues: [],
  });
  createConfigIO.mockReset().mockImplementation(() => ({
    readConfigFileSnapshot: legacyReadConfigFileSnapshot,
  }));
  runExec.mockReset().mockResolvedValue({ stdout: "", stderr: "" });
  runCommandWithTimeout.mockReset().mockResolvedValue({
    stdout: "",
    stderr: "",
    code: 0,
    signal: null,
    killed: false,
  });
  ensureAuthProfileStore.mockReset().mockReturnValue({ version: 1, profiles: {} });
  findLegacyGatewayServices.mockReset().mockResolvedValue([]);
  uninstallLegacyGatewayServices.mockReset().mockResolvedValue([]);
  findExtraGatewayServices.mockReset().mockResolvedValue([]);
  renderGatewayServiceCleanupHints.mockReset().mockReturnValue(["cleanup"]);
  resolveGatewayProgramArguments.mockReset().mockResolvedValue({
    programArguments: ["node", "cli", "gateway", "--port", "18789"],
  });
  serviceInstall.mockReset().mockResolvedValue(undefined);
  serviceIsLoaded.mockReset().mockResolvedValue(false);
  serviceStop.mockReset().mockResolvedValue(undefined);
  serviceRestart.mockReset().mockResolvedValue(undefined);
  serviceUninstall.mockReset().mockResolvedValue(undefined);
  callGateway.mockReset().mockRejectedValue(new Error("gateway closed"));

  originalIsTTY = process.stdin.isTTY;
  setStdinTty(true);
  originalStateDir = process.env.OPENCLAW_STATE_DIR;
  originalUpdateInProgress = process.env.OPENCLAW_UPDATE_IN_PROGRESS;
  process.env.OPENCLAW_UPDATE_IN_PROGRESS = "1";
  tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-doctor-state-"));
  process.env.OPENCLAW_STATE_DIR = tempStateDir;
  fs.mkdirSync(path.join(tempStateDir, "agents", "main", "sessions"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(tempStateDir, "credentials"), { recursive: true });
});

afterEach(() => {
  setStdinTty(originalIsTTY);
  if (originalStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = originalStateDir;
  }
  if (originalUpdateInProgress === undefined) {
    delete process.env.OPENCLAW_UPDATE_IN_PROGRESS;
  } else {
    process.env.OPENCLAW_UPDATE_IN_PROGRESS = originalUpdateInProgress;
  }
  if (tempStateDir) {
    fs.rmSync(tempStateDir, { recursive: true, force: true });
    tempStateDir = undefined;
  }
});

const readConfigFileSnapshot = vi.fn();
const confirm = vi.fn().mockResolvedValue(true);
const select = vi.fn().mockResolvedValue("node");
const note = vi.fn();
const writeConfigFile = vi.fn().mockResolvedValue(undefined);
const resolveOpenClawPackageRoot = vi.fn().mockResolvedValue(null);
const runGatewayUpdate = vi.fn().mockResolvedValue({
  status: "skipped",
  mode: "unknown",
  steps: [],
  durationMs: 0,
});

const runExec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
const runCommandWithTimeout = vi.fn().mockResolvedValue({
  stdout: "",
  stderr: "",
  code: 0,
  signal: null,
  killed: false,
});

const ensureAuthProfileStore = vi.fn().mockReturnValue({ version: 1, profiles: {} });

const legacyReadConfigFileSnapshot = vi.fn().mockResolvedValue({
  path: "/tmp/openclaw.json",
  exists: false,
  raw: null,
  parsed: {},
  valid: true,
  config: {},
  issues: [],
  legacyIssues: [],
});
const createConfigIO = vi.fn(() => ({
  readConfigFileSnapshot: legacyReadConfigFileSnapshot,
}));

const findLegacyGatewayServices = vi.fn().mockResolvedValue([]);
const uninstallLegacyGatewayServices = vi.fn().mockResolvedValue([]);
const findExtraGatewayServices = vi.fn().mockResolvedValue([]);
const renderGatewayServiceCleanupHints = vi.fn().mockReturnValue(["cleanup"]);
const resolveGatewayProgramArguments = vi.fn().mockResolvedValue({
  programArguments: ["node", "cli", "gateway", "--port", "18789"],
});
const serviceInstall = vi.fn().mockResolvedValue(undefined);
const serviceIsLoaded = vi.fn().mockResolvedValue(false);
const serviceStop = vi.fn().mockResolvedValue(undefined);
const serviceRestart = vi.fn().mockResolvedValue(undefined);
const serviceUninstall = vi.fn().mockResolvedValue(undefined);
const callGateway = vi.fn().mockRejectedValue(new Error("gateway closed"));

vi.mock("@clack/prompts", () => ({
  confirm,
  intro: vi.fn(),
  note,
  outro: vi.fn(),
  select,
}));

vi.mock("../agents/skills-status.js", () => ({
  buildWorkspaceSkillStatus: () => ({ skills: [] }),
}));

vi.mock("../plugins/loader.js", () => ({
  loadOpenClawPlugins: () => ({ plugins: [], diagnostics: [] }),
}));

/**
 * CRITICAL: We do NOT mock `migrateLegacyConfig` here — we let the REAL implementation run.
 * This is the key difference from other doctor tests: we want to exercise the actual
 * `migrateLegacyConfig` -> `validateConfigObject` (or `validateConfigObjectWithPlugins`) path.
 */
vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    CONFIG_PATH: "/tmp/openclaw.json",
    createConfigIO,
    readConfigFileSnapshot,
    writeConfigFile,
    // NOTE: migrateLegacyConfig is NOT overridden — uses the real implementation
  };
});

/**
 * Mock validateConfigObjectWithPlugins to FAIL, simulating plugin validation failure.
 * Do NOT mock validateConfigObject — let it run normally.
 *
 * With the fix: migrateLegacyConfig calls validateConfigObject (unmocked, real) -> succeeds.
 * Without fix: migrateLegacyConfig calls validateConfigObjectWithPlugins (mocked to fail) -> config discarded.
 */
vi.mock("../config/validation.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    validateConfigObjectWithPlugins: vi.fn().mockReturnValue({
      ok: false,
      issues: [{ path: "plugins", message: "simulated plugin manifest failure" }],
      warnings: [],
    }),
  };
});

vi.mock("../daemon/legacy.js", () => ({
  findLegacyGatewayServices,
  uninstallLegacyGatewayServices,
}));

vi.mock("../daemon/inspect.js", () => ({
  findExtraGatewayServices,
  renderGatewayServiceCleanupHints,
}));

vi.mock("../daemon/program-args.js", () => ({
  resolveGatewayProgramArguments,
}));

vi.mock("../gateway/call.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../gateway/call.js")>();
  return {
    ...actual,
    callGateway,
  };
});

vi.mock("../process/exec.js", () => ({
  runExec,
  runCommandWithTimeout,
}));

vi.mock("../infra/openclaw-root.js", () => ({
  resolveOpenClawPackageRoot,
}));

vi.mock("../infra/update-runner.js", () => ({
  runGatewayUpdate,
}));

vi.mock("../agents/auth-profiles.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ensureAuthProfileStore,
  };
});

vi.mock("../daemon/service.js", () => ({
  resolveGatewayService: () => ({
    label: "LaunchAgent",
    loadedText: "loaded",
    notLoadedText: "not loaded",
    install: serviceInstall,
    uninstall: serviceUninstall,
    stop: serviceStop,
    restart: serviceRestart,
    isLoaded: serviceIsLoaded,
    readCommand: vi.fn(),
    readRuntime: vi.fn().mockResolvedValue({ status: "running" }),
  }),
}));

vi.mock("../telegram/pairing-store.js", () => ({
  readTelegramAllowFromStore: vi.fn().mockResolvedValue([]),
}));

vi.mock("../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: vi.fn().mockResolvedValue([]),
  upsertChannelPairingRequest: vi.fn().mockResolvedValue({ code: "000000", created: false }),
}));

vi.mock("../telegram/token.js", () => ({
  resolveTelegramToken: vi.fn(() => ({ token: "", source: "none" })),
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime: {
    log: () => {},
    error: () => {},
    exit: () => {
      throw new Error("exit");
    },
  },
}));

vi.mock("../utils.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveUserPath: (value: string) => value,
    sleep: vi.fn(),
  };
});

vi.mock("./health.js", () => ({
  healthCommand: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./onboard-helpers.js", () => ({
  applyWizardMetadata: (cfg: Record<string, unknown>) => cfg,
  DEFAULT_WORKSPACE: "/tmp",
  guardCancel: (value: unknown) => value,
  printWizardHeader: vi.fn(),
  randomToken: vi.fn(() => "test-gateway-token"),
}));

vi.mock("./doctor-state-migrations.js", () => ({
  autoMigrateLegacyStateDir: vi.fn().mockResolvedValue({
    migrated: false,
    skipped: false,
    changes: [],
    warnings: [],
  }),
  detectLegacyStateMigrations: vi.fn().mockResolvedValue({
    targetAgentId: "main",
    targetMainKey: "main",
    targetScope: undefined,
    stateDir: "/tmp/state",
    oauthDir: "/tmp/oauth",
    sessions: {
      legacyDir: "/tmp/state/sessions",
      legacyStorePath: "/tmp/state/sessions/sessions.json",
      targetDir: "/tmp/state/agents/main/sessions",
      targetStorePath: "/tmp/state/agents/main/sessions/sessions.json",
      hasLegacy: false,
      legacyKeys: [],
    },
    agentDir: {
      legacyDir: "/tmp/state/agent",
      targetDir: "/tmp/state/agents/main/agent",
      hasLegacy: false,
    },
    whatsappAuth: {
      legacyDir: "/tmp/oauth",
      targetDir: "/tmp/oauth/whatsapp/default",
      hasLegacy: false,
    },
    preview: [],
  }),
  runLegacyStateMigrations: vi.fn().mockResolvedValue({
    changes: [],
    warnings: [],
  }),
}));

describe("doctor command", () => {
  it(
    "persists legacy gateway.token migration despite plugin validation failures",
    { timeout: 60_000 },
    async () => {
      // Set up: config has legacy `gateway.token` key, which should migrate to `gateway.auth.token`.
      // readConfigFileSnapshot reports this as a legacy issue.
      readConfigFileSnapshot.mockResolvedValue({
        path: "/tmp/openclaw.json",
        exists: true,
        raw: JSON.stringify({
          gateway: { mode: "local", token: "test-secret" },
          agents: { list: [{ id: "main" }] },
        }),
        parsed: {
          gateway: { mode: "local", token: "test-secret" },
          agents: { list: [{ id: "main" }] },
        },
        valid: false,
        config: {},
        issues: [
          {
            path: "gateway.token",
            message:
              "gateway.token is ignored; use gateway.auth.token instead (auto-migrated on load).",
          },
        ],
        legacyIssues: [
          {
            path: "gateway.token",
            message:
              "gateway.token is ignored; use gateway.auth.token instead (auto-migrated on load).",
          },
        ],
      });

      const { doctorCommand } = await import("./doctor.js");
      const runtime = {
        log: vi.fn(),
        error: vi.fn(),
        exit: vi.fn(),
      };

      await doctorCommand(runtime, { nonInteractive: true, repair: true });

      // The config MUST have been written.
      expect(writeConfigFile).toHaveBeenCalledTimes(1);

      const written = writeConfigFile.mock.calls[0]?.[0] as Record<string, unknown>;
      const gateway = written.gateway as Record<string, unknown>;

      // Legacy `gateway.token` must be gone.
      expect(gateway.token).toBeUndefined();

      // `gateway.auth.token` must be set to the migrated value.
      const auth = gateway.auth as Record<string, unknown>;
      expect(auth.token).toBe("test-secret");
      expect(auth.mode).toBe("token");
    },
  );
});
