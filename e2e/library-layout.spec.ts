import { test, expect } from "@playwright/test";

test("Library previews keep filters and category controls within a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("library");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^abductors/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const category = page.getByRole("button", { name: /^abductors/i });
  const bounds = await category.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await category.click();
  await expect(page.getByText("Hip Abduction – Band", { exact: true })).toBeVisible();
});
