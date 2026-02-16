"use client";

import { useMemo, useState } from "react";
import { saveStoryAction } from "@/app/create/actions";

type CharacterOption = {
  id: string;
  type: "kid" | "adult";
  label: string;
};

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
};

export default function CreateStoryWizard({ universeId, characterOptions }: Props) {
  const [mode, setMode] = useState<"surprise" | "guided">("surprise");
  const [guidedBeginning, setGuidedBeginning] = useState("");
  const [guidedMiddle, setGuidedMiddle] = useState("");
  const [guidedEnding, setGuidedEnding] = useState("");
  const [tone, setTone] = useState<"calm" | "silly" | "adventurous">("calm");
  const [lengthChoice, setLengthChoice] = useState<"5" | "10" | "20" | "custom">("10");
  const [customMinutes, setCustomMinutes] = useState("15");
  const [customCharacterName, setCustomCharacterName] = useState("");
  const [stage, setStage] = useState("");
  const [selectedCharacterKeys, setSelectedCharacterKeys] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

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
  });

  const selectedCharacters = useMemo(
    () =>
      characterOptions
        .filter((c) => selectedCharacterKeys.includes(`${c.type}:${c.id}`))
        .map((c) => ({ type: c.type, id: c.id, label: c.label })),
    [characterOptions, selectedCharacterKeys]
  );

  const selectedCharactersJson = JSON.stringify(selectedCharacters);

  function toggleCharacter(key: string) {
    setSelectedCharacterKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
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
          tone,
          lengthMinutes: getLengthMinutes(),
          surpriseVsGuided: mode,
          optionalPrompt,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        title?: string;
        storyText?: string;
        warnings?: string[];
        wordCount?: number;
        sceneCount?: number;
      };

      if (!response.ok || !payload.ok || !payload.title || !payload.storyText) {
        throw new Error(payload.error ?? "Failed to generate story.");
      }

      setGenerateState({
        ok: true,
        error: null,
        generatedTitle: payload.title,
        generatedContent: payload.storyText,
        generatedBlurb: "A fresh story generated from your universe context.",
        readingTimeEstimate: getLengthMinutes(),
        spark: "",
        warnings: payload.warnings ?? [],
        wordCount: payload.wordCount ?? 0,
        sceneCount: payload.sceneCount ?? 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate story.";
      setGenerateState((prev) => ({ ...prev, ok: false, error: message }));
    } finally {
      setGenerating(false);
    }
  }

  const customMinutesValid =
    lengthChoice !== "custom" ||
    (customMinutes.trim().length > 0 && Number(customMinutes) >= 1 && Number(customMinutes) <= 60);

  const canGenerate =
    customMinutesValid && (selectedCharacters.length > 0 || customCharacterName.trim().length > 0);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Create Story</h1>
          <p className="mt-2 text-sm text-neutral-600">Shape your story, then make it real.</p>

          <form onSubmit={handleGenerate} className="mt-6 space-y-5">
            <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">1. Mode</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode("surprise")}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm ${
                    mode === "surprise"
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 bg-white text-neutral-900"
                  }`}
                >
                  Surprise
                </button>
                <button
                  type="button"
                  onClick={() => setMode("guided")}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm ${
                    mode === "guided"
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 bg-white text-neutral-900"
                  }`}
                >
                  Guided
                </button>
              </div>
              {mode === "guided" ? (
                <div className="grid gap-3">
                  <input
                    value={guidedBeginning}
                    onChange={(e) => setGuidedBeginning(e.target.value)}
                    placeholder="Beginning beat (optional)"
                    className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                  />
                  <input
                    value={guidedMiddle}
                    onChange={(e) => setGuidedMiddle(e.target.value)}
                    placeholder="Middle beat (optional)"
                    className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                  />
                  <input
                    value={guidedEnding}
                    onChange={(e) => setGuidedEnding(e.target.value)}
                    placeholder="End beat (optional)"
                    className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                  />
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">2. Characters</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {characterOptions.map((character) => {
                  const key = `${character.type}:${character.id}`;
                  const checked = selectedCharacterKeys.includes(key);
                  return (
                    <label
                      key={key}
                      className="flex items-center justify-between rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm"
                    >
                      <span>
                        {character.label} <span className="text-neutral-500">({character.type})</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCharacter(key)}
                        className="h-4 w-4"
                      />
                    </label>
                  );
                })}
              </div>
              <input
                value={customCharacterName}
                onChange={(e) => setCustomCharacterName(e.target.value)}
                placeholder="Optional custom character name"
                className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {selectedCharacters.map((c) => (
                  <span
                    key={`${c.type}:${c.id}`}
                    className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
                  >
                    {c.label}
                  </span>
                ))}
                {customCharacterName.trim() ? (
                  <span className="rounded-full bg-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800">
                    {customCharacterName.trim()} (custom)
                  </span>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">3. Length</h2>
              <div className="grid gap-3 sm:grid-cols-4">
                {(["5", "10", "20", "custom"] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setLengthChoice(choice)}
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      lengthChoice === choice
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white text-neutral-900"
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
                  className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm"
                />
              ) : null}
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">4. Tone</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  { id: "calm", label: "Calm bedtime" },
                  { id: "silly", label: "Silly" },
                  { id: "adventurous", label: "Adventurous" },
                ] as const).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTone(t.id)}
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      tone === t.id
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white text-neutral-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">5. Set the stage</h2>
              <textarea
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                rows={5}
                placeholder="What’s happening? Where are we? What do you want the kids to experience or learn?"
                className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/10"
              />
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={generating || !canGenerate}
                className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {generating ? "Making magic..." : "Make the story real!"}
              </button>
            </div>
          </form>

          {generateState.error ? <p className="mt-4 text-sm text-rose-700">{generateState.error}</p> : null}
        </div>

        {generateState.ok ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Story Preview</p>
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
              {generateState.generatedTitle}
            </h2>
            {generateState.generatedBlurb ? (
              <p className="text-sm text-neutral-600">{generateState.generatedBlurb}</p>
            ) : null}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-700 capitalize">
                {tone}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-700">
                {lengthChoice === "custom" ? `${customMinutes} min` : `${lengthChoice} min`}
              </span>
              {generateState.wordCount > 0 ? (
                <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-700">
                  {generateState.wordCount} words
                </span>
              ) : null}
              {generateState.sceneCount > 0 ? (
                <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-700">
                  {generateState.sceneCount} scenes
                </span>
              ) : null}
            </div>
            <article className="whitespace-pre-wrap leading-8 text-neutral-800">
              {generateState.generatedContent}
            </article>

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
              <input type="hidden" name="tone" value={tone} />
              <input type="hidden" name="lengthChoice" value={lengthChoice} />
              <input type="hidden" name="customMinutes" value={customMinutes} />
              <input type="hidden" name="selectedCharactersJson" value={selectedCharactersJson} />
              <input type="hidden" name="customCharacterName" value={customCharacterName} />
              <input type="hidden" name="generatedTitle" value={generateState.generatedTitle} />
              <input type="hidden" name="spark" value={generateState.spark} />
              <textarea
                name="generatedContent"
                defaultValue={generateState.generatedContent}
                className="hidden"
                readOnly
              />
              <button
                type="submit"
                className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
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
