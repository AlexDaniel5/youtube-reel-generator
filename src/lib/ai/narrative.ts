import type { Transcript, TranscriptSegment, TranscriptWord } from "@/types";

/**
 * Deterministic narrative-analysis engine shared by every clip-selection
 * provider. It turns a word-timed transcript into *sentences* (using punctuation
 * and speech pauses), then scores candidate start/end points so a clip can be
 * cut on a natural boundary rather than a fixed duration.
 *
 * The central idea: the moment that is *most interesting* (the "peak") and the
 * moment the viewer feels *satisfied enough to stop* (the "resolution") are
 * usually DIFFERENT timestamps. `refineBoundaries` finds the peak, then searches
 * forward for the best-scoring resolution while trimming unnecessary trailing
 * content. Everything here is pure and cheap — no model calls — so it both
 * powers the offline mock provider and tightens the LLM provider's rough spans.
 */

// --- lexical signals --------------------------------------------------------

/** Words that, when present, hint a segment is a strong short-form moment. */
export const HOOK_WORDS = [
  "mistake", "secret", "never", "always", "most", "biggest", "how", "why",
  "stop", "truth", "data", "wish", "surprised", "shocked", "impossible",
  "breakthrough", "doubled", "tripled", "framework", "lesson", "changed",
  "counterintuitive", "nobody", "everyone", "actually", "realized", "worst",
  "best", "crazy", "insane", "literally",
];

/** Phrases that signal a thought is *concluding* — ideal places to end. */
const CONCLUSION_CUES = [
  "and that's", "that's why", "that's how", "that's the", "the point is",
  "the lesson", "bottom line", "in the end", "at the end of the day",
  "turns out", "turned out", "i realized", "we realized", "which is why",
  "so that's", "and so", "the takeaway", "long story short", "the moral",
  "ultimately", "in short", "that's what", "and that is", "finally",
];

/** Phrases at the START of the NEXT sentence that mark a topic change — i.e. the
 *  current sentence is a clean place to stop. */
const TOPIC_SHIFT_CUES = [
  "so anyway", "anyway", "okay so", "ok so", "alright so", "now", "let's",
  "lets", "moving on", "another thing", "but yeah", "so yeah", "next",
  "on the other", "speaking of", "by the way", "switching",
];

/** Words a sentence should not END on — leaves the thought dangling. */
const DANGLING_TAIL = new Set([
  "and", "but", "so", "because", "or", "the", "a", "an", "to", "that", "with",
  "of", "for", "in", "on", "at", "is", "was", "were", "are", "like", "um",
  "uh", "if", "when", "while", "as", "by", "from", "into", "about", "my",
  "your", "his", "her", "their", "our", "its",
]);

/** Words a sentence should not START on — they reference missing context,
 *  which means the clip is starting too late / mid-thought. */
const ANAPHORA_HEAD = new Set([
  "and", "but", "so", "because", "or", "then", "also", "which", "it", "this",
  "that", "these", "those", "they", "them", "he", "she", "him", "her", "his",
  "its", "their", "anyway", "plus", "however", "therefore", "thus",
]);

// --- tuning constants -------------------------------------------------------

const SENTENCE_PAUSE = 0.65; // gap (s) that forces a sentence break absent punctuation
const FRESH_START_PAUSE = 0.5; // gap (s) before a sentence that marks a clean entry
const MAX_SENTENCE_WORDS = 42; // safety cap so runaway unpunctuated speech still splits
const START_PAD = 0.12; // lead-in padding (s) so the first word isn't clipped
const END_PAD = 0.18; // tail padding (s) so the final word isn't clipped

// --- sentence model ---------------------------------------------------------

export interface Sentence {
  index: number;
  text: string;
  start: number;
  end: number;
  words: TranscriptWord[];
  gapBefore: number; // silence (s) before this sentence
  gapAfter: number; // silence (s) after this sentence
  endsTerminal: boolean; // ends with . ! ?
}

const TERMINAL_RE = /[.!?]["')\]]?$/;

function wordsOf(segment: TranscriptSegment): TranscriptWord[] {
  if (segment.words && segment.words.length > 0) return segment.words;
  // Synthesize evenly-spaced words when a segment lacks timings.
  const tokens = segment.text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const dur = Math.max(0.2, segment.end - segment.start);
  const per = dur / tokens.length;
  return tokens.map((t, i) => ({
    text: t,
    start: +(segment.start + i * per).toFixed(3),
    end: +(segment.start + (i + 1) * per).toFixed(3),
  }));
}

/** Flatten a transcript into one ordered, de-duplicated word stream. */
function flattenWords(transcript: Transcript): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const seg of transcript.segments) {
    for (const w of wordsOf(seg)) {
      if (!w.text.trim()) continue;
      const prev = words[words.length - 1];
      // Drop verbatim rolling-caption repeats (common in YouTube auto-captions).
      if (prev && prev.text === w.text && Math.abs(prev.start - w.start) < 0.05) continue;
      words.push(w);
    }
  }
  return words.sort((a, b) => a.start - b.start);
}

/**
 * Group a transcript's words into sentences. A boundary is placed after a word
 * that ends with terminal punctuation, after a pause longer than
 * SENTENCE_PAUSE, or when a sentence grows past MAX_SENTENCE_WORDS.
 */
export function buildSentences(transcript: Transcript): Sentence[] {
  const words = flattenWords(transcript);
  if (words.length === 0) return [];

  const groups: TranscriptWord[][] = [];
  let cur: TranscriptWord[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    cur.push(w);
    const next = words[i + 1];
    const gap = next ? next.start - w.end : Infinity;
    const terminal = TERMINAL_RE.test(w.text);
    if (terminal || gap > SENTENCE_PAUSE || cur.length >= MAX_SENTENCE_WORDS) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) groups.push(cur);

  const sentences: Sentence[] = groups.map((g, index) => ({
    index,
    text: g.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim(),
    start: g[0]!.start,
    end: g[g.length - 1]!.end,
    words: g,
    gapBefore: 0,
    gapAfter: 0,
    endsTerminal: TERMINAL_RE.test(g[g.length - 1]!.text),
  }));

  for (let i = 0; i < sentences.length; i++) {
    const prev = sentences[i - 1];
    const next = sentences[i + 1];
    sentences[i]!.gapBefore = prev ? Math.max(0, sentences[i]!.start - prev.end) : Infinity;
    sentences[i]!.gapAfter = next ? Math.max(0, next.start - sentences[i]!.end) : Infinity;
  }
  return sentences;
}

// --- scoring helpers --------------------------------------------------------

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function firstWord(text: string): string {
  return (text.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z']/g, "");
}

function lastWord(text: string): string {
  const toks = text.trim().split(/\s+/);
  return (toks[toks.length - 1] ?? "").toLowerCase().replace(/[^a-z']/g, "");
}

/**
 * How satisfying it is to END a clip on this sentence. This is the explicit
 * "ending quality" concept: it rewards finished sentences, conclusions,
 * emotional/narrative resolution and natural pauses, and penalizes dangling or
 * mid-thought stops. Range roughly [-40, 80].
 */
export function endingScore(sentences: Sentence[], idx: number): number {
  const s = sentences[idx];
  if (!s) return -Infinity;
  const lower = s.text.toLowerCase();
  let score = 0;

  // sentence_completion
  if (s.endsTerminal) score += 25;
  else score += Math.min(14, Math.max(0, s.gapAfter) * 16);

  // conclusion_strength / thought_completion
  if (includesAny(lower, CONCLUSION_CUES)) score += 22;

  // pause / natural_break
  score += Math.min(16, Math.max(0, s.gapAfter) * 18);

  // topic_transition — next sentence starts a new subject
  const next = sentences[idx + 1];
  if (next && includesAny(next.text.toLowerCase(), TOPIC_SHIFT_CUES)) score += 10;

  // emotional_resolution (approximated): a concluded thought that lands cleanly
  if (s.endsTerminal && includesAny(lower, CONCLUSION_CUES)) score += 8;

  // a trailing question is usually a hook, not a resolution
  if (/\?["')\]]?$/.test(s.text)) score -= 8;

  // penalties
  if (DANGLING_TAIL.has(lastWord(s.text))) score -= 32; // unfinished_sentence_penalty
  if (!s.endsTerminal && s.gapAfter < 0.25) score -= 16; // cut mid-sentence
  if (s.words.length < 3) score -= 8; // ending on a fragment / filler

  return score;
}

/**
 * How clean it is to START a clip on this sentence — rewards a fresh entry and
 * hooks, penalizes starting mid-sentence or on a word that needs prior context.
 */
export function startScore(sentences: Sentence[], idx: number): number {
  const s = sentences[idx];
  if (!s) return -Infinity;
  let score = 0;

  if (s.gapBefore > FRESH_START_PAUSE) score += 12; // clean entry after a pause
  if (HOOK_WORDS.includes(firstWord(s.text))) score += 14;
  if (includesAny(s.text.toLowerCase().slice(0, 40), HOOK_WORDS)) score += 6;

  if (ANAPHORA_HEAD.has(firstWord(s.text))) score -= 22; // references missing context

  const prev = sentences[idx - 1];
  if (prev && !prev.endsTerminal && s.gapBefore < 0.25) score -= 18; // mid-sentence

  return score;
}

/** Interest/peak strength of a single sentence — the "something happens here". */
export function interestScore(sentences: Sentence[], idx: number): number {
  const s = sentences[idx];
  if (!s) return 0;
  const lower = s.text.toLowerCase();
  let score = 0;
  for (const w of HOOK_WORDS) if (lower.includes(w)) score += 5;
  if (/\?/.test(s.text)) score += 7; // poses a question
  if (/\d/.test(s.text)) score += 6; // concrete number / statistic
  if (/!/.test(s.text)) score += 4; // emphatic delivery
  if (s.words.length >= 6 && s.words.length <= 30) score += 4; // substantive, not filler
  return score;
}

// --- boundary refinement ----------------------------------------------------

export interface RefineInput {
  sentences: Sentence[];
  /** Rough start of the idea (seconds). */
  roughStart: number;
  /** Rough end / resolution (seconds). */
  roughEnd: number;
  /** The interesting moment the clip is built around (seconds). */
  peakStart: number;
  peakEnd: number;
  minSeconds: number;
  maxSeconds: number;
  durationSec: number;
}

export interface RefinedClip {
  start: number;
  end: number;
  startIdx: number;
  endIdx: number;
  peakIdx: number;
  endingQuality: number; // endingScore at the chosen end
  startQuality: number; // startScore at the chosen start
}

function containingIndex(sentences: Sentence[], t: number): number {
  // Last sentence that starts at or before t (floor), clamped to range.
  let idx = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i]!.start <= t + 0.001) idx = i;
    else break;
  }
  return idx;
}

/** Reward clips that land in a comfortable duration band and gently penalize
 *  overly long clips so trailing filler doesn't get swept in. */
function durationComfort(len: number, min: number, max: number): number {
  const idealLow = min + (max - min) * 0.35;
  const idealHigh = max - (max - min) * 0.1;
  if (len < min) return -20;
  if (len <= idealLow) return 6 + ((len - min) / Math.max(1, idealLow - min)) * 6; // ramp up to band
  if (len <= idealHigh) return 12; // in the sweet spot
  return 12 - (len - idealHigh) * 0.9; // past the band: discourage trailing content
}

/**
 * The core of the system. Given rough spans from a provider plus a peak, snap
 * to real sentence boundaries and choose the start/end that reads as an
 * intentionally edited clip: a clean entry before the peak, and the
 * best-scoring resolution after it within the duration budget.
 */
export function refineBoundaries(input: RefineInput): RefinedClip | null {
  const { sentences, minSeconds, maxSeconds, durationSec } = input;
  if (sentences.length === 0) return null;

  const roughStartIdx = containingIndex(sentences, input.roughStart);
  const peakStartIdx = containingIndex(sentences, input.peakStart);
  const peakEndIdx = Math.max(peakStartIdx, containingIndex(sentences, input.peakEnd));

  // --- choose the start: cleanest sentence at/just-before the rough start,
  //     never after the peak begins. ---
  const startLo = Math.max(0, Math.min(roughStartIdx, peakStartIdx) - 2);
  const startHi = Math.min(peakStartIdx, sentences.length - 1);
  let startIdx = Math.min(roughStartIdx, startHi);
  let bestStart = -Infinity;
  for (let i = startLo; i <= startHi; i++) {
    // Keep the resulting clip within budget relative to the peak.
    if (sentences[peakEndIdx]!.end - sentences[i]!.start > maxSeconds) continue;
    const sc = startScore(sentences, i) - Math.abs(i - roughStartIdx) * 1.5;
    if (sc > bestStart) {
      bestStart = sc;
      startIdx = i;
    }
  }

  // --- choose the end: search forward from the peak for the best resolution. ---
  const firstEnd = Math.max(peakEndIdx, startIdx);
  let endIdx = firstEnd;
  let bestEnd = -Infinity;
  let fallbackIdx = firstEnd; // best within-budget candidate ignoring the min floor
  let fallbackLen = 0;
  for (let i = firstEnd; i < sentences.length; i++) {
    const len = sentences[i]!.end - sentences[startIdx]!.start;
    if (len > maxSeconds) {
      if (i === firstEnd) {
        // The peak alone already exceeds max; take it and let the caller clamp.
        endIdx = i;
      }
      break;
    }
    fallbackIdx = i;
    fallbackLen = len;
    if (len < minSeconds) continue; // too short to be a real clip yet
    const val = endingScore(sentences, i) + durationComfort(len, minSeconds, maxSeconds);
    if (val > bestEnd) {
      bestEnd = val;
      endIdx = i;
    }
  }
  // If nothing reached the minimum length, take the longest in-budget candidate.
  if (bestEnd === -Infinity) {
    endIdx = fallbackIdx;
    void fallbackLen;
  }

  const startSent = sentences[startIdx]!;
  const endSent = sentences[endIdx]!;
  const start = Math.max(0, startSent.start - START_PAD);
  const rawEnd = endSent.end + END_PAD;
  const end = Math.min(durationSec > 0 ? durationSec : rawEnd, rawEnd);
  if (end - start < 1) return null;

  return {
    start: +start.toFixed(2),
    end: +end.toFixed(2),
    startIdx,
    endIdx,
    peakIdx: peakStartIdx,
    endingQuality: endingScore(sentences, endIdx),
    startQuality: startScore(sentences, startIdx),
  };
}

/** Concatenated text of a sentence range (inclusive). */
export function sliceText(sentences: Sentence[], startIdx: number, endIdx: number): string {
  return sentences
    .slice(startIdx, endIdx + 1)
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- de-duplication ---------------------------------------------------------

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

/** Jaccard similarity of two texts' significant tokens, 0..1. */
export function textSimilarity(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export interface DedupeItem {
  start: number;
  end: number;
  score: number;
  text: string;
}

/**
 * Greedily keep the highest-scoring, non-overlapping, non-repetitive clips.
 * Removes both time overlaps and clips whose transcript is too similar to one
 * already chosen (the same point made twice).
 */
export function dedupeClips<T extends DedupeItem>(
  items: T[],
  maxCount: number,
  simThreshold = 0.6,
): T[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const chosen: T[] = [];
  for (const c of sorted) {
    if (chosen.length >= maxCount) break;
    const overlaps = chosen.some((x) => c.start < x.end && c.end > x.start);
    if (overlaps) continue;
    const repeats = chosen.some((x) => textSimilarity(c.text, x.text) >= simThreshold);
    if (repeats) continue;
    chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}
