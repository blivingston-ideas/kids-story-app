import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StoryCostBreakdownItem = {
  step: string;
  costUSD: number;
};

export type StoryCostSummary = {
  totalCostUSD: number;
  hasRows: boolean;
  breakdown: StoryCostBreakdownItem[];
};

export async function getStoryCost(storyId: string): Promise<StoryCostSummary> {
  const supabase = await createSupabaseServerClient();

  const [{ data: rows, error: rowsError }, { data: grouped, error: groupedError }] = await Promise.all([
    supabase.from("generation_costs").select("cost_usd").eq("story_id", storyId),
    supabase
      .from("generation_costs")
      .select("step, cost_usd")
      .eq("story_id", storyId)
      .order("created_at", { ascending: true }),
  ]);

  if (rowsError || groupedError) {
    const message = rowsError?.message ?? groupedError?.message ?? "";
    if (message.includes("relation \"generation_costs\" does not exist")) {
      return { totalCostUSD: 0, hasRows: false, breakdown: [] };
    }
    throw new Error(message);
  }

  const totalCostUSD = (rows ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  const byStep = new Map<string, number>();
  for (const row of grouped ?? []) {
    const step = row.step ?? "unknown";
    const current = byStep.get(step) ?? 0;
    byStep.set(step, current + Number(row.cost_usd ?? 0));
  }

  const breakdown = [...byStep.entries()].map(([step, cost]) => ({
    step,
    costUSD: cost,
  }));

  return {
    totalCostUSD,
    hasRows: (rows?.length ?? 0) > 0,
    breakdown,
  };
}
