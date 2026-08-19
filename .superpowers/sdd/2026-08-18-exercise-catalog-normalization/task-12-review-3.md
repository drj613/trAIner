# Task 12 re-review — fix round 2 (focused third review)

Reviewer lane: `src/lib/workout/**`, `src/components/workout/**`. Round-2 commits `a2d74e6`, `aed5827`, `e07d8fa`, `acc61c2`, `d956791`, `7ebd207`, `f54dce9`, report `73f62ee`.

**Lane baseline reproduced exactly as reported: 34 suites / 420 tests green.**

## Method note — zero tracked-file mutation

Three lanes share this worktree, so instead of editing tracked sources I built an out-of-tree Jest config (`rootDir` = worktree, `roots` = my two lane directories) whose `moduleNameMapper` swaps `historyUtils` / `historyProjection` / `HistoryClient` for a mutated copy held in the scratchpad. Every mutation below ran the **real** lane test files against a **mutated module**, with no tracked file ever written. Verified before and after every run:

```
$ shasum -c baseline.sha
src/lib/workout/historyUtils.ts: OK
src/lib/workout/historyProjection.ts: OK
src/components/workout/HistoryClient.tsx: OK
$ git status --short         # only the sibling import lane's files
 M src/components/import/…   M src/lib/import/…
```

`git stash` was never run. Counts below are **higher** than the report's in several places for one reason only: the committed losslessness fuzz is now a real test in the lane, so mutations it catches add one to the total. Nothing is overstated anywhere.

---

## Verdict per target

| Target | Verdict |
| --- | --- |
| 1 — `aggregateLogs` hardening | **PASS.** Eight shapes closed, same rule, no storage import, deliberate non-changes verifiably untouched. |
| 2 — is the class sweep complete? | **NO — one more Critical of the same class in the lane, plus a worse one one file over.** |
| 3 — the N5 correction | **The implementer is right; review 2 was wrong.** Reproduced both mechanisms. |
| 4 — the pairwise 0-vs-72 fixture | **Qualitatively right and the pin is real. The number 72 does not reproduce (I measure 24 / 9).** |
| N2 revert faithful, C2/I1 not traded away | **PASS**, and "no test changed" verified by diff. |
| N3 struck through in place + MN3b | **PASS**, MN3b kills. |
| N4 corrected counts | **PASS**, both reproduce. |
| Losslessness fuzz non-vacuous | **PASS**, 7 killing mutations measured (report claimed 6). |

---

## TARGET 1 — the `aggregateLogs` hardening

### All eight shapes are genuinely closed

I re-drove the sweep at HEAD rather than trusting the report: 17 stored fields × 8 malformed values × 3 log orderings × 4 entry points. `aggregateLogs` threw **zero** times, including on all eight shapes the report names (`entries` undefined / null / `"corrupt"` / `[null]`; `sets` `"corrupt"` / undefined / `[null]`; a non-string `performedDate`).

### The guards are the same rule, not a second one

`aggregateLogs` does not restate the absent-vs-unreadable line; it calls the very helpers that encode it — `readableEntries`, `readableSets`, `entryPerformedName` (`HistoryClient.tsx:69,77,73`). There is literally one implementation. `textOf(logLocalDate(log))` at `:68` is the *render* coercion (the same helper the row label uses), not the predicate, which is the correct choice for a value that is sorted and sliced as a string.

### No storage seam broken

`historyUtils.ts` imports only `@/lib/programs/types` and `./localDate`; `historyProjection.ts` adds only `@/lib/catalog/*`. `HistoryClient.tsx:5`'s `logRepo` import is pre-existing and belongs to the page component, not the projection — the seam the import-scan test pins is intact.

### The deliberate non-changes really are unchanged — checked by diff, not by claim

`git diff 0395f26..HEAD -- src/components/workout/HistoryClient.tsx` touches nothing in the three deferred behaviours:

- `sessions: sorted.length` (`:95`) — **untouched**, still counts entries not workouts.
- grouping key `entry.canonicalExerciseId ?? entry.exerciseId` (`:70`) — **untouched**.
- first-wins tie `allSets.find((s) => setVolume(s) === bestVol)` (`:89`) — **untouched**.
- `summaries.sort((a, b) => b.sessions - a.sessions)` (`:104`) — **untouched**.

Two edits go beyond a pure guard and I checked both against the healthy-data rule:

1. `flatMap((s) => s.sets)` → `flatMap((s) => [...s.sets])` (`:87`). Forced by `readableSets` returning `readonly`. Same elements, same order. No behaviour change at all.
2. `lastDate: … ?? "—"` → `… || "—"` (`:96`). `??` and `||` differ only when the sliced date is `""`, and `date` is `textOf(logLocalDate(log))`, which is `""` only for an unreadable/absent `performedDate`. A healthy log always yields `"MM-DD"`. **Not a healthy-data change**, and pinned (MN1k kills 1).

### Mutation evidence — Target 1

| Mutation | Killed | Named failure |
| --- | --- | --- |
| **MN1g**: `for (const { entry } of readableEntries(log))` → `for (const entry of log.entries)` (`HistoryClient.tsx:69`) | **4** | `still lists the readable workout when entries is undefined / is null / holds null / is a string` |
| **MN1h**: `sets: readableSets(entry)` → `sets: entry.sets` (`:77`) | **4** | `… when an entry's sets is undefined / is a string / holds null`, `keeps the readable sets of an entry that also holds an unreadable one` |
| **MN1i**: `textOf(logLocalDate(log))` → `logLocalDate(log)` (`:68`) | **2** (report: 1) | `still lists the readable workout when performedDate is a number`, `shows a placeholder rather than a blank cell when the date is unreadable` |
| **MN1j**: `entryPerformedName(entry) ?? textOf(entry.exerciseId)` → `entry.exerciseName ?? entry.exerciseId` (`:73`) | **1** | `names a row from an unreadable exercise name as text rather than throwing it away` |
| **MN1k**: `\|\| "—"` → `?? "—"` (`:96`) | **1** | `shows a placeholder rather than a blank cell when the date is unreadable` |

Target 1 is sound. The hardening was in scope by the same argument round 1 used, and it did not smuggle in a Task 13 change.

---

## TARGET 2 — the class sweep is **not** complete

This is the finding of the review. I did not accept a third declaration; I enumerated and drove.

### What I enumerated

Every dereference in the lane of a value read from a stored log, driven from a real entry point:

| Module | Entry point driven | Result |
| --- | --- | --- |
| `historyProjection.projectExerciseHistory` | direct, 17 fields × 8 values × 3 orders | **clean** |
| `HistoryClient.aggregateLogs` | direct, same matrix | **clean** |
| `historyUtils.aggregateExerciseHistory` | direct, same matrix | **THROWS — see C-1** |
| `WorkoutDayClient.openHistoryFor` → drawer | RTL + real fake-indexeddb | **drawer never opens — C-1** |
| `WorkoutDayClient` hydration effect | RTL + real fake-indexeddb | **silent write loss — C-2** |
| `HistoryDrawer` render | RTL | **throws — folded into C-1** |
| `sessionState.hydrateFromLog` | direct | **throws — folded into C-2** |
| `dayResolver.resolveNextDay` | direct | clean on every shape |
| `ProgramDetailClient.getDayBadge` | read + standalone repro | throws — see M-1 |

### C-1 (Critical) — a non-string `performedDate` still destroys the Today drawer, in the same file round 2 edited

`src/lib/workout/historyUtils.ts:271`

```ts
return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
```

`date` is `logLocalDate(log)` (`:263`), and `logLocalDate` is `log.performedDate ?? localDateOf(log.performedAt)` (`localDate.ts:27`) — a non-string `performedDate` passes through verbatim. Measured at HEAD, one corrupt log beside two healthy ones, all three input orders:

```
aggregateExerciseHistory  log.performedDate = number 7 : b.date.localeCompare is not a function
aggregateExerciseHistory  log.performedDate = object {} : b.date.localeCompare is not a function
aggregateExerciseHistory  log.performedDate = true      : b.date.localeCompare is not a function
aggregateExerciseHistory  log.performedDate = array []  : b.date.localeCompare is not a function
aggregateExerciseHistory  log.performedDate = [null]    : b.date.localeCompare is not a function
```

**What the user sees.** Driven end to end through `WorkoutDayClient` against real fake-indexeddb, two completed sessions for one exercise, one carrying `performedDate: 7`:

```
HISTORY BUTTON: "History for Bench Press"
console.error: [history] failed to load exercise history
               TypeError: b.date.localeCompare is not a function
drawer opened: false
```

The user taps the history icon and **nothing happens**. `openHistoryFor` (`WorkoutDayClient.tsx:622-638`) swallows the throw in its `.catch`, so there is no error, no empty state, no retry — the tap is inert. One corrupt log kills the drawer for **every** exercise, because the sort runs over the whole rows array. In a local-first app this is permanent loss of *access* presented as a dead button: the user's most reasonable conclusion is that the feature is broken or the data is gone.

**Why this is the same defect, not a new one.** It is the exact class round 2 exists to close, and round 2's own sweep measured this very value:

> `performedDate 7 -> THREW last?.date.slice is not a function` — task-12-report.md:528

It then fixed it **in `aggregateLogs`** with `textOf(logLocalDate(log))` and a comment that says why (`HistoryClient.tsx:66-68`, "this date is both sorted and sliced as a string") — and left the identical value unguarded in `aggregateExerciseHistory`, the sibling aggregator in `historyUtils.ts`, the file the same commit `a2d74e6` was editing. Round 1 fixed entry-level `notes` and missed set-level `notes`. Round 2 fixed `performedDate` at one call site and missed the other. Same shape, third consecutive round: **the guard is applied where the reviewer pointed, not swept across the call sites of the value.**

**Second throw one level further in.** Even with the sort fixed, the drawer render goes down:

```
render(<HistoryDrawer rows={[{ date: 7, sets: ["100x5"], volume: 500 }]} />)
  -> TypeError: localYmd.split is not a function     (HistoryDrawer.tsx:23)
```

That one is *not* inside a `.catch` — it is a render throw with no error boundary in the tree, so it unwinds the whole day page.

**Required fix (one line, closes both).** `historyUtils.ts:263`: `date: textOf(logLocalDate(log))`, exactly mirroring `HistoryClient.tsx:68`. Tests: the drawer path (`aggregateExerciseHistory`) with a non-string `performedDate` on one of **three or more** logs — fewer than three will pass without the fix, because with two elements V8 calls the comparator once and `localeCompare` coerces its *argument*, so whether it throws depends on which side the string lands. This is the same one-sided-coercion trap the implementer caught for `logId` (report N3), and it will bite anyone who writes the obvious two-log fixture. Add a `HistoryDrawer` render test with a non-string `date` as well, or state in the row type's comment that `date` is now guaranteed a string.

**Whose is it?** Task 12's. `historyUtils.ts` is Task 12's file, `aggregateExerciseHistory` is the drawer's own aggregator that Task 12 already hardened for `entries`/`sets`/`rawCell`, and the value was measured by this very round.

### C-2 (Critical) — the day-hydration path loses *newly logged* work, silently. Measured, not inspected.

The implementer flagged `WorkoutDayClient.tsx:666,678` as "a logged error and no hydration, not a crash", said it inspected rather than measured, and left it. **I measured it, and the consequence is materially worse than stated.**

Real fake-indexeddb, real component, three logs for one day (`d-1`, `d-2`, `d-3`), one carrying `performedAt: 7`:

```
console.error: [logRepo] session hydration failed
               TypeError: b.performedAt.localeCompare is not a function
cell value after hydration: ""                       <- nothing hydrated, as expected
… user then types "225x5" into the grid and waits out the autosave debounce …
logRepo.list() -> d-1 sets [100x5], d-2 sets [110x5], d-3 sets [120x5]
```

**The 225x5 was never written. Anywhere.** Same result with `entries: [null]` — a shape `appDb.ts:186-195` and the v7 ruling *deliberately preserve*:

```
console.error: [logRepo] session hydration failed
               TypeError: Cannot read properties of null (reading 'exerciseId')
logRepo.list() -> e-1 still entries:[null], no new log, no 315x3
```

**Why.** The async IIFE throws before any branch reaches `setSessionMode`, so `sessionMode` stays `"loading"` forever. `saveCells` returns early on `sessionModeRef.current !== "active"` (`:710`), so **autosave is dead for that day**. But the grid renders fully editable — `readOnly` is only `sessionMode === "viewing"` (`:982`) — so there is nothing on screen telling the user anything is wrong. They log an entire workout into a live-looking grid and it is discarded.

That is not "no hydration". It is silent, permanent loss of work the user is creating *right now*, which outranks every read-path finding in this task, including C-1.

The exposure is also deeper than the two lines named. `hydrateFromLog` (`sessionState.ts:63-83`), called at `:679`, throws on more shapes:

```
hydrateFromLog sets=7 / {} / "corrupt" / true : entry.sets.map is not a function
hydrateFromLog sets=[null]                    : Cannot read properties of null (reading 'setNumber')
hydrateFromLog sets=[7]                       : Invalid array length            (setNumber non-numeric)
hydrateFromLog setNumber={} / "corrupt"       : Invalid array length
```

And one shape corrupts storage rather than throwing: with `entries: "corrupt"`, `for (const entry of target.entries)` walks the string's characters, and the next autosave wrote a phantom entry into the user's log:

```
c-1 entries: [ {exerciseId:"e1", …315x3}, {exerciseId:"undefined", sets:[]} ]
```

**Whose is it?** **A new item, Critical, and it should not wait for Task 13.** It is genuinely outside Task 12's boundary — the day-logging path, not the history projection — and the implementer was right not to touch it mid-round. But Task 13 is a history-UI task and this is a write-path defect, so parking it there buries it. It needs its own ticket, scheduled before this branch merges. The fix is small and reuses guards that already exist in this lane: `String(...)` on both sides of the `:666` comparator (mirroring `logIdOrder`, `historyProjection.ts:212-214`), `readableEntries(target)` instead of `for (const entry of target.entries)` at `:678`, `readableSets` inside `hydrateFromLog`, and — independently of all of that — a `try/finally` or a `catch` that still calls `setSessionMode("active")`, so a hydration failure can never silently disable saving.

### M-1 (Minor) — `getDayBadge`, same class, program-detail page

`ProgramDetailClient.tsx:143`: `(b.completedAt ?? b.performedAt).localeCompare(...)`, rendered unconditionally at `:453`. Confirmed the expression throws standalone with three logs where one has a non-string `completedAt`; my component probe did not reach the week view, so I am reporting this as read-and-repro'd rather than driven end to end. Pre-existing, outside every current lane, no try/catch — a throw here unwinds the program page. Worth a ticket, not a blocker on Task 12.

### What is genuinely clean

`projectExerciseHistory` and `aggregateLogs` survived all 408 field/value/order combinations. `dayResolver.resolveNextDay` survived every shape. Within the projection module the class really is closed — the remaining instances are all in the *consumers* of it, which is precisely the seam two rounds of review kept stopping at.

---

## TARGET 3 — the N5 correction: **the implementer is right, review 2 was wrong**

I transcribed the pre-round-2 arithmetic verbatim (`0395f26:historyUtils.ts:27-33` and `0395f26:historyProjection.ts:224-228`) and ran it.

Review 2's stated mechanism (`task-12-review-2.md:238`): *"A set with a non-numeric `weight` (`{}`) makes every clause `NaN`, so … the reduce always takes the candidate: 'best set' becomes the last set."*

Measured under the old code:

```
(a) badWeight FIRST   [{weight:{},reps:5}, {100,5}, {50,3}]  -> best = the badWeight set (the EARLIEST)
    oldCmp(badWeight, 100x5) === 0            <- not NaN
(a) badWeight MIDDLE  [{100,5}, {weight:{},reps:5}, {50,3}]  -> best = 100x5 (the earliest)
(a) volume of the badWeight set = NaN         <- the real damage
```

The third clause is `(right.reps ?? 0) - (left.reps ?? 0)`, which reads `reps`, not `weight`. With a readable `reps` it is an ordinary number, so `a || b || c` returns `c` and best stays the earliest set. **The `NaN` comparison does not reproduce for an unreadable weight** (`historyProjection.ts:261-263` at HEAD; `0395f26:…:226-228` before). Review 2's mechanism is refuted; the implementer's reading is correct at `file:line`.

What an unreadable weight *does* destroy is the volume: `setVolume = NaN`, so a session containing one perfectly readable set reports `sessionVolumesLb: [NaN]` and a trend derived from it. That is the real harm, and it is the harm the implementer fixed.

The last-set shape needs an unreadable **reps**, and only on sets whose loads tie:

```
(b)  [{reps:{}}, {reps:8}, {reps:3}]  bodyweight  -> best = BWx8  (incumbent discarded at step 1)
(b') [{100,reps:{}}, {200,5}, {50,3}] unequal load -> best = 200x5 (clause 2 decides; clause 3 never reached)
```

Note (b) is *slightly* narrower than "best becomes the last set" — the unreadable set discards whichever incumbent precedes it, then normal comparison resumes, so the result is "the last set" only when the unreadable one is last. The harmful case is real and easy to build: `[BWx8, {reps:{}}, BWx3]` reports **BWx3** as the best set. The implementer's fixture picks the right shape for the right reason.

**Adjudication: the implementer wins.** Both mechanisms are now pinned, and the reps clause cannot regress:

| Mutation | Killed | Named failure |
| --- | --- | --- |
| **MN1d**: `setNumberField` body → `return (value as number) ?? 0` | **4** (report: 3; +1 = the fuzz) | `keeps an unreadable weight from turning a readable session's volume into NaN`, `keeps an unreadable reps from stealing the best set from a readable bodyweight one`, `keeps an unreadable weight or reps from turning a readable volume into NaN`, `300 randomized corpora stay lossless` |
| **MN1f**: reps clause → `(right.reps ?? 0) - (left.reps ?? 0)` (`historyProjection.ts:263`) | **1** | `keeps an unreadable reps from stealing the best set from a readable bodyweight one` |

One observation, not a defect: MN1f's fixture (`historyProjection.test.ts:968-980`, sets `[{reps:5},{reps:{}}]`, expects `"BWx5"`) puts the correct answer **first**, so in isolation it could also be satisfied by a comparator that always keeps the incumbent. It is not actually weak — `breaks a no-load tie by reps` (`:527`) expects the *second* set and would catch that — but the stronger single fixture is `[{reps:{}}, {reps:8}, {reps:3}]` expecting `"BWx8"`, which I confirmed the current code produces. Minor, optional.

---

## TARGET 4 — the pairwise transitivity fixture

Brute force over all ordered triples of a value pool under the pre-round comparator (`258e177:historyProjection.ts:151-156`, transcribed verbatim):

| Pool | Cycles |
| --- | --- |
| 11 values: 4 ISO stamps + `"not a date"`, `"zzz"`, `"aaa"`, `"42"`, `""`, `"Foo"`, `"qqq"` | **0** |
| the same 11 with `"May 1 2026"` substituted in | **24** |
| the same pool + `"May 1 2026"` + `"Foo"` (11 values) | **24** |
| the **shipped fixture's own 8 values** (`historyProjection.test.ts:590-592`) | **9** |
| the shipped 8 with `"May 1 2026"` and `"Foo"` removed | **0** |

**The load-bearing claim reproduces exactly: with ISO stamps and garbage alone the pre-round comparator is transitive (0 cycles), so the first fixture could not have failed; adding `"May 1 2026"` + `"Foo"` creates cycles.** Sample cycle found: `("2026-06-01T14:00:00.000Z", "May 1 2026", "Foo")` — precisely the mechanism the code comment describes.

**The number 72 does not reproduce.** I get 24 on an 11/12-value pool and 9 on the shipped 8-value pool, counting ordered triples of distinct values. 72 is presumably a different counting convention or a differently-composed pool; the implementer does not say which. Since the qualitative claim is what the fixture rests on and that is confirmed, this is a **Minor documentation defect, not a false pin** — but "0 cycles over an 11-value pool … 72" is a specific number in a report on a plan whose named defect class is false statements in shipped text. The **code comment** (`historyProjection.test.ts:578-589`) makes no numeric claim and is accurate as written; only the report cites 72. Either state the pool and counting rule beside the number or drop it.

**The pin itself is real** — this is what matters, and it is measured, not argued:

| Mutation | Killed | Named failure |
| --- | --- | --- |
| **MO1**: restore the pre-round `performedAtOrder` (`Date.parse` + one-sided string fallback) | **3** | `sorts rows with an unparseable timestamp oldest`, `returns the same order for every input permutation`, **`orders every pair the same way the whole list is ordered`** |

The third failure is the new pairwise test. Review 2 proved permutation testing can never expose this in V8 at any reachable size; the pairwise check does. **N6 is now genuinely pinned**, and the permutation test's comment (`:559-563`) correctly states that it pins output stability rather than transitivity. The canary `expect(globalOrder).toHaveLength(8)` is present (`:610`).

---

## Also confirmed

### N2's revert is faithful and did not trade away C2/I1

| Mutation | Killed | Named failure |
| --- | --- | --- |
| **MN2a**: delete `if (identity.movementId) return identity.groupKey;` (`historyProjection.ts:141`) | **2** | `keeps one version history across Squat, Squats and Back Squat`, `keys an underspecified identity by its movement, unqualified` |
| **MI1a**: `unresolvedKey` → `return identity.groupKey` (`:111-114`) | **5** | `unresolvable exercises sharing a slot id › keeps them as two versions…` + `… two families…`, `unresolved records › keeps an unknown canonical id visible…`, `shared projection boundary › keeps both entries…`, `unreadable entry fields › keeps a readable set that sits beside an unreadable one` |

MI1a still killing **5** after the narrowing is the check that matters: the slot-collision fix is intact, not traded for the movement merge.

**The "no existing test was changed" claim is verified by diff, not by assertion.** Across the entire round, the complete set of removed lines in test files is **two**, and both are import statements being expanded:

```
$ git diff 0395f26..HEAD -- '…/*.test.ts' '…/*.test.tsx' '…/*.testFixtures.ts' | grep '^-' | grep -v '^---'
-import { highBar } from "@/lib/catalog/identity.testFixtures";     -> expanded to 6 names
-import type { WorkoutLogDocument } from "@/lib/programs/types";    -> expanded to 3 names
```

Zero assertions weakened, relaxed or deleted. The named prohibition was not breached.

### N3's false report claim is struck through and corrected in place

`task-12-report.md:420` carries the original claim inside `~~…~~` with `**CORRECTED in fix round 2 — this claim was false.**` immediately beneath, naming the mechanism, the lines and the fixing commit. That is correction in place, not supplementation.

The subtlety it found holds, and the half-fix is pinned:

| Mutation | Killed | Named failure |
| --- | --- | --- |
| **MN3a**: `logIdOrder` → `left.logId.localeCompare(right.logId)` | **3** (2 unit + fuzz) | `keeps rows whose log id is not a string`, `keeps two same-instant workouts apart when both log ids are numbers`, `300 randomized corpora stay lossless` |
| **MN3b** (the half-fix): `left.logId.localeCompare(String(right.logId))` | **3** (2 unit + fuzz) | the same three |

**MN3b killing is the important one** — it proves the test drives both input orders and would not pass on `localeCompare`'s one-sided coercion. The test's own comment (`historyProjection.test.ts:592-594`) says exactly why. Good.

### N4's corrected counts reproduce

| Mutation | Report round 1 | Report round 2 | **My measurement at HEAD** |
| --- | --- | --- | --- |
| **MI1a**: `unresolvedKey` → `return identity.groupKey` | 4 (lane 349) | 5 | **5** |
| **MC1b**: `setsUnreadable` → `return false` | 3 (lane 349) | 4 | **5** (4 unit + fuzz) |

Both corrections are made in place in the round-1 tables (`:276`, `:290`) with the baseline they were taken at, which is what the standard asks. MC1b is now 5 only because the fuzz is committed.

### The committed losslessness fuzz is genuinely non-vacuous

Verified two ways.

**By reading**: `historyProjection.losslessness.test.ts:53-90` spells out `isRecord`, `hasText`, the `setsUnreadable` rule and the data-bearing predicate inline, with a comment saying why (`"Calling the module's own helpers would move both sides of the comparison under the same mutation"`). The independence the self-review claims is present in the file.

**By measurement**: it failed under **seven** distinct single mutations in my runs — MC1b, MN1a, MN1d, ME3, MN3a, MN3b, MO4. The report claims six. It cannot pass by construction.

### Other mutations re-run at HEAD

| Mutation | Killed | Named failure |
| --- | --- | --- |
| **MN1a**: `readableText` → `return value as string \| undefined` | **24** (23 unit + fuzz; report 22) | 20 × `unreadable set fields › …`, 3 × `unreadable entry fields › …`, `aggregateLogs … names a row from an unreadable exercise name` |
| **MN1c**: `textUnreadable` → `typeof value !== "string"` (absent read as unreadable) | **4** | `leaves an absent rawCell or notes as nothing recorded`, `treats a set as recorded when it has a raw cell, a weight, or reps`, `counts an entry as history when it has a recorded set or a note`, `skips an entry with no sets and no note` |
| **ME3**: `readableEntries` renumbers after filtering | **2** (1 unit + fuzz) | `keeps the readable entries of a log that also holds an unreadable one` |
| **MO4**: delete `logIdOrder` from `compareRowsChronologically` (`:237`) | **3** (2 unit + fuzz) | `keeps same-workout rows adjacent so one workout is one session`, `keeps two same-instant workouts apart when both log ids are numbers` |
| **M7-analogue**: `compareSetsByStrength(best, candidate) <= 0` → `< 0` (`:414`) | **1** | `keeps the earliest set when volume, load and reps are all equal` |

MN1b/MN1c together pin the absent-vs-unreadable line in **both** directions, matching MC1b/MC1c one level up. Neither side can drift silently.

### Hunt for more "passes for the wrong reason" tests

The brief asked me to assume more exist. I looked specifically for guards whose test could pass with the guard removed, and every guard I could name has a killing mutation above — MN1a/c/d/f/g/h/i/j/k, MC1b, ME3, MN2a, MN3a/b, MO1, MO4, M7, MI1a: **eighteen mutations, eighteen non-zero kills.** The only survivor in the module remains `ML1` (`labelOf` → plain `textOf`), which review 2 settled as unfalsifiable by construction and whose comment now names `identity.ts:170` as the external premise (`historyProjection.ts:275-280`), as asked.

The one weak-*fixture* observation I did find is MN1f's answer-first positioning, noted under Target 3. It is covered in aggregate by `:527`.

### Flake control spot-check

`src/components/catalog/ExerciseCorrectionSheet.test.tsx` → **23 passed, 23 total** at HEAD, matching the throwaway-worktree control at `e07d8fa`. The attribution to the sibling lane's `1671076` stands. I did not run `--maxWorkers=24`: two siblings hold uncommitted work in this worktree right now, so a load run would produce exactly the cross-lane misattribution the brief warns about, and no timeout was touched in this round (`git diff 0395f26..HEAD -- src/` contains none).

---

## For Task 13's brief

Consolidated and complete. Items 1-12 carry over from the previous two reviews with round 2's corrections folded in; 13-17 are new from this review. Task 13 should be written from this list.

1. **`ExerciseSessionRow` still has no `logId`** (`historyUtils.ts:4-9`), so the Today drawer cannot group by workout. Adding it is the prerequisite for items 2 and 3.
2. **`HistoryDrawer.tsx:67` renders `{rows.length} session{s} · last 8`** — rows are entries, so two workouts that each logged the exercise twice display as "**4 sessions**", and a workout logged twice displays as "3 sessions" for 2 workouts. Straight mislabel.
3. **Group same-workout rows visually.** Two rows from one workout currently render as two identical date blocks.
4. **`limit = 8` (`historyUtils.ts:246`) slices entries, not workouts**, so "· last 8" can show fewer than 8 workouts.
5. **`aggregateLogs.sessions` counts entries, not workouts** (`HistoryClient.tsx:95`, read at `:73` of the detail view and `:226-227` of the recent/stale filter). Pre-existing and still live. Adopt `VersionHistorySummary.sessionCount` / `sessionVolumesLb`; the `sessions > 3` recent/stale threshold shifts once corrected and needs re-picking.
6. **When you delete `aggregateLogs`, its guards go with it.** The replacement must read logs through `readableEntries` / `readableSets` / `entryPerformedName` / `textOf`, or the all-time History page reopens eight measured crashes.
7. **Key spaces must never be flattened, and keys can contain `#`.** After round 2's N2 revert: `family = {movementId} ∪ {exercise:<id>} ∪ {slot:<id>#<name>} ∪ {name:<name>#<name>}`; `version = {concreteExerciseId} ∪ {movement:<id>} ∪ {exercise:<id>} ∪ {slot:<id>#<name>} ∪ {name:<name>#<name>}`. A `movement:<id>` version key no longer carries `#`; the slot and name keys still do. **`push-up` still yields `familyKey === versionKey === "push-up"`** — namespace explicitly (`family:` / `version:`) at any shared boundary. **Any key reaching a URL, route param, fragment, `id` or `aria-*` must be `encodeURIComponent`d** — `#` truncates a URL at the fragment and is invalid unescaped in a CSS selector. Never build a selector from a raw key.
8. **Render `entryCount` alongside `sessionCount`** — the only field that lets the UI say "2 sessions, 3 entries" honestly.
9. **Family surfaces must not show PR, best set, or volume trend** (spec ~491). Do not compute them client-side from `rowsForIdentity`.
10. **`bestSetLabel` is fixed for bodyweight**, but `HistoryClient.tsx:88-90` still computes its own `best` by max volume with a first-wins tie. Adopt `VersionHistorySummary.bestSetLabel` and delete the duplicate. `deriveTrend` (`:37-47`) is likewise a duplicate of `historyUtils.deriveVolumeTrend`.
11. **Do not assume `logId#entryIndex` is a unique React key** unless the log list is de-duplicated upstream. Two distinct logs sharing an id is out of contract and still open (reviewer A6).
12. **Expect rows with `sets: []` and `volumeLb: 0` and `entryCount: 1`.** Reachable two ways now: an entry whose `sets` is present-but-unreadable, and a *readable* set whose only content is an unreadable `rawCell` or `notes`. Render a marker, not a blank line — a blank row reads as a rendering bug and invites the user to delete real data.
13. **An unreadable entry *element* gets no row**, by design. Surfacing "something unreadable was logged here" is a new display decision, not a projection change.
14. **Row labels can be nonsense and must not be trusted as names.** `performedName` can be a coerced non-string (`"7"`, `"[object Object]"`). A set label can be `"[object Object]x5"`, or a false `"BWx5"` when the stored weight is `NaN` (`historyUtils.ts:24-26` documents this deliberately). If the UI wants to say "this set is unreadable" it needs its own check — that is Task 13's decision.
15. **`aggregateLogs`' `exerciseId` can be a non-string at runtime** despite its type (`HistoryClient.tsx:70`, `canonicalExerciseId ?? exerciseId` verbatim). It survives as a React `key` because that coerces. Coerce it before any URL or selector.
16. **Volumes are always finite.** `sessionVolumesLb`, `volumeLb` and the trend can no longer be `NaN`, pinned by the losslessness test's finiteness assertion. A chart does not need to defend against it.
17. **NEW — two open Criticals in the surfaces Task 13 will replace. Do not adopt these code paths as-is.**
    - `aggregateExerciseHistory` (`historyUtils.ts:271`) throws on a non-string `performedDate`, and `HistoryDrawer.tsx:23` throws again on the same value at render. If Task 13 moves the drawer onto `projectExerciseHistory`, both go away — but `ExerciseHistoryRow.performedDate` (`historyProjection.ts:317`) is *also* `logLocalDate(log)` unguarded, so it can carry a non-string despite its type, and `latestDate` / `lastDate` on both summary types inherit it. **Coerce before rendering, or fix it at `:317`.** (See C-1 above; the projection itself never throws, so this is a rendering contract, not a crash, once the drawer moves.)
    - The day-hydration path (`WorkoutDayClient.tsx:666,678` and `sessionState.hydrateFromLog:63-83`) throws on shapes storage deliberately keeps, leaves `sessionMode` at `"loading"`, and thereby **silently disables autosave for that day while the grid still looks editable**. Measured: a whole workout typed in and never written. This is a write-path defect and needs its own ticket, not Task 13's backlog.

---

## Status

**CHANGES REQUESTED**

### Must change

1. **C-1 (Critical)** — `historyUtils.ts:263`: `date: textOf(logLocalDate(log))` in `aggregateExerciseHistory`, mirroring `HistoryClient.tsx:68` verbatim. A non-string `performedDate` on one log makes `b.date.localeCompare` throw at `:271`, `openHistoryFor` swallows it, and the Today drawer becomes an inert tap for **every** exercise. Same class, same value, same round that fixed it in the sibling aggregator. Test with **three or more** logs — a two-log fixture passes without the fix because of `localeCompare`'s one-sided coercion, the same trap the round already documented for `logId`. Add a `HistoryDrawer` render test for a non-string `date` too, or guarantee the type at the boundary.

### Must be ticketed before this branch merges (not Task 12's to fix)

2. **C-2 (Critical, new item)** — the day-hydration path silently discards newly logged work. `WorkoutDayClient.tsx:666,678` + `sessionState.ts:63-83` throw on a non-string `performedAt`, `entries: [null]`, `entries: "corrupt"`, a non-array `sets`, and a non-numeric `setNumber`; `sessionMode` stays `"loading"`, `saveCells` early-returns at `:710`, and the grid still renders editable. Measured: 225x5 typed into a live-looking grid, never written to storage. Also writes a phantom `exerciseId: "undefined"` entry when `entries` is a string. Fix with the guards that already exist in this lane, **and** make a hydration failure still call `setSessionMode("active")` so saving can never be silently disabled.

### Minor, not blocking

3. **M-1** — `ProgramDetailClient.tsx:143` `getDayBadge` has the same unguarded `localeCompare`; a render throw with no error boundary.
4. **The "72 cycles" figure in the report does not reproduce** (I measure 24 for that pool shape, 9 for the shipped fixture's own 8 values). The claim it supports is correct and the pin is real; the number needs its pool and counting rule stated, or removing.
5. **MN1f's fixture puts the expected answer first.** Not weak in aggregate (`:527` covers the direction), but `[{reps:{}}, {reps:8}, {reps:3}] → "BWx8"` would be the stronger single fixture. Confirmed the current code produces it.

### Verified but could NOT falsify — the implementer is right about these

- **Target 3, against the previous review.** An unreadable `weight` does **not** make every clause `NaN`: the reps clause reads `reps`, so `a || b || c` returns a real number and best stays the earliest set (measured: best = the earliest set in both positions I tried). The real harm is a `NaN` session volume; the last-set shape needs an unreadable **reps** on sets whose loads tie. `historyProjection.ts:261-263`, `historyUtils.ts:46-58`. MN1d kills 4, MN1f kills 1. Review 2's mechanism is refuted.
- **Target 4's load-bearing claim.** 0 cycles over an 11-value ISO+garbage pool under the pre-round comparator; the shipped fixture's own 8 values contain 9; MO1 kills the new pairwise test. N6 is pinned, and the permutation test's comment now correctly claims stability, not transitivity.
- **Target 1.** All eight shapes closed, the guards are the same helpers rather than a second rule, no storage import, and `sessions`, the grouping and the first-wins tie are byte-identical to `0395f26`. The two non-guard edits (`[...s.sets]`, `|| "—"`) are unreachable from healthy data and one of them is pinned.
- **N2's revert.** MI1a still kills 5, so C2/I1's slot behaviour survived the narrowing; MN2a kills 2. **No existing test was changed** — verified by diff: exactly two removed lines across all test files this round, both import expansions.
- **N3.** Struck through and corrected in place at `task-12-report.md:420`. MN3b, the exact half-fix a reader would write, kills 3.
- **N4.** Both stale counts corrected in place with their baselines; MI1a = 5 and MC1b = 5 (4 unit + fuzz) at HEAD.
- **The losslessness fuzz is not vacuous.** Independence is visible in the file (`:53-90`) and proven by **seven** killing mutations, one more than claimed.
- **Eighteen mutations, eighteen non-zero kills.** Every guard in the two projection modules is pinned in at least one direction, and the absent-vs-unreadable line is pinned in both at every level. The only survivor is `ML1`, settled in round 2 as unfalsifiable by construction, whose comment now names its external premise.
- **The flake attribution.** `ExerciseCorrectionSheet.test.tsx` is 23/23 at HEAD, matching the control.

### What I could not falsify but also could not fully drive

`ProgramDetailClient.getDayBadge` (M-1): the expression provably throws, and I read the unconditional render at `:453`, but my component probe did not reach the week view, so the end-to-end consequence is inferred rather than measured.
