import { describe, it, expect } from "vitest";
import { buildCaptionCues, renderAss } from "./captions";
import type { Transcript } from "@/types";

const transcript: Transcript = {
  text: "one two three four five six seven eight",
  durationSec: 8,
  segments: [
    {
      text: "one two three four five six seven eight",
      start: 0,
      end: 8,
      words: Array.from({ length: 8 }, (_, i) => ({
        text: ["one", "two", "three", "four", "five", "six", "seven", "eight"][i]!,
        start: i,
        end: i + 1,
      })),
    },
  ],
};

describe("buildCaptionCues", () => {
  it("produces clip-relative cues from word timestamps", () => {
    const cues = buildCaptionCues(transcript, 2, 6, { maxWordsPerCue: 2 });
    expect(cues.length).toBeGreaterThan(0);
    // first cue starts at (>=0) relative to clip start
    expect(cues[0]!.start).toBeGreaterThanOrEqual(0);
    // no cue extends beyond the clip length (4s)
    for (const c of cues) expect(c.end).toBeLessThanOrEqual(4 + 0.001);
    // respects maxWordsPerCue
    for (const c of cues) expect(c.text.split(" ").length).toBeLessThanOrEqual(2);
  });

  it("falls back to phrase splitting when no word timestamps exist", () => {
    const noWords: Transcript = {
      text: "alpha beta gamma delta",
      durationSec: 4,
      segments: [{ text: "alpha beta gamma delta", start: 0, end: 4 }],
    };
    const cues = buildCaptionCues(noWords, 0, 4, { maxWordsPerCue: 2 });
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.map((c) => c.text).join(" ")).toContain("alpha");
  });
});

describe("renderAss", () => {
  it("emits a valid ASS document with caption and title events", () => {
    const cues = buildCaptionCues(transcript, 0, 8, { maxWordsPerCue: 3 });
    const ass = renderAss(cues, { style: "bold", title: "My Hook", clipDurationSec: 8 });
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("[V4+ Styles]");
    expect(ass).toContain("Style: Caption");
    expect(ass).toContain("Style: Title");
    expect(ass).toContain("Dialogue:");
    expect(ass).toContain("MY HOOK"); // bold style uppercases the title
  });
});
