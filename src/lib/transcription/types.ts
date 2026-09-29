import type { Transcript } from "@/types";

/** Abstraction over speech-to-text. Implementations must return word- or at
 * least segment-level timestamps. */
export interface TranscriptionProvider {
  readonly name: string;
  transcribe(videoPath: string): Promise<Transcript>;
}
