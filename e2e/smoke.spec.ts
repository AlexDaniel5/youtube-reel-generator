import { test, expect } from "@playwright/test";

test("app shell loads with the URL form ready", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Reels Generator/);
  await expect(page.getByRole("textbox", { name: "YouTube URL" })).toBeEditable();
  await expect(page.getByRole("button", { name: "Analyze Video" })).toBeDisabled();
});
