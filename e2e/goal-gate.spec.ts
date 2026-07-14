import { test, expect, type Page } from "@playwright/test";
import { clearDb, seedDemoIfNeeded } from "./helpers";

test.describe("Goal gate", () => {
  test.describe.configure({ mode: "serial" });
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto("today");
    await clearDb(page);
    await page.reload();
    await page.waitForLoadState("load");
    await page.waitForTimeout(500);
    await seedDemoIfNeeded(page);
    await page.goto("programs");
    await page.getByRole("button", { name: /e2e test program/i }).first().click();
    await page.waitForURL(/\/programs\/[^/]+$/);
    await expect(page.getByText("E2E Test Program")).toBeVisible({ timeout: 10000 });
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test("defaults to general fitness with no partial tag", async () => {
    const select = page.getByLabel(/routine goal/i);
    await expect(select).toBeVisible({ timeout: 8000 });
    await expect(select).toHaveValue("general");
    await expect(page.getByText(/·\s*partial/i)).not.toBeVisible();
  });

  test("switching to strength shows partial grading and goal-scoped footnote", async () => {
    await page.getByLabel(/routine goal/i).selectOption("strength");
    await expect(page.getByText(/·\s*partial/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/graded on/i)).toBeVisible();
  });

  test("goal persists through reload", async () => {
    // programRepo.save is async after the select change — give IDB a beat
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForLoadState("load");
    const select = page.getByLabel(/routine goal/i);
    await expect(select).toBeVisible({ timeout: 10000 });
    await expect(select).toHaveValue("strength");
    await expect(page.getByText(/·\s*partial/i)).toBeVisible();
  });
});
