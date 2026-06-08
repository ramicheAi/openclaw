// OnboardingTour — first-run guided walkthrough. Per design brief sprint 3
// ("Onboarding tour"). Six short steps that lead the user through the trust
// thesis on a real seeded matter (Reyes). Highlights real surfaces by query
// selector and shows a glass tooltip card anchored to each.
//
// Persists "seen" in localStorage so it auto-dismisses after the first run;
// can be re-opened from Cmd+K -> "Replay onboarding tour".

import { useEffect, useLayoutEffect, useState } from "react";
import { cx } from "../lib/ui";
import { IconArrow, IconClose, IconVerified } from "../icons";

const STORAGE_KEY = "themis-tour-v2";

export interface TourStep {
  /** CSS selector for the element to highlight. */
  target?: string;
  title: string;
  body: string;
  /** Where to anchor the tooltip relative to the target. */
  side?: "top" | "bottom" | "left" | "right";
  /** When set, advance only after the user does the named action. */
  hint?: string;
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to Themis",
    body:
      "Themis ingests a matter's entire document corpus and turns it into a living case brain. Nothing is asserted without a verified citation back to a source page. Privileged material is walled off — flagged by the system, decided by you.",
  },
  {
    target: "[data-tour='brain-mini']",
    title: "Case Brain · always alive",
    body:
      "Every document, person, event, and claim is a node here. Hover or click to inspect. The mini canvas is the same brain that drives the full Case Brain mode (toggle at the top).",
    side: "right",
  },
  {
    target: "[data-tour='ask']",
    title: "Ask the brain",
    body:
      "Grounded chat — every answer carries verified Bates citations. If the corpus doesn't support a specific answer, Themis refuses rather than guess. The audit log records which engine answered (LLM or deterministic) on every turn.",
    side: "bottom",
  },
  {
    target: "[data-tour='queue']",
    title: "Your Queue",
    body:
      "Pending chronology events and privilege flags surface here as a single decision stack. Press A to accept, R to reject, J/K to step through.",
    side: "left",
  },
  {
    target: "[data-tour='scales']",
    title: "Scales of Themis",
    body:
      "Each accepted + verified event drops onto the pan it belongs to. Unverified evidence is weightless — it hovers, never tips the beam. Trust is visceral here, not aspirational.",
    side: "left",
  },
  {
    target: "[data-tour='audit']",
    title: "Append-only audit",
    body:
      "Every mutation lands here, SHA-256 chained. Tamper-evident by construction. The chain is verifiable via /api/matters/:id/audit/verify.",
    side: "left",
  },
  {
    target: "[data-tour='deadlines']",
    title: "Court-order deadlines",
    body:
      "Paste a scheduling order — Themis extracts every deadline into a dated checklist. Daily 08:00 email digest of overdue / this-week items so nothing slips. Malpractice insurance loves verifiable date tracking.",
    side: "left",
  },
  {
    target: "[data-tour='productions']",
    title: "Discovery productions manifest",
    body:
      "Every Bates range produced to or from the other side gets logged here. The audit trail solo + mid firms keep in Excel — now in a hash-chained surface that lives next to the matter.",
    side: "left",
  },
  {
    title: "Eight surfaces, one source of truth",
    body:
      "Switch tabs with ⌘1-8 or click. Each surface reads from the same matter corpus; nothing diverges. Click any Bates chip anywhere to jump straight to the source PDF at the cited page.",
  },
  {
    title: "Cite Check · ⌘6 (the Mata shield)",
    body:
      "Paste a draft brief or motion. Every case citation goes through CourtListener; every Bates against this matter. NOT FOUND on a well-formed citation is the AI-hallucination fingerprint. After a clean run, generate a Rule 11 + Model Rule 1.1/3.3 certification that mints a public attestation hash on /verify/<hash>.",
  },
  {
    title: "Draft · ⌘7 (composition with citations)",
    body:
      "Pick a document kind (demand letter, complaint, motion to compel, settlement statement, etc.), narrow which chronology events to ground in, and Themis emits a first draft with inline (BATES-IDS). Authority slots are [AUTHORITY: ...] placeholders — never fabricated, always swept through Cite Check before filing.",
  },
  {
    title: "Damages · ⌘8 (itemized model)",
    body:
      "Medicals, lost wages, future care, pain & suffering with multipliers — anchor each line to a Bates document. The numbers flow automatically into the settlement-statement and demand-letter drafts.",
  },
  {
    title: "Share + Team (top bar)",
    body:
      "Click Share to invite teammates with a role (admin/partner/associate/paralegal/readonly) OR to mint a tokenized read-only share link for co-counsel, clients, or experts. Privilege wall stays intact in either flow — flagged/withheld docs never appear in a shared view.",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OnboardingTour({ open, onClose }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);

  // Esc closes; arrows navigate.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length - 1));
      else if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function next() {
    if (isLast) {
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* sandbox/SSR */
      }
      onClose();
    } else {
      setStep(step + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-[60]" aria-modal>
      {/* Dim shroud — keeps the underlying UI visible but de-emphasized */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      {current.target ? (
        <TargetedStep
          step={current}
          stepIndex={step}
          totalSteps={STEPS.length}
          onSkip={onClose}
          onPrev={() => setStep(Math.max(step - 1, 0))}
          onNext={next}
          isLast={isLast}
        />
      ) : (
        <CenteredStep
          step={current}
          stepIndex={step}
          totalSteps={STEPS.length}
          onSkip={onClose}
          onNext={next}
          isLast={isLast}
        />
      )}
    </div>
  );
}

interface CommonStepProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onSkip: () => void;
  onNext: () => void;
  isLast: boolean;
}

function CenteredStep({ step, stepIndex, totalSteps, onSkip, onNext, isLast }: CommonStepProps) {
  return (
    <div className="absolute inset-0 grid place-items-center px-6">
      <Card>
        <Header step={step} stepIndex={stepIndex} totalSteps={totalSteps} onSkip={onSkip} />
        <Body step={step} />
        <Footer isLast={isLast} onSkip={onSkip} onNext={onNext} />
      </Card>
    </div>
  );
}

function TargetedStep({ step, stepIndex, totalSteps, onSkip, onPrev, onNext, isLast }: CommonStepProps & { onPrev: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    function measure() {
      const el = document.querySelector(step.target!);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        setRect(null);
      }
    }
    measure();
    const ro = new ResizeObserver(measure);
    window.addEventListener("resize", measure);
    document.querySelector(step.target)?.parentElement && ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [step.target]);

  // If the element isn't on screen yet, fall back to centered.
  if (!rect) {
    return <CenteredStep step={step} stepIndex={stepIndex} totalSteps={totalSteps} onSkip={onSkip} onNext={onNext} isLast={isLast} />;
  }

  // Spotlight ring
  const ringPadding = 8;
  const spotlightStyle = {
    top: rect.top - ringPadding,
    left: rect.left - ringPadding,
    width: rect.width + ringPadding * 2,
    height: rect.height + ringPadding * 2,
  };

  // Tooltip placement
  const tooltipWidth = 360;
  const tooltipGap = 14;
  let topPx = rect.bottom + tooltipGap;
  let leftPx = rect.left + rect.width / 2 - tooltipWidth / 2;
  const side = step.side ?? "bottom";
  if (side === "top") {
    topPx = rect.top - tooltipGap - 240;
    leftPx = rect.left + rect.width / 2 - tooltipWidth / 2;
  } else if (side === "left") {
    topPx = rect.top + rect.height / 2 - 120;
    leftPx = rect.left - tooltipGap - tooltipWidth;
  } else if (side === "right") {
    topPx = rect.top + rect.height / 2 - 120;
    leftPx = rect.right + tooltipGap;
  }
  // Keep on-screen
  if (typeof window !== "undefined") {
    leftPx = Math.max(16, Math.min(leftPx, window.innerWidth - tooltipWidth - 16));
    topPx = Math.max(16, Math.min(topPx, window.innerHeight - 280));
  }

  return (
    <>
      {/* Spotlight ring — a brass-glow outline on the target. */}
      <div
        className="pointer-events-none absolute rounded-[10px] ring-2 ring-brass shadow-[0_0_0_4px_rgba(208,164,90,0.18),0_0_60px_rgba(208,164,90,0.32)] transition-all duration-200"
        style={spotlightStyle}
      />
      <div className="absolute" style={{ top: topPx, left: leftPx, width: tooltipWidth }}>
        <Card>
          <Header step={step} stepIndex={stepIndex} totalSteps={totalSteps} onSkip={onSkip} />
          <Body step={step} />
          <FooterWithPrev isLast={isLast} onSkip={onSkip} onPrev={onPrev} onNext={onNext} stepIndex={stepIndex} />
        </Card>
      </div>
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-card
      className="overflow-hidden rounded-[12px] border border-brass-soft bg-surface shadow-[0_30px_80px_-12px_rgba(0,0,0,0.55)]"
      style={{ background: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-sunken) 100%)" }}
    >
      {children}
    </div>
  );
}

function Header({ step, stepIndex, totalSteps, onSkip }: { step: TourStep; stepIndex: number; totalSteps: number; onSkip: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 pt-3 pb-2">
      <div>
        <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.2em] text-brass-deep">
          Tour · {stepIndex + 1} / {totalSteps}
        </div>
        <div className="mt-0.5 font-display text-[15px] font-semibold leading-tight text-ink">{step.title}</div>
      </div>
      <button
        onClick={onSkip}
        aria-label="Close tour"
        className="grid h-6 w-6 place-items-center rounded text-ink-soft hover:bg-surface-sunken hover:text-ink"
      >
        <IconClose size={12} />
      </button>
    </div>
  );
}

function Body({ step }: { step: TourStep }) {
  return <p className="px-4 py-3 text-[12.5px] leading-relaxed text-ink-soft">{step.body}</p>;
}

function Footer({ isLast, onSkip, onNext }: { isLast: boolean; onSkip: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between border-t border-line bg-surface-sunken px-4 py-2.5">
      <button onClick={onSkip} className="text-[11.5px] text-ink-soft hover:text-ink">
        Skip
      </button>
      <button
        onClick={onNext}
        className="inline-flex items-center gap-1.5 rounded-md bg-brass px-2.5 py-1 text-[11.5px] font-semibold text-paper hover:bg-brass-deep"
      >
        {isLast ? (
          <>
            <IconVerified size={12} /> Got it
          </>
        ) : (
          <>
            Next <IconArrow direction="right" size={12} />
          </>
        )}
      </button>
    </div>
  );
}

function FooterWithPrev({
  isLast,
  onSkip,
  onPrev,
  onNext,
  stepIndex,
}: {
  isLast: boolean;
  onSkip: () => void;
  onPrev: () => void;
  onNext: () => void;
  stepIndex: number;
}) {
  return (
    <div className="flex items-center justify-between border-t border-line bg-surface-sunken px-4 py-2.5">
      <button onClick={onSkip} className="text-[11.5px] text-ink-soft hover:text-ink">
        Skip
      </button>
      <div className="flex items-center gap-2">
        {stepIndex > 0 && (
          <button
            onClick={onPrev}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
          >
            <IconArrow direction="left" size={12} /> Back
          </button>
        )}
        <button
          onClick={onNext}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold hover:bg-brass-deep",
            "bg-brass text-paper",
          )}
        >
          {isLast ? (
            <>
              <IconVerified size={12} /> Got it
            </>
          ) : (
            <>
              Next <IconArrow direction="right" size={12} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function shouldShowTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "1";
  } catch {
    return false;
  }
}
