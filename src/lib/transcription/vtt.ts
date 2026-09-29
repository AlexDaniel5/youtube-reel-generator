import type { Transcript, TranscriptSegment, TranscriptWord } from "@/types";

/** Parse an ASS/VTT timestamp like "00:01:02.500" or "01:02.500" to seconds. */
function ts(v: string): number {
  const parts = v.trim().split(":");
  let h = 0,
    m = 0,
    s = 0;
  if (parts.length === 3) [h, m, s] = parts.map(Number) as [number, number, number];
  else if (parts.length === 2) [m, s] = parts.map(Number) as [number, number];
  else s = Number(parts[0]);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

const CUE_TIME = /(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})/;
const INLINE_TS = /<(\d{1,2}:\d{2}:\d{2}[.,]\d{3})>/g;

interface RawCue {
  start: number;
  end: number;
  payload: string;
}

function stripTags(s: string): string {
  return s
    .replace(INLINE_TS, " ")
    .replace(/<\/?c[^>]*>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCues(vtt: string): RawCue[] {
  const blocks = vtt.replace(/\r/g, "").split(/\n\n+/);
  const cues: RawCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeLine = lines.find((l) => CUE_TIME.test(l));
    if (!timeLine) continue;
    const m = CUE_TIME.exec(timeLine)!;
    const start = ts(m[1]!.replace(",", "."));
    const end = ts(m[2]!.replace(",", "."));
    const payload = lines.slice(lines.indexOf(timeLine) + 1).join("\n");
    if (payload.trim()) cues.push({ start, end, payload });
  }
  return cues;
}

/** Pull word-level timings out of inline <timestamp> tags, if present. */
function extractWords(cues: RawCue[]): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const cue of cues) {
    if (!/<\d{1,2}:\d{2}/.test(cue.payload)) continue;
    // Split payload into [text]<ts>[text]<ts>... — the text after a tag started
    // at that tag; the leading text starts at the cue start.
    const segments = cue.payload.split(INLINE_TS);
    // segments: [leadText, ts1, text1, ts2, text2, ...]
    let cursor = cue.start;
    const lead = stripTags(segments[0] ?? "");
    if (lead) words.push({ text: lead, start: cue.start, end: cue.start });
    for (let i = 1; i < segments.length; i += 2) {
      const t = ts((segments[i] ?? "").replace(",", "."));
      const text = stripTags(segments[i + 1] ?? "");
      cursor = t;
      if (text) words.push({ text, start: t, end: t });
    }
    void cursor;
  }
  // Assign each word an end = next word's start; dedupe exact repeats.
  const deduped: TranscriptWord[] = [];
  const seen = new Set<string>();
  for (const w of words) {
    const key = `${w.start.toFixed(2)}:${w.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(w);
  }
  deduped.sort((a, b) => a.start - b.start);
  for (let i = 0; i < deduped.length; i++) {
    const next = deduped[i + 1];
    deduped[i]!.end = next
      ? Math.max(deduped[i]!.start + 0.05, Math.min(next.start, deduped[i]!.start + 1.2))
      : deduped[i]!.start + 0.4;
  }
  return deduped;
}

function groupWords(words: TranscriptWord[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let bucket: TranscriptWord[] = [];
  const flush = () => {
    if (bucket.length === 0) return;
    segments.push({
      text: bucket.map((w) => w.text).join(" "),
      start: bucket[0]!.start,
      end: bucket[bucket.length - 1]!.end,
      words: bucket,
    });
    bucket = [];
  };
  for (const w of words) {
    const prev = bucket[bucket.length - 1];
    if (prev && (w.start - prev.end > 0.8 || bucket.length >= 12)) flush();
    bucket.push(w);
  }
  flush();
  return segments;
}

/** Fallback: build phrase segments from plain cues (no inline word timings). */
function phraseSegments(cues: RawCue[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let lastText = "";
  for (const cue of cues) {
    const text = stripTags(cue.payload);
    if (!text || text === lastText) continue; // skip rolling duplicates
    lastText = text;
    const tokens = text.split(/\s+/);
    const dur = Math.max(0.3, cue.end - cue.start);
    const per = dur / tokens.length;
    segments.push({
      text,
      start: cue.start,
      end: cue.end,
      words: tokens.map((tok, i) => ({
        text: tok,
        start: +(cue.start + i * per).toFixed(3),
        end: +(cue.start + (i + 1) * per).toFixed(3),
      })),
    });
  }
  return segments;
}

/**
 * Convert a WebVTT caption file into our Transcript shape. Handles both
 * YouTube auto-captions (inline word-level timestamps, rolling duplicate lines)
 * and plain uploaded subtitle tracks.
 */
export function parseVttToTranscript(vtt: string, durationSec: number): Transcript {
  const cues = parseCues(vtt);
  const words = extractWords(cues);
  const segments = words.length > 0 ? groupWords(words) : phraseSegments(cues);

  const end = segments.length > 0 ? segments[segments.length - 1]!.end : 0;
  return {
    text: segments.map((s) => s.text).join(" "),
    language: "en",
    durationSec: durationSec > 0 ? durationSec : end,
    segments,
  };
}
