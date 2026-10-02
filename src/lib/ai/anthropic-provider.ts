import Anthropic from "@anthropic-ai/sdk";
import { errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ClipSuggestion, Transcript } from "@/types";
import type { ClipSelectionOptions, ClipSelectionProvider } from "./types";
import { buildSentences, dedupeClips, refineBoundaries, sliceText } from "./narrative";

/**
 * A semantic "moment" the model found in the transcript. It deliberately
 * separates the *peak* (the most interesting instant) from the *resolution*
 * (where the idea concludes) — these are usually different timestamps — and the
 * natural *idea start*. The deterministic narrative engine then snaps these
 * rough spans to real sentence/pause boundaries.
 */
interface RawMoment {
  kind?: string;
  ideaStart?: number;
  peakStart?: number;
  peakEnd?: number;
  resolutionEnd?: number;
  title?: string;
  hook?: string;
  hookScore?: number;
  contentScore?: number;
  peakScore?: number;
  narrativeCoherence?: number;
  standalone?: number;
  viralPotential?: number;
  endsOnConclusion?: boolean;
  reason?: string;
}

/**
 * Claude-powered clip selection. The model reads a timestamped transcript and
 * returns semantic moments with a hook → build-up → peak → resolution shape;
 * the deterministic engine then refines the exact in/out points and blends the
 * model's engagement judgment with a measured ending-quality score.
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
      "You are an expert short-form video editor who cuts Shorts/Reels/TikToks",
      "from long videos. A great clip is not just an interesting sentence — it is",
      "a complete little story: HOOK -> CONTEXT -> BUILD-UP -> PEAK -> RESOLUTION.",
      "",
      "Your job is to find self-contained moments that make sense WITHOUT the rest",
      "of the video: strong hooks, surprising statements, compelling stories,",
      "punchlines, strong opinions, emotional beats, and useful takeaways.",
      "",
      "CRITICAL: for each moment, distinguish THREE different timestamps:",
      "- ideaStart: where the idea/story naturally BEGINS (so the viewer has",
      "  enough context — not mid-sentence, not referencing something unseen).",
      "- peakStart/peakEnd: the single most interesting/exciting instant.",
      "- resolutionEnd: where the idea CONCLUDES and the viewer feels satisfied",
      "  (a punchline, realization, answer, or takeaway). This is usually LATER",
      "  than the peak. Prefer a slightly longer clip that resolves over a short",
      "  one that stops right after the exciting line. But do NOT include trailing",
      "  content once the speaker moves to an unrelated topic.",
      "",
      `Target ${options.minSeconds}-${options.maxSeconds}s per clip. Avoid clips`,
      "that need minutes of prior context, and avoid repeating the same point.",
      "",
      "Return ONLY valid JSON, no prose, matching exactly:",
      '{"moments":[{"kind":string,"ideaStart":number,"peakStart":number,',
      '"peakEnd":number,"resolutionEnd":number,"title":string,"hook":string,',
      '"hookScore":number,"contentScore":number,"peakScore":number,',
      '"narrativeCoherence":number,"standalone":number,"viralPotential":number,',
      '"endsOnConclusion":boolean,"reason":string}]}',
      "All timestamps are seconds into the video. All *Score fields are 0-100.",
      'kind is one of: "story","insight","question_answer","argument","anecdote",',
      '"joke","hot_take","how_to","emotional". title is a punchy headline.',
      `Return at most ${options.maxSuggestions} moments, best first.`,
    ].join("\n");

    const user = [
      `Video duration: ${durationSec.toFixed(1)}s.`,
      "Timestamped transcript (each line: [start-end] text):",
      transcriptText,
    ].join("\n");

    let text: string;
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 3000,
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

    const moments = this.parseJson(text);
    return this.refineAndScore(moments, transcript, durationSec, options);
  }

  private formatTranscript(transcript: Transcript): string {
    const lines = transcript.segments.map(
      (s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`,
    );
    const joined = lines.join("\n");
    return joined.length > 24000 ? joined.slice(0, 24000) : joined;
  }

  private parseJson(text: string): RawMoment[] {
    let body = text.trim();
    body = body.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const first = body.indexOf("{");
    const last = body.lastIndexOf("}");
    if (first >= 0 && last > first) body = body.slice(first, last + 1);

    try {
      const parsed = JSON.parse(body) as { moments?: RawMoment[]; clips?: RawMoment[] };
      const list = parsed.moments ?? parsed.clips; // tolerate the older key
      return Array.isArray(list) ? list : [];
    } catch (e) {
      logger.error("failed to parse AI moment JSON", { sample: text.slice(0, 300) });
      throw errors.ai("The AI returned an unreadable response.", e);
    }
  }

  /**
   * Snap each model moment to real sentence boundaries and compute a composite
   * score that blends the model's engagement judgment with the measured
   * ending-quality from the deterministic engine.
   */
  private refineAndScore(
    moments: RawMoment[],
    transcript: Transcript,
    durationSec: number,
    options: ClipSelectionOptions,
  ): ClipSuggestion[] {
    const sentences = buildSentences(transcript);

    interface Cand {
      start: number;
      end: number;
      score: number;
      text: string;
      title: string;
      hook: string;
      reason: string;
      preview: string;
    }
    const candidates: Cand[] = [];

    for (const m of moments) {
      const peakStart = num(m.peakStart ?? m.ideaStart);
      const peakEnd = num(m.peakEnd ?? m.peakStart ?? m.ideaStart);
      const ideaStart = num(m.ideaStart ?? m.peakStart);
      const resolutionEnd = num(m.resolutionEnd ?? m.peakEnd ?? m.peakStart);
      if (peakStart === null) continue;

      let start: number;
      let end: number;
      let endingQuality = 0;
      let text: string;

      if (sentences.length > 0) {
        const refined = refineBoundaries({
          sentences,
          roughStart: ideaStart ?? peakStart,
          roughEnd: resolutionEnd ?? peakEnd ?? peakStart,
          peakStart,
          peakEnd: peakEnd ?? peakStart,
          minSeconds: options.minSeconds,
          maxSeconds: options.maxSeconds,
          durationSec,
        });
        if (!refined) continue;
        start = refined.start;
        end = refined.end;
        endingQuality = refined.endingQuality;
        text = sliceText(sentences, refined.startIdx, refined.endIdx);
      } else {
        // No word timings to snap to — fall back to the model's raw span.
        start = Math.max(0, ideaStart ?? peakStart);
        end = Math.min(durationSec || (resolutionEnd ?? peakStart), resolutionEnd ?? peakStart);
        text = (m.hook ?? m.title ?? "").toString();
      }

      if (end - start < Math.min(3, options.minSeconds)) continue;

      // Composite 0-100: the model's content/hook/viral judgment plus the
      // measured ending quality (so a satisfying resolution is rewarded).
      const engagement =
        0.3 * clamp100(m.peakScore) +
        0.2 * clamp100(m.hookScore) +
        0.2 * clamp100(m.viralPotential) +
        0.15 * clamp100(m.contentScore) +
        0.15 * clamp100(m.standalone);
      const endingBonus = Math.min(15, Math.max(-10, endingQuality * 0.25));
      const score = Math.max(1, Math.min(100, Math.round(engagement + endingBonus)));

      const title = (m.title ?? "Highlight").toString().slice(0, 120);
      const hook = (m.hook ?? m.title ?? "").toString().slice(0, 200);
      const base = (m.reason ?? "Selected by AI.").toString().slice(0, 240);
      const endNote =
        endingQuality >= 30
          ? " Ends on a clear conclusion."
          : endingQuality >= 10
            ? " Trimmed to a natural stopping point."
            : "";
      candidates.push({
        start,
        end,
        score,
        text: text || hook,
        title,
        hook,
        reason: `${base}${endNote}`.slice(0, 300),
        preview: (text || hook).slice(0, 220),
      });
    }

    const chosen = dedupeClips(candidates, options.maxSuggestions);
    return chosen.map((c) => ({
      start: +c.start.toFixed(2),
      end: +c.end.toFixed(2),
      title: c.title,
      hook: c.hook,
      score: c.score,
      reason: c.reason,
      transcriptPreview: c.preview,
    }));
  }
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp100(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50; // neutral default when the model omits a field
  return Math.max(0, Math.min(100, n));
}
