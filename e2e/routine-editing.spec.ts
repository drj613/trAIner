import { test, expect, type Page } from "@playwright/test";
import { chooseImportVersions, clearDb, waitForIdb } from "./helpers";

const eightWeekProgram = JSON.stringify({
  program_name: "Eight Week Review Fixture",
  weeks: 8,
  progression: [{ applies: "Main lifts", rule: "Add 2.5 kg after all reps are completed." }],
  days: [
    {
      day: 1,
      title: "Lower A",
      sections: [{
        name: "Strength",
        type: "strength",
        groups: [{ type: "superset", exercises: [
          { name: "Barbell Back Squat", sets: "3", reps: "6-8", countsTowardVolume: true, tags: { primary: ["quads"], secondary: ["glutes"], incidental: [], modifiers: [] } },
          { name: "Romanian Deadlift", sets: 4, reps: "8-10", countsTowardVolume: true, tags: { primary: ["hamstrings"], secondary: ["glutes"], incidental: [], modifiers: [] }, variants: [{ weeks: [6], name: "Dumbbell Romanian Deadlift", sets: 3 }] },
        ] }],
      }],
    },
    {
      day: 2,
      title: "Upper A",
      sections: [{
        name: "Press",
        type: "strength",
        groups: [{ type: "single", exercises: [
          { name: "Barbell Bench Press", sets: 3, reps: "8", countsTowardVolume: true, tags: { primary: ["chest"], secondary: ["triceps"], incidental: ["front_delts"], modifiers: [] } },
        ] }],
      }],
    },
  ],
  overrides: [{
    scope: "week",
    weekNumber: 4,
    reason: "Deload",
    days: [{
      day: 1,
      title: "Lower A",
      sections: [{
        name: "Strength",
        type: "strength",
        groups: [{ type: "superset", exercises: [
          { name: "Barbell Back Squat", sets: 2, reps: "6-8", countsTowardVolume: true, tags: { primary: ["quads"], secondary: ["glutes"], incidental: [], modifiers: [] } },
          { name: "Romanian Deadlift", sets: 2, reps: "8-10", countsTowardVolume: true, tags: { primary: ["hamstrings"], secondary: ["glutes"], incidental: [], modifiers: [] } },
        ] }],
      }],
    }],
  }],
});

const twelveWeekProgram = JSON.stringify({
  program_name: "Twelve Week Repair Fixture",
  weeks: 12,
  progression: [{ applies: "All lifts", rule: "Add reps before adding load." }],
  days: [{
    day: 1,
    title: "Full Body",
    sections: [{ name: "Strength", type: "strength", groups: [{ type: "single", exercises: [
      { name: "Goblet Squat", sets: 3, reps: "8-12", countsTowardVolume: true, tags: { primary: ["quads"], secondary: ["glutes"], incidental: [], modifiers: [] } },
    ] }] }],
  }],
});

async function openImportReview(page: Page, json: string) {
  await page.goto("import");
  await page.locator("textarea").fill(json);
  await page.waitForTimeout(300);
  const validate = page.getByRole("button", { name: /validate/i });
  await expect(validate).toBeEnabled();
  await validate.click();
  await chooseImportVersions(page);
  const review = page.getByRole("button", { name: /review import/i });
  if (await review.isVisible().catch(() => false)) await review.click();
  await expect(page.getByRole("heading", { name: /expanded program preview/i })).toBeVisible();
}

async function openWorkout(page: Page, week: number, title: string) {
  await page.getByRole("button", { name: `WK ${week}` }).click();
  await page.getByText(title, { exact: true }).click();
  await page.getByRole("button", { name: "View →" }).click();
  await expect(page).toHaveURL(/\/programs\/[^/]+\/days\//);
  await page.locator('input[id^="cell-"]').first().waitFor();
}

test.describe("Routine import review and editing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("import");
    await clearDb(page);
  });

  test("repairs an eight-week routine, reorders days, saves, reloads, and shows corrected logging rows", async ({ page }) => {
    await openImportReview(page, eightWeekProgram);

    await page.getByText(/correction.*made to the imported input/i).click();
    await expect(page.getByText(/Set count.*converted to 3/i)).toBeVisible();
    await expect(page.getByText(/Superset set counts differ/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Select Lower A week 6" })).toBeVisible();

    const sets = page.locator('input[type="number"]');
    await expect(sets).toHaveCount(2);
    await sets.nth(1).fill("3");
    await sets.nth(1).blur();
    await page.getByRole("button", { name: "Apply edit" }).click();
    await expect(page.getByText(/Superset set counts differ/i)).toHaveCount(0);

    const groupType = page.getByLabel("Group type");
    await groupType.selectOption("circuit");
    await page.getByRole("button", { name: "Apply edit" }).click();
    await expect(groupType).toHaveValue("circuit");
    await groupType.selectOption("superset");
    await page.getByRole("button", { name: "Apply edit" }).click();
    await expect(groupType).toHaveValue("superset");

    const moveLater = page.getByRole("button", { name: "Move workout later" });
    await moveLater.click();
    await page.getByRole("button", { name: "Apply edit" }).click();
    const expanded = page.getByRole("region", { name: "Expanded program preview" });
    const previewRows = expanded.locator("button");
    await expect(previewRows.first()).toContainText("Upper A");
    await expect(previewRows.nth(1)).toContainText("Lower A");

    await page.getByRole("button", { name: /save program/i }).click();
    await expect(page).toHaveURL(/\/programs\/[^/]+$/);
    await expect(page.getByText("Eight Week Review Fixture")).toBeVisible();
    await expect(page.getByText(/Add 2\.5 kg after all reps are completed/i)).toBeVisible();
    await page.reload();
    await expect(page.getByText("Add 2.5 kg after all reps are completed.")).toBeVisible();

    await openWorkout(page, 1, "Lower A");
    await expect(page.getByText("SUPERSET", { exact: true })).toBeVisible();
    await expect(page.locator('input[id^="cell-"]')).toHaveCount(6);
    await page.goto("programs");
    await page.getByRole("button", { name: "Eight Week Review Fixture" }).click();
    await openWorkout(page, 6, "Lower A");
    await expect(page.getByText("Dumbbell Romanian Deadlift", { exact: true })).toBeVisible();
    await page.goto("programs");
    await page.getByRole("button", { name: "Eight Week Review Fixture" }).click();
    await openWorkout(page, 4, "Lower A");
    await expect(page.locator('input[id^="cell-"]')).toHaveCount(4);
    await waitForIdb(page);
  });

  test("saves a usable import with a remaining warning, then fixes it in the workout editor", async ({ page }) => {
    await openImportReview(page, eightWeekProgram);
    await expect(page.getByText(/Superset set counts differ/i).first()).toBeVisible();
    await page.getByRole("button", { name: /save program/i }).click();
    await expect(page).toHaveURL(/\/programs\/[^/]+$/);

    await openWorkout(page, 1, "Lower A");
    await page.getByRole("button", { name: /edit prescription for romanian deadlift/i }).click();
    await page.getByLabel("Sets", { exact: true }).fill("3");
    await page.getByRole("button", { name: /^Save$/ }).last().click();
    await expect(page.getByRole("dialog", { name: "Review prescription edit" })).toBeVisible();
    await expect(page.getByText(/sets 4 → 3/i)).toBeVisible();
    await page.getByRole("button", { name: "Apply reviewed edit" }).click();
    await expect(page.getByRole("button", { name: /edit prescription for romanian deadlift/i })).toBeVisible();
  });

  test("imports and repairs a twelve-week routine without a length cap", async ({ page }) => {
    await openImportReview(page, twelveWeekProgram);
    const preview = page.getByRole("region", { name: "Expanded program preview" });
    await expect(preview.getByText(/Week 12/)).toBeVisible();
    await expect(page.getByText(/maximum of 8|at most 8 weeks/i)).toHaveCount(0);
    await page.getByRole("button", { name: /save program/i }).click();
    await expect(page).toHaveURL(/\/programs\/[^/]+$/);
    await expect(page.getByRole("button", { name: "WK 12" })).toBeVisible();
  });
});

test("prompt builder keeps the required contract on and optional coaching off by default", async ({ page }) => {
  await page.goto("prompts");
  await expect(page.getByLabel("Optional coaching")).not.toBeChecked();
  const generated = page.locator("section").filter({ hasText: "Generated prompt" });
  await expect(generated).toContainText("Routine JSON contract");
  await expect(generated).not.toContainText("Optional coaching");
  await page.getByLabel("Optional coaching").check();
  await expect(generated).toContainText("Optional coaching");
  await expect(generated).toContainText("Routine JSON contract");
});

test("applies an AI grouping-only change with shared routine scope", async ({ page }) => {
  await page.goto("import");
  await page.locator("textarea").fill(JSON.stringify({ program_name: "AI Grouping Fixture", weeks: 2, days: [{
    day: 1,
    title: "Day 1",
    sections: [{ name: "Strength", type: "strength", groups: [{ type: "single", exercises: [
      { name: "Goblet Squat", sets: 3, reps: "5", load: "100kg", countsTowardVolume: true },
    ] }] }],
  }] }));
  await page.getByRole("button", { name: /validate/i }).click();
  await chooseImportVersions(page);
  const reviewImport = page.getByRole("button", { name: /review import/i });
  if (await reviewImport.isVisible().catch(() => false)) await reviewImport.click();
  await page.getByRole("button", { name: /save program/i }).click();
  await openWorkout(page, 1, "Day 1");
  await page.getByRole("button", { name: /modify with ai/i }).click();
  const dialog = page.getByRole("dialog", { name: /modify with ai/i });
  await dialog.getByRole("textbox").fill(JSON.stringify({ days: [{ title: "Day 1", sections: [{
    name: "Strength",
    type: "strength",
    groups: [{ type: "circuit", exercises: [{ name: "Goblet Squat", sets: 3, reps: "5", load: "100kg", countsTowardVolume: true }] }],
  }] }] }));
  await dialog.getByRole("button", { name: /review changes/i }).click();
  await expect(page).toHaveURL(/\/programs\/.+\/diff/);
  await expect(page.getByRole("heading", { name: "Review edit" })).toBeVisible();
  const recurringScope = page.getByRole("radio", { name: /apply to remaining occurrences/i });
  await expect(recurringScope).toBeVisible();
  await recurringScope.click();
  await expect(recurringScope).toBeChecked();
  await expect(page.getByText(/changes across/i)).toBeVisible();
  await page.getByRole("button", { name: /apply changes/i }).click();
  await expect(page).toHaveURL(/\/programs\/[^/]+\/days\//);
  await expect(page.getByText("CIRCUIT", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("CIRCUIT", { exact: true })).toBeVisible();
});
