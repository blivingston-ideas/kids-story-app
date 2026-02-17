"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteStoryById } from "@/lib/api/stories";
import Button from "@/components/button";

type StoryItem = {
  id: string;
  title: string;
  created_at: string;
  tone: string;
  length_minutes: number;
  characterSummary: string;
  canDelete: boolean;
};

type Props = {
  stories: StoryItem[];
  isParent: boolean;
};

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function formatDate(dateIso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateIso));
}

function StoryRowSkeleton() {
  return (
    <div className="card-surface p-6">
      <div className="h-5 w-48 animate-pulse rounded bg-soft-accent" />
      <div className="mt-3 h-4 w-36 animate-pulse rounded bg-soft-accent" />
      <div className="mt-4 h-4 w-64 animate-pulse rounded bg-soft-accent" />
    </div>
  );
}

export default function LibraryClient({ stories: initialStories, isParent }: Props) {
  const router = useRouter();
  const [stories, setStories] = useState<StoryItem[]>(initialStories);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const isSearching = query.trim().toLowerCase() !== debouncedQuery;

  const filteredStories = useMemo(() => {
    if (!debouncedQuery) return stories;
    return stories.filter((story) => {
      const lengthLabel = `${story.length_minutes} min`;
      const haystack = [
        story.title,
        story.characterSummary,
        story.tone,
        lengthLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(debouncedQuery);
    });
  }, [stories, debouncedQuery]);

  async function onDeleteStory(storyId: string) {
    const confirmed = window.confirm("Delete this story?");
    if (!confirmed) return;

    setDeletingId(storyId);
    setError(null);
    setSuccess(null);

    try {
      await deleteStoryById(storyId);
      setStories((prev) => prev.filter((s) => s.id !== storyId));
      setSuccess("Story deleted.");
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete story");
    } finally {
      setDeletingId(null);
    }
  }

  function onSurpriseMe() {
    if (stories.length === 0) {
      router.push("/create");
      return;
    }
    const random = stories[Math.floor(Math.random() * stories.length)];
    router.push(`/story/${random.id}`);
  }

  return (
    <main className="min-h-screen bg-app-bg text-anchor">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <section className="card-surface p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <h1 className="text-3xl font-semibold tracking-tight text-anchor">Library</h1>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/create"
                className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-primary-hover"
              >
                Create story
              </Link>
              <Link
                href={isParent ? "/profiles/new" : "/profiles"}
                className="rounded-xl bg-secondary px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-secondary-hover"
              >
                Add profile
              </Link>
              <Button type="button" variant="secondary" onClick={onSurpriseMe} className="px-4 py-3">
                Surprise me
              </Button>
            </div>
          </div>
        </section>

        <section className="card-surface p-8">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stories..."
            className="w-full rounded-xl border border-soft-accent bg-white px-4 py-3 text-sm text-anchor outline-none transition focus:border-secondary focus:ring-4 focus:ring-soft-accent/70"
          />

          {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
          {success ? <p className="mt-4 text-sm text-secondary">{success}</p> : null}

          <div className="mt-6 grid gap-4">
            {isSearching ? (
              <>
                <StoryRowSkeleton />
                <StoryRowSkeleton />
                <StoryRowSkeleton />
              </>
            ) : filteredStories.length === 0 ? (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
                <p className="text-sm text-anchor/75">No stories match your search.</p>
              </div>
            ) : (
              filteredStories.map((story) => (
                <div
                  key={story.id}
                  className="story-surface p-6"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <Link
                        href={`/story/${story.id}`}
                        className="block truncate text-xl font-semibold text-anchor hover:text-primary"
                      >
                        {story.title}
                      </Link>
                      <p className="mt-2 text-sm text-anchor/65">
                        {formatDate(story.created_at)}
                      </p>
                    </div>

                    <div className="flex items-start gap-3 md:ml-6">
                      <div className="max-w-sm space-y-1 text-right text-xs text-anchor/80">
                        <p className="truncate">
                          <span className="font-medium text-anchor">Characters:</span>{" "}
                          {story.characterSummary}
                        </p>
                        <p>
                          <span className="font-medium text-anchor">Mood:</span> {story.tone}
                        </p>
                        <p>
                          <span className="font-medium text-anchor">Length:</span>{" "}
                          {story.length_minutes} min
                        </p>
                      </div>

                      {story.canDelete ? (
                        <button
                          type="button"
                          onClick={() => onDeleteStory(story.id)}
                          disabled={deletingId === story.id}
                          aria-label="Delete story"
                          className="mt-0.5 rounded-md p-2 text-anchor/60 transition hover:text-rose-600 disabled:opacity-50"
                        >
                          <TrashIcon />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
