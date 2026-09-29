import { describe, it, expect } from "vitest";
import { parseYouTubeUrl } from "./url";
import { AppError } from "@/lib/errors";

describe("parseYouTubeUrl", () => {
  it("parses a standard watch URL", () => {
    const r = parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(r.videoId).toBe("dQw4w9WgXcQ");
    expect(r.canonicalUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("parses a youtu.be short link", () => {
    const r = parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=10");
    expect(r.videoId).toBe("dQw4w9WgXcQ");
  });

  it("parses a shorts URL", () => {
    const r = parseYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(r.videoId).toBe("dQw4w9WgXcQ");
  });

  it("rejects a non-YouTube host as unsupported", () => {
    expect(() => parseYouTubeUrl("https://vimeo.com/123")).toThrowError(AppError);
    try {
      parseYouTubeUrl("https://vimeo.com/123");
    } catch (e) {
      expect((e as AppError).code).toBe("UNSUPPORTED_URL");
    }
  });

  it("rejects garbage as invalid", () => {
    try {
      parseYouTubeUrl("not a url");
    } catch (e) {
      expect((e as AppError).code).toBe("INVALID_URL");
    }
  });

  it("rejects a watch URL without a video id", () => {
    expect(() => parseYouTubeUrl("https://youtube.com/watch")).toThrowError(AppError);
  });
});
