import path from "node:path";

/**
 * Centralised, typed access to environment configuration. Never read
 * `process.env` directly elsewhere — import from here so defaults and
 * validation live in one place.
 */

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export type VideoSourceProviderName = "mock" | "ytdlp";
export type TranscriptionProviderName = "mock" | "openai";
export type ClipProviderName = "mock" | "anthropic";
export type StorageProviderName = "local";

export const config = {
  videoSource: {
    provider: str("VIDEO_SOURCE_PROVIDER", "mock") as VideoSourceProviderName,
    ytdlpPath: str("YTDLP_PATH", "yt-dlp"),
    // Authenticate as your own signed-in YouTube account so content you're
    // entitled to view (e.g. age-restricted) downloads normally. Provide EITHER
    // a Netscape-format cookies.txt file OR a browser name to read cookies from.
    cookiesFile: str("YTDLP_COOKIES_FILE", ""),
    cookiesFromBrowser: str("YTDLP_COOKIES_FROM_BROWSER", ""),
    // yt-dlp YouTube player client. Leave empty for the default behaviour; when
    // cookies are supplied the provider pins the standard "default" client,
    // which avoids the "page needs to be reloaded" error some cookie sessions
    // trigger. Override here if a specific client is needed.
    playerClient: str("YTDLP_PLAYER_CLIENT", ""),
  },
  transcription: {
    provider: str("TRANSCRIPTION_PROVIDER", "mock") as TranscriptionProviderName,
    apiKey: str("TRANSCRIPTION_API_KEY", ""),
    baseUrl: str("TRANSCRIPTION_BASE_URL", "https://api.openai.com/v1"),
    model: str("TRANSCRIPTION_MODEL", "whisper-1"),
  },
  clips: {
    provider: str("CLIP_PROVIDER", "mock") as ClipProviderName,
    apiKey: str("AI_API_KEY", ""),
    model: str("AI_MODEL", "claude-opus-4-8"),
    minSeconds: num("CLIP_MIN_SECONDS", 10),
    maxSeconds: num("CLIP_MAX_SECONDS", 30),
    maxSuggestions: num("MAX_CLIP_SUGGESTIONS", 8),
  },
  storage: {
    provider: str("STORAGE_PROVIDER", "local") as StorageProviderName,
    // Absolute path to the storage root.
    path: path.resolve(process.cwd(), str("STORAGE_PATH", "./storage")),
  },
  render: {
    // "fit"  = show the whole horizontal frame, centered on a solid background
    //          with title/captions on the bands (default).
    // "crop" = zoom/center-crop the frame to fill 9:16.
    framing: str("VIDEO_FRAMING", "fit") as "fit" | "crop",
    // Background colour for the fit layout's bands.
    bandColor: str("VIDEO_BAND_COLOR", "white"),
  },
} as const;

export type AppConfig = typeof config;
