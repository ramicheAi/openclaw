/**
 * Tagged diagnostic logging for Telegram send paths.
 *
 * Gated on the OPENCLAW_DEBUG_TG_SENDS env var so it is a no-op in production
 * unless explicitly enabled. Used to diagnose duplicate-send bugs by showing
 * which code path invoked each send, with a trimmed stack trace.
 *
 * Enable at runtime:
 *   OPENCLAW_DEBUG_TG_SENDS=1 openclaw gateway run ...
 */

const isEnabled = (): boolean => {
  const v = process.env.OPENCLAW_DEBUG_TG_SENDS;
  if (!v) return false;
  return v !== "0" && v.toLowerCase() !== "false";
};

/** Preview a string for the log line (single-line, bounded). */
function preview(text: unknown, max = 80): string {
  if (text == null) return "";
  let s: string;
  if (typeof text === "string") {
    s = text;
  } else if (
    typeof text === "number" ||
    typeof text === "boolean" ||
    typeof text === "bigint" ||
    typeof text === "symbol"
  ) {
    s = String(text);
  } else if (typeof text === "object") {
    try {
      s = JSON.stringify(text);
    } catch {
      s = "[unserializable]";
    }
  } else {
    s = "[function]";
  }
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max)}…`;
}

/** Capture a compact stack trace (skip our own frame; include up to 5 callers). */
function captureStack(skip = 2, lines = 5): string {
  const raw = new Error("trace").stack;
  if (!raw) return "<no stack>";
  const frames = raw
    .split("\n")
    .slice(1 + skip) // drop "Error: trace" + the requested skip
    .map((l) => l.trim())
    .filter(Boolean);
  return frames.slice(0, lines).join(" | ");
}

type TraceTag =
  | "proxy.sendMessage"
  | "deliver.block"
  | "deliver.final"
  | "deliver.empty-fallback"
  | "canary.fallback";

export function traceSend(
  tag: TraceTag,
  details: {
    chatId?: string | number;
    text?: unknown;
    note?: string;
  } = {},
): void {
  if (!isEnabled()) return;
  const chatId = details.chatId == null ? "?" : String(details.chatId);
  const note = details.note ? ` ${details.note}` : "";
  // Keep the line greppable: `[tg-send ${tag}] chatId=... text="..." — stack`.
  // eslint-disable-next-line no-console
  console.log(
    `[tg-send ${tag}] chatId=${chatId} text="${preview(details.text)}"${note} — ${captureStack(2, 6)}`,
  );
}
