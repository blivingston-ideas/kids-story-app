"use client";

import { useMemo, useState } from "react";
import {
  normalizeProfileAppearance,
  parseCsvToStringArray,
  type ProfileAppearance,
} from "@/lib/schemas/profileAppearance";

type Props = {
  hiddenInputName?: string;
  fileInputName?: string;
  removePhotoInputName?: string;
  initialAppearance?: ProfileAppearance;
  existingPhotoUrl?: string | null;
};

const skinToneOptions = [
  "very_fair",
  "fair",
  "light",
  "light_medium",
  "medium",
  "medium_dark",
  "dark",
  "very_dark",
] as const;

const eyeColorOptions = ["brown", "hazel", "green", "blue", "grey"] as const;
const hairColorOptions = [
  "black",
  "dark_brown",
  "brown",
  "light_brown",
  "blonde",
  "red",
  "strawberry_blonde",
  "grey",
] as const;
const hairLengthOptions = ["buzz", "short", "medium", "long"] as const;
const hairTextureOptions = ["straight", "wavy", "curly", "coily"] as const;
function valueOrEmpty(value: string | null): string {
  return value ?? "";
}

export default function AppearanceFields({
  hiddenInputName = "profile_appearance_json",
  fileInputName = "profile_photo_file",
  removePhotoInputName = "remove_profile_photo",
  initialAppearance,
  existingPhotoUrl = null,
}: Props) {
  const initial = useMemo(
    () => normalizeProfileAppearance(initialAppearance ?? {}),
    [initialAppearance]
  );
  const [appearance, setAppearance] = useState<ProfileAppearance>(initial);
  const [distinctiveInput, setDistinctiveInput] = useState(
    (initial.distinctiveFeatures ?? []).join(", ")
  );
  const [mustKeepInput, setMustKeepInput] = useState((initial.mustKeep ?? []).join(", "));
  const [mustNotInput, setMustNotInput] = useState((initial.mustNot ?? []).join(", "));
  const [removePhoto, setRemovePhoto] = useState(false);

  const hiddenJson = useMemo(() => {
    const normalized = normalizeProfileAppearance({
      ...appearance,
      distinctiveFeatures: parseCsvToStringArray(distinctiveInput),
      mustKeep: parseCsvToStringArray(mustKeepInput),
      mustNot: parseCsvToStringArray(mustNotInput),
    });
    return JSON.stringify(normalized);
  }, [appearance, distinctiveInput, mustKeepInput, mustNotInput]);

  const summary = useMemo(() => {
    const bits = [
      appearance.skinTone ? `${appearance.skinTone.replaceAll("_", " ")} skin tone` : "",
      appearance.hairColor || appearance.hairLength || appearance.hairTexture
        ? [appearance.hairColor, appearance.hairLength, appearance.hairTexture]
            .filter(Boolean)
            .map((v) => (v ?? "").replaceAll("_", " "))
            .join(" ")
        : "",
      appearance.eyeColor ? `${appearance.eyeColor} eyes` : "",
      appearance.freckles ? "freckles" : "",
      appearance.glasses ? "glasses" : "",
    ].filter(Boolean);
    if (bits.length === 0) return "Add appearance info to improve illustration consistency.";
    return bits.join(", ");
  }, [appearance]);

  const selectClass =
    "w-full rounded-xl border border-soft-accent bg-white px-3 py-2 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70";

  return (
    <section className="rounded-2xl border border-soft-accent bg-white p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-anchor">Appearance (for illustrations)</h3>
        <p className="mt-1 text-xs text-anchor/70">
          This helps keep your child&apos;s character consistent across story illustrations. You can do either or both.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor={fileInputName} className="text-xs font-medium text-anchor/80">
            Upload photo
          </label>
          {existingPhotoUrl && !removePhoto ? (
            <div className="relative h-24 w-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={existingPhotoUrl}
                alt="Current profile"
                className="h-24 w-24 rounded-xl border border-soft-accent object-cover"
              />
              <button
                type="button"
                aria-label="Remove current photo"
                onClick={() => setRemovePhoto(true)}
                className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-semibold text-rose-600 shadow ring-1 ring-soft-accent transition hover:bg-rose-50"
              >
                x
              </button>
            </div>
          ) : null}
          {existingPhotoUrl && removePhoto ? (
            <div className="inline-flex items-center rounded-xl border border-dashed border-soft-accent px-3 py-2 text-xs text-anchor/70">
              Photo removed
            </div>
          ) : null}
          <input
            id={fileInputName}
            name={fileInputName}
            type="file"
            accept="image/*"
            className="block w-full rounded-xl border border-soft-accent bg-white px-3 py-2 text-sm text-anchor file:mr-4 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-secondary-hover"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-anchor/80">Describe appearance</p>
          <div className="grid gap-2 grid-cols-2">
            <input
              inputMode="numeric"
              placeholder="Age approx"
              value={appearance.ageApprox ?? ""}
              onChange={(e) =>
                setAppearance((prev) => ({
                  ...prev,
                  ageApprox: e.target.value ? Number(e.target.value) : null,
                }))
              }
              className={selectClass}
            />
            <select
              value={valueOrEmpty(appearance.genderPresentation)}
              onChange={(e) =>
                setAppearance((prev) => ({
                  ...prev,
                  genderPresentation: (e.target.value || null) as ProfileAppearance["genderPresentation"],
                }))
              }
              className={selectClass}
            >
              <option value="">Gender</option>
              <option value="boy">boy</option>
              <option value="girl">girl</option>
            </select>
          </div>
          <div className="grid gap-2 grid-cols-1">
            <select
              value={valueOrEmpty(appearance.skinTone)}
              onChange={(e) =>
                setAppearance((prev) => ({ ...prev, skinTone: (e.target.value || null) as ProfileAppearance["skinTone"] }))
              }
              className={selectClass}
            >
              <option value="">Skin tone</option>
              {skinToneOptions.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 grid-cols-1">
            <select
              value={valueOrEmpty(appearance.eyeColor)}
              onChange={(e) =>
                setAppearance((prev) => ({ ...prev, eyeColor: (e.target.value || null) as ProfileAppearance["eyeColor"] }))
              }
              className={selectClass}
            >
              <option value="">Eye color</option>
              {eyeColorOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 grid-cols-3">
            <select
              value={valueOrEmpty(appearance.hairColor)}
              onChange={(e) =>
                setAppearance((prev) => ({ ...prev, hairColor: (e.target.value || null) as ProfileAppearance["hairColor"] }))
              }
              className={selectClass}
            >
              <option value="">Hair color</option>
              {hairColorOptions.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              value={valueOrEmpty(appearance.hairLength)}
              onChange={(e) =>
                setAppearance((prev) => ({ ...prev, hairLength: (e.target.value || null) as ProfileAppearance["hairLength"] }))
              }
              className={selectClass}
            >
              <option value="">Hair length</option>
              {hairLengthOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={valueOrEmpty(appearance.hairTexture)}
              onChange={(e) =>
                setAppearance((prev) => ({
                  ...prev,
                  hairTexture: (e.target.value || null) as ProfileAppearance["hairTexture"],
                }))
              }
              className={selectClass}
            >
              <option value="">Hair texture</option>
              {hairTextureOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <input
            value={appearance.hairStyle ?? ""}
            onChange={(e) => setAppearance((prev) => ({ ...prev, hairStyle: e.target.value || null }))}
            placeholder="Hair style (e.g. side part, ponytail)"
            className={selectClass}
          />
          <div className="grid gap-2 grid-cols-1">
            <input
              value={distinctiveInput}
              onChange={(e) => setDistinctiveInput(e.target.value)}
              placeholder="Distinctive features (comma-separated)"
              className={selectClass}
            />
          </div>
          <div className="grid gap-2 grid-cols-2">
            <label className="inline-flex items-center gap-2 rounded-xl border border-soft-accent px-3 py-2 text-xs text-anchor">
              <input
                type="checkbox"
                checked={appearance.freckles === true}
                onChange={(e) =>
                  setAppearance((prev) => ({ ...prev, freckles: e.target.checked ? true : null }))
                }
              />
              Freckles
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border border-soft-accent px-3 py-2 text-xs text-anchor">
              <input
                type="checkbox"
                checked={appearance.glasses === true}
                onChange={(e) =>
                  setAppearance((prev) => ({ ...prev, glasses: e.target.checked ? true : null }))
                }
              />
              Glasses
            </label>
          </div>
          <input
            value={mustKeepInput}
            onChange={(e) => setMustKeepInput(e.target.value)}
            placeholder="Must keep traits (comma-separated)"
            className={selectClass}
          />
          <input
            value={mustNotInput}
            onChange={(e) => setMustNotInput(e.target.value)}
            placeholder="Must not traits (comma-separated)"
            className={selectClass}
          />
        </div>
      </div>

      <div className="rounded-xl bg-soft-accent/40 px-3 py-2 text-xs text-anchor">
        {summary}
      </div>

      <input type="hidden" name={hiddenInputName} value={hiddenJson} />
      <input type="hidden" name={removePhotoInputName} value={removePhoto ? "1" : "0"} />
    </section>
  );
}
