# Task 12 review — lossless family-aware history projection

Reviewer lane: `src/lib/workout/**`, `src/components/workout/**`. Commits `81794c1`, `cff9e8f`.
Baseline: 15 suites / 203 tests green. All mutations restored byte-for-byte (`shasum -c` OK, three files).

---

## 1. Verdict on spec compliance

**Compliant, and scoped correctly.** Spec ~491 (`docs/.../design.md`, "Shared aggregation boundary" through "Performance summaries remain separate by concrete version") asks for six things; all six are present and none is exceeded.

| Spec requirement | Where | Verified by |
| --- | --- | --- |
| `ExerciseHistoryRow` exactly as typed | `historyProjection.ts:34-46` | Field-for-field identical to the spec block. No family/version key bolted on — they live in the index maps. Correct call. |
| "never uses `find`" | `historyProjection.ts:182` `log.entries.forEach`; `historyUtils.ts:99` `for (const entry of log.entries)` | No `find` in either. M12 (re-impose first-match-only) kills 2. |
| Entry appears with ≥1 recorded set **or** an exercise note | `historyUtils.ts:55-57` | M14 (drop the note clause) kills 2. |
| Skipped workouts without exercise data create no rows | test `entry inclusion › skips an entry with no sets and no note` | M1 (delete the guard) kills exactly 1. |
| Sort `performedAt` desc → `logId` → `entryIndex` | `historyProjection.ts:135-139` | M6 (drop logId tiebreak) kills 1. |
| Family shows **only** distinct workout count + latest date; no PR/best/trend | `FamilyHistorySummary` `:53-61` | Test asserts `not.toHaveProperty` for `best`, `bestSetLabel`, `trend`, `sessionVolumesLb`, `volumes`. M10 (`workoutCount := items.length`) kills 2. |
| Per-version session count = distinct logs; same-version-in-one-log sums into one bucket; table still shows both | `:246-260` | M3 (always merge) kills 2; M4 (never merge) kills 3. |

`FamilyHistorySummary` deliberately omits PR/best/trend — the implementer is right that this is the plan's intent, not an omission.

## 2. Verdict on the losslessness invariant

**Row-level losslessness holds under every attack I could construct. Summary-level losslessness does not, and the module throws outright on one input shape the storage layer deliberately preserves.**

The implementer's claim about test *method* is accurate and I want to say so plainly: the tests assert **identities**, not totals — `historyProjection.test.ts:54-56` compares sorted `logId#entryIndex` against literals, `:61-66` re-derives the same set from `rowsByFamilyKey` and checks `new Set(...).size`, and `:69-75` checks `sum(entryCount) === rows.length`. The named zero-volume trap is genuinely covered at `:77-97` (asserts length, `[0, 1000]`, **and** both set labels `["BWx5"]`/`["200x5"]`). I also checked every volume fixture for coincidental agreement and found none: `240*3+200*8 = 2320` vs `225*5 = 1125` vs `275*3 = 825` vs `135*5+115*10 = 1825` — all mutually distinct, so no assertion can pass by luck.

### Adversarial attempts and outcomes

| # | Attack | Outcome |
| --- | --- | --- |
| A1 | Unparseable `performedAt` making `performedAtOrder` an **inconsistent comparator** (mixes numeric and `localeCompare` paths), plus a same-log pair | **Survived.** `entryCount` 5, `sessionCount` 4, same-log entries stayed adjacent (`l-bad#0 l-bad#1`). Row order is arbitrary but nothing is lost or merged. |
| A2 | Two **different** unresolvable exercises sharing one slot id | **FAILED — see C2.** Merged into one family and one version summary. |
| A3 | Dataless set `{setNumber:1}` alongside a real `225x5` | Survived. `bestSetLabel` correctly `"225x5"`; the reduce seeds from `undefined` so a leading zero-volume set cannot win. |
| A4 | Version where every set is bodyweight (all volumes 0) | Survived losslessly, but `bestSetLabel` is degenerate — see M-b. |
| A5 / B1 | Entry whose `sets` is absent or non-array | **FAILED — see C1.** Throws; all history for all exercises lost. |
| A6 | Same log object twice in the input array | Rows retained but row identity `logId#entryIndex` duplicates — see M-d. Out of contract (`logRepo.list()` returns distinct records). |
| — | Duplicate `entryIndex` | **Unfalsifiable by construction**: `entryIndex` is the `forEach` index, so it cannot duplicate within a log. |
| — | Same exercise at two versions in one log | Covered by the existing `logWithHighAndLowBar` test; M2/M9 (collapse versionKey) kill 7 each. |
| — | Empty `sets` array + no note | Correctly excluded per spec; M1 pins it. |

---

## CRITICAL

### C1 — One corrupt `sets` field destroys all history for every exercise

`entryHasHistoryData` (`src/lib/workout/historyUtils.ts:55-57`) dereferences `entry.sets` with no shape guard:

```ts
return entry.sets.some(setHasData) || Boolean(entry.notes?.trim());
```

`projectExerciseHistory` calls it on **every entry of every log** (`historyProjection.ts:183`), so one bad entry throws out of the whole projection. Measured, all five shapes:

```
sets=undefined : projection -> THREW (Cannot read properties of undefined (reading 'some')) | today drawer -> rows=1
sets="corrupt" : projection -> THREW (entry.sets.some is not a function)                    | today drawer -> rows=1
sets=42        : projection -> THREW (entry.sets.some is not a function)                    | today drawer -> rows=1
sets=null      : projection -> THREW (Cannot read properties of null (reading 'some'))      | today drawer -> rows=1
sets={}        : projection -> THREW (entry.sets.some is not a function)                    | today drawer -> rows=1
```

This is not hypothetical. `src/lib/storage/appDb.ts:186-195` goes out of its way to keep exactly this shape, and says why:

> `anything present that we cannot read — a non-array entries, a non-record entry, a non-array sets — may be standing in for real sets we have no way to recover, so the log counts as having data and is kept. Retaining an empty log costs the user one deletion; deleting a real one destroys their only copy.`

So the storage layer preserves unreadable `sets` on purpose, and Task 12 — the module whose stated first invariant is losslessness — crashes on it and loses **everything**. Note the last column: the path being replaced (`aggregateExerciseHistory`) **survives** all five shapes, because it only dereferences `sets` for entries that already matched. This is therefore a robustness *regression* against the code it supersedes, which is what makes it Critical rather than Important.

**Required fix.** Guard the shape in `entryHasHistoryData`, `entrySetLabels`, and `entryVolumeLb`, and follow appDb's own rule — an unreadable `sets` counts as data-bearing, so the entry still gets a row (with `sets: []`, `volumeLb: 0`) rather than vanishing. Something like:

```ts
const setsOf = (entry: WorkoutLogEntry): WorkoutSetLog[] =>
  Array.isArray(entry.sets) ? entry.sets : [];
// Unreadable `sets` is data we cannot render but must not drop — appDb.ts:186
const setsUnreadable = (entry: WorkoutLogEntry): boolean =>
  entry.sets != null && !Array.isArray(entry.sets);
```

Needs a test per shape (`undefined`, `null`, string, number, object), asserting the projection returns a row for the good entry **and** one for the corrupt entry.

---

## IMPORTANT

### C2/I1 — Two different exercises sharing a slot id merge into one version summary

Both `familyKeyForIdentity` and `versionKeyForIdentity` fall back to `identity.groupKey` (`historyProjection.ts:91`, `:97`), and for an unresolvable stored exercise `groupKey` is `slot:${input.slotId}` (`src/lib/catalog/identity.ts:177-178`) — derived from the slot alone, **ignoring the performed name**. Two genuinely different exercises logged into the same slot therefore collapse. Measured (A2):

```
familyKeys : [ 'slot:slot-shared' ]
versionKeys: [ 'slot:slot-shared' ]
family  label: Nordic Hamstring Curl  workoutCount: 2  versionKeys: [ 'slot:slot-shared' ]
version label: Nordic Hamstring Curl  entryCount: 2  sessionCount: 2  best: 95x8  vols: [ 760, 0 ]
row names: [ 'Nordic Hamstring Curl', 'Zercher Good Morning' ]
```

The version summary is labelled **Nordic Hamstring Curl** while reporting `best: 95x8` — a set that was actually a Zercher Good Morning — and blends both exercises into one volume trend `[760, 0]`, which will render as a steep decline that never happened.

Rows are all retained, so strict row-level losslessness survives. But the brief's rule is *"combining happens only for summaries, and only for same-version entries within a log"*, and this combines across **different exercises in different logs**. It is a summary-level violation of the stated invariant.

Reachability is real, not theoretical: the fallback only applies when neither entry resolves, which is exactly the legacy pre-canonical log shape (`exerciseId` only, no `canonicalExerciseId`), and `src/lib/workout/exerciseSwap.ts` exists — swapping the exercise in a slot is a supported operation. Legacy logs plus one swap is enough.

Worth noting the resolver *does* distinguish them — `identityCacheKey` (`:124`) includes `exerciseName`, so two separate identities are resolved; they just yield the same `groupKey`. The loss is in Task 12's key derivation, not in Task 5's cache.

**Recommended fix**, in Task 12's key functions rather than in `identity.ts` (which other lanes own): when there is no `concreteExerciseId`, qualify the fallback with the normalized performed name, e.g. `slot:<slotId>#<normalizedName>`. Test: A2's two logs must produce two version summaries, each with its own label and `best`.

### I2 — The `bestSetLabel` tie rule is implemented but not pinned

The rule is real — `historyProjection.ts:264` uses `>=`, which keeps the incumbent and so resolves ties to the earliest set. But **M7 (`setVolume(best) >= setVolume(candidate)` → `>`, i.e. later set wins ties) kills 0 of 203 tests.** The only best-set test (`:246-255`) uses `1600 / 1125 / 720`, three distinct volumes, so it cannot see the tie rule at all. This is precisely the "incidental ordering the test does not control" shape flagged as already having bitten this plan once.

**Required:** one test with two equal-volume sets in a version (e.g. `100x10` then `200x5`, both 1000) asserting `bestSetLabel === "100x10"`. Confirm M7 then fails.

### I3 — The Today drawer now mislabels entries as sessions (live, user-visible)

The accepted behaviour change lands here, and I rendered it rather than reasoning about it. Two logs (one containing the exercise twice), `aggregateExerciseHistory(logs, "slot-a", "cat-bench")` → 3 rows, then `render(<HistoryDrawer …>)`:

```
HEADER: 3 sessions · last 8
VISIBLE TEXT:
Bench | 3 sessions · last 8
Apr 22 (Wed)  vol 675    225x3
Apr 22 (Wed)  vol 1,480  185x8
Apr 15 (Wed)  vol 675    135x5
```

The data is now **right** — both logged sets are visible, which is the whole point of the change, and the drawer degrades gracefully (no crash, no key warning; `HistoryDrawer.tsx:78` keys on `${row.date}-${i}` so the duplicate date is fine). But:

1. **The count is wrong.** `HistoryDrawer.tsx:66` renders `{rows.length} session{…}`. Two workouts are reported as "3 sessions".
2. **"Apr 22 (Wed)" appears twice** as two separate date-headed blocks with nothing indicating they are one workout. A user reads two sessions on one day.
3. `· last 8` is now ambiguous, since `limit = 8` (`historyUtils.ts:91,116`) slices entries.

The blocking part: **`ExerciseSessionRow` (`historyUtils.ts:4-9`) carries no `logId`**, so the drawer *cannot* dedupe or group by workout even if it wanted to. The fix is not a copy change; it needs the row type to carry workout identity. Straight into Task 13's brief.

### I4 — `aggregateLogs.sessions` is genuinely wrong for the duplicate case (pre-existing)

Confirming the implementer's reasoning holds, and answering the controller's question: **yes, `sessions` is wrong.** `src/components/workout/HistoryClient.tsx:52` pushes one "session" per **entry**, so `sessions` at `:70` is an entry count. A twice-logged exercise reports 2 sessions for 1 workout. Knock-ons: `volumes` (`:61`) gets one sparkline point per entry rather than per workout, distorting `deriveTrend`; and the recent/stale filter at `:320-321` (`sessions > 3`) is inflated.

`git show 81794c1 -- src/components/workout/HistoryClient.tsx` is empty — Task 12 touched only the *test* file. So this is pre-existing, **not** introduced by Task 12, and the implementer's decision not to encode `sessions: 2` as a characterization test Task 13 must delete was the right call. But it is a live bug on a shipped surface and Task 13 owns the fix; `VersionHistorySummary.sessionCount` + `sessionVolumesLb` are already the correct replacements.

### I5 — `familyKey` and `versionKey` share a namespace, and `push-up` is a live collision

Answering the flagged question with measurements. The two key spaces:

```
unassigned exercise: groupKey=exercise:barbell-high-bar-squat  familyKey=exercise:barbell-high-bar-squat  versionKey=barbell-high-bar-squat
assigned   exercise: groupKey=movement:squat                   familyKey=squat                            versionKey=barbell-high-bar-squat
```

- familyKey space = {bare `movementId`} ∪ {`exercise:<id>`} ∪ {`slot:<id>`}
- versionKey space = {bare `concreteExerciseId`} ∪ {`movement:<id>`} ∪ {`exercise:<id>`} ∪ {`slot:<id>`}

**No true collision inside either map.** I verified zero catalogue ids carry a `movement:`/`exercise:`/`slot:` prefix, so a bare id can never equal a prefixed one. The unassigned path (the common one, 3,033/3,175) is safe: familyKey `exercise:X` ≠ versionKey `X`.

**But three ids exist in both the exercise and movement id sets** — `bench-press`, `row`, `push-up` — and one of them collides for real:

```
exercise bench-press: movementId=null      -> familyKey exercise:bench-press, versionKey bench-press   (safe, differ)
exercise row        : movementId=null      -> familyKey exercise:row,         versionKey row            (safe, differ)
exercise push-up    : movementId="push-up" -> familyKey "push-up",            versionKey "push-up"      (IDENTICAL)
```

Inside Task 12 this is harmless — `rowsByFamilyKey` and `rowsByVersionKey` are separate `Map`s. It becomes a trap the moment Task 13 flattens both into one key space (a route param, a `selectedKey` state shared by the family and version views, one React key list). `familySummaries.get("push-up").versionKeys === ["push-up"]` also reads as self-referential. Task 13's brief must state that family and version keys are **not** interchangeable and must be namespaced separately at any shared boundary.

---

## MINOR

- **M-a — dead tiebreaker in `compareRowsChronologically` (`:144`).** M5 (delete `|| left.logId.localeCompare(right.logId)`) kills **0 of 203**. It is genuinely redundant: `projected` is already sorted by `compareRows` (which *does* tiebreak on `logId`, pinned by M6) and `Array.prototype.sort` is stable, so the earlier, stronger guard already handles it — the "stronger earlier guard" shape. Per the standing rule this is *unfalsifiable in this harness*, not by construction, so either delete it or keep it with the measured negative result written into the comment ("M5: deleting this kills 0 tests; adjacency is guaranteed by the prior `compareRows` sort plus sort stability").
- **M-b — `bestSetLabel` is meaningless for bodyweight movements.** Every set has volume 0, so `>=` returns the first one. Measured (A4): sets `BWx5` then `BWx8` → `bestSetLabel: "BWx5"`, though 8 reps is plainly the better set. Bodyweight work is common. Task 13 should either suppress best-set for all-zero-volume versions or rank by reps when load is absent.
- **M-c — `performedAtOrder` (`:127-132`) is an inconsistent comparator.** When either side is unparseable it switches to `localeCompare`, so comparisons are not transitive across a mix of valid and invalid timestamps and sort output is implementation-defined. Losslessness survived (A1), so this is ordering-only, but a deterministic total order (e.g. treat NaN as `-Infinity`, then always tiebreak on the string) would remove the hazard.
- **M-d — duplicate row identity if a log appears twice in the input** (A6: two rows both `l-same#0`). Out of contract, but Task 13 must not assume `logId#entryIndex` is a unique React key without controlling the input.

---

## Answers to the four flagged items

**1. Does the session-bucketing loop's adjacency assumption hold?** **Yes, and it is guaranteed, not incidental** — but the guarantee does not live where the implementer thought. Same-log entries share both `log.performedAt` and `log.id`, so the first two keys of `compareRowsChronologically` tie and `entryIndex` orders them; independently, `projected` is pre-sorted by `compareRows` and `Array.prototype.sort` is stable. The `compareRows` logId tiebreak is load-bearing (M6 kills 1); the `compareRowsChronologically` one is dead (M5 kills 0, see M-a). It also held under the inconsistent-comparator attack (A1), which is the strongest case I could build. Not an Important finding on adjacency itself — the redundancy is Minor.

**2. Family/version key collision safety.** No collision within either map (verified: 0 prefixed catalogue ids). But two real problems: the `slot:` fallback maps two distinct identities onto one key (**I1, Important**), and `push-up` yields `familyKey === versionKey === "push-up"` in the live catalogue (**I5**).

**3. Is the `bestSetLabel` tie rule implemented and pinned?** Implemented correctly at `:264` (`>=` keeps the earlier set). **Not pinned** — M7 kills 0 of 203; the only test uses three distinct volumes (**I2**).

**4. Does `entryCount` belong in the UI-facing type?** **Yes — keep it, and Task 13 should render it.** Right now it is only a losslessness affordance (`:72`'s comment says so), but I3 shows the consumer surface *needs* it: the honest label for a twice-logged exercise is "2 sessions, 3 entries", and `entryCount` is the only field that can produce it. Removing it would force Task 13 to recompute `rows.length` per version. Keep it, and drop the "kept so losslessness is checkable" framing once Task 13 consumes it.

---

## Mutation evidence

Every count below is stated beside the exact mutation. 19 mutations; **17 killed, 2 survived**. All three files verified byte-identical afterwards via `shasum -c`.

| # | Exact mutation | Tests failed | Named failure |
| --- | --- | --- | --- |
| M1 | delete `if (!entryHasHistoryData(entry)) return;` (`hProjection.ts:183`) | 1 | `entry inclusion › skips an entry with no sets and no note` |
| M2 | `versionKey: versionKeyForIdentity(identity)` → `familyKeyForIdentity(identity)` (`:189`) | 7 | incl. `losslessness › never merges different concrete versions…` |
| M3 | `if (current && current.logId === item.row.logId)` → `if (current)` (`:249`) | 2 | `ordering › orders session volumes oldest first…`, `summaries › derives best set…` |
| M4 | same condition → `if (false)` | 3 | incl. `shared projection boundary › keeps both entries of a twice-logged exercise…` |
| **M5** | delete `\|\| left.logId.localeCompare(right.logId)` from `compareRowsChronologically` (`:144`) | **0** | **SURVIVED — M-a** |
| M6 | delete `\|\| left.logId.localeCompare(right.logId)` from `compareRows` (`:137`) | 1 | `ordering › sorts by performedAt descending, then logId, then entryIndex` |
| **M7** | `setVolume(best) >= setVolume(candidate)` → `>` (`:264`) | **0** | **SURVIVED — I2** |
| M8 | `familyKeyForIdentity` → `return identity.groupKey;` (`:91`) | 4 | incl. `summaries › exposes only distinct workout count and latest date…` |
| M9 | `versionKeyForIdentity` → `return identity.groupKey;` (`:97`) | 7 | incl. `losslessness › keeps a zero-volume entry…` |
| M10 | `workoutCount: new Set(items.map(i => i.row.logId)).size` → `items.length` (`:229`) | 2 | `summaries › counts a family workout once even when it holds several family entries` |
| M11 | `performedName: entry.exerciseName?.trim() \|\| …` → `identity.displayLabel \|\| entry.exerciseId` (`:196`) | 2 | `stored labels versus current classification › keeps the stored performed name…` |
| M12 | `aggregateExerciseHistory`: re-impose first-match-per-date (revert to `find` semantics) | 2 | `keeps every matching entry when one workout logs the exercise twice`, `keeps a bodyweight entry that contributes zero volume` |
| M13 | add `import { logRepo } from "@/lib/storage/logRepo";` to `historyProjection.ts` | 1 | `identity-context seam › reads no storage: the projection module imports no repository or database` |
| M14 | `entryHasHistoryData` → drop `\|\| Boolean(entry.notes?.trim())` (`hUtils.ts:56`) | 2 | `entry inclusion › includes a note-only entry with no recorded sets` |
| M15 | `setHasData` → delete `\|\| s.rpe != null` (`:44`) | 2 | `entry helpers › keeps an entry whose only readable set data is an rpe` |
| M16 | `setVolume` → `return s.weight ?? 0` (drop kg conversion, `:28`) | 3 | `entry inclusion › preserves logged units in labels while normalizing volume to pounds` |
| M17 | `entrySetLabels` → drop `.filter(Boolean)` (`:61`) | 2 | `entry helpers › labels an entry's sets and drops empty labels` |
| M18 | `deriveVolumeTrend` dead band `priorAverage * 1.03` → `* 1.0` (`:82`) | 1 | `entry helpers › derives a volume trend only from six-plus sessions of movement` |
| M19 | projection writes to input: add `entry.notes = entry.notes ?? "";` after the guard | 1 | `identity-context seam › regroups the very same logs under a changed context without mutating them` |

### The no-reload seam — the implementer is right, with evidence

M19 settles it. The `deepFreeze` helper (`historyProjection.test.ts:337-340`) recurses via `Object.values(value).forEach(deepFreeze)` **before** `Object.freeze(value)`, so it reaches the whole input graph — arrays and nested objects alike, not just the outer array. I proved it bites: making the projection write to `entry.notes`, two levels deep inside the frozen graph, fails the seam test. So "does not mutate logs" is structurally enforced, not merely unobserved. The import-scan test is also real (M13 kills it). Both claims in the report hold; the frozen-graph technique is worth reusing.

---

## For Task 13's brief

Task 13 is being redone from scratch. These are the things its consumer needs that Task 12 does not provide, plus the traps waiting for it.

1. **`ExerciseSessionRow` has no `logId`, so the Today drawer cannot group by workout.** `HistoryDrawer.tsx:66` currently renders `{rows.length} sessions`, observed as **"3 sessions" for 2 workouts** (I3). Task 13 must either move the drawer onto `projectExerciseHistory` (whose rows *do* carry `logId`) or add `logId` to `ExerciseSessionRow`. Until then the drawer's session count is wrong on a shipped surface.
2. **Group same-workout rows visually.** Two rows from one workout render as two identical `Apr 22 (Wed)` blocks. Needs a workout-level grouping or a "2 of 2" marker so losslessness reads as intent rather than a duplicate-render bug.
3. **`limit = 8` now slices entries, not workouts,** so `· last 8` can show fewer than 8 workouts. Fix the copy, or slice by distinct `logId`.
4. **Replace `aggregateLogs` — its `sessions` count is a live bug** (I4). `HistoryClient.tsx:52,70` counts entries. Adopt `VersionHistorySummary.sessionCount` and `sessionVolumesLb` (already correctly per-workout). Remember the filter thresholds at `:320-321` (`sessions > 3`) shift once the count is corrected.
5. **Never share a key space between family and version.** `push-up` produces `familyKey === versionKey === "push-up"` in the live catalogue (I5). Namespace any route param / selection state / React key explicitly (`family:` / `version:`).
6. **Render `entryCount` alongside `sessionCount`.** It is the only field that lets the UI say "2 sessions, 3 entries" honestly. Keeping it is the right call (flagged item 4).
7. **Family surfaces must not show PR, best set, or volume trend.** `FamilyHistorySummary` deliberately has no such fields (spec ~491). Do not compute them client-side from `rowsForIdentity`.
8. **`bestSetLabel` is degenerate for bodyweight versions** (M-b): all volumes are 0, so it returns the *first* set (`BWx5` over `BWx8`). Suppress it or rank by reps when there is no load.
9. **Do not assume `logId#entryIndex` is a unique React key** unless the log list is de-duplicated upstream (M-d).
10. **Expect `sets: []` rows once C1 is fixed.** An entry with unreadable `sets` should render as a dated row with a note/marker rather than a blank — the user needs to see that something was logged there.

---

## Status

**CHANGES REQUESTED**

**Must change before Task 12 is accepted:**

1. **C1 (Critical)** — guard the `entry.sets` shape in `entryHasHistoryData`, `entrySetLabels`, and `entryVolumeLb`. One non-array `sets` currently throws out of `projectExerciseHistory` and destroys all history for all exercises, on a shape `appDb.ts:186-195` deliberately preserves and that the code being replaced survives. Follow appDb's rule: an unreadable `sets` is data-bearing, so the entry still gets a row. Add a test per shape (`undefined`, `null`, string, number, object).
2. **I1 (Important)** — stop merging two different unresolvable exercises that share a slot id into one family and one version summary. Qualify the `groupKey` fallback with the normalized performed name when `concreteExerciseId` is absent. Test: A2's two logs must yield two version summaries with their own labels and `best` values.
3. **I2 (Important)** — pin the `bestSetLabel` tie rule with two equal-volume sets; confirm M7 (`>=` → `>`) then fails.
4. **M-a (Minor)** — either delete the dead `logId` tiebreak in `compareRowsChronologically` or write the measured negative result ("M5 kills 0 tests; adjacency comes from the prior `compareRows` sort plus sort stability") into the comment.

I3/I4/I5 are Task 13's to fix and are written up in that section; they do not block Task 12.

**Verified but could NOT falsify** (the implementer is right about all of these):
- Row-level losslessness, under 5 independent attacks (A1, A3, A4, A6, plus the inconsistent-comparator case) — no attack dropped a row.
- The test *method*: assertions are on `logId#entryIndex` identities, not totals. Checked every volume fixture for coincidental agreement (`2320` / `1125` / `825` / `1825`) — none can pass by luck.
- The named zero-volume trap is genuinely covered (`:77-97` asserts length, `[0, 1000]`, and both set labels).
- The no-reload seam: the deep-freeze reaches the whole input graph and **bites** (M19 kills the seam test from two levels deep); the import-scan test is real (M13 kills it).
- No `find` in either the projection or `aggregateExerciseHistory`; combining occurs only inside version summaries, only for the same `versionKey`, only within one `logId` (M3 and M4 both kill).
- `ExerciseHistoryRow` matches the spec type field-for-field; `FamilyHistorySummary` correctly withholds PR/best/trend.
- The session-bucketing adjacency assumption holds and is guaranteed rather than incidental (flagged item 1).
- The decision not to characterize `aggregateLogs.sessions` was good judgement — and the bug is pre-existing, not introduced by Task 12.
