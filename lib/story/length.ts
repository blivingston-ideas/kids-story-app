export type WordTargets = {
  target: number;
  min: number;
  max: number;
};

export function getWordTargets(lengthMinutes: number): WordTargets {
  if (lengthMinutes <= 5) {
    return { target: 825, min: 700, max: 950 };
  }
  if (lengthMinutes <= 10) {
    return { target: 1500, min: 1300, max: 1700 };
  }
  if (lengthMinutes <= 20) {
    return { target: 3000, min: 2600, max: 3400 };
  }

  const target = Math.max(500, Math.min(4000, Math.round(lengthMinutes * 160)));
  const min = Math.max(500, Math.round(target * 0.85));
  const max = Math.min(4000, Math.round(target * 1.15));
  return { target, min, max };
}

export function countWords(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).length;
}

export function getParagraphGuidance(lengthMinutes: number): string {
  if (lengthMinutes <= 5) return "Use 8-12 short paragraphs.";
  if (lengthMinutes <= 10) return "Use 10-18 short paragraphs.";
  if (lengthMinutes <= 20) return "Use 18-30 short paragraphs.";
  return "Use many short paragraphs with a clear beginning, middle, and satisfying ending.";
}
