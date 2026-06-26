import { test, expect } from "@playwright/test";
import { seedDemoIfNeeded, clearDb, waitForIdb } from "./helpers";

// A raw-text set value (kg suffix + space) is stored in rawCell, not weight/reps.
// Before the fix it vanished from the history drawer; this guards its return.
test.describe("History drawer — raw-cell sets", () => {
  test("a raw-text set entered today appears in the history drawer", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("today");
    await clearDb(page);
    await seedDemoIfNeeded(page);

    // Enter an unparseable value in the first set cell.
    const firstInput = page.locator('input[id^="cell-"]').first();
    await firstInput.fill("2.5kg x10");
    await firstInput.blur();
    // Cell autosave is debounced (~1.5s) — wait for the flush, then yield to IDB.
    await page.waitForTimeout(1700);
    await waitForIdb(page);

    // Finish the workout so the session is persisted.
    await page.getByRole("button", { name: /finish workout/i }).click();
    await expect(
      page.getByRole("button", { name: /finish workout/i }),
    ).toHaveText(/saved/i, { timeout: 3000 });

    // Open the history drawer for the first exercise and confirm the raw value shows.
    await page.getByRole("button", { name: /history for/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("2.5kg x10")).toBeVisible({ timeout: 3000 });

    await ctx.close();
  });
});
