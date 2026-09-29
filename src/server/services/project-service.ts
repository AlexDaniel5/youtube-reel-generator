import { prisma } from "@/lib/db";
import { errors } from "@/lib/errors";
import { parseYouTubeUrl } from "@/lib/youtube";
import { startAnalysis } from "@/lib/jobs/manager";

/**
 * Create a project from a YouTube URL and kick off the analysis pipeline.
 * Validation errors (bad/unsupported URL) are thrown before any DB write.
 */
export async function createProject(url: string) {
  const { canonicalUrl } = parseYouTubeUrl(url); // throws AppError on invalid input

  const project = await prisma.project.create({
    data: { url: canonicalUrl, status: "queued" },
  });
  const job = await prisma.job.create({
    data: { projectId: project.id, type: "analyze", status: "queued", progress: 0 },
  });

  startAnalysis(project.id, job.id);

  return { projectId: project.id, jobId: job.id };
}

/** Full project detail DTO for the UI (omits the heavy transcript payload). */
export async function getProjectDetail(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sourceVideo: true,
      suggestions: { orderBy: { order: "asc" } },
      clips: { orderBy: { createdAt: "asc" } },
      jobs: { where: { type: "analyze" }, orderBy: { createdAt: "desc" }, take: 1 },
      transcript: { select: { language: true } },
    },
  });

  if (!project) throw errors.notFound("Project not found.");

  const job = project.jobs[0] ?? null;

  return {
    id: project.id,
    url: project.url,
    title: project.title,
    status: project.status,
    error: project.error,
    createdAt: project.createdAt,
    hasTranscript: !!project.transcript,
    job: job
      ? { id: job.id, status: job.status, stage: job.stage, progress: job.progress, error: job.error }
      : null,
    sourceVideo: project.sourceVideo
      ? {
          durationSec: project.sourceVideo.durationSec,
          width: project.sourceVideo.width,
          height: project.sourceVideo.height,
          fps: project.sourceVideo.fps,
          storagePath: project.sourceVideo.storagePath,
        }
      : null,
    suggestions: project.suggestions.map((s) => ({
      id: s.id,
      order: s.order,
      start: s.startSec,
      end: s.endSec,
      title: s.title,
      hook: s.hook,
      score: s.score,
      reason: s.reason,
      transcriptPreview: s.transcriptPreview,
    })),
    clips: project.clips.map((c) => ({
      id: c.id,
      suggestionId: c.suggestionId,
      title: c.title,
      start: c.startSec,
      end: c.endSec,
      captionStyle: c.captionStyle,
      status: c.status,
      error: c.error,
      hasVideo: !!c.storagePath,
    })),
  };
}
