import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { llm } from "@/lib/llm/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  storySpark: z
    .enum(["adventure", "mystery", "brave", "friendship", "silly", "discovery", "helper", "magic"])
    .optional(),
  universeId: z.string().uuid().optional(),
  kidProfileIds: z.array(z.string().uuid()).optional().default([]),
  selectedCharacterNames: z.array(z.string().trim().min(1).max(120)).optional().default([]),
});

const fallbackBySpark: Record<string, string[]> = {
  adventure: [
    "A family follows an old map into hidden trails where each clue unlocks a new challenge and a brave choice.",
    "Just before bedtime, a tiny compass lights up and leads everyone on a gentle quest across Story Universe.",
  ],
  mystery: [
    "A strange note appears under the door, and the family must follow clues to solve who left it and why.",
    "One familiar object vanishes, and small clues around the house reveal a surprising, kind-hearted secret.",
  ],
  brave: [
    "Someone feels nervous about trying something new, but one small step begins a night of courage and growth.",
    "When a quiet fear shows up, the family works together to face it and discover newfound confidence.",
  ],
  friendship: [
    "Two friends misunderstand each other during playtime, then learn how honesty and kindness can bring them back together.",
    "A small disagreement grows, but a heartfelt moment helps everyone reconnect before bedtime.",
  ],
  silly: [
    "A giggle-filled mix-up turns normal bedtime into a parade of funny surprises, each sillier than the last.",
    "A bouncing hat starts causing harmless chaos, and the family must outsmart it with playful teamwork.",
  ],
  discovery: [
    "A curious question leads the family into a hidden corner of their world where they discover something wonderful.",
    "Following tiny signs in nature, everyone uncovers a secret place that sparks wonder and learning.",
  ],
  helper: [
    "A neighbor needs help with a tricky problem, and the family tries creative ideas until one finally works.",
    "Someone is stuck, and after a few failed attempts, the kids find a kind and clever way to help.",
  ],
  magic: [
    "A magical object appears with one important rule, and the family learns what happens when that rule is tested.",
    "A wish works in an unexpected way, and everyone must use heart and teamwork to make things right.",
  ],
};

function pickFallback(spark?: string, topics: string[] = []): string {
  const key = spark ?? "adventure";
  const options = fallbackBySpark[key] ?? fallbackBySpark.adventure;
  const idx = Math.floor(Date.now() / 1000) % options.length;
  const topicHint = topics.length > 0 ? ` Favorite topics: ${topics.slice(0, 4).join(", ")}.` : "";
  return (
    (options[idx] ?? options[0] ?? "A cozy family adventure begins at bedtime with a small mystery to solve together.") +
    topicHint
  );
}

function ensureIncludesSelectedCharacters(blurb: string, selectedCharacterNames: string[]): string {
  if (selectedCharacterNames.length === 0) return blurb.trim();

  const missing = selectedCharacterNames.filter((name) => {
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return !pattern.test(blurb);
  });
  if (missing.length === 0) return blurb.trim();

  const suffix =
    missing.length === 1
      ? ` ${missing[0]} joins the adventure too.`
      : ` ${missing.join(", ")} join the adventure too.`;
  return `${blurb.trim()}${suffix}`.trim();
}

export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json().catch(() => ({}))) as unknown;
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    const spark = parsed.data.storySpark;
    const selectedCharacterNames = [...new Set(parsed.data.selectedCharacterNames.map((n) => n.trim()).filter(Boolean))];
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let topicHints: string[] = [];
    if (parsed.data.universeId && parsed.data.kidProfileIds.length > 0) {
      const { data: membership, error: membershipError } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("universe_id", parsed.data.universeId)
        .maybeSingle();
      if (membershipError) {
        return NextResponse.json({ ok: false, error: membershipError.message }, { status: 500 });
      }
      if (!membership) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }

      const { data: kids, error: kidError } = await supabase
        .from("profiles_kid")
        .select("themes, books_we_like")
        .eq("universe_id", parsed.data.universeId)
        .in("id", parsed.data.kidProfileIds);
      if (kidError) {
        return NextResponse.json({ ok: false, error: kidError.message }, { status: 500 });
      }

      const topicSet = new Set<string>();
      for (const kid of kids ?? []) {
        for (const value of [...(kid.themes ?? []), ...(kid.books_we_like ?? [])]) {
          const topic = value.trim();
          if (topic) topicSet.add(topic);
        }
      }
      topicHints = [...topicSet].slice(0, 8);
    }

    const system =
      'You are an expert at writing kids stories. You are asked to come up with a quick plot idea for a story. If there is a story spark selected, take that into account. This should be no more than a few sentences, and it can be used to set the stage for the story and its plot';

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        ok: true,
        blurb: ensureIncludesSelectedCharacters(pickFallback(spark, topicHints), selectedCharacterNames),
        source: "fallback",
      });
    }

    const userPrompt = [
      spark ? `Story spark selected: ${spark}.` : "No story spark selected.",
      selectedCharacterNames.length > 0
        ? `Selected characters that MUST appear by name in the blurb: ${selectedCharacterNames.join(", ")}.`
        : "No specific selected characters were provided.",
      topicHints.length > 0
        ? `Kid favorite topics to weave in naturally: ${topicHints.join(", ")}.`
        : "No kid favorite topics were provided.",
      "Return only the quick stage blurb text (2-4 sentences).",
      "You may add extra supporting characters, but always include every selected character by name.",
    ].join(" ");

    const generated = await llm.generate({
      system,
      messages: [{ role: "user", content: userPrompt }],
      model: "gpt-4.1-mini",
      temperature: 0.9,
      presence_penalty: 0.7,
      frequency_penalty: 0.7,
      max_tokens: 180,
    });

    return NextResponse.json({
      ok: true,
      blurb: ensureIncludesSelectedCharacters(generated.trim(), selectedCharacterNames),
      source: "llm",
    });
  } catch {
    return NextResponse.json({ ok: true, blurb: pickFallback(), source: "fallback" });
  }
}
