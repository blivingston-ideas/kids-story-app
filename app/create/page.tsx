export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import CreateStoryWizard from "@/app/create/create-story-wizard";

type CharacterOption = {
  id: string;
  type: "kid" | "adult";
  label: string;
};

export default async function CreatePage() {
  const supabase = await createSupabaseServerClient();
  const { user, membership, universe } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership || !universe) redirect("/onboarding/create");

  const [{ data: kids, error: kidsError }, { data: adults, error: adultsError }] =
    await Promise.all([
      supabase
        .from("profiles_kid")
        .select("id, display_name")
        .eq("universe_id", universe.id)
        .order("display_name", { ascending: true }),
      supabase
        .from("profiles_adult")
        .select("id, display_name")
        .eq("universe_id", universe.id)
        .order("display_name", { ascending: true }),
    ]);

  if (kidsError) throw new Error(kidsError.message);
  if (adultsError) throw new Error(adultsError.message);

  const characterOptions: CharacterOption[] = [
    ...(kids ?? []).map((k) => ({ id: k.id, type: "kid" as const, label: k.display_name })),
    ...(adults ?? []).map((a) => ({ id: a.id, type: "adult" as const, label: a.display_name })),
  ];

  return <CreateStoryWizard characterOptions={characterOptions} />;
}
