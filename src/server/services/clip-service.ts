import { prisma } from "@/lib/db";
import { errors } from "@/lib/errors";
import { startRender } from "@/lib/jobs/manager";
import { isCaptionStyle, type CaptionStyle } from "@/types";

/** Shape a GeneratedClip row into the UI DTO. */
function clipDto(c: {
  id: string;
  suggestionId: string | null;
  title: string;
  startSec: number;
  endSec: number;
  captionStyle: string;
  status: string;
  error: string | null;
  storagePath: string | null;
}) {
  return {
    id: c.id,
    suggestionId: c.suggestionId,
    title: c.title,
    start: c.startSec,
    end: c.endSec,
    captionStyle: c.captionStyle,
    status: c.status,
    error: c.error,
    hasVideo: !!c.storagePath,
  };
}

/**
 * Create generated clips from selected suggestions and start rendering each.
 * Reuses an existing GeneratedClip for a suggestion if one already exists.
 */
export async function generateClipsFromSuggestions(
  projectId: string,
  suggestionIds: string[],
  captionStyle: CaptionStyle,
) {
  const suggestions = await prisma.clipSuggestion.findMany({
    where: { projectId, id: { in: suggestionIds } },
  });
  if (suggestions.length === 0) throw errors.validation("No matching clips to generate.");

  const created = [];
  for (const s of suggestions) {
    const clip = await prisma.generatedClip.create({
      data: {
        projectId,
        suggestionId: s.id,
        title: s.title,
        startSec: s.startSec,
        endSec: s.endSec,
        captionStyle,
        status: "queued",
      },
    });
    startRender(clip.id);
    created.push(clipDto(clip));
  }
  return created;
}

export async function getClip(clipId: string) {
  const clip = await prisma.generatedClip.findUnique({ where: { id: clipId } });
  if (!clip) throw errors.notFound("Clip not found.");
  return clipDto(clip);
}

export interface ClipEdit {
  title?: string;
  start?: number;
  end?: number;
  captionStyle?: string;
}

/**
 * Apply user edits to a clip and re-render it. Validates timestamps against the
 * source video duration.
 */
export async function editAndRerenderClip(clipId: string, edit: ClipEdit) {
  const clip = await prisma.generatedClip.findUnique({ where: { id: clipId } });
  if (!clip) throw errors.notFound("Clip not found.");

  const source = await prisma.sourceVideo.findUnique({
    where: { projectId: clip.projectId },
  });

  const start = edit.start ?? clip.startSec;
  const end = edit.end ?? clip.endSec;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw errors.invalidTimestamps();
  }
  if (start < 0) throw errors.invalidTimestamps("Start time cannot be negative.");
  if (source && source.durationSec > 0 && end > source.durationSec + 0.5) {
    throw errors.invalidTimestamps("End time is beyond the end of the video.");
  }

  let captionStyle = clip.captionStyle;
  if (edit.captionStyle !== undefined) {
    if (!isCaptionStyle(edit.captionStyle)) {
      throw errors.validation("Unknown caption style.");
    }
    captionStyle = edit.captionStyle;
  }

  const title = edit.title !== undefined ? edit.title.slice(0, 200) : clip.title;

  const updated = await prisma.generatedClip.update({
    where: { id: clipId },
    data: { title, startSec: start, endSec: end, captionStyle, status: "queued", error: null },
  });

  startRender(updated.id);
  return clipDto(updated);
}
