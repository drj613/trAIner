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
