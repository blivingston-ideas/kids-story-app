import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { regenerateStoryPage } from "@/lib/story/illustration-jobs";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid story id"),
  pageIndex: z.coerce.number().int().min(0),
});

async function assertStoryAccess(storyId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Unauthorized");

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, universe_id")
    .eq("id", storyId)
    .maybeSingle();
  if (storyError) throw new Error(storyError.message);
  if (!story) throw new Error("Story not found");

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id")
    .eq("universe_id", story.universe_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membership) throw new Error("Forbidden");
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; pageIndex: string }> }
) {
  try {
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    await assertStoryAccess(parsed.data.id);
    await regenerateStoryPage(parsed.data.id, parsed.data.pageIndex);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to regenerate illustration.";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
