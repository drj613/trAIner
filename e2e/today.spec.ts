import { test, expect } from "@playwright/test";
import { seedDemoIfNeeded, clearDb } from "./helpers";

test.describe("Today screen", () => {
  test.beforeEach(async ({ page }) => {
    await clearDb(page);
    await page.goto("/today");
  });

  test("shows seed prompt when no program exists", async ({ page }) => {
    await expect(page.getByRole("button", { name: /seed demo program/i })).toBeVisible();
  });

  test("shows workout after seeding demo", async ({ page }) => {
    await seedDemoIfNeeded(page);
    // Should show at least one exercise history button (meaning exercises rendered)
    await expect(page.getByRole("button", { name: /history for/i }).first()).toBeVisible();
  });

  test("progress bar shows 0/N at start", async ({ page }) => {
    await seedDemoIfNeeded(page);
    // Progress bar text: "0/N · 0%"
    await expect(page.getByText(/0\//)).toBeVisible();
  });

  test("finish workout button is present", async ({ page }) => {
    await seedDemoIfNeeded(page);
    await expect(page.getByRole("button", { name: /finish workout/i })).toBeVisible();
  });

  test("sparkles button is present after seeding", async ({ page }) => {
    await seedDemoIfNeeded(page);
    await expect(page.getByRole("button", { name: /modify with ai/i })).toBeVisible();
  });

  test("entering a set value updates progress", async ({ page }) => {
    await seedDemoIfNeeded(page);
    const firstInput = page.locator('input[id^="cell-"]').first();
    await firstInput.fill("75x5");
    await firstInput.blur();
    // Progress should now show at least 1 done
    await expect(page.getByText(/^[1-9]\d*\//)).toBeVisible();
  });
});
