import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { runFfmpeg } from "@/lib/video/ffmpeg";
import { randomFilename } from "@/utils/fs";
import { logger } from "@/lib/logger";
import { parseYouTubeUrl } from "./url";
import type { VideoSource, VideoSourceProvider } from "./types";

/**
 * Development provider that generates a real, playable synthetic 16:9 video
 * locally with ffmpeg (color test pattern + tone). This lets the entire
 * pipeline — transcription, clip detection, vertical rendering with burned
 * captions, preview, export — run and be verified fully offline, with no
 * network access, yt-dlp, or API keys.
 */
export class MockVideoSourceProvider implements VideoSourceProvider {
  readonly name = "mock";

  /** Deterministic duration in [70, 160] seconds from the video id. */
  static durationForUrl(url: string): number {
    const { videoId } = parseYouTubeUrl(url);
    const h = createHash("sha256").update(videoId).digest();
    return 70 + (h[0]! % 91); // 70..160
  }

  async getVideo(url: string): Promise<VideoSource> {
    const { videoId } = parseYouTubeUrl(url); // validates the URL first
    const duration = MockVideoSourceProvider.durationForUrl(url);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-src-"));
    const outPath = path.join(tmpDir, randomFilename("mp4"));

    logger.info("generating mock source video", { videoId, duration });

    await runFfmpeg(
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=size=1280x720:rate=30:duration=${duration}`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=320:duration=${duration}`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        outPath,
      ],
      Math.max(120_000, duration * 4000),
    );

    return {
      localPath: outPath,
      title: `Sample video (${videoId})`,
      dispose: async () => {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      },
    };
  }
}
