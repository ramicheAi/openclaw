// Conflicts check — at intake, before signing a retainer, check whether any
// of the proposed parties / adverse parties / counsel appear in any OTHER
// matter's entity graph. Even a fuzzy hit is enough to pull the file and
// have a human resolve.
//
// Match algorithm mirrors analyze.ts's name normalization (lowercase, strip
// periods/commas, collapse whitespace) so "John A. Smith" hits "John Smith".
// We also try last-name-only hits when the input has 2+ tokens, since
// litigants commonly appear in opposing matters under variant forms.

import type { DB } from "./db.js";
import { listMatters } from "./repo.js";

export type ConflictStrength = "exact" | "fuzzy" | "last-name";

export interface ConflictHit {
  query: string;            // the input name as the operator typed it
  matched: string;          // the entity name as stored
  strength: ConflictStrength;
  matterId: string;
  matterName: string;
  matterClient: string;
  role: string;             // the entity's role in the matched matter
  org: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?|officer|deputy|d\/s|inv\.?|sgt\.?|det\.?)\s+/i, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lastNameOf(s: string): string | null {
  const tokens = norm(s).split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1];
  return last.length >= 4 ? last : null; // skip too-common short names
}

export function checkConflicts(
  db: DB,
  names: string[],
  options: { excludeMatterId?: string } = {},
): ConflictHit[] {
  const queries = names.map((n) => n.trim()).filter(Boolean);
  if (queries.length === 0) return [];

  const matters = listMatters(db).filter((m) => m.id !== options.excludeMatterId);
  if (matters.length === 0) return [];

  // One sweep across the entity table per query name, joined to matters.
  const stmt = db.prepare(
    `SELECT e.name AS name, e.role AS role, e.org AS org, e.matter_id AS matter_id
       FROM entities e
      WHERE e.matter_id != COALESCE(?, '')`,
  );
  const rows = stmt.all(options.excludeMatterId ?? "") as { name: string; role: string; org: string; matter_id: string }[];
  const byMatter = new Map(matters.map((m) => [m.id, m]));

  const hits: ConflictHit[] = [];
  for (const q of queries) {
    const qNorm = norm(q);
    const qLast = lastNameOf(q);
    if (!qNorm) continue;
    for (const row of rows) {
      const mat = byMatter.get(row.matter_id);
      if (!mat) continue;
      const rNorm = norm(row.name);
      let strength: ConflictStrength | null = null;
      if (rNorm === qNorm) strength = "exact";
      else if (rNorm.includes(qNorm) || qNorm.includes(rNorm)) strength = "fuzzy";
      else if (qLast && rNorm.split(/\s+/).includes(qLast)) strength = "last-name";
      if (!strength) continue;
      hits.push({
        query: q,
        matched: row.name,
        strength,
        matterId: mat.id,
        matterName: mat.name,
        matterClient: mat.client,
        role: row.role,
        org: row.org,
      });
    }
  }

  // Sort: exact > fuzzy > last-name, then by matter name.
  const rank = (s: ConflictStrength) => (s === "exact" ? 0 : s === "fuzzy" ? 1 : 2);
  hits.sort((a, b) => rank(a.strength) - rank(b.strength) || a.matterName.localeCompare(b.matterName));
  return hits;
}
