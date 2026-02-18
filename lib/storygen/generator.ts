import { countWords, getWordTargets } from "@/lib/story/length";
import { llm } from "@/lib/llm/client";
import {
  outlineSchema,
  type GenerateStoryInput,
  type Outline,
  type StorySpark,
} from "@/lib/storygen/schemas";

type KidProfile = {
  id: string;
  display_name: string;
  age: number | null;
  themes: string[] | null;
  books_we_like: string[] | null;
};

type AdultProfile = {
  id: string;
  display_name: string;
  persona_label: string | null;
};

export type StoryBible = {
  universeName: string;
  kids: KidProfile[];
  adults: AdultProfile[];
};

type PipelineInput = GenerateStoryInput & {
  storyBible: StoryBible;
};

export type GenerateStoryResult = {
  title: string;
  storyText: string;
  outlineJson: Outline;
  wordCount: number;
  sceneCount: number;
  warnings: string[];
};

export type RepetitionReport = {
  trigramRepeatRatio: number;
  repeatedParagraphCount: number;
  repeatedTrigramExamples: string[];
  hasProblem: boolean;
};

type OutlineRepairFn = (params: {
  invalidText: string;
  reason: string;
}) => Promise<string>;

const END_MARKER = "<END>";

const sparkArcRules: Record<StorySpark, string[]> = {
  adventure: [
    "Clear external goal.",
    "Escalating obstacles.",
    "Physical or environmental challenges.",
    "Strong triumphant ending.",
  ],
  mystery: [
    "Introduce a puzzle or strange event.",
    "At least one false assumption.",
    "Clue-based progression.",
    "Clear reveal.",
  ],
  brave: [
    "Internal fear or challenge.",
    "Self-doubt moment.",
    "One key turning point.",
    "Emotional growth resolution.",
  ],
  friendship: [
    "Relationship tension or misunderstanding.",
    "Honest communication or action.",
    "Restored bond.",
  ],
  silly: [
    "Increasing absurdity.",
    "Escalation pattern using rule of 3.",
    "Clever resolution.",
  ],
  discovery: [
    "Curiosity-driven exploration.",
    "Learning moment.",
    "Awe-based ending.",
  ],
  helper: [
    "Someone in need.",
    "Attempts that do not fully work.",
    "Creative problem solving.",
    "Gratitude resolution.",
  ],
  magic: [
    "Introduce a magical element with a clear rule.",
    "Show a consequence of magic.",
    "Emotional integration in the ending.",
  ],
};

function sparkLabel(spark: StorySpark): string {
  return spark.charAt(0).toUpperCase() + spark.slice(1);
}

function toneFromSpark(spark: StorySpark): "calm bedtime" | "silly" | "adventurous" {
  if (spark === "silly") return "silly";
  if (spark === "friendship" || spark === "helper" || spark === "discovery") return "calm bedtime";
  return "adventurous";
}

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, "");
}

function tokenizeWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
}

function repeatedTrigrams(text: string): { ratio: number; examples: string[] } {
  const words = tokenizeWords(text);
  if (words.length < 6) return { ratio: 0, examples: [] };

  const counts = new Map<string, number>();
  for (let i = 0; i < words.length - 2; i += 1) {
    const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    counts.set(tri, (counts.get(tri) ?? 0) + 1);
  }

  const repeats = [...counts.entries()].filter(([, c]) => c >= 2);
  const repeatedOccurrences = repeats.reduce((sum, [, c]) => sum + (c - 1), 0);
  const total = Math.max(1, words.length - 2);
  const ratio = repeatedOccurrences / total;

  return { ratio, examples: repeats.slice(0, 5).map(([tri]) => tri) };
}

function repeatedParagraphs(text: string): number {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const counts = new Map<string, number>();
  for (const p of paragraphs) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts.values()].filter((c) => c > 1).length;
}

export function detectRepetition(text: string): RepetitionReport {
  const trigram = repeatedTrigrams(text);
  const repeatedParagraphCount = repeatedParagraphs(text);
  const hasProblem = trigram.ratio > 0.02 || repeatedParagraphCount > 0;

  return {
    trigramRepeatRatio: trigram.ratio,
    repeatedParagraphCount,
    repeatedTrigramExamples: trigram.examples,
    hasProblem,
  };
}

function sceneCountForLength(lengthMinutes: number): number {
  if (lengthMinutes <= 5) return 6;
  if (lengthMinutes <= 10) return 8;
  if (lengthMinutes <= 20) return 12;
  return 12;
}

function averageAudienceAge(input: PipelineInput): number {
  const kidAges = input.storyBible.kids
    .map((k) => k.age)
    .filter((a): a is number => typeof a === "number" && Number.isFinite(a));
  const allAges = [input.audienceAge, ...kidAges];
  const sum = allAges.reduce((acc, age) => acc + age, 0);
  return sum / allAges.length;
}

function sentenceLimitForAge(age: number): number {
  if (age <= 4) return 12;
  if (age <= 6) return 16;
  if (age <= 8) return 20;
  return 24;
}

function readingLevelFromAverageAge(age: number): string {
  if (age <= 4) return "ages 4-5";
  if (age <= 7) return "ages 5-7";
  return "ages 6-8";
}

function parseJsonFromText(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) throw new Error("No JSON object found");
  return JSON.parse(trimmed.slice(first, last + 1)) as unknown;
}

function compactOutlineSchemaDescription(): string {
  return [
    "{",
    '  "title": string,',
    '  "target_audience_age": string,',
    '  "tone": "calm bedtime" | "silly" | "adventurous",',
    '  "characters": [{ "name": string, "traits": string[], "relationship": string }],',
    '  "setting": string,',
    '  "scenes": [{',
    '    "scene_id": string, "scene_goal": string, "new_event": string, "new_detail": string,',
    '    "conflict_turn": string, "mini_payoff": string',
    "  }],",
    '  "ending_payoff": string,',
    '  "theme": string',
    "}",
  ].join("\n");
}

async function repairOutlineJsonWithLlm(params: {
  invalidText: string;
  reason: string;
}): Promise<string> {
  const repaired = await llm.generate({
    system: "You are a JSON repair tool.",
    messages: [
      {
        role: "user",
        content: [
          "Fix this into valid JSON that matches the schema exactly.",
          "Output ONLY JSON.",
          "Preserve the existing object structure and values whenever possible.",
          "Only fill or correct missing/empty required fields; do not invent unrelated new content.",
          "Requirements:",
          "- double-quoted keys and string values",
          "- no trailing commas",
          "- no comments",
          "- no markdown fences",
          "",
          `Reason for repair: ${params.reason}`,
          "",
          "Schema:",
          compactOutlineSchemaDescription(),
          "",
          "Invalid input:",
          params.invalidText,
        ].join("\n"),
      },
    ],
    model: "gpt-4.1-mini",
    temperature: 0.2,
    presence_penalty: 0,
    frequency_penalty: 0,
    max_tokens: 2500,
  });

  return repaired.trim();
}

function extractFirstTopLevelObjectString(text: string): string {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No top-level JSON object found in outline response.");
  }
  return text.slice(first, last + 1);
}

function stripEndMarkerAndTail(text: string): string {
  const idx = text.indexOf(END_MARKER);
  if (idx === -1) return text.trim();
  return text.slice(0, idx).trim();
}

function normalizeParagraphForCompare(paragraph: string): string {
  return paragraph.replace(/\s+/g, " ").trim().toLowerCase();
}

export function cleanupTrailingDuplicateEndingParagraphs(text: string): string {
  const normalizedNewlines = text.replace(/\r\n/g, "\n").trim();
  if (!normalizedNewlines) return "";

  const paragraphs = normalizedNewlines
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length < 2) return paragraphs.join("\n\n");

  let duplicateCount = 1;
  const endParagraphNormalized = normalizeParagraphForCompare(paragraphs[paragraphs.length - 1]);

  for (let i = paragraphs.length - 2; i >= 0; i -= 1) {
    if (normalizeParagraphForCompare(paragraphs[i]) !== endParagraphNormalized) break;
    duplicateCount += 1;
  }

  if (duplicateCount < 2) return paragraphs.join("\n\n");

  const keepUntil = paragraphs.length - duplicateCount;
  const deduped = paragraphs.slice(0, keepUntil).concat(paragraphs[paragraphs.length - 1]);
  return deduped.join("\n\n");
}

function sanitizeFinalStoryText(text: string): string {
  return cleanupTrailingDuplicateEndingParagraphs(stripEndMarkerAndTail(text));
}

export async function parseOutlineStrict(
  text: string,
  opts?: { repairFn?: OutlineRepairFn }
): Promise<{ outline: Outline; warnings: string[] }> {
  const repairFn = opts?.repairFn ?? repairOutlineJsonWithLlm;
  const warnings: string[] = [];
  let repairUsed = false;

  let parsed: unknown;
  let candidateText = text.trim();

  try {
    parsed = JSON.parse(candidateText) as unknown;
  } catch {
    try {
      candidateText = extractFirstTopLevelObjectString(candidateText);
      parsed = JSON.parse(candidateText) as unknown;
    } catch {
      const repaired = await repairFn({
        invalidText: text,
        reason: "JSON.parse failed for both raw text and extracted object substring.",
      });
      parsed = JSON.parse(repaired) as unknown;
      candidateText = repaired;
      repairUsed = true;
    }
  }

  let validated = outlineSchema.safeParse(parsed);
  if (!validated.success) {
    const issueText = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
    const repaired = await repairFn({
      invalidText: candidateText,
      reason: `Outline schema validation failed: ${issueText}`,
    });
    const reparsed = JSON.parse(repaired) as unknown;
    const revalidated = outlineSchema.safeParse(reparsed);
    if (!revalidated.success) {
      throw new Error(
        `Outline JSON repair failed schema validation: ${revalidated.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" | ")}`
      );
    }
    validated = revalidated;
    repairUsed = true;
  }

  // Successful auto-repair is treated as an internal resilience step, not a user-facing warning.
  void repairUsed;

  return { outline: validated.data, warnings };
}

function getCharacterSummary(storyBible: StoryBible): string {
  const kids = storyBible.kids.map((k) => {
    const themes = k.themes?.length ? `themes: ${k.themes.join(", ")}` : "";
    const books = k.books_we_like?.length ? `books: ${k.books_we_like.join(", ")}` : "";
    return `Kid ${k.display_name}${k.age ? ` (age ${k.age})` : ""}${themes ? `; ${themes}` : ""}${books ? `; ${books}` : ""}`;
  });
  const adults = storyBible.adults.map((a) => {
    const persona = a.persona_label ? `persona: ${a.persona_label}` : "supportive adult";
    return `Adult ${a.display_name}; ${persona}`;
  });
  return [...kids, ...adults].join("\n");
}

function buildOutlinePrompt(input: PipelineInput, sceneCount: number): string {
  const avgAge = averageAudienceAge(input);
  const sparkRules = sparkArcRules[input.storySpark].map((rule) => `- ${rule}`).join("\n");
  const derivedTone = toneFromSpark(input.storySpark);
  return [
    "Create a coherent children's story outline.",
    "You must structure the story according to the selected Story Spark arc.",
    `Mode: ${input.surpriseVsGuided}`,
    `Story Spark: ${sparkLabel(input.storySpark)}`,
    `Tone: ${derivedTone}`,
    `Audience profile: user audience age ${input.audienceAge}, average age with selected kids ${avgAge.toFixed(1)}`,
    `Audience reading level: ${readingLevelFromAverageAge(avgAge)}`,
    `Setting context: ${input.storyBible.universeName}`,
    `Optional author prompt: ${input.optionalPrompt || "none"}`,
    `Characters:\n${getCharacterSummary(input.storyBible)}`,
    "Story Spark arc requirements:",
    sparkRules,
    `Create exactly ${sceneCount} scenes.`,
    "Each scene must include one genuinely new event and one new sensory detail.",
    "conflict_turn MUST NOT be empty.",
    "If a scene has no conflict, write a gentle micro-conflict (example: 'A small challenge arises, so they pause and solve it together.').",
    "Ensure beats and scene progression explicitly reflect the selected Story Spark arc; reject generic arcs.",
    "Output ONLY JSON. No markdown fences. No commentary.",
    "All keys must be double-quoted. No trailing commas. No comments.",
    "JSON must match the schema exactly.",
    "Output JSON only with keys:",
    "title, target_audience_age, tone, characters, setting, scenes, ending_payoff, theme",
    "Scene keys: scene_id, scene_goal, new_event, new_detail, conflict_turn, mini_payoff",
  ].join("\n");
}

function outlineJsonSchema(sceneCount: number): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "target_audience_age",
      "tone",
      "characters",
      "setting",
      "scenes",
      "ending_payoff",
      "theme",
    ],
    properties: {
      title: { type: "string", minLength: 1 },
      target_audience_age: { type: "string", minLength: 1 },
      tone: { type: "string", enum: ["calm bedtime", "silly", "adventurous"] },
      characters: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "traits", "relationship"],
          properties: {
            name: { type: "string", minLength: 1 },
            traits: {
              type: "array",
              minItems: 1,
              items: { type: "string", minLength: 1 },
            },
            relationship: { type: "string", minLength: 1 },
          },
        },
      },
      setting: { type: "string", minLength: 1 },
      scenes: {
        type: "array",
        minItems: sceneCount,
        maxItems: sceneCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "scene_id",
            "scene_goal",
            "new_event",
            "new_detail",
            "conflict_turn",
            "mini_payoff",
          ],
          properties: {
            scene_id: { type: "string", minLength: 1 },
            scene_goal: { type: "string", minLength: 1 },
            new_event: { type: "string", minLength: 1 },
            new_detail: { type: "string", minLength: 1 },
            conflict_turn: { type: "string", minLength: 1 },
            mini_payoff: { type: "string", minLength: 1 },
          },
        },
      },
      ending_payoff: { type: "string", minLength: 1 },
      theme: { type: "string", minLength: 1 },
    },
  };
}

function buildDraftPrompt(
  input: PipelineInput,
  outline: Outline,
  minWords: number,
  maxWords: number
): string {
  const avgAge = averageAudienceAge(input);
  const sentenceLimit = sentenceLimitForAge(avgAge);
  const perSceneMax = Math.max(90, Math.floor(maxWords / outline.scenes.length));
  const derivedTone = toneFromSpark(input.storySpark);
  const toneText =
    derivedTone === "calm bedtime"
      ? "calm bedtime: soothing, safe, gentle emotional arc"
      : derivedTone === "silly"
        ? "silly: playful, funny, kind"
        : "adventurous: exciting but kid-safe and not scary";
  const sparkRules = sparkArcRules[input.storySpark].map((rule) => `- ${rule}`).join("\n");

  return [
    "Write the full story from this outline.",
    `Required word count: between ${minWords} and ${maxWords} words. Never fewer than ${minWords}.`,
    `Per scene max: about ${perSceneMax} words.`,
    `Reading level: ${readingLevelFromAverageAge(avgAge)} (average age ${avgAge.toFixed(1)}).`,
    `Sentence limit: keep most sentences at or below ${sentenceLimit} words.`,
    `Story Spark: ${sparkLabel(input.storySpark)}.`,
    "Story Spark arc requirements to enforce:",
    sparkRules,
    `Tone guidance: ${toneText}.`,
    "For EACH scene include:",
    "- one new event",
    "- one new sensory detail",
    "- one line of dialogue",
    "No bullet lists. Narrative prose only.",
    "Do not reuse any sentence verbatim.",
    "Avoid repetitive openers like 'and then' or repeated catchphrases.",
    "Keep pacing forward and coherent scene-to-scene.",
    "Finish with an emotionally satisfying payoff and calm closing beat.",
    "Outline JSON:",
    JSON.stringify(outline),
  ].join("\n");
}

function buildSparkSelfCheckPrompt(input: PipelineInput, draft: string): string {
  const sparkRules = sparkArcRules[input.storySpark].map((rule) => `- ${rule}`).join("\n");
  return [
    "Evaluate this draft for Story Spark alignment.",
    `Selected Story Spark: ${sparkLabel(input.storySpark)}.`,
    "Story Spark required elements:",
    sparkRules,
    "If the draft does not clearly match the Spark arc, revise it so it does.",
    "Keep tone, characters, and plot coherence intact.",
    "Return JSON only with keys:",
    '- "matches_spark" (boolean)',
    '- "revised_story" (string)',
    "If it already matches, return revised_story as the original draft text.",
    "Draft story:",
    draft,
  ].join("\n");
}

function parseSparkSelfCheck(raw: string): { matchesSpark: boolean; revisedStory: string } {
  const parsed = parseJsonFromText(raw) as { matches_spark?: unknown; revised_story?: unknown };
  const matchesSpark = parsed.matches_spark === true;
  const revisedStory =
    typeof parsed.revised_story === "string" && parsed.revised_story.trim().length > 0
      ? parsed.revised_story.trim()
      : "";
  if (!revisedStory) {
    throw new Error("Missing revised_story from Spark self-check.");
  }
  return { matchesSpark, revisedStory };
}

function buildRewritePrompt(
  input: PipelineInput,
  outline: Outline,
  draft: string,
  minWords: number,
  maxWords: number,
  extraNotes?: string
): string {
  return [
    "You are editing a children's story for quality.",
    `Target words: ${minWords}-${maxWords}.`,
    `Story Spark: ${sparkLabel(input.storySpark)}.`,
    `Tone: ${toneFromSpark(input.storySpark)}.`,
    "Step 1: write a brief critique (4-8 bullet points) focusing on repetition, pacing, distinct scenes, and emotional payoff.",
    "Step 2: rewrite the story to fix those issues.",
    "Rewrite rules:",
    "- preserve core plot and ending payoff from outline",
    "- reduce repeated phrases and vary sentence openings",
    "- no scary violence, no gore, no explicit content",
    "- keep age-appropriate for 4-7",
    "- narrative prose only",
    "- do NOT add filler to reach length",
    "- if too short, add ONE new micro-scene with a new event instead of repeating content",
    "- ensure the ending paragraph is unique and appears exactly once",
    `- end the revised story with exactly one ${END_MARKER} marker on its own line`,
    extraNotes ? `Additional fix: ${extraNotes}` : "",
    "Return JSON only with keys: critique, revised_story",
    "Outline JSON:",
    JSON.stringify(outline),
    "Draft story:",
    draft,
  ]
    .filter(Boolean)
    .join("\n");
}

function fallbackOutline(input: PipelineInput, sceneCount: number): Outline {
  const baseCharacters = [
    ...input.storyBible.kids.map((k) => ({
      name: k.display_name,
      traits:
        [...(k.themes ?? []), ...(k.books_we_like ?? [])].slice(0, 3).filter(Boolean).length > 0
          ? [...(k.themes ?? []), ...(k.books_we_like ?? [])].slice(0, 3).filter(Boolean)
          : ["curious", "kind"],
      relationship: "family kid",
    })),
    ...input.storyBible.adults.map((a) => ({
      name: a.display_name,
      traits: a.persona_label ? [a.persona_label, "caring"] : ["caring", "wise"],
      relationship: "family adult",
    })),
  ];

  const characters = baseCharacters.length
    ? baseCharacters
    : [{ name: "Milo", traits: ["curious", "gentle"], relationship: "story hero" }];

  const scenes = Array.from({ length: sceneCount }).map((_, i) => ({
    scene_id: `scene_${i + 1}`,
    scene_goal: i === 0 ? "discover a small mystery" : i === sceneCount - 1 ? "resolve and rest" : "move toward the solution",
    new_event: `A new clue appears in ${input.storyBible.universeName}.`,
    new_detail: `The air smells like warm cinnamon and soft rain.`,
    conflict_turn: `They briefly lose track of the path but stay calm and work together.`,
    mini_payoff: `They learn one useful idea and take the next step.`,
  }));

  return {
    title: "The Lantern Trail in Story Universe",
    target_audience_age: "ages 4-7",
    tone: toneFromSpark(input.storySpark),
    characters,
    setting: input.storyBible.universeName,
    scenes,
    ending_payoff: "The family solves the mystery and settles into cozy bedtime.",
    theme: "Kind teamwork turns small worries into wonder.",
  };
}

function fallbackDraft(outline: Outline, minWords: number): string {
  const paragraphs: string[] = [];

  for (const scene of outline.scenes) {
    paragraphs.push(
      `${scene.scene_goal}. ${scene.new_event} ${scene.new_detail} "${outline.characters[0]?.name} whispered, 'Let's stay together and be brave.'" ${scene.conflict_turn} ${scene.mini_payoff}`
    );
  }

  const filler = [
    "They paused, listened, and noticed how the moonlight made everything feel a little safer.",
    "Each step taught them to breathe slowly, think clearly, and keep kindness at the center.",
    "By sharing ideas and encouraging one another, they turned every obstacle into a new chance to grow.",
  ];

  let i = 0;
  while (countWords(paragraphs.join("\n\n")) < minWords) {
    paragraphs.splice(Math.max(1, paragraphs.length - 1), 0, filler[i % filler.length]);
    i += 1;
  }

  return paragraphs.join("\n\n");
}

function parseRewriteJson(raw: string): { critique: string; revised_story: string } {
  const parsed = parseJsonFromText(raw) as { critique?: unknown; revised_story?: unknown };
  const critique = typeof parsed.critique === "string" ? parsed.critique.trim() : "";
  const revisedRaw = typeof parsed.revised_story === "string" ? parsed.revised_story.trim() : "";
  const revised = sanitizeFinalStoryText(revisedRaw);
  if (!revised) throw new Error("Missing revised_story in rewrite output.");
  return { critique, revised_story: revised };
}

function finalizeWordLength(story: string): string {
  return sanitizeFinalStoryText(story);
}

export async function generateStory(input: PipelineInput): Promise<GenerateStoryResult> {
  const warnings: string[] = [];
  const sceneCount = sceneCountForLength(input.lengthMinutes);
  const targets = getWordTargets(input.lengthMinutes);

  let outline: Outline;
  let outlineRaw = "";

  try {
    outlineRaw = await llm.generate({
      system:
        "You are an expert children's story architect. You must structure the story according to the selected Story Spark arc. Output strictly valid JSON only, no markdown.",
      messages: [{ role: "user", content: buildOutlinePrompt(input, sceneCount) }],
      model: "gpt-4.1-mini",
      temperature: 0.8,
      presence_penalty: 0.7,
      frequency_penalty: 0.7,
      max_tokens: 2200,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "story_outline",
          strict: true,
          schema: outlineJsonSchema(sceneCount),
        },
      },
    });
    const parsedOutline = await parseOutlineStrict(outlineRaw);
    outline = parsedOutline.outline;
    warnings.push(...parsedOutline.warnings);
  } catch (firstError) {
    warnings.push(
      `Outline parse/repair failed; regenerating outline once: ${firstError instanceof Error ? firstError.message : "unknown error"}`
    );
    try {
      const regeneratedOutlineRaw = await llm.generate({
        system:
          "You are an expert children's story architect. You must structure the story according to the selected Story Spark arc. Output strictly valid JSON only, no markdown.",
        messages: [
          {
            role: "user",
            content: [
              buildOutlinePrompt(input, sceneCount),
              "Regeneration instruction: fill every required string field with meaningful non-empty text.",
              "conflict_turn must always be meaningful and non-empty.",
            ].join("\n"),
          },
        ],
        model: "gpt-4.1-mini",
        temperature: 0.7,
        presence_penalty: 0.6,
        frequency_penalty: 0.6,
        max_tokens: 2200,
      });
      const parsedOutline = await parseOutlineStrict(regeneratedOutlineRaw);
      outline = parsedOutline.outline;
      warnings.push(...parsedOutline.warnings);
      warnings.push("Outline was regenerated after parse/validation failure.");
    } catch (error) {
      warnings.push(`Outline fallback used: ${error instanceof Error ? error.message : "unknown error"}`);
      outline = fallbackOutline(input, sceneCount);
    }
  }

  let draft = "";
  try {
    draft = await llm.generate({
      system:
        "You are a world-class children's storyteller. Keep prose varied, coherent, and child-safe.",
      messages: [
        {
          role: "user",
          content: buildDraftPrompt(input, outline, targets.min, targets.max),
        },
      ],
      model: "gpt-4.1-mini",
      temperature: 0.95,
      presence_penalty: 0.8,
      frequency_penalty: 0.8,
      max_tokens: 6000,
    });
  } catch (error) {
    warnings.push(`Draft fallback used: ${error instanceof Error ? error.message : "unknown error"}`);
    draft = fallbackDraft(outline, targets.min);
  }

  try {
    const sparkCheckRaw = await llm.generate({
      system:
        "You are a strict story-structure evaluator. Check Spark arc fit and revise if needed. Return JSON only.",
      messages: [
        {
          role: "user",
          content: buildSparkSelfCheckPrompt(input, draft),
        },
      ],
      model: "gpt-4.1-mini",
      temperature: 0.4,
      presence_penalty: 0.2,
      frequency_penalty: 0.2,
      max_tokens: 6500,
    });
    const sparkCheck = parseSparkSelfCheck(sparkCheckRaw);
    draft = sparkCheck.revisedStory;
    if (!sparkCheck.matchesSpark) {
      warnings.push("Draft was revised to better match the selected Story Spark arc.");
    }
  } catch (error) {
    warnings.push(`Spark self-check skipped: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  let revised = draft;
  try {
    const rewriteRaw = await llm.generate({
      system:
        "You are an elite story editor for children's fiction. Return strict JSON only.",
      messages: [
        {
          role: "user",
          content: buildRewritePrompt(input, outline, draft, targets.min, targets.max),
        },
      ],
      model: "gpt-4.1-mini",
      temperature: 0.85,
      presence_penalty: 0.75,
      frequency_penalty: 0.85,
      max_tokens: 6500,
    });
    const rewrite = parseRewriteJson(rewriteRaw);
    revised = rewrite.revised_story;
  } catch (error) {
    warnings.push(`Rewrite pass fallback used: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  let repetition = detectRepetition(revised);
  if (repetition.hasProblem) {
    warnings.push(
      `Repetition detected (ratio=${repetition.trigramRepeatRatio.toFixed(3)}, repeatedParagraphs=${repetition.repeatedParagraphCount})`
    );

    try {
      const secondRewriteRaw = await llm.generate({
        system:
          "You are an elite story editor for children's fiction. Return strict JSON only.",
        messages: [
          {
            role: "user",
            content: buildRewritePrompt(
              input,
              outline,
              revised,
              targets.min,
              targets.max,
              "Eliminate trigram repetition and any repeated paragraphs."
            ),
          },
        ],
        model: "gpt-4.1-mini",
        temperature: 0.8,
        presence_penalty: 0.9,
        frequency_penalty: 0.9,
        max_tokens: 6500,
      });
      revised = parseRewriteJson(secondRewriteRaw).revised_story;
      repetition = detectRepetition(revised);
      if (repetition.hasProblem) {
        warnings.push("Repetition remained after second rewrite pass.");
      }
    } catch (error) {
      warnings.push(`Second rewrite pass failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  revised = finalizeWordLength(revised);
  const wordCount = countWords(revised);

  if (wordCount < targets.min) warnings.push(`Final story still below minimum words (${wordCount} < ${targets.min}).`);
  if (wordCount > targets.max * 1.2) warnings.push(`Final story significantly above max words (${wordCount} > ${targets.max}).`);

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[storygen] length=${input.lengthMinutes} words=${wordCount} target=${targets.min}-${targets.max} scenes=${outline.scenes.length}`
    );
  }

  return {
    title: outline.title,
    storyText: revised,
    outlineJson: outline,
    wordCount,
    sceneCount: outline.scenes.length,
    warnings,
  };
}

