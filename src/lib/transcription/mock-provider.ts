import { probeVideo } from "@/lib/video/metadata";
import type { Transcript, TranscriptSegment, TranscriptWord } from "@/types";
import type { TranscriptionProvider } from "./types";

/**
 * Offline transcription provider. Produces a deterministic, realistic transcript
 * with word-level timestamps spanning the full video duration, so downstream
 * clip detection and caption rendering have meaningful data to work with without
 * any external API.
 */
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock";

  // A pool of self-contained, "short-form-worthy" lines: hooks, advice,
  // surprising facts, and mini-stories. Clip detection scores these.
  private static readonly POOL = [
    "Here's the biggest mistake most beginners make when they start out.",
    "Most people learn this completely backwards, and it costs them years.",
    "Let me tell you about the moment everything changed for me.",
    "The secret nobody talks about is surprisingly simple.",
    "I used to believe this too, until I saw the actual data.",
    "This one habit doubled my results in under a month.",
    "You do not need talent for this, you need a system.",
    "Ninety percent of people quit right before the breakthrough.",
    "The counterintuitive truth is that doing less often wins.",
    "Here is exactly how to fix it in three steps.",
    "The first time I tried this, I failed spectacularly.",
    "What surprised me most was how fast it actually worked.",
    "Everyone tells you to work harder, but that is the wrong advice.",
    "This tiny change makes a massive difference over time.",
    "I wish someone had told me this ten years ago.",
    "The data completely contradicts what we were taught in school.",
    "Stop doing this immediately if you want better results.",
    "There is a reason the best in the world all do this.",
    "It felt impossible at first, and then it felt inevitable.",
    "Let me show you the framework I use every single day.",
    "The real problem is not effort, it is direction.",
    "This is the question that changed how I think about everything.",
    "Small consistent steps beat giant unsustainable leaps.",
    "Here is the part that most tutorials leave out entirely.",
    "You will never guess what happened next.",
    "The lesson took me years to learn, but seconds to apply.",
  ];

  async transcribe(videoPath: string): Promise<Transcript> {
    const meta = await probeVideo(videoPath);
    const duration = meta.durationSec > 0 ? meta.durationSec : 90;

    const segments: TranscriptSegment[] = [];
    const wps = 2.6; // words per second pacing
    let t = 0;
    let i = 0;

    while (t < duration - 0.5) {
      const sentence = MockTranscriptionProvider.POOL[i % MockTranscriptionProvider.POOL.length]!;
      const tokens = sentence.split(/\s+/);
      const segDur = Math.min(duration - t, tokens.length / wps);
      if (segDur <= 0.4) break;

      const perWord = segDur / tokens.length;
      const words: TranscriptWord[] = tokens.map((tok, wi) => ({
        text: tok,
        start: +(t + wi * perWord).toFixed(3),
        end: +(t + (wi + 1) * perWord).toFixed(3),
      }));

      segments.push({
        text: sentence,
        start: +t.toFixed(3),
        end: +(t + segDur).toFixed(3),
        words,
      });

      // small natural gap between sentences
      t += segDur + 0.25;
      i += 1;
    }

    return {
      text: segments.map((s) => s.text).join(" "),
      language: "en",
      durationSec: duration,
      segments,
    };
  }
}
