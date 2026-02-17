export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import { assertParent } from "@/lib/data/roles";
import { adultProfileSchema, kidProfileSchema, parseCsvList } from "@/lib/validation/profiles";

const paramsSchema = z.object({
  kind: z.enum(["kid", "adult"]),
  id: z.string().uuid("Invalid profile id"),
});

async function updateProfile(formData: FormData) {
  "use server";

  const parsedParams = paramsSchema.safeParse({
    kind: String(formData.get("kind") ?? ""),
    id: String(formData.get("id") ?? ""),
  });
  if (!parsedParams.success) throw new Error(parsedParams.error.issues[0]?.message ?? "Invalid profile");

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");
  assertParent(membership);

  const avatarCandidate = formData.get("avatar_file");
  let avatarUploadData: string | null = null;
  if (avatarCandidate instanceof File && avatarCandidate.size > 0) {
    const maxBytes = 1_000_000;
    if (avatarCandidate.size > maxBytes) throw new Error("Profile photo must be 1MB or smaller.");
    const bytes = Buffer.from(await avatarCandidate.arrayBuffer()).toString("base64");
    const mime = avatarCandidate.type || "image/png";
    avatarUploadData = `data:${mime};base64,${bytes}`;
  }

  if (parsedParams.data.kind === "kid") {
    const { data: existingKid, error: existingKidError } = await supabase
      .from("profiles_kid")
      .select("avatar_url")
      .eq("id", parsedParams.data.id)
      .eq("universe_id", membership.universe_id)
      .maybeSingle();
    if (existingKidError) throw new Error(existingKidError.message);

    const parsed = kidProfileSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      age: String(formData.get("age") ?? ""),
      themes: String(formData.get("themes") ?? ""),
      books_we_like: String(formData.get("books_we_like") ?? ""),
      character_traits: String(formData.get("character_traits") ?? ""),
      avatar_url: avatarUploadData ?? existingKid?.avatar_url ?? "",
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid kid profile data");
    }

    const { error } = await supabase
      .from("profiles_kid")
      .update({
        display_name: parsed.data.name,
        age: parsed.data.age,
        themes: parseCsvList(parsed.data.themes),
        books_we_like: parseCsvList(parsed.data.books_we_like),
        character_traits: parseCsvList(parsed.data.character_traits),
        avatar_url: parsed.data.avatar_url || null,
      })
      .eq("id", parsedParams.data.id)
      .eq("universe_id", membership.universe_id);

    if (error) throw new Error(error.message);
  } else {
    const { data: existingAdult, error: existingAdultError } = await supabase
      .from("profiles_adult")
      .select("avatar_url")
      .eq("id", parsedParams.data.id)
      .eq("universe_id", membership.universe_id)
      .maybeSingle();
    if (existingAdultError) throw new Error(existingAdultError.message);

    const parsed = adultProfileSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      persona_label: String(formData.get("persona_label") ?? ""),
      avatar_url: avatarUploadData ?? existingAdult?.avatar_url ?? "",
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid adult profile data");
    }

    const { error } = await supabase
      .from("profiles_adult")
      .update({
        display_name: parsed.data.name,
        persona_label: parsed.data.persona_label || null,
        avatar_url: parsed.data.avatar_url || null,
      })
      .eq("id", parsedParams.data.id)
      .eq("universe_id", membership.universe_id);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/profiles");
  redirect("/profiles");
}

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const resolved = await params;
  const parsedParams = paramsSchema.safeParse(resolved);
  if (!parsedParams.success) notFound();

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");
  assertParent(membership);

  if (parsedParams.data.kind === "kid") {
    const { data: kid, error } = await supabase
      .from("profiles_kid")
      .select("id, display_name, age, themes, books_we_like, character_traits, avatar_url")
      .eq("id", parsedParams.data.id)
      .eq("universe_id", membership.universe_id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!kid) notFound();

    return (
      <main className="min-h-screen bg-neutral-50">
        <div className="mx-auto max-w-2xl px-6 py-10">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight">Edit kid profile</h1>
            <form action={updateProfile} className="mt-6 space-y-4">
              <input type="hidden" name="kind" value="kid" />
              <input type="hidden" name="id" value={kid.id} />
              <input
                name="name"
                defaultValue={kid.display_name}
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                required
              />
              <input
                name="age"
                defaultValue={kid.age ?? ""}
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                placeholder="Age"
              />
              <input
                name="themes"
                defaultValue={kid.themes?.join(", ") ?? ""}
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                placeholder="Themes"
              />
              <input
                name="books_we_like"
                defaultValue={kid.books_we_like?.join(", ") ?? ""}
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                placeholder="Books we like"
              />
              <input
                name="character_traits"
                defaultValue={kid.character_traits?.join(", ") ?? ""}
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                placeholder="Character traits"
              />
              <input
                type="file"
                name="avatar_file"
                accept="image/*"
                className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-800"
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
                >
                  Save
                </button>
                <Link
                  href="/profiles"
                  className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const { data: adult, error } = await supabase
    .from("profiles_adult")
    .select("id, display_name, persona_label, avatar_url")
    .eq("id", parsedParams.data.id)
    .eq("universe_id", membership.universe_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!adult) notFound();

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Edit adult profile</h1>
          <form action={updateProfile} className="mt-6 space-y-4">
            <input type="hidden" name="kind" value="adult" />
            <input type="hidden" name="id" value={adult.id} />
            <input
              name="name"
              defaultValue={adult.display_name}
              className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
              required
            />
            <input
              name="persona_label"
              defaultValue={adult.persona_label ?? ""}
              className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
              placeholder='Role label (e.g. "Inventor")'
            />
            <input
              type="file"
              name="avatar_file"
              accept="image/*"
              className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-800"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
              >
                Save
              </button>
              <Link
                href="/profiles"
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
