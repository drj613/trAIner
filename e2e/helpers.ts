import type { Page } from "@playwright/test";

/**
 * Import a program via the /import UI if no program is loaded yet.
 * Returns when the Today screen shows workout content.
 */
export async function seedDemoIfNeeded(page: Page) {
  // Always import — tests use fresh browser contexts, so DB is empty
  await page.goto("import");
  // Wait for textarea to be ready
  await page.locator("textarea").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("textarea").fill(IMPORT_PROGRAM_JSON);
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /validate/i }).click({ timeout: 10000 });
  // Handle "Resolve exercises" step — exercises may need attention
  const reviewBtn = page.getByRole("button", { name: /review import/i });
  if (await reviewBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
    await reviewBtn.click();
  }
  await page.getByRole("button", { name: /save program/i }).click({ timeout: 10000 });
  await page.waitForTimeout(500);
  // Honour the documented contract: end on the Today screen with workout
  // content visible (saving an import lands on the program detail page).
  await page.goto("today");
  await page.locator('input[id^="cell-"]').first().waitFor({ state: "visible", timeout: 10000 });
}

/**
 * Clear all IndexedDB databases so each test starts fresh.
 */
export async function clearDb(page: Page) {
  // indexedDB.databases() throws a SecurityError on about:blank; navigate first.
  if (page.url() === "about:blank") {
    await page.goto("");
  }
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases?.();
    if (dbs) {
      await Promise.all(dbs.map((db) => new Promise<void>((res, rej) => {
        const req = indexedDB.deleteDatabase(db.name!);
        req.onsuccess = () => res();
        req.onerror = () => rej(req.error);
        req.onblocked = () => res();
      })));
    }
  });
}

/** Wait for IndexedDB to flush by yielding to the event loop */
export async function waitForIdb(page: Page) {
  await page.evaluate(() => new Promise(r => setTimeout(r, 50)));
}

/** Minimal valid import JSON for program tests */
export const IMPORT_PROGRAM_JSON = JSON.stringify({
  program_name: "E2E Test Program",
  days: [{
    title: "Day 1",
    sections: [{
      type: "strength", name: "Strength",
      groups: [{ type: "single", exercises: [
        { name: "Squat", sets: 3, reps: "5", load: "100kg" }
      ]}]
    }]
  }]
});

/** Read a data-attribute from documentElement */
export async function getDocAttr(page: Page, attr: string): Promise<string | null> {
  return page.evaluate((a) => document.documentElement.getAttribute(a), attr);
}

/** Valid AI-modified workout JSON for use in tests */
export const AI_WORKOUT_JSON = JSON.stringify({
  days: [{
    title: "Upper Pull And Press",
    sections: [
      {
        type: "warmup",
        name: "Warm-Up Circuit",
        groups: [{
          type: "circuit",
          exercises: [
            { name: "Banded Face Pulls", sets: 1, reps: "20", load: "light band", rest: "0s" },
            { name: "Scapular Pull-Ups", sets: 1, reps: "8-10", load: "bodyweight", rest: "0s" },
            { name: "Band Pull-Aparts", sets: 1, reps: "20", load: "light band", rest: "60s" },
          ],
        }],
      },
      {
        type: "strength",
        name: "Strength",
        groups: [
          { type: "single", exercises: [{ name: "Pull-Up", sets: 4, reps: "5-8", load: "bodyweight or weighted", rest: "2:00" }] },
          { type: "single", exercises: [{ name: "Dumbbell Incline Press", sets: 4, reps: "8-10", load: "moderate", rest: "90s" }] },
        ],
      },
      {
        type: "hypertrophy",
        name: "Aesthetic Volume",
        groups: [
          {
            type: "superset",
            exercises: [
              { name: "Chest-Supported Dumbbell Row", sets: 3, reps: "10-12", load: "moderate", rest: "0s" },
              { name: "Dumbbell Lateral Raise", sets: 3, reps: "15-20", load: "light-moderate", rest: "75s" },
            ],
          },
        ],
      },
    ],
  }],
});
