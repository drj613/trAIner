import { test, expect } from "@playwright/test";

test("prompt editor fits a narrow preview, including long edited text", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("prompts");
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await expect.poll(fits).toBe(true);
  await page.getByText("Choose coaches", { exact: true }).click();
  await expect.poll(fits).toBe(true);
  await page.getByPlaceholder(/name this preset/i).fill("VeryLongPresetName".repeat(12));
  await page.getByPlaceholder(/temporary injury/i).fill("AnUnbrokenInjuryDescription".repeat(12));
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByText("Coach: Hypertrophy Methodologist", { exact: true }).click();
  await page.getByLabel("Hypertrophy Methodologist", { exact: true }).fill("AnUnbrokenCoachInstruction".repeat(20));
  await expect.poll(fits).toBe(true);
  await page.getByLabel("Optional coaching").check();
  await page.getByText("Read the coaching instructions", { exact: true }).click();
  await page.getByText("Read the output requirements", { exact: true }).click();
  await expect.poll(fits).toBe(true);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect.poll(fits).toBe(true);
});

test("field previews match the complete copied prompt", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("prompts");
  await expect(page.getByRole("alert")).toContainText("No profile found");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("trainer-local-first");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("profile", "readwrite");
    tx.objectStore("profile").put({ id: "local-profile", name: "Alex", goals: ["Stronger squats"], equipment: ["Full gym"], constraints: [], injuries: ["Sore shoulder"], preferences: [], trainingAge: "5 years", defaultDaysPerWeek: 3, updatedAt: "now" });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.reload();
  const goals = page.getByRole("region", { name: "Goals prompt section", exact: true });
  await expect(goals).toContainText("1. Stronger squats");
  await page.getByLabel("Goals", { exact: true }).uncheck();
  await expect(goals).toContainText("Excluded from the copied prompt");
  await page.getByText("Coach: Hypertrophy Methodologist", { exact: true }).click();
  await page.getByLabel("Hypertrophy Methodologist", { exact: true }).fill("My own coach instructions.");
  await page.getByLabel("Optional coaching", { exact: true }).check();
  await page.getByRole("button", { name: /copy prompt/i }).click();
  await expect(page.getByRole("status")).toContainText("Copied the complete prompt");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("My own coach instructions.");
  expect(text).toContain("Equipment: Full gym");
  expect(text).toContain("- Sore shoulder");
  expect(text).toContain("## Routine JSON contract");
  expect(text).toContain("## Optional coaching");
  expect(text).not.toContain("Stronger squats");
  expect(text).not.toContain("Excluded from the copied prompt");
});
