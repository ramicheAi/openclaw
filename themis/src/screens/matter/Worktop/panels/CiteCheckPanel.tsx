// Cite Check — the Mata v. Avianca shield. Paste a draft brief or motion;
// Themis verifies every citation in it:
//   - Bates citations (OLIV-000014, p.3) against this matter's corpus
//   - Legal authorities (Varghese v. China Southern, 925 F.3d 1339) against
//     CourtListener's published-opinion database
// A "not found" authority is the fingerprint of an AI hallucination — the
// thing that got the Mata lawyers sanctioned. We surface it loudly.

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../../../lib/api";
import { cx } from "../../../../lib/ui";
import { IconVerified, IconCite } from "../../../../icons";
import type { AuthorityFinding, AuthorityVerdict, BatesFinding, VerifyResult } from "../../../../types";
import { PanelHead, PanelAction } from "./PanelHead";

const SAMPLE = `Plaintiff was lawfully stopped when Defendant ran the red light (OLIV-000014, p.1). Courts have long held that running a red light is negligence per se. See Varghese v. China Southern Airlines Co., 925 F.3d 1339 (11th Cir. 2019); Martinez v. Delta Air Lines, 891 F.3d 1142 (9th Cir. 2018).`;

export function CiteCheckPanel({ matterId }: { matterId: string }) {
  const [text, setText] = useState("");
  const [clConfigured, setClConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    api.getVerifyStatus().then((r) => setClConfigured(r.courtListenerConfigured)).catch(() => setClConfigured(null));
  }, []);

  const verify = useMutation({
    mutationFn: (t: string) => api.verifyDraft(matterId, t),
  });

  const result = verify.data;

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <PanelHead
        eyebrow="Cite Check · Mata shield"
        title="Verify every citation before you file"
        sub="Paste a draft brief or motion. Themis checks Bates cites against this matter's corpus and legal authorities against CourtListener's published-opinion database. Fabricated authorities are the fingerprint of an AI hallucination."
        actions={
          <>
            <PanelAction onClick={() => setText(SAMPLE)} disabled={verify.isPending}>
              Paste sample
            </PanelAction>
            <PanelAction primary onClick={() => verify.mutate(text)} disabled={verify.isPending || text.trim().length === 0}>
              <IconCite size={13} /> {verify.isPending ? "Checking…" : "Run check"}
            </PanelAction>
          </>
        }
      />

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "minmax(420px, 1fr) minmax(440px, 1.1fr)" }}>
        {/* Left: the draft */}
        <div className="flex min-h-0 flex-col border-r border-line">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your draft brief, motion, or memo here…"
            spellCheck={false}
            className="min-h-0 flex-1 resize-none bg-paper px-6 py-5 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
          />
          <div className="flex items-center justify-between border-t border-line bg-surface px-6 py-2 text-[10.5px] text-ink-faint">
            <span>{text.length.toLocaleString()} chars</span>
            <span>
              CourtListener:{" "}
              {clConfigured === null ? (
                "—"
              ) : clConfigured ? (
                <span className="text-verify">token configured</span>
              ) : (
                <span className="text-flag">anonymous (rate-limited)</span>
              )}
            </span>
          </div>
        </div>

        {/* Right: the report */}
        <div className="min-h-0 overflow-y-auto bg-surface px-6 py-5">
          {!result && !verify.isPending && !verify.error && (
            <EmptyReport clConfigured={clConfigured} />
          )}
          {verify.isPending && (
            <div className="grid h-40 place-items-center text-[12.5px] text-ink-soft">
              Verifying citations…
            </div>
          )}
          {verify.error && (
            <div className="rounded-md border border-flag/30 bg-flag-wash p-3 text-[12px] text-flag">
              {verify.error instanceof Error ? verify.error.message : "Verification failed."}
            </div>
          )}
          {result && <Report result={result} text={text} />}
        </div>
      </div>
    </div>
  );
}

function EmptyReport({ clConfigured }: { clConfigured: boolean | null }) {
  return (
    <div className="mx-auto mt-10 max-w-md text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brass-wash text-brass-deep">
        <IconVerified size={22} />
      </div>
      <h3 className="mt-3 font-display text-[16px] font-semibold text-ink">Nothing checked yet</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
        Paste a draft on the left and run the check. Every Bates citation is
        verified against this matter's documents; every case citation is looked
        up in CourtListener's database of published opinions.
      </p>
      {clConfigured === false && (
        <p className="mx-auto mt-3 max-w-sm rounded-md border border-flag/30 bg-flag-wash p-2 text-[11px] text-flag">
          Tip: set COURTLISTENER_API_TOKEN on the server (free at
          courtlistener.com/profile/api) to raise the authority-check rate limit.
          Anonymous checks still work but throttle after a few requests.
        </p>
      )}
    </div>
  );
}

function Report({ result, text }: { result: VerifyResult; text: string }) {
  const { bates, authorities } = result;
  const fabricated = authorities.findings.filter((f) => f.verdict === "not_found");
  const unresolvedBates = bates.findings.filter((f) => !f.existed);
  const clean = fabricated.length === 0 && unresolvedBates.length === 0 && (bates.total > 0 || authorities.total > 0);

  return (
    <div className="space-y-5">
      {/* Verdict banner */}
      {clean ? (
        <div className="flex items-center gap-2 rounded-lg border border-verify/40 bg-verify-wash px-3.5 py-2.5 text-[12.5px] text-verify">
          <IconVerified size={16} />
          <span className="font-medium">All citations resolved. No fabricated authorities or missing Bates cites detected.</span>
        </div>
      ) : (fabricated.length > 0 || unresolvedBates.length > 0) ? (
        <div className="rounded-lg border border-danger/40 bg-danger-wash px-3.5 py-2.5 text-[12.5px] text-danger">
          <div className="font-semibold">
            {fabricated.length > 0 && `${fabricated.length} authorit${fabricated.length === 1 ? "y" : "ies"} not found in CourtListener`}
            {fabricated.length > 0 && unresolvedBates.length > 0 && " · "}
            {unresolvedBates.length > 0 && `${unresolvedBates.length} Bates cite${unresolvedBates.length === 1 ? "" : "s"} not in this matter`}
          </div>
          <div className="mt-0.5 text-[11.5px] text-danger/90">
            Do not file until these are resolved. A citation that resolves to nothing is the signature of an AI hallucination.
          </div>
        </div>
      ) : null}

      {/* Authorities */}
      <section>
        <SectionHeader label="Legal authorities" count={authorities.total} />
        {!authorities.ok ? (
          <div className="rounded-md border border-flag/30 bg-flag-wash p-2.5 text-[11.5px] text-flag">
            {authorities.error ?? "Authority check did not run."} The Bates check below still ran.
          </div>
        ) : authorities.total === 0 ? (
          <div className="text-[12px] text-ink-faint">No case-law citations detected in the draft.</div>
        ) : (
          <ul className="space-y-2">
            {authorities.findings.map((f, i) => (
              <AuthorityRow key={i} f={f} />
            ))}
          </ul>
        )}
      </section>

      {/* Bates */}
      <section>
        <SectionHeader label="Bates citations" count={bates.total} />
        {bates.total === 0 ? (
          <div className="text-[12px] text-ink-faint">No Bates citations detected in the draft.</div>
        ) : (
          <ul className="space-y-2">
            {bates.findings.map((f, i) => (
              <BatesRow key={i} f={f} />
            ))}
          </ul>
        )}
      </section>

      {/* Citation count callout — useful as a defensibility note */}
      <div className="border-t border-line pt-3 text-[10.5px] text-ink-faint">
        Checked {(bates.total + authorities.total).toLocaleString()} citation
        {bates.total + authorities.total === 1 ? "" : "s"} across {text.length.toLocaleString()} characters.
        This run is recorded in the matter audit trail.
      </div>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brass-deep">{label}</h3>
      <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 font-mono text-[9.5px] text-ink-soft">{count}</span>
    </div>
  );
}

const VERDICT_STYLE: Record<AuthorityVerdict, { label: string; cls: string }> = {
  verified: { label: "VERIFIED", cls: "border-verify/40 bg-verify-wash text-verify" },
  ambiguous: { label: "AMBIGUOUS", cls: "border-flag/40 bg-flag-wash text-flag" },
  not_found: { label: "NOT FOUND", cls: "border-danger/40 bg-danger-wash text-danger" },
  malformed: { label: "UNPARSEABLE", cls: "border-line bg-surface-sunken text-ink-soft" },
  rate_limited: { label: "RATE LIMITED", cls: "border-flag/40 bg-flag-wash text-flag" },
  unverified: { label: "UNVERIFIED", cls: "border-line bg-surface-sunken text-ink-soft" },
};

function AuthorityRow({ f }: { f: AuthorityFinding }) {
  const v = VERDICT_STYLE[f.verdict];
  return (
    <li className="rounded-md border border-line bg-paper px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <code className="min-w-0 break-words font-mono text-[11.5px] text-ink">{f.citation}</code>
        <span className={cx("shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider", v.cls)}>
          {v.label}
        </span>
      </div>
      {f.matches.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {f.matches.slice(0, 3).map((m, i) => (
            <li key={i} className="text-[11px] text-ink-soft">
              <a href={m.url} target="_blank" rel="noreferrer" className="text-info hover:underline">
                {m.caseName}
              </a>
              {m.dateFiled && <span className="text-ink-faint"> · {m.dateFiled.slice(0, 4)}</span>}
              {typeof m.citationCount === "number" && (
                <span className="text-ink-faint"> · cited by {m.citationCount.toLocaleString()}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {f.verdict === "not_found" && (
        <div className="mt-1 text-[10.5px] text-danger">
          This citation is well-formed but matches no published opinion. Verify the reporter, volume, and page — or remove it.
        </div>
      )}
    </li>
  );
}

function BatesRow({ f }: { f: BatesFinding }) {
  const status = !f.existed
    ? { label: "NOT IN MATTER", cls: "border-danger/40 bg-danger-wash text-danger" }
    : f.entailed
      ? { label: "SUPPORTED", cls: "border-verify/40 bg-verify-wash text-verify" }
      : { label: "WEAK SUPPORT", cls: "border-flag/40 bg-flag-wash text-flag" };
  return (
    <li className="rounded-md border border-line bg-paper px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <code className="font-mono text-[11.5px] text-ink">
            {f.bates}, p.{f.page}
          </code>
          {f.title && <span className="truncate text-[11px] text-ink-soft">{f.title}</span>}
        </div>
        <span className={cx("shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider", status.cls)}>
          {status.label}
        </span>
      </div>
      {f.existed && (
        <div className="mt-1 text-[10.5px] text-ink-faint">
          Support score {(f.supportScore * 100).toFixed(0)}%
          {f.privilege && f.privilege !== "none" && (
            <span className="ml-2 text-flag">· privilege: {f.privilege}</span>
          )}
        </div>
      )}
      {!f.existed && (
        <div className="mt-1 text-[10.5px] text-danger">
          No document with this Bates id in this matter. Check the number or confirm it was produced.
        </div>
      )}
    </li>
  );
}
