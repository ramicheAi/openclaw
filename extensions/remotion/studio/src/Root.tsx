import React from "react";
import { Composition } from "remotion";
import { FORMATS, FPS } from "./brand";
import { CaptionedClip, captionedClipDefaults } from "./compositions/CaptionedClip";
import { LowerThird, lowerThirdDefaults } from "./compositions/LowerThird";
import { MettleReel, mettleReelDefaults } from "./compositions/MettleReel";
import { ParallaxReel, parallaxReelDefaults } from "./compositions/ParallaxReel";
import { OceanShader } from "./compositions/OceanShader";
import { QuoteReel, quoteReelDefaults } from "./compositions/QuoteReel";
import { TitleCard, titleCardDefaults } from "./compositions/TitleCard";

// Every composition registered here is renderable by id via:
//   remotion render src/index.ts <Id> out/<file>.mp4 --props='{...}'
// Props passed on the CLI override the defaultProps below.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TitleCard"
        component={TitleCard}
        durationInFrames={3 * FPS}
        fps={FPS}
        width={FORMATS.square45.width}
        height={FORMATS.square45.height}
        defaultProps={titleCardDefaults}
      />
      <Composition
        id="LowerThird"
        component={LowerThird}
        durationInFrames={5 * FPS}
        fps={FPS}
        width={FORMATS.landscape.width}
        height={FORMATS.landscape.height}
        defaultProps={lowerThirdDefaults}
      />
      <Composition
        id="QuoteReel"
        component={QuoteReel}
        durationInFrames={5 * FPS}
        fps={FPS}
        width={FORMATS.vertical.width}
        height={FORMATS.vertical.height}
        defaultProps={quoteReelDefaults}
      />
      <Composition
        id="MettleReel"
        component={MettleReel}
        durationInFrames={7 * FPS}
        fps={FPS}
        width={FORMATS.vertical.width}
        height={FORMATS.vertical.height}
        defaultProps={mettleReelDefaults}
      />
      <Composition
        id="OceanTest"
        component={OceanShader}
        durationInFrames={240}
        fps={FPS}
        width={FORMATS.vertical.width}
        height={FORMATS.vertical.height}
        defaultProps={{ timeOffset: 40 }}
      />
      <Composition
        id="ParallaxReel"
        component={ParallaxReel}
        durationInFrames={678}
        fps={FPS}
        width={FORMATS.vertical.width}
        height={FORMATS.vertical.height}
        defaultProps={parallaxReelDefaults}
      />
      <Composition
        id="CaptionedClip"
        component={CaptionedClip}
        durationInFrames={4 * FPS}
        fps={FPS}
        width={FORMATS.vertical.width}
        height={FORMATS.vertical.height}
        defaultProps={captionedClipDefaults}
      />
    </>
  );
};
