// Themis Verified — public attestation hashes for any Cite Check
// certification. Each successful certification gets a url-safe hash; a
// judge's clerk or opposing counsel can paste it at
// /verify/<hash> and see what was verified, when, by whom, what
// authorities + Bates cites resolved, and the matter's audit-chain
// anchor at the moment of signing.
//
// The hash is the public moat: make verification a courthouse expectation,
// not a private firm-side feature. Free to verify; the verification work
// itself requires a Themis seat to produce.

import { randomBytes } from "node:crypto";
import type { DB } from "./db.js";

export interface VerifiedCertification {
  hash: string;
  matterId: string;
  matterName: string;
  client: string;
  filing: string;
  jurisdiction?: string;
  signer?: string;
  barNumber?: string;
  stats: {
    cite_check_runs: number;
    authorities_verified: number;
    authorities_not_found: number;
    bates_verified: number;
    bates_not_in_matter: number;
    last_run?: string;
  };
  signedAt: string;
  auditAnchor: string;
  revoked: boolean;
}

function row(r: Record<string, unknown>): VerifiedCertification {
  let stats: VerifiedCertification["stats"] = {
    cite_check_runs: 0,
    authorities_verified: 0,
    authorities_not_found: 0,
    bates_verified: 0,
    bates_not_in_matter: 0,
  };
  try {
    stats = JSON.parse((r.stats_json as string) ?? "{}") as typeof stats;
  } catch { /* leave defaults */ }
  return {
    hash: r.hash as string,
    matterId: r.matter_id as string,
    matterName: r.matter_name as string,
    client: r.client as string,
    filing: r.filing as string,
    jurisdiction: (r.jurisdiction as string | null) ?? undefined,
    signer: (r.signer as string | null) ?? undefined,
    barNumber: (r.bar_number as string | null) ?? undefined,
    stats,
    signedAt: r.signed_at as string,
    auditAnchor: r.audit_anchor as string,
    revoked: !!r.revoked,
  };
}

export function createVerifiedCertification(
  db: DB,
  input: {
    matterId: string;
    matterName: string;
    client: string;
    filing: string;
    jurisdiction?: string;
    signer?: string;
    barNumber?: string;
    stats: VerifiedCertification["stats"];
  },
): VerifiedCertification {
  const hash = randomBytes(15).toString("base64url"); // ~20 chars, url-safe, no padding
  const now = new Date().toISOString();
  // Pull the matter's most recent audit-chain hash as the anchor. Empty
  // string if there's nothing yet (shouldn't happen since matter.create
  // is the first entry, but defensive).
  const anchorRow = db
    .prepare(`SELECT entry_hash FROM audit_log WHERE matter_id = ? ORDER BY id DESC LIMIT 1`)
    .get(input.matterId) as { entry_hash: string } | undefined;
  const anchor = anchorRow?.entry_hash ?? "";
  db.prepare(
    `INSERT INTO verified_certifications
      (hash, matter_id, matter_name, client, filing, jurisdiction, signer, bar_number, stats_json, signed_at, audit_anchor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    hash,
    input.matterId,
    input.matterName,
    input.client,
    input.filing,
    input.jurisdiction ?? null,
    input.signer ?? null,
    input.barNumber ?? null,
    JSON.stringify(input.stats),
    now,
    anchor,
  );
  return {
    hash,
    matterId: input.matterId,
    matterName: input.matterName,
    client: input.client,
    filing: input.filing,
    jurisdiction: input.jurisdiction,
    signer: input.signer,
    barNumber: input.barNumber,
    stats: input.stats,
    signedAt: now,
    auditAnchor: anchor,
    revoked: false,
  };
}

export function getVerifiedByHash(db: DB, hash: string): VerifiedCertification | null {
  const r = db.prepare(`SELECT * FROM verified_certifications WHERE hash = ?`).get(hash) as Record<string, unknown> | undefined;
  return r ? row(r) : null;
}

export function revokeVerified(db: DB, hash: string, matterId: string): boolean {
  return db.prepare(`UPDATE verified_certifications SET revoked = 1 WHERE hash = ? AND matter_id = ?`).run(hash, matterId).changes > 0;
}

export function listVerifiedForMatter(db: DB, matterId: string): VerifiedCertification[] {
  return (
    db.prepare(`SELECT * FROM verified_certifications WHERE matter_id = ? ORDER BY signed_at DESC`).all(matterId) as Record<string, unknown>[]
  ).map(row);
}
