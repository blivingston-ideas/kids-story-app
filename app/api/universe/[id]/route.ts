import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid universe id"),
});

const bodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Universe name must be at least 2 characters.")
    .max(60, "Universe name must be 60 characters or fewer."),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { ok: false, error: parsedParams.error.issues[0]?.message ?? "Invalid universe id." },
        { status: 400 }
      );
    }

    const parsedBody = bodySchema.safeParse((await request.json().catch(() => null)) as unknown);
    if (!parsedBody.success) {
      return NextResponse.json(
        { ok: false, error: parsedBody.error.issues[0]?.message ?? "Invalid payload." },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: universe, error: universeError } = await supabase
      .from("universes")
      .select("id, created_by")
      .eq("id", parsedParams.data.id)
      .maybeSingle();
    if (universeError) {
      return NextResponse.json({ ok: false, error: universeError.message }, { status: 500 });
    }
    if (!universe) {
      return NextResponse.json({ ok: false, error: "Universe not found." }, { status: 404 });
    }
    if (universe.created_by !== user.id) {
      return NextResponse.json(
        { ok: false, error: "Only the universe creator can edit universe details." },
        { status: 403 }
      );
    }

    const { error: updateError } = await supabase
      .from("universes")
      .update({ name: parsedBody.data.name })
      .eq("id", parsedParams.data.id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    revalidatePath("/");
    revalidatePath("/library");
    revalidatePath("/profiles");
    revalidatePath("/onboarding");
    revalidatePath("/universe");

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
