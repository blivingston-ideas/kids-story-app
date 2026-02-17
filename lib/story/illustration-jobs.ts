import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  generatePageIllustration,
  type CharacterStyleNote,
  type StorySpark,
  storySparkSchema,
} from "@/lib/story/illustrations";
import { buildStoryPageTexts } from "@/lib/story/pages";

type StoryPageRow = {
  id: string;
  story_id: string;
  page_index: number;
  text: string;
  image_status: "not_started" | "generating" | "ready" | "failed";
};

const runningStories = new Set<string>();

async function buildCharacterNotes(storyId: string): Promise<CharacterStyleNote[]> {
  const supabase = createSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from("story_characters")
    .select("character_type, character_id, custom_name")
    .eq("story_id", storyId);
  if (error) throw new Error(error.message);

  const kidIds = (rows ?? [])
    .filter((r) => r.character_type === "kid" && r.character_id)
    .map((r) => r.character_id as string);
  const adultIds = (rows ?? [])
    .filter((r) => r.character_type === "adult" && r.character_id)
    .map((r) => r.character_id as string);

  const [{ data: kids }, { data: adults }] = await Promise.all([
    kidIds.length
      ? supabase
          .from("profiles_kid")
          .select("id, display_name, age, character_traits, themes")
          .in("id", kidIds)
      : Promise.resolve({ data: [], error: null }),
    adultIds.length
      ? supabase.from("profiles_adult").select("id, display_name, persona_label").in("id", adultIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const kidMap = new Map(
    (kids ?? []).map((k) => [
      k.id,
      `${k.display_name}${typeof k.age === "number" ? `, age ${k.age}` : ""}${k.character_traits?.length ? `, traits: ${k.character_traits.join(", ")}` : ""}${k.themes?.length ? `, themes: ${k.themes.join(", ")}` : ""}`,
    ])
  );
  const adultMap = new Map(
    (adults ?? []).map((a) => [a.id, `${a.display_name}${a.persona_label ? `, ${a.persona_label}` : ""}`])
  );

  return (rows ?? []).map((r) => {
    if (r.character_type === "kid" && r.character_id) {
      const notes = kidMap.get(r.character_id) ?? "kid character";
      return { name: notes.split(",")[0] ?? "Kid", notes };
    }
    if (r.character_type === "adult" && r.character_id) {
      const notes = adultMap.get(r.character_id) ?? "adult companion";
      return { name: notes.split(",")[0] ?? "Adult", notes };
    }
    return { name: r.custom_name ?? "Custom character", notes: "custom story character" };
  });
}

async function readStorySpark(storyId: string): Promise<StorySpark | undefined> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("stories").select("prompt").eq("id", storyId).maybeSingle();
  if (error) throw new Error(error.message);
  const prompt = data?.prompt as { spark?: unknown } | null;
  const parsed = storySparkSchema.safeParse(prompt?.spark);
  return parsed.success ? parsed.data : undefined;
}

async function processOnePage(
  page: StoryPageRow,
  characterNotes: CharacterStyleNote[],
  spark: StorySpark | undefined
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const setGenerating = await supabase
    .from("story_pages")
    .update({ image_status: "generating", image_error: null })
    .eq("id", page.id);
  if (setGenerating.error) throw new Error(setGenerating.error.message);

  try {
    const result = await generatePageIllustration({
      storyId: page.story_id,
      pageIndex: page.page_index,
      pageText: page.text,
      spark,
      characterNotes,
      styleBible: "Keep character proportions and visual language consistent across all pages in this story.",
    });

    const updateReady = await supabase
      .from("story_pages")
      .update({
        image_status: "ready",
        image_path: result.imagePath,
        image_prompt: result.imagePrompt,
        image_error: null,
      })
      .eq("id", page.id);
    if (updateReady.error) throw new Error(updateReady.error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Illustration generation failed.";
    const updateFailed = await supabase
      .from("story_pages")
      .update({ image_status: "failed", image_error: message })
      .eq("id", page.id);
    if (updateFailed.error) throw new Error(updateFailed.error.message);
  }
}

async function processInBatches(
  pages: StoryPageRow[],
  characterNotes: CharacterStyleNote[],
  spark: StorySpark | undefined
): Promise<void> {
  const concurrency = 2;
  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);
    await Promise.all(batch.map((p) => processOnePage(p, characterNotes, spark)));
  }
}

export async function startStoryIllustrationGeneration(storyId: string): Promise<{ started: boolean }> {
  if (runningStories.has(storyId)) return { started: false };
  runningStories.add(storyId);

  const supabase = createSupabaseAdminClient();
  const { data: pages, error } = await supabase
    .from("story_pages")
    .select("id, story_id, page_index, text, image_status")
    .eq("story_id", storyId)
    .order("page_index", { ascending: true });
  if (error) {
    runningStories.delete(storyId);
    throw new Error(error.message);
  }

  let workingPages = (pages ?? []) as StoryPageRow[];

  if (workingPages.length === 0) {
    const { data: story, error: storyError } = await supabase
      .from("stories")
      .select("id, content, length_minutes")
      .eq("id", storyId)
      .maybeSingle();
    if (storyError) {
      runningStories.delete(storyId);
      throw new Error(storyError.message);
    }
    if (story) {
      const inserts = buildStoryPageTexts(story.content, story.length_minutes).map((p) => ({
        story_id: story.id,
        page_index: p.pageIndex,
        text: p.text,
        image_status: "not_started" as const,
      }));
      if (inserts.length > 0) {
        const inserted = await supabase.from("story_pages").insert(inserts);
        if (inserted.error) {
          runningStories.delete(storyId);
          throw new Error(inserted.error.message);
        }
      }
      const refreshed = await supabase
        .from("story_pages")
        .select("id, story_id, page_index, text, image_status")
        .eq("story_id", storyId)
        .order("page_index", { ascending: true });
      if (refreshed.error) {
        runningStories.delete(storyId);
        throw new Error(refreshed.error.message);
      }
      workingPages = (refreshed.data ?? []) as StoryPageRow[];
    }
  }

  const pending = workingPages.filter((p) => p.image_status !== "ready") as StoryPageRow[];
  if (pending.length === 0) {
    runningStories.delete(storyId);
    return { started: false };
  }

  const characterNotes = await buildCharacterNotes(storyId);
  const spark = await readStorySpark(storyId);

  void processInBatches(pending, characterNotes, spark).finally(() => {
    runningStories.delete(storyId);
  });

  return { started: true };
}

export async function regenerateStoryPage(storyId: string, pageIndex: number): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { data: page, error } = await supabase
    .from("story_pages")
    .select("id, story_id, page_index, text, image_status")
    .eq("story_id", storyId)
    .eq("page_index", pageIndex)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!page) throw new Error("Story page not found.");

  const characterNotes = await buildCharacterNotes(storyId);
  const spark = await readStorySpark(storyId);
  await processOnePage(page as StoryPageRow, characterNotes, spark);
}
