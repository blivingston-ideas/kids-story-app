export type StoryPageText = {
  pageIndex: number;
  text: string;
};

function splitParagraphs(content: string): string[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) return paragraphs;

  return content
    .split(/\.\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.endsWith(".") ? p : `${p}.`));
}

function chunkEvenly(items: string[], chunkCount: number): string[] {
  if (chunkCount <= 1) return [items.join("\n\n")];
  const chunks: string[] = [];
  const size = Math.ceil(items.length / chunkCount);
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size).join("\n\n"));
  }
  return chunks;
}

export function buildStoryPageTexts(content: string, lengthMinutes: number): StoryPageText[] {
  const maxTotalPages = Math.max(2, Math.min(120, lengthMinutes * 2));
  const contentPageLimit = Math.max(1, maxTotalPages - 1);
  const paragraphs = splitParagraphs(content);
  const desiredContentPages = Math.min(contentPageLimit, Math.max(1, paragraphs.length));
  const contentChunks = chunkEvenly(paragraphs, desiredContentPages).slice(0, contentPageLimit);

  return contentChunks.map((text, i) => ({ pageIndex: i, text }));
}
