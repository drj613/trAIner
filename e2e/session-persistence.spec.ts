import { test, expect, type Page } from "@playwright/test";
import { seedDemoIfNeeded, clearDb, waitForIdb, finishWorkout } from "./helpers";

// ---------------------------------------------------------------------------
// Session persistence — guards against duplicate/phantom workout logs and
// verifies historical sessions stay visible when revisiting a day.
// All navigation here is client-side (SPA links), which is what triggers the
// autosave unmount-flush path where phantom logs used to be written.
// ---------------------------------------------------------------------------

async function countLogs(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open("trainer-local-first");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("logs", "readonly");
          const countReq = tx.objectStore("logs").count();
          countReq.onsuccess = () => {
            db.close();
            resolve(countReq.result);
          };
          countReq.onerror = () => {
            db.close();
            reject(countReq.error);
          };
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

/** SPA round-trip: day page → program detail → back to the day page. */
async function bounceAwayAndBack(page: Page) {
  await page.getByRole("link", { name: /routines/i }).click();
  // Expand the collapsed day card, then enter the day.
  await page.getByText("Day 1", { exact: true }).click();
  await page.getByRole("button", { name: "View →" }).first().click();
  await expect(page.locator('input[id^="cell-"]').first()).toBeVisible();
  await waitForIdb(page);
}

test.describe("Session persistence", () => {
  test.describe.configure({ mode: "serial" });

  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    sharedPage = await ctx.newPage();
    await sharedPage.goto("today");
    await clearDb(sharedPage);
    await seedDemoIfNeeded(sharedPage);
    await sharedPage.goto("today");
    await expect(sharedPage.locator('input[id^="cell-"]').first()).toBeVisible();
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // 1. Merely clicking around must not create any session logs.
  test("navigating between pages without logging creates no sessions", async () => {
    for (let i = 0; i < 3; i++) {
      await bounceAwayAndBack(sharedPage);
    }
    expect(await countLogs(sharedPage)).toBe(0);
  });

  // 2. A logged set survives leaving and returning — same single session.
  test("a logged set survives navigation and does not duplicate the session", async () => {
    const firstCell = sharedPage.locator('input[id^="cell-"]').first();
    await firstCell.fill("100x5");
    await firstCell.blur();
    await waitForIdb(sharedPage);

    await bounceAwayAndBack(sharedPage);
    await expect(sharedPage.locator('input[id^="cell-"]').first()).toHaveValue("100x5");

    await bounceAwayAndBack(sharedPage);
    await expect(sharedPage.locator('input[id^="cell-"]').first()).toHaveValue("100x5");

    expect(await countLogs(sharedPage)).toBe(1);
  });

  // 3. After finishing, revisiting the day shows the completed session's
  //    lifts and the completed state — not an empty "new session".
  test("revisiting a finished day shows its lifts and completed state", async () => {
    await finishWorkout(sharedPage);
    await expect(
      sharedPage.getByRole("button", { name: /finish workout/i }),
    ).toHaveText(/saved/i, { timeout: 2000 });
    await waitForIdb(sharedPage);

    await bounceAwayAndBack(sharedPage);

    await expect(sharedPage.locator('input[id^="cell-"]').first()).toHaveValue("100x5");
    await expect(sharedPage.getByRole("button", { name: /completed/i })).toBeDisabled();
    expect(await countLogs(sharedPage)).toBe(1);
  });
});
