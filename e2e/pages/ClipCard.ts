import { expect, type Download, type Locator, type Page, type Response } from "@playwright/test";

/** A generated clip in the "Your clips" contact sheet, including its editor. */
export class ClipCard {
  readonly status: Locator;
  readonly title: Locator;
  readonly captionStyleLabel: Locator;
  readonly timecode: Locator;
  readonly video: Locator;
  readonly downloadLink: Locator;
  readonly editButton: Locator;
  readonly titleInput: Locator;
  readonly startInput: Locator;
  readonly endInput: Locator;
  readonly saveButton: Locator;

  constructor(
    private readonly page: Page,
    readonly root: Locator,
  ) {
    this.status = root.getByTestId("clip-status");
    this.title = root.getByTestId("clip-title");
    this.captionStyleLabel = root.getByTestId("clip-caption-style");
    this.timecode = root.getByTestId("clip-timecode");
    this.video = root.getByTestId("clip-video");
    this.downloadLink = root.getByRole("link", { name: "Download" });
    this.editButton = root.getByRole("button", { name: "Edit" });
    this.titleInput = root.getByLabel("Title / hook");
    this.startInput = root.getByLabel("Start · s");
    this.endInput = root.getByLabel("End · s");
    this.saveButton = root.getByRole("button", { name: "Save & re-render" });
  }

  captionStyle(name: string) {
    return this.root.getByRole("radio", { name });
  }

  async waitUntilReady(timeout = 90_000) {
    await expect(this.status).toHaveText("ready", { timeout });
  }

  async download(): Promise<Download> {
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this.downloadLink.click(),
    ]);
    return download;
  }

  async openEditor() {
    await this.editButton.click();
    await expect(this.saveButton).toBeVisible();
  }

  async edit(values: { title?: string; start?: number; end?: number; captionStyle?: string }) {
    if (values.title !== undefined) await this.titleInput.fill(values.title);
    if (values.start !== undefined) await this.startInput.fill(String(values.start));
    if (values.end !== undefined) await this.endInput.fill(String(values.end));
    if (values.captionStyle !== undefined) await this.captionStyle(values.captionStyle).click();
  }

  /**
   * Save and wait for the PATCH plus the UI refresh that follows it. The editor
   * closes only after the refreshed clip (status queued) is in state, so any
   * "ready" seen afterwards belongs to the new render, not the old one.
   */
  async saveAndRerender(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === "PATCH" && r.url().includes("/api/clips/"),
      ),
      this.saveButton.click(),
    ]);
    await expect(this.saveButton).toBeHidden();
    return response;
  }
}
