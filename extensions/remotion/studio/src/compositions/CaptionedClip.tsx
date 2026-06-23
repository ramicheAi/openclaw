import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND } from "../brand";

export type Caption = { text: string; from: number; to: number }; // frames

export type CaptionedClipProps = {
  // Background source. A URL, or a filename placed in studio/public (use staticFile).
  // Leave empty to fall back to the brand gradient.
  videoSrc?: string;
  imageSrc?: string;
  captions: Caption[];
};

export const captionedClipDefaults: CaptionedClipProps = {
  videoSrc: "",
  imageSrc: "",
  captions: [
    { text: "Nobody knows you exist yet.", from: 0, to: 40 },
    { text: "That's the only real enemy.", from: 40, to: 80 },
    { text: "So we get LOUD.", from: 80, to: 120 },
  ],
};

function resolveSrc(src?: string): string | null {
  if (!src) return null;
  if (/^https?:\/\//.test(src) || src.startsWith("data:")) return src;
  // Otherwise treat as a file inside studio/public.
  return staticFile(src);
}

export const CaptionedClip: React.FC<CaptionedClipProps> = ({ videoSrc, imageSrc, captions }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const video = resolveSrc(videoSrc);
  const image = resolveSrc(imageSrc);

  const active = captions.find((c) => frame >= c.from && frame < c.to);

  return (
    <AbsoluteFill style={{ background: BRAND.gradient }}>
      {video ? (
        <OffthreadVideo src={video} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : image ? (
        <Img src={image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}

      {/* Scrim for caption legibility */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(to top, ${BRAND.colors.overlay} 0%, transparent 55%)`,
        }}
      />

      {active ? (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: 90 }}>
          <div
            style={{
              maxWidth: width * 0.86,
              textAlign: "center",
              fontFamily: BRAND.fonts.display,
              fontWeight: 800,
              fontSize: 72,
              lineHeight: 1.1,
              color: BRAND.colors.text,
              textShadow: `0 4px 30px rgba(0,0,0,0.7)`,
              opacity: interpolate(
                frame,
                [active.from, active.from + 6, active.to - 6, active.to],
                [0, 1, 1, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              ),
            }}
          >
            {active.text}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
