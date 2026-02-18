import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIllustrationPublicUrl } from "@/lib/story/illustrations";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid story id"),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, universe_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (storyError) return NextResponse.json({ ok: false, error: storyError.message }, { status: 500 });
  if (!story) return NextResponse.json({ ok: false, error: "Story not found" }, { status: 404 });

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id")
    .eq("universe_id", story.universe_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) {
    return NextResponse.json({ ok: false, error: membershipError.message }, { status: 500 });
  }
  if (!membership) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const primary = await supabase
    .from("story_pages")
    .select("page_index, text, image_status, image_url, image_path, image_error")
    .eq("story_id", parsed.data.id)
    .order("page_index", { ascending: true });
  const fallback =
    primary.error?.message.includes("column story_pages.image_url does not exist")
      ? await supabase
          .from("story_pages")
          .select("page_index, text, image_status, image_path, image_error")
          .eq("story_id", parsed.data.id)
          .order("page_index", { ascending: true })
      : null;

  const error = fallback ? fallback.error : primary.error;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const pages = fallback
    ? (fallback.data ?? []).map((page) => ({ ...page, image_url: null }))
    : primary.data;

  const normalized = (pages ?? []).map((page) => ({
    pageIndex: page.page_index,
    text: page.text,
    imageStatus: page.image_status as "pending" | "not_started" | "generating" | "ready" | "failed",
    imageUrl: page.image_url ?? (page.image_path ? getIllustrationPublicUrl(page.image_path) : null),
    imageError: page.image_error,
  }));

  return NextResponse.json({ ok: true, pages: normalized }, { status: 200 });
}
