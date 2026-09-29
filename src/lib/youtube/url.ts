import { errors } from "@/lib/errors";

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export interface ParsedYouTubeUrl {
  videoId: string;
  canonicalUrl: string;
}

/**
 * Validate and parse a YouTube URL. Throws a typed AppError for invalid or
 * unsupported URLs so callers can surface a friendly message.
 */
export function parseYouTubeUrl(input: string): ParsedYouTubeUrl {
  const raw = (input ?? "").trim();
  if (!raw) throw errors.invalidUrl("Please paste a YouTube URL.");

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw errors.invalidUrl();
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw errors.invalidUrl("Only http(s) URLs are supported.");
  }

  const host = u.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) {
    throw errors.unsupportedUrl("Only YouTube URLs are supported right now.");
  }

  let videoId: string | null = null;

  if (host === "youtu.be" || host === "www.youtu.be") {
    videoId = u.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (u.pathname === "/watch") {
    videoId = u.searchParams.get("v");
  } else {
    // /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
    const parts = u.pathname.split("/").filter(Boolean);
    if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) {
      videoId = parts[1] ?? null;
    }
  }

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    throw errors.invalidUrl("Could not find a video ID in that URL.");
  }

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
