/* Shared domain types used across the transcription, AI, video and job layers. */

export interface TranscriptWord {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  words?: TranscriptWord[];
}

export interface Transcript {
  text: string;
  language?: string;
  durationSec: number;
  segments: TranscriptSegment[];
}

export interface VideoMetadata {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

/** A time range within the source video. */
export interface ClipSegment {
  start: number; // seconds
  end: number; // seconds
}

export interface CropSettings {
  // Crop rectangle in source pixels, before scaling to the 9:16 target.
  x: number;
  y: number;
  width: number;
  height: number;
  // Target output dimensions.
  targetWidth: number;
  targetHeight: number;
}

export interface ClipSuggestion {
  start: number;
  end: number;
  title: string;
  hook: string;
  score: number; // 0-100
  reason: string;
  transcriptPreview: string;
}

export type JobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "rendering"
  | "completed"
  | "failed";

export const CAPTION_STYLES = ["classic", "bold", "minimal", "highlight"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export function isCaptionStyle(v: unknown): v is CaptionStyle {
  return typeof v === "string" && (CAPTION_STYLES as readonly string[]).includes(v);
}
