import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Navigation suite — lightweight, no seeding required
// ---------------------------------------------------------------------------

test.describe("Navigation", () => {
  // -------------------------------------------------------------------------
  // 1. Root "/" redirects to "/today"
  // -------------------------------------------------------------------------
  test("root / redirects to /today", async ({ page }) => {
    await page.goto("");
    await expect(page).toHaveURL(/\/today$/);
  });

  // -------------------------------------------------------------------------
  // 2. All nav routes render without crashing
  //    (direct navigation — faster than clicking through the drawer)
  // -------------------------------------------------------------------------
  const routes = [
    "/today",
    "/history",
    "/library",
    "/programs",
    "/settings",
    "/profile",
    "/prompts",
  ] as const;

  for (const route of routes) {
    test(`${route} renders without error`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
    });
  }

  // -------------------------------------------------------------------------
  // 3. Active nav state reflects current route
  //    Active link gets color: var(--accent), inactive gets color: var(--fg).
  //    We verify the active link has a different colour to the others — done by
  //    asserting no TWO non-active sibling links share the same computed colour
  //    as the active one.  The simplest reliable check: the History link's
  //    computed color differs from the Today link's when on /history.
  // -------------------------------------------------------------------------
  test("nav drawer shows active state for current route", async ({ page }) => {
    await page.goto("history");

    // Open the nav drawer
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Get the "History" link and a non-active link ("Today")
    const historyLink = page.getByRole("link", { name: /^History$/i });
    const todayLink = page.getByRole("link", { name: /^Today$/i });

    // Active link should have accent colour — different from the inactive link's colour
    const historyColor = await historyLink.evaluate(
      (el) => window.getComputedStyle(el).color
    );
    const todayColor = await todayLink.evaluate(
      (el) => window.getComputedStyle(el).color
    );

    expect(historyColor).not.toBe(todayColor);
  });

  // -------------------------------------------------------------------------
  // 4. Unknown route shows a page (no unhandled crash / error boundary)
  // -------------------------------------------------------------------------
  test("unknown route does not crash the app", async ({ page }) => {
    await page.goto("does-not-exist");
    // AppShell still renders (header + main) — if React throws an unhandled error
    // the entire tree unmounts and this fails.
    await expect(page.getByRole("main")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 5. Browser back works after navigation
  // -------------------------------------------------------------------------
  test("browser back returns to previous route", async ({ page }) => {
    await page.goto("settings");
    await page.goto("today");
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
  });
});
