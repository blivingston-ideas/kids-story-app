export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import StoryBookViewer from "@/components/story-book-viewer";
import { getIllustrationPublicUrl } from "@/lib/story/illustrations";

const tokenSchema = z.string().trim().min(12).max(200);
const storySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  length_minutes: z.number().int().min(1).max(120).nullable().optional(),
  cover_image_url: z.string().nullable().optional(),
  first_page_image_url: z.string().nullable().optional(),
});
const shareSchema = z.object({
  share_token: z.string(),
  revoked_at: z.string().nullable(),
  stories: z.union([storySchema, z.array(storySchema), z.null()]),
});

type StoryPageCompat = {
  page_index: number;
  text: string;
  image_status: "pending" | "not_started" | "generating" | "ready" | "failed";
  image_path: string | null;
  image_url: string | null;
  image_error: string | null;
};

async function fetchStoryPagesWithCompat(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  storyId: string
): Promise<StoryPageCompat[]> {
  const primary = await supabase
    .from("story_pages")
    .select("page_index, text, image_status, image_path, image_url, image_error")
    .eq("story_id", storyId)
    .order("page_index", { ascending: true });

  if (!primary.error) {
    return (primary.data ?? []) as StoryPageCompat[];
  }

  if (!primary.error.message.includes("column story_pages.image_url does not exist")) {
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
  }));
}

export default async function PublicStoryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolved = await params;
  const parsed = tokenSchema.safeParse(resolved.token);
  if (!parsed.success) notFound();

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("story_shares")
    .select("share_token, revoked_at, stories(id, title, content, length_minutes, cover_image_url, first_page_image_url)")
    .eq("share_token", parsed.data)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const parsedShare = shareSchema.safeParse(data);
  if (!parsedShare.success) notFound();

  const share = parsedShare.data;
  if (share.revoked_at) notFound();
  const story = Array.isArray(share.stories) ? share.stories[0] : share.stories;
  if (!story) notFound();

  const storyPages = await fetchStoryPagesWithCompat(supabase, story.id);

  const viewerPages = storyPages.map((p) => ({
    pageIndex: p.page_index,
    text: p.text,
    imageStatus: p.image_status as "pending" | "not_started" | "generating" | "ready" | "failed",
    imageUrl: p.image_url ?? (p.image_path ? getIllustrationPublicUrl(p.image_path) : null),
    imageError: p.image_error,
  }));

  return (
    <main className="min-h-screen bg-app-bg">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-10">
        <div className="card-surface p-8">
          <StoryBookViewer
            title={story.title}
            content={story.content}
            lengthMinutes={story.length_minutes ?? 10}
            storyPages={viewerPages}
            coverImageUrl={story.cover_image_url ?? story.first_page_image_url ?? null}
          />
        </div>
      </div>
    </main>
  );
}
