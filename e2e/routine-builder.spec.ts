import { test, expect, type Page } from "@playwright/test";
import { clearDb } from "./helpers";

// ---------------------------------------------------------------------------
// Routine builder suite — serial mode, shared page, 3-step wizard
// ---------------------------------------------------------------------------

test.describe("Routine builder", () => {
  test.describe.configure({ mode: "serial" });

  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    sharedPage = await ctx.newPage();
    await sharedPage.goto("/");
    await clearDb(sharedPage);
    await sharedPage.goto("/programs/new");
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // 1. Step 1 shows title input and days-per-week selector
  test("step 1 shows title input and days-per-week selector", async () => {
    await expect(
      sharedPage.getByPlaceholder("e.g. Upper / Lower 4-day")
    ).toBeVisible();
    // Days-per-week buttons 2–6 are present
    await expect(sharedPage.getByRole("button", { name: "3" })).toBeVisible();
  });

  // 2. Cannot advance past step 1 with empty title
  test("cannot advance past step 1 with empty title", async () => {
    // Pick 3 days first so only the title condition keeps the button disabled
    await sharedPage.getByRole("button", { name: "3" }).click();
    const nextBtn = sharedPage.getByRole("button", { name: /set up days/i });
    await expect(nextBtn).toBeDisabled();
    // Clean up: deselect the day count (no deselect UI; just leave — title still empty)
  });

  // 3. Step 2 shows day list with Train toggles after filling title
  test("step 2 shows day list with Train toggles", async () => {
    // Title is still empty from prior test; fill it now
    await sharedPage
      .getByPlaceholder("e.g. Upper / Lower 4-day")
      .fill("My Test Routine");

    // Days-per-week "3" was already clicked; advance
    const nextBtn = sharedPage.getByRole("button", { name: /set up days/i });
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();

    // DaysStep: should see three day rows; each has a "Train" toggle button
    await expect(sharedPage.getByRole("button", { name: "Train" }).first()).toBeVisible();
    // Day names are in input elements — use locator with value
    await expect(sharedPage.locator('input[value="Day 1"]')).toBeVisible();
  });

  // 4. Step 3 shows "Add section" then "Add exercise" after adding a section
  test("step 3 shows Add exercise button after adding a section", async () => {
    // Advance to DayEditorStep for the first day via footer "Edit days →" button
    await sharedPage.getByRole("button", { name: /edit days/i }).click();

    // Now in step 3 (DayEditorStep). No sections yet — only "Add section" visible.
    const addSectionBtn = sharedPage.getByRole("button", { name: /add section/i });
    await expect(addSectionBtn).toBeVisible();

    // Add a Strength section
    await addSectionBtn.click();
    await sharedPage.getByRole("button", { name: /strength/i }).click();

    // "+ Add exercise" button should now appear inside the section panel
    await expect(
      sharedPage.getByRole("button", { name: /add exercise/i })
    ).toBeVisible();
  });

  // 5. Exercise picker sheet opens on "Add exercise" click
  test("exercise picker sheet opens on add exercise click", async () => {
    await sharedPage.getByRole("button", { name: /add exercise/i }).click();

    // The sheet has a search input with placeholder "Search exercises…"
    await expect(
      sharedPage.getByPlaceholder(/search exercises/i)
    ).toBeVisible();
  });

  // 6. Search returns matching exercises
  test("search returns matching exercises", async () => {
    await sharedPage.getByPlaceholder(/search exercises/i).fill("Squat");

    // At least one result row containing "Squat" should be visible
    await expect(
      sharedPage.getByText(/squat/i).first()
    ).toBeVisible();
  });

  // 7. Selecting an exercise adds it to the day
  test("selecting an exercise adds it to the day", async () => {
    // Click the first Squat result row (they are <button> elements in the list)
    const firstSquatRow = sharedPage
      .locator("button")
      .filter({ hasText: /squat/i })
      .first();
    await firstSquatRow.click();

    // Confirm by clicking "Add 1 exercise" in the sheet footer
    await sharedPage.getByRole("button", { name: /add \d+ exercise/i }).click();

    // The sheet should be dismissed; "Squat" should appear in the day's exercise list
    await expect(sharedPage.getByPlaceholder(/search exercises/i)).not.toBeVisible();
    await expect(sharedPage.getByText(/squat/i).first()).toBeVisible();
  });
});
