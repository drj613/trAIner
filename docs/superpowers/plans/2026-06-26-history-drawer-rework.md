# History Drawer Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make raw-text/duration sets (e.g. `2.5kg x10`, `40s hold`) appear in the mid-workout history drawer, redesign the drawer as per-session cards that show each set exactly as entered plus that session's note, and fix the same raw-cell omission on the analysis/History page.

**Architecture:** A single pure `formatSetLabel(set, sep)` helper in `historyUtils.ts` replaces the two duplicated, `rawCell`-blind `formatSet` functions; it returns `rawCell` verbatim when present. `aggregateExerciseHistory` additionally carries the per-exercise session `note` and dates each row by local day via `logLocalDate`. `HistoryDrawer.tsx` renders stacked session cards with color-coded set pills (reusing `classifyCell`) and the note. `HistoryClient.tsx` delegates to the shared helper.

**Tech Stack:** React 18 + TypeScript, Vite, Jest + Testing Library (jsdom, `TZ=America/New_York`), Playwright (baseURL `http://localhost:5173/trAIner/`, auto-starts `vite` dev server).

**Commands:** single jest file → `npx jest <path>`; full suite → `npm test`; lint → `npm run lint`; single e2e spec → `npm run test:e2e -- <path>`.

---

## File Structure

- `src/lib/workout/historyUtils.ts` — **modify.** Add exported pure `formatSetLabel(set, sep)`; extend `ExerciseSessionRow` with `note?`; `aggregateExerciseHistory` uses the helper, carries `note`, dates via `logLocalDate`.
- `src/lib/workout/historyUtils.test.ts` — **modify.** Add tests for `formatSetLabel` (rawCell, separators) and for aggregate (rawCell sets included, note carried, local-day dating).
- `src/components/workout/HistoryDrawer.tsx` — **modify.** Replace the `date | sets | vol` grid with session cards: formatted local date, color-coded pills via `classifyCell`, note line, volume-when-nonzero.
- `src/components/workout/HistoryDrawer.test.tsx` — **modify.** Update the date assertion to the formatted label; add note/raw-pill/hidden-volume tests.
- `src/components/workout/HistoryClient.tsx` — **modify.** Replace its private `formatSet` body with a one-line delegation to `formatSetLabel(s, "×")`.
- `e2e/history-rawcell.spec.ts` — **create.** End-to-end guard: enter a raw value + note, finish, reopen history, assert the pill + note are visible.
- `e2e/exercise-history.spec.ts` — **modify.** Update the one date-format assertion (test "drawer shows today's session after logging") to the new formatted label.

---

## Task 1: Shared `formatSetLabel` helper + richer `aggregateExerciseHistory`

**Files:**
- Modify: `src/lib/workout/historyUtils.ts`
- Test: `src/lib/workout/historyUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these tests inside the `describe("aggregateExerciseHistory", ...)` block in `src/lib/workout/historyUtils.test.ts` (before its closing `});`), and add the new `formatSetLabel` describe block at the end of the file:

```typescript
  it("includes raw-text and duration sets stored in rawCell", () => {
    const rawLogs: WorkoutLogDocument[] = [{
      id: "log-raw", programId: "p1", dayId: "d1",
      performedAt: "2026-05-01T09:00:00.000Z",
      entries: [{ exerciseId: "handstand", sets: [
        { setNumber: 1, rawCell: "40s hold" },
        { setNumber: 2, rawCell: "2.5kg x10" },
      ]}],
    }];
    const rows = aggregateExerciseHistory(rawLogs, "handstand");
    expect(rows[0].sets).toEqual(["40s hold", "2.5kg x10"]);
  });

  it("carries the per-exercise session note", () => {
    const noted: WorkoutLogDocument[] = [{
      id: "log-note", programId: "p1", dayId: "d1",
      performedAt: "2026-05-01T09:00:00.000Z",
      entries: [{ exerciseId: "bench-press", notes: "go up next week",
        sets: [{ setNumber: 1, weight: 60, reps: 10 }] }],
    }];
    const rows = aggregateExerciseHistory(noted, "bench-press");
    expect(rows[0].note).toBe("go up next week");
  });

  it("omits note when the entry has none", () => {
    const rows = aggregateExerciseHistory(logs, "bench-press");
    expect(rows[0].note).toBeUndefined();
  });

  it("dates a session by its local day, not the UTC date of performedAt", () => {
    // 2026-05-02T02:00Z is still 2026-05-01 in America/New_York (jest TZ pin).
    const lateNight: WorkoutLogDocument[] = [{
      id: "log-late", programId: "p1", dayId: "d1",
      performedAt: "2026-05-02T02:00:00.000Z",
      entries: [{ exerciseId: "bench-press", sets: [{ setNumber: 1, weight: 60, reps: 10 }] }],
    }];
    const rows = aggregateExerciseHistory(lateNight, "bench-press");
    expect(rows[0].date).toBe("2026-05-01");
  });

  it("prefers explicit performedDate over performedAt for dating", () => {
    const withDate: WorkoutLogDocument[] = [{
      id: "log-pd", programId: "p1", dayId: "d1",
      performedAt: "2026-05-02T02:00:00.000Z", performedDate: "2026-05-01",
      entries: [{ exerciseId: "bench-press", sets: [{ setNumber: 1, weight: 60, reps: 10 }] }],
    }];
    expect(aggregateExerciseHistory(withDate, "bench-press")[0].date).toBe("2026-05-01");
  });
```

Add this new block at the very end of the file (after the `aggregateExerciseHistory` describe's closing `});`):

```typescript
describe("formatSetLabel", () => {
  it("returns rawCell verbatim when present", () => {
    expect(formatSetLabel({ setNumber: 1, rawCell: "2.5kg x10" })).toBe("2.5kg x10");
    expect(formatSetLabel({ setNumber: 1, rawCell: "40s hold" })).toBe("40s hold");
    expect(formatSetLabel({ setNumber: 1, rawCell: "skip" })).toBe("skip");
  });

  it("formats numeric sets with the default 'x' separator", () => {
    expect(formatSetLabel({ setNumber: 1, weight: 65, reps: 10 })).toBe("65x10");
  });

  it("uses the supplied separator", () => {
    expect(formatSetLabel({ setNumber: 1, weight: 65, reps: 10 }, "×")).toBe("65×10");
  });

  it("uses BW prefix when weight is absent", () => {
    expect(formatSetLabel({ setNumber: 1, reps: 8 })).toBe("BWx8");
    expect(formatSetLabel({ setNumber: 1, reps: 8 }, "×")).toBe("BW×8");
  });

  it("returns weight only when reps absent, and '' when both absent", () => {
    expect(formatSetLabel({ setNumber: 1, weight: 60 })).toBe("60");
    expect(formatSetLabel({ setNumber: 1 })).toBe("");
  });

  it("ignores a blank rawCell and falls through to numeric formatting", () => {
    expect(formatSetLabel({ setNumber: 1, weight: 60, reps: 10, rawCell: "" })).toBe("60x10");
  });
});
```

Update the import line at the top of the test file to pull in the new helper:

```typescript
import { aggregateExerciseHistory, formatSetLabel } from "./historyUtils";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/workout/historyUtils.test.ts`
Expected: FAIL — `formatSetLabel` is not exported (TypeScript/import error), and `rows[0].note` / local-date assertions fail against current code.

- [ ] **Step 3: Implement the helper and aggregate changes**

Edit `src/lib/workout/historyUtils.ts`. Add the `logLocalDate` import, replace the `formatSet` function with the exported `formatSetLabel`, extend the row type, and update the `rows.push(...)` block. The full file becomes:

```typescript
import type { WorkoutLogDocument, WorkoutSetLog } from "@/lib/programs/types";
import { logLocalDate } from "./localDate";

export type ExerciseSessionRow = {
  date: string;
  sets: string[];
  note?: string;
  volume: number;
};

/**
 * Label a logged set for display. Returns the raw cell verbatim when the value
 * was unparseable free text (e.g. "2.5kg x10", "40s hold", "skip"); otherwise
 * formats the numeric weight/reps with `sep` between them ("x" in the drawer,
 * "×" on the analysis page).
 */
export function formatSetLabel(s: WorkoutSetLog, sep: string = "x"): string {
  if (s.rawCell && s.rawCell.trim()) return s.rawCell;
  if (!s.weight) return s.reps ? `BW${sep}${s.reps}` : "";
  return s.reps ? `${s.weight}${sep}${s.reps}` : `${s.weight}`;
}

function setVolume(s: WorkoutSetLog): number {
  return (s.weight ?? 0) * (s.reps ?? 0);
}

export function aggregateExerciseHistory(
  logs: WorkoutLogDocument[],
  exerciseId: string,
  canonicalExerciseId?: string,
  limit = 8,
): ExerciseSessionRow[] {
  const rows: ExerciseSessionRow[] = [];

  for (const log of logs) {
    const entry = log.entries.find((e) => {
      // Prefer canonical-id match when both sides supply one.
      if (canonicalExerciseId && e.canonicalExerciseId) {
        return e.canonicalExerciseId === canonicalExerciseId;
      }
      // Legacy / pre-canonical fallback: slot-id match.
      return e.exerciseId === exerciseId;
    });
    if (!entry) continue;

    rows.push({
      date: logLocalDate(log),
      sets: entry.sets.map((s) => formatSetLabel(s)).filter(Boolean),
      note: entry.notes,
      volume: entry.sets.reduce((sum, s) => sum + setVolume(s), 0),
    });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/workout/historyUtils.test.ts`
Expected: PASS — all new tests plus the pre-existing ones (`["65x10","65x9"]`, volume, canonical-id matching) still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workout/historyUtils.ts src/lib/workout/historyUtils.test.ts
git commit -m "fix(history): surface rawCell sets, carry session note, date by local day"
```

---

## Task 2: Redesign `HistoryDrawer` as session cards

**Files:**
- Modify: `src/components/workout/HistoryDrawer.tsx`
- Test: `src/components/workout/HistoryDrawer.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/workout/HistoryDrawer.test.tsx`, replace the existing `it("renders session rows", ...)` test with the version below (the visible date is now formatted), and add three new tests after it:

```typescript
  it("renders session rows with the formatted local date", () => {
    render(<HistoryDrawer exerciseName="DB Bench Press" rows={rows} onClose={jest.fn()} />);
    expect(screen.getByText("Apr 22 (Wed)")).toBeInTheDocument();
    expect(screen.getByText("65x10")).toBeInTheDocument();
  });

  it("renders the per-session note when present", () => {
    const rowsWithNote: ExerciseSessionRow[] = [
      { date: "2026-04-22", sets: ["65x10"], note: "felt strong, go up", volume: 650 },
    ];
    render(<HistoryDrawer exerciseName="Bench" rows={rowsWithNote} onClose={jest.fn()} />);
    expect(screen.getByText("felt strong, go up")).toBeInTheDocument();
  });

  it("renders raw-text set values as pills", () => {
    const rawRows: ExerciseSessionRow[] = [
      { date: "2026-04-22", sets: ["2.5kg x10", "40s hold"], volume: 0 },
    ];
    render(<HistoryDrawer exerciseName="Holds" rows={rawRows} onClose={jest.fn()} />);
    expect(screen.getByText("2.5kg x10")).toBeInTheDocument();
    expect(screen.getByText("40s hold")).toBeInTheDocument();
  });

  it("hides the volume label when volume is zero", () => {
    const rawRows: ExerciseSessionRow[] = [
      { date: "2026-04-22", sets: ["40s hold"], volume: 0 },
    ];
    render(<HistoryDrawer exerciseName="Holds" rows={rawRows} onClose={jest.fn()} />);
    expect(screen.queryByText(/^vol$/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/components/workout/HistoryDrawer.test.tsx`
Expected: FAIL — current drawer renders raw ISO `2026-04-22` (not `Apr 22 (Wed)`) and renders no note.

- [ ] **Step 3: Rewrite the drawer**

Replace the entire contents of `src/components/workout/HistoryDrawer.tsx` with:

```tsx
"use client";

import { useEffect } from "react";
import type { ExerciseSessionRow } from "@/lib/workout/historyUtils";
import { useFocusTrap } from "@/lib/workout/useFocusTrap";
import { classifyCell } from "./SetCell";

type Props = {
  exerciseName: string;
  rows: ExerciseSessionRow[];
  onClose: () => void;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Format a local YYYY-MM-DD string as e.g. "Apr 22 (Wed)". Parse with local
 * Date components (new Date(y, m-1, d)); never `new Date(str)`, which parses as
 * UTC midnight and shifts the day/weekday in non-UTC zones.
 */
function formatSessionDate(localYmd: string): string {
  const [y, m, d] = localYmd.split("-").map(Number);
  if (!y || !m || !d) return localYmd;
  const dt = new Date(y, m - 1, d);
  return `${MONTHS[m - 1]} ${d} (${WEEKDAYS[dt.getDay()]})`;
}

export function HistoryDrawer({ exerciseName, rows, onClose }: Props) {
  const trapRef = useFocusTrap(true);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div
        data-testid="history-drawer-backdrop"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
      />
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-label={`History for ${exerciseName}`}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          maxHeight: "75vh", background: "var(--bg-1)",
          borderRadius: "12px 12px 0 0", borderTop: "1px solid var(--line-2)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
          <div style={{ width: 36, height: 3, borderRadius: 2, background: "var(--line-2)" }} />
        </div>
        <div style={{ padding: "0 16px 12px", borderBottom: "1px solid var(--line)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
            {exerciseName}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
            {rows.length} session{rows.length !== 1 ? "s" : ""} · last 8
          </p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0 16px" }}>
          {rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--fg-3)" }}>
              No history yet for this exercise.
            </div>
          ) : (
            rows.map((row, i) => (
              <div
                key={`${row.date}-${i}`}
                style={{
                  padding: "10px 16px",
                  borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <div style={{
                  display: "flex", alignItems: "baseline",
                  justifyContent: "space-between", marginBottom: 6,
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
                    {formatSessionDate(row.date)}
                  </span>
                  {row.volume > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      <span style={{
                        color: "var(--fg-4)", textTransform: "uppercase",
                        letterSpacing: "0.08em", marginRight: 5,
                      }}>
                        vol
                      </span>
                      <span style={{ color: "var(--fg-3)" }}>{row.volume.toLocaleString()}</span>
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {row.sets.map((s, j) => (
                    <span
                      key={j}
                      className={`cell ${classifyCell(s)}`}
                      style={{ cursor: "default", height: 26, fontSize: 12 }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
                {row.note && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--fg-2)", lineHeight: 1.4 }}>
                    {row.note}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/components/workout/HistoryDrawer.test.tsx`
Expected: PASS — heading, formatted date, note, raw pills, hidden-volume, backdrop-close, and empty-state tests all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/workout/HistoryDrawer.tsx src/components/workout/HistoryDrawer.test.tsx
git commit -m "feat(history): session-card drawer with raw sets, notes, colored pills"
```

---

## Task 3: Point the analysis/History page at the shared helper

**Files:**
- Modify: `src/components/workout/HistoryClient.tsx`

(The behavior change — raw cells now render on the analysis page — is already proven by the `formatSetLabel(s, "×")` tests in Task 1. This task is the wiring; no new test, but the full suite must stay green.)

- [ ] **Step 1: Replace the private `formatSet` body with a delegation**

In `src/components/workout/HistoryClient.tsx`, add the import and replace the existing `formatSet` function (currently lines ~24-29) so it delegates to the shared helper with the `×` separator. Leave every call site (`formatSet(s)`) untouched.

Add to the import block near the top:

```tsx
import { formatSetLabel } from "@/lib/workout/historyUtils";
```

Replace:

```tsx
function formatSet(s: WorkoutSetLog): string {
  if (!s.weight && !s.reps) return "";
  if (!s.weight) return `BW×${s.reps}`;
  if (!s.reps) return `${s.weight}`;
  return `${s.weight}×${s.reps}`;
}
```

with:

```tsx
function formatSet(s: WorkoutSetLog): string {
  return formatSetLabel(s, "×");
}
```

- [ ] **Step 2: Run the full unit suite + lint to verify no regression**

Run: `npm test`
Expected: PASS — whole suite green.

Run: `npm run lint`
Expected: no errors (watch for an now-unused `WorkoutSetLog` import in `HistoryClient.tsx` — it is still referenced by the `formatSet` signature, so it stays; remove only if lint flags it).

- [ ] **Step 3: Commit**

```bash
git add src/components/workout/HistoryClient.tsx
git commit -m "fix(history): analysis page shows raw-cell sets via shared formatter"
```

---

## Task 4: End-to-end guard — raw set persists into the history drawer

**Files:**
- Create: `e2e/history-rawcell.spec.ts`
- Modify: `e2e/exercise-history.spec.ts`

- [ ] **Step 1: Fix the date-format assertion in the existing spec**

In `e2e/exercise-history.spec.ts`, the test `"drawer shows today's session after logging"` currently asserts the raw ISO date. Replace its date block (the `const today = ...` line and the following `expect(...).toBeVisible()`):

```typescript
    // Expect a row with today's date in ISO YYYY-MM-DD format
    const today = new Date().toISOString().slice(0, 10);
    await expect(sharedPage.getByRole("dialog").getByText(today)).toBeVisible({ timeout: 3000 });
```

with the formatted-label version (mirrors `formatSessionDate` in the drawer, built from local date parts):

```typescript
    // Drawer now formats the local date as e.g. "Apr 22 (Wed)".
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();
    const label = `${MONTHS[now.getMonth()]} ${now.getDate()} (${WEEKDAYS[now.getDay()]})`;
    await expect(sharedPage.getByRole("dialog").getByText(label)).toBeVisible({ timeout: 3000 });
```

(The volume test `"volume column shows calculated total"` still passes unchanged: the drawer renders the number `655` in its own `<span>`, so `getByText("655", { exact: true })` still matches.)

- [ ] **Step 2: Create the raw-cell e2e spec**

Create `e2e/history-rawcell.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { seedDemoIfNeeded, clearDb, waitForIdb } from "./helpers";

// A raw-text set value (kg suffix + space) is stored in rawCell, not weight/reps.
// Before the fix it vanished from the history drawer; this guards its return.
test.describe("History drawer — raw-cell sets", () => {
  test("a raw-text set entered today appears in the history drawer", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("today");
    await clearDb(page);
    await seedDemoIfNeeded(page);

    // Enter an unparseable value in the first set cell.
    const firstInput = page.locator('input[id^="cell-"]').first();
    await firstInput.fill("2.5kg x10");
    await firstInput.blur();
    // Cell autosave is debounced (~1.5s) — wait for the flush, then yield to IDB.
    await page.waitForTimeout(1700);
    await waitForIdb(page);

    // Finish the workout so the session is persisted.
    await page.getByRole("button", { name: /finish workout/i }).click();
    await expect(
      page.getByRole("button", { name: /finish workout/i }),
    ).toHaveText(/saved/i, { timeout: 3000 });

    // Open the history drawer for the first exercise and confirm the raw value shows.
    await page.getByRole("button", { name: /history for/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("2.5kg x10")).toBeVisible({ timeout: 3000 });

    await ctx.close();
  });
});
```

- [ ] **Step 3: Run the e2e specs**

Run: `npm run test:e2e -- e2e/history-rawcell.spec.ts e2e/exercise-history.spec.ts`
Expected: PASS — the new raw-cell test shows `2.5kg x10` in the drawer; the existing suite passes with the updated date assertion. (Playwright auto-starts the `vite` dev server.)

Sanity check that it genuinely guards the bug (optional): `git stash` the `historyUtils.ts` change, re-run the raw-cell spec → it FAILS (value missing), then `git stash pop`.

- [ ] **Step 4: Commit**

```bash
git add e2e/history-rawcell.spec.ts e2e/exercise-history.spec.ts
git commit -m "test(e2e): guard raw-cell sets appearing in the history drawer"
```

---

## Self-Review

**Spec coverage:**
- Raw-text/duration sets appear, shown verbatim → Task 1 (`formatSetLabel` rawCell branch) + Task 2 (pills) + Task 4 (e2e). ✓
- Per-session note shown → Task 1 (`note` on row) + Task 2 (note line). ✓
- Drawer reads like live cards (session cards, colored pills) → Task 2 (`classifyCell` + `cell` classes). ✓
- Analysis page raw-cell fix → Task 3. ✓
- Date by local day → Task 1 (`logLocalDate`) + Task 2 (formatter) + Task 4 (assertion update). ✓
- Decisions: volume shown only when >0 → Task 2; note verbatim → Task 2 (plain `{row.note}`); e2e included → Task 4. ✓
- Known limitation (numeric PR `+` not persisted) → unchanged by design; numeric PRs classify as `done`. No task needed.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every run step shows command + expected result.

**Type consistency:** `formatSetLabel(s: WorkoutSetLog, sep?: string)` defined in Task 1, called as `formatSetLabel(s)` (Task 1 aggregate), `formatSetLabel(s, "×")` (Task 3). `ExerciseSessionRow` gains `note?: string` in Task 1 and is consumed as `row.note` in Task 2 and the test fixtures. `classifyCell` imported from `./SetCell` (its existing export) in Task 2. Names consistent throughout.
