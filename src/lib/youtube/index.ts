import { config } from "@/lib/config";
import { MockVideoSourceProvider } from "./mock-provider";
import { YtdlpVideoSourceProvider } from "./ytdlp-provider";
import type { VideoSourceProvider } from "./types";

/** Resolve the configured video-source provider. */
export function getVideoSourceProvider(): VideoSourceProvider {
  switch (config.videoSource.provider) {
    case "ytdlp":
      return new YtdlpVideoSourceProvider(config.videoSource.ytdlpPath, {
        cookiesFile: config.videoSource.cookiesFile || undefined,
        cookiesFromBrowser: config.videoSource.cookiesFromBrowser || undefined,
        playerClient: config.videoSource.playerClient || undefined,
      });
    case "mock":
    default:
      return new MockVideoSourceProvider();
  }
}

export { parseYouTubeUrl } from "./url";
export type { VideoSource, VideoSourceProvider } from "./types";
