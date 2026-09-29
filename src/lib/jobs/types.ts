export type JobType = "analyze" | "render";

export interface ProgressUpdate {
  status:
    | "queued"
    | "downloading"
    | "transcribing"
    | "analyzing"
    | "rendering"
    | "completed"
    | "failed";
  stage?: string;
  progress?: number;
}
