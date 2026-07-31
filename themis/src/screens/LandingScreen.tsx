// Public marketing landing — what an unauthenticated visitor sees at /.
// Hero with the Mata-shield positioning, three feature cards, social
// proof slot, and CTAs to /cite-check (free wedge) + /pricing.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Tau } from "../components/BrandMark";
import { cx } from "../lib/ui";

export function LandingScreen() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Top bar */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-ink"><Tau size={20} tone="ink" /></div>
            <span className="font-display text-[20px] font-semibold leading-none text-ink">Themis</span>
          </a>
          <nav className="flex items-center gap-5 text-[13px]">
            <a href="/cite-check" className="text-ink-soft hover:text-ink">Try free</a>
            <a href="/pricing" className="text-ink-soft hover:text-ink">Pricing</a>
            <a href="/status" className="text-ink-soft hover:text-ink">Status</a>
            <a
              href="/login"
              className="rounded-md bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-ink/85"
            >
              Sign in →
            </a>
          </nav>
        </div>
      </header>

      <main>
        <Hero />
        <Logos />
        <FeatureGrid />
        <BeforeAfter />
        <BottomCta />
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-[11px] text-ink-faint">
          <span>Themis · Evidence Intelligence · Built for litigation paralegals + attorneys</span>
          <nav className="flex items-center gap-4">
            <a href="/cite-check" className="text-ink-soft hover:text-ink">Cite Check</a>
            <a href="/pricing" className="text-ink-soft hover:text-ink">Pricing</a>
            <a href="/status" className="text-ink-soft hover:text-ink">Status</a>
            <a href="mailto:hello@themis.law" className="text-ink-soft hover:text-ink">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <section className="border-b border-line bg-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brass-deep">
            Themis · Evidence Intelligence
          </div>
          <h1 className="mt-3 font-display text-[40px] font-semibold leading-[1.05] tracking-tight text-ink lg:text-[52px]">
            Verifiable AI for litigation.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Every citation grounded. Every authority CourtListener-verified. Every
            action hash-chained. Post-<em>Mata v. Avianca</em>, "verifiable" is the
            only category that matters — and it's the only one Themis is in.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="/cite-check"
              className="inline-flex items-center gap-1.5 rounded-md bg-brass px-4 py-2.5 text-[14px] font-semibold text-paper hover:bg-brass-deep"
            >
              Try free Cite Check →
            </a>
            <a
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-4 py-2.5 text-[14px] font-semibold text-ink hover:border-brass-soft hover:text-brass-deep"
            >
              See pricing
            </a>
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-faint">No credit card</span>
          </div>
          <EarlyAccess />
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

function EarlyAccess() {
  const [email, setEmail] = useState("");
  const lead = useMutation({ mutationFn: (e: string) => api.publicSaveLead(e) });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) lead.mutate(email.trim());
      }}
      className="mt-8 max-w-md"
    >
      <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">
        Want a guided onboarding?
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-surface p-1">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.com"
          className="flex-1 bg-transparent px-3 py-1.5 text-[13.5px] text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          type="submit"
          disabled={lead.isPending || lead.isSuccess || !email.trim()}
          className="rounded-md bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-paper hover:bg-ink/85 disabled:opacity-50"
        >
          {lead.isSuccess ? "Got it ✓" : lead.isPending ? "Sending…" : "Request"}
        </button>
      </div>
      <p className="mt-1.5 text-[10.5px] text-ink-faint">
        We'll reach out within 24 hours. No spam, no sales calls without permission.
      </p>
    </form>
  );
}

function HeroVisual() {
  // A still mock of the Themis verdict surface — three citation rows: one
  // VERIFIED, one AMBIGUOUS, one NOT FOUND (the Mata hit). Communicates the
  // product in a glance.
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-[0_40px_120px_-40px_rgba(31,26,20,0.25)]">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-brass-deep">Cite Check</div>
          <div className="mt-0.5 font-display text-[14px] font-semibold text-ink">Verifying brief authorities…</div>
        </div>
        <div className="rounded-full border border-verify/30 bg-verify-wash px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-verify">
          1 of 1 verified
        </div>
      </div>
      <ul className="mt-3 space-y-2.5">
        <CiteRow citation="Mata v. Avianca, Inc., 678 F. Supp. 3d 443 (S.D.N.Y. 2023)" verdict="VERIFIED" tone="verify" detail="Real case · cited by 9,123 later opinions" />
        <CiteRow citation="Varghese v. China Southern Airlines, 925 F.3d 1339 (11th Cir. 2019)" verdict="NOT FOUND" tone="danger" detail="Well-formed cite resolves to nothing — fabricated" />
        <CiteRow citation="OLIV-000014, p. 3" verdict="SUPPORTED" tone="verify" detail="Bates resolves · support 92% · entailed" />
      </ul>
      <div className="mt-4 rounded-md border border-flag/30 bg-flag-wash p-2.5 text-[11px] text-flag">
        <strong>Don't file:</strong> 1 fabricated authority detected. Fix or remove before serving.
      </div>
    </div>
  );
}

function CiteRow({ citation, verdict, tone, detail }: { citation: string; verdict: string; tone: "verify" | "danger" | "flag"; detail: string }) {
  const toneCls =
    tone === "verify" ? "border-verify/40 bg-verify-wash text-verify" :
    tone === "danger" ? "border-danger/40 bg-danger-wash text-danger" :
    "border-flag/40 bg-flag-wash text-flag";
  return (
    <li className="rounded-md border border-line bg-paper px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <code className="min-w-0 break-words font-mono text-[11px] text-ink">{citation}</code>
        <span className={cx("shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider", toneCls)}>
          {verdict}
        </span>
      </div>
      <div className="mt-1 text-[10.5px] text-ink-soft">{detail}</div>
    </li>
  );
}

function Logos() {
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-8 text-center">
        <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
          Built on standards courts already trust
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[12px] text-ink-soft">
          <span className="font-display font-semibold">CourtListener</span>
          <span className="text-ink-faint">·</span>
          <span className="font-display font-semibold">Free Law Project</span>
          <span className="text-ink-faint">·</span>
          <span className="font-display font-semibold">Anthropic Claude</span>
          <span className="text-ink-faint">·</span>
          <span className="font-display font-semibold">Resend</span>
          <span className="text-ink-faint">·</span>
          <span className="font-display font-semibold">Stripe</span>
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  const features = [
    {
      title: "Cite Check (Mata shield)",
      blurb:
        "Paste any draft. Every case citation gets checked against CourtListener; every Bates against your matter corpus. Fabricated cites are flagged before you file — never after a Rule 11 hearing.",
      hash: "⌘6",
    },
    {
      title: "Hash-chained audit trail",
      blurb:
        "Every accept, reject, share, certify is appended to a per-matter hash chain. Tamper a single row and Themis surfaces the broken link with the offending row id. Court-ready by construction.",
      hash: "Audit Log",
    },
    {
      title: "Themis Verified public badge",
      blurb:
        "Every certification mints a public hash. Judges and opposing counsel paste it at themis.law/verify/<hash> to attest in one click. Make verification a courthouse expectation.",
      hash: "/verify/<hash>",
    },
    {
      title: "Draft Studio",
      blurb:
        "Generate demand letters, complaints, motions, settlement statements from your chronology + theory. Every factual sentence carries an inline Bates citation. Authority slots are placeholders, never fabrications.",
      hash: "⌘7",
    },
    {
      title: "Damages model",
      blurb:
        "Itemize medicals + lost wages + future care + pain & suffering with multipliers. Anchor each line to a Bates doc. Flows directly into the settlement statement and demand letter drafts.",
      hash: "⌘8",
    },
    {
      title: "Deposition outline builder",
      blurb:
        "Click any witness in their dossier. Themis assembles an ordered examination outline (foundation → substance → impeachment) from the chronology + documents that witness touches.",
      hash: "Entity dossier",
    },
  ];
  return (
    <section className="border-b border-line bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brass-deep">
            What it does
          </div>
          <h2 className="mt-2 font-display text-[28px] font-semibold leading-tight text-ink">
            Six surfaces. One source of truth.
          </h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article key={f.title} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-[16px] font-semibold leading-snug text-ink">{f.title}</h3>
                <span className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[9.5px] text-ink-soft">
                  {f.hash}
                </span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{f.blurb}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function BeforeAfter() {
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brass-deep">
            Before / after
          </div>
          <h2 className="mt-2 font-display text-[28px] font-semibold leading-tight text-ink">
            What a 5-attorney plaintiff firm recovers in a year
          </h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Stat
            value="$250k"
            label="Recovered billable time"
            sub="5 attorneys × 200 hrs/yr drafting saved × $250/hr"
          />
          <Stat
            value="3-4×"
            label="Paralegal throughput"
            sub="Depo outlines that took 4hrs now take 30 min"
          />
          <Stat
            value="$20-50k"
            label="Avoided per malpractice incident"
            sub="Mata-shape sanctions average per case · 1k+ documented cases as of 2026"
          />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-6 text-center">
      <div className="font-display text-[36px] font-semibold leading-none text-brass-deep">{value}</div>
      <div className="mt-2 text-[14px] font-semibold text-ink">{label}</div>
      <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink-soft">{sub}</div>
    </div>
  );
}

function BottomCta() {
  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="font-display text-[30px] font-semibold leading-tight text-ink">
          Don't be the next <em>Mata v. Avianca</em>.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-ink-soft">
          Drop a draft into Cite Check before you file. Or spin up a full matter with all the
          trust primitives — chronology, depo outlines, damages, verified citations, hash-chained
          audit, court-ready certification — for less than a quarter of one Westlaw seat.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/cite-check"
            className="inline-flex items-center gap-1.5 rounded-md bg-brass px-4 py-2.5 text-[14px] font-semibold text-paper hover:bg-brass-deep"
          >
            Try free Cite Check →
          </a>
          <a
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-4 py-2.5 text-[14px] font-semibold text-ink hover:border-brass-soft hover:text-brass-deep"
          >
            See pricing
          </a>
        </div>
      </div>
    </section>
  );
}
