import Anthropic from "@anthropic-ai/sdk";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ClipSuggestion, Transcript } from "@/types";
import type { ClipSelectionOptions, ClipSelectionProvider } from "./types";

interface RawClip {
  start?: number;
  end?: number;
  title?: string;
  hook?: string;
  score?: number;
  reason?: string;
}

/**
 * Claude-powered clip selection. Sends a timestamped transcript and asks for
 * structured JSON describing the strongest self-contained short-form segments.
 */
export class AnthropicClipSelectionProvider implements ClipSelectionProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    if (!apiKey) throw errors.ai("AI_API_KEY is not configured.");
    this.client = new Anthropic({ apiKey });
  }

  async findClips(
    transcript: Transcript,
    durationSec: number,
    options: ClipSelectionOptions,
  ): Promise<ClipSuggestion[]> {
    const transcriptText = this.formatTranscript(transcript);

    const system = [
      "You are an expert short-form video editor. You find the best moments in a",
      "long video to turn into vertical Shorts/Reels/TikToks.",
      "Look for: strong hooks, interesting or surprising statements, stories,",
      "useful advice, emotional or controversial moments, and self-contained ideas",
      "that make sense WITHOUT the surrounding video. Avoid clips that require",
      `several minutes of prior context. Prefer clips ${options.minSeconds}-${options.maxSeconds}s long.`,
      "Return ONLY valid JSON, no prose, matching exactly:",
      '{"clips":[{"start":number,"end":number,"title":string,"hook":string,"score":number,"reason":string}]}',
      "start/end are seconds into the video. score is 0-100. title is a punchy",
      `hook/headline. Return at most ${options.maxSuggestions} clips, best first.`,
    ].join(" ");

    const user = [
      `Video duration: ${durationSec.toFixed(1)}s.`,
      "Timestamped transcript (each line: [start-end] text):",
      transcriptText,
    ].join("\n");

    let text: string;
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: user }],
      });
      text = res.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
    } catch (e) {
      throw errors.ai("The AI clip detection request failed.", e);
    }

    const raw = this.parseJson(text);
    return this.normalize(raw, durationSec, options);
  }

  private formatTranscript(transcript: Transcript): string {
    // Cap size defensively for very long videos.
    const lines = transcript.segments.map(
      (s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`,
    );
    const joined = lines.join("\n");
    return joined.length > 24000 ? joined.slice(0, 24000) : joined;
  }

  private parseJson(text: string): RawClip[] {
    let body = text.trim();
    // Strip markdown code fences if present.
    body = body.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    // Extract the first {...} block if there's surrounding noise.
    const first = body.indexOf("{");
    const last = body.lastIndexOf("}");
    if (first >= 0 && last > first) body = body.slice(first, last + 1);

    try {
      const parsed = JSON.parse(body) as { clips?: RawClip[] };
      return Array.isArray(parsed.clips) ? parsed.clips : [];
    } catch (e) {
      logger.error("failed to parse AI clip JSON", { sample: text.slice(0, 300) });
      throw errors.ai("The AI returned an unreadable response.", e);
    }
  }

  private normalize(
    raw: RawClip[],
    durationSec: number,
    options: ClipSelectionOptions,
  ): ClipSuggestion[] {
    const out: ClipSuggestion[] = [];
    for (const c of raw) {
      let start = Number(c.start);
      let end = Number(c.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      start = Math.max(0, start);
      end = Math.min(durationSec || end, end);
      if (end - start < 3) continue; // reject nonsense
      out.push({
        start: +start.toFixed(2),
        end: +end.toFixed(2),
        title: (c.title ?? "Highlight").toString().slice(0, 120),
        hook: (c.hook ?? c.title ?? "").toString().slice(0, 200),
        score: Math.max(0, Math.min(100, Math.round(Number(c.score ?? 50)))),
        reason: (c.reason ?? "Selected by AI.").toString().slice(0, 300),
        transcriptPreview: (c.hook ?? c.title ?? "").toString().slice(0, 220),
      });
    }
    return out.slice(0, options.maxSuggestions);
  }
}
