export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import { assertParent, isParent } from "@/lib/data/roles";
import { adultProfileSchema, kidProfileSchema, parseCsvList } from "@/lib/validation/profiles";
import ProfileCreateForm from "@/app/profiles/new/profile-create-form";

type ProfileType = "kid" | "adult" | "grandparent" | "aunt_uncle" | "cousin";
type UniverseRef = { name: string } | { name: string }[] | null;

function profileTypeLabel(profileType: Exclude<ProfileType, "kid">): string {
  if (profileType === "adult") return "Adult";
  if (profileType === "grandparent") return "Grandparent";
  if (profileType === "aunt_uncle") return "Aunt/Uncle";
  return "Cousin";
}

async function toDataUrl(file: File): Promise<string> {
  const maxBytes = 1_000_000;
  if (file.size > maxBytes) {
    throw new Error("Profile photo must be 1MB or smaller.");
  }
  const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mime = file.type || "image/png";
  return `data:${mime};base64,${bytes}`;
}

async function createProfile(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");
  assertParent(membership);

  const universeId = membership.universe_id;
  const profileType = String(formData.get("profile_type") ?? "kid") as ProfileType;

  const avatarCandidate = formData.get("avatar_file");
  let avatarUrl = "";
  if (avatarCandidate instanceof File && avatarCandidate.size > 0) {
    avatarUrl = await toDataUrl(avatarCandidate);
  }

  const themesValue = String(formData.get("themes") ?? "");
  const booksValue = String(formData.get("books_we_like") ?? "");
  const traitsValue = String(formData.get("character_traits") ?? "");
  const catchPhrasesValue = String(formData.get("catch_phrases") ?? "");

  if (profileType === "kid") {
    const parsed = kidProfileSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      age: String(formData.get("age") ?? ""),
      themes: themesValue,
      books_we_like: booksValue,
      character_traits: [traitsValue, catchPhrasesValue].filter(Boolean).join(", "),
      avatar_url: avatarUrl,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid kid profile data");
    }

    const { error } = await supabase.from("profiles_kid").insert({
      universe_id: universeId,
      display_name: parsed.data.name,
      age: parsed.data.age,
      themes: parseCsvList(parsed.data.themes),
      books_we_like: parseCsvList(parsed.data.books_we_like),
      character_traits: parseCsvList(parsed.data.character_traits),
      avatar_url: parsed.data.avatar_url || null,
    });

    if (error) throw new Error(error.message);
  } else {
    const parsed = adultProfileSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      persona_label: profileTypeLabel(profileType),
      avatar_url: avatarUrl,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid profile data");
    }

    const { error } = await supabase.from("profiles_adult").insert({
      universe_id: universeId,
      user_id: user.id,
      display_name: parsed.data.name,
      persona_label: parsed.data.persona_label || null,
      avatar_url: parsed.data.avatar_url || null,
    });

    if (error) throw new Error(error.message);
  }

  revalidatePath("/onboarding");
  revalidatePath("/profiles");
  redirect("/profiles");
}

export default async function NewProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");
  if (!isParent(membership)) redirect("/profiles");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, universe_id, created_at, universes!memberships_universe_id_fkey(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!memberships?.[0]?.universe_id) redirect("/onboarding/create");

  const u = memberships?.[0]?.universes as UniverseRef;
  const universeName = Array.isArray(u) ? u?.[0]?.name : u?.name;

  return (
    <main className="min-h-screen bg-app-bg text-anchor">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-4">
          <Link
            href="/profiles"
            className="inline-flex rounded-xl border border-soft-accent bg-white px-4 py-2 text-sm font-medium text-anchor hover:bg-soft-accent"
          >
            Back
          </Link>
        </div>

        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-anchor">Create a profile</h1>
          <p className="mt-2 text-sm text-anchor/75">
            Add family profiles so stories can include the right characters and details.
          </p>
          {universeName ? (
            <p className="mt-2 text-xs text-anchor/65">
              Universe: <span className="font-medium text-anchor">{universeName}</span>
            </p>
          ) : null}
        </header>

        <div className="card-surface overflow-hidden">
          <div className="border-b border-soft-accent p-6">
            <div className="text-sm font-semibold text-anchor">Profile details</div>
            <div className="mt-1 text-sm text-anchor/75">
              Tell us about yourself! You can change/edit/add later.
            </div>
          </div>

          <ProfileCreateForm action={createProfile} />
        </div>

        <footer className="mt-6 text-xs text-anchor/65">
          Signed in as <span className="font-medium text-anchor">{user.email}</span>
        </footer>
      </div>
    </main>
  );
}
