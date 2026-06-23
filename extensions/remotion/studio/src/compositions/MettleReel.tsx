import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

// METTLE brand tokens (verified live identity: gold + purple + near-black).
// Kept inline so the shared brand.ts (Galactik palette) stays untouched.
const M = {
  gold: "#D4A843",
  goldLight: "#F0D478",
  cream: "#FFFBE6",
  purple: "#A78BFA",
  bg: "#060410",
};
const DISPLAY = '"Inter", "Helvetica Neue", "SF Pro Display", system-ui, Arial, sans-serif';

export type MettleReelProps = {
  line1: string;
  line2: string;
  tagline: string;
  url: string;
  imageSrc?: string; // filename in studio/public/ (AI backplate); falls back to gradient
};

export const mettleReelDefaults: MettleReelProps = {
  line1: "DISCIPLINE IS A SUPERPOWER.",
  line2: "Mettle keeps score.",
  tagline: "WHERE ATHLETES FIND THEIR EDGE.",
  url: "mettlearena.com",
  imageSrc: "mettle_quotecard.png",
};

const ease = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const MettleReel: React.FC<MettleReelProps> = ({ line1, line2, tagline, url, imageSrc }) => {
  const frame = useCurrentFrame();

  // Slow Ken Burns push on the backplate
  const bgScale = interpolate(frame, [0, 210], [1.0, 1.1], ease);

  // Text reveal (line by line)
  const l1o = interpolate(frame, [12, 30], [0, 1], ease);
  const l1y = interpolate(frame, [12, 30], [28, 0], ease);
  const l2o = interpolate(frame, [40, 58], [0, 1], ease);
  const l2y = interpolate(frame, [40, 58], [22, 0], ease);
  const lineW = interpolate(frame, [30, 52], [0, 220], ease); // gold accent underline grows

  // End card (last ~2s): darken + wordmark/url fade in
  const endScrim = interpolate(frame, [150, 172], [0, 0.82], ease);
  const endO = interpolate(frame, [158, 180], [0, 1], ease);
  const mainO = interpolate(frame, [150, 172], [1, 0], ease); // fade the quote out for the end card

  return (
    <AbsoluteFill style={{ backgroundColor: M.bg }}>
      {/* Background: AI backplate or gradient fallback */}
      {imageSrc ? (
        <AbsoluteFill style={{ transform: `scale(${bgScale})` }}>
          <Img
            src={staticFile(imageSrc)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            transform: `scale(${bgScale})`,
            background: `radial-gradient(circle at 50% 35%, #1a1330 0%, ${M.bg} 70%)`,
          }}
        />
      )}

      {/* Legibility scrim (top + bottom) */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(6,4,16,0.55) 0%, rgba(6,4,16,0.0) 35%, rgba(6,4,16,0.0) 55%, rgba(6,4,16,0.85) 100%)",
        }}
      />

      {/* Headline block */}
      <AbsoluteFill
        style={{
          opacity: mainO,
          justifyContent: "flex-end",
          alignItems: "flex-start",
          padding: "0 90px 240px 90px",
        }}
      >
        <div
          style={{
            opacity: l1o,
            transform: `translateY(${l1y}px)`,
            fontFamily: DISPLAY,
            color: M.gold,
            fontSize: 92,
            fontWeight: 900,
            lineHeight: 1.02,
            letterSpacing: -2,
            textTransform: "uppercase",
            textShadow: "0 6px 30px rgba(0,0,0,0.6)",
          }}
        >
          {line1}
        </div>
        <div style={{ width: lineW, height: 6, background: M.gold, margin: "26px 0 24px", borderRadius: 3 }} />
        <div
          style={{
            opacity: l2o,
            transform: `translateY(${l2y}px)`,
            fontFamily: DISPLAY,
            color: M.cream,
            fontSize: 46,
            fontWeight: 600,
            letterSpacing: 0.5,
          }}
        >
          {line2}
        </div>
      </AbsoluteFill>

      {/* End card */}
      <AbsoluteFill style={{ backgroundColor: `rgba(6,4,16,${endScrim})` }} />
      <AbsoluteFill
        style={{ opacity: endO, justifyContent: "center", alignItems: "center", flexDirection: "column" }}
      >
        <div
          style={{
            fontFamily: DISPLAY,
            color: M.gold,
            fontSize: 120,
            fontWeight: 900,
            letterSpacing: 8,
            textTransform: "uppercase",
          }}
        >
          METTLE
        </div>
        <div
          style={{
            fontFamily: DISPLAY,
            color: M.purple,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 4,
            marginTop: 14,
            textTransform: "uppercase",
          }}
        >
          {tagline}
        </div>
        <div
          style={{
            fontFamily: DISPLAY,
            color: M.cream,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 1,
            marginTop: 40,
            padding: "12px 30px",
            border: `2px solid ${M.gold}`,
            borderRadius: 999,
          }}
        >
          {url}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
