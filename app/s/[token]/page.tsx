export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const tokenSchema = z.string().trim().min(12).max(200);
const storySchema = z.object({
  title: z.string(),
  content: z.string(),
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

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("story_shares")
    .select("share_token, revoked_at, stories(title, content)")
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

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
            {story.title}
          </h1>
          <article className="mt-6 whitespace-pre-wrap leading-8 text-neutral-800">
            {story.content}
          </article>
        </div>
      </div>
    </main>
  );
}
