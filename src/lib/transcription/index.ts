import { config } from "@/lib/config";
import { MockTranscriptionProvider } from "./mock-provider";
import { OpenAiTranscriptionProvider } from "./openai-provider";
import type { TranscriptionProvider } from "./types";

/** Resolve the configured transcription provider. */
export function getTranscriptionProvider(): TranscriptionProvider {
  switch (config.transcription.provider) {
    case "openai":
      return new OpenAiTranscriptionProvider(
        config.transcription.apiKey,
        config.transcription.baseUrl,
        config.transcription.model,
      );
    case "mock":
    default:
      return new MockTranscriptionProvider();
  }
}

export type { TranscriptionProvider } from "./types";
