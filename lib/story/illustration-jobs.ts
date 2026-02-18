import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildStoryPageTexts } from "@/lib/story/pages";
import { generateCoverImage, generatePageImage } from "@/lib/story/page-image";
import { getCoverImageSettings, getPageImageSettings, type ImageMode } from "@/lib/images/imageDefaults";

type StoryPageRow = {
  id: string;
  story_id: string;
  page_index: number;
  text: string;
  image_status: "pending" | "not_started" | "generating" | "ready" | "failed";
};

const runningStories = new Set<string>();

function isMissingStoryPagesColumnError(message: string, column: string): boolean {
  const normalized = message.toLowerCase();
  const columnLc = column.toLowerCase();
  return (
    normalized.includes(`column story_pages.${columnLc} does not exist`) ||
    normalized.includes(`column "${columnLc}"`) ||
    (normalized.includes("could not find") &&
      normalized.includes(`'${columnLc}'`) &&
      normalized.includes("'story_pages'") &&
      normalized.includes("schema cache"))
  );
}

function isMissingStoriesColumnError(message: string, column: string): boolean {
  const normalized = message.toLowerCase();
  const columnLc = column.toLowerCase();
  return (
    normalized.includes(`column stories.${columnLc} does not exist`) ||
    normalized.includes(`column "${columnLc}"`) ||
    (normalized.includes("could not find") &&
      normalized.includes(`'${columnLc}'`) &&
      normalized.includes("'stories'") &&
      normalized.includes("schema cache"))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || message.includes("500") || message.includes("502") || message.includes("503");
}

async function processOnePage(page: StoryPageRow, imageMode: ImageMode): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const setGenerating = await supabase
    .from("story_pages")
    .update({ image_status: "generating", image_error: null })
  .eq("id", page.id);
  if (setGenerating.error) throw new Error(setGenerating.error.message);

  try {
    const maxAttempts = 3;
    let attempt = 0;
    let result:
      | Awaited<ReturnType<typeof generatePageImage>>
      | null = null;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        result = await generatePageImage(page.id, {
          imageMode,
          settings: getPageImageSettings(imageMode),
        });
        break;
      } catch (error) {
        if (attempt >= maxAttempts || !isTransientError(error)) {
          throw error;
        }
        await sleep(250 * 2 ** (attempt - 1));
      }
    }
    if (!result) throw new Error("Illustration generation failed.");

    const updateReady = await supabase
      .from("story_pages")
      .update({
        image_status: "ready",
        image_path: result.image_path,
        image_url: result.image_url,
        image_prompt: result.image_prompt,
        scene_json: result.scene_json,
        image_prompt_json: result.image_prompt_json,
        prompt_json: result.image_prompt_json,
        image_model: result.image_model,
        image_quality: result.image_quality,
        image_size: result.image_size,
        image_generated_at: new Date().toISOString(),
        used_reference_image_ids: result.used_reference_image_ids,
        image_error: null,
      })
      .eq("id", page.id);
    if (updateReady.error) {
      if (
        !isMissingStoryPagesColumnError(updateReady.error.message, "image_url") &&
        !isMissingStoryPagesColumnError(updateReady.error.message, "used_reference_image_ids") &&
        !isMissingStoryPagesColumnError(updateReady.error.message, "scene_json") &&
        !isMissingStoryPagesColumnError(updateReady.error.message, "image_prompt_json") &&
        !isMissingStoryPagesColumnError(updateReady.error.message, "image_prompt") &&
        !isMissingStoryPagesColumnError(updateReady.error.message, "image_model") &&
        !isMissingStoryPagesColumnError(updateReady.error.message, "image_quality") &&
        !isMissingStoryPagesColumnError(updateReady.error.message, "image_size") &&
        !isMissingStoryPagesColumnError(updateReady.error.message, "image_generated_at") &&
        !isMissingStoryPagesColumnError(updateReady.error.message, "prompt_json")
      ) {
        throw new Error(updateReady.error.message);
      }
      const fallbackUpdate = await supabase
        .from("story_pages")
        .update({
          image_status: "ready",
          image_path: result.image_path,
          image_url: result.image_url,
          image_prompt: result.image_prompt,
          image_error: null,
        })
        .eq("id", page.id);
      if (
        fallbackUpdate.error &&
        (isMissingStoryPagesColumnError(fallbackUpdate.error.message, "image_url") ||
          isMissingStoryPagesColumnError(fallbackUpdate.error.message, "image_prompt"))
      ) {
        const pathOnlyFallback = await supabase
          .from("story_pages")
          .update({
            image_status: "ready",
            image_path: result.image_path,
            image_error: null,
          })
          .eq("id", page.id);
        if (pathOnlyFallback.error) throw new Error(pathOnlyFallback.error.message);
      } else if (fallbackUpdate.error) {
        throw new Error(fallbackUpdate.error.message);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Illustration generation failed.";
    const updateFailed = await supabase
      .from("story_pages")
      .update({ image_status: "failed", image_error: message })
      .eq("id", page.id);
    if (updateFailed.error) throw new Error(updateFailed.error.message);
  }
}

async function syncStoryCoverFromFirstPage(storyId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const firstPagePrimary = await supabase
    .from("story_pages")
    .select("image_url, image_path")
    .eq("story_id", storyId)
    .eq("page_index", 0)
    .maybeSingle();
  const firstPageFallback =
    firstPagePrimary.error &&
    isMissingStoryPagesColumnError(firstPagePrimary.error.message, "image_url")
      ? await supabase
          .from("story_pages")
          .select("image_path")
          .eq("story_id", storyId)
          .eq("page_index", 0)
          .maybeSingle()
      : null;
  const firstPageError = firstPageFallback ? firstPageFallback.error : firstPagePrimary.error;
  if (firstPageError) throw new Error(firstPageError.message);
  const firstPage = firstPageFallback
    ? (firstPageFallback.data ? { image_url: null, image_path: firstPageFallback.data.image_path } : null)
    : firstPagePrimary.data;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const coverUrl =
    firstPage?.image_url ??
    (firstPage?.image_path && baseUrl
      ? `${baseUrl}/storage/v1/object/public/story-illustrations/${firstPage.image_path}`
      : null);
  if (!coverUrl) return;

  const coverUpdate = await supabase
    .from("stories")
    .update({ cover_image_url: coverUrl, first_page_image_url: coverUrl })
    .eq("id", storyId);

  if (coverUpdate.error) {
    if (
      isMissingStoriesColumnError(coverUpdate.error.message, "cover_image_url") ||
      isMissingStoriesColumnError(coverUpdate.error.message, "first_page_image_url")
    ) {
      return;
    }
    throw new Error(coverUpdate.error.message);
  }
}

async function processInBatches(pages: StoryPageRow[], imageMode: ImageMode): Promise<void> {
  const concurrency = 4;
  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);
    await Promise.all(batch.map((p) => processOnePage(p, imageMode)));
  }
  if (pages.length > 0) {
    await syncStoryCoverFromFirstPage(pages[0].story_id);
  }
}

async function processCover(storyId: string, imageMode: ImageMode): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const cover = await generateCoverImage(storyId, {
    imageMode,
    settings: getCoverImageSettings(imageMode),
  });
  const update = await supabase
    .from("stories")
    .update({
      cover_image_url: cover.image_url,
      cover_prompt: cover.image_prompt,
      image_model: imageMode === "best" ? "gpt-image-1" : "gpt-image-1-mini",
    })
    .eq("id", storyId);
  if (update.error) {
    const missingColumn =
      isMissingStoriesColumnError(update.error.message, "cover_image_url") ||
      isMissingStoriesColumnError(update.error.message, "cover_prompt") ||
      isMissingStoriesColumnError(update.error.message, "image_model");
    if (!missingColumn) throw new Error(update.error.message);
  }
}

export async function startStoryIllustrationGeneration(storyId: string): Promise<{ started: boolean }> {
  if (runningStories.has(storyId)) return { started: false };
  runningStories.add(storyId);

  const supabase = createSupabaseAdminClient();
  let storyMeta:
    | { id: string; content: string; length_minutes: number; image_mode?: string | null }
    | null = null;
  let storyMetaError: { message: string } | null = null;
  const storyMetaPrimary = await supabase
    .from("stories")
    .select("id, content, length_minutes, image_mode")
    .eq("id", storyId)
    .maybeSingle();
  if (storyMetaPrimary.error && storyMetaPrimary.error.message.includes("column stories.image_mode does not exist")) {
    const fallback = await supabase
      .from("stories")
      .select("id, content, length_minutes")
      .eq("id", storyId)
      .maybeSingle();
    storyMeta = fallback.data as { id: string; content: string; length_minutes: number } | null;
    storyMetaError = fallback.error;
  } else {
    storyMeta = storyMetaPrimary.data as { id: string; content: string; length_minutes: number; image_mode?: string | null } | null;
    storyMetaError = storyMetaPrimary.error;
  }
  if (storyMetaError) {
    runningStories.delete(storyId);
    throw new Error(storyMetaError.message);
  }
  const imageMode = (storyMeta?.image_mode === "best" ? "best" : "fast") as ImageMode;

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
    if (!storyMeta) {
      runningStories.delete(storyId);
      throw new Error("Story not found.");
    }
    const inserts = buildStoryPageTexts(storyMeta.content, storyMeta.length_minutes).map((p) => ({
        story_id: storyMeta.id,
        page_index: p.pageIndex,
        text: p.text,
        image_status: "pending" as const,
      }));
    if (inserts.length > 0) {
      const inserted = await supabase
        .from("story_pages")
        .upsert(inserts, { onConflict: "story_id,page_index", ignoreDuplicates: true });
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

  const pending = workingPages.filter(
    (p) => p.image_status === "pending" || p.image_status === "not_started" || p.image_status === "failed"
  );
  if (pending.length === 0) {
    runningStories.delete(storyId);
    return { started: false };
  }

  void (async () => {
    try {
      await processCover(storyId, imageMode);
      await processInBatches(pending, imageMode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Illustration generation failed.";
      if (message.includes("Missing style_bible")) {
        const supabaseForFailure = createSupabaseAdminClient();
        await supabaseForFailure
          .from("story_pages")
          .update({ image_status: "failed", image_error: "Missing style_bible" })
          .eq("story_id", storyId)
          .in("image_status", ["pending", "not_started", "generating"]);
      }
    } finally {
      runningStories.delete(storyId);
    }
  })();
  return { started: true };
}

export async function generateStoryImages(storyId: string): Promise<{ started: boolean }> {
  return startStoryIllustrationGeneration(storyId);
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
  let imageMode: ImageMode = "fast";
  const storyMeta = await supabase
    .from("stories")
    .select("image_mode")
    .eq("id", storyId)
    .maybeSingle();
  if (storyMeta.error) {
    if (!storyMeta.error.message.includes("column stories.image_mode does not exist")) {
      throw new Error(storyMeta.error.message);
    }
  } else {
    imageMode = (storyMeta.data?.image_mode === "best" ? "best" : "fast") as ImageMode;
  }
  await processOnePage(page as StoryPageRow, imageMode);
}
