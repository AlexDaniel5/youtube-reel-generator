import type { CaptionStyle } from "@/types";

export interface JobDto {
  id: string;
  status: string;
  stage: string | null;
  progress: number;
  error: string | null;
}

export interface SuggestionDto {
  id: string;
  order: number;
  start: number;
  end: number;
  title: string;
  hook: string;
  score: number;
  reason: string;
  transcriptPreview: string;
}

export interface ClipDto {
  id: string;
  suggestionId: string | null;
  title: string;
  start: number;
  end: number;
  captionStyle: CaptionStyle | string;
  status: string;
  error: string | null;
  hasVideo: boolean;
}

export interface SourceVideoDto {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  storagePath: string;
}

export interface ProjectDetailDto {
  id: string;
  url: string;
  title: string | null;
  status: string;
  error: string | null;
  hasTranscript: boolean;
  job: JobDto | null;
  sourceVideo: SourceVideoDto | null;
  suggestions: SuggestionDto[];
  clips: ClipDto[];
}
