import type { ClipSegment, CropSettings, VideoMetadata } from "@/types";

export const TARGET_WIDTH = 1080;
export const TARGET_HEIGHT = 1920;
const TARGET_AR = 9 / 16;

/**
 * Strategy for choosing the crop rectangle used to reframe a landscape (or
 * arbitrary) source into a vertical 9:16 clip. Swapping in a face/subject
 * tracker later means implementing this interface — nothing else changes.
 */
export interface VideoFramingStrategy {
  readonly name: string;
  getCrop(video: VideoMetadata, segment: ClipSegment): CropSettings;
}

/**
 * MVP strategy: take the tallest 9:16 rectangle that fits, centered
 * horizontally and vertically. Works for any source aspect ratio.
 */
export class CenterCropStrategy implements VideoFramingStrategy {
  readonly name = "center";

  getCrop(video: VideoMetadata, _segment: ClipSegment): CropSettings {
    const { width, height } = video;
    const srcAr = width / height;

    let cropW: number;
    let cropH: number;

    if (srcAr > TARGET_AR) {
      // Source is wider than 9:16 → full height, crop width.
      cropH = height;
      cropW = Math.round(height * TARGET_AR);
    } else {
      // Source is taller/narrower → full width, crop height.
      cropW = width;
      cropH = Math.round(width / TARGET_AR);
    }

    // Clamp to source bounds and keep even dimensions (H.264 requirement).
    cropW = Math.min(width, cropW) & ~1;
    cropH = Math.min(height, cropH) & ~1;

    const x = Math.max(0, Math.floor((width - cropW) / 2));
    const y = Math.max(0, Math.floor((height - cropH) / 2));

    return {
      x,
      y,
      width: cropW,
      height: cropH,
      targetWidth: TARGET_WIDTH,
      targetHeight: TARGET_HEIGHT,
    };
  }
}

export function getFramingStrategy(): VideoFramingStrategy {
  // Only one crop strategy today; future strategies would be selected here.
  return new CenterCropStrategy();
}

/**
 * "Letterbox / fit" layout: the whole horizontal video is scaled down and
 * centered inside the 9:16 frame, leaving bands above and below for the title
 * and captions (rendered on a solid background). This shows the full frame
 * rather than zooming into a slice.
 */
export interface FitLayout {
  videoWidth: number;
  videoHeight: number;
  x: number; // top-left of the video within the target canvas
  y: number;
  targetWidth: number;
  targetHeight: number;
}

export function computeFitLayout(video: VideoMetadata): FitLayout {
  // Cap the video height so there's always room for the title/caption bands.
  const maxVideoHeight = 1360;

  let w = TARGET_WIDTH;
  let h = Math.round((TARGET_WIDTH * video.height) / video.width);
  if (h > maxVideoHeight) {
    h = maxVideoHeight;
    w = Math.round((maxVideoHeight * video.width) / video.height);
  }
  // Even dimensions for H.264.
  w = Math.min(TARGET_WIDTH, w) & ~1;
  h = Math.min(TARGET_HEIGHT, h) & ~1;

  const x = Math.floor((TARGET_WIDTH - w) / 2);
  const y = Math.floor((TARGET_HEIGHT - h) / 2);

  return {
    videoWidth: w,
    videoHeight: h,
    x,
    y,
    targetWidth: TARGET_WIDTH,
    targetHeight: TARGET_HEIGHT,
  };
}
