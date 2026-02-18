"use client";

import { useMemo, useState } from "react";
import { saveStoryAction } from "@/app/create/actions";
import StoryGenerationProgress from "@/components/StoryGenerationProgress";
import { useStoryGenerationProgress } from "@/hooks/useStoryGenerationProgress";
import Button from "@/components/button";
import StoryBookViewer from "@/components/story-book-viewer";

type CharacterOption = {
  id: string;
  type: "kid" | "adult";
  label: string;
  avatarUrl: string | null;
  age: number | null;
};

type StorySpark =
  | "adventure"
  | "mystery"
  | "brave"
  | "friendship"
  | "silly"
  | "discovery"
  | "helper"
  | "magic";

const sparkCards: Array<{ id: StorySpark; name: string; description: string }> = [
  { id: "adventure", name: "Adventure", description: "A bold quest with rising obstacles and a triumphant finish." },
  { id: "mystery", name: "Mystery", description: "A curious puzzle with clues, a wrong turn, and a reveal." },
  { id: "brave", name: "Brave", description: "A fear faced with heart, growth, and a proud turning point." },
  { id: "friendship", name: "Friendship", description: "A bond tested, honest repair, and a stronger connection." },
  { id: "silly", name: "Silly", description: "Playful chaos that escalates in funny rule-of-three beats." },
  { id: "discovery", name: "Discovery", description: "Curious exploring, learning, and an awe-filled ending." },
  { id: "helper", name: "Helper", description: "Someone needs help, creative tries, and grateful resolution." },
  { id: "magic", name: "Magic", description: "A magical rule, a consequence, and emotional integration." },
];

function toneForSpark(spark: StorySpark): "calm" | "silly" | "adventurous" {
  if (spark === "silly") return "silly";
  if (spark === "friendship" || spark === "helper" || spark === "discovery") return "calm";
  return "adventurous";
}

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

type Props = {
  universeId: string;
  characterOptions: CharacterOption[];
};

type GenerateState = {
  ok: boolean;
  error: string | null;
  generatedTitle: string;
  generatedContent: string;
  generatedBlurb: string;
  readingTimeEstimate: number;
  spark: string;
  warnings: string[];
  wordCount: number;
  sceneCount: number;
  generationCostsJson: string;
  generatedPagesJson: string;
  storyBibleJson: string;
  beatSheetJson: string;
  continuityLedgerJson: string;
};

export default function CreateStoryWizard({ universeId, characterOptions }: Props) {
  const mode: "surprise" | "guided" = "surprise";
  const guidedBeginning = "";
  const guidedMiddle = "";
  const guidedEnding = "";
  const [storySpark, setStorySpark] = useState<StorySpark>("adventure");
  const [lengthChoice, setLengthChoice] = useState<"5" | "10" | "20" | "custom">("10");
  const [customMinutes, setCustomMinutes] = useState("15");
  const [customCharacterName, setCustomCharacterName] = useState("");
  const [audienceAge, setAudienceAge] = useState("6");
  const [stage, setStage] = useState("");
  const [stageIdeaLoading, setStageIdeaLoading] = useState(false);
  const [stageIdeaError, setStageIdeaError] = useState<string | null>(null);
  const [selectedCharacterKeys, setSelectedCharacterKeys] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [createPanelCollapsed, setCreatePanelCollapsed] = useState(false);
  const [loadingPanelCollapsed, setLoadingPanelCollapsed] = useState(false);
  const { phase, progress, error: progressError, start, complete, fail, reset } =
    useStoryGenerationProgress();

  const [generateState, setGenerateState] = useState<GenerateState>({
    ok: false,
    error: null,
    generatedTitle: "",
    generatedContent: "",
    generatedBlurb: "",
    readingTimeEstimate: 0,
    spark: "",
    warnings: [],
    wordCount: 0,
    sceneCount: 0,
    generationCostsJson: "[]",
    generatedPagesJson: "[]",
    storyBibleJson: "{}",
    beatSheetJson: "{}",
    continuityLedgerJson: "{}",
  });

  const selectedCharacters = useMemo(
    () =>
      characterOptions
        .filter((c) => selectedCharacterKeys.includes(`${c.type}:${c.id}`))
        .map((c) => ({ type: c.type, id: c.id, label: c.label })),
    [characterOptions, selectedCharacterKeys]
  );

  const selectedKidAges = useMemo(
    () =>
      characterOptions
        .filter((c) => c.type === "kid" && selectedCharacterKeys.includes(`${c.type}:${c.id}`))
        .map((c) => c.age)
        .filter((age): age is number => typeof age === "number" && Number.isFinite(age)),
    [characterOptions, selectedCharacterKeys]
  );

  const effectiveAudienceAge = useMemo(() => {
    if (selectedKidAges.length > 0) {
      const avg = selectedKidAges.reduce((sum, age) => sum + age, 0) / selectedKidAges.length;
      return Math.max(1, Math.min(17, Number(avg.toFixed(1))));
    }
    const fallback = Number(audienceAge);
    if (!Number.isFinite(fallback)) return 6;
    return Math.max(1, Math.min(17, fallback));
  }, [selectedKidAges, audienceAge]);
  const previewPages = useMemo(() => {
    try {
      const parsed = JSON.parse(generateState.generatedPagesJson) as Array<{ page_number: number; text: string }>;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((p) => typeof p.page_number === "number" && typeof p.text === "string")
        .sort((a, b) => a.page_number - b.page_number)
        .map((p) => ({
          pageIndex: p.page_number - 1,
          text: p.text,
          imageStatus: "pending" as const,
          imageUrl: null,
          imageError: null,
        }));
    } catch {
      return [];
    }
  }, [generateState.generatedPagesJson]);

  const selectedCharactersJson = JSON.stringify(selectedCharacters);
  const derivedTone = toneForSpark(storySpark);
  const hasSelectedKid = selectedCharacters.some((c) => c.type === "kid");

  function toggleCharacter(key: string) {
    const next = selectedCharacterKeys.includes(key)
      ? selectedCharacterKeys.filter((k) => k !== key)
      : [...selectedCharacterKeys, key];
    setSelectedCharacterKeys(next);
  }

  function getLengthMinutes(): number {
    if (lengthChoice === "custom") {
      const n = Number(customMinutes);
      if (!Number.isFinite(n)) return 10;
      return Math.max(1, Math.min(30, Math.trunc(n)));
    }
    return Number(lengthChoice);
  }

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (generating) return;

    setCreatePanelCollapsed(true);
    setLoadingPanelCollapsed(false);
    reset();
    start();
    setGenerating(true);
    setGenerateState((prev) => ({ ...prev, error: null }));

    try {
      const kidProfileIds = selectedCharacters.filter((c) => c.type === "kid").map((c) => c.id);
      const adultProfileIds = selectedCharacters.filter((c) => c.type === "adult").map((c) => c.id);

      const guidedPrompt =
        mode === "guided"
          ? `Guided beats: beginning=${guidedBeginning || ""}; middle=${guidedMiddle || ""}; end=${guidedEnding || ""}`
          : "";

      const promptPieces = [stage.trim(), guidedPrompt.trim()].filter(Boolean);
      const optionalPrompt = promptPieces.join("\n");

      const response = await fetch("/api/stories/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universeId,
          kidProfileIds,
          adultProfileIds,
          storySpark,
          lengthMinutes: getLengthMinutes(),
          surpriseVsGuided: mode,
          audienceAge: effectiveAudienceAge,
          optionalPrompt,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        title?: string;
        storyText?: string;
        pages?: Array<{ page_number: number; text: string }>;
        storyBible?: Record<string, unknown>;
        beatSheet?: Record<string, unknown>;
        continuityLedger?: Record<string, unknown>;
        warnings?: string[];
        wordCount?: number;
        sceneCount?: number;
        generationCosts?: Array<{
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
        }>;
      };

      if (!response.ok || !payload.ok || !payload.title || !payload.storyText) {
        throw new Error(payload.error ?? "Failed to generate story.");
      }

      await complete();
      setLoadingPanelCollapsed(true);
      setCreatePanelCollapsed(true);

      setGenerateState({
        ok: true,
        error: null,
        generatedTitle: payload.title,
        generatedContent: payload.storyText,
        generatedBlurb: "A fresh story generated from your universe context.",
        readingTimeEstimate: getLengthMinutes(),
        spark: storySpark,
        warnings: payload.warnings ?? [],
        wordCount: payload.wordCount ?? 0,
        sceneCount: payload.sceneCount ?? 0,
        generationCostsJson: JSON.stringify(payload.generationCosts ?? []),
        generatedPagesJson: JSON.stringify(payload.pages ?? []),
        storyBibleJson: JSON.stringify(payload.storyBible ?? {}),
        beatSheetJson: JSON.stringify(payload.beatSheet ?? {}),
        continuityLedgerJson: JSON.stringify(payload.continuityLedger ?? {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate story.";
      fail(message);
      setLoadingPanelCollapsed(false);
      setGenerateState((prev) => ({ ...prev, ok: false, error: message }));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSurpriseStageIdea(): Promise<void> {
    if (stageIdeaLoading || generating) return;
    setStageIdeaError(null);
    setStageIdeaLoading(true);
    try {
      const kidProfileIds = selectedCharacters.filter((c) => c.type === "kid").map((c) => c.id);
      const selectedCharacterNames = [
        ...selectedCharacters.map((c) => c.label.trim()).filter(Boolean),
        customCharacterName.trim(),
      ].filter(Boolean);
      const response = await fetch("/api/stories/stage-blurb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storySpark, universeId, kidProfileIds, selectedCharacterNames }),
      });
      const payload = (await response.json()) as { ok?: boolean; blurb?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.blurb) {
        throw new Error(payload.error ?? "Could not generate a stage idea.");
      }
      setStage(payload.blurb.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate a stage idea.";
      setStageIdeaError(message);
    } finally {
      setStageIdeaLoading(false);
    }
  }

  const customMinutesValid =
    lengthChoice !== "custom" ||
    (customMinutes.trim().length > 0 && Number(customMinutes) >= 1 && Number(customMinutes) <= 60);

  const canGenerate =
    customMinutesValid &&
    Number.isFinite(effectiveAudienceAge) &&
    effectiveAudienceAge >= 1 &&
    effectiveAudienceAge <= 17 &&
    (selectedCharacters.length > 0 || customCharacterName.trim().length > 0);

  const showProgressPanel = generating || phase === "error" || phase === "done";
  const currentLengthLabel = lengthChoice === "custom" ? `${customMinutes} min` : `${lengthChoice} min`;

  return (
    <main className="min-h-screen bg-app-bg text-anchor">
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div className="card-surface p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-anchor">Create Story</h1>
              <p className="mt-2 text-sm text-anchor/75">
                {createPanelCollapsed
                  ? "Create form is minimized. Expand to see your inputs."
                  : "Shape your story, then make it real."}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setCreatePanelCollapsed((prev) => !prev)}
              variant="ghost"
              className="px-3 py-2 text-xs"
            >
              {createPanelCollapsed ? "Expand details" : "Minimize"}
            </Button>
          </div>

          {createPanelCollapsed ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-soft-accent px-3 py-1 font-medium text-anchor capitalize">
                {storySpark}
              </span>
              <span className="rounded-full bg-soft-accent px-3 py-1 font-medium text-anchor">
                {currentLengthLabel}
              </span>
              <span className="rounded-full bg-soft-accent px-3 py-1 font-medium text-anchor">
                Audience age {effectiveAudienceAge}
              </span>
            </div>
          ) : null}

          <form
            onSubmit={handleGenerate}
            className={`mt-6 space-y-5 ${createPanelCollapsed ? "hidden" : ""}`}
          >
            <fieldset disabled={generating} className="space-y-5 disabled:opacity-75">
              <section className="rounded-2xl border border-soft-accent bg-white p-4 space-y-3 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-anchor/80">1. Story Spark</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sparkCards.map((spark) => (
                    <button
                      key={spark.id}
                      type="button"
                      onClick={() => setStorySpark(spark.id)}
                      className={`rounded-2xl border px-4 py-3 text-left ${
                        storySpark === spark.id
                          ? "border-primary bg-primary text-white"
                          : "border-soft-accent bg-white text-anchor"
                      }`}
                    >
                      <p className="text-sm font-semibold">{spark.name}</p>
                      <p
                        className={`mt-1 text-xs ${
                          storySpark === spark.id ? "text-white/85" : "text-anchor/70"
                        }`}
                      >
                        {spark.description}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-soft-accent bg-white p-4 space-y-3 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-anchor/80">2. Characters</h2>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                  {characterOptions.map((character) => {
                    const key = `${character.type}:${character.id}`;
                    const checked = selectedCharacterKeys.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleCharacter(key)}
                        className={`group relative overflow-hidden rounded-2xl border text-left transition ${
                          checked
                            ? "border-secondary ring-2 ring-secondary/35"
                            : "border-soft-accent hover:border-secondary/70"
                        }`}
                        aria-pressed={checked}
                      >
                        <div className="aspect-square w-full bg-soft-accent/40">
                          {character.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={character.avatarUrl}
                              alt={character.label}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-soft-accent text-2xl font-semibold text-anchor/70">
                              {initialsFromName(character.label)}
                            </div>
                          )}
                        </div>
                        <span className="pointer-events-none absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-sm shadow-sm ring-1 ring-soft-accent">
                          {checked ? "X" : "O"}
                        </span>
                        <div className="border-t border-soft-accent bg-white px-3 py-2">
                          <p className="truncate text-xs font-semibold text-anchor">{character.label}</p>
                          <p className="text-[11px] text-anchor/65 capitalize">{character.type}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <label htmlFor="custom-character" className="text-xs font-medium text-anchor/75">
                    Optional character
                  </label>
                  <input
                    id="custom-character"
                    value={customCharacterName}
                    onChange={(e) => setCustomCharacterName(e.target.value)}
                    placeholder="Optional custom character name"
                    className="w-full rounded-2xl border border-soft-accent bg-white px-4 py-3 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedCharacters.map((c) => (
                    <span
                      key={`${c.type}:${c.id}`}
                      className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-white"
                    >
                      {c.label}
                    </span>
                  ))}
                  {customCharacterName.trim() ? (
                    <span className="rounded-full bg-soft-accent px-3 py-1 text-xs font-medium text-anchor">
                      {customCharacterName.trim()} (custom)
                    </span>
                  ) : null}
                </div>

                {!hasSelectedKid ? (
                  <div className="space-y-2 rounded-2xl border border-soft-accent bg-soft-accent/25 p-3">
                    <label htmlFor="audience-age" className="text-xs font-medium text-anchor/75">
                      Audience age
                    </label>
                    <input
                      id="audience-age"
                      value={audienceAge}
                      onChange={(e) => setAudienceAge(e.target.value)}
                      inputMode="numeric"
                      placeholder="Age (e.g. 6)"
                      className="w-full rounded-2xl border border-soft-accent bg-white px-4 py-3 text-sm"
                    />
                    <p className="text-xs text-anchor/70">
                      Add a kid profile to auto-drive reading level from kid ages.
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-soft-accent bg-white p-4 space-y-3 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-anchor/80">3. Length</h2>
                <div className="grid gap-3 sm:grid-cols-4">
                  {(["5", "10", "20", "custom"] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setLengthChoice(choice)}
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        lengthChoice === choice
                          ? "border-primary bg-primary text-white"
                          : "border-soft-accent bg-white text-anchor"
                      }`}
                    >
                      {choice === "custom" ? "Custom" : `${choice} min`}
                    </button>
                  ))}
                </div>
                {lengthChoice === "custom" ? (
                  <input
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    inputMode="numeric"
                    placeholder="Custom minutes (1-60)"
                    className="w-full rounded-2xl border border-soft-accent bg-white px-4 py-3 text-sm"
                  />
                ) : null}
              </section>

              <section className="rounded-2xl border border-soft-accent bg-white p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-anchor/80">4. Set the stage</h2>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={handleSurpriseStageIdea}
                    disabled={stageIdeaLoading || generating}
                  >
                    {stageIdeaLoading ? "Thinking..." : "Surprise me!"}
                  </Button>
                </div>
                <textarea
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  rows={5}
                  placeholder="What's happening? Where are we? What do you want the kids to experience or learn?"
                  className="w-full rounded-2xl border border-soft-accent bg-white px-4 py-3 text-sm outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
                />
                {stageIdeaError ? <p className="text-xs text-rose-700">{stageIdeaError}</p> : null}
              </section>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={generating || !canGenerate}
                  variant="primary"
                  className="rounded-2xl px-5 py-3 disabled:opacity-50"
                >
                  {generating ? "Creating your story..." : "Make the story real!"}
                </Button>
              </div>
            </fieldset>
          </form>

          {generateState.error ? <p className="mt-4 text-sm text-rose-700">{generateState.error}</p> : null}
          {phase === "error" ? (
            <div className="mt-4">
              <Button
                type="button"
                onClick={() => {
                  reset();
                  setCreatePanelCollapsed(false);
                  setLoadingPanelCollapsed(false);
                  setGenerateState((prev) => ({ ...prev, error: null }));
                }}
                variant="ghost"
                className="rounded-2xl border border-soft-accent px-4 py-2"
              >
                Try again
              </Button>
            </div>
          ) : null}
        </div>

        {showProgressPanel ? (
          <div className="card-surface p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-anchor">
                  Creating your story
                </h2>
                <p className="mt-1 text-sm text-anchor/75">
                  {loadingPanelCollapsed
                    ? `Progress: ${Math.floor(progress)}%`
                    : "We are processing your story request now."}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setLoadingPanelCollapsed((prev) => !prev)}
                variant="ghost"
                className="px-3 py-2 text-xs"
              >
                {loadingPanelCollapsed ? "Expand details" : "Minimize"}
              </Button>
            </div>

            {loadingPanelCollapsed ? (
              <div className="mt-4 h-2 w-full rounded-full bg-soft-accent">
                <div
                  className={`h-2 rounded-full transition-[width] duration-200 ${
                    phase === "error" ? "bg-rose-500" : "bg-primary"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, progress)).toFixed(1)}%` }}
                />
              </div>
            ) : (
              <div className="mt-4">
                <StoryGenerationProgress
                  isRunning={generating}
                  phase={phase}
                  progress={progress}
                  error={progressError}
                />
              </div>
            )}
          </div>
        ) : null}

        {generateState.ok ? (
          <div className="story-surface p-6 space-y-4">
            <p className="text-xs uppercase tracking-wide text-anchor/65">Story Preview</p>
            <h2 className="text-2xl font-semibold tracking-tight text-anchor">
              {generateState.generatedTitle}
            </h2>
            {generateState.generatedBlurb ? (
              <p className="text-sm text-anchor/80">{generateState.generatedBlurb}</p>
            ) : null}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-soft-accent px-3 py-1 font-medium text-anchor capitalize">
                {storySpark}
              </span>
              <span className="rounded-full bg-soft-accent px-3 py-1 font-medium text-anchor">
                {currentLengthLabel}
              </span>
              {generateState.wordCount > 0 ? (
                <span className="rounded-full bg-soft-accent px-3 py-1 text-xs font-medium text-anchor">
                  {generateState.wordCount} words
                </span>
              ) : null}
              {generateState.sceneCount > 0 ? (
                <span className="rounded-full bg-soft-accent px-3 py-1 text-xs font-medium text-anchor">
                  {generateState.sceneCount} scenes
                </span>
              ) : null}
            </div>
            <StoryBookViewer
              title={generateState.generatedTitle}
              content={generateState.generatedContent}
              lengthMinutes={getLengthMinutes()}
              storyPages={previewPages}
            />

            {generateState.warnings.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-semibold">Generation warnings</p>
                <ul className="mt-1 list-disc pl-5">
                  {generateState.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <form action={saveStoryAction} className="pt-2">
              <input type="hidden" name="mode" value={mode} />
              <input type="hidden" name="guidedBeginning" value={guidedBeginning} />
              <input type="hidden" name="guidedMiddle" value={guidedMiddle} />
              <input type="hidden" name="guidedEnding" value={guidedEnding} />
              <input type="hidden" name="stage" value={stage} />
              <input type="hidden" name="tone" value={derivedTone} />
              <input type="hidden" name="audienceAge" value={String(effectiveAudienceAge)} />
              <input type="hidden" name="lengthChoice" value={lengthChoice} />
              <input type="hidden" name="customMinutes" value={customMinutes} />
              <input type="hidden" name="selectedCharactersJson" value={selectedCharactersJson} />
              <input type="hidden" name="customCharacterName" value={customCharacterName} />
              <input type="hidden" name="generatedTitle" value={generateState.generatedTitle} />
              <input type="hidden" name="spark" value={storySpark} />
              <input type="hidden" name="generationCostsJson" value={generateState.generationCostsJson} />
              <input type="hidden" name="generatedPagesJson" value={generateState.generatedPagesJson} />
              <input type="hidden" name="storyBibleJson" value={generateState.storyBibleJson} />
              <input type="hidden" name="beatSheetJson" value={generateState.beatSheetJson} />
              <input type="hidden" name="continuityLedgerJson" value={generateState.continuityLedgerJson} />
              <textarea
                name="generatedContent"
                defaultValue={generateState.generatedContent}
                className="hidden"
                readOnly
              />
              <button
                type="submit"
                className="rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-white transition hover:bg-primary-hover"
              >
                Save to library
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </main>
  );
}
