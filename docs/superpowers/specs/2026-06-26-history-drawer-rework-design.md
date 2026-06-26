# Mid-workout history drawer rework (+ raw-cell history bug fix)

Date: 2026-06-26
Status: Approved (design) — pending implementation plan

## Problem

Sets entered as free text — e.g. `2.5kg x10`, `40s hold` — disappear from the
mid-workout history drawer for later sessions. Plain `5x10` shows fine.

Root cause (verified against current code):

- `parseCellToSet` (`src/lib/workout/sessionState.ts:17`) parses a cell with the
  rigid regex `^(BW|\d+(?:\.\d+)?)x(\d+)$`. Values like `2.5kg x10` / `40s hold`
  don't match, so they are stored intact in the `rawCell` field with no numeric
  `weight`/`reps`. This is correct and intended — `hydrateFromLog`
  (`sessionState.ts:58`) reads `rawCell` back, which is why the value still shows
  when you reopen the day to edit.
- The history path does **not** read `rawCell`. `aggregateExerciseHistory` →
  `formatSet` (`src/lib/workout/historyUtils.ts:9`) only ever reads
  `weight`/`reps`; for a raw entry it returns `""`, and line 39's
  `.filter(Boolean)` drops it. The set vanishes from history.

Two adjacent issues found while tracing:

- `src/components/workout/HistoryClient.tsx` (analysis/History page) has its own
  `rawCell`-blind `formatSet` with the same bug.
- The drawer dates rows by `performedAt.slice(0,10)` (UTC), but sessions are keyed
  by local `performedDate` (DB v7 invariant). A late-evening set can render under
  the wrong day.
- The drawer surfaces **no notes at all** today (`date | sets | vol` only), so the
  per-exercise "go up / stay / go down" note has never been visible there.

## Goals

- Raw-text and duration sets appear in history, shown exactly as entered.
- Each past session shows its per-exercise note (the `<details>` textarea note,
  persisted as `WorkoutLogEntry.notes`).
- The drawer reads like the live exercise cards (session cards, color-coded set
  pills).
- Fix the same raw-cell omission on the analysis/History page.
- Date rows by local day, not UTC.

## Non-goals

- No card rework on the analysis/History page — data fix only there.
- No change to parsing/storage. `rawCell` already captures the data correctly.
- Numeric PR persistence is **out of scope** (see Known limitation).

## Design

### 1. Data — `src/lib/workout/historyUtils.ts`

- Extend the row type:
  `ExerciseSessionRow = { date: string; sets: string[]; note?: string; volume: number }`.
- Set formatting moves to a single exported pure helper
  `formatSetLabel(s: WorkoutSetLog, sep = "x")`, replacing the two duplicated,
  `rawCell`-blind `formatSet` functions (here and on the analysis page). They
  differed only by separator (`x` vs `×`), so one parameterized helper covers
  both and is unit-testable without importing either component. It:
  - returns `s.rawCell` verbatim when it is a non-empty string (covers
    `2.5kg x10`, `40s hold`, `skip`, `pain`) — **the bug fix**;
  - else formats numerically (`{weight}{sep}{reps}`, `BW{sep}{reps}`,
    `{weight}`).
  - Truly-empty results are still dropped by `.filter(Boolean)` (empty cells were
    never persisted as sets anyway — `serialiseSets` skips them).
- `note`: read from `entry.notes` on the matched entry; omit when empty.
- Date: replace `log.performedAt.slice(0,10)` (UTC) with `logLocalDate(log)` from
  `src/lib/workout/localDate.ts`, which already returns
  `performedDate ?? localDateOf(performedAt)` — handling the pre-v7 fallback for
  us. No more raw UTC slice.
- `volume` / matching logic (canonical-id then slot-id fallback): unchanged.

### 2. UI — `src/components/workout/HistoryDrawer.tsx`

Replace the `date | sets | vol` grid with stacked **session cards**:

- Header row: formatted local date (e.g. `Jun 19 (Thu)`); volume right-aligned
  **only when `> 0`** (raw/hold sets contribute 0 → volume hidden, not `—`).
- A wrapped row of read-only set **pills**, one per set, showing each set's exact
  text.
- Note line below the pills in muted text, shown only when a note exists.
- Empty state unchanged ("No history yet for this exercise.").

Pills are color-coded by state (done / PR / miss / skip / pain / BW) by reusing
`classifyCell` from `src/components/workout/SetCell.tsx`, so they match the live
cells. (`classifyCell` is a pure exported function; imported directly. If sharing
across modules turns awkward during implementation, extract it + `CellState` to a
small `src/lib/workout/cellState.ts` — decide then, don't pre-refactor.)

Notes render **verbatim** — no keyword→glyph parsing. The arrows in the mockup
were illustrative; the user's free text is shown as-is.

### 3. Analysis page — `src/components/workout/HistoryClient.tsx`

Its local `formatSet` becomes a one-line delegation to
`formatSetLabel(s, "×")` (the `×` separator preserves current output). No visual
rework. Because `HistoryClient` imports `logRepo` (Dexie), the raw-cell fix is
verified through the pure helper's tests rather than by importing the component.

Additionally (decided during final review, since the spec's Goals call for
local-day dating without scoping it to the drawer): `aggregateLogs` now dates
sessions via `logLocalDate(log)` instead of `performedAt.slice(0, 10)` (UTC), so
late-evening sessions are attributed to the correct local day on the analysis
page too. `aggregateLogs` is exported for a focused unit test (jest's global
`fake-indexeddb/auto` makes importing the component safe).

## Known limitation (out of scope)

A numeric PR's leading `+` (e.g. `+70x9`) is stripped at parse time
(`sessionState.ts:15`) and not stored, so numeric PRs render as plain "done" in
history. Raw-text entries keep any `+`. Persisting a PR flag for numeric sets is a
separate change — flagged, not done here.

## Testing (reproduce-first)

1. **Unit (failing first)** — `aggregateExerciseHistory`: a log whose entry has
   sets `{rawCell: "2.5kg x10"}`, `{rawCell: "40s hold"}` plus `notes: "go up"` →
   assert both set strings appear in `row.sets` and `row.note === "go up"`. Pins
   the exact regression. Add a local-date assertion (late-evening `performedAt`
   maps to the correct local day).
2. **Component** — extend `HistoryDrawer.test.tsx`: renders a raw-text set pill
   and the note line; volume hidden when 0.
3. **e2e (Playwright)** — enter `2.5kg x10` on a set, save, navigate to the next
   instance of that workout day, open history, assert the `2.5kg x10` pill is
   visible.

This bug lives in a pure function + pure render (not IndexedDB read-modify-write),
so unit + component cover the root cause directly; the e2e is the end-to-end guard.

## Decisions (confirmed)

- (a) Volume shown only when non-zero.
- (b) Notes rendered verbatim.
- (c) e2e included.
