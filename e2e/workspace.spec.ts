import { test, expect, type Page } from "@playwright/test";
import { getDocAttr } from "./helpers";

// ---------------------------------------------------------------------------
// Workspace (Settings) suite — serial mode, shared page
// ---------------------------------------------------------------------------

test.describe("Workspace settings", () => {
  test.describe.configure({ mode: "serial" });

  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    sharedPage = await ctx.newPage();
    // Clear any previously-persisted theme/density/mono so tests start clean
    await sharedPage.goto("/");
    await sharedPage.evaluate(() => localStorage.clear());
    await sharedPage.goto("/settings");
    await sharedPage.waitForLoadState("networkidle");
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // 1. Sections are rendered
  test("workspace page renders theme, density, and font sections", async () => {
    await expect(sharedPage.getByText("Theme")).toBeVisible();
    await expect(sharedPage.getByText("Density")).toBeVisible();
    await expect(sharedPage.getByText("Monospace Font")).toBeVisible();
  });

  // 2. Clicking a theme applies data-theme attribute
  test("clicking a theme applies data-theme attribute", async () => {
    await sharedPage.getByRole("button", { name: "terminal" }).click();
    expect(await getDocAttr(sharedPage, "data-theme")).toBe("terminal");
  });

  // 3. Theme persists after reload
  test("theme persists after reload", async () => {
    await sharedPage.reload();
    await sharedPage.waitForLoadState("networkidle");
    expect(await getDocAttr(sharedPage, "data-theme")).toBe("terminal");
  });

  // 4. Clicking density applies data-density attribute
  test("clicking density applies data-density attribute", async () => {
    await sharedPage.getByRole("button", { name: "Dense" }).click();
    expect(await getDocAttr(sharedPage, "data-density")).toBe("dense");
  });

  // 5. Density persists after reload
  test("density persists after reload", async () => {
    await sharedPage.reload();
    await sharedPage.waitForLoadState("networkidle");
    expect(await getDocAttr(sharedPage, "data-density")).toBe("dense");
  });

  // 6. Clicking mono font applies data-mono attribute
  test("clicking mono font applies data-mono attribute", async () => {
    await sharedPage.getByRole("button", { name: "System" }).click();
    expect(await getDocAttr(sharedPage, "data-mono")).toBe("system");
  });

  // 7. Mono font persists after reload
  test("mono font persists after reload", async () => {
    await sharedPage.reload();
    await sharedPage.waitForLoadState("networkidle");
    expect(await getDocAttr(sharedPage, "data-mono")).toBe("system");
  });
});
