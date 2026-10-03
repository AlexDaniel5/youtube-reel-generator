import type { Locator } from "@playwright/test";

/** One row in the "Suggested clips" list. */
export class SuggestionRow {
  readonly checkbox: Locator;
  readonly title: Locator;
  readonly generateButton: Locator;

  constructor(readonly root: Locator) {
    this.checkbox = root.getByRole("checkbox");
    this.title = root.getByRole("heading");
    // The wide-screen "Generate →" button; the mobile one is hidden at desktop size.
    this.generateButton = root.getByRole("button", { name: /^Generate/ });
  }

  async toggle() {
    await this.checkbox.click();
  }
}
