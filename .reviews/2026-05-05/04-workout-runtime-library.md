# Code Review: Workout Runtime Library

Reviewer: architecture-reliability-reviewer  
Date: 2026-05-05  
Scope: `src/lib/workout/`, `src/lib/prompts/`, `src/lib/backup/`

---

## 1. Diff Correctness

### [Critical] `pendingDiff` carries no scope — `DiffPage.tsx:42` hardcodes `scope: "day"`
`src/lib/workout/pendingDiff.ts:5-9`

`PendingDiff` stores only `programId`, `original`, `replacement` — no scope field. Every AI-generated diff is applied as a day-scope override regardless of whether the modification was meant for a day, week, or the base program. PRD §10.6 requires explicit scope choice; PRD §5.3 names replacement-day/week/program as distinct workflows. The correct behavior is structurally unreachable.

**Fix:** Add `scope: ProgramScope`, `weekNumber?`, `dayId?` to `PendingDiff`. Have `DiffPage` show a scope picker before applying.

### [High] `exercisesEqual` ignores `tempo` and `tags`
`src/lib/workout/programDiff.ts:25-34`

The PRD schema (§7) explicitly preserves tempo and tags. `buildSchemaBlock` instructs the LLM to populate `tags`. AI-suggested changes to tempo/tags produce an empty diff — the user reviews "no changes" and the override silently rewrites the program.

### [High] `remapExerciseIds` collapses duplicate exercise names
`src/lib/workout/programDiff.ts:69-97`

`nameToId` is a `Map<string, string>` keyed by `name.toLowerCase().trim()`. A day with "Squat" in warmup and "Squat" in strength (common novice pattern, used in bundled Linear Progression persona) has only the second occurrence in the Map. Both instances get the same id, breaking React keys, CellMap, and downstream identity.

### [Medium] `loadPendingDiff` uses unchecked `as PendingDiff` cast
`src/lib/workout/pendingDiff.ts:24-32`

`JSON.parse(raw) as PendingDiff` — a prior-schema diff sitting in sessionStorage will throw `TypeError: Cannot read properties of undefined (reading 'sections')` on the next render of `DiffPage`.

---

## 2. Cell / Grid Logic

### [Critical] `serialiseSets` silently drops PRD-blessed freeform notations
`src/lib/workout/sessionState.ts:7-23`

The regex `^(BW|\d+(?:\.\d+)?)x(\d+)$` only matches `60x10` and `BWx8`. Every other PRD example is **permanently lost on save**:
- `BW+10x5` → dropped (PRD example)
- `red band x20` → dropped (PRD example)
- `30s hold` → dropped (PRD example)
- `Skipped` / `Pain` → dropped, no record the set was attempted

On `finishWorkout`, these strings are gone forever. Next session those slots come back as empty cells. This directly violates PRD §14.1 "Never make the user serve the schema."

**Fix:** Extend `WorkoutSetLog` with `rawCell?: string`, or add `rawCells: string[]` on `WorkoutLogEntry`.

### [High] `hydrateFromLog` produces shorter array than `buildInitialCells`
`src/lib/workout/sessionState.ts:43-54`

When a user logs only 2 of 3 prescribed sets, hydration returns a 2-cell array. The merge in `TodayClient.tsx:316` replaces the entire cells array, collapsing the third prescribed slot from the UI.

**Fix:** Take `max(prescribed sets, maxSetNumber)`.

### [High] Hydration race in TodayClient — async useEffect overwrites user input
`src/components/workout/TodayClient.tsx:305-320`

Cells initialized synchronously, then async `useEffect` does `setCells(prev => ({ ...prev, ...hydrated }))`. Input typed before IndexedDB returns is overwritten.

**Fix:** Add `mergeHydrated(initial, hydrated, { preserveNonEmpty: true })` helper.

---

## 3. Prompt Builder

### [Critical] PRD §6.4 prompt-type taxonomy is unimplemented
`src/lib/prompts/builder.ts`

PRD enumerates 5 prompt categories: initial generation, refinement, replacement-day, replacement-week, replacement-program. `builder.ts` has no `PromptType` enum and no entry point. Result: two completely diverged prompt-assembly paths — `PromptBuilderClient` (uses `builder.ts`) and `ModifyAiModal` (completely re-implements inline with a different schema string).

### [Critical] `buildRoutineBlock` emits only title + day count
`src/lib/prompts/builder.ts:21-31`

Output: `## Current Routine\nName: <title>\nDays: <n>`. No structure, no exercises, no overrides. PRD §5.3 step 3 requires "current routine JSON for the selected scope." This is why `ModifyAiModal` had to fork.

### [Critical] `buildProfileBlock` omits all extended profile fields
`src/lib/prompts/builder.ts:3-13`

Omits: `body` (age/height/weight/bodyfat), `history`, `injuries`, `schedule`, `preferences`. A user who entered "torn rotator cuff, avoid overhead pressing" under `injuries` is sending prompts that don't include that. Silent safety failure.

### [High] `buildConstraintsBlock` and `injuries` are separate fields that aren't consolidated
Both `constraints` and `injuries` are string arrays in `ProfileDocument`. Neither is reliably forwarded to the LLM.

---

## 4. Backup Integrity

### [Critical] `restoreBackup` is a merge, not a replace
`src/lib/backup/backup.ts:19-36`

UI says "This will replace all local data." Implementation only `put`s each record — pre-existing programs not in the backup persist. Current behavior: "merge with overwrite." Worst of both worlds: claims destructive, behaves additive.

### [Critical] No structural validation before writing
`src/lib/backup/backup.ts:20-22`

If `backup.programs` is `undefined`, `backup.programs.map(...)` crashes after `profileRepo.save` has already written the partial profile. No rollback.

**Fix:** Validate all arrays before any write; wrap in single multi-store transaction.

### [High] No transactional guarantee across the restore chain
Alias saves succeed → program save fails → inconsistent state with no detection.

---

## 5. PRD Alignment Summary

| PRD requirement | Status |
|---|---|
| §4.2 Profile body/history/injuries in prompts | **Missing** |
| §4.2 Freeform set strings | **Silently dropped** |
| §6.4 Five prompt types | **Only initial; modify path forks** |
| §10.6 Explicit scope choice on save | **Hardcoded to `"day"`** |
| §11.3 Full workspace export | **Drops `metrics` store** |
| §11.3 Restorable on another device | **Restore is merge, not replace** |
| §14.1 Never make the user serve the schema | **Schema served by regex** |

---

## Top 5 Issues to Fix First

1. `serialiseSets` data loss for PRD-blessed freeform notation — directly violates §14.1
2. `pendingDiff` lacks scope; `DiffPage` hardcodes `"day"` — violates §10.6
3. `restoreBackup` is merge-not-replace and lacks structural validation
4. `buildRoutineBlock` is empty + prompt-type taxonomy missing + `ModifyAiModal` forks schema
5. `exercisesEqual` ignores tempo/tags + `remapExerciseIds` collapses duplicate names
