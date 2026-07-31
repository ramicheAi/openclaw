// Themis Verified — public attestation page. Anyone with the hash can
// confirm what was checked, when, and by whom. No account needed.
// The badge URL travels with the filing's certification footer, so
// judges + opposing counsel can attest in one click.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tau } from "../components/BrandMark";
import { cx } from "../lib/ui";

interface BadgeData {
  hash: string;
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
}

export function VerifyBadgeScreen({ hash }: { hash: string }) {
  const verify = useQuery<BadgeData>({
    queryKey: ["verify-badge", hash],
    queryFn: async () => {
      const res = await fetch(`/api/public/verify/${encodeURIComponent(hash)}`);
      if (!res.ok) throw new Error(res.status === 410 ? "revoked" : res.status === 404 ? "not_found" : `error_${res.status}`);
      return res.json() as Promise<BadgeData>;
    },
    retry: false,
  });

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink"><Tau size={18} tone="ink" /></div>
            <span className="font-display text-[18px] font-semibold leading-none text-ink">Themis</span>
          </a>
          <nav className="flex items-center gap-4 text-[13px]">
            <a href="/cite-check" className="text-ink-soft hover:text-ink">Cite Check</a>
            <a href="/pricing" className="text-ink-soft hover:text-ink">Pricing</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="text-center">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brass-deep">
            Themis Verified · Public Attestation
          </div>
          <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight text-ink">
            Verify a Themis-certified filing
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-ink-soft">
            Every Themis AI-use certification publishes a public hash. Anyone with
            the URL can attest to what was checked, when, and by whom.
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface">
          {verify.isLoading ? (
            <div className="px-8 py-16 text-center text-[12.5px] text-ink-soft">Looking up attestation…</div>
          ) : verify.error ? (
            <Failed reason={verify.error instanceof Error ? verify.error.message : "error"} hash={hash} />
          ) : verify.data ? (
            <Attestation data={verify.data} />
          ) : null}
        </div>

        <Sidebar />
      </main>

      <footer className="mt-12 border-t border-line bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-6 text-center text-[11px] text-ink-faint">
          Themis · Evidence Intelligence · Verification is free · Try Cite Check at <a href="/cite-check" className="text-ink-soft hover:text-ink">/cite-check</a>
        </div>
      </footer>
    </div>
  );
}

function Failed({ reason, hash }: { reason: string; hash: string }) {
  const label =
    reason === "revoked" ? "This attestation has been revoked." :
    reason === "not_found" ? "This attestation hash isn't recognized." :
    "Could not look up this attestation.";
  return (
    <div className="px-8 py-14 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-danger-wash text-danger">✕</div>
      <h2 className="mt-3 font-display text-[18px] font-semibold leading-tight text-ink">{label}</h2>
      <p className="mt-2 text-[12.5px] text-ink-soft">
        Hash: <code className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px]">{hash}</code>
      </p>
      <p className="mt-3 text-[11.5px] text-ink-faint">
        Check that you copied the full hash from the filing. If the attestation has been revoked, contact the
        attorney who signed it for an updated certification.
      </p>
    </div>
  );
}

function EmbedSnippet({ hash }: { hash: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/verify/${hash}`;
  const svgUrl = `${origin}/api/public/verify/${hash}/badge.svg`;
  const html = `<a href="${url}" rel="noopener"><img src="${svgUrl}" alt="Themis Verified" height="64" /></a>`;
  const markdown = `[![Themis Verified](${svgUrl})](${url})`;
  const [copied, setCopied] = useState<null | "html" | "md">(null);
  function copy(kind: "html" | "md", text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  }
  return (
    <div className="mt-5 rounded-md border border-line bg-paper p-3">
      <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">
        Embed this badge
      </div>
      <div className="mt-2 flex items-center gap-3">
        <img src={svgUrl} alt="Themis Verified" height={64} className="rounded border border-line" />
        <p className="text-[11.5px] leading-relaxed text-ink-soft">
          Paste into an email signature, website footer, LinkedIn post, or PDF cover sheet.
          Clicking the badge always returns here.
        </p>
      </div>
      <div className="mt-3 space-y-1.5">
        <SnippetRow label="HTML" code={html} copied={copied === "html"} onCopy={() => copy("html", html)} />
        <SnippetRow label="Markdown" code={markdown} copied={copied === "md"} onCopy={() => copy("md", markdown)} />
      </div>
    </div>
  );
}

function SnippetRow({ label, code, copied, onCopy }: { label: string; code: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 w-[60px] shrink-0 font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">{label}</span>
      <code className="min-w-0 flex-1 break-all rounded border border-line bg-surface-sunken px-2 py-1.5 font-mono text-[10.5px] text-ink">{code}</code>
      <button
        onClick={onCopy}
        className="shrink-0 rounded-md border border-line bg-paper px-2 py-1 text-[10.5px] font-medium text-ink-soft hover:border-brass-soft hover:text-brass-deep"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Attestation({ data }: { data: BadgeData }) {
  const noFab = data.stats.authorities_not_found === 0 && data.stats.bates_not_in_matter === 0;
  return (
    <>
      <div className={cx("border-b px-8 py-5", noFab ? "border-verify/30 bg-verify-wash" : "border-flag/30 bg-flag-wash")}>
        <div className="flex items-center gap-3">
          <div className={cx("grid h-10 w-10 place-items-center rounded-full text-[22px] font-bold", noFab ? "bg-verify text-paper" : "bg-flag text-paper")}>
            {noFab ? "✓" : "!"}
          </div>
          <div>
            <div className={cx("font-display text-[18px] font-semibold leading-tight", noFab ? "text-verify" : "text-flag")}>
              {noFab ? "Verified · No fabricated citations" : "Verification recorded · with notes"}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-soft">
              Issued {new Date(data.signedAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <Row label="Matter">{data.matterName}</Row>
        <Row label="Client">{data.client || "—"}</Row>
        <Row label="Filing">{data.filing}</Row>
        {data.jurisdiction && <Row label="Jurisdiction">{data.jurisdiction}</Row>}
        {data.signer && (
          <Row label="Signed by">
            {data.signer}
            {data.barNumber && <span className="ml-1 text-ink-soft">· Bar No. {data.barNumber}</span>}
          </Row>
        )}

        <div className="mt-5 grid grid-cols-5 gap-2 rounded-lg border border-line bg-paper p-3 text-center">
          <Stat label="Runs" v={data.stats.cite_check_runs} />
          <Stat label="Auth verified" v={data.stats.authorities_verified} />
          <Stat label="Auth not found" v={data.stats.authorities_not_found} tone={data.stats.authorities_not_found > 0 ? "danger" : "verify"} />
          <Stat label="Bates verified" v={data.stats.bates_verified} />
          <Stat label="Bates unresolved" v={data.stats.bates_not_in_matter} tone={data.stats.bates_not_in_matter > 0 ? "danger" : "verify"} />
        </div>

        <div className="mt-5 rounded-md border border-line bg-paper p-3">
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">
            Audit chain anchor
          </div>
          <div className="mt-1 font-mono text-[10.5px] text-ink-soft break-all">{data.auditAnchor || "(no entries at sign time)"}</div>
          <div className="mt-1.5 text-[10.5px] text-ink-faint">
            The matter's hash chain at the moment of signing. Any post-sign tamper to the matter's audit
            log would invalidate this anchor.
          </div>
        </div>

        <EmbedSnippet hash={data.hash} />

        <div className="mt-5 rounded-md border border-brass-soft bg-brass-wash p-3 text-[11.5px] text-ink">
          <div className="font-semibold text-brass-deep">What this means</div>
          <p className="mt-1 leading-relaxed">
            Themis verified every case citation against the CourtListener / Free Law Project published-opinion
            database, and every Bates citation against the matter's document corpus. Under Rule 11 of the FRCP
            and Model Rules of Professional Conduct 1.1 + 3.3, the signer attested under their license that the
            filing contains no fabricated authorities to the best of their knowledge.
          </p>
        </div>
      </div>
    </>
  );
}

function Stat({ label, v, tone }: { label: string; v: number; tone?: "danger" | "verify" }) {
  return (
    <div>
      <div className={cx("font-display text-[18px] font-semibold leading-none", tone === "danger" ? "text-danger" : tone === "verify" ? "text-verify" : "text-ink")}>
        {v.toLocaleString()}
      </div>
      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">{label}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-baseline gap-3 py-1 text-[13px]">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{label}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-2">
      <a
        href="/cite-check"
        className="block rounded-lg border border-line bg-surface p-4 hover:border-brass-soft"
      >
        <div className="font-display text-[15px] font-semibold leading-snug text-ink">Try free Cite Check →</div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
          Paste any brief. Themis verifies every case citation against CourtListener — no account needed.
        </p>
      </a>
      <a
        href="/pricing"
        className="block rounded-lg border border-line bg-surface p-4 hover:border-brass-soft"
      >
        <div className="font-display text-[15px] font-semibold leading-snug text-ink">Subscribe →</div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
          Solo to Enterprise. Get matter-scoped Bates verification, hash-chained audit, the works.
        </p>
      </a>
    </div>
  );
}
