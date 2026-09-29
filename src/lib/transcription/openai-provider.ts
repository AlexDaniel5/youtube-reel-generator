import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runFfmpeg } from "@/lib/video/ffmpeg";
import { probeVideo } from "@/lib/video/metadata";
import { errors } from "@/lib/errors";
import type { Transcript, TranscriptSegment, TranscriptWord } from "@/types";
import type { TranscriptionProvider } from "./types";

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}
interface WhisperSegment {
  text: string;
  start: number;
  end: number;
}
interface WhisperVerbose {
  text: string;
  language?: string;
  duration?: number;
  words?: WhisperWord[];
  segments?: WhisperSegment[];
}

/**
 * OpenAI (Whisper-compatible) transcription. Extracts audio with ffmpeg and
 * uploads it to the configured endpoint requesting word- and segment-level
 * timestamps.
 */
export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async transcribe(videoPath: string): Promise<Transcript> {
    if (!this.apiKey) {
      throw errors.transcription("TRANSCRIPTION_API_KEY is not configured.");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-audio-"));
    const audioPath = path.join(tmpDir, "audio.mp3");

    try {
      await runFfmpeg(["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "96k", audioPath]);

      const bytes = await fs.readFile(audioPath);
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "audio/mpeg" }), "audio.mp3");
      form.append("model", this.model);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      form.append("timestamp_granularities[]", "segment");

      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw errors.transcription(
          `Transcription API returned ${res.status}.`,
          body.slice(0, 500),
        );
      }

      const data = (await res.json()) as WhisperVerbose;
      return this.toTranscript(data, videoPath);
    } catch (e) {
      if (e instanceof Error && e.name === "AppError") throw e;
      throw errors.transcription("Transcription request failed.", e);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async toTranscript(data: WhisperVerbose, videoPath: string): Promise<Transcript> {
    let durationSec = data.duration ?? 0;
    if (!durationSec) {
      durationSec = (await probeVideo(videoPath).catch(() => null))?.durationSec ?? 0;
    }

    const words: TranscriptWord[] = (data.words ?? []).map((w) => ({
      text: w.word,
      start: w.start,
      end: w.end,
    }));

    let segments: TranscriptSegment[];
    if (data.segments && data.segments.length > 0) {
      segments = data.segments.map((s) => ({
        text: s.text.trim(),
        start: s.start,
        end: s.end,
        words: words.filter((w) => w.end > s.start && w.start < s.end),
      }));
    } else if (words.length > 0) {
      // Synthesize one segment if only words were returned.
      segments = [
        {
          text: data.text,
          start: words[0]!.start,
          end: words[words.length - 1]!.end,
          words,
        },
      ];
    } else {
      segments = [{ text: data.text, start: 0, end: durationSec, words: [] }];
    }

    return { text: data.text, language: data.language, durationSec, segments };
  }
}
