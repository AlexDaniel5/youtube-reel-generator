"use client";

import { Progress } from "./ui/progress";
import type { JobDto } from "./types";

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  downloading: "Fetching video",
  transcribing: "Transcribing",
  analyzing: "Finding clips",
  completed: "Done",
  failed: "Failed",
};

export function JobProgress({ job }: { job: JobDto | null }) {
  const status = job?.status ?? "queued";
  const label = job?.stage || STAGE_LABEL[status] || "Working";
  const progress = job?.progress ?? 5;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between font-mono text-xs">
        <span className="flex items-center gap-2 uppercase tracking-wider text-foreground">
          <span className="rec-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {String(progress).padStart(2, "0")}%
        </span>
      </div>
      <Progress value={progress} />
    </div>
  );
}
