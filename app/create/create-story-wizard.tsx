"use client";

import { useActionState, useMemo, useState } from "react";
import {
  generateStoryAction,
  saveStoryAction,
  type GenerateState,
} from "@/app/create/actions";

type CharacterOption = {
  id: string;
  type: "kid" | "adult";
  label: string;
};

type Props = {
  characterOptions: CharacterOption[];
};

export default function CreateStoryWizard({ characterOptions }: Props) {
  const initialGenerateState: GenerateState = {
    ok: false,
    error: null,
    generatedTitle: "",
    generatedContent: "",
  };

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"surprise" | "guided">("surprise");
  const [guidedBeginning, setGuidedBeginning] = useState("");
  const [guidedMiddle, setGuidedMiddle] = useState("");
  const [guidedEnding, setGuidedEnding] = useState("");
  const [tone, setTone] = useState<"calm" | "silly" | "adventurous">("calm");
  const [lengthChoice, setLengthChoice] = useState<"5" | "10" | "20" | "custom">("10");
  const [customMinutes, setCustomMinutes] = useState("15");
  const [customCharacterName, setCustomCharacterName] = useState("");
  const [selectedCharacterKeys, setSelectedCharacterKeys] = useState<string[]>([]);

  const [generateState, generateFormAction, generating] = useActionState<GenerateState, FormData>(
    generateStoryAction,
    initialGenerateState
  );

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

  const canAdvanceFromStep1 =
    mode === "surprise" || (guidedBeginning.trim() && guidedMiddle.trim() && guidedEnding.trim());
  const canAdvanceFromStep2 = selectedCharacters.length > 0 || customCharacterName.trim().length > 0;
  const canAdvanceFromStep3 =
    lengthChoice !== "custom" ||
    (customMinutes.trim().length > 0 && Number(customMinutes) >= 1 && Number(customMinutes) <= 120);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Create Story</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Build your story in steps, generate it, then save it to your library.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  step === n ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
                }`}
              >
                Step {n}
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-6">
            {step === 1 ? (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Mode</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setMode("surprise")}
                    className={`rounded-2xl border px-4 py-3 text-left ${
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
                    className={`rounded-2xl border px-4 py-3 text-left ${
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
                      placeholder="Beginning beat"
                      className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                    />
                    <input
                      value={guidedMiddle}
                      onChange={(e) => setGuidedMiddle(e.target.value)}
                      placeholder="Middle beat"
                      className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                    />
                    <input
                      value={guidedEnding}
                      onChange={(e) => setGuidedEnding(e.target.value)}
                      placeholder="Ending beat"
                      className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                    />
                  </div>
                ) : null}
              </section>
            ) : null}

            {step === 2 ? (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Characters</h2>
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
                          {character.label}{" "}
                          <span className="text-neutral-500">({character.type})</span>
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
                  className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                />
              </section>
            ) : null}

            {step === 3 ? (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Length</h2>
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
                    placeholder="Custom minutes (1-120)"
                    className="w-full rounded-2xl border border-neutral-300 px-4 py-3 text-sm"
                  />
                ) : null}
              </section>
            ) : null}

            {step === 4 ? (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Tone</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["calm", "silly", "adventurous"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTone(t)}
                      className={`rounded-2xl border px-4 py-3 text-sm capitalize ${
                        tone === t
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 bg-white text-neutral-900"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {step === 5 ? (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900">Generate</h2>

                <form action={generateFormAction} className="space-y-3">
                  <input type="hidden" name="mode" value={mode} />
                  <input type="hidden" name="guidedBeginning" value={guidedBeginning} />
                  <input type="hidden" name="guidedMiddle" value={guidedMiddle} />
                  <input type="hidden" name="guidedEnding" value={guidedEnding} />
                  <input type="hidden" name="tone" value={tone} />
                  <input type="hidden" name="lengthChoice" value={lengthChoice} />
                  <input type="hidden" name="customMinutes" value={customMinutes} />
                  <input type="hidden" name="selectedCharactersJson" value={selectedCharactersJson} />
                  <input type="hidden" name="customCharacterName" value={customCharacterName} />
                  <button
                    type="submit"
                    disabled={generating}
                    className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-60"
                  >
                    {generating ? "Generating..." : "Generate story"}
                  </button>
                </form>

                {generateState.error ? (
                  <p className="text-sm text-rose-700">{generateState.error}</p>
                ) : null}

                {generateState.ok ? (
                  <div className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <h3 className="text-lg font-semibold text-neutral-900">{generateState.generatedTitle}</h3>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">
                      {generateState.generatedContent}
                    </p>

                    <form action={saveStoryAction}>
                      <input type="hidden" name="mode" value={mode} />
                      <input type="hidden" name="guidedBeginning" value={guidedBeginning} />
                      <input type="hidden" name="guidedMiddle" value={guidedMiddle} />
                      <input type="hidden" name="guidedEnding" value={guidedEnding} />
                      <input type="hidden" name="tone" value={tone} />
                      <input type="hidden" name="lengthChoice" value={lengthChoice} />
                      <input type="hidden" name="customMinutes" value={customMinutes} />
                      <input type="hidden" name="selectedCharactersJson" value={selectedCharactersJson} />
                      <input type="hidden" name="customCharacterName" value={customCharacterName} />
                      <input type="hidden" name="generatedTitle" value={generateState.generatedTitle} />
                      <textarea
                        name="generatedContent"
                        defaultValue={generateState.generatedContent}
                        className="hidden"
                        readOnly
                      />
                      <button
                        type="submit"
                        className="mt-3 rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
                      >
                        Save story
                      </button>
                    </form>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-sm transition hover:bg-neutral-50 disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              disabled={
                step === 5 ||
                (step === 1 && !canAdvanceFromStep1) ||
                (step === 2 && !canAdvanceFromStep2) ||
                (step === 3 && !canAdvanceFromStep3)
              }
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
