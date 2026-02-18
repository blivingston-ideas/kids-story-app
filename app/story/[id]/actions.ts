"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";

const storyIdSchema = z.string().uuid("Invalid story id");
const imageModeSchema = z.enum(["fast", "best"]);

export async function createShareAction(storyId: string): Promise<void> {
  const parsedId = storyIdSchema.safeParse(storyId);
  if (!parsedId.success) throw new Error(parsedId.error.issues[0]?.message ?? "Invalid story id");

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) throw new Error("Authentication required.");
  if (!membership) throw new Error("No active membership.");

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, universe_id")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (storyError) throw new Error(storyError.message);
  if (!story || story.universe_id !== membership.universe_id) {
    throw new Error("Story not found.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("story_shares")
    .select("id, revoked_at")
    .eq("story_id", story.id)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const { error: updateError } = await supabase
      .from("story_shares")
      .update({ revoked_at: null })
      .eq("id", existing.id);
    if (updateError) throw new Error(updateError.message);
  } else {
    const shareToken = crypto.randomUUID().replaceAll("-", "");
    const { error: insertError } = await supabase.from("story_shares").insert({
      story_id: story.id,
      share_token: shareToken,
      created_by: user.id,
      revoked_at: null,
    });
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath(`/story/${story.id}`);
}

export async function revokeShareAction(storyId: string): Promise<void> {
  const parsedId = storyIdSchema.safeParse(storyId);
  if (!parsedId.success) throw new Error(parsedId.error.issues[0]?.message ?? "Invalid story id");

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) throw new Error("Authentication required.");
  if (!membership) throw new Error("No active membership.");

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, universe_id")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (storyError) throw new Error(storyError.message);
  if (!story || story.universe_id !== membership.universe_id) {
    throw new Error("Story not found.");
  }

  const { error } = await supabase
    .from("story_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("story_id", story.id)
    .is("revoked_at", null);

  if (error) throw new Error(error.message);

  revalidatePath(`/story/${story.id}`);
}

export async function updateStoryImageModeAction(storyId: string, formData: FormData): Promise<void> {
  const parsedId = storyIdSchema.safeParse(storyId);
  if (!parsedId.success) throw new Error(parsedId.error.issues[0]?.message ?? "Invalid story id");

  const parsedMode = imageModeSchema.safeParse(String(formData.get("image_mode") ?? ""));
  if (!parsedMode.success) throw new Error(parsedMode.error.issues[0]?.message ?? "Invalid image mode");

  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();
  if (!user) throw new Error("Authentication required.");
  if (!membership) throw new Error("No active membership.");

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, universe_id")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (storyError) throw new Error(storyError.message);
  if (!story || story.universe_id !== membership.universe_id) throw new Error("Story not found.");

  const { error: updateError } = await supabase
    .from("stories")
    .update({ image_mode: parsedMode.data })
    .eq("id", story.id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/story/${story.id}`);
}
