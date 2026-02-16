"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type StoryGenerationPhase =
  | "idle"
  | "collect"
  | "plan"
  | "draft"
  | "edit"
  | "save"
  | "done"
  | "error";

type UseStoryGenerationProgress = {
  phase: StoryGenerationPhase;
  progress: number;
  error: string | null;
  start: () => void;
  complete: () => Promise<void>;
  fail: (message: string) => void;
  reset: () => void;
};

const PHASE_ORDER: StoryGenerationPhase[] = ["collect", "plan", "draft", "edit", "save"];
const PHASE_TARGETS: Record<Exclude<StoryGenerationPhase, "idle" | "done" | "error">, number> = {
  collect: 10,
  plan: 30,
  draft: 60,
  edit: 80,
  save: 92,
};

const FINAL_HOVER_CAP = 95;

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function isActivePhase(
  phase: StoryGenerationPhase
): phase is Exclude<StoryGenerationPhase, "idle" | "done" | "error"> {
  return PHASE_ORDER.includes(phase);
}

export function useStoryGenerationProgress(): UseStoryGenerationProgress {
  const [phase, setPhase] = useState<StoryGenerationPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<StoryGenerationPhase>("idle");
  const progressRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const tick = useCallback(() => {
    const currentPhase = phaseRef.current;
    if (!isActivePhase(currentPhase)) return;

    const currentProgress = progressRef.current;
    const target = PHASE_TARGETS[currentPhase];
    const maxTarget = currentPhase === "save" ? FINAL_HOVER_CAP : target;

    const remaining = Math.max(0, maxTarget - currentProgress);
    if (remaining <= 0.05) {
      if (currentPhase !== "save") {
        const nextIndex = PHASE_ORDER.indexOf(currentPhase) + 1;
        const nextPhase = PHASE_ORDER[nextIndex];
        if (nextPhase) setPhase(nextPhase);
      }
      return;
    }

    const nearEnd = currentPhase === "save" && currentProgress >= PHASE_TARGETS.save;
    const step = nearEnd ? Math.max(0.12, remaining * 0.06) : Math.max(0.35, remaining * 0.12);
    setProgress((prev) => clampProgress(prev + step));
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setPhase("idle");
    setProgress(0);
    setError(null);
  }, [clearTimer]);

  const start = useCallback(() => {
    clearTimer();
    setError(null);
    setPhase("collect");
    setProgress(1);
    timerRef.current = setInterval(tick, 140);
  }, [clearTimer, tick]);

  const complete = useCallback(async () => {
    clearTimer();

    if (phaseRef.current !== "save") {
      setPhase("save");
      setProgress((prev) => clampProgress(Math.max(prev, PHASE_TARGETS.save)));
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    await new Promise<void>((resolve) => {
      const startValue = progressRef.current;
      const durationMs = 760;
      const stepMs = 30;
      const startTime = Date.now();

      const animateTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const ratio = Math.min(1, elapsed / durationMs);
        const eased = 1 - Math.pow(1 - ratio, 2);
        const next = startValue + (100 - startValue) * eased;
        setProgress(clampProgress(next));

        if (ratio >= 1) {
          clearInterval(animateTimer);
          setProgress(100);
          setPhase("done");
          resolve();
        }
      }, stepMs);
    });
  }, [clearTimer]);

  const fail = useCallback(
    (message: string) => {
      clearTimer();
      setError(message);
      setPhase("error");
    },
    [clearTimer]
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  return useMemo(
    () => ({
      phase,
      progress,
      error,
      start,
      complete,
      fail,
      reset,
    }),
    [complete, error, fail, phase, progress, reset, start]
  );
}
