// Public Cite Check — the free wedge. No account required. Paste a brief,
// get every case-law citation verified against CourtListener. Fabricated
// authorities (status: not_found) are flagged with a red NOT FOUND chip.
//
// The funnel: visitor lands → pastes → sees the verdict → if any
// authorities are fabricated, the "save report" upsell fires; otherwise
// the "you used N/50 today" pill upsells unlimited at the bottom.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { cx } from "../lib/ui";
import { Tau } from "../components/BrandMark";
import type { AuthorityFinding, AuthorityVerdict } from "../types";

const SAMPLE = `Plaintiff was lawfully stopped when Defendant ran the red light. Courts have long held that running a red light is negligence per se. See Varghese v. China Southern Airlines Co., 925 F.3d 1339 (11th Cir. 2019); Martinez v. Delta Air Lines, 891 F.3d 1142 (9th Cir. 2018); Mata v. Avianca, Inc., 678 F. Supp. 3d 443 (S.D.N.Y. 2023).`;

interface PublicResult {
  ok: boolean;
  configured: boolean;
  error?: string;
  total: number;
  verified: number;
  ambiguous: number;
  notFound: number;
  findings: AuthorityFinding[];
  remainingToday: number;
  dailyLimit: number;
}

export function PublicCiteCheckScreen() {
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const check = useMutation({
    mutationFn: (t: string) => api.publicCiteCheck(t, email || undefined),
  });
  const result = check.data as PublicResult | undefined;
  const lead = useMutation({ mutationFn: (e: string) => api.publicSaveLead(e) });

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink"><Tau size={18} tone="ink" /></div>
            <span className="font-display text-[18px] font-semibold leading-none text-ink">Themis</span>
          </a>
          <nav className="flex items-center gap-4 text-[13px]">
            <a href="/pricing" className="text-ink-soft hover:text-ink">Pricing</a>
            <a href="/" className="rounded-md bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-paper">Sign in</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="text-center">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
            Free · No account · Public Cite Check
          </div>
          <h1 className="mt-2 font-display text-[34px] font-semibold leading-tight text-ink">
            Paste any brief. Catch every fabricated citation.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-soft">
            Themis runs every case citation in your draft through the CourtListener / Free Law Project
            database of published opinions. A well-formed citation that resolves to nothing is the
            fingerprint of an AI hallucination — the exact failure that sanctioned the lawyers in
            <em> Mata v. Avianca</em>. Don't be the next one.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(420px,1fr)_minmax(440px,1.1fr)]">
          {/* Paste */}
          <div className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brass-deep">Paste your draft</span>
              <button
                onClick={() => setText(SAMPLE)}
                className="rounded-md border border-line bg-paper px-2 py-1 text-[10.5px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep"
              >
                Paste sample
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a brief, motion, or memo here…"
              spellCheck={false}
              className="h-[420px] w-full resize-none bg-paper px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
            />
            <div className="flex items-center justify-between border-t border-line bg-surface px-4 py-2">
              <span className="text-[10.5px] text-ink-faint">{text.length.toLocaleString()} chars</span>
              <button
                onClick={() => check.mutate(text)}
                disabled={check.isPending || text.trim().length === 0}
                className="rounded-md bg-brass px-4 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
              >
                {check.isPending ? "Checking…" : "Verify authorities"}
              </button>
            </div>
          </div>

          {/* Report */}
          <div className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brass-deep">Report</span>
              {result && (
                <span className="font-mono text-[10px] text-ink-faint">
                  {result.remainingToday}/{result.dailyLimit} free checks left today
                </span>
              )}
            </div>
            <div className="min-h-[420px] px-4 py-4">
              {!result && !check.isPending && !check.error && <Empty />}
              {check.isPending && <div className="text-[12.5px] text-ink-soft">Verifying against CourtListener…</div>}
              {check.error && (
                <div className="rounded-md border border-flag/30 bg-flag-wash p-3 text-[12px] text-flag">
                  {check.error instanceof Error ? check.error.message : "Verification failed."}
                </div>
              )}
              {result && <Report result={result} email={email} setEmail={setEmail} lead={lead} />}
            </div>
          </div>
        </div>

        <UpsellStrip />
      </main>

      <footer className="mt-16 border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-6 text-[11px] text-ink-faint">
          Themis · Evidence Intelligence ·{" "}
          <a href="/pricing" className="text-ink-soft hover:text-ink">Pricing</a> ·{" "}
          <a href="/status" className="text-ink-soft hover:text-ink">Status</a> ·{" "}
          <a href="/" className="text-ink-soft hover:text-ink">App</a>
        </div>
      </footer>
    </div>
  );
}

function Empty() {
  return (
    <div className="text-center text-[12.5px] text-ink-soft">
      <p>
        Paste a draft on the left and click Verify. Every case citation gets
        checked in seconds; fabricated ones are flagged red so you can fix them
        before filing.
      </p>
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

function Report({
  result,
  email,
  setEmail,
  lead,
}: {
  result: PublicResult;
  email: string;
  setEmail: (s: string) => void;
  lead: ReturnType<typeof useLeadMutation>;
}) {
  const danger = result.notFound > 0;
  return (
    <div className="space-y-4">
      {danger ? (
        <div className="rounded-lg border border-danger/40 bg-danger-wash px-3.5 py-2.5 text-[12.5px] text-danger">
          <div className="font-semibold">
            {result.notFound} authorit{result.notFound === 1 ? "y" : "ies"} not found in CourtListener.
          </div>
          <div className="mt-0.5 text-[11.5px]">
            These citations are well-formed but match no published opinion. They're the signature of an AI
            hallucination — the same shape as the citations in <em>Mata v. Avianca</em>. Fix them before filing.
          </div>
        </div>
      ) : result.total > 0 ? (
        <div className="rounded-lg border border-verify/40 bg-verify-wash px-3.5 py-2.5 text-[12.5px] text-verify">
          <div className="font-semibold">All {result.total} authorities resolved.</div>
          <div className="mt-0.5 text-[11.5px]">No fabricated citations detected. Safe to file.</div>
        </div>
      ) : (
        <div className="text-[12.5px] text-ink-soft">No case-law citations detected in that text.</div>
      )}

      {result.findings.length > 0 && (
        <ul className="space-y-2">
          {result.findings.map((f, i) => {
            const v = VERDICT_STYLE[f.verdict];
            return (
              <li key={i} className="rounded-md border border-line bg-paper px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <code className="min-w-0 break-words font-mono text-[11.5px] text-ink">{f.citation}</code>
                  <span className={cx("shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider", v.cls)}>
                    {v.label}
                  </span>
                </div>
                {f.matches.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {f.matches.slice(0, 3).map((m, j) => (
                      <li key={j} className="text-[11px] text-ink-soft">
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
              </li>
            );
          })}
        </ul>
      )}

      {/* Lead capture — appears whenever there's a result */}
      <div className="rounded-lg border border-brass-soft bg-brass-wash p-4">
        <div className="font-display text-[14px] font-semibold text-brass-deep">
          Want this report saved & emailed to you?
        </div>
        <p className="mt-0.5 text-[11.5px] text-ink-soft">
          Free tier doesn't persist reports. Drop your email and we'll send this one + show you the
          paid features (Bates verification, matter chronology, deposition outlines).
        </p>
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) lead.mutate(email.trim());
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@firm.com"
            className="flex-1 rounded-md border border-line bg-paper px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-brass"
            required
          />
          <button
            type="submit"
            disabled={lead.isPending || !email.trim() || lead.isSuccess}
            className="rounded-md bg-brass px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-brass-deep disabled:opacity-50"
          >
            {lead.isSuccess ? "Sent ✓" : lead.isPending ? "Sending…" : "Email me"}
          </button>
        </form>
      </div>
    </div>
  );
}

function useLeadMutation() {
  // type helper for the prop signature above
  return useMutation({ mutationFn: (e: string) => api.publicSaveLead(e) });
}

function UpsellStrip() {
  return (
    <div className="mt-12 grid gap-4 lg:grid-cols-3">
      <Card
        title="Bates verification"
        body="Paid tiers add per-matter Bates verification — every (OLIV-000014, p.3) cite is checked against the actual document corpus you've uploaded, with entailment scoring."
      />
      <Card
        title="Hash-chained audit"
        body="Every accept, reject, draft, share — append-only, hash-linked, court-ready. Generate an AI-use certification (Rule 11 + Model Rule 1.1/3.3) in two clicks."
      />
      <Card
        title="The matter brain"
        body="Themis isn't a research tool. It's the layer that makes every other tool's output verifiable. Chronology, depo outlines, damages, drafts — all grounded in your case record."
      />
      <div className="text-center lg:col-span-3">
        <a
          href="/pricing"
          className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-paper hover:bg-ink/85"
        >
          See pricing →
        </a>
      </div>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="font-display text-[15px] font-semibold leading-snug text-ink">{title}</div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}
