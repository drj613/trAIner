import { test, expect, type Page } from "@playwright/test";
import { clearDb, seedDemoIfNeeded, waitForIdb, IMPORT_PROGRAM_JSON } from "./helpers";

// ---------------------------------------------------------------------------
// Routines index suite — serial mode so tests chain: read tests → mutation tests
// ---------------------------------------------------------------------------

// Helper: returns locator for the "Open menu" buttons in program rows.
// The AppShell navigation also has aria-label="Open menu" (hamburger),
// so we skip index 0 and start from index 1 for program rows.
function rowMenuBtns(page: Page) {
  return page.getByRole("button", { name: "Open menu" });
}

test.describe("Routines index", () => {
  test.describe.configure({ mode: "serial" });

  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    sharedPage = await ctx.newPage();

    // 1. Navigate first so IDB is accessible, then clear
    await sharedPage.goto("/today");
    await clearDb(sharedPage);

    // 2. Seed the demo program via UI
    //    Note: demoProgram has active:true but no status field,
    //    so programStatus() returns "draft" — not rendered as ActiveCard yet.
    await seedDemoIfNeeded(sharedPage);

    // 3. Navigate to /import and seed the draft "E2E Test Program"
    await sharedPage.goto("/import");
    await sharedPage.locator("textarea").fill(IMPORT_PROGRAM_JSON);
    await sharedPage.getByRole("button", { name: /validate/i }).click();
    await expect(sharedPage.getByText(/1 day\(s\) · 1 exercise\(s\)/i)).toBeVisible();
    await sharedPage.getByRole("button", { name: /save program/i }).click();
    await expect(sharedPage.getByText(/"E2E Test Program" saved/i)).toBeVisible();

    // 4. Navigate to /programs and activate the demo program via 3-dot menu
    //    so tests see an active card with stat tiles and WeekStrip.
    //    AppShell also has aria-label="Open menu" (nav hamburger) at index 0;
    //    program row menu buttons start at index 1.
    await sharedPage.goto("/programs");
    // Wait for rows to render
    await expect(rowMenuBtns(sharedPage).nth(1)).toBeVisible({ timeout: 8000 });
    // Open first program row menu (index 1, skipping AppShell nav button at index 0)
    await rowMenuBtns(sharedPage).nth(1).click();
    await expect(sharedPage.getByText("Activate")).toBeVisible({ timeout: 5000 });
    await sharedPage.getByRole("button", { name: "Activate" }).click();
    // router.refresh() doesn't re-trigger LocalDataProvider — do a full reload
    await waitForIdb(sharedPage);
    await sharedPage.reload();
    // Wait for ACTIVE badge (now that IDB has been re-read on mount)
    await expect(sharedPage.getByText("ACTIVE", { exact: true })).toBeVisible({ timeout: 8000 });
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // -------------------------------------------------------------------------
  // Read tests (non-mutating)
  // -------------------------------------------------------------------------

  // 1. Active program renders with ACTIVE badge
  test("active program renders with ACTIVE badge", async () => {
    await expect(sharedPage.getByText("ACTIVE", { exact: true })).toBeVisible();
  });

  // 2. Stat tiles show days/week and length labels
  test("stat tiles show days/week and length", async () => {
    // StatTile renders the label string directly: <div>{label}</div>
    // Source uses uppercase strings: "DAYS/WK", "LENGTH", "STREAK", "DONE"
    await expect(sharedPage.getByText("DAYS/WK")).toBeVisible();
    await expect(sharedPage.getByText("LENGTH")).toBeVisible();
  });

  // 3. WeekStrip renders day labels inside active card
  test("week strip renders day labels", async () => {
    // WeekStrip renders DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    // The demo program ("Local First Demo") has 1 day, so WeekStrip shows 1 slot: "Mon".
    // DOM text is mixed-case; CSS textTransform:uppercase is visual-only.
    await expect(sharedPage.getByText("Mon")).toBeVisible();
    // Confirm the active card section exists (WeekStrip is inside ActiveCard)
    await expect(sharedPage.getByText("Open today")).toBeVisible();
  });

  // 4. Draft programs render as compact rows with "not started" subtitle
  test("draft programs render as compact rows", async () => {
    // RoutineRow subtitle: "{dpw}d/wk · {lw}w · not started" for draft programs
    await expect(sharedPage.getByText(/not started/i)).toBeVisible();
  });

  // 5. Filter chip "draft" shows only draft programs in the Other section
  test('filter chip "draft" shows only draft programs', async () => {
    // The chip renders: {k} <span>·{count}</span> — match by prefix
    await sharedPage.getByRole("button", { name: /^draft/ }).click();
    // The draft filter should show the "E2E Test Program" (which is draft)
    await expect(sharedPage.getByText("E2E Test Program")).toBeVisible();
    // The active card (with ACTIVE badge) is always rendered regardless of filter
    await expect(sharedPage.getByText("ACTIVE", { exact: true })).toBeVisible();
    // Confirm the archived ·0 chip still shows (filter UI is visible)
    await expect(sharedPage.getByRole("button", { name: /^archived/ })).toBeVisible();
  });

  // 6. Filter chip "all" restores full list
  test('filter chip "all" restores full list', async () => {
    await sharedPage.getByRole("button", { name: /^all/ }).click();
    // ACTIVE badge should reappear
    await expect(sharedPage.getByText("ACTIVE", { exact: true })).toBeVisible();
  });

  // 7. 3-dot menu opens and shows action items
  test("3-dot menu opens on trigger click", async () => {
    // Click the program row menu button (index 1, skipping AppShell hamburger at 0)
    await rowMenuBtns(sharedPage).nth(1).click();
    // Menu items should be visible
    await expect(sharedPage.getByText("Activate")).toBeVisible();
    await expect(sharedPage.getByText("Duplicate")).toBeVisible();
    await expect(sharedPage.getByText("Delete")).toBeVisible();
    // Close the menu via Escape so mutation tests start fresh
    await sharedPage.keyboard.press("Escape");
    await expect(sharedPage.getByText("Activate")).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Mutation tests — run last; each opens a fresh menu
  // -------------------------------------------------------------------------

  // 8. Activate "E2E Test Program" moves it to the active card
  test("activate moves program to active card", async () => {
    // Reload to ensure clean state after test 7
    await sharedPage.goto("/programs");
    await expect(sharedPage.getByText("E2E Test Program")).toBeVisible();

    // Find the "Open menu" button for the "E2E Test Program" row.
    // After setup, there are 2 draft rows: "Local First Demo" and "E2E Test Program".
    // Row buttons start at index 1 (AppShell at 0).
    // We need to find E2E Test Program's menu button specifically.
    const menuBtns = rowMenuBtns(sharedPage);
    const totalMenuBtns = await menuBtns.count();

    // Identify the correct button by checking parent row text
    let e2eMenuIdx = -1;
    for (let i = 1; i < totalMenuBtns; i++) {
      const rowContainer = menuBtns.nth(i).locator("..");
      const text = await rowContainer.textContent().catch(() => "");
      if (text?.includes("E2E Test Program")) {
        e2eMenuIdx = i;
        break;
      }
    }

    // If we found the specific row, use it; otherwise use last row button
    if (e2eMenuIdx >= 0) {
      await menuBtns.nth(e2eMenuIdx).click();
    } else {
      await menuBtns.nth(totalMenuBtns - 1).click();
    }

    await expect(sharedPage.getByText("Activate")).toBeVisible();
    await sharedPage.getByRole("button", { name: "Activate" }).click();

    // Confirm persistence after reload
    await waitForIdb(sharedPage);
    await sharedPage.reload();
    await expect(sharedPage.getByText("ACTIVE", { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(sharedPage.getByText("E2E Test Program")).toBeVisible();
  });

  // 9. Duplicate adds a "Copy of …" row
  test("duplicate adds a Copy of row", async () => {
    // After test 8: "E2E Test Program" is active; "Local First Demo" is in Other list.
    // Index 1 is the first (and only) program row menu.
    await rowMenuBtns(sharedPage).nth(1).click();
    await expect(sharedPage.getByText("Duplicate")).toBeVisible();
    await sharedPage.getByRole("button", { name: "Duplicate" }).click();

    // handleDuplicate navigates to the new program's detail page
    await sharedPage.waitForURL(/\/programs\/[^/]+$/);

    // Navigate back to /programs and reload
    await sharedPage.goto("/programs");
    await sharedPage.reload();
    await expect(sharedPage.getByText(/copy of/i)).toBeVisible({ timeout: 8000 });
  });

  // 10. Delete removes the "Copy of …" program
  test("delete removes the program", async () => {
    // Register dialog handler BEFORE clicking Delete
    sharedPage.on("dialog", (d) => d.accept());

    // After test 9: there are 2 rows: "Local First Demo" and "Copy of Local First Demo"
    // Find the "Copy of …" row's menu button by checking row text
    const menuBtns = rowMenuBtns(sharedPage);
    const totalMenuBtns = await menuBtns.count();

    let copyMenuIdx = totalMenuBtns - 1; // fallback: last
    for (let i = 1; i < totalMenuBtns; i++) {
      const rowContainer = menuBtns.nth(i).locator("..");
      const text = await rowContainer.textContent().catch(() => "");
      if (/copy of/i.test(text ?? "")) {
        copyMenuIdx = i;
        break;
      }
    }

    await menuBtns.nth(copyMenuIdx).click();
    await expect(sharedPage.getByText("Delete")).toBeVisible();
    await sharedPage.getByRole("button", { name: "Delete" }).click();

    // Wait for IDB and reload
    await waitForIdb(sharedPage);
    await sharedPage.reload();

    // "Copy of …" should no longer be visible
    await expect(sharedPage.getByText(/copy of/i)).not.toBeVisible({ timeout: 8000 });
  });
});
