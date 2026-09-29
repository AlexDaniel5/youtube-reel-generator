import type { ClipSuggestion, Transcript } from "@/types";

export interface ClipSelectionOptions {
  minSeconds: number;
  maxSeconds: number;
  maxSuggestions: number;
}

/** Abstraction over choosing the best short-form segments from a transcript. */
export interface ClipSelectionProvider {
  readonly name: string;
  findClips(
    transcript: Transcript,
    durationSec: number,
    options: ClipSelectionOptions,
  ): Promise<ClipSuggestion[]>;
}
