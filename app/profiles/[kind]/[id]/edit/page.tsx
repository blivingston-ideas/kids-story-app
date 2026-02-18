export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import { assertParent } from "@/lib/data/roles";
import { adultProfileSchema, kidProfileSchema, parseCsvList } from "@/lib/validation/profiles";
import AppearanceFields from "@/app/profiles/components/appearance-fields";
import { normalizeProfileAppearance, type ProfileAppearance } from "@/lib/schemas/profileAppearance";
import { uploadProfilePhoto } from "@/lib/profiles/photo";

const paramsSchema = z.object({
  kind: z.enum(["kid", "adult"]),
  id: z.string().uuid("Invalid profile id"),
});

function isMissingColumnError(message: string, table: "profiles_kid" | "profiles_adult", column: string): boolean {
  const normalized = message.toLowerCase();
  const tableLc = table.toLowerCase();
  const columnLc = column.toLowerCase();
  return (
    normalized.includes(`column "${columnLc}"`) ||
    normalized.includes(`column ${tableLc}.${columnLc} does not exist`) ||
    (normalized.includes("could not find") &&
      normalized.includes(`'${columnLc}'`) &&
      normalized.includes(`'${tableLc}'`) &&
      normalized.includes("schema cache"))
  );
}

async function updateWithAppearanceCompat(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: "profiles_kid" | "profiles_adult",
  id: string,
  universeId: string,
  base: Record<string, unknown>,
  appearance: ProfileAppearance
): Promise<void> {
  const withPrimary = await supabase
    .from(table)
    .update({ ...base, profile_appearance_json: appearance })
    .eq("id", id)
    .eq("universe_id", universeId);
  if (!withPrimary.error) return;
  if (!isMissingColumnError(withPrimary.error.message, table, "profile_appearance_json")) {
    throw new Error(withPrimary.error.message);
  }

  const withLegacy = await supabase
    .from(table)
    .update({ ...base, profile_attributes_json: appearance })
    .eq("id", id)
    .eq("universe_id", universeId);
  if (!withLegacy.error) return;
  if (!isMissingColumnError(withLegacy.error.message, table, "profile_attributes_json")) {
    throw new Error(withLegacy.error.message);
  }

  const withoutAppearance = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("universe_id", universeId)
    .maybeSingle();
  if (withoutAppearance.error) throw new Error(withoutAppearance.error.message);
  throw new Error(
    `Appearance columns are missing on ${table}. Run 'supabase db push' to apply latest migrations.`
  );
}

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

  const appearanceRaw = String(formData.get("profile_appearance_json") ?? "{}");
  let appearance: ProfileAppearance;
  try {
    appearance = normalizeProfileAppearance(JSON.parse(appearanceRaw) as unknown);
  } catch {
    throw new Error("Invalid appearance data.");
  }
  const removePhoto = String(formData.get("remove_profile_photo") ?? "0") === "1";

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
      avatar_url: existingKid?.avatar_url ?? "",
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid kid profile data");
    }

    await updateWithAppearanceCompat(
      supabase,
      "profiles_kid",
      parsedParams.data.id,
      membership.universe_id,
      {
        display_name: parsed.data.name,
        age: parsed.data.age,
        themes: parseCsvList(parsed.data.themes),
        books_we_like: parseCsvList(parsed.data.books_we_like),
        avatar_url: parsed.data.avatar_url || null,
      },
      appearance
    );

    const photoFile = formData.get("profile_photo_file");
    if (photoFile instanceof File && photoFile.size > 0) {
      const photoPath = await uploadProfilePhoto({ profileId: parsedParams.data.id, file: photoFile });
      const photoPrimary = await supabase
        .from("profiles_kid")
        .update({ profile_photo_url: photoPath })
        .eq("id", parsedParams.data.id)
        .eq("universe_id", membership.universe_id);
      const photoError =
        photoPrimary.error &&
        isMissingColumnError(photoPrimary.error.message, "profiles_kid", "profile_photo_url")
        ? (
            await supabase
              .from("profiles_kid")
              .update({ avatar_url: existingKid?.avatar_url ?? null })
              .eq("id", parsedParams.data.id)
              .eq("universe_id", membership.universe_id)
          ).error
        : photoPrimary.error;
      if (photoError) throw new Error(photoError.message);
    } else if (removePhoto) {
      const removePrimary = await supabase
        .from("profiles_kid")
        .update({ profile_photo_url: null, avatar_url: null })
        .eq("id", parsedParams.data.id)
        .eq("universe_id", membership.universe_id);
      const removeError =
        removePrimary.error &&
        isMissingColumnError(removePrimary.error.message, "profiles_kid", "profile_photo_url")
        ? (
            await supabase
              .from("profiles_kid")
              .update({ avatar_url: null })
              .eq("id", parsedParams.data.id)
              .eq("universe_id", membership.universe_id)
          ).error
        : removePrimary.error;
      if (removeError) throw new Error(removeError.message);
    }
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
      avatar_url: existingAdult?.avatar_url ?? "",
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid adult profile data");
    }

    await updateWithAppearanceCompat(
      supabase,
      "profiles_adult",
      parsedParams.data.id,
      membership.universe_id,
      {
        display_name: parsed.data.name,
        persona_label: parsed.data.persona_label || null,
        avatar_url: parsed.data.avatar_url || null,
      },
      appearance
    );

    const photoFile = formData.get("profile_photo_file");
    if (photoFile instanceof File && photoFile.size > 0) {
      const photoPath = await uploadProfilePhoto({ profileId: parsedParams.data.id, file: photoFile });
      const photoPrimary = await supabase
        .from("profiles_adult")
        .update({ profile_photo_url: photoPath })
        .eq("id", parsedParams.data.id)
        .eq("universe_id", membership.universe_id);
      const photoError =
        photoPrimary.error &&
        isMissingColumnError(photoPrimary.error.message, "profiles_adult", "profile_photo_url")
        ? (
            await supabase
              .from("profiles_adult")
              .update({ avatar_url: existingAdult?.avatar_url ?? null })
              .eq("id", parsedParams.data.id)
              .eq("universe_id", membership.universe_id)
          ).error
        : photoPrimary.error;
      if (photoError) throw new Error(photoError.message);
    } else if (removePhoto) {
      const removePrimary = await supabase
        .from("profiles_adult")
        .update({ profile_photo_url: null, avatar_url: null })
        .eq("id", parsedParams.data.id)
        .eq("universe_id", membership.universe_id);
      const removeError =
        removePrimary.error &&
        isMissingColumnError(removePrimary.error.message, "profiles_adult", "profile_photo_url")
        ? (
            await supabase
              .from("profiles_adult")
              .update({ avatar_url: null })
              .eq("id", parsedParams.data.id)
              .eq("universe_id", membership.universe_id)
          ).error
        : removePrimary.error;
      if (removeError) throw new Error(removeError.message);
    }
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
    const kidPrimary = await supabase
      .from("profiles_kid")
      .select("id, display_name, age, themes, books_we_like, avatar_url, profile_photo_url, profile_appearance_json, profile_attributes_json")
      .eq("id", parsedParams.data.id)
      .eq("universe_id", membership.universe_id)
      .maybeSingle();
    const kidFallback =
      kidPrimary.error &&
      isMissingColumnError(kidPrimary.error.message, "profiles_kid", "profile_photo_url")
      ? await supabase
          .from("profiles_kid")
          .select("id, display_name, age, themes, books_we_like, avatar_url, profile_attributes_json")
          .eq("id", parsedParams.data.id)
          .eq("universe_id", membership.universe_id)
          .maybeSingle()
      : null;
    const kidFallbackMinimal =
      (kidPrimary.error &&
        (isMissingColumnError(kidPrimary.error.message, "profiles_kid", "profile_attributes_json") ||
          isMissingColumnError(kidPrimary.error.message, "profiles_kid", "profile_appearance_json"))) ||
      (kidFallback?.error &&
        isMissingColumnError(kidFallback.error.message, "profiles_kid", "profile_attributes_json"))
        ? await supabase
            .from("profiles_kid")
            .select("id, display_name, age, themes, books_we_like, avatar_url")
            .eq("id", parsedParams.data.id)
            .eq("universe_id", membership.universe_id)
            .maybeSingle()
        : null;
    const kid = kidFallbackMinimal
      ? (kidFallbackMinimal.data
          ? {
              ...kidFallbackMinimal.data,
              profile_photo_url: null,
              profile_appearance_json: null,
              profile_attributes_json: null,
            }
          : null)
      : kidFallback
        ? (kidFallback.data
            ? { ...kidFallback.data, profile_photo_url: null, profile_appearance_json: null }
            : null)
        : kidPrimary.data;
    const error = kidFallbackMinimal ? kidFallbackMinimal.error : kidFallback ? kidFallback.error : kidPrimary.error;
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
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Profile details</p>
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-medium text-neutral-700">
                    Name
                    <input
                      name="name"
                      defaultValue={kid.display_name}
                      className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                      required
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-700">
                    Age
                    <input
                      name="age"
                      defaultValue={kid.age ?? ""}
                      className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                      placeholder="Age"
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-700">
                    Favourite things
                    <input
                      name="themes"
                      defaultValue={kid.themes?.join(", ") ?? ""}
                      className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                      placeholder="Favourite things"
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-700">
                    Books we like
                    <input
                      name="books_we_like"
                      defaultValue={kid.books_we_like?.join(", ") ?? ""}
                      className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                      placeholder="Books we like"
                    />
                  </label>
                </div>
              </div>
              <AppearanceFields
                fileInputName="profile_photo_file"
                initialAppearance={normalizeProfileAppearance(kid.profile_appearance_json ?? kid.profile_attributes_json ?? {})}
                existingPhotoUrl={
                  kid.profile_photo_url
                    ? `/api/profiles/photo/kid/${kid.id}`
                    : kid.avatar_url ?? null
                }
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

  const adultPrimary = await supabase
    .from("profiles_adult")
    .select("id, display_name, persona_label, avatar_url, profile_photo_url, profile_appearance_json, profile_attributes_json")
    .eq("id", parsedParams.data.id)
    .eq("universe_id", membership.universe_id)
    .maybeSingle();
  const adultFallback =
    adultPrimary.error &&
    isMissingColumnError(adultPrimary.error.message, "profiles_adult", "profile_photo_url")
    ? await supabase
        .from("profiles_adult")
        .select("id, display_name, persona_label, avatar_url, profile_attributes_json")
        .eq("id", parsedParams.data.id)
        .eq("universe_id", membership.universe_id)
        .maybeSingle()
    : null;
  const adultFallbackMinimal =
    (adultPrimary.error &&
      (isMissingColumnError(adultPrimary.error.message, "profiles_adult", "profile_attributes_json") ||
        isMissingColumnError(adultPrimary.error.message, "profiles_adult", "profile_appearance_json"))) ||
    (adultFallback?.error &&
      isMissingColumnError(adultFallback.error.message, "profiles_adult", "profile_attributes_json"))
      ? await supabase
          .from("profiles_adult")
          .select("id, display_name, persona_label, avatar_url")
          .eq("id", parsedParams.data.id)
          .eq("universe_id", membership.universe_id)
          .maybeSingle()
      : null;
  const adult = adultFallbackMinimal
    ? (adultFallbackMinimal.data
        ? {
            ...adultFallbackMinimal.data,
            profile_photo_url: null,
            profile_appearance_json: null,
            profile_attributes_json: null,
          }
        : null)
    : adultFallback
      ? (adultFallback.data ? { ...adultFallback.data, profile_photo_url: null, profile_appearance_json: null } : null)
      : adultPrimary.data;
  const error = adultFallbackMinimal
    ? adultFallbackMinimal.error
    : adultFallback
      ? adultFallback.error
      : adultPrimary.error;
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
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Profile details</p>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-medium text-neutral-700">
                  Name
                  <input
                    name="name"
                    defaultValue={adult.display_name}
                    className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                    required
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-700">
                  Role label
                  <input
                    name="persona_label"
                    defaultValue={adult.persona_label ?? ""}
                    className="mt-1 w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                    placeholder='Role label (e.g. "Inventor")'
                  />
                </label>
              </div>
            </div>
            <AppearanceFields
              fileInputName="profile_photo_file"
              initialAppearance={normalizeProfileAppearance(adult.profile_appearance_json ?? adult.profile_attributes_json ?? {})}
              existingPhotoUrl={
                adult.profile_photo_url
                  ? `/api/profiles/photo/adult/${adult.id}`
                  : adult.avatar_url ?? null
              }
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
