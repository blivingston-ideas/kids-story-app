"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import {
  generatedStorySchema,
  parseCharacterRefs,
  parseLengthMinutes,
  wizardInputSchema,
  type WizardInput,
} from "@/lib/validation/stories";
import { countWords, getParagraphGuidance, getWordTargets } from "@/lib/story/length";

export type GenerateState = {
  ok: boolean;
  error: string | null;
  generatedTitle: string;
  generatedContent: string;
  generatedBlurb: string;
  readingTimeEstimate: number;
  spark: string;
};

const defaultGenerateState: GenerateState = {
  ok: false,
  error: null,
  generatedTitle: "",
  generatedContent: "",
  generatedBlurb: "",
  readingTimeEstimate: 0,
  spark: "",
};

const sparks = [
  "a hidden key wrapped in ribbon",
  "a glowing map that appears in moonlight",
  "a friendly firefly guide",
  "a tiny secret door in a bookshelf",
  "a singing seashell with clues",
  "a lost letter from tomorrow",
  "a sleepy dragon who needs help",
  "a pocket compass that points to kindness",
] as const;

const safeLessonIdeas = [
  "teamwork",
  "patience",
  "kindness",
  "curiosity",
  "bravery with gentleness",
  "listening",
] as const;

type GeneratedPayload = {
  title: string;
  short_blurb: string;
  story: string;
  reading_time_minutes_estimate: number;
};

type StorySpec = {
  mode: "surprise" | "guided";
  tone: "calm" | "silly" | "adventurous";
  lengthMinutes: number;
  targetWordCount: number;
  targetWordMin: number;
  targetWordMax: number;
  paragraphGuidance: string;
  readingLevel: "ages 2-4" | "ages 5-7" | "ages 8+";
  stage: string;
  guided: {
    beginning: string;
    middle: string;
    ending: string;
  } | null;
  spark: string;
  lessonHint: string;
  characters: Array<{
    type: "kid" | "adult" | "custom";
    name: string;
    details: string;
  }>;
};

function randomFrom<T>(list: readonly T[]): T {
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function pickSeeded<T>(list: readonly T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

function readingLevelFromYoungestAge(ages: Array<number | null>): "ages 2-4" | "ages 5-7" | "ages 8+" {
  const concreteAges = ages.filter((a): a is number => typeof a === "number" && Number.isFinite(a));
  if (concreteAges.length === 0) return "ages 5-7";
  const youngest = Math.min(...concreteAges);
  if (youngest <= 4) return "ages 2-4";
  if (youngest <= 7) return "ages 5-7";
  return "ages 8+";
}

function stripCodeFences(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractLikelyJson(raw: string): string | null {
  const cleaned = stripCodeFences(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

function coerceGeneratedPayload(raw: string): GeneratedPayload | null {
  const jsonCandidate = extractLikelyJson(raw);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as {
        title?: unknown;
        short_blurb?: unknown;
        story?: unknown;
        reading_time_minutes_estimate?: unknown;
      };

      const storyParsed = generatedStorySchema.safeParse({
        title: parsed.title,
        content: parsed.story,
      });

      if (storyParsed.success) {
        const est = Number(parsed.reading_time_minutes_estimate);
        return {
          title: storyParsed.data.title,
          short_blurb:
            typeof parsed.short_blurb === "string" && parsed.short_blurb.trim().length > 0
              ? parsed.short_blurb.trim()
              : "A warm family adventure for bedtime.",
          story: storyParsed.data.content,
          reading_time_minutes_estimate: Number.isFinite(est) ? Math.max(1, Math.round(est)) : 0,
        };
      }
    } catch {
      // fall through to plain text parser
    }
  }

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const title = lines[0].replace(/^title\s*:\s*/i, "").trim();
  const story = lines.slice(1).join("\n\n").trim();
  if (!title || !story) return null;

  const storyParsed = generatedStorySchema.safeParse({ title, content: story });
  if (!storyParsed.success) return null;

  return {
    title: storyParsed.data.title,
    short_blurb: "A warm family adventure for bedtime.",
    story: storyParsed.data.content,
    reading_time_minutes_estimate: 0,
  };
}

function parseWizardInput(formData: FormData): WizardInput {
  const parsed = wizardInputSchema.safeParse({
    mode: String(formData.get("mode") ?? ""),
    guidedBeginning: String(formData.get("guidedBeginning") ?? ""),
    guidedMiddle: String(formData.get("guidedMiddle") ?? ""),
    guidedEnding: String(formData.get("guidedEnding") ?? ""),
    stage: String(formData.get("stage") ?? ""),
    tone: String(formData.get("tone") ?? ""),
    lengthChoice: String(formData.get("lengthChoice") ?? ""),
    customMinutes: String(formData.get("customMinutes") ?? ""),
    selectedCharactersJson: String(formData.get("selectedCharactersJson") ?? "[]"),
    customCharacterName: String(formData.get("customCharacterName") ?? ""),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid story input.");
  }
  return parsed.data;
}

async function buildStorySpec(input: WizardInput, universeId: string): Promise<StorySpec> {
  const supabase = await createSupabaseServerClient();

  const selectedRefs = parseCharacterRefs(input.selectedCharactersJson);
  const selectedKidIds = selectedRefs.filter((c) => c.type === "kid").map((c) => c.id);
  const selectedAdultIds = selectedRefs.filter((c) => c.type === "adult").map((c) => c.id);

  const [{ data: kids, error: kidsError }, { data: adults, error: adultsError }] = await Promise.all([
    selectedKidIds.length > 0
      ? supabase
          .from("profiles_kid")
          .select("id, display_name, age, themes, books_we_like, character_traits")
          .eq("universe_id", universeId)
          .in("id", selectedKidIds)
      : Promise.resolve({ data: [], error: null }),
    selectedAdultIds.length > 0
      ? supabase
          .from("profiles_adult")
          .select("id, display_name, persona_label")
          .eq("universe_id", universeId)
          .in("id", selectedAdultIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (kidsError) throw new Error(kidsError.message);
  if (adultsError) throw new Error(adultsError.message);

  const kidMap = new Map((kids ?? []).map((k) => [k.id, k]));
  const adultMap = new Map((adults ?? []).map((a) => [a.id, a]));

  const characters: StorySpec["characters"] = [];

  for (const ref of selectedRefs) {
    if (ref.type === "kid") {
      const kid = kidMap.get(ref.id);
      if (!kid) continue;
      const detailParts = [
        typeof kid.age === "number" ? `age ${kid.age}` : null,
        kid.character_traits?.length ? `traits: ${kid.character_traits.join(", ")}` : null,
        kid.themes?.length ? `themes: ${kid.themes.join(", ")}` : null,
        kid.books_we_like?.length ? `favorite books: ${kid.books_we_like.join(", ")}` : null,
      ].filter((v): v is string => Boolean(v));

      characters.push({
        type: "kid",
        name: kid.display_name,
        details: detailParts.join("; ") || "kid character",
      });
      continue;
    }

    const adult = adultMap.get(ref.id);
    if (!adult) continue;
    characters.push({
      type: "adult",
      name: adult.display_name,
      details: adult.persona_label ? `persona: ${adult.persona_label}` : "trusted adult companion",
    });
  }

  if (input.customCharacterName) {
    characters.push({
      type: "custom",
      name: input.customCharacterName,
      details: "custom supporting character",
    });
  }

  const lengthMinutes = parseLengthMinutes(input);
  const targetWords = getWordTargets(lengthMinutes);
  const kidAges = (kids ?? []).map((k) => (typeof k.age === "number" ? k.age : null));

  return {
    mode: input.mode,
    tone: input.tone,
    lengthMinutes,
    targetWordCount: targetWords.target,
    targetWordMin: targetWords.min,
    targetWordMax: targetWords.max,
    paragraphGuidance: getParagraphGuidance(lengthMinutes),
    readingLevel: readingLevelFromYoungestAge(kidAges),
    stage: input.stage,
    guided:
      input.mode === "guided"
        ? {
            beginning: input.guidedBeginning,
            middle: input.guidedMiddle,
            ending: input.guidedEnding,
          }
        : null,
    spark: randomFrom(sparks),
    lessonHint: randomFrom(safeLessonIdeas),
    characters,
  };
}

function promptForSpec(spec: StorySpec): string {
  const toneGuide: Record<StorySpec["tone"], string> = {
    calm: "gentle, soothing, bedtime-safe, cozy pacing",
    silly: "lighthearted, playful, funny-but-kind",
    adventurous: "exciting but emotionally safe, warm and hopeful",
  };

  const characterBlock = spec.characters.length
    ? spec.characters
        .map((c, i) => `${i + 1}. ${c.name} (${c.type}) - ${c.details}`)
        .join("\n")
    : "No fixed characters selected. Create a memorable, age-appropriate main character.";

  const guidedBlock =
    spec.mode === "guided" && spec.guided
      ? `Guided beats:\n- Beginning: ${spec.guided.beginning || "(author left open)"}\n- Middle: ${spec.guided.middle || "(author left open)"}\n- End: ${spec.guided.ending || "(author left open)"}`
      : "Surprise mode: invent a fresh plot aligned to the stage context.";

  return [
    "Story specification:",
    `- Mode: ${spec.mode}`,
    `- Tone style: ${toneGuide[spec.tone]}`,
    `- Read-aloud target: ${spec.lengthMinutes} minutes`,
    `- Target words: ${spec.targetWordMin}-${spec.targetWordMax} (ideal ${spec.targetWordCount})`,
    "- Hard rule: Do NOT write fewer than the minimum words.",
    `- Paragraph guidance: ${spec.paragraphGuidance}`,
    "- Format rule: narrative prose only, no bullet lists.",
    `- Reading level: ${spec.readingLevel}`,
    `- Stage context: ${spec.stage || "Family bedtime story in Story Universe"}`,
    `- Hidden spark for novelty: ${spec.spark}`,
    `- Gentle lesson hint (optional): ${spec.lessonHint}`,
    guidedBlock,
    "Characters:",
    characterBlock,
    "Do:",
    "- Keep it warm, imaginative, child-safe, and age-appropriate.",
    "- Keep names and character behavior consistent.",
    "- Use short paragraphs and clear scene flow.",
    "- End with a satisfying, calm wrap-up (especially for calm tone).",
    "Don't:",
    "- No gore, horror, threats, cruelty, or explicit content.",
    "- No mean-spirited humor.",
    "- No preachy moralizing.",
    "Output requirement:",
    'Return JSON ONLY with keys: "title", "short_blurb", "story", "reading_time_minutes_estimate".',
  ].join("\n");
}

async function generateWithAi(spec: StorySpec): Promise<GeneratedPayload | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = [
    "You are a world-class children's storyteller.",
    "Write bedtime-safe stories for families.",
    "Ensure content is warm, coherent, and age-appropriate.",
    "Return only valid JSON with required fields.",
  ].join(" ");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.9,
        top_p: 0.95,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: promptForSpec(spec) },
        ],
      }),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = json.choices?.[0]?.message?.content;
    if (!raw) return null;

    return coerceGeneratedPayload(raw);
  } catch {
    return null;
  }
}

async function continueStoryWithAi(spec: StorySpec, storySoFar: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const wordsSoFar = countWords(storySoFar);
  const needed = Math.max(120, spec.targetWordMin - wordsSoFar + 120);

  const continuationPrompt = [
    "Continue the story below.",
    `Current word count is about ${wordsSoFar}.`,
    `Add about ${needed} additional words so final story reaches at least ${spec.targetWordMin} words and stays under about ${Math.round(spec.targetWordMax * 1.1)} words.`,
    "Write NEW content only. Do not repeat existing paragraphs.",
    "Maintain tone, characters, pacing, and continuity.",
    "Build rising action and resolution; final paragraph must be a calm, satisfying wrap-up.",
    "Narrative prose only. No bullet lists.",
    "Return only the continuation text (no title, no JSON, no preface).",
    "--- STORY SO FAR ---",
    storySoFar,
  ].join("\n\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.9,
        top_p: 0.95,
        messages: [
          {
            role: "system",
            content:
              "You continue children's stories safely and coherently. No scary violence. Output plain continuation text only.",
          },
          { role: "user", content: continuationPrompt },
        ],
      }),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const continuation = json.choices?.[0]?.message?.content?.trim();
    if (!continuation) return null;
    return stripCodeFences(continuation);
  } catch {
    return null;
  }
}

async function trimStoryWithAi(spec: StorySpec, story: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You lightly trim children's stories while preserving plot, character continuity, warmth, and the ending.",
          },
          {
            role: "user",
            content: [
              `Trim this story to ${spec.targetWordMin}-${spec.targetWordMax} words.`,
              "Keep narrative prose only. Keep the ending calm and satisfying.",
              "Return only the trimmed story text.",
              "--- STORY ---",
              story,
            ].join("\n\n"),
          },
        ],
      }),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const trimmed = json.choices?.[0]?.message?.content?.trim();
    if (!trimmed) return null;
    return stripCodeFences(trimmed);
  } catch {
    return null;
  }
}

function buildFallbackStory(spec: StorySpec): GeneratedPayload {
  const cast = spec.characters.map((c) => c.name);
  const castText = cast.length ? cast.join(", ") : "a curious dreamer";
  const stageText = spec.stage || "a cozy bedtime evening where a small mystery appears";
  const seed = hashString(`${spec.spark}|${stageText}|${spec.tone}|${spec.lengthMinutes}`);

  const openerPool = [
    `On a gentle night, ${castText} noticed ${spec.spark} resting near the window and felt the start of an unusual adventure.`,
    `${castText} had nearly drifted to sleep when ${spec.spark} appeared, glowing softly as if it had come with a quiet invitation.`,
    `Just before bedtime, ${castText} discovered ${spec.spark}, and the room seemed to open into a world of kind surprises.`,
  ] as const;

  const middlePool = [
    `They followed careful clues through Story Universe, meeting friendly helpers, solving small puzzles, and learning how ${spec.lessonHint} makes hard moments easier.`,
    `At each turn, the group listened to one another, shared ideas, and found that small acts of kindness changed the path in wonderful ways.`,
    `When a challenge appeared, they breathed, thought it through, and worked together until the path became bright again.`,
    `The journey kept opening into new places, each one filled with laughter, warmth, and a little spark of courage.`,
  ] as const;

  const guidedParagraph =
    spec.mode === "guided" && spec.guided
      ? `They remembered the plan: ${spec.guided.beginning || "begin with wonder"}, then ${spec.guided.middle || "face a gentle challenge"}, and finally ${spec.guided.ending || "arrive at a comforting finish"}.`
      : `The adventure grew naturally from the moment: ${stageText}.`;

  const closingPool = [
    `By the end, they returned home with warm hearts, quieter breathing, and a story that felt safe to carry into sleep.`,
    `When the final clue settled into place, everyone smiled, tucked under blankets, and let the night hold them gently.`,
    `At last, the adventure folded into a calm ending, and the room grew peaceful as sleepy eyes slowly closed.`,
  ] as const;

  const paragraphs: string[] = [pickSeeded(openerPool, seed), guidedParagraph];

  let index = 0;
  while (countWords(paragraphs.join("\n\n")) < spec.targetWordMin - 90) {
    paragraphs.push(pickSeeded(middlePool, seed + index));
    index += 1;
  }

  paragraphs.push(pickSeeded(closingPool, seed + 99));

  while (countWords(paragraphs.join("\n\n")) < spec.targetWordMin) {
    paragraphs.splice(
      Math.max(2, paragraphs.length - 1),
      0,
      pickSeeded(middlePool, seed + 200 + index)
    );
    index += 1;
  }

  const story = paragraphs.join("\n\n");

  const titleSeeds = [
    "Moonlight Map Adventure",
    "The Gentle Quest of Story Universe",
    "The Secret Door at Bedtime",
    "A Lantern for Tomorrow",
  ] as const;

  return {
    title: `${pickSeeded(titleSeeds, seed)}: ${spec.spark.split(" ").slice(0, 3).join(" ")}`,
    short_blurb: `A ${spec.tone} family adventure shaped by your characters and bedtime world.`,
    story,
    reading_time_minutes_estimate: spec.lengthMinutes,
  };
}

function toGenerateState(payload: GeneratedPayload, spark: string): GenerateState {
  return {
    ok: true,
    error: null,
    generatedTitle: payload.title,
    generatedContent: payload.story,
    generatedBlurb: payload.short_blurb,
    readingTimeEstimate: payload.reading_time_minutes_estimate,
    spark,
  };
}

function devLogLength(spec: StorySpec, words: number, path: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(
    `[story-length] mode=${spec.mode} tone=${spec.tone} minutes=${spec.lengthMinutes} words=${words} range=${spec.targetWordMin}-${spec.targetWordMax} via=${path}`
  );
}

export async function generateStoryAction(
  _prevState: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  try {
    const { user, membership } = await getCurrentUniverseContext();
    if (!user) return { ...defaultGenerateState, error: "Please sign in again." };
    if (!membership) return { ...defaultGenerateState, error: "No active universe membership found." };

    const input = parseWizardInput(formData);
    const spec = await buildStorySpec(input, membership.universe_id);

    let payload = (await generateWithAi(spec)) ?? buildFallbackStory(spec);

    let words = countWords(payload.story);
    const hardCeiling = Math.round(spec.targetWordMax * 1.15);

    if (words < spec.targetWordMin) {
      const continuation = await continueStoryWithAi(spec, payload.story);
      if (continuation) {
        payload = {
          ...payload,
          story: `${payload.story.trim()}\n\n${continuation.trim()}`,
          reading_time_minutes_estimate: spec.lengthMinutes,
        };
        words = countWords(payload.story);
      }
    } else if (words > hardCeiling) {
      const trimmed = await trimStoryWithAi(spec, payload.story);
      if (trimmed) {
        payload = {
          ...payload,
          story: trimmed,
          reading_time_minutes_estimate: spec.lengthMinutes,
        };
        words = countWords(payload.story);
      }
    }

    devLogLength(spec, words, process.env.OPENAI_API_KEY ? "llm" : "fallback");
    return toGenerateState(payload, spec.spark);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate story.";
    return { ...defaultGenerateState, error: message };
  }
}

export async function saveStoryAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");

  const input = parseWizardInput(formData);
  const selectedCharacters = parseCharacterRefs(input.selectedCharactersJson);
  const lengthMinutes = parseLengthMinutes(input);

  const generated = generatedStorySchema.safeParse({
    title: String(formData.get("generatedTitle") ?? ""),
    content: String(formData.get("generatedContent") ?? ""),
  });

  if (!generated.success) {
    throw new Error(generated.error.issues[0]?.message ?? "Generate the story before saving.");
  }

  const targets = getWordTargets(lengthMinutes);

  const promptJson = {
    mode: input.mode,
    guided_beats:
      input.mode === "guided"
        ? {
            beginning: input.guidedBeginning || null,
            middle: input.guidedMiddle || null,
            end: input.guidedEnding || null,
          }
        : null,
    tone: input.tone,
    length_minutes: lengthMinutes,
    stage: input.stage || null,
    selected_characters: selectedCharacters,
    custom_character_name: input.customCharacterName || null,
    target_word_count: targets,
    spark: String(formData.get("spark") ?? ""),
  };

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .insert({
      universe_id: membership.universe_id,
      created_by: user.id,
      title: generated.data.title,
      tone: input.tone,
      length_minutes: lengthMinutes,
      prompt: promptJson,
      content: generated.data.content,
    })
    .select("id")
    .single();

  if (storyError) throw new Error(storyError.message);

  type StoryCharacterInsert = {
    story_id: string;
    character_type: "kid" | "adult" | "custom";
    character_id: string | null;
    custom_name: string | null;
  };

  const characterRows: StoryCharacterInsert[] = selectedCharacters.map((c) => ({
    story_id: story.id,
    character_type: c.type,
    character_id: c.id,
    custom_name: null,
  }));

  if (input.customCharacterName) {
    characterRows.push({
      story_id: story.id,
      character_type: "custom",
      character_id: null,
      custom_name: input.customCharacterName,
    });
  }

  if (characterRows.length > 0) {
    const { error: characterError } = await supabase.from("story_characters").insert(characterRows);
    if (characterError) throw new Error(characterError.message);
  }

  redirect(`/story/${story.id}`);
}
