import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { chooseImportVersions, clearDb, finishWorkout } from "./helpers";

const ROUTINE = JSON.stringify({
  program_name: "History Export E2E",
  days: [{
    title: "Upper A",
    sections: [{
      type: "strength",
      name: "Strength",
      groups: [{
        type: "single",
        exercises: [{ name: "Bench Press", sets: 3, reps: "8", load: "95", unit: "lb" }],
      }],
    }],
  }],
});

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

async function hasRecordedCells(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const request = indexedDB.open("trainer-local-first");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("logs", "readonly");
    const logs = await new Promise<Array<{ entries?: Array<{ sets?: Array<{ weight?: number; rawCell?: string }> }> }>>((resolve, reject) => {
      const get = tx.objectStore("logs").getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return logs.some((log) => log.entries?.some((entry) => entry.sets?.some((set) => set.weight === 95) && entry.sets?.some((set) => set.rawCell === "slow final rep")));
  });
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

test("History export previews, filters inclusively, copies, and downloads identical text", async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  await page.goto("import");
  await clearDb(page);
  await page.goto("import");

  await page.getByLabel("Choose JSON file").setInputFiles({
    name: "history-export-routine.json",
    mimeType: "application/json",
    buffer: Buffer.from(ROUTINE),
  });
  await expect(page.getByLabel("Routine JSON")).toHaveValue(ROUTINE);
  await expect(page.getByRole("status")).toHaveText("Loaded history-export-routine.json");
  await page.getByRole("button", { name: /validate/i }).click();
  await chooseImportVersions(page);
  await continueImportReview(page);
  await page.getByRole("button", { name: /save program/i }).click();
  await page.waitForURL(/\/programs\/[^/]+$/);

  const programId = page.url().split("/programs/")[1].split("?")[0];
  const dayId = await readProgramDayId(page, programId);
  await page.goto(`programs/${programId}/days/${dayId}`);
  const cells = page.locator('input[id^="cell-"]');
  await expect(cells).toHaveCount(3);
  await cells.nth(0).fill("95x8");
  await cells.nth(0).blur();
  await cells.nth(1).fill("slow final rep");
  await cells.nth(1).blur();
  await expect.poll(() => hasRecordedCells(page)).toBe(true);

  await finishWorkout(page);
  await expect(page.getByRole("button", { name: /finish workout/i })).toHaveText(/saved/i);
  await page.goto("history");
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Export for AI" }).click();

  const panel = page.getByRole("region", { name: "Export workout history" });
  const preview = panel.getByLabel("Export preview");
  await expect(preview).toHaveValue(/Bench Press/);
  await expect(preview).toHaveValue(/95lbx8/);
  await expect(preview).toHaveValue(/raw:"slow final rep"/);

  const previewText = await preview.inputValue();
  const sessionDate = previewText.match(/^(\d{4}-\d{2}-\d{2}) \| routine:/m)?.[1];
  expect(sessionDate).toBeTruthy();

  await panel.getByLabel("From").fill(sessionDate!);
  await panel.getByLabel("Through").fill(sessionDate!);
  await expect(preview).toHaveValue(/95lbx8/);
  await expect(panel.getByRole("button", { name: "Copy" })).toBeEnabled();
  await expect(panel.getByRole("button", { name: "Download .txt" })).toBeEnabled();

  await panel.getByRole("button", { name: "Copy" }).click();
  await expect(panel.getByRole("status")).toHaveText("Copied");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(await preview.inputValue());

  const expectedText = await preview.inputValue();
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download .txt" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^trAIner-history-/);
  expect(await readFile((await download.path())!, "utf8")).toBe(expectedText);

  await panel.getByLabel("From").fill("2001-01-01");
  await panel.getByLabel("Through").fill("2001-01-01");
  await expect(preview).toHaveValue(/No workouts in this range/);
  await expect(panel.getByRole("button", { name: "Copy" })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Download .txt" })).toBeDisabled();

  await context.close();
});
