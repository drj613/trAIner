# Task 13 report — render combined all-time and Today history

**Status: DONE_WITH_CONCERNS** (concerns are disclosures, not known defects — see the end).

Branch `feat/exercise-catalog-normalization`. Dispatch HEAD `d981951`. Six commits, listed at the bottom.

---

## What changed, in one paragraph

The Today drawer and the all-time History page both read `projectExerciseHistory` now. The drawer shows the tapped slot's whole movement family, grouped one block per workout, with a version filter defaulting to `All versions` and a left rule on the version the user came from. The History index shows one row per movement family carrying only family-level facts, and opening a family gives per-version metric panels above one combined chronological table that shares its rendering code with the drawer. `aggregateLogs` and `aggregateExerciseHistory` are gone with the surfaces that called them. `ExerciseHistoryRow` gained `versionKey`.

---

## Step 1 — the drawer (commit `4164bb3`)

### RED

New `HistoryDrawer.test.tsx` written against props the component did not have. 21 tests, 9 failing, first failure verbatim:

```
● HistoryDrawer — family-wide Today history › defaults to the whole family rather than the active version

  TestingLibraryElementError: Unable to find an element by: [data-testid="history-row"]
```

The other eight failed on the same absent markup or on the header text (`0 workouts · 0 entries` vs the expected counts). The three tests that were already green at RED — the empty state, the raw-cell pills, the non-string date — were green for the wrong reason (the old component read `row.date`/`row.volume`, both `undefined` on the new row shape, so it rendered nothing rather than the right thing). They are pinned by mutation below.

### GREEN — what the drawer does now

| Hand-off item | What shipped |
| --- | --- |
| 1 — `ExerciseSessionRow` has no `logId` | The drawer takes `ExerciseHistoryRow[]`, which has one. `ExerciseSessionRow` is deleted. |
| 2 — `{rows.length} sessions` | `{workouts} workout(s) · {entries} entr(y\|ies)`. Two numbers, both true. |
| 3 — same-workout rows render twice | `groupByWorkout` emits one dated block per log, entries nested inside it. |
| 4 — `limit = 8` slices entries | The cap slices **workouts**, and `· last 8` appears only when something was actually cut. |
| 7 — keys can contain `#` | Version keys reach only `data-*` attributes and `<option value>`, never a URL, an `id`, an `aria-*` or a CSS selector. A test filters on `name:copenhagen plank#copenhagen plank`. |
| 9 — no family PR/best/trend | The drawer computes none, and a test asserts neither word appears. |
| 12 — `sets: []`, `volumeLb: 0` | Renders `sets could not be read` in muted italics. A note-only row shows its note and no marker. |
| 17 — non-string `performedDate` | `formatSessionDate` coerces with `textOf` before `split`. |
| The invariant | Row label is `performedName`, always. `currentVersionLabel` appears as a separate badge, and only when it differs case-insensitively. |

### Deviations from the plan's snippet, deliberate

- The plan wrote `activeConcreteExerciseId`; the prop is **`activeVersionKey`**. A tapped slot can resolve to a movement with no concrete version (`movement:<id>`) or to nothing (`slot:<id>#<name>`), and those rows must be emphasizable too. For a resolved version the two strings are identical, so this is a strict generalization.
- The plan wrote `getByTestId("history-row-barbell-high-bar-squat")`. Rows carry `data-testid="history-row"` plus `data-version-key` / `data-active-version` instead. Two reasons: a version key can contain `#`, and two rows can share a version, which would make a per-version testid non-unique and the query throw.

### WorkoutDayClient wiring

`openHistoryFor` loads logs into state; a `useMemo` resolves the slot's identity the same way `projectExerciseHistory` resolves each log entry, projects, and returns `rowsForIdentity` plus `versionKeyForIdentity`. `identityContext` is a dependency, so a correction saved from inside the drawer regroups what is on screen with no second read. The drawer's `fix` affordance opens `ExerciseCorrectionSheet`, hosted by `WorkoutDayClient`.

**Resolution never keys on the slot id.** The slot id is passed because `ExerciseIdentityInput` requires it; the canonical id is tried first and the performed name second.

---

## Step 2 — the invariant, proven through the rendered component (commit `b64247d`)

Two tests in `WorkoutDayClient.integration.test.tsx`, real `logRepo` on `fake-indexeddb`:

1. An unrecognised spelling (`Bench Pressss`) stays **out** of the family — the drawer shows `145x5` and not `135x5`.
2. After `aliasRepo.save` maps that spelling to the catalogue version the slot itself resolves to, the open drawer regroups from the logs it already holds: `135x5` appears, the row still reads `Bench Pressss`, the badge reads `Bench Press`, and `logRepo.list()` confirms the stored `exerciseName` is unchanged.

The second test's first draft failed for a fixture reason worth recording: I aliased the typo to `barbell-bench-press` (family `bench-press`) while the slot's own name `Bench Press` resolves to the concrete `bench-press` with **no** `movementId`, hence family `exercise:bench-press`. Different families, so the row correctly did not join. Measured with a throwaway probe, then the fixture was corrected — not the assertion.

Plus a projection test: every row carries the version bucket it was counted in, and the set of row `versionKey`s equals the set of `versionSummaries` keys.

---

## Step 3 — the all-time page (commit `0ce3c63`)

### RED

New `HistoryClient.test.tsx`, 10 of 12 failing. First failure verbatim:

```
● HistoryClient — all-time family history › shows one index row per movement family

  Unable to find role="button" and name `/^Squat\b/`
```

### GREEN

- **Index**: one row per family — label, `N workouts`, `N versions`, `last MM/DD`. No best, no PR, no trend, no sparkline. Spec ~491, and mutation `M16` proves the absence is pinned.
- **Detail**: a `version-summary` panel per concrete version (label, trend arrow, `N sessions · N entries`, last date, sparkline over `sessionVolumesLb`, `bestSetLabel`) above one combined chronological table rendered by the shared `HistoryWorkoutList`.
- **Correction**: unresolved rows carry `fix`; `ExerciseCorrectionSheet` is hosted here too.
- **Adopted, duplicates deleted** (item 10): `VersionHistorySummary.bestSetLabel` and `historyUtils.deriveVolumeTrend` replace `HistoryClient`'s own `best` and `deriveTrend`.
- **Guards kept** (item 6): the page reads logs *only* through `projectExerciseHistory`, so `readableEntries` / `readableSets` / `entryPerformedName` / `textOf` all still apply. A test renders four deliberately-preserved corrupt shapes (`entries: "corrupt"`, `entries: [null]`, `sets: "gone"`, `performedDate: 7`) beside readable logs and asserts both families still appear. `M21` (dereference `entry.sets` before projecting) kills it.

### Extraction

The drawer's row rendering moved to `src/components/workout/HistoryRows.tsx` and both surfaces import it, because the spec requires the two to treat an unresolved record identically, and two copies of a display rule is how this plan's set-level `notes` miss happened.

### The `sessions > 3` re-pick (item 5), decided deliberately

`recent` / `stale` split on `sessions > 3`, where `sessions` counted **entries**. Correcting the count would have left a frequency test wearing the words of a time test. The chips now split on **when the family was last performed**, 45-day window, using `latestPerformedAt`. `textOf` on it, so an unreadable timestamp reads as stale rather than claiming a recent workout. The `trend` sort option is replaced by `last`, since a family-level trend is exactly what the spec forbids.

**This is a visible behaviour change beyond the literal brief.** Item 5 hands the threshold decision to Task 13; I read "needs re-picking" as covering the predicate, not just the number. Flagging it loudly in case the controller disagrees.

---

## Existing tests that changed — every one, flagged

| File | Change | Why |
| --- | --- | --- |
| `HistoryDrawer.test.tsx` | Rewritten (8 → 23) | The props changed; the surface is replaced. |
| `HistoryClient.aggregateLogs.test.ts` | **Deleted** (9 blocks) | Tested `aggregateLogs`, which is deleted with the page. |
| `historyUtils.test.ts` | `describe("aggregateExerciseHistory")` deleted; the `performedDate` guard block **moved** | The aggregator is deleted. The guard block is retargeted at `logLocalDate`, where Task 12's C-1 fix actually lives — see below. |
| `localDate.test.ts` | +4 blocks (11 `it.each` cases) | Receives the relocated guard coverage, sharpened: it now also pins the `""` answer when both fields are unreadable and the absent-is-not-unreadable line. |
| `historyProjection.test.ts` | Three `aggregateExerciseHistory` "drawer path" tests deleted; one added | The drawer path is `projectExerciseHistory` now, and each deleted test sat directly beside the projection test using the same fixture. |
| `WorkoutDayClient.test.tsx` / `.integration.test.tsx` / `.provider.integration.test.tsx` | Render helpers wrapped in `ExerciseNormalizationProvider` | `WorkoutBody` resolves identity through it. The app mounts it at the root (`src/main.tsx:9`), so rendering without it is not a shape the app can produce. No assertion changed. |
| `WorkoutDayClient.test.tsx` | Fixture ids `cat-bench` → `barbell-bench-press`, and the comment rewritten | **Vacuous fixture repaired, in the shape of the ledger's Task 12 RULING 1.** `cat-bench` resolves to nothing and the log entries carried no `exerciseName` — a shape the day screen never writes (`WorkoutDayClient.tsx:856` always stamps one) — so the test "history follows the slot's canonical id" exercised no matching rule at all. With a real catalogue id it now genuinely drives canonical-id resolution across two different slot ids. The assertions are byte-identical. |

**C-1 coverage is not weaker for the deletion.** The guard is pinned at three levels now: on the value (`localDate.test.ts`, `M22` kills 10), on the projection (`historyProjection.test.ts`, unchanged), and through two rendered surfaces (`HistoryDrawer.test.tsx` "renders every row when a performedDate is not a string" and `WorkoutDayClient.integration.test.tsx` "opens the history drawer when one stored log's performedDate is not a string", both unchanged and both now running through `projectExerciseHistory`).

---

## Mutation evidence — 28 mutations, 28 non-zero kills

Method: in-tree single-line edit, run the eight owned suites, restore with `git checkout -- <path>`, then assert `git diff --quiet -- <path>`. Harness at `<scratchpad>/t13_mutate.py`, kept outside the tracked tree. **Every run's totals are reported beside its kill count** and every run held at baseline with `numRuntimeErrorTestSuites == 0`, so no mutant passed by failing to load. Final baseline: **214 tests, 0 failures, 0 suite errors.**

| ID | Mutation (exact) | Kills | Named test |
| --- | --- | --- | --- |
| M1 | `HistoryRows`: row label `{performed}` → `{current \|\| performed}` | 4 | the two immutable-label tests, the combined-list test, and the rendered correction test — **this is the brief's required mutation** |
| M2 | `HistoryDrawer`: header `{groups.length} workout` → `{entryCount} workout` | 2 | counts workouts and entries separately; the eight-workout cap |
| M3 | `HistoryRows`: `groupByWorkout` never merges (`if (false && …)`) | 4 | groups same-workout entries under one date; +3 |
| M4 | `HistoryDrawer`: `groupByWorkout(visibleRows.slice(0, 8))` — the old entry-slicing bug | 1 | caps the list at eight workouts, not eight entries |
| M5 | `HistoryDrawer`: `useState(activeVersionKey ?? "")` | 1 | defaults to the whole family rather than the active version |
| M6 | `HistoryRows`: `isActive = false` | 1 | emphasizes the active version without hiding the others |
| M7 | `HistoryRows`: drop the unreadable-sets marker (`false &&`) | 1 | marks a row whose sets could not be read |
| M8 | `HistoryRows`: `formatSessionDate` uses `localYmd as string`, no `textOf` | 1 | renders every row when a performedDate is not a string |
| M9 | `HistoryDrawer`: filter compares `concreteExerciseId`, not `versionKey` | 1 | filters on a version key containing a `#` |
| M10 | `WorkoutDayClient`: drop `identityContext` from the history memo | 1 | pulls the corrected name into the family and keeps its performed label |
| M11 | `HistoryRows`: `current.volumeLb += 0` | 1 | shows the per-workout volume |
| M12 | `HistoryRows`: `showBadge = current !== ""` (always show) | 5 | does not repeat the current version badge; +4 |
| M13 | `historyProjection`: row stamped with `familyKeyForIdentity` | 1 | stamps every row with the version bucket it was counted in |
| M14 | `historyCorrection`: name value → `currentVersionLabel ?? performedName` | 1 | corrects an unresolved row on what was logged |
| M15 | `historyCorrection`: `rowNeedsReview` → `true` | 1 | offers no correction affordance for a resolved row |
| M16 | `HistoryClient`: index row also prints `275x3` / `225x5` | 1 | shows no best set or trend on a family index row |
| M17 | `HistoryClient`: family `workoutCount` → row count | 1 | shows one index row per movement family, counting workouts not entries |
| M18 | `HistoryClient`: version panel prints `entryCount` as its session count | 1 | counts a version's sessions by workout and reports entries separately |
| M19 | `HistoryClient`: detail takes `.slice(0, 1)` of the family's rows | 1 | opens one Squat history combining both versions |
| M20 | `HistoryClient`: recent/stale → `workoutCount > 3` (the old predicate) | 1 | splits recent from stale by when the family was last performed |
| M21 | `HistoryClient`: dereference `entry.sets` before projecting | 1 | still renders readable history beside a log it cannot read |
| M22 | `localDate`: `if (log.performedDate != null) return log.performedDate` — the C-1 shape | 10 | the whole relocated `logLocalDate` block |
| M23 | `HistoryRows`: `String(current.logId) === String(row.logId)` | 1 | keeps two workouts apart when neither log id is readable |
| M24 | `historyCorrection`: resolved branch names on `performedName` | 1 | corrects a resolved row as its concrete catalogue version |
| M25 | `historyCorrection`: resolved branch removed (`if (false)`) | 2 | the two resolved-branch tests |
| M26 | `historyCorrection`: name value handed on without `textOf` | 1 | coerces a name it cannot read |
| M27 | `HistoryClient`: header count → `logs.length` | 1 | counts only workouts that produced history in the header |
| M28 | `HistoryRows`: `formatShortDate` slices without the date check | 1 | shows a date it cannot read rather than a wrong one |

### The four survivors on the first pass, and what they found (commit `5801ebc`)

Published because the standard requires it, and because one of them was a real defect.

- **M4 killed 0.** My cap fixture was 10 workouts × 1 entry, so slicing entries and slicing workouts give the same eight — **a fixture whose two rules coincidentally agree**, the exact shape the standards name. Rewritten as 10 workouts × 2 entries; entry-slicing would show 8 entries across 4 workouts. Now kills 1, and M2/M3 pick it up as well.
- **M17 killed 0.** Same shape: the index fixture had one entry per workout, so workout count and entry count were the same number. Rewritten as 3 workouts / 4 entries.
- **M14 killed 0.** The unresolved row in the fixture had no `currentVersionLabel`, so both branches returned the same string. A row now carries one.
- **M23 killed 0, and mutating it the other way found a defect.** `groupByWorkout` coerced the log id with `String(...)` before comparing. Every row of one log carries the *same stored value*, so plain `===` answers "same workout" correctly even for a value we cannot read — while `String(...)` turns every unreadable id into `"[object Object]"` and **merges two distinct workouts into one block, undercounting what the user did**. Fixed: compare as stored; the React key now carries the group's position too, so two logs sharing an id (reviewer A6, item 11, still open) cannot silently drop one.

**Operational note, learned the expensive way.** The harness restores with `git checkout -- <path>`, which also discards *uncommitted* work in that path. Mid-run it wiped an uncommitted refactor of `HistoryRows.tsx`, which then showed up as four unrelated mutants "killing" a test that was really failing against reverted source. Caught within one run because the kill lists made no sense; the refactor was reapplied and committed, and the full sweep re-run from a clean tree. **Commit before mutating** is not optional with this technique.

### Deliberate coverage gap, published

Item 14's "a set label can be a false `BWx5` when the stored weight is `NaN`" is **not** detected. Doing so needs the raw `WorkoutSetLog`, which `ExerciseHistoryRow` deliberately does not carry — the row model is labels, by design (`historyUtils.ts:21-26` documents the rough edge on purpose). The row-level marker covers the case the row model *can* see: a data-bearing entry that produced no labels at all. Per-set unreadability is a projection-shape question and I am not widening Task 12's contract from a rendering task. Deferred, not missed.

---

## Gates — real output

```
$ bun run test -- --runInBand
Test Suites: 107 passed, 107 total
Tests:       1620 passed, 1620 total
Snapshots:   0 total
Time:        31.137 s

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(no output)

$ bun run lint
$ eslint .
(no output)

$ bun run build
✓ built in 1.17s
(only the known large-chunk advisory)

$ git diff --check
DIFFCHECK-CLEAN
```

**e2e not run — controller instruction.**

Specs changed, needing the controller's serial run:

- `e2e/exercise-history.spec.ts` — after logging one set, asserts the header reads `1 workout · 1 entry`, that there is exactly one `history-row`, and that no version filter is offered for a single-version history; after the second set, asserts a single `history-workout` block (two sets in one workout is one dated block, not two).
- `e2e/history-rawcell.spec.ts` — asserts the unreadable-sets marker does **not** appear when both cells produced labels.

Nothing here needs a browser to be *correct* — every behaviour is covered by rendered jsdom tests against `fake-indexeddb` — but the drawer markup changed shape, so the existing selectors deserve the serial run.

### Foreign failures, attributed by filename

Two intermediate full-suite runs failed in `src/components/catalog/LibraryClient.*`, `src/components/workout/ExercisePickerSheet.*` and `ExerciseReplaceSheet.*` — all Task 11's lane, uncommitted at the time, confirmed by `git status`. Both cleared once the sibling committed. Baseline at dispatch was 103 suites / 1,581 tests; the final 107 / 1,620 includes Task 11's `groupCatalog`, `ExercisePickerSheet` and `ExerciseReplaceSheet` suites. My own eight owned suites plus the new `historyCorrection.test.ts` run 214 tests.

---

## Self-review findings (fixed, commit `d3ba4a1`)

1. **The header lied about totals.** `{logs.length} sessions` became `{logs.length} workouts` in my first draft — but that counts stored records, and a skipped day with nothing recorded is a log, not a workout. Now counts distinct logs that produced a history row. Pinned by M27.
2. **Dates crowded the dense rows.** The index and version-summary lines carried the drawer's full `Apr 22 (Wed)`. They use `MM/DD` now, falling through to whatever is stored when the value is not a date — so an unreadable date reads `last —` instead of `last ndefine`. Pinned by M28.
3. `correctionTargetForRow`'s resolved branch had **no caller** (`rowNeedsReview` gates it out), so nothing distinguished it from the name-only branch. Rather than delete it — the two exports are independent and a later surface that corrects a resolved row would silently get a name-only target — it is pinned directly by `historyCorrection.test.ts` (M24, M25).

---

## Concerns and disclosures

1. **The recent/stale predicate changed meaning, not just its number.** Argued above. If the controller wanted only the threshold re-picked, this is the thing to reverse.
2. **`ExerciseHistoryRow` gained a field.** Additive, in my lane, one line in the projection, and it exists so no surface has to re-derive a grouping key. It does duplicate a string per row.
3. **Three `WorkoutDayClient` test files gained a provider wrapper.** Setup only; no assertion moved. Called out because "do not modify existing tests" is a hard rule and this is a modification.
4. **A correction that moves a family key bounces the detail view back to the index.** `openFamilyKey` no longer resolves, `detail` is `null`, and the user lands on the index with the regrouped list. Correct-ish and not silent, but nobody chose it deliberately — it falls out of keying the open view on the family key.
5. **Two logs sharing an id remains out of contract** (reviewer A6, item 11). The React key now defends the *list* against it; the projection's own grouping still treats them as one log.
6. **Item 13 stands unaddressed by choice.** An unreadable entry *element* still gets no row. Surfacing "something unreadable was logged here" is a new display decision and I did not take it unilaterally; the row-level marker covers only entries the projection does emit.

## What a reviewer should scrutinise most

1. **The `recent` / `stale` re-pick** (`HistoryClient.tsx`, the `filtered` memo) — the one place I exercised judgement the brief did not settle to the letter.
2. **`groupByWorkout`'s uncoerced `===`** (`HistoryRows.tsx`) — it deliberately contradicts the coercion two files away in `logIdOrder`, and the reasoning (same record, same reference; `===` cannot throw) is the load-bearing part.
3. **The `WorkoutDayClient.test.tsx` fixture repair** — the one existing assertion whose *inputs* I changed. Verify the old fixture really was vacuous (`cat-bench` is in no registry; the entries carried no `exerciseName`).
4. **Whether deleting `aggregateExerciseHistory` cost any C-1 coverage.** I claim it did not, and relocated the block to `localDate.test.ts` where M22 kills 10. Check that claim rather than take it.
5. **The `HistoryClient` guard story** — that the page truly reads logs only through the projection, so item 6's eight measured crashes cannot reopen.

---

## Commits

| SHA | Subject |
| --- | --- |
| `4164bb3` | feat: show the whole movement family in the Today history drawer |
| `b64247d` | test: prove a correction regroups live history without rewriting labels |
| `0ce3c63` | feat: replace all-time history with combined movement-family detail |
| `4534e85` | test(e2e): pin the drawer's workout/entry counts and grouping |
| `5801ebc` | fix: two unreadable log ids are two workouts, not one |
| `b91a4bf` | test: pin the correction target built from a history row |
| `d3ba4a1` | fix: count workouts that produced history, and keep index dates compact |

**DONE_WITH_CONCERNS**
