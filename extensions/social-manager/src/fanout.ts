// fanout.ts — one brief, every surface.
//
// The Business Bible "one win reaches every surface" / adapt-and-localize doctrine:
// take a single content brief and produce a platform-CORRECT caption for each target
// platform at once (not one caption pasted everywhere). Each platform gets its own
// generation pass so the hook, length, and shape fit that feed. Runs in parallel; the
// generator is injected so the fan-out is unit-tested offline.

import { type Awareness, generateCaption, type Generator } from "./generate.js";
import { formatDraft, type FormattedDraft, type Platform, PLATFORMS } from "./platform.js";

export const ALL_PLATFORMS = Object.keys(PLATFORMS) as Platform[];

export interface FanoutBrief {
  topic: string;
  proof?: string;
  offer?: string;
  awareness?: Awareness;
  hashtags?: string[];
  mediaPath?: string;
  mediaAspect?: string;
}

export interface FanoutItem {
  platform: Platform;
  draft: FormattedDraft;
  attempts: number;
  brandClean: boolean;
}

// Generate + format a platform-correct draft for each target platform, concurrently.
export async function fanout(brief: FanoutBrief, platforms: Platform[], gen: Generator): Promise<FanoutItem[]> {
  return Promise.all(
    platforms.map(async (platform) => {
      const g = await generateCaption(
        { platform, topic: brief.topic, proof: brief.proof, offer: brief.offer, awareness: brief.awareness },
        gen,
      );
      const draft = formatDraft({
        platform,
        caption: g.caption,
        hashtags: brief.hashtags,
        mediaPath: brief.mediaPath,
        mediaAspect: brief.mediaAspect,
      });
      return { platform, draft, attempts: g.attempts, brandClean: g.brandClean };
    }),
  );
}
