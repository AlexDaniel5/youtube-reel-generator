import { describe, it, expect } from "vitest";
import { CenterCropStrategy, TARGET_HEIGHT, TARGET_WIDTH } from "./framing";

describe("CenterCropStrategy", () => {
  const strat = new CenterCropStrategy();

  it("crops a 16:9 source to the tallest centered 9:16 rectangle", () => {
    const crop = strat.getCrop(
      { width: 1280, height: 720, fps: 30, durationSec: 100 },
      { start: 0, end: 30 },
    );
    expect(crop.height).toBe(720); // full height
    // width ~= 720 * 9/16 = 405 -> even
    expect(crop.width % 2).toBe(0);
    expect(crop.width).toBeLessThan(720);
    // centered horizontally
    expect(crop.x).toBe(Math.floor((1280 - crop.width) / 2));
    expect(crop.y).toBe(0);
    expect(crop.targetWidth).toBe(TARGET_WIDTH);
    expect(crop.targetHeight).toBe(TARGET_HEIGHT);
  });

  it("keeps full width for a portrait source and crops height", () => {
    const crop = strat.getCrop(
      { width: 720, height: 1600, fps: 30, durationSec: 100 },
      { start: 0, end: 30 },
    );
    expect(crop.width).toBe(720);
    expect(crop.height).toBeLessThanOrEqual(1600);
    expect(crop.width % 2).toBe(0);
    expect(crop.height % 2).toBe(0);
  });

  it("never produces a crop larger than the source", () => {
    const crop = strat.getCrop(
      { width: 1080, height: 1080, fps: 30, durationSec: 100 },
      { start: 0, end: 30 },
    );
    expect(crop.width).toBeLessThanOrEqual(1080);
    expect(crop.height).toBeLessThanOrEqual(1080);
  });
});
