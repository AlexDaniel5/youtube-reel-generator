import { config } from "@/lib/config";
import { MockClipSelectionProvider } from "./mock-provider";
import { AnthropicClipSelectionProvider } from "./anthropic-provider";
import type { ClipSelectionProvider } from "./types";

/** Resolve the configured clip-selection provider. */
export function getClipSelectionProvider(): ClipSelectionProvider {
  switch (config.clips.provider) {
    case "anthropic":
      return new AnthropicClipSelectionProvider(config.clips.apiKey, config.clips.model);
    case "mock":
    default:
      return new MockClipSelectionProvider();
  }
}

export type { ClipSelectionProvider, ClipSelectionOptions } from "./types";
