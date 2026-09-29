import { execFile } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Resolve the bundled ffmpeg / ffprobe binaries. Using the static packages
 * avoids a system dependency. All invocations go through `execFile` with an
 * argument array — never a shell string — so untrusted input can never be
 * interpreted as a command.
 */

export const FFMPEG_PATH: string = ffmpegStatic as unknown as string;
export const FFPROBE_PATH: string = ffprobeStatic.path;

if (!FFMPEG_PATH) {
  logger.error("ffmpeg-static did not resolve a binary path");
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** Run a binary with an argument array (no shell). Rejects on non-zero exit. */
export function run(
  bin: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: opts.timeoutMs ?? 10 * 60_000, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          logger.error("subprocess failed", {
            bin,
            code: (error as NodeJS.ErrnoException).code,
            stderr: String(stderr).slice(-2000),
          });
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** Run ffmpeg, mapping failures to a typed AppError. */
export async function runFfmpeg(args: string[], timeoutMs?: number): Promise<RunResult> {
  try {
    return await run(FFMPEG_PATH, args, { timeoutMs });
  } catch (e) {
    throw errors.ffmpeg("FFmpeg processing failed.", e);
  }
}

/** Run ffprobe, mapping failures to a typed AppError. */
export async function runFfprobe(args: string[], timeoutMs?: number): Promise<RunResult> {
  try {
    return await run(FFPROBE_PATH, args, { timeoutMs });
  } catch (e) {
    throw errors.ffmpeg("Could not read video metadata.", e);
  }
}
