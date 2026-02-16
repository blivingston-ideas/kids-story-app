import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import { isParent } from "@/lib/data/roles";
import LibraryClient from "@/app/library/library-client";

type CharacterRow = {
  story_id: string;
  character_type: "kid" | "adult" | "custom";
  character_id: string | null;
  custom_name: string | null;
};

type StoryRow = {
  id: string;
  created_by: string;
  title: string;
  tone: string;
  length_minutes: number;
  created_at: string;
};

export default async function LibraryPage() {
  const supabase = await createSupabaseServerClient();
  const { user, membership, universe } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership || !universe) redirect("/onboarding");

  const parent = isParent(membership);

  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("id, created_by, title, tone, length_minutes, created_at")
    .eq("universe_id", universe.id)
    .order("created_at", { ascending: false });

  if (storiesError) throw new Error(storiesError.message);

  const storyList = (stories ?? []) as StoryRow[];
  const storyIds = storyList.map((story) => story.id);

  const { data: characterRows, error: charactersError } = storyIds.length
    ? await supabase
        .from("story_characters")
        .select("story_id, character_type, character_id, custom_name")
        .in("story_id", storyIds)
    : { data: [], error: null };

  if (charactersError) throw new Error(charactersError.message);

  const rows = (characterRows ?? []) as CharacterRow[];
  const kidIds = rows
    .filter((r) => r.character_type === "kid" && r.character_id)
    .map((r) => r.character_id as string);
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

  const storiesForClient = storyList.map((story) => {
    const names = rows
      .filter((r) => r.story_id === story.id)
      .map((r) => {
        if (r.character_type === "custom") return r.custom_name;
        if (r.character_type === "kid" && r.character_id) return kidMap.get(r.character_id) ?? null;
        if (r.character_type === "adult" && r.character_id) return adultMap.get(r.character_id) ?? null;
        return null;
      })
      .filter((name): name is string => Boolean(name));

    return {
      id: story.id,
      title: story.title,
      created_at: story.created_at,
      tone: story.tone,
      length_minutes: story.length_minutes,
      characterSummary: names.length > 0 ? names.join(", ") : "No characters linked",
      canDelete: story.created_by === user.id,
    };
  });

  return <LibraryClient stories={storiesForClient} isParent={parent} />;
}
