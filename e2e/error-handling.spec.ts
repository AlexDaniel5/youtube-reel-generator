import { test, expect } from "./support/fixtures";
import { getProject } from "./support/api";
import { VIDEO_IDS, youtubeUrl } from "./support/urls";

const PRIVATE_MESSAGE = "This video is private and can't be processed.";

test.describe("unavailable video", () => {
  test.setTimeout(60_000);

  test("a private video surfaces a clear error", async ({ home, page, request }) => {
    await home.goto();
    await home.submitUrl(youtubeUrl(VIDEO_IDS.private));

    // The URL is valid, so the project is accepted; the failure comes from
    // the background job and reaches the UI through polling.
    await expect(home.errorBanner).toHaveText(PRIVATE_MESSAGE, { timeout: 30_000 });
    await expect(home.jobProgress).toBeHidden();
    await expect(home.suggestionsHeading).toBeHidden();
    await expect(home.startOverButton).toBeVisible();

    const projectId = home.projectIdFromUrl()!;
    const project = await getProject(request, projectId);
    expect(project).toMatchObject({ status: "failed", error: PRIVATE_MESSAGE });
    expect(project.job).toMatchObject({ status: "failed", stage: PRIVATE_MESSAGE });
    expect(project.sourceVideo).toBeNull();

    await test.step("the error is still shown after a reload", async () => {
      await page.reload();
      await expect(home.errorBanner).toHaveText(PRIVATE_MESSAGE);
    });

    await test.step("start over returns to a clean form", async () => {
      await home.startOverButton.click();
      await expect(home.errorBanner).toBeHidden();
      await expect(page).not.toHaveURL(/project=/);
      await expect(home.urlInput).toBeEditable();
    });
  });
});
