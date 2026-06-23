import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BRAND } from "../brand";

export type QuoteReelProps = {
  quote: string;
  author: string;
};

export const quoteReelDefaults: QuoteReelProps = {
  quote: "Volume cures volatility.",
  author: "The Business Bible",
};

// Word-by-word reveal text reel — built for high-volume short-form content.
export const QuoteReel: React.FC<QuoteReelProps> = ({ quote, author }) => {
  const frame = useCurrentFrame();
  const words = quote.split(" ");
  const perWord = 5; // frames between each word reveal

  const authorOpacity = interpolate(
    frame,
    [words.length * perWord + 10, words.length * perWord + 30],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ background: BRAND.gradient }}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 110 }}>
        <h1
          style={{
            fontFamily: BRAND.fonts.display,
            color: BRAND.colors.text,
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: -1.5,
            textAlign: "center",
            margin: 0,
          }}
        >
          {words.map((word, i) => {
            const start = i * perWord;
            const opacity = interpolate(frame, [start, start + perWord], [0.12, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const y = interpolate(frame, [start, start + perWord], [16, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <span
                key={i}
                style={{ opacity, display: "inline-block", transform: `translateY(${y}px)`, marginRight: 18 }}
              >
                {word}
              </span>
            );
          })}
        </h1>
        <p
          style={{
            fontFamily: BRAND.fonts.body,
            color: BRAND.colors.accent,
            fontSize: 38,
            fontWeight: 600,
            marginTop: 56,
            opacity: authorOpacity,
          }}
        >
          — {author}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
