# Task 12 — Lossless family-aware history projection report

## Delivered boundary

One pure projection that both history surfaces will read from (Task 13):

- `src/lib/workout/historyProjection.ts` (new)
  - `projectExerciseHistory(logs, identityContext) -> ExerciseHistoryProjection`
  - `rowsForIdentity(projection, identity)` — every row for the identity's whole movement family, newest first
  - `rowsForVersion(projection, identity)` — rows for one concrete version (the drawer's version filter)
  - `familyKeyForIdentity` / `versionKeyForIdentity` — `movementId ?? groupKey` and `concreteExerciseId ?? groupKey`
  - `ExerciseHistoryRow` exactly as the spec declares it (spec lines 477-489) — no extra fields
  - `FamilyHistorySummary` = `familyKey, movementId?, label, workoutCount, latestDate, latestPerformedAt, versionKeys`. No best, no PR, no trend, no volumes (spec lines 497, 505-507).
  - `VersionHistorySummary` = `versionKey, concreteExerciseId?, familyKey, label, sessionCount, entryCount, sessionVolumesLb, bestSetLabel?, lastSets, lastDate, trend`.
- `src/lib/workout/historyProjection.testFixtures.ts` (new) — `makeHistoryProjectionFixture()` with the exact shape the plan specifies, plus `makeHistoryProjectionContext()` and `lowBar` / `bench` catalogue items reused by the tests.
- `src/lib/workout/historyUtils.ts` — extracted the shared entry helpers the projection needs (`setHasData`, `entryHasHistoryData`, `entrySetLabels`, `entryVolumeLb`, `deriveVolumeTrend`) and made `aggregateExerciseHistory` lossless (see below).
- `src/components/workout/HistoryClient.aggregateLogs.test.ts` — added a boundary-lock describe block (see "Existing test modified").

Keys are unambiguous: movement and concrete IDs are bare (`squat`, `barbell-high-bar-squat`), while every resolver standalone key is prefixed (`slot:`, `name:`, `exercise:`, `catalog:`), so a family key can never collide with a standalone key.

## How losslessness is enforced and verified

Enforcement:
- `log.entries.forEach((entry, entryIndex) => …)` — no `find` anywhere in the projection. Each data-bearing entry produces exactly one row, addressable by `(logId, entryIndex)`.
- Combining happens **only** inside `versionSummaries`, only for entries with the same `versionKey`, and only when they share a `logId`. The combined table still returns both rows.
- `familySummaries.workoutCount` is `new Set(logIds).size`, so a workout holding three family entries counts once.

Verification (`historyProjection.test.ts`, `describe("losslessness")`) asserts **identities and counts, not just aggregates**:
- `retains one row per data-bearing entry` compares the sorted set of `logId#entryIndex` strings against a literal expected list.
- `partitions every row into exactly one family bucket` re-derives the same identity list from `rowsByFamilyKey` and asserts no row is duplicated or missing.
- `accounts for every row in the concrete-version entry counts` sums `entryCount` across all version summaries and asserts it equals `rows.length` — `entryCount` exists so this identity is checkable rather than implied.
- `keeps a zero-volume entry that a totals-only check would miss` is the explicit trap guard: a `BWx5` entry (volume 0) beside a `200x5` entry. It asserts `rows.length === 2`, `volumeLb === [0, 1000]`, and the set labels — a totals-only assertion would have passed with the zero-volume row dropped.
- `never merges different concrete versions into one version summary` asserts the exact key set and each version's own `sessionVolumesLb`.

Both required mutations were run and both were caught: dropping a duplicate same-version entry (M1, 9 tests fail) and merging metrics across versions (M2, 7 tests fail). Full table below.

## No-reload-on-identity-change seam — how I verified it

Two mechanisms, both tested:

1. **Signature.** `projectExerciseHistory(logs, context)` takes logs as an argument. It never loads them. Consumers hold logs in their own state and re-run the projection in a `useMemo` keyed on `[logs, contextVersion]`, so a context bump recomputes grouping with the same log array and no repository read.
2. **Tests** (`describe("identity-context seam")`):
   - `regroups the very same logs under a changed context without mutating them` deep-freezes the log array, projects it under the base context (2 rows in the `squat` family), then projects **the same frozen array** under a context carrying a `normalizationOverride` that detaches `barbell-low-bar-squat` from the squat movement. Result: still 2 rows total, but only 1 in the squat family and a new `exercise:barbell-low-bar-squat` family with `workoutCount: 1`. Because the input is deep-frozen, any attempted write would throw `TypeError` in strict mode, so the test also proves the projection does not mutate the caller's logs.
   - `reads no storage` reads `historyProjection.ts` off disk and asserts none of its import specifiers match `/storage|Repo|appDb|indexedDB|idb/i`. Mutation M11 (adding `import { logRepo } from "@/lib/storage/logRepo"`) fails exactly that test, so the guard is real rather than vacuous.

Task 14's `IDENTITY_CONSUMERS` list already names `src/lib/workout/historyProjection.ts`; grouping there goes through `resolveExerciseIdentity` only, with no `canonicalExerciseId ?? exerciseId` fallback anywhere.

## TDD evidence

### RED 1 — the `.find` loss (plan Step 2, literal)

Added two tests to `historyUtils.test.ts` before touching the implementation. Real output:

```
● aggregateExerciseHistory › keeps every matching entry when one workout logs the exercise twice
    expect(received).toHaveLength(expected)
    Expected length: 2
    Received length: 1

● aggregateExerciseHistory › keeps a bodyweight entry that contributes zero volume
    expect(received).toHaveLength(expected)
    Expected length: 2
    Received length: 1
    Received array:  [{"date": "2026-05-07", "note": undefined, "sets": ["BWx10"], "volume": 0}]

Tests:       2 failed, 22 passed, 24 total
```

That is the exact failure the plan predicted ("FAIL because only one entry is retained"), for the right reason: `log.entries.find` returned the first match and the second entry was gone.

### RED 2 — the projection

The plan's two Step-1 tests were written first and failed with:

```
Cannot find module './historyProjection' from 'src/lib/workout/historyProjection.test.ts'
```

That is a weak RED on its own, so the behavioural RED for the projection is carried by the mutation table below (M1/M2 reproduce precisely the `find` loss and the cross-version merge inside the real implementation) plus RED 1 above, which shows the same defect failing behaviourally in the shipped code path.

### RED 3 — a genuine wrong expectation caught by the implementation

My first `derives best set…` expectation said `bestSetLabel: "240x3"`. The implementation returned `200x8`, and it is right: best set is highest set volume (200×8 = 1600 > 240×3 = 720), matching `HistoryClient`'s existing definition. I corrected the test and left a comment with the arithmetic rather than changing the code to match a wrong expectation.

Also caught by RED: my first cut derived the chronological order with `[...items].reverse()`, which flipped entry order *within* a workout, so `lastSets` came back `["200x8", "240x3"]`. Fixed with an explicit ascending comparator (`compareRowsChronologically`).

## Mutation verification

Baseline for the three files: **56 passed, 56 total**. Each mutation was applied singly, the suite run, and the file restored from a byte-copy (`diff` confirmed identical, md5 recorded).

| # | Mutation | Result | Example test that caught it |
|---|---|---|---|
| M1 | drop a duplicate same-version entry within a log (the `find` loss) | 9 failed, 47 passed | `losslessness › retains one row per data-bearing entry` |
| M2 | `versionKey = familyKey` (merge metrics across versions) | 7 failed, 49 passed | `losslessness › never merges different concrete versions` |
| M3 | every entry becomes its own session bucket | 3 failed, 53 passed | `counts distinct logs and keeps concrete metrics separate` |
| M4 | drop the `logId` tiebreak from row ordering | 1 failed, 55 passed | `ordering › sorts by performedAt descending, then logId, then entryIndex` |
| M5 | stop filtering data-free entries | 1 failed, 55 passed | `entry inclusion › skips an entry with no sets and no note` |
| M6 | prefer the current catalogue label over the stored performed name | 2 failed, 54 passed | `stored labels versus current classification` |
| M7 | family `workoutCount` counts entries, not logs | 2 failed, 54 passed | `summaries › counts a family workout once…` |
| M8 | add a `best` field to family summaries | 2 failed, 54 passed | `summaries › exposes only distinct workout count and latest date` |
| M9 | `rowsForIdentity` returns only the concrete version's rows | 3 failed, 53 passed | `keeps two same-family entries from one log` |
| M10 | session volumes newest first | 2 failed, 54 passed | `ordering › orders session volumes oldest first` |
| M11 | import `logRepo` into the projection | 1 failed, 55 passed | `identity-context seam › reads no storage` |
| M12 | `historyUtils`: back to one entry per log | 2 failed, 54 passed | `aggregateExerciseHistory › keeps every matching entry…` |
| M13 | `entryHasHistoryData` ignores notes | 2 failed, 54 passed | `entry inclusion › includes a note-only entry` |
| M14 | `setHasData` returns `true` always | 3 failed, 53 passed | `entry inclusion › skips an entry with no sets and no note` |
| M15 | `entryVolumeLb` ignores logged units | 2 failed, 54 passed | `entry inclusion › preserves logged units… normalizing volume` |
| M16 | `deriveVolumeTrend` loses its 3% dead band | 1 failed, 55 passed | `entry helpers › derives a volume trend only from…` |
| M17 | `entrySetLabels` keeps empty labels | 1 failed, 55 passed | `entry helpers › labels an entry's sets and drops empty labels` |
| M18 | `setHasData` ignores `rpe`/set notes | 2 failed, 28 passed | `entry helpers › keeps an entry whose only readable set data is an rpe` |

No mutation left the suite green. Restore check:

```
$ diff bak/historyProjection.ts src/lib/workout/historyProjection.ts && diff bak/historyUtils.ts src/lib/workout/historyUtils.ts && echo RESTORED IDENTICAL
RESTORED IDENTICAL
4a3f60b3dac92353019af3e1276ac4ab  src/lib/workout/historyProjection.ts
b355cc4f7db0251a55d3deb1087fa6cc  src/lib/workout/historyUtils.ts
```

(M18 was run after the main table, against its own 30-test baseline, and restored the same way.)

## Requirement-by-requirement verification

| Spec requirement | Where |
|---|---|
| Row model exactly as spec lines 477-489 | `ExerciseHistoryRow`; family/version keys live in the projection's index maps rather than being bolted onto the row |
| Iterates every entry, never `find` | `projectExerciseHistory` loop + `describe("losslessness")` + M1 |
| Included when it has ≥1 recorded set or an exercise note, complete or in progress | `entryHasHistoryData`; `entry inclusion › includes entries from workouts still in progress`, `includes a note-only entry` |
| Skipped workouts without exercise data create no rows | `entry inclusion › skips an entry with no sets and no note` (rows, family and version summaries all empty) |
| Sort: `performedAt` desc, then `logId`, then `entryIndex` | `compareRows`; `ordering › sorts by performedAt descending, then logId, then entryIndex` (two logs at the identical instant, deliberately supplied out of order, so the result cannot depend on input order) |
| `performedDate` is the local calendar label | `logLocalDate`; cross-checked against `aggregateLogs` in `HistoryClient.aggregateLogs.test.ts` |
| Set labels keep logged units; volume normalizes to lb | `entry inclusion › preserves logged units in labels while normalizing volume to pounds` |
| Family shows only distinct workout count + latest date | `summaries › exposes only distinct workout count and latest date`, which also asserts `not.toHaveProperty` for `best`, `bestSetLabel`, `trend`, `sessionVolumesLb`, `volumes` |
| Version session count = distinct logs; same-version entries in one log sum into one bucket; table still shows both | plan test `counts distinct logs and keeps concrete metrics separate` + `summaries › derives best set, last result and label per concrete version` |
| Standalone keys come from the resolver | `unresolved records › keeps an unknown canonical id visible under a resolver standalone key` (`slot:slot-mystery`) |
| Resolver never drops a session for missing metadata | same, plus `labels a row with no stored name from resolver output rather than dropping it` |
| Immutable performed labels + current classification badge | `stored labels versus current classification` — stored `"hi bar squat"` kept while `currentVersionLabel` is `"High Bar Back Squat"` |
| Raw cells preserved | `entry inclusion › keeps a raw-cell entry whose value never parsed to numbers` |

## Existing test modified — what changed and why

`src/components/workout/HistoryClient.aggregateLogs.test.ts` (sanctioned by the plan's file list). **No existing assertion was changed, relaxed, or deleted.** I appended one `describe("shared projection boundary")` with two tests that lock today's summary boundary to the new projection ahead of Task 13's swap:

1. Same local-day attribution on both sides (`aggregateLogs(...)[0].lastDate === "05/01"` **and** `projection.rows[0].performedDate === "2026-05-01"`).
2. A twice-logged exercise in one workout yields one index row from `aggregateLogs` (stable either side of the migration) while the projection keeps both entries (`entryIndex [0, 1]`) and reports `sessionCount: 1, entryCount: 2` with the two entries' volume summed into one bucket.

I deliberately did **not** assert `aggregateLogs`'s current `sessions` count for that case (it counts entries, so it reports 2). Encoding today's inflated count would be a characterization test Task 13 must delete, and asserting the corrected value would fail. The projection side asserts the correct semantics; Task 13 makes `HistoryClient` adopt them.

## Behaviour change I own, called out explicitly

`aggregateExerciseHistory` (`historyUtils.ts`) now iterates all matching entries instead of `find`-ing the first. Its only live consumer is the Today drawer via `WorkoutDayClient.tsx:633`. Effect on healthy data: a workout that logged the same exercise twice previously showed one drawer row and silently hid the other; it now shows both, and the `limit = 8` slice counts entries rather than logs. This is the losslessness invariant this task owns and matches spec line 491 ("never uses `find`"). `WorkoutDayClient` tests and the rest of the suite stay green. Task 13 replaces this call with the projection, at which point the function can be retired.

## Files changed

- `src/lib/workout/historyProjection.ts` (new, 291 lines)
- `src/lib/workout/historyProjection.test.ts` (new, 30 tests)
- `src/lib/workout/historyProjection.testFixtures.ts` (new)
- `src/lib/workout/historyUtils.ts` (helpers extracted; `find` → loop)
- `src/lib/workout/historyUtils.test.ts` (+8 tests, none changed)
- `src/components/workout/HistoryClient.aggregateLogs.test.ts` (+2 tests, none changed)

Nothing outside my lane was touched.

## Gates

```
$ bun run test -- --runInBand
Test Suites: 97 passed, 97 total
Tests:       1281 passed, 1281 total
Snapshots:   0 total
Time:        16.913 s
Ran all test suites.

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
EXIT:0

$ bun run lint
$ eslint .
LINT EXIT:0

$ bun run build
vite v6.4.2 building for production...
✓ 1763 modules transformed.
dist/index.html                     1.40 kB │ gzip:   0.70 kB
dist/assets/index-DRZU_Zh2.css     27.67 kB │ gzip:   6.97 kB
dist/assets/index-CkSeILTZ.js   1,529.09 kB │ gzip: 268.69 kB
(!) Some chunks are larger than 500 kB after minification.   ← known-acceptable advisory
✓ built in 2.17s

$ git diff --check
DIFF-CHECK CLEAN
```

### Foreign failure I chased down rather than assumed

An **earlier** full-suite run showed one failure I do not own:

```
FAIL scripts/catalog-normalization/compiler/compile.test.ts
  ● metadata bases do not promote narrower identities into generic variant IDs
    disambiguation rule back-squat-choice references unknown exercise: no-such-exercise
```

Attribution work: it passed in isolation both **with** my changes present and **with my changes stashed** (`git stash push -u -- src/lib/workout src/components/workout/HistoryClient.aggregateLogs.test.ts`), so it is not order-dependence in my files. It is the catalogue lane's own file and its fixtures were being edited concurrently while my run was in flight. The final full-suite run above is 97/97 green, which confirms it was transient concurrent-edit noise in `scripts/catalog-normalization/`, not a real failure in either lane. No failures appeared in `src/lib/import/parser.test.ts` or `src/lib/catalog/shippedDisambiguations.test.ts`, and typecheck is clean, so the untracked-fixture risk the brief warned about did not materialise.

## Self-review findings (found and fixed before committing)

1. `[...items].reverse()` flipped entry order inside a workout, corrupting `lastSets`. Replaced with an explicit ascending comparator.
2. `setHasData` originally ignored `rpe` and set-level notes. No current writer produces such a set, but a set we can read and would then drop is a losslessness hole (a hand-edited or foreign backup could contain one). Widened, with a comment explaining why, plus M18's mutation evidence. A set like that still yields no printable label, so it appears as a note/row rather than a fabricated set string.
3. Considered adding `familyKey`/`versionKey` to `ExerciseHistoryRow` for convenience and rejected it: the spec fixes that type, so grouping lives in the projection's index maps instead.
4. The plan's fixture returns `logsWithDuplicateHighBarEntries` as a two-log array — one duplicate-bearing squat workout plus an unrelated bench workout — so `sessionCount: 1` proves distinct-log counting rather than merely reflecting a single-log input.

## Deliberately deferred

- Rendering, drawer emphasis/filter UI, and `HistoryClient`/`WorkoutDayClient` adoption: Task 13.
- Retiring `aggregateExerciseHistory` and `HistoryClient`'s private `aggregateLogs`/`deriveTrend` duplicates: Task 13 owns those files. `deriveVolumeTrend` in `historyUtils.ts` is the shared version those should collapse onto; I did not edit `HistoryClient.tsx` to remove its copy because it is outside my lane.
- `rowsForVersion` is exported and tested indirectly (via `versionKeyForIdentity` and `rowsByVersionKey`) but has no consumer until Task 13's version filter.

## What a reviewer should scrutinise most

1. **`versionSummaries` session bucketing** (`historyProjection.ts`, the `sessions` loop). It relies on `chronological` being sorted so same-log entries are adjacent. The comparator makes that true; a reviewer should confirm no ordering path can interleave two logs' entries.
2. **Family/version key collision safety** — bare `movementId`/`concreteExerciseId` versus prefixed resolver group keys.
3. **The `aggregateExerciseHistory` behaviour change** and whether the Today drawer showing two same-date rows before Task 13 lands is acceptable in the interim.
4. **`bestSetLabel` semantics** — highest single-set volume, ties resolved to the earliest set, matching `HistoryClient`'s existing `best`.
5. Whether `entryCount` on `VersionHistorySummary` should survive into the UI-facing type or is acceptable as a checkability affordance for the losslessness invariant.

---

Status: DONE

---

# Fix round 1

Commits `202ff2a`, `0bc9563`, `258e177`, `48968cd`, `3a08442`, `f3fc976`, `218e212`.
Baseline for the lane (`src/lib/workout` + `src/components/workout`): **33 suites / 343 tests**. After: **33 suites / 379 tests** (+36). Whole repo 102 suites / 1,429 tests. Every mutation below is named beside its count and every file was restored byte-for-byte (`shasum -c`, both files OK after each group).

Staging note: commits used `git commit --only -- <paths>` rather than `git add` + `git commit`, because the index held four review documents belonging to the controller when this round started. `--only` commits exactly the named paths and leaves the rest of the index alone; the controller committed those docs itself in `479e468`.

## C1 (Critical) — an unreadable `sets` no longer destroys all history

`entryHasHistoryData`, `entrySetLabels` and `entryVolumeLb` now read sets through a local `readableSets`, and a `sets` value that is *present but unreadable* counts as data-bearing so the entry keeps a dated row with `sets: []` and `volumeLb: 0`. `unreadableValue` was **not** imported; the rule is restated locally with the seam explained and both source lines cited (`appDb.ts:186-195`, `v10Identity.ts:158`).

RED, all five shapes, real text:

```
● unreadable sets › keeps readable history when one entry's sets is undefined
    TypeError: Cannot read properties of undefined (reading 'some')
● unreadable sets › keeps readable history when one entry's sets is null
    TypeError: Cannot read properties of null (reading 'some')
● unreadable sets › ... a string / a number / an object
    TypeError: entry.sets.some is not a function
      54 |  */
      55 | export function entryHasHistoryData(entry: WorkoutLogEntry): boolean {
    > 56 |   return entry.sets.some(setHasData) || Boolean(entry.notes?.trim());
Tests:       5 failed, 23 passed, 28 total
```

### DEVIATION FROM THE BRIEF'S LITERAL TEST LIST — please read

The brief asks for a row for the corrupt entry in **all five** shapes. I implemented a row for **three** (`"corrupt"`, `42`, `{}`) and **no row, but no throw** for `undefined` and `null`, because the brief's own authority says so and the plan has already settled it twice:

- `v10Identity.ts:158` — *"`undefined`/`null` read as absent … Anything else that is present but is not the array we expected is unreadable."* The review's own suggested guard (`entry.sets != null && !Array.isArray(...)`) does the same.
- `progress.md:154` (settled ruling) — *"The line is between absent and unreadable, not between null and non-null."*
- Spec: an entry is included with ≥1 recorded set or a note. `sets: undefined` with no note carries no information, and giving it a row would contradict the requirement pinned by the review's M1 and the existing `skips an entry with no sets and no note` test.

The critical property the brief cares about is preserved for all five: the readable entry beside it survives, which is what the tests assert. If the controller wants a row for absent `sets` too, it is a one-line change to `setsUnreadable` plus two test expectations — say the word.

Mutations (lane, 349 tests at that point):

| Mutation | Killed | Named failure |
| --- | --- | --- |
| MC1a: `readableSets` → `return entry.sets` (guard deleted) | 6 | all 5 shape tests + `still reports an unreadable-sets entry as data-bearing to the drawer path` |
| MC1b: `setsUnreadable` → `return false` | 3 | `rows an entry whose sets is a string / a number / an object` |
| MC1c: `setsUnreadable` → `return !Array.isArray(entry.sets)` (absent treated as unreadable) | 2 | `keeps the readable entry when a sibling's sets is undefined / null` |

## C2/I1 (Important) — two exercises in one slot stay apart

`familyKeyForIdentity`/`versionKeyForIdentity` now qualify the unresolved fallback with the normalized performed name (`slot:<slotId>#<normalized name>`). `src/lib/catalog/identity.ts` was not touched. `familyKeyForIdentity` short-circuits on `concreteExerciseId` first, so an `exercise:<id>` family key is unchanged.

RED reproduces the reviewer's A2 exactly — one summary labelled Nordic reporting the Zercher's set:

```
● unresolvable exercises sharing a slot id › keeps them as two versions with their own labels and best sets
    - Expected  - 8   + Received  + 2
    -     "best": "45x10",
    +     "best": "95x8",
          "label": "Nordic Hamstring Curl",
● ... › keeps them as two families rather than one blended trend
Tests:       2 failed, 30 passed, 32 total
```

A third test (`still groups repeats of the same performed name in one slot together`, two logs of "Zercher Good Morning"/"Zercher good morning" → one summary, `sessionVolumesLb: [760, 840]`) was green from the start and guards against over-splitting.

| Mutation | Killed | Named failure |
| --- | --- | --- |
| MI1a: `unresolvedKey` → `return identity.groupKey` (pre-fix behaviour) | 4 | both new tests + `unresolved records › keeps an unknown canonical id visible…` + `shared projection boundary › keeps both entries…` |
| MI1b: delete `if (identity.concreteExerciseId) return identity.groupKey` from `familyKeyForIdentity` | 1 | `identity-context seam › regroups the very same logs under a changed context…` |
| MI1c: qualify with the raw performed name instead of the normalized one | 3 | `still groups repeats of the same performed name in one slot together` + 2 |

### Existing tests changed — flagged loudly

Two key literals moved because the semantics moved. **No other assertion in either test changed**, and no assertion was relaxed or deleted.

1. `historyProjection.test.ts` `unresolved records`: `slot:slot-mystery` → `slot:slot-mystery#zercher good morning` (family and version key, and the `familySummaries` lookup).
2. `HistoryClient.aggregateLogs.test.ts:68`: `versionSummaries.get("slot:bench")` → `get("slot:bench#bench")`. The substance of that assertion (`sessionCount: 1`, `entryCount: 2`, summed volume) is untouched.

## I2 + M-b (Important) — the ruling's total order, implemented as given

`compareSetsByStrength`: volume desc → load in **pounds** desc → reps desc → earliest set. The reduce keeps the incumbent unless the candidate is strictly stronger, which is what resolves a full tie to the earliest set. I agree with the ruling and did not push back.

RED (the reviewer's measured `BWx5` reproduced):

```
● best set ordering › breaks an equal-volume tie by the heavier load
    Expected: "200x5"   Received: "100x10"
● best set ordering › breaks a no-load tie by reps, so bodyweight work ranks sensibly
    Expected: "BWx8"    Received: "BWx5"
Tests:       2 failed, 35 passed, 37 total
```

Five tests, one per level plus the units question. Each is positioned so the expected answer is **not** the first set, so none can pass on incidental ordering.

| Mutation | Killed | Named failure |
| --- | --- | --- |
| **M7 analogue**: `compareSetsByStrength(best, candidate) <= 0` → `< 0` (a later equal set wins) | **1** (was 0 of 203) | `keeps the earliest set when volume, load and reps are all equal` |
| MB1: delete the volume clause | 2 | `ranks by set volume first`, `summaries › derives best set, last result and label per concrete version` |
| MB2: delete the load clause | 2 | `breaks an equal-volume tie by the heavier load`, `compares the load tiebreak in pounds, not raw numbers` |
| MB3: delete the reps clause | 1 | `breaks a no-load tie by reps, so bodyweight work ranks sensibly` |
| MB4: load compared as raw `weight` instead of `setWeightInLb` | 1 | `compares the load tiebreak in pounds, not raw numbers` |

The full-tie test distinguishes two identical sets by their `rawCell` ("first"/"second"), which `formatSetLabel` returns verbatim and `setVolume` ignores. The units test uses two weight-only sets (both volume 0, so the load clause decides) with `100kg` logged **second**, so neither a raw-number comparison nor the earliest-set fallback can produce the expected answer.

`HistoryClient.tsx:63-65` still computes its own `best` with `find` on max volume, so the shipped all-time page keeps the old first-wins tie until Task 13 adopts `VersionHistorySummary`. Out of my scope; noted for Task 13.

## M-a (Minor) — the review's measurement was right, its conclusion was not

I kept the `logId` tiebreak in `compareRowsChronologically`, and it is **not** dead. M5 killed 0 of 203 only because no test existed for the case it protects. With a test for two workouts sharing one `performedAt` instant, each logging the version twice:

| Mutation | Killed | Named failure |
| --- | --- | --- |
| MO4 (= review M5): delete `\|\| left.logId.localeCompare(right.logId)` from `compareRowsChronologically` | **1** (was 0) | `keeps same-workout rows adjacent so one workout is one session` |
| MO5: reorder that comparator's keys, `entryIndex` first | 1 | same test |

Why the reviewer's reasoning does not hold: when two logs share an instant, the first two keys of the chronological comparator tie for rows from *different* logs, so without the `logId` key `entryIndex` interleaves them (`l-x#0, l-y#0, l-x#1, l-y#1`) and one workout is bucketed as two sessions per entry — measured `sessionCount: 4` instead of 2. Stable sort over the `compareRows` pre-sort does not save it, because the chronological comparator actively reorders. The comment now states the measured kill instead of the measured survival.

**Adjacency verified, not assumed** (the brief's "also verify" item): pinned by that test, which asserts `entryCount: 4, sessionCount: 2, sessionVolumesLb: [1000, 1000]`, and killed by two independent mutations.

## M-c (Minor) — ordering is now a total order

`performedAtOrder` maps an unparseable timestamp to `-Infinity` (so it sorts oldest) and uses the string comparison as the tiebreak on **every** path, not only the unparseable one. Compared as an ordering rather than a subtraction, because two `-Infinity` values would subtract to `NaN`. The tiebreak coerces with `String(...)`, since a corrupt log can hold a non-string `performedAt`.

RED:

```
● deterministic ordering with unreadable timestamps › sorts rows with an unparseable timestamp oldest
      Array [ +   "bad",  "new",  "mid", -   "bad" ]
● ... › returns the same order for every input permutation
    Expected: "new,mid,bad"   Received: "bad,new,mid"
```

| Mutation | Killed | Named failure |
| --- | --- | --- |
| MO1: restore `if (NaN either side) return localeCompare` | 2 | `sorts rows with an unparseable timestamp oldest`, `returns the same order for every input permutation` |
| MO2: `instantOf` returns `+Infinity` for unparseable | 2 | same two |
| MO3: drop the `String(...)` coercion | 1 | `keeps rows whose performedAt is not even a string` |

**Honest limitation.** The permutation-invariance assertion (`new Set(orders).size === 1`) was already green with the old intransitive comparator — V8's sort for 3 elements did not expose the inconsistency. Only the explicit expected order failed. I kept the permutation test because it pins the total-order property directly, but it is the literal-order assertion that carries the RED.

## Extra work beyond the review, same Critical class

Self-review of C1 asked what else reaches `entry.sets`. Measured, each destroying **all** history for **every** exercise, on shapes the storage layer preserves on purpose (`appDb.ts:186-195` names a non-array `entries` and a non-record entry; `progress.md:139` is the settled ruling that a log whose only entry is `null` must be retained):

```
entries=undefined      projection -> THREW Cannot read properties of undefined (reading 'forEach')  drawer -> THREW log.entries is not iterable
entries=null           projection -> THREW Cannot read properties of null (reading 'forEach')       drawer -> THREW log.entries is not iterable
entries="corrupt"      projection -> THREW log.entries.forEach is not a function                    drawer -> rows=1
entries=7 / {}         projection -> THREW log.entries.forEach is not a function                    drawer -> THREW log.entries is not iterable
entries=[null]         projection -> THREW Cannot read properties of null (reading 'sets')          drawer -> THREW Cannot read properties of null (reading 'canonicalExerciseId')
sets:[null]            projection -> THREW Cannot read properties of null (reading 'rawCell')
exerciseName: 7        projection -> THREW value.toLowerCase is not a function   (inside the resolver's normalizeExerciseName)
notes: 7               projection -> THREW entry.notes?.trim is not a function
```

Fixed in commits `3a08442` and `f3fc976`: `readableEntries(log)` yields only record entries **with their stored index**, so skipping an unreadable element does not renumber the `(logId, entryIndex)` row identities after it; `readableSets` filters non-record elements; `entryNote`/`entryPerformedName` only accept strings; `textOf`/`labelOf` keep row and summary labels as the strings their types promise. `aggregateExerciseHistory` (the live drawer path) goes through the same guards.

| Mutation | Killed | Named failure |
| --- | --- | --- |
| ME1: `readableEntries` drops the `Array.isArray(log.entries)` guard | 6 | 5 of the `entries is …` cases + `keeps the drawer path readable too` |
| ME2: `readableEntries` keeps non-record elements | 2 | `… entries is an array holding null`, `keeps the readable entries of a log that also holds an unreadable one` |
| ME3: `readableEntries` renumbers indices after filtering | 1 | `keeps the readable entries of a log that also holds an unreadable one` |
| MF1: `readableSets` keeps non-record elements | 2 | `… a set element is null`, `rows an entry whose only set element is unreadable` |
| MF2: `setsUnreadable` ignores unreadable elements inside a readable array | 1 | `rows an entry whose only set element is unreadable, with no fabricated set` |
| MF3: `entryNote` passes any stored value through | 2 | `… the note is a number`, `does not pass an unreadable note or name through to a row` |
| MF4: `entryPerformedName` passes any stored value through | 2 | `… the exercise name is a number`, `does not pass an unreadable note or name through to a row` |
| MF5: `allSets` reads `item.entry.sets` directly | 1 | `keeps a readable set that sits beside an unreadable one` |
| MF6: drop `textOf` from the row label fallbacks | 1 | `labels a row from an unreadable slot id as text` |
| MF7: `textOf` returns the value unchanged | 1 | same |
| ML2: summary labels read `displayLabel` raw | 1 | same |
| **ML1: `labelOf` → plain `textOf`** | **0** | see below |

**ML1 survives and cannot be killed by construction, and I am publishing that rather than claiming coverage.** For a stored exercise `displayLabel` is absent only when the performed name, canonical id and slot id are all absent, and then `row.performedName` is `""` too, so the nullish branch and the empty-string branch agree on every possible input. The nullish check is kept so the fall-through survives a change to either fallback; the measurement and the reason are written into the function's comment so nobody deletes it citing a green mutation. The accompanying test's comment says the same, so it is not mistaken for a pin.

## Healthy-data behaviour

Unchanged except where the I2 ruling changes best-set selection. Evidence: every pre-existing test in the repo passes untouched apart from the two key literals listed above; MB1's second kill (`summaries › derives best set…`, still `200x8`) shows the volume-first headline is intact; and no fix path executes for a readable entry (`readableSets` returns the same array, `setsUnreadable` is false, `entryNote`/`entryPerformedName` return the same strings).

## Self-review findings

1. **Found three more Critical-class throws** (`sets: [null]`, non-string `exerciseName`, non-string `notes`) after the first C1 commit was already green. Fixed in `f3fc976`.
2. **Caught two of my own weak tests.** MF5 and MF6 initially survived. MF5 survived because a version whose *only* set is unreadable produces `bestSetLabel: undefined` either way; the killing case is a readable set **beside** an unreadable one, which I had not written. MF6 survived because my test used a string `exerciseId`, so the coercion never ran. Both tests strengthened, both mutations now kill.
3. **Caught a bug I nearly shipped.** My first summary-label coercion used `textOf` directly, which turns an *absent* `displayLabel` into `""` instead of falling through to the next candidate. Replaced with `labelOf`; the comment records why and that no input can prove the difference.
4. Considered guarding `logLocalDate` against a corrupt `performedAt`: not needed, it yields `"NaN-NaN-NaN"` rather than throwing, and `localDate.ts` is shared with other lanes.

## Deliberately deferred, with reasoning

- **An unreadable entry *element* gets no row.** A `null` or non-record entry has no name, id, sets or note, so there is nothing to key or label a row with. Every other entry in that log and every other log survive, which is the property that matters. Rendering "something was logged here that we cannot read" is a display decision, and the review's Task 13 note 10 already anticipates it.
- **`HistoryClient.tsx`'s own `best`/`sessions`/`deriveTrend` duplicates** — Task 13 owns that file (I3/I4).
- **A non-string `log.id` or `performedDate`** flows into a row untouched. It cannot throw and cannot lose data; coercing it would be unfalsifiable in this module.

## Effect on Task 13's items I3, I4, I5

- **I3 (drawer cannot group by workout):** unchanged, still needs `logId` on the row type. Slightly *easier*: `aggregateExerciseHistory` no longer throws on corrupt logs, so Task 13 can move the drawer onto `projectExerciseHistory` without inheriting a crash path.
- **I4 (`aggregateLogs.sessions` counts entries):** unchanged and still pre-existing.
- **I5 (`push-up` collision) is now WIDER, and Task 13's brief should say so.** Version keys can now contain `#`, and a family key can too. So the key spaces are `{movementId} ∪ {exercise:<id>} ∪ {slot:<id>#<name>} ∪ {name:…}` and `{concreteExerciseId} ∪ {movement:<id>#<name>} ∪ {exercise:<id>} ∪ {slot:<id>#<name>}`. The `push-up` case still collides exactly as measured, and the two spaces still must not be flattened into one. If a key ever reaches a URL, `#` needs encoding — worth one line in Task 13's brief.

## Gates — real output

```
$ bun run test -- --runInBand
Test Suites: 102 passed, 102 total
Tests:       1429 passed, 1429 total
Snapshots:   0 total
Time:        18.865 s
Ran all test suites.

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
TC:0

$ bun run lint
$ eslint .
LINT:0

$ bun run build
✓ built in 1.34s            (with Vite's known-acceptable large-chunk advisory)

$ git diff --check
DIFFCHECK-CLEAN

$ bun run test:e2e
  ✓  93 [chromium] › e2e/workspace.spec.ts:65:7 › … mono font persists after reload (70ms)
  93 passed (1.6m)
```

### Foreign / load failures — checked, not assumed

`--runInBand` is fully green. Under `--maxWorkers=24` (the documented flake load) my tree fails 6 suites / 13 tests, all `thrown: "Exceeded timeout of 5000 ms for a test."` with jsdom `Window.js:520` in the trace. I attributed this rather than assuming: I created a throwaway worktree at `479e468` (the commit immediately before this round, with none of my changes) and ran the same command there — **4 suites / 8 tests fail, the same timeout shape, and the failing set is a superset of mine** (`compile.test.ts`, `ExerciseCorrectionSheet`, `LibraryClient`, `WorkoutDayClient.integration`, plus `SettingsClient`, `ImportClient.remember`, `WorkoutDayClient` which did *not* fail in my run). So this is the pre-existing RTL contention flake, not a regression, and I did not touch a timeout. The worktree was removed afterwards.

## What a reviewer should scrutinise most

1. **The absent-vs-unreadable deviation** from the brief's five-shape test list, above. It is the one place I did not do what the brief literally said, and the substitute reasoning is spelled out with citations.
2. **The M-a reversal.** I kept a line the review called dead, and I claim a measurement that contradicts the review's. The killing test is `keeps same-workout rows adjacent so one workout is one session`; two mutations kill it.
3. **`unresolvedKey`'s reach.** It now also qualifies the `movement:<id>` version key for underspecified identities, so two different unresolved names in one movement family get separate version summaries (same family). I believe that is right by the same argument as the slot case, but it is broader than the review's letter and no test in the repo covers it directly.
4. **ML1**, the one mutation that survives, and whether the by-construction argument holds.
5. Whether the entry/entries/field hardening beyond C1 was in scope, and whether skipping an unreadable entry *element* (rather than rowing it) is the right call.
