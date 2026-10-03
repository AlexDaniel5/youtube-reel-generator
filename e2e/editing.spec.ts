import { test, expect } from "./support/fixtures";
import { analyzeVideo, clipStoragePath, getClip, renderClip } from "./support/api";
import { probeDuration } from "./support/media";
import { VIDEO_IDS, youtubeUrl } from "./support/urls";
import { writeFile } from "node:fs/promises";

test.describe("clip editing", () => {
  // Setup renders one clip; the edit renders it again.
  test.setTimeout(240_000);

  test("edits to start/end, title and caption style re-render and survive a reload", async ({
    home,
    page,
    request,
  }, testInfo) => {
    // Setup through the API so this test is about editing, not the happy path.
    const project = await analyzeVideo(request, youtubeUrl(VIDEO_IDS.editing));
    const original = await renderClip(request, project.id, project.suggestions[0]!.id);

    await home.goto(project.id);
    const card = home.clip(0);
    await card.waitUntilReady();
    await expect(card.title).toHaveText(original.title);

    const edit = { title: "E2E edited title", start: 5, end: 15, captionStyle: "Minimal" };

    await test.step("edit and re-render", async () => {
      await card.openEditor();
      await card.edit(edit);
      const response = await card.saveAndRerender();
      expect(response.status()).toBe(200);
      await card.waitUntilReady();
    });

    const assertEditedCard = async () => {
      await expect(card.title).toHaveText(edit.title);
      await expect(card.captionStyleLabel).toHaveText("minimal");
      await expect(card.timecode).toHaveText("0:05–0:15");
    };

    await test.step("card shows the new values", assertEditedCard);

    await test.step("values persist after a reload", async () => {
      await page.reload();
      await card.waitUntilReady();
      await assertEditedCard();

      await card.openEditor();
      await expect(card.titleInput).toHaveValue(edit.title);
      await expect(card.startInput).toHaveValue("5");
      await expect(card.endInput).toHaveValue("15");
      await expect(card.captionStyle("Minimal")).toHaveAttribute("aria-checked", "true");
    });

    await test.step("the stored clip reflects the edit", async () => {
      const stored = await getClip(request, original.id);
      expect(stored).toMatchObject({
        title: edit.title,
        start: 5,
        end: 15,
        captionStyle: "minimal",
        status: "completed",
      });

      // The re-rendered file is the new 10s cut, not the original.
      const res = await request.get(`/api/media/${clipStoragePath(project.id, original.id)}`);
      expect(res.status()).toBe(200);
      const file = testInfo.outputPath("rerendered.mp4");
      await writeFile(file, await res.body());
      expect(Math.abs((await probeDuration(file)) - 10)).toBeLessThan(0.5);
    });
  });

  test("an end time before the start is rejected without saving", async ({
    home,
    page,
    request,
  }) => {
    const project = await analyzeVideo(request, youtubeUrl(VIDEO_IDS.editingInvalid));
    const original = await renderClip(request, project.id, project.suggestions[0]!.id);

    await home.goto(project.id);
    const card = home.clip(0);
    await card.waitUntilReady();

    const patches: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PATCH") patches.push(r.url());
    });

    await card.openEditor();
    await card.edit({ start: 20, end: 10 });
    await card.saveButton.click();

    await expect(card.root.getByText("End must come after start.")).toBeVisible();
    await expect(card.saveButton).toBeVisible();
    expect(patches).toEqual([]);

    const stored = await getClip(request, original.id);
    expect(stored).toMatchObject({ start: original.start, end: original.end });
  });
});
