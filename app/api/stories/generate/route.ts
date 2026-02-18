import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateStoryInputSchema,
  type GenerateStoryInput,
} from "@/lib/storygen/schemas";
import { runStoryPipeline } from "@/lib/storygen/pipeline";
import type { CostRow } from "@/lib/openai/callWithCost";

type KidRow = {
  id: string;
  display_name: string;
  age: number | null;
  themes: string[] | null;
  books_we_like: string[] | null;
};

type AdultRow = {
  id: string;
  display_name: string;
  persona_label: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = (await request.json().catch(() => null)) as unknown;
    const parsedBody = generateStoryInputSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { ok: false, error: parsedBody.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const input: GenerateStoryInput = parsedBody.data;

    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("id, universe_id")
      .eq("user_id", user.id)
      .eq("universe_id", input.universeId)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ ok: false, error: membershipError.message }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { data: universe, error: universeError } = await supabase
      .from("universes")
      .select("id, name")
      .eq("id", input.universeId)
      .maybeSingle();
    if (universeError) {
      return NextResponse.json({ ok: false, error: universeError.message }, { status: 500 });
    }
    if (!universe) {
      return NextResponse.json({ ok: false, error: "Universe not found" }, { status: 404 });
    }

    const { data: kids, error: kidsError } =
      input.kidProfileIds.length > 0
        ? await supabase
            .from("profiles_kid")
            .select("id, display_name, age, themes, books_we_like")
            .eq("universe_id", input.universeId)
            .in("id", input.kidProfileIds)
        : { data: [], error: null };

    if (kidsError) {
      return NextResponse.json({ ok: false, error: kidsError.message }, { status: 500 });
    }

    const { data: adults, error: adultsError } =
      input.adultProfileIds.length > 0
        ? await supabase
            .from("profiles_adult")
            .select("id, display_name, persona_label")
            .eq("universe_id", input.universeId)
            .in("id", input.adultProfileIds)
        : { data: [], error: null };

    if (adultsError) {
      return NextResponse.json({ ok: false, error: adultsError.message }, { status: 500 });
    }

    const deferredCosts: Array<Omit<CostRow, "story_id">> = [];
    const result = await runStoryPipeline(
      {
        ...input,
        storyBible: {
          universeName: universe.name,
          kids: (kids ?? []) as KidRow[],
          adults: (adults ?? []) as AdultRow[],
        },
      },
      async (
        step: string,
        payload: Record<string, unknown>,
        responsePayload: Record<string, unknown>
      ) => {
        const { error: logError } = await supabase.from("generation_logs").insert({
          universe_id: input.universeId,
          story_id: null,
          step,
          payload,
          response: responsePayload,
        });
        if (logError) {
          const missingTable =
            logError.message.includes("Could not find the table 'public.generation_logs'") ||
            logError.message.includes("relation \"generation_logs\" does not exist");
          if (!missingTable) {
            console.warn(`[generation_logs] ${logError.message}`);
          }
        }
      },
      {
        storyId: null,
        onCost: (row) => {
          deferredCosts.push(row);
        },
      }
    );

    return NextResponse.json(
      {
        ok: true,
        title: result.title,
        storyText: result.storyText,
        pages: result.pages,
        storyBible: result.storyBible,
        beatSheet: result.beatSheet,
        continuityLedger: result.continuityLedger,
        wordCount: result.wordCount,
        sceneCount: result.pages.length,
        warnings: result.warnings,
        generationCosts: deferredCosts,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
