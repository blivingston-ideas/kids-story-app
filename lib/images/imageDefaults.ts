export type ImageMode = "fast" | "best";

export type ImageGenerationSettings = {
  model: "gpt-image-1-mini" | "gpt-image-1";
  quality: "low" | "medium" | "high";
  size: "1024x1024" | "1536x1024" | "1024x1536";
  n: 1;
};

export const IMAGE_DEFAULTS = {
  page: {
    fast: {
      model: "gpt-image-1-mini",
      quality: "low",
      size: "1024x1024",
      n: 1,
    },
    best: {
      model: "gpt-image-1",
      quality: "high",
      size: "1536x1024",
      n: 1,
    },
  },
  cover: {
    fast: {
      model: "gpt-image-1-mini",
      quality: "medium",
      size: "1024x1024",
      n: 1,
    },
    best: {
      model: "gpt-image-1",
      quality: "high",
      size: "1536x1024",
      n: 1,
    },
  },
} as const;

export function getPageImageSettings(mode: ImageMode): ImageGenerationSettings {
  return IMAGE_DEFAULTS.page[mode];
}

export function getCoverImageSettings(mode: ImageMode): ImageGenerationSettings {
  return IMAGE_DEFAULTS.cover[mode];
}

