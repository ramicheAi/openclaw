// cli.ts — `openclaw social ...`, the human side of the publish gate.
//
// Drafts are queued by agents but can only become sendable when a HUMAN approves. This
// CLI is that human interface: list / show / approve / reject. Because it runs in a
// terminal a person typed into, an `approve` here is a real human approval — it is not
// reachable by an agent (no agent tool maps to it). Approving sets `approvedBy`, which is
// what `canSend()` requires.

import type { Command } from "commander";

import { approve, type DraftStatus, filePostStore, listByStatus, reject } from "./post-queue.js";
import { type PlatformPoster, publishApproved } from "./poster.js";

type CliLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

const STATUSES: DraftStatus[] = ["draft", "approved", "rejected", "posted"];

export function registerSocialCli(params: { program: Command; queuePath: string; poster: PlatformPoster; logger: CliLogger }): void {
  const { program, queuePath, poster, logger } = params;
  const store = filePostStore(queuePath);

  const social = program.command("social").description("Review and approve queued social drafts (the human publish gate)");

  social
    .command("list")
    .description("List drafts by status (default: draft)")
    .option("--status <status>", `One of: ${STATUSES.join(", ")}`, "draft")
    .action(async (opts: { status: string }) => {
      const status = (STATUSES.includes(opts.status as DraftStatus) ? opts.status : "draft") as DraftStatus;
      const posts = await listByStatus(store, status);
      if (!posts.length) {
        logger.info(`(no ${status} drafts)`);
        return;
      }
      for (const p of posts) logger.info(`${p.id}  [${p.platform}]  ${p.caption.replace(/\s+/g, " ").slice(0, 80)}`);
    });

  social
    .command("show <id>")
    .description("Show a draft in full")
    .action(async (id: string) => {
      const post = (await store.load()).find((x) => x.id === id);
      if (!post) {
        logger.error(`no draft ${id}`);
        process.exitCode = 1;
        return;
      }
      const meta = `status=${post.status}${post.approvedBy ? ` approvedBy=${post.approvedBy}` : ""}`;
      logger.info(`${post.id} [${post.platform}] ${meta}\n\n${post.caption}`);
    });

  social
    .command("approve <id>")
    .description("Approve a draft for posting (the human gate)")
    .option("--by <name>", "Approver name", process.env.USER || "human")
    .action(async (id: string, opts: { by: string }) => {
      try {
        const post = await approve(store, id, opts.by);
        logger.info(`approved ${post.id} by ${post.approvedBy} (now sendable)`);
      } catch (e) {
        logger.error((e as Error).message);
        process.exitCode = 1;
      }
    });

  social
    .command("reject <id>")
    .description("Reject a draft")
    .option("--note <note>", "Reason for rejection")
    .action(async (id: string, opts: { note?: string }) => {
      try {
        const post = await reject(store, id, opts.note);
        logger.info(`rejected ${post.id}`);
      } catch (e) {
        logger.error((e as Error).message);
        process.exitCode = 1;
      }
    });

  social
    .command("publish <id>")
    .description("Publish an APPROVED draft (human-triggered; dry-run until real adapters + creds are added)")
    .action(async (id: string) => {
      try {
        const r = await publishApproved(store, poster, id);
        logger.info(r.ok ? `posted ${id} (${r.externalId})` : `publish failed for ${id}: ${r.error}`);
        if (!r.ok) process.exitCode = 1;
      } catch (e) {
        logger.error((e as Error).message);
        process.exitCode = 1;
      }
    });
}
