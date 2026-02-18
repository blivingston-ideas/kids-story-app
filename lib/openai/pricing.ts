export type OpenAIUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens?: number | null;
  reasoning_tokens?: number | null;
};

// Source reference: https://openai.com/api/pricing/
// TODO: keep this map updated when OpenAI pricing changes.
export const PRICE_PER_1M: Record<
  string,
  { input: number; output: number; cached_input?: number }
> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cached_input: 0.1 },
  "gpt-4.1": { input: 2.0, output: 8.0, cached_input: 0.5 },
  "gpt-image-1": { input: 5.0, output: 0.0 },
  "gpt-image-1-mini": { input: 1.0, output: 0.0 },
};

export function computeCostUSD(model: string, usage: OpenAIUsage): number {
  const pricing = PRICE_PER_1M[model];
  if (!pricing) return 0;

  const inputTokens = Math.max(0, usage.input_tokens || 0);
  const outputTokens = Math.max(0, usage.output_tokens || 0);
  const cachedInputTokens = Math.max(0, usage.cached_input_tokens || 0);

  if (pricing.cached_input !== undefined && cachedInputTokens > 0) {
    const effectiveInput = Math.max(0, inputTokens - cachedInputTokens);
    const inputCost = (effectiveInput / 1_000_000) * pricing.input;
    const cachedInputCost = (cachedInputTokens / 1_000_000) * pricing.cached_input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + cachedInputCost + outputCost;
  }

  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}
