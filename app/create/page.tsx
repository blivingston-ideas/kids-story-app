export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import CreateStoryWizard from "@/app/create/create-story-wizard";

type CharacterOption = {
  id: string;
  type: "kid" | "adult";
  label: string;
  avatarUrl: string | null;
  age: number | null;
};

export default async function CreatePage() {
  const supabase = await createSupabaseServerClient();
  const { user, membership, universe } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership || !universe) redirect("/onboarding/create");

  const kidPrimary = await supabase
    .from("profiles_kid")
    .select("id, display_name, age, avatar_url, profile_photo_url")
    .eq("universe_id", universe.id)
    .order("display_name", { ascending: true });
  const kidFallback = kidPrimary.error?.message.includes("column profiles_kid.profile_photo_url does not exist")
    ? await supabase
        .from("profiles_kid")
        .select("id, display_name, age, avatar_url")
        .eq("universe_id", universe.id)
        .order("display_name", { ascending: true })
    : null;
  const kids = kidFallback
    ? (kidFallback.data ?? []).map((k) => ({ ...k, profile_photo_url: null }))
    : (kidPrimary.data ?? []);
  const kidsError = kidFallback ? kidFallback.error : kidPrimary.error;

  const adultPrimary = await supabase
    .from("profiles_adult")
    .select("id, display_name, avatar_url, profile_photo_url")
    .eq("universe_id", universe.id)
    .order("display_name", { ascending: true });
  const adultFallback = adultPrimary.error?.message.includes("column profiles_adult.profile_photo_url does not exist")
    ? await supabase
        .from("profiles_adult")
        .select("id, display_name, avatar_url")
        .eq("universe_id", universe.id)
        .order("display_name", { ascending: true })
    : null;
  const adults = adultFallback
    ? (adultFallback.data ?? []).map((a) => ({ ...a, profile_photo_url: null }))
    : (adultPrimary.data ?? []);
  const adultsError = adultFallback ? adultFallback.error : adultPrimary.error;

  if (kidsError) throw new Error(kidsError.message);
  if (adultsError) throw new Error(adultsError.message);

  const characterOptions: CharacterOption[] = [
    ...(kids ?? []).map((k) => ({
      id: k.id,
      type: "kid" as const,
      label: k.display_name,
      avatarUrl: k.profile_photo_url ? `/api/profiles/photo/kid/${k.id}` : (k.avatar_url ?? null),
      age: typeof k.age === "number" ? k.age : null,
    })),
    ...(adults ?? []).map((a) => ({
      id: a.id,
      type: "adult" as const,
      label: a.display_name,
      avatarUrl: a.profile_photo_url ? `/api/profiles/photo/adult/${a.id}` : (a.avatar_url ?? null),
      age: null,
    })),
  ];

  return <CreateStoryWizard universeId={universe.id} characterOptions={characterOptions} />;
}
