import { test, expect, type Page } from "@playwright/test";
import { clearDb, waitForIdb, IMPORT_PROGRAM_JSON } from "./helpers";

// ---------------------------------------------------------------------------
// Program import suite — serial mode so tests chain: import → verify → map
// ---------------------------------------------------------------------------

test.describe("Program import", () => {
  test.describe.configure({ mode: "serial" });

  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    sharedPage = await ctx.newPage();
    // Navigate first so IDB is accessible (clearDb requires a real origin)
    await sharedPage.goto("import");
    await clearDb(sharedPage);
    await sharedPage.goto("import");
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // 1. import page renders textarea and validate button
  test("import page renders textarea and validate button", async () => {
    await expect(sharedPage.locator("textarea")).toBeVisible();
    await expect(
      sharedPage.getByRole("button", { name: /validate/i }),
    ).toBeVisible();
  });

  // 2. invalid JSON shows parse error
  test("invalid JSON shows parse error", async () => {
    const textarea = sharedPage.locator("textarea");
    await textarea.fill("not json");
    await sharedPage.getByRole("button", { name: /validate/i }).click();
    // Parser throws: "The pasted content is not valid JSON."
    await expect(sharedPage.getByText(/not valid json/i)).toBeVisible();
  });

  // 3. non-object JSON shows type error
  test("non-object JSON shows type error", async () => {
    const textarea = sharedPage.locator("textarea");
    await textarea.fill("[1,2,3]");
    await sharedPage.getByRole("button", { name: /validate/i }).click();
    // Parser throws: "The pasted JSON must be an object."
    await expect(sharedPage.getByText(/must be an object/i)).toBeVisible();
  });

  // 4. valid JSON parses and shows confirm step
  test("valid JSON parses and shows confirm step", async () => {
    const textarea = sharedPage.locator("textarea");
    await textarea.fill(IMPORT_PROGRAM_JSON);
    await sharedPage.getByRole("button", { name: /validate/i }).click();
    // An exercise-resolution step may appear before the confirm step.
    const reviewBtn = sharedPage.getByRole("button", { name: /review import/i });
    if (await reviewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reviewBtn.click();
    }
    // Confirm step shows the day and exercise summary
    await expect(sharedPage.getByText(/1 day · 1 exercise/i)).toBeVisible();
  });

  // 5. save program persists to IndexedDB
  test("save program persists to IndexedDB", async () => {
    await sharedPage.getByRole("button", { name: /save program/i }).click();
    // Saving navigates to the new program's detail page
    await sharedPage.waitForURL(/\/programs\/[^/]+$/);
    await expect(sharedPage.getByText("E2E Test Program")).toBeVisible();
  });

  // 6. imported program appears on programs list (persistence)
  test("imported program appears on programs list", async () => {
    await sharedPage.goto("programs");
    await expect(sharedPage.getByText("E2E Test Program")).toBeVisible();
  });

  // 7. program map renders week grid
  test("program map renders week grid", async () => {
    // Click into the program from the list
    await sharedPage
      .getByRole("button", { name: "E2E Test Program" })
      .first()
      .click();
    // Wait for navigation to the program detail page
    await sharedPage.waitForURL(/\/programs\/[^/]+$/);
    const programId = sharedPage.url().split("/programs/")[1].split("?")[0];
    // Navigate directly to the map (relative path to respect the base URL)
    await sharedPage.goto(`programs/${programId}/map`);
    await expect(sharedPage.getByText(/week 1/i)).toBeVisible();
    await expect(sharedPage.getByText("Day 1")).toBeVisible();
  });

  // 8. day cell link navigates to program+day
  test("day cell link navigates to program+day", async () => {
    // Find the first non-rest day cell link (href contains ?day=)
    const dayLink = sharedPage.locator('a[href*="?day="]').first();
    await expect(dayLink).toBeVisible();
    await dayLink.click();
    await sharedPage.waitForURL(/\?day=/);
    expect(sharedPage.url()).toContain("?day=");
  });
});
