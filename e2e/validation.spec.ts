import { test, expect } from "./support/fixtures";

const invalidInputs = [
  { name: "malformed text", url: "not a url", message: "That doesn't look like a valid YouTube URL." },
  {
    name: "non-http scheme",
    url: "ftp://youtube.com/watch?v=dQw4w9WgXcQ",
    message: "Only http(s) URLs are supported.",
  },
  {
    name: "YouTube URL without a valid video id",
    url: "https://www.youtube.com/watch?v=short",
    message: "Could not find a video ID in that URL.",
  },
  {
    name: "non-YouTube host",
    url: "https://vimeo.com/123456",
    message: "Only YouTube URLs are supported right now.",
  },
  {
    name: "look-alike path on another host",
    url: "https://example.com/watch?v=dQw4w9WgXcQ",
    message: "Only YouTube URLs are supported right now.",
  },
];

test.describe("URL input validation", () => {
  for (const { name, url, message } of invalidInputs) {
    test(`rejects ${name}`, async ({ home, page, db }) => {
      const before = await db.project.count();
      await home.goto();

      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith("/api/projects")),
        home.submitUrl(url),
      ]);
      expect(response.status()).toBe(400);

      await expect(home.errorBanner).toHaveText(message);
      await expect(home.jobProgress).toBeHidden();
      await expect(home.suggestionsHeading).toBeHidden();
      await expect(page).not.toHaveURL(/project=/);
      expect(await db.project.count()).toBe(before);
    });
  }

  test("blocks empty and whitespace-only input before any request", async ({
    home,
    page,
    db,
  }) => {
    const before = await db.project.count();
    const projectRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/projects")) projectRequests.push(r.url());
    });

    await home.goto();
    await expect(home.analyzeButton).toBeDisabled();

    await home.urlInput.fill("   ");
    await expect(home.analyzeButton).toBeDisabled();
    // Enter submits the form directly, bypassing the disabled button.
    await home.urlInput.press("Enter");

    await expect(home.jobProgress).toBeHidden();
    await expect(home.errorBanner).toBeHidden();
    expect(projectRequests).toEqual([]);
    expect(await db.project.count()).toBe(before);
  });
});

test.describe("URL validation (API)", () => {
  test("missing URL is a validation error", async ({ request, db }) => {
    const before = await db.project.count();
    const res = await request.post("/api/projects", { data: { url: "" } });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "A YouTube URL is required." },
    });
    expect(await db.project.count()).toBe(before);
  });

  test("whitespace URL asks the user to paste one", async ({ request, db }) => {
    const before = await db.project.count();
    const res = await request.post("/api/projects", { data: { url: "   " } });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: "INVALID_URL", message: "Please paste a YouTube URL." },
    });
    expect(await db.project.count()).toBe(before);
  });

  test("non-JSON body is rejected", async ({ request }) => {
    const res = await request.post("/api/projects", {
      headers: { "content-type": "application/json" },
      data: "{not json",
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
