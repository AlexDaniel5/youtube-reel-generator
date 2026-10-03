import { expect, type Locator, type Page } from "@playwright/test";
import { SuggestionRow } from "./SuggestionRow";
import { ClipCard } from "./ClipCard";

/** The single-page app: URL intake, analysis progress, suggestions, clips. */
export class HomePage {
  readonly urlInput: Locator;
  readonly analyzeButton: Locator;
  /** The submit button while analysis runs (its label changes). */
  readonly analyzingButton: Locator;
  readonly startOverButton: Locator;
  readonly errorBanner: Locator;
  readonly jobProgress: Locator;
  readonly suggestionsHeading: Locator;
  readonly clipsHeading: Locator;
  readonly suggestionRows: Locator;
  readonly clipCards: Locator;
  readonly generateSelectedButton: Locator;

  constructor(readonly page: Page) {
    this.urlInput = page.getByRole("textbox", { name: "YouTube URL" });
    this.analyzeButton = page.getByRole("button", { name: "Analyze Video" });
    this.analyzingButton = page.getByRole("button", { name: "Analyzing…" });
    this.startOverButton = page.getByRole("button", { name: "Start over" });
    this.errorBanner = page.getByTestId("error-banner");
    this.jobProgress = page.getByTestId("job-progress");
    this.suggestionsHeading = page.getByRole("heading", { name: /Suggested clips/ });
    this.clipsHeading = page.getByRole("heading", { name: /Your clips/ });
    this.suggestionRows = page.getByTestId("suggestion-row");
    this.clipCards = page.getByTestId("clip-card");
    this.generateSelectedButton = page.getByRole("button", { name: /^Generate selected/ });
  }

  async goto(projectId?: string) {
    await this.page.goto(projectId ? `/?project=${projectId}` : "/");
  }

  async submitUrl(url: string) {
    await this.urlInput.fill(url);
    await this.analyzeButton.click();
  }

  /** Wait for analysis to finish and the suggestion list to render. */
  async waitForAnalysis(timeout = 90_000) {
    await expect(this.suggestionsHeading).toBeVisible({ timeout });
  }

  /** Project id the app has mirrored into the URL (`?project=`). */
  projectIdFromUrl(): string | null {
    return new URL(this.page.url()).searchParams.get("project");
  }

  suggestion(index: number) {
    return new SuggestionRow(this.suggestionRows.nth(index));
  }

  clip(index: number) {
    return new ClipCard(this.page, this.clipCards.nth(index));
  }

  /**
   * Caption style for new clips, in the suggestions action bar. That bar
   * renders before any clip editor, so its radio group is the first one.
   */
  captionStyle(name: string) {
    return this.page.getByRole("radiogroup").first().getByRole("radio", { name });
  }
}
