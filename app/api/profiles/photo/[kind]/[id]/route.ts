import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createProfilePhotoSignedUrl } from "@/lib/profiles/photo";

const paramsSchema = z.object({
  kind: z.enum(["kid", "adult"]),
  id: z.string().uuid("Invalid profile id"),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ kind: string; id: string }> }
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

  const table = parsed.data.kind === "kid" ? "profiles_kid" : "profiles_adult";
  const { data: profile, error: profileError } = await supabase
    .from(table)
    .select("universe_id, profile_photo_url")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }
  if (!profile?.profile_photo_url) {
    return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });
  }

  const { data: membership, error: memberError } = await supabase
    .from("memberships")
    .select("id")
    .eq("universe_id", profile.universe_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError) {
    return NextResponse.json({ ok: false, error: memberError.message }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const signedUrl = await createProfilePhotoSignedUrl(profile.profile_photo_url, 300);
  return NextResponse.redirect(signedUrl);
}

