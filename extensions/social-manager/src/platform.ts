// platform.ts — platform-correct + brand-safe draft formatting.
//
// The "elite" half of the social manager: a post is formatted to each platform's real
// constraints (caption length, hashtag count, aspect ratio) AND linted against the locked
// Parallax brand rule (no em/en dashes, no ellipses, no AI-tell punctuation). A draft
// that violates either is flagged before it ever reaches the queue. Pure + unit-tested.

export type Platform = "tiktok" | "instagram_reels" | "instagram_feed" | "x" | "youtube_shorts" | "linkedin";

export interface PlatformSpec {
  maxCaption: number;
  maxHashtags: number; // elite best-practice cap, not the platform's hard maximum
  aspectRatio: string;
  maxDurationSec: number | null;
  notes: string;
}

export const PLATFORMS: Record<Platform, PlatformSpec> = {
  tiktok: { maxCaption: 2200, maxHashtags: 5, aspectRatio: "9:16", maxDurationSec: 180, notes: "hook in frame 0; sound-on" },
  instagram_reels: { maxCaption: 2200, maxHashtags: 5, aspectRatio: "9:16", maxDurationSec: 90, notes: "safe-zone top/bottom 14%" },
  instagram_feed: { maxCaption: 2200, maxHashtags: 10, aspectRatio: "4:5", maxDurationSec: null, notes: "4:5 wins the most feed real estate" },
  x: { maxCaption: 280, maxHashtags: 2, aspectRatio: "16:9", maxDurationSec: 140, notes: "lead with the claim; 1-2 tags max" },
  youtube_shorts: { maxCaption: 100, maxHashtags: 3, aspectRatio: "9:16", maxDurationSec: 60, notes: "title is the caption; <60s" },
  linkedin: { maxCaption: 3000, maxHashtags: 3, aspectRatio: "1:1", maxDurationSec: null, notes: "first 2 lines before the fold" },
};

// The locked Parallax brand rule (see brand-voice-no-ai-syntax): never ship copy with
// em/en dashes, ellipses, or other AI-tell punctuation. These are blocking.
const BRAND_FORBIDDEN: Array<{ re: RegExp; label: string }> = [
  { re: /—/g, label: "em dash" },
  { re: /–/g, label: "en dash" },
  { re: /…/g, label: "ellipsis character" },
  { re: /\.\.\./g, label: "three-dot ellipsis" },
];

export interface BrandIssue {
  label: string;
  count: number;
}

export function brandLint(text: string): BrandIssue[] {
  const out: BrandIssue[] = [];
  for (const { re, label } of BRAND_FORBIDDEN) {
    const n = (text.match(re) ?? []).length;
    if (n > 0) out.push({ label, count: n });
  }
  return out;
}

export interface DraftInput {
  platform: Platform;
  caption: string;
  hashtags?: string[];
  mediaPath?: string;
  mediaAspect?: string; // e.g. "9:16" — validated against the platform spec when given
}

export interface FormattedDraft {
  platform: Platform;
  caption: string; // caption + hashtags, formatted to spec
  hashtags: string[]; // normalized, capped
  warnings: string[]; // non-blocking advisories (truncation, dropped tags, aspect mismatch)
  brandIssues: BrandIssue[]; // blocking brand-rule violations
  valid: boolean; // false if any brandIssue (never auto-fixed — copy must be rewritten)
}

function normalizeHashtags(tags: string[]): string[] {
  return tags
    .map((t) => t.trim().replace(/^#+/, "").replace(/\s+/g, ""))
    .filter(Boolean)
    .map((t) => `#${t}`);
}

// Truncate to a length at a word boundary WITHOUT adding an ellipsis (brand rule).
function clampWords(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return { text: (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd(), truncated: true };
}

export function formatDraft(input: DraftInput): FormattedDraft {
  const spec = PLATFORMS[input.platform];
  const warnings: string[] = [];
  const brandIssues = brandLint(input.caption);

  let hashtags = normalizeHashtags(input.hashtags ?? []);
  if (hashtags.length > spec.maxHashtags) {
    warnings.push(`kept ${spec.maxHashtags} of ${hashtags.length} hashtags (${input.platform} best practice)`);
    hashtags = hashtags.slice(0, spec.maxHashtags);
  }

  if (input.mediaAspect && input.mediaAspect !== spec.aspectRatio) {
    warnings.push(`media is ${input.mediaAspect} but ${input.platform} wants ${spec.aspectRatio}`);
  }

  const tagLine = hashtags.join(" ");
  const room = spec.maxCaption - (tagLine ? tagLine.length + 2 : 0);
  const body = clampWords(input.caption.trim(), Math.max(0, room));
  if (body.truncated) warnings.push(`caption truncated to ${input.platform}'s ${spec.maxCaption}-char limit`);
  const caption = tagLine ? `${body.text}\n\n${tagLine}` : body.text;

  return { platform: input.platform, caption, hashtags, warnings, brandIssues, valid: brandIssues.length === 0 };
}
