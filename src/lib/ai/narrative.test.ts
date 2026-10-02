import { describe, it, expect } from "vitest";
import type { Transcript, TranscriptWord } from "@/types";
import {
  buildSentences,
  dedupeClips,
  endingScore,
  refineBoundaries,
  startScore,
  textSimilarity,
} from "./narrative";

/** Build a transcript from a script where each entry is a run of words sharing
 *  even timing, with an explicit pause (s) inserted after it. */
function transcriptFrom(
  parts: { text: string; pauseAfter?: number }[],
  wordDur = 0.3,
): Transcript {
  const words: TranscriptWord[] = [];
  let t = 0;
  for (const part of parts) {
    for (const tok of part.text.split(/\s+/)) {
      words.push({ text: tok, start: +t.toFixed(3), end: +(t + wordDur).toFixed(3) });
      t += wordDur;
    }
    t += part.pauseAfter ?? 0;
  }
  return {
    text: parts.map((p) => p.text).join(" "),
    durationSec: +t.toFixed(3),
    segments: [{ text: parts.map((p) => p.text).join(" "), start: 0, end: t, words }],
  };
}

describe("buildSentences", () => {
  it("splits on terminal punctuation", () => {
    const tr = transcriptFrom([{ text: "Hello there world." }, { text: "Second sentence here!" }]);
    const s = buildSentences(tr);
    expect(s.length).toBe(2);
    expect(s[0]!.endsTerminal).toBe(true);
    expect(s[1]!.text).toContain("Second");
  });

  it("splits on a long pause even without punctuation", () => {
    const tr = transcriptFrom([
      { text: "no punctuation here", pauseAfter: 1.0 },
      { text: "but a clear pause" },
    ]);
    const s = buildSentences(tr);
    expect(s.length).toBe(2);
    expect(s[0]!.gapAfter).toBeGreaterThan(0.65);
  });
});

describe("endingScore", () => {
  it("rewards a concluding, terminated sentence over a dangling one", () => {
    const tr = transcriptFrom([
      { text: "and that's why I quit my job." },
      { text: "so anyway the next thing" },
    ]);
    const s = buildSentences(tr);
    const concluded = endingScore(s, 0);
    const dangling = endingScore(s, 1);
    expect(concluded).toBeGreaterThan(dangling);
  });

  it("penalizes ending on a conjunction", () => {
    const tr = transcriptFrom([
      { text: "I did it because", pauseAfter: 0.7 },
      { text: "it worked out fine." },
    ]);
    const s = buildSentences(tr);
    expect(endingScore(s, 0)).toBeLessThan(0);
  });
});

describe("startScore", () => {
  it("penalizes starting on an anaphoric word", () => {
    const tr = transcriptFrom([
      { text: "This changed everything for me.", pauseAfter: 0.8 },
      { text: "Most people quit far too early.", pauseAfter: 0.8 },
    ]);
    const s = buildSentences(tr);
    // "This" references missing context -> lower than the clean second start.
    expect(startScore(s, 0)).toBeLessThan(startScore(s, 1));
  });
});

describe("refineBoundaries: peak -> resolution", () => {
  it("extends past the peak to the conclusion rather than stopping at the hook", () => {
    // Hook/peak is early; the satisfying conclusion is a few sentences later.
    const tr = transcriptFrom([
      { text: "I almost quit my job because of this one thing.", pauseAfter: 0.4 },
      { text: "Everyone told me I was crazy to even try it.", pauseAfter: 0.4 },
      { text: "I spent three months grinding with no results.", pauseAfter: 0.4 },
      { text: "And that's when I realized I was doing it completely wrong.", pauseAfter: 0.9 },
      { text: "So anyway let me tell you about something unrelated now.", pauseAfter: 0.4 },
      { text: "The weather today is really quite nice outside." },
    ]);
    const s = buildSentences(tr);
    const peak = s[0]!; // the hook sentence
    const refined = refineBoundaries({
      sentences: s,
      roughStart: peak.start,
      roughEnd: peak.end,
      peakStart: peak.start,
      peakEnd: peak.end,
      minSeconds: 5,
      maxSeconds: 30,
      durationSec: tr.durationSec,
    });
    expect(refined).not.toBeNull();
    // Should end at the realization sentence (index 3), not the hook (0),
    // and not spill into the unrelated weather talk (index 5).
    expect(refined!.endIdx).toBe(3);
    expect(refined!.start).toBeLessThanOrEqual(peak.start);
    expect(refined!.endingQuality).toBeGreaterThan(20);
  });

  it("does not include unrelated trailing content after the conclusion", () => {
    const tr = transcriptFrom([
      { text: "The biggest mistake founders make is hiring too fast.", pauseAfter: 0.4 },
      { text: "You burn cash before you have product market fit.", pauseAfter: 0.4 },
      { text: "So the lesson is stay lean until you are sure.", pauseAfter: 1.0 },
      { text: "Now completely changing the subject to my lunch plans.", pauseAfter: 0.4 },
      { text: "I think I will get a sandwich from the deli." },
    ]);
    const s = buildSentences(tr);
    const refined = refineBoundaries({
      sentences: s,
      roughStart: s[0]!.start,
      roughEnd: s[0]!.end,
      peakStart: s[0]!.start,
      peakEnd: s[0]!.end,
      minSeconds: 4,
      maxSeconds: 30,
      durationSec: tr.durationSec,
    });
    expect(refined!.endIdx).toBe(2); // ends on "the lesson is ..."
  });
});

describe("dedupeClips", () => {
  it("drops overlapping and near-duplicate clips, keeping the best", () => {
    const items = [
      { start: 0, end: 10, score: 90, text: "the secret to growth is consistency" },
      { start: 5, end: 15, score: 80, text: "overlaps the first one in time" },
      { start: 20, end: 30, score: 70, text: "the secret to growth is consistency" }, // near dup text
      { start: 40, end: 50, score: 60, text: "a totally different topic entirely here" },
    ];
    const out = dedupeClips(items, 5, 0.6);
    expect(out.length).toBe(2);
    expect(out.map((o) => o.start)).toEqual([0, 40]);
  });
});

describe("textSimilarity", () => {
  it("is high for near-identical text and low for different text", () => {
    expect(textSimilarity("the quick brown fox", "the quick brown fox")).toBe(1);
    expect(textSimilarity("apples and oranges", "quantum physics lecture")).toBeLessThan(0.1);
  });
});
