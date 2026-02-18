import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  normalizeProfileAppearance,
  type ProfileAppearance,
} from "@/lib/schemas/profileAppearance";

type ProfileKind = "kid" | "adult";

export type ProfileVisualSpec = {
  profileId: string;
  profileKind: ProfileKind;
  photoPath: string | null;
  appearance: ProfileAppearance;
};

function inferFromPhotoPlaceholder(photoPath: string | null): Partial<ProfileAppearance> {
  if (!photoPath) return {};
  // TODO: add photo-to-attributes extraction and merge those values here.
  return {};
}

function mergeAppearance(
  inferred: Partial<ProfileAppearance>,
  explicit: ProfileAppearance
): ProfileAppearance {
  return {
    ...explicit,
    ...inferred,
    ...explicit,
  };
}

export async function getProfileVisualSpec(
  profileId: string,
  kindHint?: ProfileKind
): Promise<ProfileVisualSpec> {
  const admin = createSupabaseAdminClient();

  const tryKid = async () =>
    admin
      .from("profiles_kid")
      .select("id, profile_photo_url, profile_appearance_json, profile_attributes_json")
      .eq("id", profileId)
      .maybeSingle();
  const tryAdult = async () =>
    admin
      .from("profiles_adult")
      .select("id, profile_photo_url, profile_appearance_json, profile_attributes_json")
      .eq("id", profileId)
      .maybeSingle();

  const checks: Array<{ kind: ProfileKind; run: () => ReturnType<typeof tryKid> }> =
    kindHint === "kid"
      ? [
          { kind: "kid", run: tryKid },
          { kind: "adult", run: tryAdult },
        ]
      : kindHint === "adult"
      ? [
          { kind: "adult", run: tryAdult },
          { kind: "kid", run: tryKid },
        ]
      : [
          { kind: "kid", run: tryKid },
          { kind: "adult", run: tryAdult },
        ];

  for (const check of checks) {
    const { data, error } = await check.run();
    if (error) throw new Error(error.message);
    if (!data) continue;

    const explicitRaw =
      (data.profile_appearance_json as Record<string, unknown> | null) ??
      (data.profile_attributes_json as Record<string, unknown> | null) ??
      {};
    const explicit = normalizeProfileAppearance(explicitRaw);
    const inferred = inferFromPhotoPlaceholder(data.profile_photo_url ?? null);

    return {
      profileId: data.id,
      profileKind: check.kind,
      photoPath: data.profile_photo_url ?? null,
      appearance: mergeAppearance(inferred, explicit),
    };
  }

  throw new Error("Profile not found.");
}
