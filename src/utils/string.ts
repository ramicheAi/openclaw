export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampInt(value: number, min: number, max: number): number {
  return clampNumber(Math.floor(value), min, max);
}

export type WebChannel = "web";

export function assertWebChannel(input: string): asserts input is WebChannel {
  if (input !== "web") {
    throw new Error("Web channel must be 'web'");
  }
}

export function normalizePath(p: string): string {
  if (!p.startsWith("/")) return `/${p}`;
  return p;
}

export function withWhatsAppPrefix(number: string): string {
  return number.startsWith("whatsapp:") ? number : `whatsapp:${number}`;
}

export function normalizeE164(number: string): string {
  const withoutPrefix = number.replace(/^whatsapp:/, "").trim();
  const digits = withoutPrefix.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `+${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * "Self-chat mode" heuristic (single phone): the gateway is logged in as the owner's own WhatsApp account,
 * and `channels.whatsapp.allowFrom` includes that same number. Used to avoid side-effects that make no sense when the
 * "bot" and the human are the same WhatsApp identity (e.g. auto read receipts, @mention JID triggers).
 */
export function isSelfChatMode(
  selfE164: string | null | undefined,
  allowFrom?: Array<string | number> | null,
): boolean {
  if (!selfE164) return false;
  if (!Array.isArray(allowFrom) || allowFrom.length === 0) return false;
  const normalizedSelf = normalizeE164(selfE164);
  return allowFrom.some((n) => {
    if (n === "*") return false;
    try {
      return normalizeE164(String(n)) === normalizedSelf;
    } catch {
      return false;
    }
  });
}

export function toWhatsappJid(number: string): string {
  const withoutPrefix = number.replace(/^whatsapp:/, "").trim();
  if (withoutPrefix.includes("@")) return withoutPrefix;
  const e164 = normalizeE164(withoutPrefix);
  const digits = e164.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

export function sliceUtf16Safe(input: string, start: number, end?: number): string {
  const len = input.length;

  let from = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
  let to = end === undefined ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);

  if (to < from) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  if (from > 0 && from < len) {
    const codeUnit = input.charCodeAt(from);
    if (isLowSurrogate(codeUnit) && isHighSurrogate(input.charCodeAt(from - 1))) {
      from += 1;
    }
  }

  if (to > 0 && to < len) {
    const codeUnit = input.charCodeAt(to - 1);
    if (isHighSurrogate(codeUnit) && isLowSurrogate(input.charCodeAt(to))) {
      to -= 1;
    }
  }

  return input.slice(from, to);
}

export function truncateUtf16Safe(input: string, maxLen: number): string {
  const limit = Math.max(0, Math.floor(maxLen));
  if (input.length <= limit) return input;
  return sliceUtf16Safe(input, 0, limit);
}

export function formatTerminalLink(
  label: string,
  url: string,
  opts?: { fallback?: string; force?: boolean },
): string {
  const esc = "\u001b";
  const safeLabel = label.replaceAll(esc, "");
  const safeUrl = url.replaceAll(esc, "");
  const allow =
    opts?.force === true ? true : opts?.force === false ? false : Boolean(process.stdout.isTTY);
  if (!allow) {
    return opts?.fallback ?? `${safeLabel} (${safeUrl})`;
  }
  return `\u001b]8;;${safeUrl}\u0007${safeLabel}\u001b]8;;\u0007`;
}
