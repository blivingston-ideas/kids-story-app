import { createHash } from "crypto";
import { llm } from "@/lib/llm/client";

export type StyleTone = "calm" | "silly" | "adventurous";

export type StylePreset = {
  key: "age2-4" | "age5-7" | "age8-10" | "age11-13" | "teen";
  label: string;
  base: string;
};

export function getStylePresetForAge(age: number): StylePreset {
  if (age <= 4) {
    return {
      key: "age2-4",
      label: "Age 2-4",
      base: "simple bright cartoon illustration, clean outlines, soft gradients, friendly proportions",
    };
  }
  if (age <= 7) {
    return {
      key: "age5-7",
      label: "Age 5-7",
      base: "storybook illustration, slightly more detail, watercolor/gouache feel",
    };
  }
  if (age <= 10) {
    return {
      key: "age8-10",
      label: "Age 8-10",
      base: "semi-realistic illustrated, more detailed environments, cinematic lighting but still friendly",
    };
  }
  if (age <= 13) {
    return {
      key: "age11-13",
      label: "Age 11-13",
      base: "more realistic / graphic novel / cinematic realism (still kid-appropriate), richer contrast",
    };
  }
  return {
    key: "teen",
    label: "Teen",
    base: "near-realistic / film still look, shallow depth of field, more mature composition",
  };
}

function toneModifier(tone: StyleTone): string {
  if (tone === "calm") return "soft cozy lighting, gentle contrast, bedtime-safe warmth";
  if (tone === "silly") return "playful exaggeration, cheerful color rhythm, lively but readable compositions";
  return "adventurous energy, dynamic framing, vivid but child-safe atmosphere";
}

function fallbackStyleBible(preset: StylePreset, tone: StyleTone): string {
  const lines = [
    `Rendering: ${preset.base}.`,
    "Line quality: clean, consistent linework with stable edge thickness.",
    "Shading: soft diffuse shading only, no harsh realism jumps.",
    "Texture: subtle paper-like texture; avoid noisy grain.",
    "Palette vibe: Toy Box Adventure palette anchored by warm orange, playful teal, sunny gold, soft cyan, and story navy.",
    `Lighting mood: ${toneModifier(tone)}.`,
    "Camera defaults: kid-friendly framing, readable wide/medium shots, clear subject separation.",
    "Character rendering: keep face shape, eye style, skin tone, and hair identity stable in every image.",
    "Environment rendering: cohesive world materials and brush behavior across all pages.",
    "Composition: balanced focal point, uncluttered foreground, storybook clarity.",
  ];
  return lines.join("\n");
}

export function buildStyleId(age: number, tone: StyleTone, styleBible: string): string {
  const preset = getStylePresetForAge(age);
  const hash = createHash("sha1").update(styleBible).digest("hex").slice(0, 8);
  return `${preset.key}-${tone}-v1-${hash}`;
}

export async function generateStoryStyleBible(input: {
  audienceAge: number;
  tone: StyleTone;
  universeName: string;
}): Promise<{ styleBible: string; styleId: string }> {
  const normalizedAge = Math.max(2, Math.min(18, Math.round(input.audienceAge)));
  const preset = getStylePresetForAge(normalizedAge);

  let styleBible = fallbackStyleBible(preset, input.tone);

  if (process.env.OPENAI_API_KEY) {
    try {
      const refined = await llm.generate({
        system:
          "You create reusable illustration style bibles for children's story images. Output plain text only.",
        messages: [
          {
            role: "user",
            content: [
              "Create a style bible block for one story.",
              "Return 8-14 short lines.",
              "No scene content, no character names, no plot elements.",
              "Only stable style rules that can be reused for cover and all pages.",
              `Age preset: ${preset.label}.`,
              `Deterministic base style: ${preset.base}.`,
              `Tone: ${input.tone}.`,
              `Universe context: ${input.universeName}.`,
            ].join("\n"),
          },
        ],
        model: "gpt-4.1-mini",
        temperature: 0.2,
        presence_penalty: 0,
        frequency_penalty: 0,
        max_tokens: 350,
        tracking: {
          storyId: null,
          pageNumber: null,
          step: "style_bible_generate",
        },
      });

      const lines = refined
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 14);

      if (lines.length >= 8) {
        styleBible = lines.join("\n");
      }
    } catch {
      // fallback deterministic style bible
    }
  }

  return {
    styleBible,
    styleId: buildStyleId(normalizedAge, input.tone, styleBible),
  };
}
