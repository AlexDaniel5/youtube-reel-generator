import { readFile, stat } from "node:fs/promises";
import { test, expect } from "./support/fixtures";
import { getProject, type ClipDto } from "./support/api";
import { isMp4, probeDuration } from "./support/media";
import { VIDEO_IDS, youtubeUrl } from "./support/urls";

test.describe("happy path", () => {
  // Covers source generation, analysis and one full render.
  test.setTimeout(180_000);

  test("analyze a video, render a suggested clip, preview and download it", async ({
    home,
    page,
    request,
  }) => {
    await test.step("submit a YouTube URL and watch analysis progress", async () => {
      await home.goto();
      await home.submitUrl(youtubeUrl(VIDEO_IDS.happyPath));
      await expect(home.jobProgress).toBeVisible();
      await expect(home.analyzingButton).toBeDisabled();
      await expect(home.urlInput).toBeDisabled();
      await home.waitForAnalysis();
      await expect(home.jobProgress).toBeHidden();
      await expect(page).toHaveURL(/\?project=\w+/);
    });

    const projectId = home.projectIdFromUrl()!;
    const project = await getProject(request, projectId);
    expect(project.status).toBe("completed");

    await test.step("see clip suggestions", async () => {
      const count = project.suggestions.length;
      expect(count).toBeGreaterThan(0);
      await expect(home.suggestionRows).toHaveCount(count);
      await expect(page.getByText(`${count} found`)).toBeVisible();
      await expect(home.suggestion(0).title).toHaveText(project.suggestions[0]!.title);
    });

    let clip!: ClipDto;
    await test.step("generate the first suggestion with bold captions", async () => {
      const first = home.suggestion(0);
      await first.toggle();
      await expect(first.checkbox).toHaveAttribute("aria-checked", "true");
      await home.captionStyle("Bold").click();
      await expect(home.captionStyle("Bold")).toHaveAttribute("aria-checked", "true");

      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === "POST" && r.url().endsWith(`/projects/${projectId}/clips`),
        ),
        home.generateSelectedButton.click(),
      ]);
      expect(response.status()).toBe(201);
      clip = ((await response.json()) as { data: { clips: ClipDto[] } }).data.clips[0]!;

      await expect(home.clipsHeading).toBeVisible();
      const card = home.clip(0);
      await card.waitUntilReady();
      await expect(card.title).toHaveText(clip.title);
      await expect(card.captionStyleLabel).toHaveText("bold");
    });

    const sourceDuration = project.sourceVideo!.durationSec;
    const expectedDuration = Math.min(clip.end, sourceDuration) - clip.start;
    const card = home.clip(0);

    await test.step("preview the rendered clip", async () => {
      await expect(card.video).toBeVisible();
      await expect(card.video).toHaveAttribute(
        "src",
        new RegExp(`/api/media/projects/${projectId}/clips/${clip.id}\\.mp4`),
      );
      // HAVE_METADATA: the browser fetched and parsed the MP4 header.
      await expect
        .poll(() => card.video.evaluate((v: HTMLVideoElement) => v.readyState))
        .toBeGreaterThanOrEqual(1);
      const duration = await card.video.evaluate((v: HTMLVideoElement) => v.duration);
      expect(Math.abs(duration - expectedDuration)).toBeLessThan(0.5);
    });

    await test.step("download the MP4", async () => {
      const download = await card.download();
      expect(download.suggestedFilename()).toMatch(/\.mp4$/);
      expect(await download.failure()).toBeNull();

      const file = await download.path();
      expect((await stat(file)).size).toBeGreaterThan(0);
      expect(isMp4(await readFile(file))).toBe(true);
      expect(Math.abs((await probeDuration(file)) - expectedDuration)).toBeLessThan(0.5);
    });
  });
});
