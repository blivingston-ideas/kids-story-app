"use client";

import { useMemo, useState } from "react";
import Button from "@/components/button";

type Props = {
  action: (formData: FormData) => Promise<void>;
};

type ProfileType = "kid" | "adult" | "grandparent" | "aunt_uncle" | "cousin";

function toCsv(items: string[]): string {
  return items.join(", ");
}

function sanitizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function addUnique(list: string[], raw: string): string[] {
  const next = sanitizeTag(raw);
  if (!next) return list;
  if (list.some((item) => item.toLowerCase() === next.toLowerCase())) return list;
  return [...list, next];
}

function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => sanitizeTag(item))
    .filter(Boolean);
}

export default function ProfileCreateForm({ action }: Props) {
  const [profileType, setProfileType] = useState<ProfileType>("kid");
  const [name, setName] = useState("");
  const [age, setAge] = useState("6");

  const [themeInput, setThemeInput] = useState("");
  const [themes, setThemes] = useState<string[]>([]);

  const [bookTitleInput, setBookTitleInput] = useState("");
  const [bookLinkInput, setBookLinkInput] = useState("");
  const [books, setBooks] = useState<string[]>([]);

  const [traitInput, setTraitInput] = useState("");
  const [traits, setTraits] = useState<string[]>([]);

  const [catchInput, setCatchInput] = useState("");
  const [catchPhrases, setCatchPhrases] = useState<string[]>([]);

  const isKid = profileType === "kid";

  const ageOptions = useMemo(
    () => Array.from({ length: 101 }).map((_, i) => i.toString()),
    []
  );

  function onTagKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    inputValue: string,
    setter: (value: string) => void,
    listSetter: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const chunks = parseList(inputValue);
    if (chunks.length === 0) return;
    listSetter((prev) => {
      let next = prev;
      for (const chunk of chunks) next = addUnique(next, chunk);
      return next;
    });
    setter("");
  }

  function removeAt(index: number, listSetter: React.Dispatch<React.SetStateAction<string[]>>) {
    listSetter((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={action} className="space-y-6 p-6">
      <div className="space-y-2">
        <label htmlFor="profile_type" className="text-sm font-medium text-anchor">
          Profile Type
        </label>
        <select
          id="profile_type"
          name="profile_type"
          value={profileType}
          onChange={(e) => setProfileType(e.target.value as ProfileType)}
          className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
        >
          <option value="kid">Kid</option>
          <option value="adult">Adult</option>
          <option value="grandparent">Grandparent</option>
          <option value="aunt_uncle">Aunt/Uncle</option>
          <option value="cousin">Cousin</option>
        </select>
      </div>

      <div className={`grid gap-4 ${isKid ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium text-anchor">
            Name
          </label>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. William"
            className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
            required
          />
        </div>

        {isKid ? (
          <div className="space-y-2">
            <label htmlFor="age" className="text-sm font-medium text-anchor">
              Age
            </label>
            <select
              id="age"
              name="age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
            >
              {ageOptions.map((optionAge) => (
                <option key={optionAge} value={optionAge}>
                  {optionAge}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="theme_input" className="text-sm font-medium text-anchor">
          Themes
        </label>
        <input
          id="theme_input"
          value={themeInput}
          onChange={(e) => setThemeInput(e.target.value)}
          onKeyDown={(e) => onTagKeyDown(e, themeInput, setThemeInput, setThemes)}
          placeholder="Type a theme then hit Enter or comma"
          className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
        />
        <div className="flex flex-wrap gap-2">
          {themes.map((theme, i) => (
            <button
              key={`${theme}-${i}`}
              type="button"
              onClick={() => removeAt(i, setThemes)}
              className="rounded-full bg-soft-accent px-3 py-1 text-xs font-medium text-anchor"
            >
              {theme} ×
            </button>
          ))}
        </div>
        <input type="hidden" name="themes" value={toCsv(themes)} />
      </div>

      {isKid ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-anchor">Books we like</label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={bookTitleInput}
              onChange={(e) => setBookTitleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== ",") return;
                e.preventDefault();
                setBooks((prev) => addUnique(prev, bookTitleInput));
                setBookTitleInput("");
              }}
              placeholder="Add a book title"
              className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setBooks((prev) => addUnique(prev, bookTitleInput));
                setBookTitleInput("");
              }}
              className="py-3"
            >
              Add title
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={bookLinkInput}
              onChange={(e) => setBookLinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== ",") return;
                e.preventDefault();
                setBooks((prev) => addUnique(prev, bookLinkInput));
                setBookLinkInput("");
              }}
              placeholder="Add a book link"
              className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setBooks((prev) => addUnique(prev, bookLinkInput));
                setBookLinkInput("");
              }}
              className="py-3"
            >
              Add link
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {books.map((book, i) => (
              <button
                key={`${book}-${i}`}
                type="button"
                onClick={() => removeAt(i, setBooks)}
                className="rounded-full bg-soft-accent px-3 py-1 text-xs font-medium text-anchor"
              >
                {book} ×
              </button>
            ))}
          </div>
          <input type="hidden" name="books_we_like" value={toCsv(books)} />
        </div>
      ) : (
        <input type="hidden" name="books_we_like" value="" />
      )}

      <div className="space-y-2">
        <label htmlFor="trait_input" className="text-sm font-medium text-anchor">
          Character traits
        </label>
        <input
          id="trait_input"
          value={traitInput}
          onChange={(e) => setTraitInput(e.target.value)}
          onKeyDown={(e) => onTagKeyDown(e, traitInput, setTraitInput, setTraits)}
          placeholder="Type a trait then hit Enter or comma"
          className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
        />
        <div className="flex flex-wrap gap-2">
          {traits.map((trait, i) => (
            <button
              key={`${trait}-${i}`}
              type="button"
              onClick={() => removeAt(i, setTraits)}
              className="rounded-full bg-soft-accent px-3 py-1 text-xs font-medium text-anchor"
            >
              {trait} ×
            </button>
          ))}
        </div>
        <input type="hidden" name="character_traits" value={toCsv(traits)} />
      </div>

      <div className="space-y-2">
        <label htmlFor="catch_input" className="text-sm font-medium text-anchor">
          Catch phrases
        </label>
        <input
          id="catch_input"
          value={catchInput}
          onChange={(e) => setCatchInput(e.target.value)}
          onKeyDown={(e) => onTagKeyDown(e, catchInput, setCatchInput, setCatchPhrases)}
          placeholder="Type a catch phrase then hit Enter or comma"
          className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
        />
        <div className="flex flex-wrap gap-2">
          {catchPhrases.map((phrase, i) => (
            <button
              key={`${phrase}-${i}`}
              type="button"
              onClick={() => removeAt(i, setCatchPhrases)}
              className="rounded-full bg-soft-accent px-3 py-1 text-xs font-medium text-anchor"
            >
              {phrase} ×
            </button>
          ))}
        </div>
        <input type="hidden" name="catch_phrases" value={toCsv(catchPhrases)} />
      </div>

      <div className="space-y-2">
        <label htmlFor="avatar_file" className="text-sm font-medium text-anchor">
          Profile picture
        </label>
        <input
          id="avatar_file"
          name="avatar_file"
          type="file"
          accept="image/*"
          className="block w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor file:mr-4 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-secondary-hover"
        />
        <p className="text-xs text-anchor/65">Optional. Max size 1MB.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="submit" variant="primary" className="rounded-2xl px-5 py-3">
          Create profile
        </Button>
      </div>
    </form>
  );
}
