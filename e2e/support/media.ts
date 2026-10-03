import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffprobe from "ffprobe-static";

const run = promisify(execFile);

/**
 * Duration of a media file in seconds, via the same ffprobe binary the app
 * uses. Checking files this way is independent of the browser's codecs.
 */
export async function probeDuration(filePath: string): Promise<number> {
  const { stdout } = await run(ffprobe.path, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  return Number(stdout.trim());
}

/** True when the bytes start with an ISO-BMFF `ftyp` box (i.e. MP4). */
export function isMp4(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp";
}
