import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomFilename } from "@/utils/fs";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { CaptionStyle, Transcript, VideoMetadata } from "@/types";
import { config } from "@/lib/config";
import { runFfmpeg } from "./ffmpeg";
import { getFramingStrategy, computeFitLayout } from "./framing";
import { buildCaptionCues, renderAss } from "./captions";

export interface RenderClipParams {
  sourcePath: string; // absolute local path to the source video
  metadata: VideoMetadata;
  transcript: Transcript | null;
  start: number;
  end: number;
  title: string;
  captionStyle: CaptionStyle;
  outputPath: string; // absolute local path to write the mp4
}

/** Escape a filesystem path for safe use inside an ffmpeg filtergraph value. */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * Render one vertical 9:16 clip: trim → center-crop/reframe → burn captions and
 * hook/title → encode H.264/AAC. The pipeline is a single ffmpeg invocation and
 * is intentionally self-contained so it can move to a background worker later.
 */
export async function renderClip(params: RenderClipParams): Promise<void> {
  const { sourcePath, metadata, transcript, start, end, title, captionStyle, outputPath } =
    params;

  // --- validate timestamps ---
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw errors.invalidTimestamps();
  }
  if (start < 0) throw errors.invalidTimestamps("Start time cannot be negative.");
  if (metadata.durationSec > 0 && start >= metadata.durationSec) {
    throw errors.invalidTimestamps("Start time is beyond the end of the video.");
  }
  const clampedEnd =
    metadata.durationSec > 0 ? Math.min(end, metadata.durationSec) : end;
  const duration = clampedEnd - start;
  if (duration <= 0) throw errors.invalidTimestamps();

  const cues = transcript ? buildCaptionCues(transcript, start, clampedEnd) : [];

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-"));
  const assPath = path.join(tmpDir, randomFilename("ass"));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // --- framing: "fit" (letterbox on a solid background) or "crop" (zoom) ---
  let videoFilters: string[];
  if (config.render.framing === "crop") {
    const crop = getFramingStrategy().getCrop(metadata, { start, end: clampedEnd });
    const ass = renderAss(cues, { style: captionStyle, title, clipDurationSec: duration });
    await fs.writeFile(assPath, ass, "utf8");
    videoFilters = [
      `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
      `scale=${crop.targetWidth}:${crop.targetHeight}:flags=lanczos`,
      "setsar=1",
      `subtitles=filename='${escapeFilterPath(assPath)}'`,
      "format=yuv420p",
    ];
  } else {
    const fit = computeFitLayout(metadata);
    const videoBottom = fit.y + fit.videoHeight;
    // Vertical centres of the top/bottom bands for the title and captions.
    const titleY = Math.max(70, Math.round(fit.y / 2));
    const captionY = Math.round((videoBottom + fit.targetHeight) / 2);
    const ass = renderAss(cues, {
      style: captionStyle,
      title,
      clipDurationSec: duration,
      layout: "fit",
      fit: { titleY, captionY },
    });
    await fs.writeFile(assPath, ass, "utf8");
    videoFilters = [
      `scale=${fit.videoWidth}:${fit.videoHeight}:flags=lanczos`,
      // Place the scaled video on a solid canvas, centered.
      `pad=${fit.targetWidth}:${fit.targetHeight}:${fit.x}:${fit.y}:color=${config.render.bandColor}`,
      "setsar=1",
      `subtitles=filename='${escapeFilterPath(assPath)}'`,
      "format=yuv420p",
    ];
  }

  const vf = videoFilters.join(",");

  const args = [
    "-y",
    "-ss",
    start.toFixed(3),
    "-i",
    sourcePath,
    "-t",
    duration.toFixed(3),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  try {
    logger.info("rendering clip", { start, end: clampedEnd, captionStyle, outputPath });
    await runFfmpeg(args);
  } catch (e) {
    throw errors.render("Rendering the clip failed.", e);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  // Sanity-check the output exists and is non-empty.
  const stat = await fs.stat(outputPath).catch(() => null);
  if (!stat || stat.size === 0) {
    throw errors.render("Rendering produced an empty file.");
  }
}
