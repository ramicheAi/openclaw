// Line/paragraph-aware text chunker.
//
// Splits text into overlapping chunks sized by an approximate token budget
// (~4 chars per token). Chunks break on line boundaries so we never cut a line
// in half; overlap is achieved by carrying the trailing lines of one chunk into
// the start of the next, which preserves context across the boundary. Pure
// function — no I/O, deterministic, easy to test.

export type Chunk = { text: string; index: number };

export type ChunkOptions = {
  /** Target chunk size in tokens. */
  tokens: number;
  /** Tokens of overlap carried between adjacent chunks. */
  overlap: number;
};

/** ~4 characters per token; good enough for sizing English/markdown prose. */
const CHARS_PER_TOKEN = 4;

const tokensToChars = (tokens: number): number => Math.max(1, Math.floor(tokens * CHARS_PER_TOKEN));

/**
 * Chunk `text` into `{ text, index }[]`. Empty/whitespace-only input yields `[]`.
 * Each chunk aims for ~`tokens` tokens; consecutive chunks share ~`overlap`
 * tokens of trailing lines so a passage split across a boundary stays retrievable.
 */
export function chunkText(text: string, opts: ChunkOptions): Chunk[] {
  if (typeof text !== "string" || text.trim().length === 0) return [];

  const maxChars = tokensToChars(opts.tokens);
  const overlapChars = Math.min(tokensToChars(Math.max(0, opts.overlap)), Math.floor(maxChars * 0.9));

  // Normalize newlines and split into lines; blank lines are kept so paragraph
  // structure survives in the emitted chunk text.
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentLen = 0;
  let index = 0;

  const flush = () => {
    const joined = current.join("\n").trim();
    if (joined.length > 0) {
      chunks.push({ text: joined, index });
      index += 1;
    }
  };

  for (const rawLine of lines) {
    // A single line longer than the budget is hard-split by character so we
    // never emit an oversized chunk.
    if (rawLine.length > maxChars) {
      if (currentLen > 0) {
        flush();
        const carried = carryOverlap(current, overlapChars);
        current = carried.lines;
        currentLen = carried.len;
      }
      for (let i = 0; i < rawLine.length; i += maxChars) {
        const slice = rawLine.slice(i, i + maxChars);
        chunks.push({ text: slice, index });
        index += 1;
      }
      continue;
    }

    const addLen = rawLine.length + 1; // +1 for the joining newline
    if (currentLen + addLen > maxChars && currentLen > 0) {
      flush();
      const carried = carryOverlap(current, overlapChars);
      current = carried.lines;
      currentLen = carried.len;
    }
    current.push(rawLine);
    currentLen += addLen;
  }

  flush();
  return chunks;
}

/**
 * From the tail of `lines`, gather the most recent lines whose combined length
 * is <= `overlapChars`. Returns them in original order to seed the next chunk.
 */
function carryOverlap(lines: string[], overlapChars: number): { lines: string[]; len: number } {
  if (overlapChars <= 0) return { lines: [], len: 0 };
  const carried: string[] = [];
  let len = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const addLen = lines[i].length + 1;
    if (len + addLen > overlapChars) break;
    carried.unshift(lines[i]);
    len += addLen;
  }
  return { lines: carried, len };
}
