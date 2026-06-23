import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Easing,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { OceanShader } from "./OceanShader";

// Parallax × SCOWW reel — Pantheon rebuild (Route A: "The sky is real").
// AXIS spine: Parallax builds websites that render the real world, live. Foil: the dead stock template.
// Through-line object (AXIS `The One Detail That Travels`): the warm accent rule — it sits above every
//   proof caption and resolves as the living ocean's horizon line.
// HOOK (CATALYST `Proof-First Cold Open` + `False-Premise Reveal`): open on the proof (screen-sky = real
//   sky) and plant the wrong assumption ("that's not a photo of the sky"); Proof > Promise, no logo build.
// DIVE (KINEMA `Parallax Depth-Cut`, Proven-underused): travel THROUGH the screen plane into the site's
//   own ocean — depth-traversal substituting for a location cut (the honest name for the old "portal-match").
// SURFACE (KINEMA `Smash-Hold`, Proven-underused): the boom cuts into stillness, then the brand holds.
// GRADE (CHROMA `Jean-Clément Soret` advertising bench + KINEMA `Sonnenfeld`/`Greg Fisher` arc): deep clean
//   blacks, protected highlights, controlled saturation that *rises* into the alive ocean (the spine, graded).
// Palette locked in OKLCH (violet-anchored to escape the teal/orange cliché): ink oklch(.17 .03 260),
//   accent oklch(.76 .15 50), violet oklch(.74 .09 285); 60/30/10 cool field + one warm accent.
const PX = {
  ink: "#080b14", // oklch(.17 .03 260) — blue-black, not gray
  accent: "#ff8a5b", // oklch(.76 .15 50) — the one bright (10%)
  violet: "#b3a6ff", // oklch(.78 .09 287)
  text: "#ffffff",
  muted: "#cfd4e2",
  font: '"Inter", "SF Pro Display", "Helvetica Neue", system-ui, -apple-system, Arial, sans-serif',
};

const VO_START = 8; // VO ("that's not a wallpaper…") lands on the hook
const ESCAPE = 400; // the Parallax Depth-Cut through the screen
const TOTAL = 678;
const ORIGIN = "50% 47%"; // the laptop screen center — the depth-cut travels into THIS point

type Part = { t: string; accent?: boolean };
type Cap = { from: number; to: number; parts: Part[]; size?: number; instant?: boolean };

// All captions carry the message SOUND-OFF (most feed views are muted) and track the VO sound-on.
// Every beat is PROOF, not promise (Business Bible: "your promise is not unique; your proof is").
const CAPS: Cap[] = [
  { from: 0, to: 86, size: 54, instant: true, parts: [{ t: "that's not a photo of the " }, { t: "sky.", accent: true }] }, // HOOK — full at frame 0 (the thumbnail asserts the claim)
  { from: 96, to: 198, size: 46, parts: [{ t: "the website is rendering it — " }, { t: "live.", accent: true }] },
  { from: 200, to: 306, size: 44, parts: [{ t: "real sun · real weather · " }, { t: "real time", accent: true }] },
  { from: 308, to: 392, size: 44, parts: [{ t: "a custom ocean, built by hand" }] },
];

// AXIS through-line object: the warm accent rule. Recurs above every caption; becomes the ocean horizon.
const AccentRule: React.FC<{ w?: number }> = ({ w = 46 }) => (
  <div style={{ width: w, height: 2, borderRadius: 2, background: PX.accent, opacity: 0.92 }} />
);

const Caption: React.FC<{ cap: Cap; width: number }> = ({ cap, width }) => {
  const frame = useCurrentFrame();
  if (frame < cap.from - 2 || frame > cap.to + 2) return null;
  const o = cap.instant
    ? interpolate(frame, [cap.to - 10, cap.to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : interpolate(frame, [cap.from, cap.from + 8, cap.to - 8, cap.to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  const y = cap.instant ? 0 : interpolate(frame, [cap.from, cap.from + 12], [16, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 500 }}>
      <div style={{ opacity: o, transform: `translateY(${y}px)`, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {/* legibility scrim — soft dark halo so white text reads on the darkest footage (gate: hook caption was illegible muted) */}
        <div style={{ position: "absolute", inset: "-26px -46px", background: "radial-gradient(62% 74% at 50% 58%, rgba(5,8,14,0.66), transparent 76%)", filter: "blur(10px)", borderRadius: 44 }} />
        <AccentRule />
        <div style={{ position: "relative", maxWidth: width * 0.78, textAlign: "center", fontFamily: PX.font, fontWeight: 700, fontSize: cap.size ?? 44, letterSpacing: "-0.012em", color: PX.text, textShadow: "0 1px 2px rgba(0,0,0,0.96), 0 2px 14px rgba(0,0,0,0.9)" }}>
          {cap.parts.map((p, i) => (
            <span key={i} style={{ color: p.accent ? PX.accent : PX.text }}>{p.t}</span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const LiveTag: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.abs(Math.sin(frame * 0.12));
  const o = interpolate(frame, [16, 34, ESCAPE - 40, ESCAPE - 16], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: 322, left: 52, display: "flex", alignItems: "center", gap: 11, padding: "10px 18px", borderRadius: 999, background: "rgba(8,11,20,0.42)", border: "1px solid rgba(255,255,255,0.16)", opacity: o }}>
      <span style={{ width: 11, height: 11, borderRadius: 999, background: PX.accent, boxShadow: `0 0 ${9 * pulse}px ${PX.accent}`, opacity: pulse }} />
      <span style={{ fontFamily: PX.font, fontSize: 21, fontWeight: 700, letterSpacing: "0.15em", color: "#fff" }}>BOCA RATON · LIVE SKY</span>
    </div>
  );
};

const Reveal: React.FC<{ at: number; children: React.ReactNode; y?: number; dur?: number }> = ({ at, children, y = 30, dur = 20 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const ty = interpolate(frame, [at, at + dur], [y, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <div style={{ opacity: o, transform: `translateY(${ty}px)` }}>{children}</div>;
};

// KINEMA `Parallax Depth-Cut` — the iris opens FROM the screen point and the site's ocean takes over,
// so the transition reads as traveling into the image's layers, not cutting to a new location.
const MaskedOcean: React.FC = () => {
  const frame = useCurrentFrame();
  const r = interpolate(frame, [0, 60], [0, 180], { extrapolateRight: "clamp", easing: Easing.bezier(0.34, 0, 0.2, 1) });
  const oscale = interpolate(frame, [0, 48, 278], [1.4, 1.0, 1.14], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }); // continuous slow push — keeps the back third alive (no static lock)
  const oblur = interpolate(frame, [0, 30], [22, 0], { extrapolateRight: "clamp" });
  const obright = interpolate(frame, [0, 26], [1.3, 0.95], { extrapolateRight: "clamp" });
  // CHROMA / Greg Fisher arc: the ocean is born from the dusk hero (warm magenta soft-light) and resolves
  // to its own graded teal — saturation *rises* as we surface into the "alive" world.
  const warm = interpolate(frame, [0, 52], [0.5, 0], { extrapolateRight: "clamp" });
  const mask = `radial-gradient(circle at ${ORIGIN}, #000 ${r}%, transparent ${r + 11}%)`;
  return (
    <AbsoluteFill style={{ maskImage: mask, WebkitMaskImage: mask }}>
      <AbsoluteFill style={{ transform: `scale(${oscale})`, transformOrigin: ORIGIN, filter: `blur(${oblur}px) brightness(${obright}) contrast(1.18) saturate(1.1)` }}>
        <OceanShader timeOffset={48} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(130% 95% at 42% 36%, rgba(150,70,135,0.9) 0%, rgba(120,60,150,0.5) 38%, transparent 70%)", opacity: warm, mixBlendMode: "soft-light" }} />
      {/* cinematic vignette — true blacks at the edges (Sonnenfeld: deepen blacks); fixes the milky back half */}
      <AbsoluteFill style={{ background: "radial-gradient(128% 84% at 50% 43%, transparent 42%, rgba(0,0,0,0.5) 100%)" }} />
    </AbsoluteFill>
  );
};

const BrandResolve: React.FC = () => {
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(8,11,20,0.6) 0%, rgba(8,11,20,0.28) 36%, transparent 62%)" }} />
      {/* the through-line accent rule resolves as the ocean's own horizon */}
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 300 }}>
        <Reveal at={26} y={0} dur={28}>
          <div style={{ width: 220, height: 2, borderRadius: 2, background: PX.accent, opacity: 0.85 }} />
        </Reveal>
      </AbsoluteFill>
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 330, fontFamily: PX.font, color: PX.text, textAlign: "center" }}>
        <Reveal at={30} y={34}>
          <div style={{ fontSize: 86, fontWeight: 800, lineHeight: 1.04, letterSpacing: "-0.04em", textShadow: "0 6px 40px rgba(0,0,0,0.5)" }}>
            websites that are
            <br />
            <span style={{ color: PX.accent }}>alive.</span>
          </div>
        </Reveal>
        <Reveal at={84} y={22}>
          <Img src={staticFile("parallax-logo-white.png")} style={{ width: 116, height: 116, marginTop: 130 }} />
        </Reveal>
        <Reveal at={94}>
          <div style={{ marginTop: 18, fontSize: 50, fontWeight: 800, letterSpacing: "0.2em" }}>PARALLAX</div>
        </Reveal>
        <Reveal at={118}>
          {/* dark pill so the CTA — the actual ask — holds contrast over the warm sky band */}
          <div style={{ marginTop: 34, display: "inline-flex", alignItems: "center", gap: 12, padding: "13px 26px", borderRadius: 999, background: "rgba(6,9,16,0.66)", border: "1px solid rgba(255,255,255,0.14)" }}>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "0.06em", color: PX.text }}>scoww.com</span>
            <span style={{ fontSize: 25, fontWeight: 700, color: PX.accent }}>see it live →</span>
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export type ParallaxReelProps = { videoSrc: string };
export const parallaxReelDefaults: ParallaxReelProps = { videoSrc: "parallax-scoww-slow.mp4" };

export const ParallaxReel: React.FC<ParallaxReelProps> = ({ videoSrc }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const src = /^https?:\/\//.test(videoSrc) ? videoSrc : staticFile(videoSrc);
  // slow push that accelerates into the depth-cut
  const scale = interpolate(frame, [0, 360, 392, ESCAPE], [1.1, 1.14, 1.2, 1.52], { extrapolateRight: "clamp", easing: Easing.bezier(0.5, 0, 0.78, 0) }); // tighter at frame 0 — punch-in hook
  const fblur = interpolate(frame, [380, ESCAPE], [0, 18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // CHROMA grade on the footage (Soret bench): lift the dark night scene but PROTECT highlights (modest
  // brightness), deepen blacks via contrast, hold saturation (NOT the prior ~21% desat). Restrained vs the
  // ocean's +sat — the Greg Fisher desaturated→saturated arc, real-world side.
  const fbright = interpolate(frame, [0, 120, 360], [1.4, 1.1, 1.1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = interpolate(frame, [ESCAPE - 7, ESCAPE, ESCAPE + 11], [0, 0.82, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // close to deep ink so the loop seam is dark→dark (matches the dark frame-0 pool), not bright-ocean→dark-pool
  // end-fade removed — the living-ocean payoff holds full luminance through the final frame so the loop hands off bright→bright
  // music: audible bed that ducks under the dive so the boom punches (ORPHEUS dynamics).
  const musicVol = (f: number) => interpolate(f, [0, 376, ESCAPE, 440], [0.42, 0.42, 0.22, 0.4], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: PX.ink }}>
      <Sequence from={VO_START}><Audio src={staticFile("parallax-vo.mp3")} /></Sequence>
      <Audio src={staticFile("parallax-music.mp3")} volume={musicVol} />
      <Sequence from={ESCAPE - 30}><Audio src={staticFile("sfx-whoosh.mp3")} volume={0.34} /></Sequence>
      <Sequence from={ESCAPE - 34}><Audio src={staticFile("sfx-riser.mp3")} volume={0.4} /></Sequence>
      <Sequence from={ESCAPE - 9}><Audio src={staticFile("sfx-whoosh.mp3")} volume={0.6} /></Sequence>
      <Sequence from={ESCAPE - 6}><Audio src={staticFile("sfx-boom.mp3")} volume={0.85} /></Sequence>
      <Sequence from={ESCAPE - 9}><Audio src={staticFile("ocean-wash.mp3")} volume={0.72} /></Sequence>

      {/* Act I+II — the PROOF: the real website rendering the real Boca sky, live */}
      <Sequence durationInFrames={ESCAPE + 52} name="footage">
        <AbsoluteFill>
          <OffthreadVideo src={src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})`, transformOrigin: ORIGIN, filter: `contrast(1.06) saturate(1.06) brightness(${fbright}) blur(${fblur}px)` }} />
          <AbsoluteFill style={{ background: "radial-gradient(125% 100% at 50% 44%, transparent 52%, rgba(8,11,20,0.5) 100%)" }} />
          <LiveTag />
          {CAPS.map((c, i) => (
            <Caption key={i} cap={c} width={width} />
          ))}
        </AbsoluteFill>
      </Sequence>

      {/* the Parallax Depth-Cut into the living SCOWW ocean */}
      <Sequence from={ESCAPE} durationInFrames={TOTAL - ESCAPE} name="ocean">
        <MaskedOcean />
      </Sequence>

      {/* Smash-Hold — bloom-burst through the glass */}
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 47%, rgba(255,243,230,1) 0%, rgba(255,176,132,0.55) 32%, transparent 68%)", opacity: flash, mixBlendMode: "screen", pointerEvents: "none" }} />
      {/* brand + CTA over the living ocean — ocean holds full luminance to the last frame (loop hands off bright→bright) */}
      <Sequence from={ESCAPE} durationInFrames={TOTAL - ESCAPE} name="brand">
        <BrandResolve />
      </Sequence>
    </AbsoluteFill>
  );
};
