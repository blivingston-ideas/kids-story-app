import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeCostUSD, type OpenAIUsage } from "@/lib/openai/pricing";

export type CostRow = {
  story_id: string;
  page_number: number | null;
  step: string;
  provider: "openai";
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens: number | null;
  reasoning_tokens: number | null;
  cost_usd: number;
  response_id: string | null;
};

type UsageShape = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

type ResponseLike = {
  id?: string;
  usage?: UsageShape;
};

function toInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeUsage(usage: UsageShape | undefined): OpenAIUsage {
  const inputTokens = toInt(usage?.input_tokens ?? usage?.prompt_tokens);
  const outputTokens = toInt(usage?.output_tokens ?? usage?.completion_tokens);
  const totalTokens = toInt(usage?.total_tokens ?? inputTokens + outputTokens);
  const cachedInputTokens = toInt(
    usage?.input_tokens_details?.cached_tokens ?? usage?.prompt_tokens_details?.cached_tokens
  );
  const reasoningTokens = toInt(
    usage?.output_tokens_details?.reasoning_tokens ?? usage?.completion_tokens_details?.reasoning_tokens
  );

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    cached_input_tokens: cachedInputTokens || undefined,
    reasoning_tokens: reasoningTokens || undefined,
  };
}

export async function callOpenAIWithCost<T extends ResponseLike>({
  storyId,
  pageNumber,
  step,
  model,
  createResponseFn,
  onTracked,
}: {
  storyId?: string | null;
  pageNumber?: number | null;
  step: string;
  model: string;
  createResponseFn: () => Promise<T>;
  onTracked?: (row: Omit<CostRow, "story_id">) => void;
}): Promise<T> {
  const response = await createResponseFn();
  const usage = normalizeUsage(response.usage);
  const costUSD = computeCostUSD(model, usage);

  const rowWithoutStory: Omit<CostRow, "story_id"> = {
    page_number: pageNumber ?? null,
    step,
    provider: "openai",
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
    cached_input_tokens: usage.cached_input_tokens ?? null,
    reasoning_tokens: usage.reasoning_tokens ?? null,
    cost_usd: costUSD,
    response_id: response.id ?? null,
  };

  if (onTracked) onTracked(rowWithoutStory);

  if (storyId) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("generation_costs").insert({
      ...rowWithoutStory,
      story_id: storyId,
    });
    if (error) {
      console.warn(`[generation_costs] insert failed: ${error.message}`);
    }
  }

  return response;
}
