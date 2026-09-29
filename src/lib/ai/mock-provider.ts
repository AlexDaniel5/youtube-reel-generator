import type { ClipSuggestion, Transcript, TranscriptSegment } from "@/types";
import type { ClipSelectionOptions, ClipSelectionProvider } from "./types";

const HOOK_WORDS = [
  "mistake",
  "secret",
  "never",
  "most",
  "biggest",
  "how",
  "why",
  "stop",
  "truth",
  "data",
  "wish",
  "surprised",
  "impossible",
  "breakthrough",
  "doubled",
  "framework",
  "lesson",
  "changed",
  "counterintuitive",
];

/**
 * Offline, heuristic clip selection. Slides a window over the transcript
 * segments building candidates whose length falls within [min, max] seconds,
 * scores each on hook/interest signals, and returns the best non-overlapping
 * set. Deterministic — good enough to exercise the full flow without an API.
 */
export class MockClipSelectionProvider implements ClipSelectionProvider {
  readonly name = "mock";

  async findClips(
    transcript: Transcript,
    _durationSec: number,
    options: ClipSelectionOptions,
  ): Promise<ClipSuggestion[]> {
    const segs = transcript.segments;
    if (segs.length === 0) return [];

    const candidates: ClipSuggestion[] = [];

    for (let i = 0; i < segs.length; i++) {
      let j = i;
      // Extend the window until it reaches at least minSeconds.
      while (j < segs.length && segs[j]!.end - segs[i]!.start < options.minSeconds) j++;
      // Then keep extending while still within maxSeconds.
      for (let k = j; k < segs.length; k++) {
        const start = segs[i]!.start;
        const end = segs[k]!.end;
        const len = end - start;
        if (len < options.minSeconds) continue;
        if (len > options.maxSeconds) break;
        const window = segs.slice(i, k + 1);
        candidates.push(this.buildSuggestion(window, start, end));
      }
    }

    // Greedy non-overlapping selection by score.
    candidates.sort((a, b) => b.score - a.score);
    const chosen: ClipSuggestion[] = [];
    for (const c of candidates) {
      if (chosen.length >= options.maxSuggestions) break;
      const overlaps = chosen.some((x) => c.start < x.end && c.end > x.start);
      if (!overlaps) chosen.push(c);
    }

    return chosen.sort((a, b) => a.start - b.start);
  }

  private buildSuggestion(
    window: TranscriptSegment[],
    start: number,
    end: number,
  ): ClipSuggestion {
    const text = window.map((s) => s.text).join(" ");
    const lower = text.toLowerCase();

    let score = 40;
    for (const w of HOOK_WORDS) if (lower.includes(w)) score += 6;
    if (/\?/.test(text)) score += 8; // contains a question
    if (/\d/.test(text)) score += 6; // contains a number/statistic
    const firstWord = window[0]!.text.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (["here", "the", "this", "most", "stop", "you"].includes(firstWord)) score += 8;

    // Prefer punchy ~20s clips (within the 10-30s target range).
    const len = end - start;
    const ideal = 20;
    score -= Math.min(20, Math.abs(len - ideal) * 1.2);
    score = Math.max(1, Math.min(99, Math.round(score)));

    const firstSentence = window[0]!.text.trim();
    const title = this.toTitle(firstSentence);
    const preview = text.length > 220 ? text.slice(0, 217) + "…" : text;

    return {
      start: +start.toFixed(2),
      end: +end.toFixed(2),
      title,
      hook: firstSentence,
      score,
      reason: this.reason(lower, len),
      transcriptPreview: preview,
    };
  }

  private toTitle(sentence: string): string {
    const clean = sentence.replace(/[.!?]+$/, "");
    const words = clean.split(/\s+/).slice(0, 9).join(" ");
    return words.length > 0 ? words : "Highlight";
  }

  private reason(lower: string, len: number): string {
    const bits: string[] = [];
    if (HOOK_WORDS.some((w) => lower.includes(w))) bits.push("strong hook");
    if (/\?/.test(lower)) bits.push("poses a question");
    if (/\d/.test(lower)) bits.push("includes a concrete number");
    bits.push("self-contained idea");
    return `${bits.join(", ")} in a tidy ${Math.round(len)}s window.`;
  }
}
