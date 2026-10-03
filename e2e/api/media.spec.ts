import { test, expect } from "../support/fixtures";
import { isMp4 } from "../support/media";

test.describe("media route", () => {
  test.setTimeout(60_000);

  test.describe("Range requests", () => {
    let mediaUrl: string;
    let full: Buffer;

    test.beforeEach(async ({ analyzedProject, request }) => {
      mediaUrl = `/api/media/${analyzedProject.sourceVideo!.storagePath}`;
      const res = await request.get(mediaUrl);
      expect(res.status()).toBe(200);
      full = await res.body();
    });

    test("full request advertises byte ranges", async ({ request }) => {
      const res = await request.get(mediaUrl);
      expect(res.status()).toBe(200);
      expect(res.headers()).toMatchObject({
        "accept-ranges": "bytes",
        "content-type": "video/mp4",
        "content-length": String(full.length),
      });
      expect(isMp4(full)).toBe(true);
    });

    test("bounded range returns exactly those bytes", async ({ request }) => {
      const res = await request.get(mediaUrl, { headers: { Range: "bytes=0-99" } });
      expect(res.status()).toBe(206);
      expect(res.headers()).toMatchObject({
        "content-range": `bytes 0-99/${full.length}`,
        "content-length": "100",
      });
      expect((await res.body()).equals(full.subarray(0, 100))).toBe(true);
    });

    test("open-ended range runs to the end of the file", async ({ request }) => {
      const res = await request.get(mediaUrl, { headers: { Range: "bytes=100-" } });
      expect(res.status()).toBe(206);
      expect(res.headers()["content-range"]).toBe(`bytes 100-${full.length - 1}/${full.length}`);
      expect((await res.body()).equals(full.subarray(100))).toBe(true);
    });

    test("range past the end is 416", async ({ request }) => {
      const res = await request.get(mediaUrl, { headers: { Range: `bytes=${full.length}-` } });
      expect(res.status()).toBe(416);
      expect(res.headers()["content-range"]).toBe(`bytes */${full.length}`);
    });

    test("download parameter sets a sanitised attachment filename", async ({ request }) => {
      const res = await request.get(`${mediaUrl}?download=${encodeURIComponent("My Clip!")}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-disposition"]).toBe('attachment; filename="My_Clip.mp4"');
    });
  });

  test.describe("path traversal", () => {
    // Encoded separators survive URL normalisation, so the `..` reaches the
    // route. Plain or %2e%2e segments are collapsed by the client before
    // sending, so they would never hit the media handler at all.
    const attempts = [
      "projects/..%2f..%2fpackage.json",
      "projects/x/..%2f..%2f..%2fpackage.json",
      "projects/%2e%2e%2f%2e%2e%2fpackage.json",
      "projects/..%5c..%5cpackage.json",
      "projects/%252e%252e%252f%252e%252e%252fpackage.json",
      "projects/..%2f..%2fprisma%2fe2e.db",
      "projects/..%2f..%2f.env.example",
      "..%2fpackage.json",
      "package.json",
    ];

    for (const attempt of attempts) {
      test(`rejects ${attempt}`, async ({ request }) => {
        const res = await request.get(`/api/media/${attempt}`);
        expect(res.status(), await res.text()).toBeGreaterThanOrEqual(400);
        expect(res.status()).toBeLessThan(500);

        const body = await res.text();
        expect(JSON.parse(body)).toMatchObject({ ok: false });
        expect(body).not.toContain("youtube-reel-generator");
        expect(body).not.toContain("SQLite format");
        expect(body).not.toContain("DATABASE_URL");
      });
    }

    test("missing file inside projects/ is a 404", async ({ request }) => {
      const res = await request.get("/api/media/projects/nope/source.mp4");
      expect(res.status()).toBe(404);
      expect((await res.json()).error.code).toBe("FILE_NOT_FOUND");
    });
  });
});
