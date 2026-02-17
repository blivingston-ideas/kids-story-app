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
});
const shareSchema = z.object({
  share_token: z.string(),
  revoked_at: z.string().nullable(),
  stories: z.union([storySchema, z.array(storySchema), z.null()]),
});

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
    .select("share_token, revoked_at, stories(id, title, content, length_minutes)")
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

  const { data: storyPages } = await supabase
    .from("story_pages")
    .select("page_index, text, image_status, image_path, image_error")
    .eq("story_id", story.id)
    .order("page_index", { ascending: true });

  const viewerPages = (storyPages ?? []).map((p) => ({
    pageIndex: p.page_index,
    text: p.text,
    imageStatus: p.image_status as "not_started" | "generating" | "ready" | "failed",
    imageUrl: p.image_path ? getIllustrationPublicUrl(p.image_path) : null,
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
          />
        </div>
      </div>
    </main>
  );
}
