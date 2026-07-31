import { cx } from "../lib/ui";

// The Tau — Themis' brand mark.
//
// A capital T with a deliberately tilted crossbar (−7°). The whole product
// thesis compressed into one shape:
//   stem        — the plumb; truth is fixed
//   crossbar    — weight is being applied; the case is never neutral
//   left block  — grounded, verified evidence (solid)
//   right block — pending evidence (dashed outline)
//   fulcrum dot — the decision point at the join
//
// Authoritative geometry per design handoff §12. Never correct the −7° tilt.
//
// Size reductions are built-in, not optional:
//   ≥40px        — full mark with dashed right weight
//   24–40px      — drop the dashed weight; thicken the solid block
//   <24px        — just the T with tilted crossbar; no fulcrum or weights
//
// Refuses to render below 16px and warns in dev.

export type BrandTone = "paper" | "ink" | "brass" | "mono-brass" | "mono-ink";

const toneClass: Record<BrandTone, { fill: string; stroke: string; fulcrumFill: string; fulcrumStroke: string }> = {
  paper: { fill: "fill-brass", stroke: "stroke-brass", fulcrumFill: "fill-ink", fulcrumStroke: "stroke-brass-soft" },
  ink: { fill: "fill-brass-soft", stroke: "stroke-brass-soft", fulcrumFill: "fill-paper", fulcrumStroke: "stroke-brass" },
  brass: { fill: "fill-ink", stroke: "stroke-ink", fulcrumFill: "fill-ink", fulcrumStroke: "stroke-ink" },
  "mono-brass": { fill: "fill-brass", stroke: "stroke-brass", fulcrumFill: "fill-brass", fulcrumStroke: "stroke-brass" },
  "mono-ink": { fill: "fill-ink", stroke: "stroke-ink", fulcrumFill: "fill-ink", fulcrumStroke: "stroke-ink" },
};

export interface TauProps {
  size?: number;
  tone?: BrandTone;
  breathe?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Tau({ size = 32, tone = "paper", breathe = false, ariaLabel = "Themis", className }: TauProps) {
  if (size < 16) {
    if (import.meta.env.DEV) {
      console.warn(`<Tau> refused to render at ${size}px (minimum 16px). Use the wordmark below this size.`);
    }
    return null;
  }
  const t = toneClass[tone];
  const showFulcrum = size >= 24;
  const showDashedRight = size >= 40;
  // 24-40px: thicken the solid left block.
  const leftWeight =
    size >= 40
      ? { x: 48, y: 84, w: 32, h: 44 }
      : { x: 44, y: 80, w: 40, h: 52 };

  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
      className={cx(breathe && "animate-tau-breathe", className)}
    >
      {/* Stem (plumb) */}
      <rect x={186} y={110} width={28} height={210} rx={3} className={t.fill} />
      {/* Stem base */}
      <rect x={156} y={310} width={88} height={14} rx={3} className={t.fill} />
      {/* Crossbar group — rotated −7° about (200, 110) — never correct */}
      <g transform="rotate(-7 200 110)">
        <rect x={68} y={92} width={264} height={28} rx={4} className={t.fill} />
        <rect
          x={leftWeight.x}
          y={leftWeight.y}
          width={leftWeight.w}
          height={leftWeight.h}
          rx={4}
          className={t.fill}
        />
        {showDashedRight && (
          <rect
            x={324}
            y={92}
            width={22}
            height={28}
            rx={3}
            fill="none"
            strokeWidth={4}
            strokeDasharray="3 4"
            className={t.stroke}
          />
        )}
      </g>
      {showFulcrum && <circle cx={200} cy={110} r={6} strokeWidth={1} className={cx(t.fulcrumFill, t.fulcrumStroke)} />}
    </svg>
  );
}

// Wordmark — Fraunces 600, paired with the mark in app chrome.
export function BrandMark({
  size = "md",
  showWordmark = true,
  tone = "paper",
}: {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  tone?: BrandTone;
}) {
  const px = size === "sm" ? 24 : size === "lg" ? 40 : 32;
  if (!showWordmark) return <Tau size={px} tone={tone} />;
  return (
    <div className="flex items-center gap-2.5">
      <Tau size={px} tone={tone} />
      <div className="leading-none">
        <div className="font-display text-[17px] font-semibold text-ink">Themis</div>
        <div className="mt-0.5 text-[8.5px] font-medium uppercase tracking-[0.22em] text-brass-deep">
          Evidence Intelligence
        </div>
      </div>
    </div>
  );
}
