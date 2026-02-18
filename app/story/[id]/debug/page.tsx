export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";

const paramsSchema = z.object({ id: z.string().uuid("Invalid story id") });

export default async function StoryDebugPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolved = await params;
  const parsed = paramsSchema.safeParse(resolved);
  if (!parsed.success) notFound();

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, universe_id, title")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (storyError) throw new Error(storyError.message);
  if (!story || story.universe_id !== membership.universe_id) notFound();

  const { data: bible, error: bibleError } = await supabase
    .from("story_bibles")
    .select("story_bible_json, beat_sheet_json, continuity_ledger_json, updated_at")
    .eq("story_id", story.id)
    .maybeSingle();
  if (bibleError) throw new Error(bibleError.message);

  return (
    <main className="min-h-screen bg-app-bg text-anchor">
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <div className="card-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Story Debug</h1>
              <p className="mt-1 text-sm text-anchor/75">{story.title}</p>
            </div>
            <Link href={`/story/${story.id}`} className="rounded-xl border border-soft-accent px-4 py-2 text-sm">
              Back to story
            </Link>
          </div>
        </div>

        {!bible ? (
          <div className="card-surface p-6 text-sm text-anchor/70">No story bible data found for this story.</div>
        ) : (
          <>
            <section className="card-surface p-6">
              <h2 className="text-lg font-semibold">story_bible_json</h2>
              <pre className="mt-3 overflow-auto rounded-xl bg-soft-accent/30 p-4 text-xs">
                {JSON.stringify(bible.story_bible_json, null, 2)}
              </pre>
            </section>
            <section className="card-surface p-6">
              <h2 className="text-lg font-semibold">beat_sheet_json</h2>
              <pre className="mt-3 overflow-auto rounded-xl bg-soft-accent/30 p-4 text-xs">
                {JSON.stringify(bible.beat_sheet_json, null, 2)}
              </pre>
            </section>
            <section className="card-surface p-6">
              <h2 className="text-lg font-semibold">continuity_ledger_json</h2>
              <pre className="mt-3 overflow-auto rounded-xl bg-soft-accent/30 p-4 text-xs">
                {JSON.stringify(bible.continuity_ledger_json, null, 2)}
              </pre>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
