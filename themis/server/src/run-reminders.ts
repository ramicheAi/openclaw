// Stand-alone script — runs the daily deadline reminders.
//   bash:  tsx src/run-reminders.ts
//   cron / launchd: see themis/scripts/install-reminders.sh

import { getDb } from "./db.js";
import { runDailyReminders } from "./reminders.js";

const db = getDb();
const result = await runDailyReminders(db);
console.log(`[reminders] scanned ${result.scanned} deadlines · ${result.sent} email(s) sent · ${result.skipped} user(s) skipped`);
if (result.errors.length > 0) {
  console.error("[reminders] errors:");
  for (const e of result.errors) console.error("  -", e);
  process.exit(1);
}
