// Daily deadline reminders. For each user, find their open deadlines
// landing in the next 7 days (or already overdue), grouped by urgency,
// and email them a digest. Run once a day via the cron script in
// themis/scripts/run-reminders.sh.
//
// Design: a single email per user per day. Skips users with zero
// upcoming or overdue deadlines. Email delivery falls back to console
// when RESEND_API_KEY is unset — same pattern as the magic-link flow.

import type { DB } from "./db.js";
import { magicLinkEmail, sendEmail } from "./email.js";
// We read deadlines via a raw SQL join in this file, so we use the
// snake_case column names directly rather than the camelCase DeadlineRow.

interface ReminderRow {
  id: string;
  matter_id: string;
  matter_name: string;
  owner_email: string;
  due_date: string;
  title: string;
  detail: string;
  kind: string;
  source: string;
  done: number;
  created_at: string;
}

function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00").getTime();
  if (!Number.isFinite(d)) return null;
  return Math.round((d - Date.now()) / 86_400_000);
}

export async function runDailyReminders(db: DB): Promise<{ scanned: number; sent: number; skipped: number; errors: string[] }> {
  const rows = db
    .prepare(
      `SELECT d.*, m.id AS matter_id, m.name AS matter_name, m.owner_email AS owner_email
         FROM deadlines d JOIN matters m ON m.id = d.matter_id
         WHERE d.done = 0 AND d.due_date != '' AND m.owner_email != ''
         ORDER BY d.due_date ASC`,
    )
    .all() as ReminderRow[];

  // Group per user, filter to "due within 7 days or overdue".
  const byUser = new Map<string, ReminderRow[]>();
  for (const r of rows) {
    const days = daysUntil(r.due_date);
    if (days === null) continue;
    if (days > 7) continue; // not due soon enough
    const list = byUser.get(r.owner_email) ?? [];
    list.push(r);
    byUser.set(r.owner_email, list);
  }

  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;
  for (const [email, deadlines] of byUser) {
    if (deadlines.length === 0) {
      skipped++;
      continue;
    }
    const msg = renderReminderEmail(email, deadlines);
    const res = await sendEmail(msg);
    if (!res.delivered) errors.push(`${email}: ${res.error}`);
    else sent++;
  }
  return { scanned: rows.length, sent, skipped, errors };
}

interface Group {
  label: string;
  emoji: string;
  rows: ReminderRow[];
}

function renderReminderEmail(email: string, deadlines: ReminderRow[]) {
  const overdue: ReminderRow[] = [];
  const today: ReminderRow[] = [];
  const thisWeek: ReminderRow[] = [];
  for (const d of deadlines) {
    const days = daysUntil(d.due_date as string) ?? 999;
    if (days < 0) overdue.push(d);
    else if (days === 0) today.push(d);
    else thisWeek.push(d);
  }

  const groups: Group[] = [
    { label: "Overdue", emoji: "‼️", rows: overdue },
    { label: "Due today", emoji: "⚠️", rows: today },
    { label: "Due this week", emoji: "📅", rows: thisWeek },
  ].filter((g) => g.rows.length > 0);

  const textBody = [
    `Good morning,`,
    "",
    `You have ${deadlines.length} deadline${deadlines.length === 1 ? "" : "s"} that need attention:`,
    "",
    ...groups.flatMap((g) => [
      `${g.label}:`,
      ...g.rows.map((r) => {
        const days = daysUntil(r.due_date) ?? 0;
        const dayLabel = days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` : days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`;
        return `  • ${r.title} — ${r.matter_name} — ${dayLabel} (${r.due_date})`;
      }),
      "",
    ]),
    `Open Themis to manage these: ${publicUrl()}`,
    "",
    "— Themis",
  ].join("\n");

  const htmlGroups = groups
    .map((g) => `
      <h2 style="margin:20px 0 8px;font:600 14px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#1f1a14">
        ${g.emoji} ${g.label} (${g.rows.length})
      </h2>
      <ul style="margin:0;padding:0 0 0 18px;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#1f1a14">
        ${g.rows.map((r) => {
          const days = daysUntil(r.due_date) ?? 0;
          const tone = days < 0 ? "#b53d36" : days === 0 ? "#a5631f" : "#5b5141";
          const dayLabel = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `in ${days}d`;
          return `<li style="margin-bottom:6px"><strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(r.matter_name)} <span style="color:${tone};font-weight:600">· ${dayLabel}</span> <span style="color:#8a7f6c">(${r.due_date})</span></li>`;
        }).join("")}
      </ul>
    `)
    .join("");

  return {
    to: email,
    subject: `${overdue.length > 0 ? "‼️ " : today.length > 0 ? "⚠️ " : ""}${deadlines.length} Themis deadline${deadlines.length === 1 ? "" : "s"} this week`,
    text: textBody,
    html: `
      <div style="background:#f4ecda;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif">
        <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #d6caa8;border-radius:12px;padding:24px 28px;color:#1f1a14">
          <div style="font:600 10px/1 monospace;letter-spacing:0.18em;text-transform:uppercase;color:#8a5a1f;margin-bottom:10px">Themis · Daily Reminder</div>
          <h1 style="margin:0 0 4px;font:600 20px/1.25 Georgia,serif">${deadlines.length} deadline${deadlines.length === 1 ? "" : "s"} this week</h1>
          <p style="margin:0;font:13px/1.5 -apple-system,sans-serif;color:#5b5141">
            For ${escapeHtml(email)}, sorted by urgency.
          </p>
          ${htmlGroups}
          <div style="margin-top:24px">
            <a href="${publicUrl()}" style="display:inline-block;background:#8a5a1f;color:#f4ecda;text-decoration:none;font:600 13px/1 -apple-system,sans-serif;padding:10px 16px;border-radius:8px">
              Open Themis →
            </a>
          </div>
          <p style="margin:20px 0 0;font:11px/1.5 -apple-system,sans-serif;color:#8a7f6c">
            You're receiving this because deadlines are tracked in your matters.
            Manage notifications in Settings.
          </p>
        </div>
      </div>
    `,
  };
}

function publicUrl(): string {
  return (process.env.THEMIS_PUBLIC_URL ?? "http://localhost:5180").replace(/\/$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Quiet the magicLinkEmail import (we don't use it; left in case the
// reminders module ever needs to share the email template module).
void magicLinkEmail;
