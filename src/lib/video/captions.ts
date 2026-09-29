import type { CaptionStyle, Transcript, TranscriptWord } from "@/types";
import { TARGET_HEIGHT, TARGET_WIDTH } from "./framing";

/** A single on-screen caption line with clip-relative timing. */
export interface CaptionCue {
  start: number; // seconds, relative to clip start
  end: number;
  text: string;
}

export interface CaptionOptions {
  maxWordsPerCue?: number;
  maxCharsPerLine?: number;
  maxCueSeconds?: number;
}

const DEFAULTS: Required<CaptionOptions> = {
  maxWordsPerCue: 5,
  maxCharsPerLine: 20,
  maxCueSeconds: 3.5,
};

/** Collect word-level timestamps overlapping [clipStart, clipEnd]. */
function wordsInRange(
  transcript: Transcript,
  clipStart: number,
  clipEnd: number,
): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  for (const seg of transcript.segments) {
    if (seg.words && seg.words.length > 0) {
      for (const w of seg.words) {
        if (w.end > clipStart && w.start < clipEnd) out.push(w);
      }
    }
  }
  return out;
}

/**
 * Build timed caption cues for a clip. Prefers word-level timestamps; falls
 * back to splitting segment text evenly across the segment's duration when
 * word timings are unavailable.
 */
export function buildCaptionCues(
  transcript: Transcript,
  clipStart: number,
  clipEnd: number,
  options: CaptionOptions = {},
): CaptionCue[] {
  const opts = { ...DEFAULTS, ...options };
  const words = wordsInRange(transcript, clipStart, clipEnd);

  let rawCues: CaptionCue[];
  if (words.length > 0) {
    rawCues = groupWords(words, opts);
  } else {
    rawCues = phraseFallback(transcript, clipStart, clipEnd, opts);
  }

  // Shift to clip-relative time and clamp to the clip window.
  return rawCues
    .map((c) => ({
      text: c.text,
      start: Math.max(0, c.start - clipStart),
      end: Math.min(clipEnd - clipStart, c.end - clipStart),
    }))
    .filter((c) => c.end > c.start && c.text.trim().length > 0);
}

function groupWords(words: TranscriptWord[], opts: Required<CaptionOptions>): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let bucket: TranscriptWord[] = [];

  const flush = () => {
    if (bucket.length === 0) return;
    const first = bucket[0]!;
    const last = bucket[bucket.length - 1]!;
    cues.push({
      start: first.start,
      end: last.end,
      text: bucket.map((w) => w.text).join(" "),
    });
    bucket = [];
  };

  for (const w of words) {
    if (bucket.length > 0) {
      const first = bucket[0]!;
      const tooLong = w.end - first.start > opts.maxCueSeconds;
      const tooMany = bucket.length >= opts.maxWordsPerCue;
      const prev = bucket[bucket.length - 1]!;
      const bigGap = w.start - prev.end > 0.8;
      if (tooLong || tooMany || bigGap) flush();
    }
    bucket.push(w);
  }
  flush();
  return cues;
}

function phraseFallback(
  transcript: Transcript,
  clipStart: number,
  clipEnd: number,
  opts: Required<CaptionOptions>,
): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const seg of transcript.segments) {
    if (seg.end <= clipStart || seg.start >= clipEnd) continue;
    const tokens = seg.text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const segDur = Math.max(0.01, seg.end - seg.start);
    const perToken = segDur / tokens.length;
    for (let i = 0; i < tokens.length; i += opts.maxWordsPerCue) {
      const chunk = tokens.slice(i, i + opts.maxWordsPerCue);
      const start = seg.start + i * perToken;
      const end = seg.start + Math.min(tokens.length, i + chunk.length) * perToken;
      cues.push({ start, end, text: chunk.join(" ") });
    }
  }
  return cues;
}

// --- ASS subtitle generation -------------------------------------------------

interface StylePreset {
  fontName: string;
  fontSize: number;
  primary: string; // &HAABBGGRR
  outline: string;
  back: string;
  bold: 0 | -1;
  borderStyle: 1 | 3; // 1 = outline+shadow, 3 = opaque box
  outlineWidth: number;
  shadow: number;
  marginV: number;
  uppercase: boolean;
}

// ASS colours are &HAABBGGRR (alpha 00 = opaque).
// Presets for the CROP layout: light text with an outline, drawn over the video.
const STYLE_PRESETS: Record<CaptionStyle, StylePreset> = {
  classic: {
    fontName: "DejaVu Sans",
    fontSize: 78,
    primary: "&H00FFFFFF",
    outline: "&H00000000",
    back: "&H00000000",
    bold: -1,
    borderStyle: 1,
    outlineWidth: 5,
    shadow: 2,
    marginV: 380,
    uppercase: false,
  },
  bold: {
    fontName: "DejaVu Sans",
    fontSize: 96,
    primary: "&H0000F2FF", // bright yellow
    outline: "&H00000000",
    back: "&H00000000",
    bold: -1,
    borderStyle: 1,
    outlineWidth: 8,
    shadow: 3,
    marginV: 420,
    uppercase: true,
  },
  minimal: {
    fontName: "DejaVu Sans",
    fontSize: 66,
    primary: "&H00FFFFFF",
    outline: "&H00000000",
    back: "&H00000000",
    bold: 0,
    borderStyle: 1,
    outlineWidth: 2,
    shadow: 0,
    marginV: 300,
    uppercase: false,
  },
  highlight: {
    fontName: "DejaVu Sans",
    fontSize: 80,
    primary: "&H00FFFFFF",
    outline: "&H00000000",
    back: "&H00202020", // opaque dark box behind text
    bold: -1,
    borderStyle: 3,
    outlineWidth: 6,
    shadow: 0,
    marginV: 380,
    uppercase: false,
  },
};

function assTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${h}:${pad(m)}:${pad(sec)}.${pad(Math.min(99, cs))}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/\r?\n/g, " ").trim();
}

/** Insert \N line breaks so no line exceeds maxChars, up to 2 lines. */
function wrapText(text: string, maxChars: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length === 0) line = w;
    else if ((line + " " + w).length <= maxChars) line += " " + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  // Cap at 2 lines; anything extra folds onto the last line.
  if (lines.length > 2) {
    return [lines[0], lines.slice(1).join(" ")].join("\\N");
  }
  return lines.join("\\N");
}

// Presets for the FIT layout: dark text drawn on the solid bands above/below
// the video. Positioned per-event with \pos, so marginV is unused here.
const FIT_STYLE_PRESETS: Record<CaptionStyle, StylePreset> = {
  classic: {
    fontName: "DejaVu Sans",
    fontSize: 74,
    primary: "&H00222222", // near-black
    outline: "&H00FFFFFF",
    back: "&H00000000",
    bold: -1,
    borderStyle: 1,
    outlineWidth: 0,
    shadow: 0,
    marginV: 0,
    uppercase: false,
  },
  bold: {
    fontName: "DejaVu Sans",
    fontSize: 90,
    primary: "&H00141414",
    outline: "&H00FFFFFF",
    back: "&H00000000",
    bold: -1,
    borderStyle: 1,
    outlineWidth: 0,
    shadow: 0,
    marginV: 0,
    uppercase: true,
  },
  minimal: {
    fontName: "DejaVu Sans",
    fontSize: 60,
    primary: "&H00555555", // grey
    outline: "&H00FFFFFF",
    back: "&H00000000",
    bold: 0,
    borderStyle: 1,
    outlineWidth: 0,
    shadow: 0,
    marginV: 0,
    uppercase: false,
  },
  highlight: {
    fontName: "DejaVu Sans",
    fontSize: 76,
    primary: "&H00FFFFFF", // white text on an accent box
    outline: "&H00213CCE", // vermilion (BGR) — box colour via BorderStyle 3
    back: "&H00213CCE",
    bold: -1,
    borderStyle: 3,
    outlineWidth: 6,
    shadow: 0,
    marginV: 0,
    uppercase: false,
  },
};

export interface FitGeometry {
  titleY: number; // vertical centre of the top band (PlayRes coords)
  captionY: number; // vertical centre of the bottom band
}

export interface AssOptions {
  style: CaptionStyle;
  title?: string;
  titleDurationSec?: number; // crop layout only: how long the title shows
  clipDurationSec: number;
  layout?: "crop" | "fit";
  fit?: FitGeometry;
}

const HEADER = [
  "[Script Info]",
  "ScriptType: v4.00+",
  `PlayResX: ${TARGET_WIDTH}`,
  `PlayResY: ${TARGET_HEIGHT}`,
  "ScaledBorderAndShadow: yes",
  "WrapStyle: 2",
];

/**
 * Render caption cues (plus a hook/title) as an ASS subtitle document sized to
 * the 1080x1920 output. Two layouts:
 *  - "crop": light captions with an outline, drawn over the video.
 *  - "fit":  dark captions positioned on the solid bands around the video.
 */
export function renderAss(cues: CaptionCue[], opts: AssOptions): string {
  if (opts.layout === "fit" && opts.fit) return renderFit(cues, opts, opts.fit);
  return renderCrop(cues, opts);
}

function renderCrop(cues: CaptionCue[], opts: AssOptions): string {
  const preset = STYLE_PRESETS[opts.style] ?? STYLE_PRESETS.classic;
  const maxChars = opts.style === "minimal" ? 26 : 20;

  const header = [
    ...HEADER,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Caption,${preset.fontName},${preset.fontSize},${preset.primary},&H000000FF,${preset.outline},${preset.back},${preset.bold},0,0,0,100,100,0,0,${preset.borderStyle},${preset.outlineWidth},${preset.shadow},2,80,80,${preset.marginV},1`,
    `Style: Title,${preset.fontName},72,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,8,60,60,140,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = [];
  if (opts.title && opts.title.trim()) {
    const titleDur = Math.min(
      opts.clipDurationSec,
      opts.titleDurationSec ?? Math.min(4, opts.clipDurationSec),
    );
    const titleText = wrapText(escapeAssText(opts.title.toUpperCase()), 24);
    events.push(`Dialogue: 0,${assTime(0)},${assTime(titleDur)},Title,,0,0,0,,${titleText}`);
  }
  for (const cue of cues) {
    let text = escapeAssText(cue.text);
    if (preset.uppercase) text = text.toUpperCase();
    events.push(
      `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Caption,,0,0,0,,${wrapText(text, maxChars)}`,
    );
  }
  return [...header, ...events, ""].join("\n");
}

function renderFit(cues: CaptionCue[], opts: AssOptions, fit: FitGeometry): string {
  const preset = FIT_STYLE_PRESETS[opts.style] ?? FIT_STYLE_PRESETS.classic;
  const titlePreset = FIT_STYLE_PRESETS.bold; // headline is always strong/dark
  const maxChars =
    opts.style === "minimal" ? 30 : opts.style === "bold" ? 20 : 24;
  const cx = Math.round(TARGET_WIDTH / 2);

  const header = [
    ...HEADER,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Alignment 5 = middle-centre; \pos below places each line precisely.
    `Style: Caption,${preset.fontName},${preset.fontSize},${preset.primary},&H000000FF,${preset.outline},${preset.back},${preset.bold},0,0,0,100,100,0,0,${preset.borderStyle},${preset.outlineWidth},${preset.shadow},5,40,40,0,1`,
    `Style: Title,${titlePreset.fontName},64,&H00161616,&H000000FF,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,40,40,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = [];

  // Headline sits on the top band for the whole clip.
  if (opts.title && opts.title.trim()) {
    const titleText = wrapText(escapeAssText(opts.title.toUpperCase()), 22);
    events.push(
      `Dialogue: 0,${assTime(0)},${assTime(opts.clipDurationSec)},Title,,0,0,0,,{\\an5\\pos(${cx},${fit.titleY})}${titleText}`,
    );
  }

  // Captions sit on the bottom band, timed to the speech.
  for (const cue of cues) {
    let text = escapeAssText(cue.text);
    if (preset.uppercase) text = text.toUpperCase();
    const wrapped = wrapText(text, maxChars);
    events.push(
      `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Caption,,0,0,0,,{\\an5\\pos(${cx},${fit.captionY})}${wrapped}`,
    );
  }

  return [...header, ...events, ""].join("\n");
}
