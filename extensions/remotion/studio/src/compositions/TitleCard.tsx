import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND } from "../brand";

export type TitleCardProps = {
  title: string;
  subtitle: string;
};

export const titleCardDefaults: TitleCardProps = {
  title: "GALACTIK ANTICS",
  subtitle: "Open the box. Enter the lore.",
};

export const TitleCard: React.FC<TitleCardProps> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const titleY = interpolate(enter, [0, 1], [40, 0]);
  const titleOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const subOpacity = interpolate(frame, [18, 38], [0, 1], { extrapolateRight: "clamp" });
  const underline = interpolate(frame, [22, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: BRAND.gradient }}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 96,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: BRAND.fonts.display,
            color: BRAND.colors.text,
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: -2,
            margin: 0,
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            textShadow: `0 0 40px ${BRAND.colors.primary}66`,
          }}
        >
          {title}
        </h1>
        <div
          style={{
            height: 8,
            width: `${underline * 220}px`,
            background: `linear-gradient(90deg, ${BRAND.colors.primary}, ${BRAND.colors.accent})`,
            borderRadius: 8,
            margin: "36px 0",
            boxShadow: `0 0 24px ${BRAND.colors.accent}aa`,
          }}
        />
        <p
          style={{
            fontFamily: BRAND.fonts.body,
            color: BRAND.colors.textMuted,
            fontSize: 40,
            fontWeight: 500,
            margin: 0,
            opacity: subOpacity,
          }}
        >
          {subtitle}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
