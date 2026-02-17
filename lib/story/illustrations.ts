import { z } from "zod";
import { llm } from "@/lib/llm/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const storySparkSchema = z.enum([
  "adventure",
  "mystery",
  "brave",
  "friendship",
  "silly",
  "discovery",
  "helper",
  "magic",
]);

export type StorySpark = z.infer<typeof storySparkSchema>;

const imageBriefSchema = z.object({
  characters: z.array(z.object({ name: z.string().trim().min(1), visual_traits: z.string().trim().min(1) })).max(4),
  setting: z.string().trim().min(1),
  main_action: z.string().trim().min(1),
  mood: z.string().trim().min(1),
  composition: z.string().trim().min(1),
});

export type CharacterStyleNote = {
  name: string;
  notes: string;
};

export type GeneratePageIllustrationInput = {
  storyId: string;
  pageIndex: number;
  pageText: string;
  spark?: StorySpark;
  characterNotes: CharacterStyleNote[];
  styleBible?: string;
};

export type GeneratePageIllustrationResult = {
  imagePath: string;
  imagePrompt: string;
};

function stripCodeFences(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseJsonObject(raw: string): unknown {
  const cleaned = stripCodeFences(raw);
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No JSON object found in image brief output.");
  }
  return JSON.parse(cleaned.slice(first, last + 1)) as unknown;
}

async function buildImageBrief(input: GeneratePageIllustrationInput): Promise<z.infer<typeof imageBriefSchema>> {
  const schemaDescription = [
    "{",
    '  "characters": [{"name": "string", "visual_traits": "string"}],',
    '  "setting": "string",',
    '  "main_action": "string",',
    '  "mood": "string",',
    '  "composition": "string"',
    "}",
  ].join("\n");

  const sparkLine = input.spark ? `Story Spark: ${input.spark}` : "Story Spark: none specified";
  const notes = input.characterNotes
    .map((c) => `${c.name}: ${c.notes}`)
    .join("\n");

  const raw = await llm.generate({
    system: "You extract visual briefs for children's story illustrations. Output strict JSON only.",
    messages: [
      {
        role: "user",
        content: [
          "Create IMAGE_BRIEF JSON from this page text.",
          "Rules:",
          "- No invented plot elements not present in page text.",
          "- Keep kid-friendly.",
          "- Do not include any text to be rendered in image.",
          "- Compact and concrete.",
          sparkLine,
          notes ? `Character style notes:\n${notes}` : "Character style notes: none",
          "Output ONLY JSON with this schema:",
          schemaDescription,
          "",
          "Page text:",
          input.pageText,
        ].join("\n"),
      },
    ],
    model: "gpt-4.1-mini",
    temperature: 0.4,
    presence_penalty: 0.3,
    frequency_penalty: 0.3,
    max_tokens: 500,
  });

  const parsed = imageBriefSchema.safeParse(parseJsonObject(raw));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
  }
  return parsed.data;
}

function buildFinalImagePrompt(
  brief: z.infer<typeof imageBriefSchema>,
  characterNotes: CharacterStyleNote[],
  styleBible?: string
): string {
  const characterNoteLine = characterNotes.length
    ? characterNotes.map((c) => `${c.name}: ${c.notes}`).join("; ")
    : "No special character notes";

  return [
    "children's picture book illustration, clean shapes, soft shading",
    "Toy Box Adventure palette: #FF9F1C, #2EC4B6, #FFBF69, #CBF3F0, #293241",
    "no words, no letters, no captions in the image",
    "no text, no watermark, no logo, no caption",
    styleBible ? `Style bible: ${styleBible}` : "",
    `Setting: ${brief.setting}`,
    `Action: ${brief.main_action}`,
    `Mood: ${brief.mood}`,
    `Composition: ${brief.composition}`,
    `Characters: ${brief.characters.map((c) => `${c.name} (${c.visual_traits})`).join(", ") || "none"}`,
    `Character consistency notes: ${characterNoteLine}`,
  ]
    .filter(Boolean)
    .join(". ");
}

function toPublicImagePath(storyId: string, pageIndex: number): string {
  return `${storyId}/page-${pageIndex}.png`;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

export function getIllustrationPublicUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return "";
  return `${baseUrl}/storage/v1/object/public/story-illustrations/${path}`;
}

export async function generatePageIllustration(
  input: GeneratePageIllustrationInput
): Promise<GeneratePageIllustrationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const brief = await buildImageBrief(input);
  const imagePrompt = buildFinalImagePrompt(brief, input.characterNotes, input.styleBible);

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      size: "1536x1024",
      prompt: imagePrompt,
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Image generation failed: ${response.status} ${txt}`);
  }

  const payload = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("Image model returned no base64 image data.");
  }

  const bytes = decodeBase64ToBytes(b64);
  const imagePath = toPublicImagePath(input.storyId, input.pageIndex);
  const admin = createSupabaseAdminClient();
  const upload = await admin.storage.from("story-illustrations").upload(imagePath, bytes, {
    upsert: true,
    contentType: "image/png",
  });

  if (upload.error) {
    throw new Error(upload.error.message);
  }

  return { imagePath, imagePrompt };
}
