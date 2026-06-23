// Parallax / Galactik Antics brand tokens for video.
//
// NOTE: These are editable defaults that follow the COO Output Standards
// (4:5 primary aspect, cosmic Galactik palette). Drop the exact Galactik hex
// values and brand font here when finalized — changing these does not require
// re-touching any composition; they all read from this file.

export const FPS = 30;

// Aspect / format presets. 4:5 (square45) is the locked primary per Output Standards.
export const FORMATS = {
  square45: { width: 1080, height: 1350 }, // 4:5 — primary
  vertical: { width: 1080, height: 1920 }, // 9:16 — reels / TikTok
  square: { width: 1080, height: 1080 }, // 1:1
  landscape: { width: 1920, height: 1080 }, // 16:9
} as const;

export type FormatName = keyof typeof FORMATS;

export const BRAND = {
  colors: {
    bg: "#05060f", // deep space
    bgAlt: "#0b1022", // nebula navy
    primary: "#6c5cff", // electric violet (Galactik accent — placeholder)
    accent: "#00e5ff", // cyan glow
    text: "#ffffff",
    textMuted: "#aab0c6",
    overlay: "rgba(5, 6, 15, 0.55)", // scrim for video backgrounds
  },
  // System stack now; swap in the Galactik display font here when available.
  fonts: {
    display:
      '"Inter", "Helvetica Neue", "SF Pro Display", system-ui, -apple-system, Arial, sans-serif',
    body: '"Inter", system-ui, -apple-system, Arial, sans-serif',
  },
  // A consistent cosmic gradient used as the default background.
  gradient: "linear-gradient(135deg, #05060f 0%, #0b1022 55%, #1a1140 100%)",
} as const;

export function formatDims(format: FormatName) {
  return FORMATS[format] ?? FORMATS.square45;
}
