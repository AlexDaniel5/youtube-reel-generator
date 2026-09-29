/**
 * Typed application errors. Each carries a user-safe `message` plus an HTTP
 * `status`, so API routes can surface something meaningful without leaking
 * internals. Technical detail goes to the logger, not to the client.
 */

export type AppErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_URL"
  | "VIDEO_PRIVATE"
  | "VIDEO_AGE_RESTRICTED"
  | "DOWNLOAD_FAILED"
  | "NETWORK_ERROR"
  | "TRANSCRIPTION_FAILED"
  | "AI_FAILED"
  | "FFMPEG_FAILED"
  | "FILE_NOT_FOUND"
  | "INVALID_TIMESTAMPS"
  | "RENDER_FAILED"
  | "DB_ERROR"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, status = 400, cause?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

export const errors = {
  invalidUrl: (msg = "That doesn't look like a valid YouTube URL.") =>
    new AppError("INVALID_URL", msg, 400),
  unsupportedUrl: (msg = "This URL type isn't supported.") =>
    new AppError("UNSUPPORTED_URL", msg, 400),
  videoPrivate: (msg = "This video is private and can't be processed.") =>
    new AppError("VIDEO_PRIVATE", msg, 422),
  ageRestricted: (msg = "This video is age-restricted and can't be processed.") =>
    new AppError("VIDEO_AGE_RESTRICTED", msg, 422),
  downloadFailed: (msg = "The video could not be downloaded.", cause?: unknown) =>
    new AppError("DOWNLOAD_FAILED", msg, 502, cause),
  network: (msg = "A network error occurred. Please try again.", cause?: unknown) =>
    new AppError("NETWORK_ERROR", msg, 502, cause),
  transcription: (msg = "Transcription failed.", cause?: unknown) =>
    new AppError("TRANSCRIPTION_FAILED", msg, 502, cause),
  ai: (msg = "AI clip detection failed.", cause?: unknown) =>
    new AppError("AI_FAILED", msg, 502, cause),
  ffmpeg: (msg = "Video processing failed.", cause?: unknown) =>
    new AppError("FFMPEG_FAILED", msg, 500, cause),
  fileNotFound: (msg = "A required file was not found.") =>
    new AppError("FILE_NOT_FOUND", msg, 404),
  invalidTimestamps: (msg = "Invalid start/end times for this clip.") =>
    new AppError("INVALID_TIMESTAMPS", msg, 400),
  render: (msg = "Rendering the clip failed.", cause?: unknown) =>
    new AppError("RENDER_FAILED", msg, 500, cause),
  db: (msg = "A database error occurred.", cause?: unknown) =>
    new AppError("DB_ERROR", msg, 500, cause),
  notFound: (msg = "Not found.") => new AppError("NOT_FOUND", msg, 404),
  validation: (msg: string) => new AppError("VALIDATION_ERROR", msg, 400),
  internal: (msg = "Something went wrong.", cause?: unknown) =>
    new AppError("INTERNAL", msg, 500, cause),
};

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new AppError("INTERNAL", "Something went wrong.", 500, message);
}
