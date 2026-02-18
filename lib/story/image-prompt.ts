export const NEGATIVE_CONSTRAINTS_BLOCK = [
  "No text, no words, no letters, no logos, no watermarks.",
  "Same art style as above; do not change medium, palette, or rendering style.",
  "Keep character facial features consistent across images.",
  "Avoid dramatic style shifts (anime, pixel art, oil painting, photorealism) unless style_bible explicitly says so.",
  "Child-safe, wholesome, age-appropriate.",
].join("\n");

export function buildImagePrompt(params: {
  styleBible: string;
  characterBible: string;
  sceneBlock: string;
}): string {
  return [
    `STYLE BIBLE (do not deviate):\n${params.styleBible}\n`,
    `CHARACTER BIBLE (keep stable across images; only outfit may change):\n${params.characterBible}\n`,
    `${params.sceneBlock}\n`,
    `NEGATIVE CONSTRAINTS:\n${NEGATIVE_CONSTRAINTS_BLOCK}`,
  ].join("\n");
}
