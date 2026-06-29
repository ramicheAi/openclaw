import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

/**
 * HonestType — a typographic poster + animation for the maxim:
 *   "good design is honest...the craft serves the truth of the thing,
 *    not the ego of the maker."
 *
 * Pantheon direction (AXIS + CODEX):
 *  - Spine: a poster about honest design must itself be the most honest object
 *    in the room — the type ENACTS the sentence, it does not decorate it.
 *  - Single Move (Restraint Budget): exactly one loud move — "the ego of the
 *    maker" is set in ghosted ink (present but subordinated). Nothing else
 *    competes. (CODEX: Type-as-Image / Paula Scher — the type IS the idea.)
 *  - One-Typeface (Vignelli): the whole hierarchy is built from ONE family
 *    (Helvetica Neue, chosen on purpose — the Swiss/objective face), by size,
 *    weight, space and opacity alone. No second font, no accent colour.
 *  - The Grid That Shows Its Work: a single hairline the thesis rests on +
 *    baseline ticks in the margin — honesty-of-structure as the only ornament.
 *  - Honest material colour: warm ink on warm paper, NOT #000 on #fff (the
 *    screen default is the lie); no fake paper-grain (simulating a material it
 *    isn't would be the ego move). Flat warm field = exactly what it is.
 *  - Motion (KINEMA): no bounce, no blur-glow. Lines settle onto the baseline
 *    on a single calm ease; the piece HOLDS in silence on the thesis (the
 *    ellipsis made temporal); "the ego of the maker" arrives already ghosted
 *    and never brightens — the emphasis the eye waits for honestly never comes.
 *  - The final resting frame IS the poster (one source, two outputs).
 */

// --- honest material palette (self-contained; not the cosmic brand tokens) ---
const PAPER = "#ede8dd"; // warm uncoated stock tone
const INK = "#1a1712"; // warm near-black ink
const ghost = (o: number) => `rgba(26, 23, 18, ${o})`;

const FONT = '"Helvetica Neue", "Helvetica Neue LT Std", Helvetica, Arial, sans-serif';

// reading edge + rhythm
const LEFT = 132;
const calm = Easing.out(Easing.cubic);

export type HonestTypeProps = {
  caption: string;
};

export const honestTypeDefaults: HonestTypeProps = {
  caption: "Parallax",
};

/** One line that settles onto its baseline on a single calm ease. */
const Line: React.FC<{
  frame: number;
  start: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ frame, start, children, style }) => {
  const opacity = interpolate(frame, [start, start + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: calm,
  });
  const y = interpolate(frame, [start, start + 22], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: calm,
  });
  return (
    <div style={{ ...style, opacity, transform: `translateY(${y}px)` }}>{children}</div>
  );
};

export const HonestType: React.FC<HonestTypeProps> = ({ caption }) => {
  const frame = useCurrentFrame();

  // the footer is the final quiet settle (no structural flourish competes with
  // the one loud move — the ghosted "ego of the maker")
  const captionOpacity = interpolate(frame, [176, 202], [0, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const bodyLine: React.CSSProperties = {
    fontFamily: FONT,
    color: INK,
    fontSize: 50,
    fontWeight: 400,
    lineHeight: 1.32,
    letterSpacing: 0,
    margin: 0,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {/* THESIS — the claim, read first. No structural flourish: pure type on
          paper is the most honest object. The ellipsis trails at a mid-value
          (a pause), kept distinct from the ego-ghost so "ghost = ego" only. */}
      <div style={{ position: "absolute", left: LEFT, top: 268 }}>
        <div
          style={{
            fontFamily: FONT,
            color: INK,
            fontSize: 80,
            fontWeight: 400,
            lineHeight: 1.02,
            letterSpacing: -1.2,
            whiteSpace: "nowrap",
            opacity: interpolate(frame, [18, 40], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: calm,
            }),
            transform: `translateY(${interpolate(frame, [18, 40], [20, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: calm,
            })}px)`,
          }}
        >
          good design is honest
        </div>
      </div>

      {/* ELABORATION — read second; one connected block with the thesis. The
          large whitespace falls BELOW "the ego of the maker" — the ego fades,
          then space. */}
      <div style={{ position: "absolute", left: LEFT, top: 408 }}>
        <Line frame={frame} start={84} style={bodyLine}>
          the craft serves
        </Line>
        <Line frame={frame} start={104} style={bodyLine}>
          the truth of the thing,
        </Line>
        {/* the turn — the Single Move: "the ego of the maker" recedes */}
        <Line frame={frame} start={124} style={bodyLine}>
          not{" "}
          <span style={{ color: ghost(0.24) }}>the ego of the maker.</span>
        </Line>
      </div>

      {/* quiet footer — a made object names itself, without ego */}
      <div
        style={{
          position: "absolute",
          left: LEFT,
          top: 1208,
          opacity: captionOpacity,
        }}
      >
        <div
          style={{
            width: 40,
            height: 1.5,
            backgroundColor: INK,
            opacity: 0.6,
            marginBottom: 18,
          }}
        />
        <div
          style={{
            fontFamily: FONT,
            color: INK,
            fontSize: 21,
            fontWeight: 500,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          {caption}
        </div>
      </div>
    </AbsoluteFill>
  );
};
