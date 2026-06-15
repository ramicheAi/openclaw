// `openclaw eval ...` management commands.
//
// run    — load a suite, build a responder (+ optional judge), score every case,
//          print a summary, persist a JSON report, and exit-style-log on a miss.
// report — pretty-print a previously saved JSON report.

import type { Command } from "commander";

import type { EvalConfig } from "./config.js";
import { createOpenAIJudge, type Judge } from "./judge.js";
import { createCommandResponder, createOpenAIResponder, type Responder } from "./responder.js";
import { formatReport, readReportFile, writeReport } from "./report.js";
import { runSuite } from "./runner.js";
import { loadSuiteFile } from "./suite.js";

type CliLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug?: (message: string) => void;
};

type RunOptions = {
  responder?: string;
  command?: string;
  model?: string;
  judgeModel?: string;
  judge?: boolean; // commander sets `judge: false` for --no-judge
};

export function registerEvalCli(params: {
  program: Command;
  config: EvalConfig;
  logger: CliLogger;
}): void {
  const { program, config, logger } = params;

  const evalCmd = program
    .command("eval")
    .description("Evaluate agent/model outputs against deterministic checks and LLM-judged rubrics");

  evalCmd
    .command("run <suiteFile>")
    .description("Run an evaluation suite and report pass/fail accuracy")
    .option("--responder <kind>", 'Responder kind: "command" or "openai"', config.defaultResponder)
    .option("--command <cmd>", "Shell command for the command responder (input is piped to stdin)")
    .option("--model <model>", "Model id for the openai responder", config.model)
    .option("--judge-model <model>", "Model id for the LLM judge", config.judgeModel)
    .option("--no-judge", "Disable the LLM judge (criteria-based cases will fail)")
    .action(async (suiteFile: string, opts: RunOptions) => {
      const { suite, errors } = loadSuiteFile(suiteFile);
      for (const message of errors) logger.warn(`[suite] ${message}`);
      if (suite.cases.length === 0) {
        logger.error("No valid cases to run.");
        process.exitCode = 1;
        return;
      }

      const responder = buildResponder(opts, config, logger);
      if (!responder) {
        process.exitCode = 1;
        return;
      }

      const judge = buildJudge(opts, config, suite.cases.some((c) => c.expect.criteria), logger);

      const result = await runSuite({
        suite,
        responder,
        judge,
        passThreshold: config.passThreshold,
      });

      logger.info(formatReport(result));

      try {
        const file = await writeReport(result);
        logger.info(`\nReport written: ${file}`);
      } catch (err) {
        logger.warn(`Could not write report: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Non-zero exit code on any failure so the harness is CI-usable as a gate.
      if (result.passed < result.total) {
        logger.error(`\n${result.total - result.passed} case(s) failed.`);
        process.exitCode = 1;
      }
    });

  evalCmd
    .command("report <file>")
    .description("Pretty-print a saved JSON eval report")
    .action((file: string) => {
      try {
        const result = readReportFile(file);
        logger.info(formatReport(result));
      } catch (err) {
        logger.error(`Could not read report: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}

/** Build the responder for a run, or null (with a logged error) if misconfigured. */
function buildResponder(opts: RunOptions, config: EvalConfig, logger: CliLogger): Responder | null {
  const kind = (opts.responder ?? config.defaultResponder).toLowerCase();
  if (kind === "command") {
    if (!opts.command) {
      logger.error('The "command" responder requires --command "<cmd>".');
      return null;
    }
    return createCommandResponder(opts.command);
  }
  if (kind === "openai") {
    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      logger.error(`The "openai" responder requires the ${config.apiKeyEnv} environment variable.`);
      return null;
    }
    return createOpenAIResponder({ apiKey, model: opts.model ?? config.model });
  }
  logger.error(`Unknown responder kind '${kind}'. Use "command" or "openai".`);
  return null;
}

/** Build the judge unless disabled; warns (does not fail) if criteria need it but no key exists. */
function buildJudge(
  opts: RunOptions,
  config: EvalConfig,
  suiteHasCriteria: boolean,
  logger: CliLogger,
): Judge | undefined {
  if (opts.judge === false) {
    if (suiteHasCriteria) logger.warn("Judge disabled (--no-judge): criteria-based cases will fail.");
    return undefined;
  }
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    if (suiteHasCriteria) {
      logger.warn(
        `No ${config.apiKeyEnv} set: judge unavailable, criteria-based cases will fail. ` +
          "Set the key or pass --no-judge.",
      );
    }
    return undefined;
  }
  return createOpenAIJudge({ apiKey, model: opts.judgeModel ?? config.judgeModel });
}
