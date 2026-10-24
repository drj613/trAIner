import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { chooseImportVersions, clearDb, finishWorkout } from "./helpers";

const ROUTINE = JSON.stringify({
  program_name: "Uploaded Routine",
  days: [{
    title: "Press Day",
    sections: [{
      type: "strength",
      name: "Main lifts",
      groups: [{ type: "single", exercises: [{ name: "Barbell Bench Press", sets: 4, reps: "6", load: "80", unit: "kg" }] }],
    }],
  }],
});

async function readStoreCounts(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("trainer-local-first");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["programs", "logs"], "readonly");
    const counts = await Promise.all(["programs", "logs"].map((name) => new Promise<number>((resolve, reject) => {
      const count = tx.objectStore(name).count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    })));
    db.close();
    return { programs: counts[0], logs: counts[1] };
  });
}

async function readProgramDayId(page: Page, programId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const request = indexedDB.open("trainer-local-first");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("programs", "readonly");
    const program = await new Promise<{ days: Array<{ id: string }> }>((resolve, reject) => {
      const get = tx.objectStore("programs").get(id);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return program.days[0].id;
  }, programId);
}

async function continueImportReview(page: Page) {
  const confirm = page.getByRole("heading", { name: "Confirm import" });
  const review = page.getByRole("button", { name: /review import/i });
  await expect.poll(async () => {
    if (await confirm.isVisible()) return "confirm";
    if (await review.isVisible()) return "review";
    return "pending";
  }).not.toBe("pending");
  if (await review.isVisible()) await review.click();
  await expect(confirm).toBeVisible();
}

async function uploadAndReview(page: Page, filename: string, contents: string) {
  await page.getByLabel("Choose JSON file").setInputFiles({
    name: filename,
    mimeType: "application/json",
    buffer: Buffer.from(contents),
  });
  await expect(page.getByLabel("Routine JSON")).toHaveValue(contents);
  await expect(page.getByRole("status")).toHaveText(`Loaded ${filename}`);
  await page.getByRole("button", { name: /validate/i }).click();
  await chooseImportVersions(page);
  await continueImportReview(page);
}

test("a selected routine JSON file saves and reloads the reviewed prescription", async ({ page }) => {
  await page.goto("import");
  await clearDb(page);
  await page.goto("import");

  await uploadAndReview(page, "uploaded-routine.json", ROUTINE);
  await expect(page.getByRole("heading", { name: "Uploaded Routine" })).toBeVisible();
  await page.getByRole("button", { name: /save program/i }).click();
  await page.waitForURL(/\/programs\/[^/]+$/);
  await expect(page.getByText("Uploaded Routine", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Uploaded Routine", { exact: true })).toBeVisible();
  await page.getByText("Press Day", { exact: true }).click();
  await expect(page.getByText(/4×\s*6\s*80/)).toBeVisible();
});

test("backup file guidance preserves the current import and stored routines and history", async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("import");
  await clearDb(page);
  await page.goto("import");

  await uploadAndReview(page, "uploaded-routine.json", ROUTINE);
  await page.getByRole("button", { name: /save program/i }).click();
  await page.waitForURL(/\/programs\/[^/]+$/);
  const programId = page.url().split("/programs/")[1].split("?")[0];
  const dayId = await readProgramDayId(page, programId);
  await page.goto(`programs/${programId}/days/${dayId}`);
  await page.locator('input[id^="cell-"]').first().fill("80kgx6");
  await page.locator('input[id^="cell-"]').first().blur();
  await finishWorkout(page);
  await expect(page.getByRole("button", { name: /finish workout/i })).toHaveText(/saved/i);
  const before = await readStoreCounts(page);
  expect(before.logs).toBeGreaterThan(0);

  await page.goto("import");
  await page.getByLabel("Routine JSON").fill("keep this current draft");
  const backup = JSON.stringify({ programs: [{ title: "Must Not Restore" }], logs: [{ id: "backup-log" }] });
  await page.getByLabel("Choose JSON file").setInputFiles({
    name: "workspace-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });

  await expect(page.getByRole("alert")).toContainText("This is a workspace backup. Restore it in Settings.");
  await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/trAIner/settings");
  await expect(page.getByLabel("Routine JSON")).toHaveValue("keep this current draft");
  expect(await readStoreCounts(page)).toEqual(before);

  await page.goto("programs");
  await expect(page.getByRole("button", { name: "Uploaded Routine" })).toBeVisible();
  await expect(page.getByText("Must Not Restore")).toHaveCount(0);
  await context.close();
});

test("the downloaded example routine can be uploaded, validated, and saved", async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("import");
  await clearDb(page);
  await page.goto("import");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download example JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("routine.json");
  const path = await download.path();
  expect(path).toBeTruthy();

  const exampleText = await readFile(path!, "utf8");
  await page.getByLabel("Choose JSON file").setInputFiles(path!);
  await expect(page.getByLabel("Routine JSON")).toHaveValue(exampleText);
  await expect(page.getByRole("status")).toHaveText(/^Loaded .+$/);
  await page.getByRole("button", { name: /validate/i }).click();
  await chooseImportVersions(page);
  await continueImportReview(page);
  await page.getByRole("button", { name: /save program/i }).click();
  await page.waitForURL(/\/programs\/[^/]+$/);
  await page.reload();
  await expect(page.getByText("Example routine", { exact: true })).toBeVisible();
  await page.getByText("Upper body", { exact: true }).click();
  await expect(page.getByText(/3×\s*8\s*95/)).toBeVisible();

  await context.close();
});
