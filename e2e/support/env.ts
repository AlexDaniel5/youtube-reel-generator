import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Single source of truth for the e2e environment. Everything the app reads
 * is pinned here so the suite never depends on the developer's `.env` (which
 * may point at yt-dlp, real API keys, or dev.db).
 */

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

export const E2E_DB_FILE = path.join(REPO_ROOT, "prisma", "e2e.db");
export const E2E_DATABASE_URL = `file:${E2E_DB_FILE}`;
export const E2E_STORAGE_DIR = path.join(REPO_ROOT, ".e2e-storage");

/** Mock video id the server is told to treat as private. */
export const PRIVATE_VIDEO_ID = "e2ePrivate1";

export const e2eEnv: Record<string, string> = {
  DATABASE_URL: E2E_DATABASE_URL,
  STORAGE_PROVIDER: "local",
  STORAGE_PATH: E2E_STORAGE_DIR,
  VIDEO_SOURCE_PROVIDER: "mock",
  TRANSCRIPTION_PROVIDER: "mock",
  CLIP_PROVIDER: "mock",
  CLIP_MIN_SECONDS: "10",
  CLIP_MAX_SECONDS: "30",
  MAX_CLIP_SUGGESTIONS: "8",
  VIDEO_FRAMING: "fit",
  MOCK_PRIVATE_VIDEO_IDS: PRIVATE_VIDEO_ID,
  NEXT_TELEMETRY_DISABLED: "1",
};
