import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { run, FFMPEG_PATH } from "@/lib/video/ffmpeg";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseYouTubeUrl } from "./url";
import type { VideoSource, VideoSourceProvider } from "./types";

export interface YtdlpAuthOptions {
  /** Path to a Netscape-format cookies.txt exported from a signed-in browser. */
  cookiesFile?: string;
  /** Browser to read cookies from directly, e.g. "chrome" or "firefox". */
  cookiesFromBrowser?: string;
  /** Override the YouTube player client (advanced). */
  playerClient?: string;
}

/**
 * Real YouTube retrieval via the `yt-dlp` binary. It does not circumvent access
 * controls (auth, DRM, age gates). To access content that requires a signed-in
 * account — such as age-restricted videos the user is entitled to view — it can
 * be given the user's own account cookies so yt-dlp authenticates as them, the
 * same as watching the video in their browser. Errors are mapped to typed,
 * user-facing messages.
 */
export class YtdlpVideoSourceProvider implements VideoSourceProvider {
  readonly name = "ytdlp";

  constructor(
    private readonly binary: string,
    private readonly auth: YtdlpAuthOptions = {},
  ) {}

  /** yt-dlp flags that authenticate as the user's own account, if configured. */
  private authArgs(): string[] {
    const args: string[] = [];
    if (this.auth.cookiesFile) args.push("--cookies", this.auth.cookiesFile);
    else if (this.auth.cookiesFromBrowser)
      args.push("--cookies-from-browser", this.auth.cookiesFromBrowser);

    // Some cookie sessions make YouTube's implicitly-chosen player client fail
    // with "The page needs to be reloaded". Pinning the standard "default"
    // client avoids it. An explicit override always wins.
    const client = this.auth.playerClient || (this.hasAuth ? "default" : "");
    if (client) args.push("--extractor-args", `youtube:player_client=${client}`);

    return args;
  }

  private get hasAuth(): boolean {
    return !!(this.auth.cookiesFile || this.auth.cookiesFromBrowser);
  }

  async getVideo(url: string): Promise<VideoSource> {
    const { canonicalUrl } = parseYouTubeUrl(url); // validate first

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-src-"));
    // Deterministic output name; yt-dlp fills the extension.
    const outTemplate = path.join(tmpDir, "source.%(ext)s");

    // Download the video only. Subtitles are fetched separately (best-effort)
    // so a captions hiccup (e.g. a 429 on one language) never fails the video.
    const args = [
      ...this.authArgs(),
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--restrict-filenames",
      // Cap at 1080p and prefer H.264/AAC in an mp4 container so the file is a
      // reasonable size and fast to re-encode. Falls back gracefully.
      // Cap at 1080p and prefer H.264/AAC in an mp4 container so the file is a
      // reasonable size and fast to re-encode. The trailing `/best` is a
      // catch-all so unusual streams (HLS-only, no height metadata) still work.
      "-f",
      "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b/best",
      "-S",
      "vcodec:h264,ext:mp4,res,acodec:aac",
      "--merge-output-format",
      "mp4",
      // yt-dlp needs ffmpeg to merge separate video/audio streams; use the
      // bundled ffmpeg-static binary so no system install is required.
      "--ffmpeg-location",
      FFMPEG_PATH,
      // Guard against pathologically large downloads (very long / high-bitrate).
      "--max-filesize",
      "2000M",
      "-o",
      outTemplate,
      "--print-json",
      canonicalUrl,
    ];

    let stdout = "";
    let stderr = "";
    try {
      const res = await run(this.binary, args, { timeoutMs: 20 * 60_000 });
      stdout = res.stdout;
      stderr = res.stderr;
    } catch (e) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      throw this.mapError(e);
    }

    const info = this.parseInfo(stdout);
    const title = typeof info?.title === "string" ? info.title : "YouTube video";

    // Locate the actual output file: trust yt-dlp's reported path first, then
    // fall back to the largest non-sidecar file in the temp dir.
    const media = await this.resolveMediaFile(tmpDir, info);
    if (!media) {
      const files = await fs.readdir(tmpDir).catch(() => []);
      logger.error("yt-dlp produced no media file", {
        files,
        stderrTail: stderr.slice(-800),
      });
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      throw errors.downloadFailed(this.noFileMessage(stderr));
    }

    // Best-effort: fetch real English captions. Failure here is non-fatal —
    // the pipeline falls back to its transcription provider.
    await this.tryFetchSubtitles(canonicalUrl, outTemplate);

    // Prefer a manually-uploaded English track over an auto-generated one.
    const allFiles = await fs.readdir(tmpDir);
    const subs = allFiles.filter((f) => f.endsWith(".vtt"));
    const chosenSub = subs.find((f) => !/auto|a\.en|\.en-orig/i.test(f)) ?? subs[0];

    return {
      localPath: path.join(tmpDir, media),
      subtitlePath: chosenSub ? path.join(tmpDir, chosenSub) : undefined,
      title,
      dispose: async () => {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      },
    };
  }

  private parseInfo(stdout: string): Record<string, unknown> | null {
    const line = stdout.trim().split("\n").filter(Boolean).pop();
    if (!line) return null;
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** Find the downloaded media file, ignoring subtitle/metadata sidecars. */
  private async resolveMediaFile(
    dir: string,
    info: Record<string, unknown> | null,
  ): Promise<string | null> {
    // 1. yt-dlp's own reported final path (survives merges / remuxes).
    let reported: unknown;
    const rd = info?.["requested_downloads"];
    if (Array.isArray(rd) && rd[0] && typeof rd[0] === "object") {
      reported = (rd[0] as Record<string, unknown>)["filepath"];
    }
    reported = reported ?? info?.["filepath"] ?? info?.["_filename"];
    if (typeof reported === "string" && reported) {
      const base = path.basename(reported);
      const p = path.join(dir, base);
      const st = await fs.stat(p).catch(() => null);
      if (st?.isFile() && st.size > 0) return base;
    }

    // 2. Largest non-sidecar file that actually has bytes.
    const files = await fs.readdir(dir).catch(() => []);
    let best: string | null = null;
    let bestSize = 0;
    for (const f of files) {
      if (/\.(vtt|srt|ass|json|part|ytdl|temp|jpg|jpeg|png|webp|description)$/i.test(f)) {
        continue;
      }
      const st = await fs.stat(path.join(dir, f)).catch(() => null);
      if (st?.isFile() && st.size > bestSize) {
        best = f;
        bestSize = st.size;
      }
    }
    return best;
  }

  private noFileMessage(stderr: string): string {
    const s = stderr.toLowerCase();
    if (s.includes("max-filesize") || s.includes("larger than")) {
      return "This video is too large to process. Try a shorter video.";
    }
    if (s.includes("requested format is not available") || s.includes("no video formats")) {
      return "No downloadable video stream was available for this URL.";
    }
    return "The download did not produce a usable video file.";
  }

  /** Fetch English subtitles without downloading the video. Never throws. */
  private async tryFetchSubtitles(url: string, outTemplate: string): Promise<void> {
    try {
      await run(
        this.binary,
        [
          ...this.authArgs(),
          "--no-playlist",
          "--no-warnings",
          "--no-progress",
          "--restrict-filenames",
          "--skip-download",
          "--write-subs",
          "--write-auto-subs",
          // Just the primary English track(s) — avoid pulling dozens of
          // machine-translated variants (which invite rate limiting).
          "--sub-langs",
          "en,en-orig",
          "--convert-subs",
          "vtt",
          "-o",
          outTemplate,
          url,
        ],
        { timeoutMs: 60_000 },
      );
    } catch (e) {
      logger.warn("subtitle fetch failed (continuing without captions)", {
        cause: (e as Error)?.message,
      });
    }
  }

  private mapError(e: unknown): Error {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    const stderr = String(err?.stderr ?? "").toLowerCase();
    const msg = String((e as Error)?.message ?? "").toLowerCase();
    const hay = `${stderr} ${msg}`;

    if (err?.code === "ENOENT") {
      return errors.downloadFailed(
        "yt-dlp is not installed or not on PATH. Set VIDEO_SOURCE_PROVIDER=mock for offline development, or install yt-dlp.",
      );
    }
    if (hay.includes("private video")) return errors.videoPrivate();
    if (
      (hay.includes("age") && (hay.includes("confirm") || hay.includes("restricted"))) ||
      hay.includes("inappropriate for some users")
    ) {
      return errors.ageRestricted(
        this.hasAuth
          ? "This video is age-restricted and the signed-in account couldn't access it."
          : "This video is age-restricted. Sign in by providing your YouTube account cookies (set YTDLP_COOKIES_FROM_BROWSER=chrome, or YTDLP_COOKIES_FILE=/path/to/cookies.txt) and try again.",
      );
    }
    if (hay.includes("sign in to confirm") || hay.includes("not a bot")) {
      return errors.downloadFailed(
        this.hasAuth
          ? "YouTube asked for additional verification even with the provided account."
          : "YouTube requires a signed-in account for this video. Provide your account cookies via YTDLP_COOKIES_FROM_BROWSER or YTDLP_COOKIES_FILE.",
      );
    }
    if (hay.includes("video unavailable") || hay.includes("removed")) {
      return errors.downloadFailed("This video is unavailable.");
    }
    if (hay.includes("timed out") || hay.includes("network") || hay.includes("resolve host")) {
      return errors.network();
    }
    logger.error("yt-dlp download failed", { stderr: stderr.slice(-1000) });
    return errors.downloadFailed();
  }
}
