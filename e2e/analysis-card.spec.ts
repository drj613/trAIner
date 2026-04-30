import { test, expect, type Page } from "@playwright/test";
import { clearDb, seedDemoIfNeeded } from "./helpers";

// ---------------------------------------------------------------------------
// Analysis card suite — serial so tests chain (card stays expanded after test 2)
// ---------------------------------------------------------------------------

test.describe("RoutineAnalysisCard", () => {
  test.describe.configure({ mode: "serial" });

  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    sharedPage = await ctx.newPage();

    // 1. Navigate first so IDB is accessible, then clear
    await sharedPage.goto("/today");
    await clearDb(sharedPage);

    // 2. Seed demo program via UI
    await seedDemoIfNeeded(sharedPage);

    // 3. Navigate directly to the demo program detail page.
    //    Demo program has a stable static id: "demo-program" (src/lib/programs/sample.ts)
    await sharedPage.goto("/programs/demo-program");
    // Wait for the program title to confirm the page has loaded
    await expect(sharedPage.getByRole("heading", { name: /local first demo/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // -------------------------------------------------------------------------
  // Test 1: Analysis card renders collapsed with score badge
  // -------------------------------------------------------------------------

  test("analysis card renders collapsed with score badge", async () => {
    // ScoreBadge renders: grade letter (fontSize 16, fontWeight 700) + score number (fontSize 9)
    // Grade is always one of A–F; score is 0–100.
    const gradeLetter = sharedPage.getByText(/^[A-F]$/);
    await expect(gradeLetter).toBeVisible({ timeout: 8000 });

    // Score is a number 0–100 — the small text inside the badge.
    // We verify it by checking that something numeric is present near the badge.
    const scoreText = sharedPage.locator("span").filter({ hasText: /^\d{1,3}$/ }).first();
    await expect(scoreText).toBeVisible();

    // Card is collapsed by default — expanded body must NOT be visible yet.
    // The "MEV" header label only appears inside the expanded VolumeBars panel.
    await expect(sharedPage.getByText("MEV")).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Test 2: Clicking the card header expands the body
  // -------------------------------------------------------------------------

  test("clicking card header expands the body", async () => {
    // The header is a <button> containing "Analysis" text (line 230 of RoutineAnalysisCard).
    // Use name matching to avoid matching DimChip buttons.
    const headerBtn = sharedPage.getByRole("button", { name: /analysis/i }).first();
    await headerBtn.click();

    // After expansion the VolumeBars header row shows "MEV", "MAV", "MRV" labels
    // (line 74 of RoutineAnalysisCard). "MEV" only exists inside the expanded panel.
    await expect(sharedPage.getByText("MEV")).toBeVisible({ timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // Test 3: Clicking a dimension chip switches the active tab
  // -------------------------------------------------------------------------

  test("clicking balance chip switches to balance tab", async () => {
    // The DimChip label text is "Balance" (capitalized in source, CSS uppercase is visual only).
    // Click the chip by role+name to target the button element.
    const balanceChip = sharedPage.getByRole("button", { name: /balance/i });
    await balanceChip.click();

    // BalancePanel renders ratio labels like "Push : Pull" (toDisplayAnalysis.ts line 78).
    // Use exact text to avoid strict-mode violation from multiple matches.
    await expect(sharedPage.getByText("Push : Pull")).toBeVisible({ timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // Test 4: Clicking "AI prompt" opens the LLM sheet
  // -------------------------------------------------------------------------

  test('clicking "AI prompt" opens the LLM sheet', async () => {
    // The card is already expanded from test 2/3.
    // "AI prompt" button is inside the expanded body (RoutineAnalysisCard line 296–303).
    // Use first() to pick the button in the analysis footer (chip buttons are also inside).
    const aiPromptBtn = sharedPage.getByRole("button", { name: /ai prompt/i });
    await aiPromptBtn.click();

    // LlmAnalysisSheet: outer div has data-testid="llm-sheet-backdrop"
    const backdrop = sharedPage.getByTestId("llm-sheet-backdrop");
    await expect(backdrop).toBeVisible({ timeout: 5000 });

    // "Copy prompt" button is always rendered inside the sheet footer (line 199)
    await expect(sharedPage.getByRole("button", { name: /copy prompt/i })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Test 5: Clicking the backdrop closes the LLM sheet
  // -------------------------------------------------------------------------

  test("clicking the backdrop closes the LLM sheet", async () => {
    // Backdrop fills the full viewport; the inner sheet slides up from the bottom.
    // Click the top-left corner of the backdrop to avoid landing on the sheet content
    // (inner div has e.stopPropagation so clicking there would NOT close).
    const backdrop = sharedPage.getByTestId("llm-sheet-backdrop");
    await backdrop.click({ position: { x: 10, y: 10 } });

    // LlmAnalysisSheet returns null when open=false, so the backdrop disappears
    await expect(backdrop).not.toBeVisible({ timeout: 5000 });
  });
});
