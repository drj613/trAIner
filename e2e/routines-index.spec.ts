import { test, expect, type Page } from "@playwright/test";
import { clearDb, seedDemoIfNeeded, IMPORT_PROGRAM_JSON } from "./helpers";

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
    await sharedPage.goto("today");
    await clearDb(sharedPage);

    // 2. Seed the draft "E2E Test Program" via the import UI
    //    (the helper imports it and lands on Today).
    await seedDemoIfNeeded(sharedPage);

    // 3b. Import a second draft program "Second Draft Program" so filter tests
    //     are non-trivial: "archived" chip should hide both drafts; "all" shows them.
    const secondProgramJson = JSON.stringify({
      program_name: "Second Draft Program",
      days: [{ title: "Day 1", sections: [] }],
    });
    await sharedPage.goto("import");
    await sharedPage.locator("textarea").fill(secondProgramJson);
    await sharedPage.getByRole("button", { name: /validate/i }).click();
    await expect(sharedPage.getByText(/1 day · 0 exercises/i)).toBeVisible();
    await sharedPage.getByRole("button", { name: /save program/i }).click();
    // Saving navigates to the new program's detail page
    await sharedPage.waitForURL(/\/programs\/[^/]+$/);

    // No archive UI exists, so write an archived program directly to IDB to make the filter chips testable.
    // Must match ProgramDocument shape — update if src/lib/programs/types.ts changes.
    await sharedPage.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("trainer-local-first");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const now = new Date().toISOString();
      const archivedProgram = {
        id: "archived-test-program",
        title: "Archived Program",
        description: "",
        days: [{ id: "d1", title: "Day 1", weekNumber: 1, sections: [] }],
        active: false,
        status: "archived",
        createdAt: now,
        updatedAt: now,
        lastRunAt: null,
        streakWeeks: 0,
        completion: 0,
      };
      // The "Local First Demo" program the activation tests expect (the seed
      // helper imports "E2E Test Program", which stays a draft).
      const demoProgram = {
        id: "local-first-demo-program",
        title: "Local First Demo",
        description: "",
        days: [
          {
            id: "demo-d1",
            dayNumber: 1,
            title: "Day 1",
            sections: [
              {
                id: "demo-s1",
                name: "Strength",
                type: "strength",
                groups: [
                  {
                    id: "demo-g1",
                    type: "single",
                    exercises: [
                      {
                        id: "demo-e1",
                        name: "Squat",
                        sets: 3,
                        reps: "5",
                        tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        overrides: [],
        active: false,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("programs", "readwrite");
        tx.objectStore("programs").put(archivedProgram);
        tx.objectStore("programs").put(demoProgram);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });

    // 4. Navigate to /programs and activate the demo program via 3-dot menu
    //    so tests see an active card with stat tiles and WeekStrip.
    //    AppShell also has aria-label="Open menu" (nav hamburger) at index 0;
    //    program row menu buttons start at index 1.
    await sharedPage.goto("programs");
    // Wait for rows to render
    await expect(rowMenuBtns(sharedPage).nth(1)).toBeVisible({ timeout: 8000 });
    // Find the demo program row ("Local First Demo") and activate it
    const menuBtnsSetup = rowMenuBtns(sharedPage);
    const totalSetup = await menuBtnsSetup.count();
    let demoMenuIdx = -1;
    for (let i = 1; i < totalSetup; i++) {
      const rowContainer = menuBtnsSetup.nth(i).locator("..");
      const text = await rowContainer.textContent().catch(() => "");
      if (text?.includes("Local First Demo")) {
        demoMenuIdx = i;
        break;
      }
    }
    if (demoMenuIdx < 0) throw new Error("Could not find 'Local First Demo' menu button in setup");
    await menuBtnsSetup.nth(demoMenuIdx).click();
    await expect(sharedPage.getByText("Activate")).toBeVisible({ timeout: 5000 });
    await sharedPage.getByRole("button", { name: "Activate" }).click();
    // Wait for the in-page state to flip to ACTIVE — this guarantees the
    // IndexedDB write committed; reloading sooner can abort the transaction.
    await expect(sharedPage.getByText("ACTIVE", { exact: true })).toBeVisible({ timeout: 8000 });
    await sharedPage.reload();
    // Confirm the active state persisted (IDB re-read on mount)
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
    // Multiple draft rows may be present — assert at least the first one is visible.
    await expect(sharedPage.getByText(/not started/i).first()).toBeVisible();
  });

  // 5. Filter chip "archived" hides draft programs and shows only archived ones
  test('filter chip "archived" hides drafts and shows archived programs', async () => {
    // The chip renders: {k} <span>·{count}</span> — match by prefix
    await sharedPage.getByRole("button", { name: /^archived/ }).click();
    // Draft programs must NOT be visible when the archived filter is active
    await expect(sharedPage.getByText("E2E Test Program")).not.toBeVisible();
    await expect(sharedPage.getByText("Second Draft Program")).not.toBeVisible();
    // The archived program must BE visible
    await expect(sharedPage.getByText("Archived Program")).toBeVisible();
    // The active card (with ACTIVE badge) is always rendered regardless of filter
    await expect(sharedPage.getByText("ACTIVE", { exact: true })).toBeVisible();
  });

  // 6. Filter chip "all" restores full list (drafts + archived all visible)
  test('filter chip "all" restores full list', async () => {
    await sharedPage.getByRole("button", { name: /^all/ }).click();
    // All non-active programs should be visible again
    await expect(sharedPage.getByText("E2E Test Program")).toBeVisible();
    await expect(sharedPage.getByText("Second Draft Program")).toBeVisible();
    await expect(sharedPage.getByText("Archived Program")).toBeVisible();
    // ACTIVE badge still present
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
    await sharedPage.goto("programs");
    await expect(sharedPage.getByText("E2E Test Program")).toBeVisible();

    // Find the "Open menu" button for the "E2E Test Program" row specifically.
    // Row buttons start at index 1 (AppShell hamburger is at index 0).
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

    if (e2eMenuIdx < 0) throw new Error("Could not find 'E2E Test Program' menu button");

    await menuBtns.nth(e2eMenuIdx).click();
    await expect(sharedPage.getByText("Activate")).toBeVisible();
    await sharedPage.getByRole("button", { name: "Activate" }).click();

    // Wait until the activation is committed to IndexedDB before reloading —
    // reloading mid-write aborts the transaction and loses the activation.
    await expect
      .poll(
        () =>
          sharedPage.evaluate(
            () =>
              new Promise((resolve) => {
                const req = indexedDB.open("trainer-local-first");
                req.onsuccess = () => {
                  const db = req.result;
                  const r = db.transaction("programs").objectStore("programs").getAll();
                  r.onsuccess = () => {
                    db.close();
                    const active = (r.result as Array<{ status?: string; title: string }>).find(
                      (p) => p.status === "active",
                    );
                    resolve(active?.title ?? null);
                  };
                };
              }),
          ),
        { timeout: 8000 },
      )
      .toBe("E2E Test Program");
    await sharedPage.reload();
    await expect(sharedPage.getByText("ACTIVE", { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(sharedPage.getByText("E2E Test Program")).toBeVisible();
  });

  // 9. Duplicate adds a "Copy of …" row
  test("duplicate adds a Copy of row", async () => {
    // After test 8: "E2E Test Program" is active; "Local First Demo", "Second Draft Program",
    // and "Archived Program" are in the Other list. Find "Local First Demo" by row text.
    const menuBtns9 = rowMenuBtns(sharedPage);
    const total9 = await menuBtns9.count();
    let demoIdx9 = -1;
    for (let i = 1; i < total9; i++) {
      const rowContainer = menuBtns9.nth(i).locator("..");
      const text = await rowContainer.textContent().catch(() => "");
      if (text?.includes("Local First Demo")) {
        demoIdx9 = i;
        break;
      }
    }
    if (demoIdx9 < 0) throw new Error("Could not find 'Local First Demo' menu button in test 9");

    await menuBtns9.nth(demoIdx9).click();
    await expect(sharedPage.getByText("Duplicate")).toBeVisible();
    await sharedPage.getByRole("button", { name: "Duplicate" }).click();

    // handleDuplicate navigates to the new program's detail page
    await sharedPage.waitForURL(/\/programs\/[^/]+$/);

    // Navigate back to /programs and reload
    await sharedPage.goto("programs");
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

    // Wait until the deletion is committed to IndexedDB before reloading —
    // reloading mid-write aborts the transaction and the program survives.
    await expect
      .poll(
        () =>
          sharedPage.evaluate(
            () =>
              new Promise((resolve) => {
                const req = indexedDB.open("trainer-local-first");
                req.onsuccess = () => {
                  const db = req.result;
                  const r = db.transaction("programs").objectStore("programs").getAll();
                  r.onsuccess = () => {
                    db.close();
                    resolve(
                      (r.result as Array<{ title: string }>).some((p) =>
                        /copy of/i.test(p.title),
                      ),
                    );
                  };
                };
              }),
          ),
        { timeout: 8000 },
      )
      .toBe(false);
    await sharedPage.reload();

    // "Copy of …" should no longer be visible
    await expect(sharedPage.getByText(/copy of/i)).not.toBeVisible({ timeout: 8000 });
  });
});
