import type { ClipSuggestion, Transcript } from "@/types";
import type { ClipSelectionOptions, ClipSelectionProvider } from "./types";
import {
  buildSentences,
  dedupeClips,
  interestScore,
  refineBoundaries,
  sliceText,
  type Sentence,
} from "./narrative";

interface ScoredCandidate {
  start: number;
  end: number;
  score: number;
  text: string;
  title: string;
  hook: string;
  reason: string;
  preview: string;
}

/**
 * Offline, heuristic clip selection. Rather than sliding a fixed-length window,
 * it treats each high-interest sentence as a potential *peak*, then uses the
 * shared narrative engine to snap the clip to a clean start and a satisfying
 * resolution (peak → conclusion), scoring each candidate on interest + ending
 * quality + duration fit. Deterministic — good enough to exercise the full flow
 * without an API, and it now produces clips that actually resolve.
 */
export class MockClipSelectionProvider implements ClipSelectionProvider {
  readonly name = "mock";

  async findClips(
    transcript: Transcript,
    durationSec: number,
    options: ClipSelectionOptions,
  ): Promise<ClipSuggestion[]> {
    const sentences = buildSentences(transcript);
    if (sentences.length === 0) return [];

    // Rank sentences by interest; the strongest become peak seeds. We consider
    // a generous pool so dedupe/overlap filtering has room to work.
    const seeds = sentences
      .map((s, i) => ({ i, interest: interestScore(sentences, i) }))
      .sort((a, b) => b.interest - a.interest)
      .slice(0, Math.max(options.maxSuggestions * 4, 12));

    const candidates: ScoredCandidate[] = [];
    for (const seed of seeds) {
      const cand = this.buildCandidate(sentences, seed.i, seed.interest, durationSec, options);
      if (cand) candidates.push(cand);
    }

    const chosen = dedupeClips(candidates, options.maxSuggestions);
    return chosen.map((c) => ({
      start: c.start,
      end: c.end,
      title: c.title,
      hook: c.hook,
      score: Math.max(1, Math.min(99, Math.round(c.score))),
      reason: c.reason,
      transcriptPreview: c.preview,
    }));
  }

  private buildCandidate(
    sentences: Sentence[],
    peakIdx: number,
    interest: number,
    durationSec: number,
    options: ClipSelectionOptions,
  ): ScoredCandidate | null {
    const peak = sentences[peakIdx]!;
    const refined = refineBoundaries({
      sentences,
      roughStart: peak.start,
      roughEnd: peak.end,
      peakStart: peak.start,
      peakEnd: peak.end,
      minSeconds: options.minSeconds,
      maxSeconds: options.maxSeconds,
      durationSec,
    });
    if (!refined) return null;

    const text = sliceText(sentences, refined.startIdx, refined.endIdx);
    const len = refined.end - refined.start;

    // Composite: interest of the peak + how well the clip starts and resolves.
    const score =
      45 +
      Math.min(26, interest) +
      Math.min(18, refined.endingQuality * 0.3) +
      Math.min(10, Math.max(-10, refined.startQuality * 0.5));

    const hookSentence = sentences[refined.startIdx]!.text.trim();
    return {
      start: refined.start,
      end: refined.end,
      score,
      text,
      title: this.toTitle(hookSentence),
      hook: hookSentence,
      reason: this.reason(refined.endingQuality, refined.endIdx > peakIdx, len),
      preview: text.length > 220 ? text.slice(0, 217) + "…" : text,
    };
  }

  private toTitle(sentence: string): string {
    const clean = sentence.replace(/[.!?]+$/, "");
    const words = clean.split(/\s+/).slice(0, 9).join(" ");
    return words.length > 0 ? words : "Highlight";
  }

  private reason(endingQuality: number, resolvesAfterPeak: boolean, len: number): string {
    const bits: string[] = [];
    bits.push(resolvesAfterPeak ? "runs past the peak to a resolution" : "self-contained moment");
    if (endingQuality >= 30) bits.push("ends on a clean conclusion");
    else if (endingQuality >= 10) bits.push("ends on a natural pause");
    return `${bits.join(", ")} in a tidy ${Math.round(len)}s window.`;
  }
}
