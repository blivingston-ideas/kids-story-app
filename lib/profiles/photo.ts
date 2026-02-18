import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PROFILE_PHOTOS_BUCKET = "profile-photos";

export async function uploadProfilePhoto(params: { profileId: string; file: File }): Promise<string> {
  const { file, profileId } = params;
  if (!file.type.startsWith("image/")) {
    throw new Error("Profile photo must be an image.");
  }
  if (file.size > 5_000_000) {
    throw new Error("Profile photo must be 5MB or smaller.");
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `profiles/${profileId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(PROFILE_PHOTOS_BUCKET).upload(storagePath, bytes, {
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw new Error(error.message);

  return storagePath;
}

export async function createProfilePhotoSignedUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

