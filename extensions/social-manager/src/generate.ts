// generate.ts — caption generation routed through the orchestration brain, with the
// Pantheon CATALYST hook doctrine baked into the prompt and the locked brand rule
// enforced DURING generation (regenerate if the model emits a dash or ellipsis).
//
// The generator is injected (the tool wires it to conductor's model caller), so the
// prompt construction and the brand-safety retry loop are pure and unit-tested.

import { brandLint, PLATFORMS, type Platform } from "./platform.js";

export type Awareness = "unaware" | "problem" | "solution" | "product" | "most";

export interface GenerateBrief {
  platform: Platform;
  topic: string;
  proof?: string; // the proof asset to lead with (testimonial, number, demo)
  offer?: string; // the CTA / offer to close on
  awareness?: Awareness; // Schwartz awareness level to match the hook to
}

// Build the elite caption prompt: CATALYST hook doctrine + Business Bible messaging +
// the platform spec + the non-negotiable brand rule.
export function buildCaptionPrompt(brief: GenerateBrief): string {
  const spec = PLATFORMS[brief.platform];
  const lines = [
    `Write ONE ${brief.platform} caption. Topic: ${brief.topic}.`,
    brief.proof ? `Lead with this PROOF: ${brief.proof}.` : "Open on concrete proof, never a bare claim.",
    brief.offer ? `Close with this offer or CTA: ${brief.offer}.` : "",
    "",
    "HOOK DOCTRINE (CATALYST): the first line carries 80% of the value. Use Proof, then Promise, then Plan. Make the first line a thumb stop.",
    "MESSAGING: clear over clever. Write at a 3rd to 5th grade reading level. Proof beats promise. Be specific. Describe the moment, not the category.",
    brief.awareness ? `Audience awareness level: ${brief.awareness}. Match the hook to it.` : "",
    "",
    "BRAND RULE (non negotiable): write with human soul and real emotion. NEVER use an em dash, an en dash, or an ellipsis. No dash characters and no dot dot dot. Use short, clean sentences and periods.",
    `LENGTH: under ${spec.maxCaption} characters. ${spec.notes}.`,
    "Output ONLY the caption text. No hashtags, no quotes, no preamble.",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export type Generator = (prompt: string) => Promise<string>;

export interface GenerateResult {
  caption: string;
  attempts: number;
  brandClean: boolean; // false if it still tripped the brand rule after every attempt
}

// Generate a caption, and if it violates the brand rule, regenerate with an escalating
// correction up to `maxAttempts`. Brand safety is enforced before the copy ever returns.
export async function generateCaption(brief: GenerateBrief, gen: Generator, maxAttempts = 3): Promise<GenerateResult> {
  const base = buildCaptionPrompt(brief);
  let last = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt =
      attempt === 1
        ? base
        : `${base}\n\nYour previous attempt used forbidden punctuation (a dash or an ellipsis). Rewrite it with NONE. Previous attempt:\n${last}`;
    last = (await gen(prompt)).trim();
    if (brandLint(last).length === 0) return { caption: last, attempts: attempt, brandClean: true };
  }
  return { caption: last, attempts: maxAttempts, brandClean: false };
}
