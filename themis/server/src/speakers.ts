// Speaker timeline — find every line in every transcript in this matter
// where a given entity is the speaker. The transcript bodies are stored in
// the format "[HH:MM:SS]  NAME: text..." (AssemblyAI + the rename pass).
// We grep across all matter documents whose body matches the transcript
// shape, extract speaker-tagged lines, and filter to lines spoken by the
// queried entity (and their aliases).
//
// Each line carries its Bates id + start-seconds so the front-end can
// click-to-play the transcript player at the exact moment.

import type { DB } from "./db.js";
import { listDocuments } from "./repo.js";

export interface SpokenLine {
  docId: string;
  bates: string;
  docTitle: string;
  speaker: string;       // the name as it appears in the body (post-rename)
  timestampSeconds: number;
  timestamp: string;     // "HH:MM:SS"
  text: string;
}

const LINE_RE = /^\[(\d{2}):(\d{2}):(\d{2})\]\s+([^:]+?):\s*(.*)$/gm;

function norm(s: string): string {
  return s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

/** Return every line spoken by the given person (matched by canonical name
 * and any alias) across every transcript document in the matter. Sorted by
 * doc, then timestamp. */
export function listSpokenLines(
  db: DB,
  matterId: string,
  canonical: string,
  aliases: string[] = [],
  opts: { maxPerDoc?: number; max?: number } = {},
): SpokenLine[] {
  const names = new Set<string>([canonical, ...aliases].map(norm).filter(Boolean));
  if (names.size === 0) return [];

  const docs = listDocuments(db, matterId).filter((d) => /^\[\d{2}:\d{2}:\d{2}\]\s+\S/m.test(d.body));
  const out: SpokenLine[] = [];
  const maxPerDoc = opts.maxPerDoc ?? 500;
  const max = opts.max ?? 2000;

  for (const d of docs) {
    let pulled = 0;
    LINE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINE_RE.exec(d.body))) {
      const [, h, mm, s, sp, txt] = m;
      const spk = sp.trim();
      if (!names.has(norm(spk))) continue;
      const seconds = Number(h) * 3600 + Number(mm) * 60 + Number(s);
      out.push({
        docId: d.id,
        bates: d.bates,
        docTitle: d.title,
        speaker: spk,
        timestampSeconds: seconds,
        timestamp: `${h}:${mm}:${s}`,
        text: txt.trim(),
      });
      pulled++;
      if (pulled >= maxPerDoc) break;
      if (out.length >= max) return out;
    }
  }
  return out;
}
