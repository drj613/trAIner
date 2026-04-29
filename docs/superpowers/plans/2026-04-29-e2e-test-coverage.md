# E2E Test Coverage Plan

**Goal:** Comprehensive Playwright coverage for all user-facing flows, with explicit persistence assertions (reload → verify IndexedDB data survives), grouped so each spec file owns one domain end-to-end with minimal cross-file navigation overhead.

**Architecture:** One `describe` block per domain. Each block seeds once in `beforeAll` or the first test, then chains subsequent tests against the already-seeded state — no repeated navigation from scratch. Persistence tests issue `page.reload()` between write and read to confirm IndexedDB round-trips correctly. `clearDb()` runs in `beforeEach` only where tests are truly independent; otherwise shared state is an intentional choice for efficiency.

**Existing coverage:** `e2e/today.spec.ts` (6 tests — basic Today screen) and `e2e/modify-ai.spec.ts` (11 tests — modal + diff flow).

---

## File Map

| File | Domain | New tests |
|------|--------|-----------|
| `e2e/workout-logging.spec.ts` | Core logging loop + IndexedDB persistence | ~10 |
| `e2e/exercise-history.spec.ts` | History drawer + session aggregation | ~6 |
| `e2e/modify-ai.spec.ts` | *(expand existing)* Override persistence, stacked edits | +3 |
| `e2e/program-import.spec.ts` | Import flow + program management | ~8 |
| `e2e/settings.spec.ts` | Theme/density/font + localStorage persistence | ~7 |
| `e2e/navigation.spec.ts` | Shell nav, redirects, 404 handling | ~5 |

Total: ~39 new tests (+ 3 expansions to existing file)

---

## Domain 1: Workout logging + IndexedDB persistence

**File:** `e2e/workout-logging.spec.ts`

Strategy: seed once in `beforeAll`, then chain all tests. Persistence tests reload the page mid-suite.

```ts
test.describe("Workout logging", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await clearDb(page);
    await seedDemoIfNeeded(page);
    await page.close();
  });
```

### Tests

- **logs a set value in a cell** — fill first input with `"80x5"`, blur, assert input shows `"80x5"`
- **progress bar increments on each logged set** — fill 3 cells, assert `3/N` text visible
- **skip value counts toward progress** — enter `"skip"`, assert classifyCell counts it (progress increments)
- **add-set button appends a new cell** — click `+` button on an exercise, assert one more input appears in that row
- **finish workout shows Saved feedback** — click "Finish workout", assert "Saved" text or CheckCircle icon visible within 3s
- **persists cell values after page reload** *(persistence)* — fill cells, finish workout, `page.reload()`, assert same cell values still rendered
- **persists added sets after reload** *(persistence)* — add extra set, finish, reload, assert extra cell still present
- **re-finish after reload updates existing log** — finish twice (without reloading between), assert no duplicate in history (history drawer shows 1 entry, not 2)
- **empty finish saves without error** — finish with no cells filled, assert no error message shown
- **save error shows alert** — mock `logRepo.save` to throw via `page.route()` intercepting the IDB write *(or skip if too brittle)*, assert error message visible

---

## Domain 2: Exercise history drawer

**File:** `e2e/exercise-history.spec.ts`

Strategy: log a real workout, then test history UI. Chain within one `describe`.

### Tests

- **history drawer opens on history button click** — click the `History for [name]` button on an exercise, assert dialog with `role="dialog"` appears
- **history drawer closes on Escape** — open drawer, press Escape, assert dialog gone
- **history drawer closes on backdrop click** — open drawer, click backdrop, assert dialog gone
- **drawer shows "No history yet" before any workout is logged** — fresh seed, open drawer without finishing any workout, assert empty-state text
- **drawer shows today's session after logging** — log sets, finish workout, reopen drawer, assert row with today's date visible
- **drawer shows correct set labels** — log `"80x5"` and `"85x3"`, finish, open drawer, assert both set strings visible
- **volume column shows calculated total** — log `"80x5"` (volume = 400), finish, open drawer, assert `400` visible in volume column

---

## Domain 3: Modify with AI (expand existing file)

**File:** `e2e/modify-ai.spec.ts` — add to existing `describe` block

### New tests (additions)

- **AI override persists after page reload** *(persistence)* — full flow: paste JSON → accept diff → `page.reload()` → assert new workout title (`"Upper Pull And Press"`) still renders on Today screen (confirms override written to and read from IndexedDB)
- **second AI edit stacks as additional override** — accept one AI diff, then open modal again, paste different JSON, accept second diff, assert Today screen shows second workout's title
- **copy button feedback shows "Copied!" then resets** — click Copy button, assert "Copied!" text within 500ms, wait 2.5s, assert text returns to "Copy"

---

## Domain 4: Program import + management

**File:** `e2e/program-import.spec.ts`

Strategy: start with empty DB, import a full program JSON via the Import page, then run management tests against it.

```ts
const IMPORT_JSON = JSON.stringify({
  program_name: "E2E Test Program",
  days: [{
    title: "Day 1",
    sections: [{
      type: "strength", name: "Strength",
      groups: [{ type: "single", exercises: [
        { name: "Squat", sets: 3, reps: "5", load: "100kg" }
      ]}]
    }]
  }]
});
```

### Tests

- **import page parses JSON and shows review summary** — navigate to `/import`, paste `IMPORT_JSON`, click "Review", assert exercise count text visible
- **save program persists to IndexedDB** — click "Save program", assert success message
- **imported program appears on programs list** *(persistence)* — navigate to `/programs`, assert "E2E Test Program" text visible
- **program map renders week grid** — click into program → Map, assert "Week 1" heading and `Day 1` cell visible
- **day cell link navigates to program+day** — click a non-rest day cell, assert URL contains `?day=`
- **invalid JSON shows parse error** — paste `"not json"` in import, click Review, assert error text visible
- **non-object JSON shows type error** — paste `"[1,2,3]"`, click Review, assert error about "must be an object"
- **imported program shows on Today screen after marking active** — if switching active program is supported via UI, verify Today shows the imported program's exercises

---

## Domain 5: Settings + localStorage persistence

**File:** `e2e/settings.spec.ts`

Strategy: navigate to `/settings` once, run all tests in sequence. Reload mid-suite for persistence assertions.

### Tests

- **settings page renders theme, density, and font sections** — assert three section labels visible
- **clicking a theme applies data-theme attribute** — click "terminal" button, assert `document.documentElement.dataset.theme === "terminal"` via `page.evaluate()`
- **theme persists after reload** *(persistence)* — click "terminal", `page.reload()`, assert `data-theme="terminal"` still set
- **clicking density applies data-density attribute** — click "Dense", assert `data-density="dense"` via evaluate
- **density persists after reload** *(persistence)* — click "Dense", reload, assert attribute persists
- **clicking mono font applies data-mono attribute** — click "System", assert `data-mono="system"`
- **mono font persists after reload** *(persistence)* — click "System", reload, assert persists

---

## Domain 6: Navigation + shell

**File:** `e2e/navigation.spec.ts`

Strategy: lightweight, no seeding needed for most. Start from `/today`.

### Tests

- **root `/` redirects to `/today`** — `page.goto("/")`, assert URL is `/today`
- **nav links reach correct routes** — iterate `["/today", "/history", "/library", "/programs", "/settings"]`, assert each renders without error (`h1` or main content visible)
- **nav active state reflects current route** — navigate to `/history`, assert history nav item has active styling (aria-current or active class)
- **unknown route shows 404 or redirects** — `page.goto("/does-not-exist")`, assert 404 page or redirect, no crash
- **browser back works after navigation** — go to `/settings`, press back, assert URL is previous page

---

## Helpers to add to `e2e/helpers.ts`

```ts
/** Wait for IndexedDB to flush by yielding to the event loop */
export async function waitForIdb(page: Page) {
  await page.evaluate(() => new Promise(r => setTimeout(r, 50)));
}

/** Minimal valid import JSON for program tests */
export const IMPORT_PROGRAM_JSON = JSON.stringify({ ... });

/** Read a data-attribute from documentElement */
export async function getDocAttr(page: Page, attr: string): Promise<string | null> {
  return page.evaluate((a) => document.documentElement.getAttribute(a), attr);
}
```

---

## Grouping strategy rationale

| Concern | Decision |
|---------|----------|
| Seed cost | `beforeAll` seeds once per file, not per test |
| State bleed | Each file gets `clearDb` in its own `beforeAll`; tests within a file share state intentionally |
| Persistence coverage | Every domain with storage has at least one reload test |
| Parallelism | `workers: 1` in config — IndexedDB is per-browser-context, no cross-test interference |
| Fragility | Assertions use `role` and `aria-label` (semantic), not CSS class names |

---

## Execution order recommendation

Implement in this order — each builds on infra from the previous:

1. `workout-logging.spec.ts` — highest value, tests the core loop
2. `exercise-history.spec.ts` — builds on logging infrastructure
3. Expand `modify-ai.spec.ts` — adds persistence proof to existing tests
4. `program-import.spec.ts` — independent, tests second major flow
5. `settings.spec.ts` — simple, good coverage for localStorage
6. `navigation.spec.ts` — cheapest, catch-all for routing
