"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/button";
import { buildStoryPageTexts } from "@/lib/story/pages";

type ContentPage = {
  pageIndex: number;
  text: string;
  imageStatus: "pending" | "not_started" | "generating" | "ready" | "failed";
  imageUrl: string | null;
  imageError: string | null;
};

type Page = {
  type: "cover" | "content";
  text: string;
  contentPage?: ContentPage;
};

type Props = {
  title: string;
  content: string;
  lengthMinutes: number;
  storyId?: string;
  canManageIllustrations?: boolean;
  storyPages?: ContentPage[];
  coverImageUrl?: string | null;
};

function buildPages(
  title: string,
  content: string,
  lengthMinutes: number,
  storyPages?: ContentPage[]
): Page[] {
  const pages: Page[] = [{ type: "cover", text: title }];
  const contentPages =
    storyPages && storyPages.length > 0
      ? storyPages
      : buildStoryPageTexts(content, lengthMinutes).map((p) => ({
          pageIndex: p.pageIndex,
          text: p.text,
          imageStatus: "pending" as const,
          imageUrl: null,
          imageError: null,
        }));

  for (const page of contentPages) {
    pages.push({ type: "content", text: page.text, contentPage: page });
  }
  return pages;
}

export default function StoryBookViewer({
  title,
  content,
  lengthMinutes,
  storyId,
  canManageIllustrations = false,
  storyPages,
  coverImageUrl = null,
}: Props) {
  const [liveStoryPages, setLiveStoryPages] = useState<ContentPage[] | undefined>(storyPages);
  useEffect(() => {
    setLiveStoryPages(storyPages);
  }, [storyPages]);

  const pages = useMemo(
    () => buildPages(title, content, lengthMinutes, liveStoryPages),
    [title, content, lengthMinutes, liveStoryPages]
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isRegeneratingCurrent, setIsRegeneratingCurrent] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const current = pages[pageIndex];
  const atStart = pageIndex <= 0;
  const atEnd = pageIndex >= pages.length - 1;

  const contentPages = pages
    .filter((p): p is Page & { contentPage: ContentPage } => p.type === "content" && Boolean(p.contentPage))
    .map((p) => p.contentPage);
  const readyCount = contentPages.filter((p) => p.imageStatus === "ready").length;
  const generatingCount = contentPages.filter((p) => p.imageStatus === "generating").length;
  const totalCount = contentPages.length;

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPageIndex((prev) => Math.max(0, prev - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setPageIndex((prev) => Math.min(pages.length - 1, prev + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, pages.length]);

  useEffect(() => {
    if (!storyId || !canManageIllustrations || totalCount === 0) return;
    const hasPending = contentPages.some((p) => p.imageStatus === "pending" || p.imageStatus === "not_started");
    if (!hasPending) return;

    void handleGenerateAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, canManageIllustrations, totalCount]);

  useEffect(() => {
    if (!storyId || totalCount === 0) return;
    const hasWork = contentPages.some((p) => p.imageStatus === "pending" || p.imageStatus === "not_started" || p.imageStatus === "generating");
    if (!hasWork) return;

    const interval = setInterval(() => {
      void (async () => {
        const response = await fetch(`/api/stories/${storyId}/pages`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          ok?: boolean;
          pages?: Array<{
            pageIndex: number;
            text: string;
            imageStatus: "pending" | "not_started" | "generating" | "ready" | "failed";
            imageUrl: string | null;
            imageError: string | null;
          }>;
        };
        if (payload.ok && Array.isArray(payload.pages)) {
          setLiveStoryPages(payload.pages);
        }
      })();
    }, 2500);
    return () => clearInterval(interval);
  }, [storyId, totalCount, contentPages]);

  const panelHeight = isFullscreen
    ? "min-h-[68vh] sm:min-h-[74vh]"
    : "min-h-[320px] sm:min-h-[420px] lg:min-h-[56vh]";

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else if (document.fullscreenElement === containerRef.current) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen API failures.
    }
  };

  async function handleGenerateAll(): Promise<void> {
    if (!storyId || isGeneratingAll) return;
    setActionError(null);
    setIsGeneratingAll(true);
    try {
      const response = await fetch(`/api/stories/${storyId}/illustrations/generate`, { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to start illustration generation.");
      }
      const pagesResponse = await fetch(`/api/stories/${storyId}/pages`, { cache: "no-store" });
      if (pagesResponse.ok) {
        const payload = (await pagesResponse.json()) as {
          ok?: boolean;
          pages?: ContentPage[];
        };
        if (payload.ok && payload.pages) setLiveStoryPages(payload.pages);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start illustration generation.";
      setActionError(message);
    } finally {
      setIsGeneratingAll(false);
    }
  }

  async function handleRegenerateCurrent(): Promise<void> {
    if (!storyId || current.type !== "content" || !current.contentPage || isRegeneratingCurrent) return;
    setActionError(null);
    setIsRegeneratingCurrent(true);
    try {
      const response = await fetch(
        `/api/stories/${storyId}/illustrations/${current.contentPage.pageIndex}`,
        { method: "POST" }
      );
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to regenerate page illustration.");
      }
      const pagesResponse = await fetch(`/api/stories/${storyId}/pages`, { cache: "no-store" });
      if (pagesResponse.ok) {
        const payload = (await pagesResponse.json()) as {
          ok?: boolean;
          pages?: ContentPage[];
        };
        if (payload.ok && payload.pages) setLiveStoryPages(payload.pages);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to regenerate page illustration.";
      setActionError(message);
    } finally {
      setIsRegeneratingCurrent(false);
    }
  }

  return (
    <section
      ref={containerRef}
      className={`story-surface p-4 sm:p-6 ${isFullscreen ? "h-full w-full overflow-auto rounded-none" : ""}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-anchor/80">
          {totalCount > 0 ? `Illustrations: ${readyCount}/${totalCount} complete` : "Illustrations unavailable"}
          {generatingCount > 0 ? ` (${generatingCount} generating)` : ""}
        </div>
        <div className="flex gap-2">
          {canManageIllustrations && storyId ? (
            <Button type="button" variant="secondary" className="px-3 py-2 text-xs" onClick={handleGenerateAll} disabled={isGeneratingAll}>
              {isGeneratingAll ? "Starting..." : "Generate all illustrations"}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="border border-soft-accent" onClick={toggleFullscreen}>
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </Button>
        </div>
      </div>

      {actionError ? <p className="mb-3 text-xs text-rose-700">{actionError}</p> : null}
      {generatingCount > 0 ? (
        <div className="mb-4 rounded-xl bg-soft-accent/60 px-3 py-2 text-xs text-anchor/85">
          Illustrations are being created ({readyCount}/{totalCount} complete)
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`rounded-2xl border border-soft-accent bg-white p-6 ${panelHeight}`}>
          {current.type === "cover" ? (
            <div className="h-full flex flex-col justify-center">
              <p className="text-xs uppercase tracking-[0.16em] text-anchor/60">Story Universe</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight text-anchor">{title}</h2>
              <p className="mt-3 text-sm text-anchor/70">Page 1 of {pages.length}</p>
            </div>
          ) : (
            <div className="h-full">
              <p className="mb-3 text-xs uppercase tracking-[0.16em] text-anchor/60">
                Page {pageIndex + 1} of {pages.length}
              </p>
              <article className="whitespace-pre-wrap leading-8 text-anchor">{current.text}</article>
            </div>
          )}
        </div>

        <div className={`rounded-2xl border border-soft-accent bg-soft-accent/45 p-6 grid place-items-center ${panelHeight}`}>
          {current.type === "cover" ? (
            coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImageUrl}
                alt={`Cover illustration for ${title}`}
                className="h-full w-full rounded-xl object-cover"
              />
            ) : (
              <div className="text-center">
                <div className="mx-auto mb-3 h-16 w-16 rounded-2xl bg-secondary/20 grid place-items-center text-secondary font-semibold">
                  Img
                </div>
                <p className="text-sm font-medium text-anchor">Generating cover illustration...</p>
                <p className="mt-1 text-xs text-anchor/65">Cover will appear automatically when ready.</p>
              </div>
            )
          ) : current.contentPage?.imageStatus === "ready" && current.contentPage.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.contentPage.imageUrl}
              alt={`Illustration for page ${current.contentPage.pageIndex + 1}`}
              className="h-full w-full rounded-xl object-cover"
            />
          ) : current.contentPage?.imageStatus === "failed" ? (
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-anchor">Illustration failed</p>
              <p className="text-xs text-anchor/70">{current.contentPage.imageError ?? "Could not generate this page image."}</p>
              {canManageIllustrations ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="px-3 py-2 text-xs"
                  onClick={handleRegenerateCurrent}
                  disabled={isRegeneratingCurrent}
                >
                  {isRegeneratingCurrent ? "Regenerating..." : "Regenerate image"}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="text-center space-y-2 w-full">
              <div className="mx-auto h-40 w-full max-w-[320px] animate-pulse rounded-xl bg-white/70" />
              <p className="text-sm font-medium text-anchor">Illustrating...</p>
              <p className="text-xs text-anchor/65">
                {current.contentPage?.imageStatus === "generating" ? "Generating artwork for this page" : "Queued for illustration"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          className="border border-soft-accent"
          onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
          disabled={atStart}
        >
          Previous page
        </Button>

        <p className="text-sm text-anchor/75">
          {pageIndex + 1} / {pages.length}
        </p>

        <Button
          type="button"
          variant="primary"
          onClick={() => setPageIndex((prev) => Math.min(pages.length - 1, prev + 1))}
          disabled={atEnd}
        >
          Next page
        </Button>
      </div>
    </section>
  );
}
