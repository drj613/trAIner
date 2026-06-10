import { test, expect, type Page } from "@playwright/test";
import { seedDemoIfNeeded, clearDb, waitForIdb } from "./helpers";

// ---------------------------------------------------------------------------
// Helpers local to this spec
// ---------------------------------------------------------------------------

async function openHistoryDrawer(page: Page) {
  await page.getByRole("button", { name: /history for/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function closeDrawerIfOpen(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
  }
}

// ---------------------------------------------------------------------------
// Exercise History suite — serial mode so tests share seeded DB state
// ---------------------------------------------------------------------------

test.describe("Exercise history", () => {
  test.describe.configure({ mode: "serial" });

  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    sharedPage = await ctx.newPage();
    // Navigate first so IDB is accessible, then clear and re-seed
    await sharedPage.goto("today");
    await clearDb(sharedPage);
    await seedDemoIfNeeded(sharedPage);
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // 1. history drawer opens on history button click
  test("history drawer opens on history button click", async () => {
    await openHistoryDrawer(sharedPage);
    await expect(sharedPage.getByRole("dialog")).toBeVisible();
    // close before next test
    await sharedPage.keyboard.press("Escape");
    await expect(sharedPage.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });
  });

  // 2. history drawer closes on Escape
  test("history drawer closes on Escape", async () => {
    await openHistoryDrawer(sharedPage);
    await sharedPage.keyboard.press("Escape");
    await expect(sharedPage.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });
  });

  // 3. history drawer closes on backdrop click
  test("history drawer closes on backdrop click", async () => {
    await openHistoryDrawer(sharedPage);
    await sharedPage.getByTestId("history-drawer-backdrop").click({ position: { x: 10, y: 10 } });
    await expect(sharedPage.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });
  });

  // 4. drawer shows "No history yet" before any workout is logged
  // (must run BEFORE tests 5-7 which log workouts)
  test('drawer shows "No history yet" before any workout is logged', async () => {
    await openHistoryDrawer(sharedPage);
    await expect(
      sharedPage.getByRole("dialog").getByText("No history yet for this exercise.")
    ).toBeVisible();
    // close before logging tests
    await sharedPage.keyboard.press("Escape");
    await expect(sharedPage.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });
  });

  // 5. drawer shows today's session after logging
  test("drawer shows today's session after logging", async () => {
    // Log first exercise set
    const firstInput = sharedPage.locator('input[id^="cell-"]').first();
    await firstInput.fill("80x5");
    await firstInput.blur();
    await waitForIdb(sharedPage);

    // Finish workout and wait for saved confirmation
    await sharedPage.getByRole("button", { name: /finish workout/i }).click();
    await expect(
      sharedPage.getByRole("button", { name: /finish workout/i }),
    ).toHaveText(/saved/i, { timeout: 3000 });

    // Open history for first exercise (Banded Face Pulls)
    await openHistoryDrawer(sharedPage);

    // Expect a row with today's date in ISO YYYY-MM-DD format
    const today = new Date().toISOString().slice(0, 10);
    await expect(sharedPage.getByRole("dialog").getByText(today)).toBeVisible({ timeout: 3000 });

    // close drawer
    await sharedPage.keyboard.press("Escape");
    await expect(sharedPage.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });
  });

  // 6. drawer shows correct set labels
  test("drawer shows correct set labels", async () => {
    // State from test 5: first exercise (Banded Face Pulls) has 1 session with "80x5"
    // Open history drawer for first exercise and verify set label is visible
    await openHistoryDrawer(sharedPage);
    await expect(sharedPage.getByRole("dialog").getByText("80x5")).toBeVisible();
    await sharedPage.keyboard.press("Escape");
    await expect(sharedPage.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });

    // Also log a second set on the same exercise and verify its label too
    const inputs = sharedPage.locator('input[id^="cell-"]');
    const secondInput = inputs.nth(1);
    await secondInput.fill("85x3");
    await secondInput.blur();
    // The cell autosave is debounced (1.5s) — wait for it to flush to IDB.
    await sharedPage.waitForTimeout(1700);
    await waitForIdb(sharedPage);

    // Both set labels should appear in the session row
    await openHistoryDrawer(sharedPage);
    await expect(sharedPage.getByRole("dialog").getByText("80x5")).toBeVisible();
    await expect(sharedPage.getByRole("dialog").getByText("85x3")).toBeVisible();

    await sharedPage.keyboard.press("Escape");
    await expect(sharedPage.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });
  });

  // 7. volume column shows calculated total
  test("volume column shows calculated total", async () => {
    // Session volume from tests 5–6: 80x5 + 85x3 = 655
    await openHistoryDrawer(sharedPage);
    await expect(
      sharedPage.getByRole("dialog").getByText("655", { exact: true })
    ).toBeVisible();
    await sharedPage.keyboard.press("Escape");
    await expect(sharedPage.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });
  });
});
