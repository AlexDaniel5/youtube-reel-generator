import { runFfprobe } from "./ffmpeg";
import type { VideoMetadata } from "@/types";
import { errors } from "@/lib/errors";

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}

function parseFps(v?: string): number {
  if (!v) return 30;
  const parts = v.split("/").map(Number);
  const num = parts[0] ?? NaN;
  const den = parts[1];
  if (den === undefined || den === 0 || !Number.isFinite(num)) {
    return Number.isFinite(num) ? num : 30;
  }
  return num / den;
}

/** Probe a local video file for dimensions, fps and duration. */
export async function probeVideo(localPath: string): Promise<VideoMetadata> {
  const { stdout } = await runFfprobe([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    localPath,
  ]);

  let data: FfprobeOutput;
  try {
    data = JSON.parse(stdout) as FfprobeOutput;
  } catch (e) {
    throw errors.ffmpeg("Could not parse video metadata.", e);
  }

  const video = data.streams?.find((s) => s.codec_type === "video");
  if (!video || !video.width || !video.height) {
    throw errors.ffmpeg("The file does not contain a readable video stream.");
  }

  const durationSec = Number(data.format?.duration ?? 0);
  return {
    width: video.width,
    height: video.height,
    fps: parseFps(video.avg_frame_rate ?? video.r_frame_rate),
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
  };
}
