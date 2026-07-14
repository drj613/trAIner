import { test, expect } from "@playwright/test";
import { seedDemoIfNeeded, clearDb, waitForIdb } from "./helpers";

// kg-suffixed cells now parse into weight/unit/reps (shown as "2.5kgx10");
// genuinely unparseable values are stored in rawCell and must still appear
// verbatim in the history drawer.
test.describe("History drawer — kg and raw-cell sets", () => {
  test("a kg set and a raw-text set entered today appear in the history drawer", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("today");
    await clearDb(page);
    await seedDemoIfNeeded(page);

    // A kg-suffixed value (parses) and an unparseable free-text value (rawCell).
    const inputs = page.locator('input[id^="cell-"]');
    await inputs.nth(0).fill("2.5kg x10");
    await inputs.nth(1).fill("40s hold");
    await inputs.nth(1).blur();
    // Cell autosave is debounced (~1.5s) — wait for the flush, then yield to IDB.
    await page.waitForTimeout(1700);
    await waitForIdb(page);

    // Finish the workout so the session is persisted.
    await page.getByRole("button", { name: /finish workout/i }).click();
    await expect(
      page.getByRole("button", { name: /finish workout/i }),
    ).toHaveText(/saved/i, { timeout: 3000 });

    // Open the history drawer for the first exercise and confirm both show.
    await page.getByRole("button", { name: /history for/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("2.5kgx10")).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByText("40s hold")).toBeVisible({ timeout: 3000 });

    await ctx.close();
  });
});
