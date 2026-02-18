import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { callOpenAIWithCost } from "@/lib/openai/callWithCost";
import {
  getCoverImageSettings,
  getPageImageSettings,
  type ImageGenerationSettings,
  type ImageMode,
} from "@/lib/images/imageDefaults";
import { buildImagePrompt } from "@/lib/story/image-prompt";
import {
  getOrCreateIdentityBible,
  getOrCreateStoryOutfit,
  type ProfileKind,
} from "@/lib/story/identity-outfits";

export const sceneExtractionSchema = z.object({
  setting: z.string().trim().min(1),
  action: z.string().trim().min(1),
  mood: z.string().trim().min(1),
  time_of_day: z.string().trim().min(1),
  camera_framing: z.string().trim().min(1),
});

type StoryPage = {
  id: string;
  story_id: string;
  page_index: number;
  text: string;
  scene_json: Record<string, unknown> | null;
  used_reference_image_ids: string[] | null;
};

type StoryCharacter = {
  id: string;
  character_type: "kid" | "adult" | "custom";
  character_id: string | null;
  custom_name: string | null;
  identity_bible_id: string | null;
  outfit_id: string | null;
};

function parseJsonObject(raw: string): unknown {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) throw new Error("No JSON object found.");
  return JSON.parse(cleaned.slice(first, last + 1)) as unknown;
}

async function extractSceneFromPageText(params: {
  pageText: string;
  storyId: string;
  pageNumber: number;
}): Promise<z.infer<typeof sceneExtractionSchema>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      setting: "cozy story world",
      action: "characters continue their gentle adventure",
      mood: "warm and hopeful",
      time_of_day: "evening",
      camera_framing: "medium shot",
    };
  }

  const schemaHint = [
    "{",
    '  "setting": "string",',
    '  "action": "string",',
    '  "mood": "string",',
    '  "time_of_day": "string",',
    '  "camera_framing": "string"',
    "}",
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callOpenAIWithCost({
      storyId: params.storyId,
      pageNumber: params.pageNumber,
      step: "scene_extract",
      model: "gpt-4.1-mini",
      createResponseFn: async () => {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            temperature: 0.2,
            messages: [
              {
                role: "system",
                content:
                  "Extract concise scene metadata for illustration prompts. Output strict JSON only and do not invent plot.",
              },
              {
                role: "user",
                content: [
                  "Extract scene JSON from this page text.",
                  "Schema:",
                  schemaHint,
                  "Page text:",
                  params.pageText,
                ].join("\n"),
              },
            ],
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Scene extraction failed: ${res.status} ${txt}`);
        }
        return (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          id?: string;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number };
            completion_tokens_details?: { reasoning_tokens?: number };
          };
        };
      },
    });
    const raw = response.choices?.[0]?.message?.content;
    if (!raw) continue;
    const parsed = sceneExtractionSchema.safeParse(parseJsonObject(raw));
    if (parsed.success) return parsed.data;
  }

  throw new Error("Scene extraction failed schema validation after retry.");
}

function detectAppearingCharacters(
  pageText: string,
  characters: Array<{ name: string; profile_id: string; profile_kind: ProfileKind; story_character_id: string }>
): Array<{ name: string; profile_id: string; profile_kind: ProfileKind; story_character_id: string }> {
  const lower = pageText.toLowerCase();
  const found = characters.filter((c) => lower.includes(c.name.toLowerCase()));
  return found.length > 0 ? found : characters;
}

async function loadStoryAndCharacters(storyId: string): Promise<{
  story: {
    id: string;
    title: string;
    tone: string;
    length_minutes: number;
    universe_id: string;
    prompt: Record<string, unknown> | null;
    style_bible: string;
    style_id: string;
    arc_summary: string | null;
  };
  characters: Array<{ name: string; profile_id: string; profile_kind: ProfileKind; story_character_id: string }>;
  storyContext: { setting: string; season: string; tone: string; spark: string; stage: string };
}> {
  const supabase = createSupabaseAdminClient();

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, title, tone, length_minutes, universe_id, prompt, style_bible, style_id, arc_summary")
    .eq("id", storyId)
    .maybeSingle();
  if (storyError) {
    if (
      storyError.message.includes("column stories.style_bible does not exist") ||
      storyError.message.includes("column stories.style_id does not exist") ||
      storyError.message.includes("Could not find the 'style_bible' column")
    ) {
      throw new Error("Missing style_bible");
    }
    throw new Error(storyError.message);
  }
  if (!story) throw new Error("Story not found.");
  if (!story.style_bible || !story.style_id) throw new Error("Missing style_bible");

  const { data: bible } = await supabase
    .from("story_bibles")
    .select("story_bible_json")
    .eq("story_id", storyId)
    .maybeSingle();
  const storyBible = (bible?.story_bible_json as Record<string, unknown> | null) ?? {};
  const promptJson = (story.prompt as Record<string, unknown> | null) ?? null;
  const stage =
    promptJson && typeof promptJson.stage === "string" && promptJson.stage.trim().length > 0
      ? promptJson.stage.trim()
      : "";
  const spark =
    promptJson && typeof promptJson.spark === "string" && promptJson.spark.trim().length > 0
      ? promptJson.spark.trim()
      : "";
  const setting =
    typeof storyBible.setting === "string" && storyBible.setting.trim().length > 0
      ? storyBible.setting
      : stage || "Story Universe";

  const { data: rows, error } = await supabase
    .from("story_characters")
    .select("id, character_type, character_id, custom_name, identity_bible_id, outfit_id")
    .eq("story_id", storyId);
  if (error) throw new Error(error.message);

  const typed = (rows ?? []) as StoryCharacter[];
  const kidIds = typed.filter((r) => r.character_type === "kid" && r.character_id).map((r) => r.character_id as string);
  const adultIds = typed
    .filter((r) => r.character_type === "adult" && r.character_id)
    .map((r) => r.character_id as string);

  const [{ data: kids, error: kidsError }, { data: adults, error: adultsError }] = await Promise.all([
    kidIds.length > 0
      ? supabase.from("profiles_kid").select("id, display_name").in("id", kidIds)
      : Promise.resolve({ data: [], error: null }),
    adultIds.length > 0
      ? supabase.from("profiles_adult").select("id, display_name").in("id", adultIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (kidsError) throw new Error(kidsError.message);
  if (adultsError) throw new Error(adultsError.message);

  const kidMap = new Map((kids ?? []).map((k) => [k.id, k.display_name]));
  const adultMap = new Map((adults ?? []).map((a) => [a.id, a.display_name]));

  const characters = typed
    .filter((r) => (r.character_type === "kid" || r.character_type === "adult") && r.character_id)
    .map((r) => ({
      name:
        r.character_type === "kid"
          ? kidMap.get(r.character_id as string) ?? "Kid"
          : adultMap.get(r.character_id as string) ?? "Adult",
      profile_id: r.character_id as string,
      profile_kind: r.character_type as ProfileKind,
      story_character_id: r.id,
    }));

  return {
    story: {
      id: story.id,
      title: story.title,
      tone: story.tone,
      length_minutes: story.length_minutes,
      universe_id: story.universe_id,
      prompt: promptJson,
      style_bible: story.style_bible,
      style_id: story.style_id,
      arc_summary: story.arc_summary ?? null,
    },
    characters,
    storyContext: {
      setting,
      season: "all-season",
      tone: story.tone,
      spark,
      stage,
    },
  };
}

function buildCharacterBibleBlock(params: {
  characters: Array<{
    name: string;
    identity: {
      hair: string;
      eyes: string;
      skin_tone: string;
      face_features: string;
      body_proportions: string;
      must_keep: string[];
      must_not: string[];
    };
  }>;
}): string {
  if (params.characters.length === 0) return "No named characters in this scene.";
  return [...params.characters]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) =>
      [
        `${c.name}:`,
        `identity hair=${c.identity.hair}, eyes=${c.identity.eyes}, skin=${c.identity.skin_tone}, face=${c.identity.face_features}, proportions=${c.identity.body_proportions}`,
        `must_keep=${c.identity.must_keep.join("; ")}`,
        `must_not=${c.identity.must_not.join("; ")}`,
      ].join(" ")
    )
    .join("\n");
}

function buildPageSceneBlock(params: {
  scene: z.infer<typeof sceneExtractionSchema>;
  storyContext: { setting: string; season: string; tone: string; spark: string; stage: string };
  characters: Array<{
    name: string;
    outfit: {
      top: string;
      bottom: string;
      shoes: string;
      accessories: string[];
      palette: string[];
    };
  }>;
}): string {
  const chars = params.characters
    .map((c) => {
      return [
        `${c.name}`,
        `outfit top=${c.outfit.top}, bottom=${c.outfit.bottom}, shoes=${c.outfit.shoes}, accessories=${c.outfit.accessories.join(", ") || "none"}, palette=${c.outfit.palette.join(", ")}`,
      ].join(" | ");
    })
    .join(" || ");

  return [
    "SCENE BLOCK:",
    "kind=page",
    `story spark: ${params.storyContext.spark || "none"}`,
    `stage context: ${params.storyContext.stage || "none"}`,
    `setting: ${params.scene.setting}`,
    `action: ${params.scene.action}`,
    `mood: ${params.scene.mood}`,
    `time of day: ${params.scene.time_of_day}`,
    `camera framing: ${params.scene.camera_framing}`,
    `character outfits + props: ${chars || "none"}`,
    "poster focus: readable action beat with child-safe emotional clarity",
  ].join(". ");
}

function buildCoverSceneBlock(params: {
  storyContext: { setting: string; season: string; tone: string; spark: string; stage: string };
  title: string;
  arcSummary: string | null;
  keyMotif: string;
}): string {
  return [
    "SCENE BLOCK:",
    "kind=cover",
    `title: ${params.title}`,
    `arc summary: ${params.arcSummary || "warm family arc with clear beginning, challenge, and satisfying ending"}`,
    `stage context: ${params.storyContext.stage || "none"}`,
    `setting: ${params.storyContext.setting}`,
    `tone: ${params.storyContext.tone}`,
    `story spark: ${params.storyContext.spark || "none"}`,
    `key motif: ${params.keyMotif}`,
    "composition: iconic poster moment, inviting, high readability for children",
  ].join(". ");
}

function parseSceneJsonOrNull(raw: Record<string, unknown> | null): z.infer<typeof sceneExtractionSchema> | null {
  if (!raw) return null;
  const parsed = sceneExtractionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function isMissingStoryPagesColumnError(message: string, column: string): boolean {
  return (
    message.includes(`column story_pages.${column} does not exist`) ||
    message.includes(`column "${column}"`) ||
    (message.includes("Could not find the") && message.includes(`'${column}'`) && message.includes("'story_pages'"))
  );
}

export async function generatePageImage(
  storyPageId: string,
  options?: { settings?: ImageGenerationSettings; imageMode?: ImageMode }
): Promise<{
  image_path: string;
  image_url: string;
  image_prompt: string;
  image_prompt_json: Record<string, unknown>;
  scene_json: Record<string, unknown>;
  image_model: string;
  image_quality: string;
  image_size: string;
  used_reference_image_ids: string[];
}> {
  const supabase = createSupabaseAdminClient();
  const primaryPage = await supabase
    .from("story_pages")
    .select("id, story_id, page_index, text, scene_json, used_reference_image_ids")
    .eq("id", storyPageId)
    .maybeSingle();
  const fallbackPage =
    primaryPage.error &&
    (isMissingStoryPagesColumnError(primaryPage.error.message, "scene_json") ||
      isMissingStoryPagesColumnError(primaryPage.error.message, "used_reference_image_ids"))
      ? await supabase
          .from("story_pages")
          .select("id, story_id, page_index, text")
          .eq("id", storyPageId)
          .maybeSingle()
      : null;

  const pageError = fallbackPage ? fallbackPage.error : primaryPage.error;
  const page = fallbackPage
    ? (fallbackPage.data
        ? { ...fallbackPage.data, scene_json: null, used_reference_image_ids: null }
        : null)
    : primaryPage.data;
  if (pageError) throw new Error(pageError.message);
  if (!page) throw new Error("Story page not found.");
  const storyPage = page as StoryPage;

  let scene = parseSceneJsonOrNull(storyPage.scene_json);
  if (!scene) {
    scene = await extractSceneFromPageText({
      pageText: storyPage.text,
      storyId: storyPage.story_id,
      pageNumber: storyPage.page_index + 1,
    });
    const { error: sceneUpdateError } = await supabase
      .from("story_pages")
      .update({ scene_json: scene })
      .eq("id", storyPage.id);
    if (sceneUpdateError && !isMissingStoryPagesColumnError(sceneUpdateError.message, "scene_json")) {
      throw new Error(sceneUpdateError.message);
    }
  }
  const { story, characters, storyContext } = await loadStoryAndCharacters(storyPage.story_id);
  const appearing = detectAppearingCharacters(storyPage.text, characters);
  const appearingIds = new Set(appearing.map((c) => c.story_character_id));

  const assembledCharacters: Array<{
    story_character_id: string;
    identity_bible_id: string;
    outfit_id: string;
    name: string;
    identity: {
      hair: string;
      eyes: string;
      skin_tone: string;
      face_features: string;
      body_proportions: string;
      must_keep: string[];
      must_not: string[];
    };
    outfit: {
      top: string;
      bottom: string;
      shoes: string;
      accessories: string[];
      palette: string[];
    };
    portraitRef: string | null;
    usedRefId: string | null;
  }> = [];

  for (const c of characters) {
    const identity = await getOrCreateIdentityBible({
      profile_id: c.profile_id,
      profile_kind: c.profile_kind,
      tracking: { storyId: story.id, pageNumber: storyPage.page_index + 1 },
    });
    const outfit = await getOrCreateStoryOutfit({
      story_id: story.id,
      profile_id: c.profile_id,
      profile_kind: c.profile_kind,
      story_context: storyContext,
      pageNumber: storyPage.page_index + 1,
    });

    const portrait = identity.referenceImages.find((img) => img.kind === "portrait") ?? null;
    assembledCharacters.push({
      story_character_id: c.story_character_id,
      identity_bible_id: identity.identityBible.id,
      outfit_id: outfit.id,
      name: c.name,
      identity: identity.identityBible.identity_bible_json,
      outfit: outfit.outfit_json,
      portraitRef: portrait?.image_url ?? null,
      usedRefId: portrait?.id ?? null,
    });

    const updateLink = await supabase
      .from("story_characters")
      .update({
        identity_bible_id: identity.identityBible.id,
        outfit_id: outfit.id,
      })
      .eq("id", c.story_character_id);
    if (updateLink.error) throw new Error(updateLink.error.message);
  }

  const characterBibleBlock = buildCharacterBibleBlock({
    characters: assembledCharacters.map((c) => ({
      name: c.name,
      identity: c.identity,
    })),
  });
  const sceneBlock = buildPageSceneBlock({
    scene,
    storyContext,
    characters: assembledCharacters
      .filter((c) => appearingIds.has(c.story_character_id))
      .map((c) => ({
        name: c.name,
        outfit: c.outfit,
      })),
  });
  const finalPrompt = buildImagePrompt({
    styleBible: story.style_bible,
    characterBible: characterBibleBlock,
    sceneBlock,
  });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const referencedImageIds = assembledCharacters
    .map((c) => c.portraitRef)
    .filter((v): v is string => Boolean(v));

  const mode = options?.imageMode ?? "fast";
  const settings = options?.settings ?? getPageImageSettings(mode);
  const response = await callOpenAIWithCost({
    storyId: storyPage.story_id,
    pageNumber: storyPage.page_index + 1,
    step: "image_generate",
    model: settings.model,
    createResponseFn: async () => {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: settings.model,
          quality: settings.quality,
          size: settings.size,
          n: settings.n,
          prompt: finalPrompt,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Page image generation failed: ${res.status} ${txt}`);
      }
      return (await res.json()) as {
        data?: Array<{ b64_json?: string }>;
        id?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
          input_tokens_details?: { cached_tokens?: number };
          output_tokens_details?: { reasoning_tokens?: number };
        };
      };
    },
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("Page image generation returned empty image data.");

  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  const imagePath = `${storyPage.story_id}/page-${storyPage.page_index}.png`;
  const upload = await supabase.storage.from("story-illustrations").upload(imagePath, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (upload.error) throw new Error(upload.error.message);

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  const imageUrl = `${baseUrl}/storage/v1/object/public/story-illustrations/${imagePath}`;

  const usedReferenceImageIds = assembledCharacters
    .map((c) => c.usedRefId)
    .filter((id): id is string => Boolean(id));

  const promptJson = {
    style_id: story.style_id,
    style_bible: story.style_bible,
    character_bible: characterBibleBlock,
    scene_block: sceneBlock,
    global_art_direction: "children's picture book illustration, clean shapes, soft shading",
    scene,
    story_context: storyContext,
    characters: assembledCharacters,
    final_prompt: finalPrompt,
    referenced_image_ids: referencedImageIds,
  };

  return {
    image_path: imagePath,
    image_url: imageUrl,
    image_prompt: finalPrompt,
    image_prompt_json: promptJson,
    scene_json: scene,
    image_model: settings.model,
    image_quality: settings.quality,
    image_size: settings.size,
    used_reference_image_ids: usedReferenceImageIds,
  };
}

export async function generateCoverImage(
  storyId: string,
  options?: { settings?: ImageGenerationSettings; imageMode?: ImageMode }
): Promise<{ image_url: string; image_prompt: string; image_prompt_json: Record<string, unknown> }> {
  const supabase = createSupabaseAdminClient();
  const { story, characters, storyContext } = await loadStoryAndCharacters(storyId);

  const assembledCharacters: Array<{
    name: string;
    identity: {
      hair: string;
      eyes: string;
      skin_tone: string;
      face_features: string;
      body_proportions: string;
      must_keep: string[];
      must_not: string[];
    };
  }> = [];

  for (const c of characters) {
    const identity = await getOrCreateIdentityBible({
      profile_id: c.profile_id,
      profile_kind: c.profile_kind,
      tracking: { storyId: story.id, pageNumber: null },
    });
    assembledCharacters.push({
      name: c.name,
      identity: identity.identityBible.identity_bible_json,
    });
  }

  const stage = storyContext.stage || "";
  const spark = storyContext.spark || "adventure";
  const keyMotif = spark.split(/\s+/).slice(0, 4).join(" ");

  const characterBibleBlock = buildCharacterBibleBlock({ characters: assembledCharacters });
  const sceneBlock = buildCoverSceneBlock({
    storyContext,
    title: story.title,
    arcSummary: story.arc_summary,
    keyMotif: keyMotif || "storybook adventure",
  });
  const finalPrompt = buildImagePrompt({
    styleBible: story.style_bible,
    characterBible: characterBibleBlock,
    sceneBlock,
  });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const mode = options?.imageMode ?? "fast";
  const settings = options?.settings ?? getCoverImageSettings(mode);
  const response = await callOpenAIWithCost({
    storyId: story.id,
    pageNumber: null,
    step: "cover_image_generate",
    model: settings.model,
    createResponseFn: async () => {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: settings.model,
          quality: settings.quality,
          size: settings.size,
          n: settings.n,
          prompt: finalPrompt,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Cover image generation failed: ${res.status} ${txt}`);
      }
      return (await res.json()) as {
        data?: Array<{ b64_json?: string }>;
        id?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
          input_tokens_details?: { cached_tokens?: number };
          output_tokens_details?: { reasoning_tokens?: number };
        };
      };
    },
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("Cover image generation returned empty image data.");
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  const imagePath = `${story.id}/cover.png`;
  const upload = await supabase.storage.from("story-illustrations").upload(imagePath, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (upload.error) throw new Error(upload.error.message);

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  const imageUrl = `${baseUrl}/storage/v1/object/public/story-illustrations/${imagePath}`;

  const promptJson = {
    style_id: story.style_id,
    style_bible: story.style_bible,
    character_bible: characterBibleBlock,
    scene_block: sceneBlock,
    final_prompt: finalPrompt,
    stage,
  };

  return {
    image_url: imageUrl,
    image_prompt: finalPrompt,
    image_prompt_json: promptJson,
  };
}
