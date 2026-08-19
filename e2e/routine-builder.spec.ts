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
    await sharedPage.goto("");
    await clearDb(sharedPage);
    await sharedPage.goto("programs/new");
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

  // 6. Search returns matching exercises, nested under their movement
  test("search returns matching exercises", async () => {
    await sharedPage.getByPlaceholder(/search exercises/i).fill("Squat");

    // The Squat family is one navigation row; its concrete versions live under
    // it and are what the user actually picks.
    await expect(
      sharedPage.getByRole("button", { name: /^Squat movement, \d+ versions$/ })
    ).toBeVisible();
  });

  // 7. A family row is navigation only — it cannot be added
  test("a movement family cannot be added as an exercise", async () => {
    const family = sharedPage.getByRole("button", {
      name: /^Squat movement, \d+ versions$/,
    });
    await family.click();

    // Nothing was selected: the footer is still the empty-state button.
    await expect(sharedPage.getByRole("button", { name: "Add exercises" })).toBeDisabled();
  });

  // 8. Selecting a concrete version adds it to the day
  test("selecting an exercise adds it to the day", async () => {
    const family = sharedPage.getByRole("button", {
      name: /^Squat movement, \d+ versions$/,
    });
    if ((await family.getAttribute("aria-expanded")) !== "true") await family.click();

    await sharedPage.getByRole("button", { name: /High Bar Back Squat/ }).first().click();

    // Confirm by clicking "Add 1 exercise" in the sheet footer
    await sharedPage.getByRole("button", { name: /add \d+ exercise/i }).click();

    // The sheet should be dismissed; the concrete version appears in the day
    await expect(sharedPage.getByPlaceholder(/search exercises/i)).not.toBeVisible();
    await expect(sharedPage.getByText(/high bar back squat/i).first()).toBeVisible();
  });
});
