# Workout Fixes Design — 2026-05-26

Three small fixes to workout-day UX:

1. **Finish button on a completed day** — disable to prevent duplicate log creation.
2. **History after exercise swap** — make history follow the swapped-in catalog exercise instead of the slot's prior contents.
3. **Rest timer input** — fix unfocus-on-first-keystroke and make values editable.

---

## Fix 1 — Disable Finish when day is already complete

### Problem

Users navigate back into a previously-completed program day to inspect or tweak data and click Finish out of habit (treating it like Save). The current flow can create a duplicate log:

- `getForDay(programId, dayId, today)` only matches logs whose `performedAt` starts with today's calendar date (`src/lib/storage/logRepo.ts:24-29`).
- A completion from a prior date isn't found, so `saveCells` allocates a fresh UUID and writes a new log (`src/components/workout/WorkoutDayClient.tsx:552-553`).
- Result: two completed logs for the same program day across two calendar dates.

### Design

When a completed log exists for this `programId` + `dayId` (regardless of calendar date), disable the Finish button.

**Detection.** In `WorkoutBody`, alongside the existing hydration effect, query `logRepo.listForDay(day.id)` and check whether any log has `completedAt` set and matches `program.id`. Store the result as `alreadyComplete: boolean` state (default `false`, set `true` after the query resolves).

**UI.** Pass `alreadyComplete` to `WorkoutBottomBar`. When `true`:
- Render the Finish button as `disabled`.
- Label it "Completed ✓" (replacing both the default "Finish workout" and the post-save "Saved" states).
- Keep all other controls (Skip day, Day note, cell editing) unchanged.

**Accepted caveat.** Auto-save still runs and can create a fresh log if the user edits cells on a different calendar date (no `completedAt`). We accept this trade-off in exchange for a minimal change. Cross-calendar editing semantics are a separate design question not in scope here.

### Files touched

- `src/components/workout/WorkoutDayClient.tsx` — add `alreadyComplete` state, detection effect, wire through to `WorkoutBottomBar`. Update `WorkoutBottomBar` props/render.

### Tests

- `WorkoutDayClient.test.tsx`: when `logRepo.listForDay` returns a log with `completedAt` for this `dayId` + `programId`, the Finish button renders as disabled with text "Completed ✓".
- Regression: when no completed log exists, Finish renders enabled with current label behavior.

---

## Fix 2 — History follows the swapped-in exercise

### Problem

After swapping an exercise via the catalog picker, the History button shows the previous exercise's data instead of the new one's.

- `swapExercise` mutates only the slot's `name`, `canonicalExerciseId`, and `tags` while preserving the slot's `id` (`src/lib/workout/exerciseSwap.ts:20-33`).
- `aggregateExerciseHistory` filters log entries by `exerciseId` (slot id), so historical entries from before the swap — which belong to the old exercise — are returned (`src/lib/workout/historyUtils.ts:26`).
- Compounding this: `WorkoutDayClient.saveCells` does not persist `canonicalExerciseId` on entries, so even if downstream code wanted to match by canonical id, the data isn't there (`src/components/workout/WorkoutDayClient.tsx:562-569`).

### Design

Make history a property of the catalog exercise (canonical id), not the program slot.

**Persist canonical id on entries.** In `WorkoutDayClient.saveCells`, when building each entry, look up the matching `ProgramExercise` from `day.sections` and include its `canonicalExerciseId` (when present) on the `WorkoutLogEntry`. Build a `Map<exerciseId, canonicalExerciseId>` alongside the existing `exerciseNameMap`.

**Match by canonical id when available.** Extend `aggregateExerciseHistory(logs, exerciseId, limit)` to `aggregateExerciseHistory(logs, exerciseId, canonicalExerciseId, limit)`. The matching rule per entry:

1. If `canonicalExerciseId` is provided AND the entry has a `canonicalExerciseId`: match when they're equal.
2. Otherwise: match by `exerciseId === entry.exerciseId` (legacy / pre-canonical behavior).

This lets historical entries that don't yet have `canonicalExerciseId` still surface (via the slot-id fallback) while new entries match by canonical id, giving correct behavior after swap.

**Pass canonical id through.** In `WorkoutDayClient.openHistoryFor`, accept the slot's `canonicalExerciseId` (resolved from `day.sections`) and pass it to `aggregateExerciseHistory`. Update the `onOpenHistory` callsite in `ExerciseRow` / `SectionCard` to forward both ids (or resolve the canonical id at the call site).

### Files touched

- `src/lib/workout/historyUtils.ts` — extend `aggregateExerciseHistory` signature.
- `src/components/workout/WorkoutDayClient.tsx` — save `canonicalExerciseId` on entries; resolve canonical id from `day.sections` and pass into history aggregation. This is the sole non-test caller of `aggregateExerciseHistory` (verified via grep).

### Tests

- `historyUtils.test.ts` (new or extended): aggregator returns rows for entries matching by `canonicalExerciseId` when provided; falls back to `exerciseId` for entries without a canonical id; precedence rule documented.
- `WorkoutDayClient.test.tsx`: after a swap, opening history calls the aggregator with the new canonical id (or asserts on rendered history content matching the new exercise's log entries, not the previous slot's).

---

## Fix 3 — Editable rest timer input

### Problem

The `RestTimer` input unfocuses after the first keystroke, so only single-digit timers can be set. Once a value is set, the input is unmounted and there's no way to edit.

- When `seconds === undefined`, the component renders a `<input type="number">` whose `onChange` calls `setSeconds(n)` for any positive number (`src/components/workout/RestTimer.tsx:51-56`).
- Typing `1` triggers `setSeconds(1)`; the next render switches branches to the running-timer view and unmounts the input.
- The "value set" branch has no path back to editing.

### Design

Replace the conditional branch with a single editable display:

**Default view (no value):** Show a clickable placeholder (e.g., `--:--`) alongside disabled Play/Reset. Clicking the placeholder switches to inline-edit mode.

**Default view (value set, not running):** Show `fmt(remaining)` as a clickable element. Click switches to inline-edit mode. Play/Reset enabled.

**Default view (running):** Show `fmt(remaining)` as a non-clickable element. Pause/Reset visible. (No edits during a running timer; user can pause first.)

**Inline-edit mode:** Render a small `<input type="number">` pre-filled with the current `seconds` value (or empty if none). Commit semantics:
- **Enter** or **blur** → parse value; if positive integer in `[1, 600]`, call `setSeconds(n); setRemaining(n)`; exit edit mode.
- **Escape** → exit edit mode without committing.
- Invalid input on commit (NaN, 0, negative) → ignore and stay in edit mode (or revert). Pick "ignore + stay" for forgiveness.

State additions:
- `editing: boolean` — toggles edit mode.
- `draft: string` — buffered input value during edit.

### Files touched

- `src/components/workout/RestTimer.tsx`

### Tests

- Update `RestTimer.test.tsx`:
  - Typing a multi-digit value (e.g., "90") and pressing Enter sets the timer to `1:30`.
  - Clicking the displayed time enters edit mode pre-filled with the current value.
  - Pressing Escape exits edit mode without changing the value.
  - Existing tests for prescribed duration, countdown, pause/reset continue to pass.

---

## Cross-cutting notes

- All three fixes are additive and isolated to the workout-day surface and one storage utility extension. No schema changes; `WorkoutLogEntry.canonicalExerciseId` already exists on the type (`src/lib/programs/types.ts:130`) and is optional, so existing logs remain valid.
- Static deployment (GitHub Pages) constraint unaffected — all changes are client-side.

## Out of scope

- Cross-calendar-date editing semantics (which log a tweak should land in when revisiting a previously-completed day on a new date). Tracked as a follow-up.
- Read-only / view-only mode for completed days. Considered and deferred; current minimal disable is sufficient for the duplicate-creation problem.
- Migrating historical log entries to backfill `canonicalExerciseId`. The fallback to `exerciseId` matching preserves correctness for legacy data without a migration.
