import { describe, it, expect, vi } from "vitest";
import { MockVideoSourceProvider } from "./mock-provider";

// Don't spend time encoding a real video; we only care which path is taken.
vi.mock("@/lib/video/ffmpeg", () => ({ runFfmpeg: vi.fn().mockResolvedValue(undefined) }));

const URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("MockVideoSourceProvider", () => {
  it("reports a configured id as private", async () => {
    const provider = new MockVideoSourceProvider(["dQw4w9WgXcQ"]);
    await expect(provider.getVideo(URL)).rejects.toMatchObject({
      code: "VIDEO_PRIVATE",
      status: 422,
    });
  });

  it("generates a video for any id by default", async () => {
    const source = await new MockVideoSourceProvider().getVideo(URL);
    expect(source.title).toBe("Sample video (dQw4w9WgXcQ)");
    await source.dispose();
  });
});
