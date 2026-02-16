import { z } from "zod";

export const ageRangeSchema = z.enum(["3-4", "5-6", "7-8", "9-10"]);
export const styleSchema = z.enum(["Plain & Clear", "A Little Playful", "Poetic"]);
export const phaseSchema = z.enum(["outline", "draft", "final"]);

export type AgeRange = z.infer<typeof ageRangeSchema>;
export type StoryStyle = z.infer<typeof styleSchema>;
export type StoryPhase = z.infer<typeof phaseSchema>;

export const structuredStoryInputSchema = z.object({
  ageRange: ageRangeSchema,
  mainCharacter: z.string().trim().min(1),
  setting: z.string().trim().min(1),
  lengthWords: z.number().int().min(120).max(6000),
  style: styleSchema,
});

export type StructuredStoryInput = z.infer<typeof structuredStoryInputSchema>;

export function maxWordsPerSentence(ageRange: AgeRange): number {
  if (ageRange === "3-4") return 12;
  if (ageRange === "5-6") return 16;
  if (ageRange === "7-8") return 20;
  return 24;
}

function baseRulesBlock(input: StructuredStoryInput): string {
  const sentenceMax = maxWordsPerSentence(input.ageRange);

  return [
    "You are a children's story generation assistant.",
    "Follow the rules exactly and produce structured outputs.",
    "",
    "INPUT VARIABLES:",
    `- AGE_RANGE: ${input.ageRange}`,
    `- MAIN_CHARACTER: ${input.mainCharacter}`,
    `- SETTING: ${input.setting}`,
    `- LENGTH_WORDS: ~${input.lengthWords}`,
    `- STYLE: ${input.style}`,
    "",
    "GLOBAL RULES:",
    "- Story must include clear goal, obstacle, and satisfying resolution.",
    "- Tie up every introduced element by the end.",
    `- Maximum ${sentenceMax} words per sentence.`,
    "- Keep vocabulary age-appropriate.",
    "- No semicolons. Minimal commas.",
    "- Keep content safe and kid-appropriate.",
  ].join("\n");
}

function styleRules(style: StoryStyle): string {
  if (style === "Plain & Clear") {
    return "- Style: Plain & Clear. Avoid alliteration and poetic devices.";
  }
  if (style === "A Little Playful") {
    return "- Style: A Little Playful. Occasional fun language is allowed, but avoid overuse.";
  }
  return "- Style: Poetic. Allow only light alliteration, max 1 cluster per 200 words.";
}

function phaseSpecificRules(phase: StoryPhase): string {
  if (phase === "outline") {
    return [
      "PHASE 1 — OUTLINE_BEATS (JSON):",
      "- Output valid JSON only.",
      '- Include key "OUTLINE_BEATS" as an array of exactly 6 objects.',
      "- Beats must be in this exact order:",
      '  1) Hook, 2) Goal, 3) Obstacle, 4) Attempt1, 5) Attempt2, 6) Climax + Resolution',
      '- Each object must include keys: "beat", "summary".',
      "- No markdown fences. No commentary.",
    ].join("\n");
  }

  if (phase === "draft") {
    return [
      "PHASE 2 — DRAFT_STORY:",
      '- Output must start with the label exactly: "DRAFT_STORY:"',
      "- Write one paragraph per beat in order (6 paragraphs total).",
      "- Use simple clear prose matching the age range.",
      "- Keep total length near LENGTH_WORDS.",
      "- Output only the DRAFT_STORY phase content.",
    ].join("\n");
  }

  return [
    "PHASE 3 — FINAL_STORY:",
    '- Output must start with the label exactly: "FINAL_STORY:"',
    "- Polish the draft while preserving plot and structure.",
    "- Reduce repetition, improve rhythm, and keep clarity for the age range.",
    "- Keep all plot threads resolved.",
    "- Output only the FINAL_STORY phase content.",
  ].join("\n");
}

export function buildPhasePrompt(input: StructuredStoryInput, phase: StoryPhase): string {
  return [
    baseRulesBlock(input),
    styleRules(input.style),
    "",
    phaseSpecificRules(phase),
  ].join("\n");
}
