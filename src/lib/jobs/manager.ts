import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { getVideoSourceProvider } from "@/lib/youtube";
import { getTranscriptionProvider } from "@/lib/transcription";
import { parseVttToTranscript } from "@/lib/transcription/vtt";
import { getClipSelectionProvider } from "@/lib/ai";
import { probeVideo } from "@/lib/video/metadata";
import { renderClip } from "@/lib/video/render";
import { randomFilename } from "@/utils/fs";
import type { Transcript } from "@/types";
import { isCaptionStyle } from "@/types";
import type { ProgressUpdate } from "./types";

/**
 * In-process job manager. The analysis and render pipelines run as background
 * tasks in the same Node process (fine for the MVP / single-node dev). Status is
 * persisted to the database so the UI can poll. Each pipeline is a small, pure
 * sequence of provider calls, so lifting it into a dedicated worker later is a
 * mechanical change.
 */

// Guard against launching the same job twice within a process.
const running = new Set<string>();

function sourcePath(projectId: string): string {
  return path.join("projects", projectId, "source.mp4");
}
function clipPath(projectId: string, clipId: string): string {
  return path.join("projects", projectId, "clips", `${clipId}.mp4`);
}

async function setJob(jobId: string, u: ProgressUpdate) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: u.status,
      stage: u.stage,
      ...(u.progress !== undefined ? { progress: u.progress } : {}),
    },
  });
}

/** Kick off the analysis pipeline for a project (non-blocking). */
export function startAnalysis(projectId: string, jobId: string): void {
  const key = `analyze:${projectId}`;
  if (running.has(key)) return;
  running.add(key);
  void runAnalysis(projectId, jobId).finally(() => running.delete(key));
}

async function runAnalysis(projectId: string, jobId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;

  const storage = getStorage();
  const source = getVideoSourceProvider();
  const transcriber = getTranscriptionProvider();
  const selector = getClipSelectionProvider();

  let disposeSource: (() => Promise<void>) | null = null;

  try {
    // 1. Download / obtain the source video.
    await prisma.project.update({ where: { id: projectId }, data: { status: "downloading" } });
    await setJob(jobId, { status: "downloading", stage: "Fetching video", progress: 10 });

    const video = await source.getVideo(project.url);
    disposeSource = video.dispose;

    // 2. Probe + persist the source into storage.
    const meta = await probeVideo(video.localPath);
    const bytes = await fs.readFile(video.localPath);
    const spath = sourcePath(projectId);
    await storage.save(bytes, spath);

    await prisma.sourceVideo.upsert({
      where: { projectId },
      create: {
        projectId,
        storagePath: spath,
        title: video.title,
        durationSec: meta.durationSec,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
      },
      update: {
        storagePath: spath,
        title: video.title,
        durationSec: meta.durationSec,
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
      },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { title: video.title },
    });

    // 3. Transcribe.
    await prisma.project.update({ where: { id: projectId }, data: { status: "transcribing" } });
    await setJob(jobId, { status: "transcribing", stage: "Transcribing audio", progress: 40 });

    // Prefer real captions from the source (YouTube subtitles) when present;
    // otherwise fall back to the configured transcription provider.
    let transcript: Transcript | null = null;
    if (video.subtitlePath) {
      try {
        const vtt = await fs.readFile(video.subtitlePath, "utf8");
        const parsed = parseVttToTranscript(vtt, meta.durationSec);
        if (parsed.segments.length > 0) {
          transcript = parsed;
          logger.info("using source captions", {
            projectId,
            segments: parsed.segments.length,
          });
        }
      } catch (e) {
        logger.warn("failed to parse source captions; falling back", { projectId, cause: e });
      }
    }
    if (!transcript) {
      transcript = await transcriber.transcribe(video.localPath);
    }
    await prisma.transcript.upsert({
      where: { projectId },
      create: {
        projectId,
        language: transcript.language,
        data: JSON.stringify(transcript),
      },
      update: { language: transcript.language, data: JSON.stringify(transcript) },
    });

    // 4. Analyze / find clips.
    await prisma.project.update({ where: { id: projectId }, data: { status: "analyzing" } });
    await setJob(jobId, { status: "analyzing", stage: "Finding the best clips", progress: 70 });

    const suggestions = await selector.findClips(transcript, meta.durationSec, {
      minSeconds: config.clips.minSeconds,
      maxSeconds: config.clips.maxSeconds,
      maxSuggestions: config.clips.maxSuggestions,
    });

    await prisma.clipSuggestion.deleteMany({ where: { projectId } });
    if (suggestions.length > 0) {
      await prisma.clipSuggestion.createMany({
        data: suggestions.map((s, i) => ({
          projectId,
          order: i,
          startSec: s.start,
          endSec: s.end,
          title: s.title,
          hook: s.hook,
          score: s.score,
          reason: s.reason,
          transcriptPreview: s.transcriptPreview,
        })),
      });
    }

    // 5. Done.
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", error: null },
    });
    await setJob(jobId, { status: "completed", stage: "Analysis complete", progress: 100 });
    logger.info("analysis complete", { projectId, suggestions: suggestions.length });
  } catch (e) {
    const appErr = toAppError(e);
    logger.error("analysis failed", { projectId, code: appErr.code, cause: appErr.cause });
    await prisma.project
      .update({ where: { id: projectId }, data: { status: "failed", error: appErr.message } })
      .catch(() => {});
    await setJob(jobId, { status: "failed", stage: appErr.message, progress: 100 }).catch(
      () => {},
    );
  } finally {
    if (disposeSource) await disposeSource().catch(() => {});
  }
}

/** Kick off a render for one generated clip (non-blocking). */
export function startRender(clipId: string): void {
  const key = `render:${clipId}`;
  if (running.has(key)) return;
  running.add(key);
  void runRender(clipId).finally(() => running.delete(key));
}

async function runRender(clipId: string): Promise<void> {
  const clip = await prisma.generatedClip.findUnique({ where: { id: clipId } });
  if (!clip) return;

  const storage = getStorage();

  try {
    await prisma.generatedClip.update({
      where: { id: clipId },
      data: { status: "rendering", error: null },
    });

    const sourceVideo = await prisma.sourceVideo.findUnique({
      where: { projectId: clip.projectId },
    });
    if (!sourceVideo) throw toAppError(new Error("Source video is missing."));

    const localSource = await storage.localPath(sourceVideo.storagePath);
    if (!localSource) throw toAppError(new Error("Source video file not found in storage."));

    const transcriptRow = await prisma.transcript.findUnique({
      where: { projectId: clip.projectId },
    });
    const transcript: Transcript | null = transcriptRow
      ? (JSON.parse(transcriptRow.data) as Transcript)
      : null;

    const style = isCaptionStyle(clip.captionStyle) ? clip.captionStyle : "classic";

    // Render to a temp file, then persist through the storage provider so the
    // pipeline stays storage-agnostic.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-out-"));
    const tmpOut = path.join(tmpDir, randomFilename("mp4"));

    try {
      await renderClip({
        sourcePath: localSource,
        metadata: {
          durationSec: sourceVideo.durationSec,
          width: sourceVideo.width,
          height: sourceVideo.height,
          fps: sourceVideo.fps,
        },
        transcript,
        start: clip.startSec,
        end: clip.endSec,
        title: clip.title,
        captionStyle: style,
        outputPath: tmpOut,
      });

      const bytes = await fs.readFile(tmpOut);
      const dest = clipPath(clip.projectId, clip.id);
      await storage.save(bytes, dest);

      await prisma.generatedClip.update({
        where: { id: clipId },
        data: { status: "completed", storagePath: dest, error: null },
      });
      logger.info("render complete", { clipId });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (e) {
    const appErr = toAppError(e);
    logger.error("render failed", { clipId, code: appErr.code, cause: appErr.cause });
    await prisma.generatedClip
      .update({ where: { id: clipId }, data: { status: "failed", error: appErr.message } })
      .catch(() => {});
  }
}
