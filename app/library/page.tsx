import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import { isParent } from "@/lib/data/roles";

type CharacterRow = {
  story_id: string;
  character_type: "kid" | "adult" | "custom";
  character_id: string | null;
  custom_name: string | null;
};

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tone?: string; q?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { tone, q } = await searchParams;
  const { user, membership, universe } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership || !universe) redirect("/onboarding");

  const parent = isParent(membership);
  const toneFilter = tone && ["calm", "silly", "adventurous"].includes(tone) ? tone : "";
  const titleQuery = (q ?? "").trim();

  let storiesQuery = supabase
    .from("stories")
    .select("id, title, tone, length_minutes, created_at")
    .eq("universe_id", universe.id)
    .order("created_at", { ascending: false });

  if (toneFilter) storiesQuery = storiesQuery.eq("tone", toneFilter);
  if (titleQuery) storiesQuery = storiesQuery.ilike("title", `%${titleQuery}%`);

  const { data: stories, error: storiesError } = await storiesQuery;
  if (storiesError) throw new Error(storiesError.message);

  const storyIds = (stories ?? []).map((story) => story.id);

  const { data: characterRows, error: charactersError } = storyIds.length
    ? await supabase
        .from("story_characters")
        .select("story_id, character_type, character_id, custom_name")
        .in("story_id", storyIds)
    : { data: [], error: null };

  if (charactersError) throw new Error(charactersError.message);

  const rows = (characterRows ?? []) as CharacterRow[];
  const kidIds = rows.filter((r) => r.character_type === "kid" && r.character_id).map((r) => r.character_id as string);
  const adultIds = rows
    .filter((r) => r.character_type === "adult" && r.character_id)
    .map((r) => r.character_id as string);

  const [{ data: kids }, { data: adults }] = await Promise.all([
    kidIds.length > 0
      ? supabase.from("profiles_kid").select("id, display_name").in("id", kidIds)
      : Promise.resolve({ data: [], error: null }),
    adultIds.length > 0
      ? supabase.from("profiles_adult").select("id, display_name").in("id", adultIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const kidMap = new Map((kids ?? []).map((k) => [k.id, k.display_name]));
  const adultMap = new Map((adults ?? []).map((a) => [a.id, a.display_name]));

  const characterSummaryByStory = new Map<string, string>();
  for (const storyId of storyIds) {
    const names = rows
      .filter((r) => r.story_id === storyId)
      .map((r) => {
        if (r.character_type === "custom") return r.custom_name;
        if (r.character_type === "kid" && r.character_id) return kidMap.get(r.character_id) ?? null;
        if (r.character_type === "adult" && r.character_id) return adultMap.get(r.character_id) ?? null;
        return null;
      })
      .filter((name): name is string => Boolean(name));

    characterSummaryByStory.set(storyId, names.length > 0 ? names.join(", ") : "No characters linked");
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Universe: <span className="font-medium text-neutral-900">{universe.name}</span>
          </p>

          <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              name="q"
              defaultValue={titleQuery}
              placeholder="Search title"
              className="rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
            />
            <select
              name="tone"
              defaultValue={toneFilter || ""}
              className="rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
            >
              <option value="">All tones</option>
              <option value="calm">calm</option>
              <option value="silly">silly</option>
              <option value="adventurous">adventurous</option>
            </select>
            <button
              type="submit"
              className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50"
            >
              Apply
            </button>
          </form>

          <div className="mt-6 flex gap-3">
            <Link
              href="/create"
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
            >
              Create a story
            </Link>
            {parent ? (
              <Link
                href="/profiles/new"
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50"
              >
                Add profile
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4">
          {(stories ?? []).length === 0 ? (
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-neutral-600">No stories found for this filter.</p>
            </div>
          ) : (
            (stories ?? []).map((story) => (
              <Link
                key={story.id}
                href={`/story/${story.id}`}
                className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-neutral-900">{story.title}</h2>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-700">
                      {story.tone}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-700">
                      {story.length_minutes} min
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {new Date(story.created_at).toLocaleString()}
                </p>
                <p className="mt-3 text-sm text-neutral-700">
                  {characterSummaryByStory.get(story.id) ?? "No characters linked"}
                </p>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
