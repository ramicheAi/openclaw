import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND } from "../brand";

export type LowerThirdProps = {
  name: string;
  role: string;
  // Optional transparent render: set background to fully transparent so this can
  // be composited over other footage (render with --codec=prores or webm-alpha).
  transparent?: boolean;
};

export const lowerThirdDefaults: LowerThirdProps = {
  name: "Ramon Walton",
  role: "Founder, Parallax Ventures",
  transparent: false,
};

export const LowerThird: React.FC<LowerThirdProps> = ({ name, role, transparent }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const x = interpolate(enter, [0, 1], [-width * 0.6, 0]);
  const exit = interpolate(frame, [fps * 4, fps * 4 + 20], [0, -width * 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{ background: transparent ? "transparent" : BRAND.gradient, justifyContent: "flex-end" }}
    >
      <div
        style={{
          transform: `translateX(${x + exit}px)`,
          margin: "0 0 140px 80px",
          display: "inline-flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            alignSelf: "flex-start",
            background: `linear-gradient(90deg, ${BRAND.colors.primary}, ${BRAND.colors.accent})`,
            color: BRAND.colors.text,
            fontFamily: BRAND.fonts.display,
            fontWeight: 800,
            fontSize: 52,
            letterSpacing: -1,
            padding: "14px 28px",
            borderRadius: 12,
            boxShadow: `0 8px 40px ${BRAND.colors.primary}55`,
          }}
        >
          {name}
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            background: BRAND.colors.overlay,
            color: BRAND.colors.textMuted,
            fontFamily: BRAND.fonts.body,
            fontWeight: 600,
            fontSize: 34,
            padding: "10px 24px",
            borderRadius: 10,
            backdropFilter: "blur(6px)",
          }}
        >
          {role}
        </div>
      </div>
    </AbsoluteFill>
  );
};
