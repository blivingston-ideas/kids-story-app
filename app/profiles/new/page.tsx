// app/profiles/new/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import { assertParent, isParent } from "@/lib/data/roles";
import { adultProfileSchema, kidProfileSchema, parseCsvList } from "@/lib/validation/profiles";

type ProfileType = "kid" | "adult";
type UniverseRef = { name: string } | { name: string }[] | null;

async function createProfile(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");

  assertParent(membership);

  const universeId = membership.universe_id;
  const profileType = String(formData.get("profile_type") ?? "kid") as ProfileType;

  if (profileType === "kid") {
    const parsed = kidProfileSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      age: String(formData.get("age") ?? ""),
      themes: String(formData.get("themes") ?? ""),
      books_we_like: String(formData.get("books_we_like") ?? ""),
      character_traits: String(formData.get("character_traits") ?? ""),
      avatar_url: String(formData.get("avatar_url") ?? ""),
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
      persona_label: String(formData.get("role_label") ?? ""),
      avatar_url: String(formData.get("avatar_url") ?? ""),
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid adult profile data");
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
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <header className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Create a profile</h1>
              <p className="mt-2 text-sm text-neutral-600">
                Add kids and adults so stories can include the right characters,
                vibes, and details.
              </p>
              {universeName ? (
                <p className="mt-2 text-xs text-neutral-500">
                  Universe:{" "}
                  <span className="font-medium text-neutral-800">{universeName}</span>
                </p>
              ) : null}
            </div>

            <Link
              href="/profiles"
              className="rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50"
            >
              Back
            </Link>
          </div>
        </header>

        <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 p-6">
            <div className="text-sm font-semibold text-neutral-900">Profile details</div>
            <div className="mt-1 text-sm text-neutral-600">Start simple. You can edit these later.</div>
          </div>

          <form action={createProfile} className="p-6 space-y-6">
            <div className="space-y-2">
              <div className="text-sm font-medium text-neutral-900">Profile type</div>
              <div className="grid grid-cols-2 gap-3">
                <label className="group flex cursor-pointer items-center justify-between rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm hover:bg-neutral-50">
                  <span className="font-medium">Kid</span>
                  <input type="radio" name="profile_type" value="kid" defaultChecked className="h-4 w-4" />
                </label>
                <label className="group flex cursor-pointer items-center justify-between rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm hover:bg-neutral-50">
                  <span className="font-medium">Adult</span>
                  <input type="radio" name="profile_type" value="adult" className="h-4 w-4" />
                </label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">Name</label>
                <input
                  id="name"
                  name="name"
                  placeholder="e.g. William"
                  className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Age (kid) or Role label (adult)</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    name="age"
                    inputMode="numeric"
                    placeholder="Age"
                    className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
                  />
                  <input
                    name="role_label"
                    placeholder='Role label (e.g. "Inventor")'
                    className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
                  />
                </div>
                <p className="text-xs text-neutral-500">Fill whichever applies; the other will be ignored.</p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="themes" className="text-sm font-medium">Themes (comma-separated)</label>
              <input
                id="themes"
                name="themes"
                placeholder="e.g. dinosaurs, space, friendship"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="books_we_like" className="text-sm font-medium">Books we like (comma-separated)</label>
              <input
                id="books_we_like"
                name="books_we_like"
                placeholder="e.g. The Last Firehawk, Pete the Cat"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="character_traits" className="text-sm font-medium">Character traits (comma-separated)</label>
              <input
                id="character_traits"
                name="character_traits"
                placeholder="e.g. brave, curious, funny"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="avatar_url" className="text-sm font-medium">Avatar URL (optional)</label>
              <input
                id="avatar_url"
                name="avatar_url"
                placeholder="https://example.com/avatar.png"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Link
                href="/profiles"
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-4 focus:ring-neutral-900/20"
              >
                Create profile
              </button>
            </div>
          </form>
        </div>

        <footer className="mt-6 text-xs text-neutral-500">
          Signed in as <span className="font-medium text-neutral-800">{user.email}</span>
        </footer>
      </div>
    </main>
  );
}
