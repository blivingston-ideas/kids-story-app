export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import { createShareAction, revokeShareAction } from "@/app/story/[id]/actions";
import StoryBookViewer from "@/components/story-book-viewer";
import { getIllustrationPublicUrl } from "@/lib/story/illustrations";
import { buildStoryPageTexts } from "@/lib/story/pages";

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
  image_status: "not_started" | "generating" | "ready" | "failed";
  image_path: string | null;
  image_error: string | null;
};

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

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, universe_id, title, content, tone, length_minutes, created_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

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

  let { data: storyPages } = await supabase
    .from("story_pages")
    .select("page_index, text, image_status, image_path, image_error")
    .eq("story_id", story.id)
    .order("page_index", { ascending: true });

  if ((storyPages ?? []).length === 0) {
    const generatedPages = buildStoryPageTexts(story.content, story.length_minutes).map((p) => ({
      story_id: story.id,
      page_index: p.pageIndex,
      text: p.text,
      image_status: "not_started" as const,
    }));
    if (generatedPages.length > 0) {
      const { error: createPagesError } = await supabase.from("story_pages").insert(generatedPages);
      if (createPagesError) throw new Error(createPagesError.message);
      const refreshed = await supabase
        .from("story_pages")
        .select("page_index, text, image_status, image_path, image_error")
        .eq("story_id", story.id)
        .order("page_index", { ascending: true });
      if (refreshed.error) throw new Error(refreshed.error.message);
      storyPages = refreshed.data;
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
      if (row.character_type === "kid" && row.character_id) return kidMap.get(row.character_id) ?? null;
      if (row.character_type === "adult" && row.character_id) return adultMap.get(row.character_id) ?? null;
      return null;
    })
    .filter((name): name is string => Boolean(name));

  const shareUrl =
    share && !share.revoked_at ? `/s/${share.share_token}` : null;

  const viewerPages = ((storyPages ?? []) as StoryPageRow[]).map((p) => ({
    pageIndex: p.page_index,
    text: p.text,
    imageStatus: p.image_status,
    imageUrl: p.image_path ? getIllustrationPublicUrl(p.image_path) : null,
    imageError: p.image_error,
  }));

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
            />
          </div>
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
