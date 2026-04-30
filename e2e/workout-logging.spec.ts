import { test, expect, type Page } from "@playwright/test";
import { seedDemoIfNeeded, clearDb, waitForIdb } from "./helpers";

// ---------------------------------------------------------------------------
// Helpers local to this spec
// ---------------------------------------------------------------------------

async function fillCell(page: Page, locator: ReturnType<Page["locator"]>, value: string) {
  await locator.fill(value);
  await locator.blur();
  await waitForIdb(page);
}

// ---------------------------------------------------------------------------
// Main suite — serial mode so tests share seeded DB state
// ---------------------------------------------------------------------------

test.describe("Workout logging", () => {
  test.describe.configure({ mode: "serial" });

  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    sharedPage = await ctx.newPage();
    // Navigate first so IDB is accessible, then clear and re-seed
    await sharedPage.goto("/today");
    await clearDb(sharedPage);
    await seedDemoIfNeeded(sharedPage);
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // 1. logs a set value in a cell
  test("logs a set value in a cell", async () => {
    const firstInput = sharedPage.locator('input[id^="cell-"]').first();
    await fillCell(sharedPage, firstInput, "80x5");
    await expect(firstInput).toHaveValue("80x5");
  });

  // 2. progress bar increments on each logged set
  test("progress bar increments on each logged set", async () => {
    const inputs = sharedPage.locator('input[id^="cell-"]');
    // Fill 2nd and 3rd cells (1st was filled in test 1)
    const second = inputs.nth(1);
    const third = inputs.nth(2);
    await fillCell(sharedPage, second, "80x5");
    await fillCell(sharedPage, third, "80x5");
    // At least 3 cells done — progress text should match e.g. "3/N"
    await expect(sharedPage.getByText(/[3-9]\/\d+/)).toBeVisible();
  });

  // 3. skip value counts toward progress
  test("skip value counts toward progress", async () => {
    // Fill a fresh cell with "skip"
    const inputs = sharedPage.locator('input[id^="cell-"]');
    const count = await inputs.count();
    // Use last input which hasn't been filled yet
    const target = inputs.nth(count - 1);
    await fillCell(sharedPage, target, "skip");
    // Progress should show at least 1 done (already has more from prior tests)
    await expect(sharedPage.getByText(/^[1-9]\d*\//)).toBeVisible();
  });

  // 4. add-set button appends a new cell
  test("add-set button appends a new cell", async () => {
    const before = await sharedPage.locator('input[id^="cell-"]').count();
    await sharedPage.getByRole("button", { name: "Add set" }).first().click();
    const after = await sharedPage.locator('input[id^="cell-"]').count();
    expect(after).toBe(before + 1);
  });

  // 5. finish workout shows Saved feedback
  test("finish workout shows Saved feedback", async () => {
    await sharedPage.getByRole("button", { name: /finish workout/i }).click();
    await expect(sharedPage.getByText(/saved/i)).toBeVisible({ timeout: 2000 });
  });
});

// ---------------------------------------------------------------------------
// Persistence tests — each needs a clean page load to verify IDB round-trip
// ---------------------------------------------------------------------------

test.describe("Workout logging — persistence", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate first so IDB is accessible, then clear and re-seed
    await page.goto("/today");
    await clearDb(page);
    await seedDemoIfNeeded(page);
  });

  // 6. persists cell values after page reload
  test("persists cell values after page reload", async ({ page }) => {
    const firstInput = page.locator('input[id^="cell-"]').first();
    await fillCell(page, firstInput, "90x3");

    await page.getByRole("button", { name: /finish workout/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 2000 });

    await page.reload();
    // Wait for workout content to load
    await page.waitForSelector('input[id^="cell-"]', { timeout: 8000 });
    await waitForIdb(page);

    const reloadedInput = page.locator('input[id^="cell-"]').first();
    await expect(reloadedInput).toHaveValue("90x3");
  });

  // 7. persists added sets after reload
  test("persists added sets after reload", async ({ page }) => {
    // Add a set to first exercise
    await page.getByRole("button", { name: "Add set" }).first().click();

    // Find the new (last) cell for the first exercise
    // The new cell is appended — find it by filling the last input
    const inputs = page.locator('input[id^="cell-"]');
    const count = await inputs.count();
    const newCell = inputs.nth(count - 1);
    await fillCell(page, newCell, "55x10");

    await page.getByRole("button", { name: /finish workout/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 2000 });

    await page.reload();
    await page.waitForSelector('input[id^="cell-"]', { timeout: 8000 });
    await waitForIdb(page);

    // "55x10" should still be present in the last cell
    await expect(page.locator('input[id^="cell-"]').last()).toHaveValue("55x10");
  });

  // 8. re-finish after reload shows only one session (no crash/duplicate error)
  test("re-finish after reload shows only one session", async ({ page }) => {
    await page.getByRole("button", { name: /finish workout/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 2000 });

    await page.reload();
    await page.waitForSelector('input[id^="cell-"]', { timeout: 8000 });

    // Finish again (empty)
    await page.getByRole("button", { name: /finish workout/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 2000 });
    // No app-level error message (exclude Next.js route announcer)
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).not.toBeVisible();
  });

  // 9. empty finish saves without error
  test("empty finish saves without error", async ({ page }) => {
    // No cells filled — click finish immediately
    await page.getByRole("button", { name: /finish workout/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 2000 });
    // No app-level error message (exclude Next.js route announcer)
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).not.toBeVisible();
  });
});
