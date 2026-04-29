import { test, expect } from "@playwright/test";
import { seedDemoIfNeeded, clearDb, AI_WORKOUT_JSON } from "./helpers";

test.describe("Modify with AI", () => {
  test.beforeEach(async ({ page }) => {
    await clearDb(page);
    await seedDemoIfNeeded(page);
  });

  test("opens modal with prompt and copy button when sparkles clicked", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /copy/i })).toBeVisible();
    // Prompt should contain the current workout title or section names
    const promptText = dialog.locator("pre");
    await expect(promptText).toBeVisible();
    await expect(promptText).toContainText(/workout/i);
  });

  test("prompt contains current day exercises", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    const promptText = dialog.locator("pre");
    // Demo program should have exercise names visible in the generated prompt
    await expect(promptText).toContainText(/warmup|strength|hypertrophy/i);
  });

  test("step labels are visible", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    await expect(dialog.getByText(/1 · copy prompt/i)).toBeVisible();
    await expect(dialog.getByText(/2 · paste the response/i)).toBeVisible();
  });

  test("Review changes button is disabled when textarea is empty", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    await expect(dialog.getByRole("button", { name: /review changes/i })).toBeDisabled();
  });

  test("shows error for invalid JSON", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    await dialog.getByRole("textbox").fill("this is not json");
    await dialog.getByRole("button", { name: /review changes/i }).click();
    await expect(dialog.getByText(/invalid json/i)).toBeVisible();
  });

  test("navigates to diff review page with valid JSON", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    await dialog.getByRole("textbox").fill(AI_WORKOUT_JSON);
    await dialog.getByRole("button", { name: /review changes/i }).click();
    // Should navigate to diff page
    await expect(page).toHaveURL(/\/programs\/.+\/diff/);
    await expect(page.getByText(/review changes/i)).toBeVisible();
  });

  test("diff page shows added and removed exercises", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    await dialog.getByRole("textbox").fill(AI_WORKOUT_JSON);
    await dialog.getByRole("button", { name: /review changes/i }).click();
    await expect(page).toHaveURL(/\/programs\/.+\/diff/);
    // Since AI JSON has different exercises than demo, we expect added/removed labels
    await expect(page.getByText(/added|removed|changed/i).first()).toBeVisible();
  });

  test("discarding on diff page returns without saving", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    await dialog.getByRole("textbox").fill(AI_WORKOUT_JSON);
    await dialog.getByRole("button", { name: /review changes/i }).click();
    await expect(page).toHaveURL(/\/programs\/.+\/diff/);
    await page.getByRole("button", { name: /discard/i }).click();
    // Should navigate back (to today or program page)
    await expect(page).not.toHaveURL(/\/diff/);
  });

  test("accepting on diff page saves override and redirects to today", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    await dialog.getByRole("textbox").fill(AI_WORKOUT_JSON);
    await dialog.getByRole("button", { name: /review changes/i }).click();
    await expect(page).toHaveURL(/\/programs\/.+\/diff/);
    await page.getByRole("button", { name: /apply changes/i }).click();
    await expect(page).toHaveURL(/\/today/);
    // New workout name should appear on Today screen
    await expect(page.getByText(/upper pull and press/i)).toBeVisible();
  });

  test("closes modal with Cancel button", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("closes modal with Escape key", async ({ page }) => {
    await page.getByRole("button", { name: /modify with ai/i }).click();
    const dialog = page.getByRole("dialog", { name: /modify with ai/i });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});
