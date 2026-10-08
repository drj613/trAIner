import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { chooseImportVersions, clearDb, waitForIdb, finishWorkout } from "./helpers";

const ROUTINE = JSON.stringify({
  title: "Backup Lineage Routine",
  weeks: 2,
  days: [
    {
      day: 1,
      title: "Upper A",
      sections: [{
        type: "strength",
        name: "Strength",
        groups: [{ type: "single", exercises: [{
          name: "Bench Press", sets: 3, reps: "8", load: "60kg",
          variants: [{ weeks: [2], reps: "10" }],
        }] }],
      }],
    },
    {
      day: 2,
      title: "Upper B",
      sections: [{
        type: "strength",
        name: "Strength",
        groups: [{ type: "single", exercises: [{ name: "Squat", sets: 2, reps: "12" }] }],
      }],
    },
  ],
});

async function readBackupStore(page: Page, stores: string[]) {
  return page.evaluate(async (storeNames) => {
    const request = indexedDB.open("trainer-local-first");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(storeNames, "readonly");
    const results = await Promise.all(storeNames.map((name) => new Promise<unknown[]>((resolve, reject) => {
      const get = tx.objectStore(name).getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    })));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return Object.fromEntries(storeNames.map((name, index) => [name, results[index]]));
  }, stores);
}

test("real backup restore keeps routine lineage, workout history, and prompt presets editable", async ({ browser }) => {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("import");
  await clearDb(page);
  await page.goto("import");

  await page.locator("textarea").fill(ROUTINE);
  await page.getByRole("button", { name: /validate/i }).click();
  await chooseImportVersions(page);
  const reviewImport = page.getByRole("button", { name: /review import/i });
  await expect(reviewImport).toBeEnabled();
  await reviewImport.click();
  await expect(page.getByRole("heading", { name: "Confirm import" })).toBeVisible();
  await page.getByRole("button", { name: /save program/i }).click();
  await page.waitForURL(/\/programs\/[^/]+$/);

  const programId = page.url().split("/programs/")[1].split("?")[0];
  let state = await readBackupStore(page, ["programs"]);
  let program = (state.programs as Array<Record<string, unknown>>).find(item => item.id === programId)!;
  const days = program.days as Array<Record<string, unknown>>;
  const firstDay = days.find(day => day.weekNumber === 1 && day.dayNumber === 1)!;
  const secondDay = days.find(day => day.weekNumber === 1 && day.dayNumber === 2)!;
  expect(program.editing).toBeTruthy();

  // Finish a second day to create a completed history record with its frozen
  // prescription, then leave the first day active with an autosaved set.
  await page.goto(`programs/${programId}/days/${secondDay.id}`);
  await finishWorkout(page);
  await expect(page.getByRole("button", { name: /finish workout/i })).toHaveText(/saved/i);
  await page.goto(`programs/${programId}/days/${firstDay.id}`);
  const activeCell = page.locator('input[id^="cell-"]').first();
  await activeCell.fill("60kgx8");
  await activeCell.blur();
  await page.waitForTimeout(1700);
  await waitForIdb(page);

  await page.evaluate(async () => {
    const request = indexedDB.open("trainer-local-first");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("promptPresets", "readwrite");
    tx.objectStore("promptPresets").put({
      id: "old-preset", name: "Before backup", personaIds: [], editedBlocks: {},
      fieldOn: {}, schemaOn: true, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
    });
    tx.objectStore("promptPresets").put({
      id: "coaching-preset", name: "Strength coach", personaIds: ["strength-coach"],
      editedBlocks: { goal: "Keep every instruction concise." },
      fieldOn: { goal: true, equipment: false }, schemaOn: false, coachingOn: true,
      createdAt: "2026-10-01T00:01:00.000Z", updatedAt: "2026-10-01T00:01:00.000Z",
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });

  await page.goto("settings");
  const exportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup file" }).click();
  const download = await exportDownload;
  const backupText = await readFile((await download.path())!, "utf8");
  const backup = JSON.parse(backupText) as {
    programs: Array<Record<string, unknown>>;
    logs: Array<Record<string, unknown>>;
    promptPresets: Array<Record<string, unknown>>;
  };
  expect(backup.programs.find(item => item.id === programId)?.editing).toBeTruthy();
  expect(backup.logs.some(log => log.completedAt && log.prescriptionSnapshot)).toBe(true);
  expect(backup.logs.some(log => Array.isArray(log.entries) && (log.entries as Array<Record<string, unknown>>).length > 0)).toBe(true);
  expect(backup.promptPresets.some(preset => preset.id === "old-preset")).toBe(true);
  expect(backup.promptPresets).toContainEqual(expect.objectContaining({
    id: "coaching-preset", coachingOn: true, schemaOn: false,
    editedBlocks: { goal: "Keep every instruction concise." },
  }));

  // Make the live database visibly different so a restore through the chosen
  // file is the only way the original records can reappear.
  await page.evaluate(async (id) => {
    const request = indexedDB.open("trainer-local-first");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["programs", "logs", "promptPresets"], "readwrite");
    const programs = tx.objectStore("programs");
    const get = programs.get(id);
    await new Promise<void>((resolve, reject) => {
      get.onsuccess = () => {
        const poisoned = get.result;
        poisoned.title = "Poisoned live copy";
        delete poisoned.editing;
        programs.put(poisoned);
        resolve();
      };
      get.onerror = () => reject(get.error);
    });
    tx.objectStore("logs").clear();
    const presets = tx.objectStore("promptPresets");
    presets.clear();
    presets.put({
      id: "new-preset", name: "After backup", personaIds: [], editedBlocks: {},
      fieldOn: {}, schemaOn: true, createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z",
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, programId);

  page.on("dialog", dialog => void dialog.accept());
  const safetyDownload = page.waitForEvent("download");
  await page.locator('input[type="file"]').setInputFiles({
    name: "routine-workspace-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backupText),
  });
  expect((await safetyDownload).suggestedFilename()).toMatch(/^trAIner-pre-restore-/);

  await page.goto("programs");
  await expect(page.getByRole("button", { name: "Backup Lineage Routine" })).toBeVisible();
  state = await readBackupStore(page, ["programs", "logs", "promptPresets"]);
  program = (state.programs as Array<Record<string, unknown>>).find(item => item.id === programId)!;
  expect(program.title).toBe("Backup Lineage Routine");
  expect(program.editing).toBeTruthy();
  expect((state.logs as Array<Record<string, unknown>>).some(log => log.completedAt && log.prescriptionSnapshot)).toBe(true);
  expect((state.logs as Array<Record<string, unknown>>).some(log => Array.isArray(log.entries) && (log.entries as unknown[]).length > 0)).toBe(true);
  const restoredPresets = state.promptPresets as Array<Record<string, unknown>>;
  expect(restoredPresets.map(preset => preset.id).sort()).toEqual(["coaching-preset", "old-preset"]);
  expect(restoredPresets.find(preset => preset.id === "coaching-preset")).toEqual(expect.objectContaining({
    coachingOn: true, schemaOn: false, editedBlocks: { goal: "Keep every instruction concise." },
  }));
  expect(restoredPresets.some(preset => preset.id === "new-preset")).toBe(false);

  // The restored lineage remains usable through the actual recurring-edit UI.
  await page.goto(`programs/${programId}/days/${firstDay.id}`);
  await page.getByRole("button", { name: /edit prescription for bench press/i }).click();
  await page.getByLabel("Reps").fill("12");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review prescription edit" });
  await expect(review).toBeVisible();
  const recurringScope = review.getByRole("radio", { name: /apply to remaining occurrences of upper a/i });
  if (!(await recurringScope.isChecked())) await recurringScope.click();
  await expect(recurringScope).toBeChecked();
  await review.getByRole("button", { name: "Apply reviewed edit" }).click();
  await expect(review).toHaveCount(0);

  const edited = await readBackupStore(page, ["programs", "logs"]);
  const savedProgram = (edited.programs as Array<Record<string, unknown>>).find(item => item.id === programId)!;
  const savedDays = savedProgram.days as Array<Record<string, unknown>>;
  const editing = savedProgram.editing as { templateDays: Array<{ sections: Array<{ groups: Array<{ exercises: Array<{ reps: string }> }> }> }> };
  expect(editing.templateDays[0].sections[0].groups[0].exercises[0].reps).toBe("12");
  const firstWeekDay = savedDays.find(item => item.weekNumber === 1 && item.dayNumber === 1)!;
  const secondWeekDay = savedDays.find(item => item.weekNumber === 2 && item.dayNumber === 1)!;
  const secondWeekSections = secondWeekDay.sections as Array<{ groups: Array<{ exercises: Array<{ reps: string }> }> }>;
  expect(secondWeekSections[0].groups[0].exercises[0].reps).toBe("10"); // The imported week-two exception remains intact.
  const overrides = savedProgram.overrides as Array<{ scope: string; dayId?: string; replacement: Record<string, unknown> | Array<Record<string, unknown>> }>;
  const editedDayOverride = overrides.find(item => item.scope === "day" && item.dayId === firstWeekDay.id)!;
  const effectiveReplacement = Array.isArray(editedDayOverride.replacement) ? editedDayOverride.replacement[0] : editedDayOverride.replacement;
  const editedSections = effectiveReplacement.sections as Array<{ groups: Array<{ exercises: Array<{ reps: string }> }> }>;
  expect(editedSections[0].groups[0].exercises[0].reps).toBe("12");
  await expect(page.getByText(/3× 12 60kg/)).toBeVisible();
  expect((edited.logs as Array<Record<string, unknown>>).some(log => log.completedAt && log.prescriptionSnapshot)).toBe(true);

  await context.close();
});
