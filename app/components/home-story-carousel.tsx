"use client";

import Link from "next/link";
import { useRef } from "react";
import Button from "@/components/button";

type StoryCard = {
  id: string;
  title: string;
  created_at: string;
  tone: string;
  length_minutes: number;
};

type Props = {
  stories: StoryCard[];
};

function formatDate(dateIso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateIso));
}

export default function HomeStoryCarousel({ stories }: Props) {
  const railRef = useRef<HTMLDivElement | null>(null);

  function scrollBy(delta: number) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: delta, behavior: "smooth" });
  }

  if (stories.length === 0) {
    return (
      <div className="rounded-2xl bg-soft-accent p-4 text-sm text-anchor/80">
        No stories yet. Create your first family story.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => scrollBy(-320)} className="px-3 py-1 text-xs">
          Prev
        </Button>
        <Button type="button" variant="ghost" onClick={() => scrollBy(320)} className="px-3 py-1 text-xs">
          Next
        </Button>
      </div>

      <div
        ref={railRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {stories.map((story) => (
          <Link
            key={story.id}
            href={`/story/${story.id}`}
            className="story-surface min-w-[280px] snap-start p-4 transition hover:translate-y-[-2px]"
          >
            <p className="line-clamp-2 text-base font-semibold text-anchor">{story.title}</p>
            <p className="mt-2 text-xs text-anchor/70">{formatDate(story.created_at)}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-soft-accent px-2 py-1 font-medium text-anchor capitalize">
                {story.tone}
              </span>
              <span className="rounded-full bg-soft-accent px-2 py-1 font-medium text-anchor">
                {story.length_minutes} min
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
