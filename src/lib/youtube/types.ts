/**
 * Abstraction over obtaining the source video, so nothing downstream cares
 * where it came from (mock, yt-dlp, or a future provider). A provider produces
 * a temporary local file; the caller probes/stores it, then disposes.
 */
export interface VideoSource {
  /** Absolute path to the downloaded/generated video on local disk. */
  localPath: string;
  /** Best-known human title. */
  title: string;
  /**
   * Absolute path to a WebVTT subtitle file for the video, when one is
   * available (e.g. YouTube auto-captions). Lets the pipeline use real, timed
   * captions without a transcription API.
   */
  subtitlePath?: string;
  /** Remove any temporary files created by the provider. */
  dispose(): Promise<void>;
}

export interface VideoSourceProvider {
  readonly name: string;
  getVideo(url: string): Promise<VideoSource>;
}
