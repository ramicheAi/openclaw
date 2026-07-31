// Shared text helpers for the LLM seam. Consolidated from copy-pasted
// inline copies that lived in every prompt builder + JSON extractor.

/**
 * Strip CRLF and low-ASCII control bytes (NUL etc.) from text pulled out of
 * PDFs before it goes into an LLM prompt — NUL crashes the Claude Code CLI
 * bridge's spawn() and stray control chars confuse the tokenizer.
 */
export function sanitizePromptText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Pull the outermost JSON object out of a raw LLM response (which may wrap the
 * JSON in prose) and parse it. Greedy match — finds the widest { ... } span.
 */
export function extractJsonObject<T>(
  raw: string,
): { ok: true; value: T } | { ok: false; error: string } {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "model_did_not_return_json" };
  try {
    const value = JSON.parse(m[0]) as T;
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: `parse_failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
