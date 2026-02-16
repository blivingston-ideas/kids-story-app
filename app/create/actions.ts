"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUniverseContext } from "@/lib/data/auth-context";
import {
  generatedStorySchema,
  parseCharacterRefs,
  parseLengthMinutes,
  wizardInputSchema,
  type WizardInput,
} from "@/lib/validation/stories";

export type GenerateState = {
  ok: boolean;
  error: string | null;
  generatedTitle: string;
  generatedContent: string;
};

const defaultGenerateState: GenerateState = {
  ok: false,
  error: null,
  generatedTitle: "",
  generatedContent: "",
};

function buildPrompt(input: WizardInput): { promptText: string; promptJson: Record<string, unknown> } {
  const selectedCharacters = parseCharacterRefs(input.selectedCharactersJson);
  const lengthMinutes = parseLengthMinutes(input);

  const promptJson = {
    mode: input.mode,
    tone: input.tone,
    length_minutes: lengthMinutes,
    guided: input.mode === "guided"
      ? {
          beginning: input.guidedBeginning,
          middle: input.guidedMiddle,
          ending: input.guidedEnding,
        }
      : null,
    selected_characters: selectedCharacters,
    custom_character_name: input.customCharacterName || null,
  };

  const characterLabels = selectedCharacters.map((c) => c.label);
  const cast = [...characterLabels, ...(input.customCharacterName ? [input.customCharacterName] : [])];
  const castText = cast.length ? cast.join(", ") : "a brave family hero";

  const promptText = [
    "Write a short bedtime story for a family.",
    `Tone: ${input.tone}.`,
    `Length target: about ${lengthMinutes} minutes read-aloud.`,
    `Characters: ${castText}.`,
    input.mode === "guided"
      ? `Beats: beginning="${input.guidedBeginning}", middle="${input.guidedMiddle}", ending="${input.guidedEnding}".`
      : "Mode: surprise adventure.",
    "Return JSON with keys: title, content.",
  ].join(" ");

  return { promptText, promptJson };
}

function deterministicPlaceholder(input: WizardInput): { title: string; content: string } {
  const selectedCharacters = parseCharacterRefs(input.selectedCharactersJson);
  const lengthMinutes = parseLengthMinutes(input);
  const names = selectedCharacters.map((c) => c.label);
  const allNames = [...names, ...(input.customCharacterName ? [input.customCharacterName] : [])];
  const heroText = allNames.length > 0 ? allNames.join(", ") : "a curious young explorer";

  const titleByTone: Record<WizardInput["tone"], string> = {
    calm: "The Gentle Lantern Path",
    silly: "The Giggle Compass Adventure",
    adventurous: "The Star Map Expedition",
  };

  const guidedLine =
    input.mode === "guided"
      ? `Beginning: ${input.guidedBeginning}. Middle: ${input.guidedMiddle}. Ending: ${input.guidedEnding}.`
      : "A new mystery appears just after bedtime.";

  const content = [
    `Tonight, ${heroText} stepped into Story Universe for a ${input.tone} adventure.`,
    guidedLine,
    `They followed clues, helped one another, and found the kind of courage that glows quietly in the dark.`,
    `After about ${lengthMinutes} minutes of wonder, everyone returned home with warm hearts and sleepy smiles.`,
  ].join("\n\n");

  return {
    title: titleByTone[input.tone],
    content,
  };
}

async function generateWithAi(promptText: string): Promise<{ title: string; content: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.8,
        messages: [
          {
            role: "system",
            content: "You are a children's bedtime story writer. Return only valid JSON with {\"title\":\"...\",\"content\":\"...\"}.",
          },
          { role: "user", content: promptText },
        ],
      }),
    });

    if (!response.ok) return null;
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsedJson = JSON.parse(raw) as unknown;
    const parsed = generatedStorySchema.safeParse(parsedJson);
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function getField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function parseWizardInput(formData: FormData): WizardInput {
  const parsed = wizardInputSchema.safeParse({
    mode: getField(formData, "mode"),
    guidedBeginning: getField(formData, "guidedBeginning"),
    guidedMiddle: getField(formData, "guidedMiddle"),
    guidedEnding: getField(formData, "guidedEnding"),
    tone: getField(formData, "tone"),
    lengthChoice: getField(formData, "lengthChoice"),
    customMinutes: getField(formData, "customMinutes"),
    selectedCharactersJson: getField(formData, "selectedCharactersJson"),
    customCharacterName: getField(formData, "customCharacterName"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid story input.");
  }
  return parsed.data;
}

export async function generateStoryAction(
  _prevState: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  try {
    const { user, membership } = await getCurrentUniverseContext();
    if (!user) return { ...defaultGenerateState, error: "Please sign in again." };
    if (!membership) return { ...defaultGenerateState, error: "No active universe membership found." };

    const input = parseWizardInput(formData);
    const { promptText } = buildPrompt(input);

    const aiStory = await generateWithAi(promptText);
    const fallbackStory = deterministicPlaceholder(input);
    const story = aiStory ?? fallbackStory;

    return {
      ok: true,
      error: null,
      generatedTitle: story.title,
      generatedContent: story.content,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate story.";
    return { ...defaultGenerateState, error: message };
  }
}

export async function saveStoryAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { user, membership } = await getCurrentUniverseContext();

  if (!user) redirect("/login");
  if (!membership) redirect("/onboarding/create");

  const input = parseWizardInput(formData);
  const selectedCharacters = parseCharacterRefs(input.selectedCharactersJson);
  const lengthMinutes = parseLengthMinutes(input);
  const { promptJson } = buildPrompt(input);

  const generated = generatedStorySchema.safeParse({
    title: getField(formData, "generatedTitle"),
    content: getField(formData, "generatedContent"),
  });

  if (!generated.success) {
    throw new Error(generated.error.issues[0]?.message ?? "Generate the story before saving.");
  }

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .insert({
      universe_id: membership.universe_id,
      created_by: user.id,
      title: generated.data.title,
      tone: input.tone,
      length_minutes: lengthMinutes,
      prompt: promptJson,
      content: generated.data.content,
    })
    .select("id")
    .single();

  if (storyError) throw new Error(storyError.message);

  type StoryCharacterInsert = {
    story_id: string;
    character_type: "kid" | "adult" | "custom";
    character_id: string | null;
    custom_name: string | null;
  };

  const characterRows: StoryCharacterInsert[] = selectedCharacters.map((c) => ({
    story_id: story.id,
    character_type: c.type,
    character_id: c.id,
    custom_name: null,
  }));

  if (input.customCharacterName) {
    characterRows.push({
      story_id: story.id,
      character_type: "custom",
      character_id: null,
      custom_name: input.customCharacterName,
    });
  }

  if (characterRows.length > 0) {
    const { error: characterError } = await supabase.from("story_characters").insert(characterRows);
    if (characterError) throw new Error(characterError.message);
  }

  redirect(`/story/${story.id}`);
}
