import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paramId } = await context.params;
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let storyId = String(paramId ?? "").trim();
    if (!storyId) {
      const body = (await request.json().catch(() => null)) as { id?: string } | null;
      storyId = String(body?.id ?? "").trim();
    }

    if (!storyId || !isUuid(storyId)) {
      return NextResponse.json({ ok: false, error: "Invalid story id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("stories")
      .delete()
      .eq("id", storyId)
      .eq("created_by", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Story not found or not owned by user" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
