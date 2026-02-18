export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import { createShareAction, revokeShareAction, updateStoryImageModeAction } from "@/app/story/[id]/actions";
import StoryBookViewer from "@/components/story-book-viewer";
import { getIllustrationPublicUrl } from "@/lib/story/illustrations";
import { buildStoryPageTexts } from "@/lib/story/pages";
import { getStoryCost } from "@/lib/costs/getStoryCost";
import { startStoryIllustrationGeneration } from "@/lib/story/illustration-jobs";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid story id"),
});

type StoryCharacterRow = {
  character_type: "kid" | "adult" | "custom";
  character_id: string | null;
  custom_name: string | null;
};

type StoryPageRow = {
  page_index: number;
  text: string;
  image_status: "pending" | "not_started" | "generating" | "ready" | "failed";
  image_path: string | null;
  image_url: string | null;
  image_error: string | null;
  image_prompt: string | null;
};

async function fetchStoryPagesWithCompat(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storyId: string
): Promise<StoryPageRow[]> {
  const primary = await supabase
    .from("story_pages")
    .select("page_index, text, image_status, image_path, image_url, image_error, image_prompt")
    .eq("story_id", storyId)
    .order("page_index", { ascending: true });

  if (!primary.error) {
    return (primary.data ?? []) as StoryPageRow[];
  }

  if (
    !primary.error.message.includes("column story_pages.image_url does not exist") &&
    !primary.error.message.includes("column story_pages.image_prompt does not exist")
  ) {
    throw new Error(primary.error.message);
  }

  const fallback = await supabase
    .from("story_pages")
    .select("page_index, text, image_status, image_path, image_error")
    .eq("story_id", storyId)
    .order("page_index", { ascending: true });

  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []).map((p) => ({
    page_index: p.page_index,
    text: p.text,
    image_status: p.image_status as "pending" | "not_started" | "generating" | "ready" | "failed",
    image_path: p.image_path,
    image_url: null,
    image_error: p.image_error,
    image_prompt: null,
  }));
}

export default async function StoryReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = await params;
  const parsed = paramsSchema.safeParse(resolved);
  if (!parsed.success) notFound();

  const supabase = await createSupabaseServerClient();
  const { user, membership, universe } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership || !universe) redirect("/onboarding/create");

  const storyWithMode = await supabase
    .from("stories")
    .select("id, universe_id, title, content, tone, length_minutes, created_at, image_mode, cover_image_url, first_page_image_url, style_bible, style_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const storyFallback =
    storyWithMode.error &&
    (storyWithMode.error.message.includes("column stories.image_mode does not exist") ||
      storyWithMode.error.message.includes("column stories.cover_image_url does not exist") ||
      storyWithMode.error.message.includes("column stories.first_page_image_url does not exist") ||
      storyWithMode.error.message.includes("column stories.style_bible does not exist") ||
      storyWithMode.error.message.includes("column stories.style_id does not exist"))
    ? await supabase
        .from("stories")
        .select("id, universe_id, title, content, tone, length_minutes, created_at")
        .eq("id", parsed.data.id)
        .maybeSingle()
    : null;

  const storyError = storyFallback ? storyFallback.error : storyWithMode.error;
  const story = (storyFallback ? storyFallback.data : storyWithMode.data) as
    | {
        id: string;
        universe_id: string;
        title: string;
        content: string;
        tone: string;
        length_minutes: number;
        created_at: string;
        image_mode?: string | null;
        cover_image_url?: string | null;
        first_page_image_url?: string | null;
        style_bible?: string | null;
        style_id?: string | null;
      }
    | null;

  if (storyError) throw new Error(storyError.message);
  if (!story || story.universe_id !== membership.universe_id) notFound();

  const { data: share, error: shareError } = await supabase
    .from("story_shares")
    .select("share_token, revoked_at")
    .eq("story_id", story.id)
    .maybeSingle();

  if (shareError) throw new Error(shareError.message);

  const { data: characters, error: charactersError } = await supabase
    .from("story_characters")
    .select("character_type, character_id, custom_name")
    .eq("story_id", story.id);

  if (charactersError) throw new Error(charactersError.message);

  let storyPages = await fetchStoryPagesWithCompat(supabase, story.id);

  if ((storyPages ?? []).length === 0) {
    const generatedPages = buildStoryPageTexts(story.content, story.length_minutes).map((p) => ({
      story_id: story.id,
      page_index: p.pageIndex,
      text: p.text,
      image_status: "pending" as const,
    }));
    if (generatedPages.length > 0) {
      const { error: createPagesError } = await supabase
        .from("story_pages")
        .upsert(generatedPages, { onConflict: "story_id,page_index", ignoreDuplicates: true });
      if (createPagesError) throw new Error(createPagesError.message);
      storyPages = await fetchStoryPagesWithCompat(supabase, story.id);
    }
  }

  if (
    storyPages.some((p) => p.image_status === "pending" || p.image_status === "not_started" || p.image_status === "failed")
  ) {
    try {
      await startStoryIllustrationGeneration(story.id);
    } catch {
      // Non-blocking: viewer can still request generation from the client UI.
    }
  }

  const rows = (characters ?? []) as StoryCharacterRow[];
  const kidIds = rows.filter((r) => r.character_type === "kid" && r.character_id).map((r) => r.character_id as string);
  const adultIds = rows
    .filter((r) => r.character_type === "adult" && r.character_id)
    .map((r) => r.character_id as string);

  const [{ data: kidProfiles }, { data: adultProfiles }] = await Promise.all([
    kidIds.length > 0
      ? supabase.from("profiles_kid").select("id, display_name").in("id", kidIds)
      : Promise.resolve({ data: [], error: null }),
    adultIds.length > 0
      ? supabase.from("profiles_adult").select("id, display_name").in("id", adultIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const kidMap = new Map((kidProfiles ?? []).map((p) => [p.id, p.display_name]));
  const adultMap = new Map((adultProfiles ?? []).map((p) => [p.id, p.display_name]));

  const characterNames = rows
    .map((row) => {
      if (row.character_type === "custom") return row.custom_name;
      if (row.character_type === "kid" && row.character_id) return kidMap.get(row.character_id) ?? row.custom_name ?? null;
      if (row.character_type === "adult" && row.character_id) return adultMap.get(row.character_id) ?? row.custom_name ?? null;
      return null;
    })
    .filter((name): name is string => Boolean(name));

  const shareUrl =
    share && !share.revoked_at ? `/s/${share.share_token}` : null;

  const viewerPages = storyPages.map((p) => ({
    pageIndex: p.page_index,
    text: p.text,
    imageStatus: p.image_status,
    imageUrl: p.image_url ?? (p.image_path ? getIllustrationPublicUrl(p.image_path) : null),
    imageError: p.image_error,
  }));
  const costSummary = await getStoryCost(story.id);
  const costLabel = costSummary.hasRows
    ? `Cost to create this story: $${costSummary.totalCostUSD.toFixed(2)}`
    : "Cost to create this story: (tracking unavailable)";

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-10 space-y-6">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">Story Reader</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900">{story.title}</h1>
              <p className="mt-2 text-sm text-neutral-600">
                Universe: <span className="font-medium text-neutral-900">{universe.name}</span>
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-700">
                {story.tone}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-700">
                {story.length_minutes} min
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs text-neutral-500">Characters</p>
            <p className="mt-1 text-sm text-neutral-800">
              {characterNames.length > 0 ? characterNames.join(", ") : "No characters linked"}
            </p>
          </div>

          <div className="mt-6">
            <StoryBookViewer
              title={story.title}
              content={story.content}
              lengthMinutes={story.length_minutes}
              storyId={story.id}
              canManageIllustrations
              storyPages={viewerPages}
              coverImageUrl={story.cover_image_url ?? story.first_page_image_url ?? null}
            />
          </div>
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Image Mode</p>
            <div className="mt-2 flex items-center gap-2">
              <form action={updateStoryImageModeAction.bind(null, story.id)}>
                <input type="hidden" name="image_mode" value="fast" />
                <button
                  type="submit"
                  className={`rounded-xl px-3 py-2 text-xs font-medium ${
                    (story.image_mode ?? "fast") === "fast"
                      ? "bg-neutral-900 text-white"
                      : "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100"
                  }`}
                >
                  Fast
                </button>
              </form>
              <form action={updateStoryImageModeAction.bind(null, story.id)}>
                <input type="hidden" name="image_mode" value="best" />
                <button
                  type="submit"
                  className={`rounded-xl px-3 py-2 text-xs font-medium ${
                    (story.image_mode ?? "fast") === "best"
                      ? "bg-neutral-900 text-white"
                      : "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100"
                  }`}
                >
                  Best
                </button>
              </form>
            </div>
          </div>
          <p className="mt-6 text-sm text-neutral-600">{costLabel}</p>
          {process.env.NODE_ENV !== "production" ? (
            <details className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <summary className="cursor-pointer text-sm font-medium text-neutral-800">Image Style Debug</summary>
              <div className="mt-3 space-y-3 text-xs">
                <p>
                  <span className="font-medium">style_id:</span> {story.style_id ?? "missing"}
                </p>
                <pre className="overflow-auto rounded-xl bg-white p-3 text-[11px]">
                  {story.style_bible ?? "missing"}
                </pre>
                {storyPages.map((page) => (
                  <details key={`prompt-${page.page_index}`} className="rounded-xl border border-neutral-200 bg-white p-3">
                    <summary className="cursor-pointer">Page {page.page_index + 1} prompt</summary>
                    <pre className="mt-2 overflow-auto text-[11px]">{page.image_prompt ?? "missing"}</pre>
                  </details>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">Share</h2>
          {shareUrl ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-neutral-700 break-all">{shareUrl}</p>
              <form action={revokeShareAction.bind(null, story.id)}>
                <button
                  type="submit"
                  className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50"
                >
                  Revoke share
                </button>
              </form>
            </div>
          ) : (
            <form className="mt-3" action={createShareAction.bind(null, story.id)}>
              <button
                type="submit"
                className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
              >
                Create share link
              </button>
            </form>
          )}
        </div>

        <div className="flex gap-3">
          <Link
            href="/library"
            className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50"
          >
            Back to library
          </Link>
          <Link
            href={`/story/${story.id}/debug`}
            className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50"
          >
            Debug JSON
          </Link>
          <Link
            href="/create"
            className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
          >
            Create another story
          </Link>
        </div>
      </div>
    </main>
  );
}
