import { z } from "zod";
import { llm } from "@/lib/llm/client";
import { getWordTargets } from "@/lib/story/length";
import type { GenerateStoryInput } from "@/lib/storygen/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CostRow } from "@/lib/openai/callWithCost";

type KidProfile = {
  id: string;
  display_name: string;
  age: number | null;
  themes: string[] | null;
  books_we_like: string[] | null;
};

type AdultProfile = {
  id: string;
  display_name: string;
  persona_label: string | null;
};

export type StoryBibleContext = {
  universeName: string;
  kids: KidProfile[];
  adults: AdultProfile[];
};

const storySparkSchema = z.enum([
  "adventure",
  "mystery",
  "brave",
  "friendship",
  "silly",
  "discovery",
  "helper",
  "magic",
]);

const storyBibleSchema = z.object({
  title: z.string().trim().min(1),
  audience_age: z.number().int().min(1).max(17),
  tone: z.enum(["calm", "silly", "adventurous"]),
  setting: z.string().trim().min(1),
  rules: z.array(z.string().trim().min(1)).min(1),
  characters: z.array(z.object({ name: z.string().trim().min(1), role: z.string().trim().min(1), traits: z.array(z.string().trim().min(1)).min(1) })).min(1),
  allowed_entities: z.array(z.string().trim().min(1)).min(1),
  forbidden: z.array(z.string().trim().min(1)),
  ending_goal: z.string().trim().min(1),
});

const beatPageSchema = z.object({
  pageNumber: z.number().int().min(1),
  beatGoal: z.string().trim().min(1),
  mustInclude: z.array(z.string().trim().min(1)),
  mustNotInclude: z.array(z.string().trim().min(1)),
  cliffhangerOrTransition: z.string().trim().min(1),
});

const beatSheetSchema = z.object({
  page_count: z.number().int().min(2).max(40),
  pages: z.array(beatPageSchema).min(2).max(40),
});

const continuityLedgerSchema = z.object({
  established_facts: z.array(z.string().trim().min(1)),
  open_threads: z.array(z.string().trim().min(1)),
});

const storyPlanSchema = z.object({
  story_bible_json: storyBibleSchema,
  beat_sheet_json: beatSheetSchema,
  continuity_ledger_json: continuityLedgerSchema,
});

const pageValidationSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.string().trim().min(1)),
  fixedText: z.string().trim().min(1).optional(),
});

const ledgerUpdateSchema = z.object({
  established_facts: z.array(z.string().trim().min(1)),
  open_threads: z.array(z.string().trim().min(1)),
});

export type StoryPlan = z.infer<typeof storyPlanSchema>;
type Ledger = z.infer<typeof continuityLedgerSchema>;

type PipelineInput = GenerateStoryInput & { storyBible: StoryBibleContext };

type LogFn = (step: string, payload: Record<string, unknown>, response: Record<string, unknown>) => Promise<void>;
type CostFn = (row: Omit<CostRow, "story_id">) => void;

export type GeneratedStoryPage = {
  page_number: number;
  text: string;
};

export type StoryPipelineResult = {
  title: string;
  pages: GeneratedStoryPage[];
  storyText: string;
  wordCount: number;
  storyBible: z.infer<typeof storyBibleSchema>;
  beatSheet: z.infer<typeof beatSheetSchema>;
  continuityLedger: Ledger;
  warnings: string[];
};

function parseJsonObjectFlexible(raw: string): unknown {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) {
      throw new Error("No JSON object found.");
    }
    return JSON.parse(cleaned.slice(first, last + 1)) as unknown;
  }
}

function countWords(text: string): number {
  return text.split(/\s+/).map((w) => w.trim()).filter(Boolean).length;
}

function toneFromSpark(spark: z.infer<typeof storySparkSchema>): "calm" | "silly" | "adventurous" {
  if (spark === "silly") return "silly";
  if (spark === "friendship" || spark === "helper" || spark === "discovery") return "calm";
  return "adventurous";
}

function pageCountFromLength(lengthMinutes: number): number {
  return Math.max(4, Math.min(30, lengthMinutes * 2));
}

function sparkRules(spark: z.infer<typeof storySparkSchema>): string[] {
  const bySpark: Record<z.infer<typeof storySparkSchema>, string[]> = {
    adventure: ["Clear external goal", "Escalating obstacles", "Environmental challenge", "Triumphant ending"],
    mystery: ["Puzzle or strange event", "At least one false assumption", "Clue progression", "Clear reveal"],
    brave: ["Internal fear", "Self-doubt moment", "Turning point", "Emotional growth resolution"],
    friendship: ["Relationship tension", "Honest communication", "Restored bond"],
    silly: ["Increasing absurdity", "Rule-of-3 escalation", "Clever resolution"],
    discovery: ["Curiosity exploration", "Learning moment", "Awe-based ending"],
    helper: ["Someone in need", "Attempts that fail first", "Creative solve", "Gratitude resolution"],
    magic: ["Clear magic rule", "Consequence", "Emotional integration"],
  };
  return bySpark[spark];
}

function sanitizeWords(input: string): string[] {
  return input
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildContextualTitle(input: PipelineInput, settingHint?: string): string {
  const leadName =
    input.storyBible.kids[0]?.display_name ??
    input.storyBible.adults[0]?.display_name ??
    "Family";
  const sparkNoun: Record<z.infer<typeof storySparkSchema>, string> = {
    adventure: "Quest",
    mystery: "Mystery",
    brave: "Brave Step",
    friendship: "Friendship Fix",
    silly: "Silly Switch",
    discovery: "Discovery",
    helper: "Helping Plan",
    magic: "Magic Rule",
  };

  const source = settingHint?.trim() || input.optionalPrompt?.trim() || input.storyBible.universeName;
  const placeWords = sanitizeWords(source).slice(0, 3);
  const place = placeWords.length > 0 ? toTitleCase(placeWords.join(" ")) : "Story Universe";

  return `${leadName}'s ${sparkNoun[input.storySpark]} in ${place}`;
}

function pickStoryTitle(input: PipelineInput, rawTitle: string, settingHint?: string): string {
  const normalized = rawTitle.trim();
  const blocked = new Set([
    "a story universe adventure",
    "story universe adventure",
    "untitled",
    "untitled story",
  ]);
  if (!normalized || blocked.has(normalized.toLowerCase())) {
    return buildContextualTitle(input, settingHint);
  }
  return normalized;
}

function buildFallbackPlan(input: PipelineInput): StoryPlan {
  const spark = storySparkSchema.parse(input.storySpark);
  const pageCount = pageCountFromLength(input.lengthMinutes);
  const tone = toneFromSpark(spark);
  const characterNames = [
    ...input.storyBible.kids.map((k) => k.display_name),
    ...input.storyBible.adults.map((a) => a.display_name),
  ];
  const allowedEntities = characterNames.length > 0 ? [...characterNames, input.storyBible.universeName] : [input.storyBible.universeName];
  const rules = [
    "Keep names and identities consistent.",
    "No scary or violent content.",
    "End with a warm, satisfying resolution.",
    ...sparkRules(spark),
  ];

  return {
    story_bible_json: {
      title: buildContextualTitle(input, input.optionalPrompt || input.storyBible.universeName),
      audience_age: input.audienceAge,
      tone,
      setting: input.optionalPrompt?.trim() || input.storyBible.universeName || "Story Universe",
      rules,
      characters:
        characterNames.length > 0
          ? characterNames.map((name) => ({ name, role: "character", traits: ["kind", "curious"] }))
          : [{ name: "The Explorer", role: "main character", traits: ["kind", "curious"] }],
      allowed_entities: allowedEntities,
      forbidden: ["gore", "horror", "cruelty", "explicit content"],
      ending_goal: "Close with calm gratitude and bedtime comfort.",
    },
    beat_sheet_json: {
      page_count: pageCount,
      pages: Array.from({ length: pageCount }).map((_, idx) => ({
        pageNumber: idx + 1,
        beatGoal:
          idx === 0
            ? "Introduce the adventure and goal."
            : idx === pageCount - 1
            ? "Resolve the main challenge and wrap up warmly."
            : "Advance the quest with a new event and character choice.",
        mustInclude: idx === 0 ? ["main character", "goal"] : ["forward progress"],
        mustNotInclude: ["new named entities", "scary content"],
        cliffhangerOrTransition:
          idx === pageCount - 1
            ? "End at peace."
            : "Transition smoothly to the next page with curiosity.",
      })),
    },
    continuity_ledger_json: {
      established_facts: [],
      open_threads: [],
    },
  };
}

function buildCharacterContext(ctx: StoryBibleContext): string {
  const kids = ctx.kids.map((k) => {
    const parts = [
      `Kid ${k.display_name}`,
      typeof k.age === "number" ? `age ${k.age}` : "",
      k.themes?.length ? `themes: ${k.themes.join(", ")}` : "",
      k.books_we_like?.length ? `books: ${k.books_we_like.join(", ")}` : "",
    ].filter(Boolean);
    return parts.join("; ");
  });
  const adults = ctx.adults.map((a) =>
    [`Adult ${a.display_name}`, a.persona_label ? `persona: ${a.persona_label}` : ""].filter(Boolean).join("; ")
  );
  return [...kids, ...adults].join("\n");
}

async function callJson<T extends z.ZodType>(
  schema: T,
  params: {
    system: string;
    user: string;
    temperature: number;
    maxTokens: number;
    retries?: number;
    tracking?: {
      storyId?: string | null;
      pageNumber?: number | null;
      step: string;
      onTracked?: CostFn;
    };
  }
): Promise<z.infer<T>> {
  async function repairJson(raw: string, validationIssues?: string): Promise<string> {
    const schemaShape = JSON.stringify((schema as unknown as { _def?: { typeName?: string } })._def ?? {});
    return llm.generate({
      system: "You are a JSON repair tool. Output strict JSON only.",
      messages: [
        {
          role: "user",
          content: [
            "Fix this output into valid JSON with double-quoted keys, no comments, and no trailing commas.",
            validationIssues ? `Validation issues: ${validationIssues}` : "",
            `Target schema hint: ${schemaShape.slice(0, 500)}`,
            "Invalid JSON input:",
            raw,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      model: "gpt-4.1-mini",
      temperature: 0,
      max_tokens: params.maxTokens,
      tracking: params.tracking
        ? {
            ...params.tracking,
            step: `${params.tracking.step}_repair`,
          }
        : undefined,
      metadata: {
        story_id: params.tracking?.storyId ?? "",
        step: `${params.tracking?.step ?? "json_call"}_repair`,
        page_number: String(params.tracking?.pageNumber ?? ""),
      },
    });
  }

  const retries = params.retries ?? 1;
  let lastErr: Error | null = null;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const raw = await llm.generate({
        system: params.system,
        messages: [{ role: "user", content: params.user }],
        model: "gpt-4.1-mini",
        temperature: params.temperature,
        presence_penalty: 0.3,
        frequency_penalty: 0.3,
        max_tokens: params.maxTokens,
        tracking: params.tracking,
        metadata: {
          story_id: params.tracking?.storyId ?? "",
          step: params.tracking?.step ?? "json_call",
          page_number: String(params.tracking?.pageNumber ?? ""),
        },
      });
      const parsedObject = parseJsonObjectFlexible(raw);
      const parsed = schema.safeParse(parsedObject);
      if (parsed.success) return parsed.data;

      const validationIssues = parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(" | ");
      const repairedRaw = await repairJson(raw, validationIssues);
      const repairedParsed = schema.safeParse(parseJsonObjectFlexible(repairedRaw));
      if (repairedParsed.success) return repairedParsed.data;
      throw new Error(
        repairedParsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" | ")
      );
    } catch (error) {
      const e = error instanceof Error ? error : new Error("Unknown JSON generation error.");
      try {
        const repairedRaw = await repairJson(String((error as Error)?.message ?? ""));
        const repaired = schema.safeParse(parseJsonObjectFlexible(repairedRaw));
        if (repaired.success) return repaired.data;
        lastErr = new Error(repaired.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" | "));
      } catch {
        lastErr = e;
      }
    }
  }
  throw lastErr ?? new Error("Failed to generate valid JSON.");
}

export async function generateStoryPlan(
  input: PipelineInput,
  onLog?: LogFn,
  options?: { storyId?: string | null; onCost?: CostFn }
): Promise<StoryPlan> {
  const spark = storySparkSchema.parse(input.storySpark);
  const pages = pageCountFromLength(input.lengthMinutes);
  const tone = toneFromSpark(spark);
  const userPrompt = [
    "Create a strict StoryBible + BeatSheet + ContinuityLedger JSON plan.",
    `Story spark: ${spark}`,
    `Tone: ${tone}`,
    `Audience age: ${input.audienceAge}`,
    `Universe: ${input.storyBible.universeName}`,
    `Page count: ${pages}`,
    `Optional user prompt: ${input.optionalPrompt || "none"}`,
    "Spark arc rules:",
    ...sparkRules(spark).map((r) => `- ${r}`),
    "Characters context:",
    buildCharacterContext(input.storyBible),
    "Constraints:",
    "- Beat sheet pages must be exactly page_count entries.",
    "- Each page has clear beat goal and transition.",
    "- No forbidden scary/violent elements.",
    "- Keep to child-safe bedtime tone unless spark implies silly/adventure.",
    "Output only JSON with keys: story_bible_json, beat_sheet_json, continuity_ledger_json.",
  ].join("\n");
  let plan: StoryPlan;
  try {
    plan = await callJson(storyPlanSchema, {
      system: "You are a children's story planning system. Output strict JSON only.",
      user: userPrompt,
      temperature: 0.2,
      maxTokens: 2200,
      retries: 2,
      tracking: {
        storyId: options?.storyId,
        pageNumber: null,
        step: "plan",
        onTracked: options?.onCost,
      },
    });
  } catch {
    plan = buildFallbackPlan(input);
  }

  if (onLog) {
    await onLog("plan", { storySpark: spark, pageCount: pages }, { plan });
  }
  return plan;
}

async function validateAndFixPage(
  pageText: string,
  storyBible: z.infer<typeof storyBibleSchema>,
  ledger: Ledger,
  tracking?: { storyId?: string | null; pageNumber?: number | null; onCost?: CostFn }
): Promise<{ text: string; issues: string[]; ok: boolean }> {
  const validation = await callJson(pageValidationSchema, {
    system: "You validate children's story continuity. Output strict JSON only.",
    user: [
      "Validate page text against story constraints.",
      "Check for drift/hallucination near ending.",
      "Return JSON: { ok, issues[], fixedText? }",
      "Rules:",
      "- no new named entities unless in allowed_entities",
      "- no new world rules",
      "- keep tense and POV consistent",
      "- keep child-safe tone",
      `Allowed entities: ${storyBible.allowed_entities.join(", ")}`,
      `Forbidden: ${storyBible.forbidden.join(", ")}`,
      `Ledger facts: ${ledger.established_facts.join(" | ")}`,
      `Open threads: ${ledger.open_threads.join(" | ")}`,
      "Page text:",
      pageText,
    ].join("\n"),
    temperature: 0.1,
    maxTokens: 1200,
    retries: 1,
    tracking: {
      storyId: tracking?.storyId,
      pageNumber: tracking?.pageNumber ?? null,
      step: "page_validate",
      onTracked: tracking?.onCost,
    },
  });

  if (validation.ok) {
    return { text: pageText, issues: [], ok: true };
  }
  if (validation.fixedText) {
    return { text: validation.fixedText, issues: validation.issues, ok: false };
  }
  return { text: pageText, issues: validation.issues, ok: false };
}

async function extractLedgerUpdate(
  pageText: string,
  tracking?: { storyId?: string | null; pageNumber?: number | null; onCost?: CostFn }
): Promise<Ledger> {
  return callJson(ledgerUpdateSchema, {
    system: "Extract concise continuity facts from story text. Output strict JSON only.",
    user: [
      "From this page, extract new established facts and open threads.",
      "Avoid duplicates and keep statements short.",
      "Output JSON only with keys established_facts and open_threads.",
      pageText,
    ].join("\n"),
    temperature: 0.1,
    maxTokens: 600,
    retries: 1,
    tracking: {
      storyId: tracking?.storyId,
      pageNumber: tracking?.pageNumber ?? null,
      step: "ledger_extract",
      onTracked: tracking?.onCost,
    },
  });
}

function mergeLedger(base: Ledger, update: Ledger): Ledger {
  const facts = [...new Set([...base.established_facts, ...update.established_facts])];
  const threads = [...new Set([...base.open_threads, ...update.open_threads])];
  return { established_facts: facts.slice(-60), open_threads: threads.slice(-30) };
}

async function generatePagesFromPlan(
  input: PipelineInput,
  plan: StoryPlan,
  onLog?: LogFn,
  options?: { storyId?: string | null; onCost?: CostFn }
): Promise<{ pages: GeneratedStoryPage[]; continuityLedger: Ledger; warnings: string[] }> {
  const warnings: string[] = [];
  const targets = getWordTargets(input.lengthMinutes);
  const minPerPage = Math.max(80, Math.floor(targets.min / plan.beat_sheet_json.page_count));
  const maxPerPage = Math.max(minPerPage + 40, Math.floor(targets.max / plan.beat_sheet_json.page_count));

  let ledger = plan.continuity_ledger_json;
  const pages: GeneratedStoryPage[] = [];

  for (const beat of plan.beat_sheet_json.pages) {
    const prevContext = pages.slice(-2).map((p) => `Page ${p.page_number}: ${p.text}`).join("\n\n");
    const pagePrompt = [
      `Write page ${beat.pageNumber} of ${plan.beat_sheet_json.page_count}.`,
      `Target words for this page: ${minPerPage}-${maxPerPage}.`,
      `Beat goal: ${beat.beatGoal}`,
      `Must include: ${beat.mustInclude.join(", ") || "none"}`,
      `Must not include: ${beat.mustNotInclude.join(", ") || "none"}`,
      `Transition goal: ${beat.cliffhangerOrTransition}`,
      `Ending goal for full story: ${plan.story_bible_json.ending_goal}`,
      `Allowed entities: ${plan.story_bible_json.allowed_entities.join(", ")}`,
      `Forbidden elements: ${plan.story_bible_json.forbidden.join(", ")}`,
      "Hard constraints:",
      "- no new named entities",
      "- no new world rules",
      "- keep tense and POV consistent",
      "- keep child-safe tone",
      `Continuity facts: ${ledger.established_facts.join(" | ")}`,
      `Open threads: ${ledger.open_threads.join(" | ")}`,
      prevContext ? `Recent pages:\n${prevContext}` : "",
      "Return only page prose text.",
    ]
      .filter(Boolean)
      .join("\n");

    let pageText = await llm.generate({
      system: "You write coherent children's picture book page prose.",
      messages: [{ role: "user", content: pagePrompt }],
      model: "gpt-4.1-mini",
      temperature: 0.6,
      presence_penalty: 0.5,
      frequency_penalty: 0.5,
      max_tokens: 900,
      tracking: {
        storyId: options?.storyId,
        pageNumber: beat.pageNumber,
        step: "page_generate",
        onTracked: options?.onCost,
      },
      metadata: {
        story_id: options?.storyId ?? "",
        step: "page_generate",
        page_number: String(beat.pageNumber),
      },
    });
    pageText = pageText.trim();

    const firstValidation = await validateAndFixPage(pageText, plan.story_bible_json, ledger, {
      storyId: options?.storyId,
      pageNumber: beat.pageNumber,
      onCost: options?.onCost,
    });
    if (!firstValidation.ok && firstValidation.issues.length > 0) {
      warnings.push(`Page ${beat.pageNumber} required continuity fix.`);
    }
    pageText = firstValidation.text.trim();

    if (!firstValidation.ok && !firstValidation.text) {
      const regenPrompt = [
        pagePrompt,
        `Previous issues to fix: ${firstValidation.issues.join(" | ")}`,
        "Regenerate page following all constraints exactly.",
      ].join("\n");
      pageText = (
        await llm.generate({
          system: "You regenerate a constrained story page with strict continuity.",
          messages: [{ role: "user", content: regenPrompt }],
          model: "gpt-4.1-mini",
          temperature: 0.4,
          presence_penalty: 0.4,
          frequency_penalty: 0.4,
          max_tokens: 900,
          tracking: {
            storyId: options?.storyId,
            pageNumber: beat.pageNumber,
            step: "page_regenerate",
            onTracked: options?.onCost,
          },
          metadata: {
            story_id: options?.storyId ?? "",
            step: "page_regenerate",
            page_number: String(beat.pageNumber),
          },
        })
      ).trim();
    }

    pages.push({ page_number: beat.pageNumber, text: pageText });
    const ledgerUpdate = await extractLedgerUpdate(pageText, {
      storyId: options?.storyId,
      pageNumber: beat.pageNumber,
      onCost: options?.onCost,
    });
    ledger = mergeLedger(ledger, ledgerUpdate);

    if (onLog) {
      await onLog(
        "page_generation",
        { pageNumber: beat.pageNumber, beatGoal: beat.beatGoal },
        { pageText, ledgerUpdate }
      );
    }
  }

  return { pages, continuityLedger: ledger, warnings };
}

export async function runStoryPipeline(
  input: PipelineInput,
  onLog?: LogFn,
  options?: { storyId?: string | null; onCost?: CostFn }
): Promise<StoryPipelineResult> {
  const plan = await generateStoryPlan(input, onLog, options);
  const generated = await generatePagesFromPlan(input, plan, onLog, options);
  const storyText = generated.pages.map((p) => p.text).join("\n\n");
  const wordCount = countWords(storyText);

  return {
    title: pickStoryTitle(input, plan.story_bible_json.title, plan.story_bible_json.setting),
    pages: generated.pages,
    storyText,
    wordCount,
    storyBible: plan.story_bible_json,
    beatSheet: plan.beat_sheet_json,
    continuityLedger: generated.continuityLedger,
    warnings: generated.warnings,
  };
}

export async function generateStoryPages(storyId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, universe_id, length_minutes")
    .eq("id", storyId)
    .maybeSingle();
  if (storyError) throw new Error(storyError.message);
  if (!story) throw new Error("Story not found.");

  const { data: bibleRow, error: bibleError } = await supabase
    .from("story_bibles")
    .select("story_bible_json, beat_sheet_json, continuity_ledger_json")
    .eq("story_id", storyId)
    .maybeSingle();
  if (bibleError) throw new Error(bibleError.message);
  if (!bibleRow) throw new Error("Story plan not found.");

  const plan = storyPlanSchema.safeParse({
    story_bible_json: bibleRow.story_bible_json,
    beat_sheet_json: bibleRow.beat_sheet_json,
    continuity_ledger_json: bibleRow.continuity_ledger_json,
  });
  if (!plan.success) {
    throw new Error(plan.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
  }

  const placeholderInput: PipelineInput = {
    universeId: story.universe_id,
    kidProfileIds: [],
    adultProfileIds: [],
    audienceAge: plan.data.story_bible_json.audience_age,
    storySpark: "adventure",
    lengthMinutes: story.length_minutes,
    surpriseVsGuided: "surprise",
    optionalPrompt: "",
    storyBible: { universeName: "Story Universe", kids: [], adults: [] },
  };

  const generated = await generatePagesFromPlan(placeholderInput, plan.data, undefined, {
    storyId,
  });
  const rows = generated.pages.map((p) => ({
    story_id: storyId,
    page_index: p.page_number - 1,
    text: p.text,
    image_status: "pending" as const,
    image_path: null,
    image_url: null,
    image_error: null,
  }));

  const del = await supabase.from("story_pages").delete().eq("story_id", storyId);
  if (del.error) throw new Error(del.error.message);
  if (rows.length > 0) {
    const ins = await supabase.from("story_pages").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }

  const upd = await supabase
    .from("story_bibles")
    .update({ continuity_ledger_json: generated.continuityLedger, updated_at: new Date().toISOString() })
    .eq("story_id", storyId);
  if (upd.error) throw new Error(upd.error.message);
}
