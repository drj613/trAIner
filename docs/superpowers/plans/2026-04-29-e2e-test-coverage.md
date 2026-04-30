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
| `e2e/program-import.spec.ts` | Import wizard + resolution step + program management | ~9 |
| `e2e/routines-index.spec.ts` | Routines list, activate/duplicate/delete, filter chips | ~8 |
| `e2e/routine-builder.spec.ts` | 3-step new-routine wizard | ~6 |
| `e2e/analysis-card.spec.ts` | Inline analysis card expand/tabs + LLM sheet | ~5 |
| `e2e/workspace.spec.ts` | Theme/density/font + localStorage persistence | ~7 |
| `e2e/navigation.spec.ts` | Shell nav, redirects, 404 handling | ~5 |

Total: ~59 new tests (+ 3 expansions to existing file)

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
- **imported program shows on Today screen after marking active** — verify Today shows the imported program's exercises after activating via routines index
- **duplicate program name shows resolution step** — import the same JSON twice, assert resolution step appears with "Keep both" / "Replace" options; choose "Keep both", assert two entries on programs list

---

## Domain 5: Routines index

**File:** `e2e/routines-index.spec.ts`

Strategy: seed two programs (one active, one draft) in `beforeAll`, then chain tests. Mutation tests (activate/duplicate/delete) run last.

### Tests

- **active program renders with active badge** — navigate to `/programs`, assert the active program card shows an "Active" badge
- **stat tiles show days/week and length** — assert tiles like "4d/wk" and "8 wk" visible on the active card
- **week strip renders day dots** — assert at least one day-dot element visible in the active card strip
- **draft programs render as compact rows** — assert the draft program appears as a row (not the full active card)
- **filter chip "Draft" shows only draft programs** — click the "Draft" chip, assert active card disappears, draft row remains
- **filter chip "All" restores full list** — click "Draft" then "All", assert active card reappears
- **3-dot menu opens on trigger click** — click the 3-dot menu on the draft row, assert menu with "Activate", "Duplicate", "Delete" items visible
- **activate moves program to active card** *(persistence)* — activate the draft via menu, reload, assert it now renders as the active card
- **duplicate adds a "Copy of …" row** *(persistence)* — duplicate a program via menu, reload, assert "Copy of" row present in the list
- **delete removes the program** *(persistence)* — delete a program via menu, reload, assert program no longer in list

---

## Domain 6: Routine builder

**File:** `e2e/routine-builder.spec.ts`

Strategy: `clearDb` in `beforeAll`, navigate to `/programs/new`, chain the 3-step wizard tests.

### Tests

- **step 1 shows title and goal fields** — navigate to `/programs/new`, assert title input and goal selector visible
- **cannot advance past step 1 with empty title** — click Next with empty title, assert validation error, URL still on step 1
- **step 2 shows day-count and week-count controls** — enter title, advance, assert day/week inputs visible
- **step 3 shows exercise picker entry point** — advance to step 3, assert "Add exercise" button visible
- **exercise picker sheet opens on add click** — click "Add exercise", assert bottom sheet with search input appears
- **search returns matching exercises** — type "Squat" in picker, assert at least one result row containing "Squat" visible
- **selecting an exercise adds it to the day** — click a result row, assert exercise name appears in the day's exercise list

---

## Domain 7: Analysis card

**File:** `e2e/analysis-card.spec.ts`

Strategy: seed one program with at least a few exercises via import, navigate to its detail page, chain tests.

### Tests

- **analysis card renders collapsed with score badge** — navigate to `/programs/[id]`, assert score badge (a number 0–100) and grade letter visible
- **clicking card header expands the body** — click the fingerprint label, assert volume bars section appears
- **dimension chip switches active tab** — click the "Balance" chip, assert ratio rows (e.g. "Push : Pull") appear
- **clicking "AI prompt" opens the LLM sheet** — expand card, click "AI prompt" button, assert bottom sheet with "Copy prompt" button visible
- **LLM sheet closes on backdrop click** — click the backdrop, assert sheet disappears

---

## Domain 8: Workspace + localStorage persistence

**File:** `e2e/workspace.spec.ts`

Strategy: navigate to `/workspace` once, run all tests in sequence. Reload mid-suite for persistence assertions.

> **Note:** Previously `settings.spec.ts` targeting `/settings`. Page renamed to Workspace in plan 05 — route is now `/workspace`, nav label is "Workspace".

### Tests

- **workspace page renders theme, density, and font sections** — assert three section labels visible
- **clicking a theme applies data-theme attribute** — click "terminal" button, assert `document.documentElement.dataset.theme === "terminal"` via `page.evaluate()`
- **theme persists after reload** *(persistence)* — click "terminal", `page.reload()`, assert `data-theme="terminal"` still set
- **clicking density applies data-density attribute** — click "Dense", assert `data-density="dense"` via evaluate
- **density persists after reload** *(persistence)* — click "Dense", reload, assert attribute persists
- **clicking mono font applies data-mono attribute** — click "System", assert `data-mono="system"`
- **mono font persists after reload** *(persistence)* — click "System", reload, assert persists

---

## Domain 9: Navigation + shell

**File:** `e2e/navigation.spec.ts`

Strategy: lightweight, no seeding needed for most. Start from `/today`.

### Tests

- **root `/` redirects to `/today`** — `page.goto("/")`, assert URL is `/today`
- **nav links reach correct routes** — iterate `["/today", "/history", "/library", "/programs", "/workspace", "/profile", "/prompts"]`, assert each renders without error (`h1` or main content visible)
- **nav active state reflects current route** — navigate to `/history`, assert history nav item has active styling (aria-current or active class)
- **unknown route shows 404 or redirects** — `page.goto("/does-not-exist")`, assert 404 page or redirect, no crash
- **browser back works after navigation** — go to `/workspace`, press back, assert URL is previous page

---

## Helpers to add to `e2e/helpers.ts`

```ts
/** Wait for IndexedDB to flush by yielding to the event loop */
export async function waitForIdb(page: Page) {
  await page.evaluate(() => new Promise(r => setTimeout(r, 50)));
}

/** Minimal valid import JSON for program tests */
export const IMPORT_PROGRAM_JSON = JSON.stringify({
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
5. `routines-index.spec.ts` — depends on import infra to seed programs
6. `routine-builder.spec.ts` — independent new-program creation flow
7. `analysis-card.spec.ts` — depends on a seeded program from import
8. `workspace.spec.ts` — simple, good coverage for localStorage
9. `navigation.spec.ts` — cheapest, catch-all for routing
