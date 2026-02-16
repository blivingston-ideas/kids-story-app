import type { StoryGenerationPhase } from "@/hooks/useStoryGenerationProgress";

type TaskStatus = "pending" | "running" | "done" | "failed";

type Props = {
  isRunning: boolean;
  phase: StoryGenerationPhase;
  progress: number;
  error?: string | null;
};

type Task = {
  id: Exclude<StoryGenerationPhase, "idle" | "done" | "error">;
  label: string;
};

const TASKS: Task[] = [
  { id: "collect", label: "Collecting your choices" },
  { id: "plan", label: "Planning the story arc" },
  { id: "draft", label: "Writing the first draft" },
  { id: "edit", label: "Editing for age + sentence length" },
  { id: "save", label: "Saving to your library" },
];

const TASK_INDEX = new Map(TASKS.map((task, index) => [task.id, index]));

function phaseIndexFromProgress(progress: number): number {
  if (progress >= 92) return 4;
  if (progress >= 80) return 3;
  if (progress >= 60) return 2;
  if (progress >= 30) return 1;
  if (progress > 0) return 0;
  return 0;
}

function getCurrentTaskIndex(phase: StoryGenerationPhase, progress: number): number {
  if (phase === "done") return TASKS.length - 1;
  if (phase === "error") return phaseIndexFromProgress(progress);
  if (phase === "idle") return -1;
  return TASK_INDEX.get(phase) ?? 0;
}

function getTaskStatus(
  taskIndex: number,
  currentIndex: number,
  phase: StoryGenerationPhase
): TaskStatus {
  if (phase === "done") return "done";
  if (phase === "idle") return "pending";
  if (taskIndex < currentIndex) return "done";
  if (taskIndex > currentIndex) return "pending";
  if (phase === "error") return "failed";
  return "running";
}

function statusGlyph(status: TaskStatus): string {
  if (status === "done") return "✓";
  if (status === "running") return "…";
  if (status === "failed") return "✕";
  return "○";
}

function statusClass(status: TaskStatus): string {
  if (status === "done") return "text-emerald-700";
  if (status === "running") return "text-neutral-900";
  if (status === "failed") return "text-rose-700";
  return "text-neutral-500";
}

export default function StoryGenerationProgress({
  isRunning,
  phase,
  progress,
  error,
}: Props) {
  const currentIndex = getCurrentTaskIndex(phase, progress);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-neutral-900">
        {phase === "error" ? "Something went wrong while creating your story." : "Creating your story..."}
      </p>

      <div className="mt-3 h-3 w-full rounded-full bg-neutral-200">
        <div
          className={`h-3 rounded-full transition-[width] duration-200 ${
            phase === "error" ? "bg-rose-500" : "bg-neutral-900"
          }`}
          style={{ width: `${Math.max(0, Math.min(100, progress)).toFixed(1)}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-neutral-600">
        {isRunning ? `${Math.floor(progress)}% complete` : phase === "done" ? "100% complete" : `${Math.floor(progress)}%`}
      </p>

      <ul className="mt-4 space-y-2 text-sm">
        {TASKS.map((task, index) => {
          const status = getTaskStatus(index, currentIndex, phase);
          return (
            <li key={task.id} className={`flex items-center gap-2 ${statusClass(status)}`}>
              <span className="w-4 text-center">{statusGlyph(status)}</span>
              <span>{task.label}</span>
            </li>
          );
        })}
      </ul>

      {phase === "error" && error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
