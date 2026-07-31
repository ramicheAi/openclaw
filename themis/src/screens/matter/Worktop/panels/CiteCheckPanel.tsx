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
import { IconVerified, IconCite, IconExport, IconCopy, IconClose } from "../../../../icons";
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
          {result && <Report result={result} text={text} matterId={matterId} />}
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

function Report({ result, text, matterId }: { result: VerifyResult; text: string; matterId: string }) {
  const { bates, authorities } = result;
  const fabricated = authorities.findings.filter((f) => f.verdict === "not_found");
  const unresolvedBates = bates.findings.filter((f) => !f.existed);
  const clean = fabricated.length === 0 && unresolvedBates.length === 0 && (bates.total > 0 || authorities.total > 0);
  const [certifying, setCertifying] = useState(false);

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

      {/* Generate AI-use certification — available once a check has run */}
      {clean && (
        <div className="rounded-lg border border-line bg-surface px-3.5 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">Court-ready</div>
              <div className="mt-0.5 text-[12.5px] text-ink">
                Generate an AI-use certification from this matter's actual verification history.
              </div>
              <div className="mt-0.5 text-[11px] text-ink-soft">
                Required by N.D. Ill., E.D. Pa., S.D. Fla., and a growing list of courts. Signed under Rule 11 + Model Rule 1.1/3.3.
              </div>
            </div>
            <button
              onClick={() => setCertifying(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-brass bg-brass px-3 py-1.5 text-[12px] font-semibold text-paper hover:bg-brass-deep"
            >
              <IconExport size={12} /> Generate certification
            </button>
          </div>
        </div>
      )}
      {certifying && <CertificationModal matterId={matterId} onClose={() => setCertifying(false)} />}

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

function CertificationModal({ matterId, onClose }: { matterId: string; onClose: () => void }) {
  const [filing, setFiling] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [signer, setSigner] = useState("");
  const [barNumber, setBarNumber] = useState("");
  const gen = useMutation({
    mutationFn: () => api.generateCertification(matterId, { filing, jurisdiction, signer, barNumber }),
  });
  const text = gen.data?.text;
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }
  function download() {
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-certification.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 py-10">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[720px] max-w-full flex-col overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
      >
        <header className="flex items-start justify-between border-b border-line bg-surface-sunken px-5 py-4">
          <div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-brass-deep">Court-ready</div>
            <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-tight text-ink">AI-use certification</h3>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              Generated from the matter's actual Cite Check audit trail — every number comes from a real verification run.
            </p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-ink-soft hover:bg-surface hover:text-ink">
            <IconClose size={14} />
          </button>
        </header>

        {!text && (
          <div className="space-y-3 px-5 py-4">
            <CertField label="Filing covered *" hint="e.g. Plaintiff's Demand Letter dated 2026-06-07">
              <input
                value={filing}
                onChange={(e) => setFiling(e.target.value)}
                placeholder="Plaintiff's Demand Letter"
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </CertField>
            <div className="grid grid-cols-2 gap-3">
              <CertField label="Jurisdiction (optional)">
                <input
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  placeholder="N.D. Ill."
                  className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
                />
              </CertField>
              <CertField label="Signer (optional)">
                <input
                  value={signer}
                  onChange={(e) => setSigner(e.target.value)}
                  placeholder="defaults to lead attorney"
                  className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
                />
              </CertField>
            </div>
            <CertField label="Bar number (optional)">
              <input
                value={barNumber}
                onChange={(e) => setBarNumber(e.target.value)}
                placeholder="e.g. 1234567"
                className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
              />
            </CertField>
            {gen.error && (
              <div className="rounded-md border border-flag/30 bg-flag-wash p-2 text-[11.5px] text-flag">
                {gen.error instanceof Error ? gen.error.message : "Generation failed."}
              </div>
            )}
          </div>
        )}

        {text && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-5 gap-2 rounded-md border border-line bg-surface-sunken p-2 text-center text-[10.5px]">
              <CertStat label="Runs" v={gen.data!.stats.cite_check_runs} />
              <CertStat label="Auth verified" v={gen.data!.stats.authorities_verified} />
              <CertStat label="Auth not found" v={gen.data!.stats.authorities_not_found} accent={gen.data!.stats.authorities_not_found > 0 ? "danger" : "verify"} />
              <CertStat label="Bates verified" v={gen.data!.stats.bates_verified} />
              <CertStat label="Bates unresolved" v={gen.data!.stats.bates_not_in_matter} accent={gen.data!.stats.bates_not_in_matter > 0 ? "danger" : "verify"} />
            </div>
            <pre className="mt-3 max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-paper px-4 py-3 font-mono text-[11.5px] leading-relaxed text-ink">
              {text}
            </pre>
          </div>
        )}

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink">
            Close
          </button>
          {text ? (
            <>
              <button onClick={download} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep">
                <IconExport size={12} /> Download
              </button>
              <button onClick={copy} className="inline-flex items-center gap-1 rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep">
                <IconCopy size={12} /> {copied ? "Copied" : "Copy"}
              </button>
            </>
          ) : (
            <button
              onClick={() => gen.mutate()}
              disabled={!filing.trim() || gen.isPending}
              className="rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
            >
              {gen.isPending ? "Generating…" : "Generate"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function CertStat({ label, v, accent }: { label: string; v: number; accent?: "danger" | "verify" }) {
  return (
    <div>
      <div className={cx(
        "font-display text-[18px] font-semibold leading-none",
        accent === "danger" ? "text-danger" : accent === "verify" ? "text-verify" : "text-ink",
      )}>
        {v.toLocaleString()}
      </div>
      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">{label}</div>
    </div>
  );
}

function CertField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-0.5 text-[10px] text-ink-faint">{hint}</div>}
    </label>
  );
}
