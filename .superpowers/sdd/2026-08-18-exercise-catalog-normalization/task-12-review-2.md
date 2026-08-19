# Task 12 re-review — fix round 1

Reviewer lane: `src/lib/workout/**`, `src/components/workout/**`. Commits `202ff2a`, `0bc9563`, `258e177`, `48968cd`, `3a08442`, `f3fc976`, `218e212`, report `a8007a0`.

Lane baseline reproduced exactly as reported: **33 suites / 379 tests green** (`bun run test -- src/lib/workout src/components/workout --runInBand`). I did not run the full unit suite or e2e — the controller owns those gates and confirmed them.

Every mutation below was applied singly, the lane suite run, then all five files restored from byte copies and re-verified:

```
$ shasum -c baseline.sha
src/lib/workout/historyProjection.ts: OK
src/lib/workout/historyUtils.ts: OK
src/lib/workout/historyProjection.test.ts: OK
src/lib/workout/historyUtils.test.ts: OK
src/components/workout/HistoryClient.aggregateLogs.test.ts: OK
```

Headline: **the three contested claims are all correct — the implementer wins all three arguments, two of them against my own previous findings.** But the round's own hunt for the "unreadable value must not hide readable data" class stopped one level short, and the miss crashes both shipped history surfaces. That plus one healthy-data grouping change is why this is CHANGES REQUESTED rather than APPROVED.

---

## 1. Per-item verdicts

### C1 (Critical) — unreadable `sets`: **FIXED, and the deviation was right**

`readableSets` / `setsUnreadable` (`historyUtils.ts:68-84`) restate `v10Identity.ts:158`'s rule locally rather than importing it, which is forced by the no-storage-import seam and is documented as such. All five shapes behave as the ruling requires: nothing throws, and the readable sibling entry always survives.

Pinned in both directions, which is what makes it a real fix rather than a one-sided guard:

| Mutation | Killed | Named failure |
| --- | --- | --- |
| MC1b: `setsUnreadable` → `return false` | **4** | `rows an entry whose sets is a string / a number / an object`, `rows an entry whose only set element is unreadable, with no fabricated set` |
| MC1c: `setsUnreadable` → `!Array.isArray(entry.sets)` (absent read as unreadable) | **2** | `keeps the readable entry when a sibling's sets is undefined`, `… is null` |

MC1b pins "present-but-unreadable earns a row"; MC1c pins "absent earns no row". Neither direction can drift silently. (Report said MC1b kills 3; at HEAD it kills 4 — the extra kill is a test added later in the round. See Minor N4.)

### C2/I1 (Important) — two exercises in one slot: **FIXED for the slot case**

`unresolvedKey` (`historyProjection.ts:110-113`) qualifies the standalone key with the normalized performed name; `identity.ts` untouched; `familyKeyForIdentity` short-circuits on `concreteExerciseId` so `exercise:<id>` families are unchanged.

`MI1a` (`unresolvedKey` → `return identity.groupKey`, i.e. pre-fix behaviour) kills **5** at HEAD: both new slot tests, `unresolved records › keeps an unknown canonical id visible…`, `shared projection boundary › keeps both entries…`, and `unreadable entry fields › keeps a readable set that sits beside an unreadable one`. The over-split guard (`still groups repeats of the same performed name in one slot together`, killed by MI1c) is the right companion test.

The **broadening** of the same change to `movement:<id>` version keys is not fine — see Important N2.

### I2 + M-b (Important) — best-set total order: **FIXED, all four levels pinned**

`compareSetsByStrength` (`:224-228`) implements the controller's ruling literally: volume desc → load in lb desc → reps desc, with `<= 0` in the reduce (`:374`) resolving a full tie to the earliest set. Each level has its own kill, and each fixture puts the expected answer *second*, so none can pass on position:

| Mutation | Killed | Named failure |
| --- | --- | --- |
| M7-analogue: `compareSetsByStrength(best, candidate) <= 0` → `< 0` | **1** (was 0 of 203) | `keeps the earliest set when volume, load and reps are all equal` |
| MB2: delete the load clause | **2** | `breaks an equal-volume tie by the heavier load`, `compares the load tiebreak in pounds, not raw numbers` |

The dead M7 from the first review is now genuinely dead-no-longer: the same mutation that killed 0 of 203 kills 1 of 379. The units test (`100kg` logged second, both sets volume 0) is well built — neither a raw-number comparison nor the earliest-set fallback can produce its expected answer.

`compareSetsByStrength` is a total order over readable numeric sets (lexicographic composition of three numeric comparisons). One soft edge: a set with a non-numeric `weight` makes every clause `NaN`, so the reduce always prefers the candidate and "best" becomes the *last* set. It cannot lose data and the row order feeding it is now deterministic, so this is cosmetic — Minor N5.

### M-a (Minor, raised) — **the implementer is right and I was wrong. Recorded.**

See §2.1. The line stays; the comment now records a measured kill instead of a measured survival.

### M-c (Minor) — ordering: **FIXED, and it is a genuine total order**

`performedAtOrder` (`:176-185`) maps unparseable to `-Infinity` and applies the string tiebreak on *every* path. I verified the total-order property directly rather than trusting the permutation test:

- **Pairwise consistency at n=8** over a mixed set (`"2026-06-01T…"`, `"not a date"`, `"zzz"`, `"aaa"`, `"42"`, the number `42`, two valid stamps): every one of the 56 ordered pairs sorts the same way the global 8-log order does — **0 inconsistent pairs**. Under the pre-round comparator (MO1) this same probe **fails**.
- **Permutation invariance at n=12** (200 random shuffles, mixed valid/unparseable/duplicate stamps): 1 distinct order, 12 rows every time.
- **n=40, 400 random shuffles** (past V8's 22-element insertion-sort threshold): 1 distinct order.

`MO1` (restore the pre-round intransitive comparator) kills **2**: `sorts rows with an unparseable timestamp oldest`, `returns the same order for every input permutation`.

### Extra hardening beyond the review — **in scope, and it follows the same rule**

`readableEntries` (`historyUtils.ts:148-157`), `entryNote`, `entryPerformedName`, `textOf`. Judgement: **this was in scope and should have been in my C1.** The C1 finding was not "the `sets` field is unguarded", it was "an unreadable value that storage deliberately preserves removes readable history from view"; the other six shapes are the same defect, and five of them threw out of the *live drawer* too. Closing them was correct, not creep.

Each guard follows the same absent-vs-unreadable line rather than inventing a new one, and I checked that specifically:
- `readableEntries`: a non-array `entries` yields no rows (absent-like, no throw); unreadable *elements* are skipped. Consistent.
- `entryNote` / `entryPerformedName`: a non-string is treated as absent for *rendering*, while `setsUnreadable` still makes the entry data-bearing when its sets are unreadable. So an entry with a garbage note and garbage sets still gets a row; an entry with only a garbage note gets none, which matches "a note-only entry with nothing readable in it has nothing to show".
- **Stored index preserved** — verified, not assumed. `ME3` (renumber after filtering) kills **1** (`keeps the readable entries of a log that also holds an unreadable one`), and my fuzz (§4) independently asserts row identities equal the *stored* positions across 300 randomized corpora containing `null` entries. `logId#entryIndex` identity is intact.
- `ME1` (drop the `Array.isArray(log.entries)` guard) kills **6**, including `keeps the drawer path readable too`.

The decision **not** to row an unreadable entry *element* is right: there is nothing to key, label, or date such a row from, and every sibling survives.

---

## 2. The three contested claims — adjudicated

### 2.1 The M-a reversal: **the implementer is right; my finding was a test gap, not dead code**

This is the important one, so here is the evidence rather than the reasoning.

`compareRowsChronologically` (`historyProjection.ts:206-210`) keeps `|| left.logId.localeCompare(right.logId)`. Deleting it (MO4 = my M5):

```
● deterministic ordering with unreadable timestamps › keeps same-workout rows adjacent so one workout is one session
      Object {
        "entryCount": 4,
    -   "sessionCount": 2,
    +   "sessionCount": 4,
        "sessionVolumesLb": Array [
    -     1000, 1000,
    +     500, 500, 500, 500,
```

Kills **1** of 379 — and my own independent fuzz (§4), which asserts `sessionCount === new Set(rows.map(logId)).size` over 300 random corpora, **also fails** under MO4 (`Expected 2, Received 3`). Two unrelated harnesses agree.

**Why my reasoning was wrong.** I argued the earlier `compareRows` sort plus `Array.prototype.sort` stability already guaranteed adjacency. Stability only preserves relative order for elements the comparator calls *equal*; `compareRowsChronologically` negates the `performedAt` key, so it actively reorders and the pre-sort's order is not preserved. When two logs share one instant, the first key ties for rows from different logs and `entryIndex` interleaves them (`l-x#0, l-y#0, l-x#1, l-y#1`), and the bucketing loop at `:355-368` — which merges only *adjacent* same-log rows — splits one workout into one session per entry.

So this is exactly the distinction the standards turn on: **"no mutation kills this" was a test gap, correctly re-diagnosed.** Live code, now pinned by a test killed by two mutations (MO4 and MO5). Please record it; it should stop being an open question.

### 2.2 Scope creep — warranted, **except for one broadening that is not in the same class**

The entry/entries/field hardening: in scope, same rule, verified above.

The `unresolvedKey` broadening to `movement:<id>` keys: **not the same call, and it is wrong as it stands.** Full finding at N2 below.

### 2.3 `unresolvedKey` also qualifying `movement:<id>` keys: **this one splits something it should not**

The implementer flagged it as broader than the review's letter and uncovered by any test. It is broader, and it is a real split. Measured with the shipped catalogue's own facts — see N2.

---

## 3. ML1 — category call: **unfalsifiable by construction**, but keeping it is harmless and the disclosure is exemplary

`labelOf` (`:242-244`). `ML1` (`labelOf` → plain `textOf`) kills **0 of 379**, confirmed.

The by-construction argument holds, and I checked it at the source rather than accepting it. For `kind: "stored-exercise"`, `displayLabel` is nullish in exactly one place — `standaloneResult` (`src/lib/catalog/identity.ts:170`, `input.performedName ?? input.canonicalExerciseId ?? input.slotId`) — and only when all three are nullish. The other three constructors always set it (`:156` `resolved.item.name`, `:206-210` `performedName ?? rule.normalizedName`, `:237-239`). When all three are nullish, `row.performedName` (`:297-299`) is `""` as well, so `labelOf(undefined) ?? ""` and `textOf(undefined)` both produce `""`. I hunted for a falsy-but-textual exception (`slotId` of `0`, `false`, `NaN`, `""`, a non-string `exerciseName`, a numeric `canonicalExerciseId`) — because `??` does not treat `0` as absent, `displayLabel` is `0` in those cases and both branches yield `"0"`. Nine probes, zero observable differences.

**Category: by construction** — so under the letter of the standing rule it is deletable dead code. I am *not* asking for its deletion, for one reason: the construction guarantee lives in `identity.ts`, another lane's file, whose `displayLabel` derivation could change without a single test in this lane noticing. That makes it materially different from the rule's example (a local check on a field overwritten a few lines later). Since the two branches are provably indistinguishable, keeping it costs nothing and deleting it gains nothing.

The handling is the right one either way: the implementer published the gap in the code comment, the test comment, and the report instead of claiming coverage. One improvement: the comment should name the external guarantee (`identity.ts:170`'s `??` chain) as the thing that makes it unfalsifiable, so a future reader can re-check the premise instead of re-deriving it. Minor.

---

## 4. Losslessness — re-verified against the changed code

**Holds.** The changed sorting and keying are where a regression would hide, so I attacked them directly with a randomized differential harness rather than more hand fixtures.

**Fuzz** (300 randomized corpora; 1-5 logs each; deliberately colliding `performedAt` instants; entries drawn from `null`, empty `sets`, `sets: "corrupt"`, `sets: [null]`, note-only, bodyweight, twice-logged same version, `sets: undefined`; mixed canonical ids and absent names). For every corpus, with the data-bearing set computed independently of the module:

1. `rows` identities equal exactly the expected `logId#entryIndex` set — no drop, no duplicate, no renumbering.
2. `rowsByFamilyKey` and `rowsByVersionKey` each partition the same set exactly once.
3. `Σ entryCount === rows.length`.
4. Per version: `sessionCount === distinct logIds`, `sessionVolumesLb.length === sessionCount`, and `Σ sessionVolumesLb === Σ row.volumeLb` to 6 dp — so no volume is dropped or double-counted in bucketing.
5. Per family: `workoutCount === distinct logIds`.

The fuzz is **not vacuous**: it fails under MO4 (session bucketing) and under MC1b (`setsUnreadable → false` drops the unreadable-sets rows).

Re-run first-review attacks: A1 (inconsistent comparator) now sorts deterministically; A2 splits correctly; A3 dataless-set-beside-real-set still fine; A4 bodyweight now ranks by reps; A6 (same log twice) still duplicates row identity, still out of contract, still Task 13's note.

**No input I could construct hides a set the user logged.** The three throws below destroy *visibility of everything*, which is the same harm by a different route, and they are the reason for CHANGES REQUESTED.

---

## 5. NEW findings

### N1 (Critical) — a non-string `rawCell` or set-level `notes` still destroys all history, and crashes both shipped history surfaces

The round closed the entry level and stopped there. One level down, two dereferences are unguarded:

- `historyUtils.ts:42` — `Boolean(s.rawCell?.trim())` in `setHasData`
- `historyUtils.ts:46` — `Boolean(s.notes?.trim())` in `setHasData`
- `historyUtils.ts:18` — `if (s.rawCell && s.rawCell.trim())` in `formatSetLabel`

Measured, one corrupt field inside one otherwise-readable set record, beside a healthy workout:

```
set.rawCell = 7    projection -> THREW s.rawCell?.trim is not a function   (all history, every exercise, gone)
set.rawCell = {}   projection -> THREW s.rawCell?.trim is not a function
set.notes = 7      projection -> THREW s.notes?.trim is not a function
```

And with the corrupt set inside a **matching** entry, the live Today drawer path goes down too:

```
aggregateExerciseHistory([log], "slot", highBar.id)  -> THREW s.rawCell.trim is not a function
projectExerciseHistory([log], context)               -> THREW s.rawCell.trim is not a function
```

`HistoryClient.tsx:27` also calls `formatSetLabel`, so the all-time page has the same crash. This is the *same* defect class the round exists to close, on the *same* rule: `appDb.ts:186-195` never inspects a set record's fields, so whatever is inside one is preserved verbatim, and a value we cannot read must not remove readable history from view. The internal inconsistency makes the case by itself — **`entry.notes: 7` was fixed (`entryNote`, MF3 kills 2) while `set.notes: 7` still throws.** Same field name, same class, one guarded and one not.

**Required fix.** Read both string fields through a text guard in `formatSetLabel` and `setHasData`, on the same absent-vs-unreadable line: a non-string `rawCell` is unreadable, so the *set* has data (do not drop it) but produces no label. Tests per shape in both the projection and the drawer path, mirroring the existing `unreadable entry fields` block. `s.weight`/`s.reps` need no guard — a non-numeric weight yields `NaN`/`"[object Object]x5"` but never throws (measured); see N5.

### N2 (Important) — the `unresolvedKey` broadening splits one underspecified movement into several version histories

`versionKeyForIdentity` (`:125`) applies `unresolvedKey` to *every* identity without a `concreteExerciseId`, including underspecified ones whose `groupKey` is `movement:<id>`. The shipped catalogue makes this concrete: `src/lib/catalog/importDisambiguations.generated.json` gives movement `squat` **four** underspecified names — `back squat`, `barbell back squat`, `squat`, `squats` — i.e. the catalogue itself declares them the same thing at the same specificity.

Measured, one slot, three workouts, progressive load, with those rules in the context:

```
AFTER  (HEAD)
  movement:squat#back squat  sessions=1  best=310x5  vols=[1550]  trend=flat
  movement:squat#squats      sessions=1  best=305x5  vols=[1525]  trend=flat
  movement:squat#squat       sessions=1  best=300x5  vols=[1500]  trend=flat

BEFORE (MI1a applied)
  movement:squat             sessions=3  best=310x5  vols=[1500,1525,1550]  trend=flat
```

A user who types "Squat" some weeks and "Squats" others now gets two or three version cards, each with its own PR and its own one-session trend, where before there was one history with a real progression. `familyKey` is still the bare `movementId`, so nothing becomes invisible and losslessness is untouched — this is fragmentation, not loss, hence Important rather than Critical. But it is a **healthy-data grouping change** (an underspecified name is healthy data, not corruption), it is broader than C2/I1 asked for, and the implementer states plainly that no test covers it. `Healthy-data behaviour must not change unless your task explicitly owns that change` is the applicable standard.

The C2/I1 argument does not carry over. For `slot:<slotId>` the key ignores the performed name entirely and two *different exercises* collapse. For `movement:<id>` the key already names what the identity resolved to, and the performed names it splits on are synonyms the catalogue has deliberately unified.

**Required fix** — restrict the qualifier to identities with no movement:

```ts
export function versionKeyForIdentity(identity: ExerciseIdentityResult): string {
  if (identity.concreteExerciseId) return identity.concreteExerciseId;
  // A movement-level identity is already named by its movement. Qualifying it
  // with the performed name would split "Squat" from "Squats", which the
  // catalogue's own underspecified rules declare the same movement.
  if (identity.movementId) return identity.groupKey;
  return unresolvedKey(identity);
}
```

Test: two logs in one slot, "Squat" and "Squats", both underspecified to movement `squat` → **one** version summary, `sessionCount: 2`, two session volumes. Confirm it fails with the `movementId` line removed. If the controller prefers to keep the split, it needs a ruling and a test either way — the current state is an unpinned behaviour change.

### N3 (Important) — a non-string `log.id` throws, contradicting a claim in the report

The report's deferred list says a non-string `log.id` "cannot throw and cannot lose data". Measured, two logs sharing one instant, ids `1` and `2`:

```
numeric log.id, same instant        -> THREW left.logId.localeCompare is not a function
numeric log.id, different instants  -> rows=2 (fine)
```

`historyProjection.ts:190` and `:208` call `left.logId.localeCompare(...)` raw. The tiebreak only runs when the `performedAt` key ties, which is why the round's own new test `keeps rows whose performedAt is not even a string` passes — its fixture's ids happen to be strings. The inconsistency is two lines apart: `performedAtOrder` already coerces with `String(...)` at `:184` for exactly this reason, and the id right beside it does not.

**Fix:** `String(left.logId).localeCompare(String(right.logId))` in both comparators, plus a test with two logs at one instant, one carrying a numeric id, asserting both rows survive.

### N4 (Minor) — two reported mutation counts are stale relative to HEAD

`MI1a` kills 5 at HEAD (report: 4) and `MC1b` kills 4 (report: 3). Both are explained by tests added later in the round, and both are *higher*, so nothing is overstated. Worth a note only because the standard is "the exact mutation beside the count" — the count also needs the baseline it was taken at, or a re-measure at HEAD.

### N5 (Minor) — `NaN` in `compareSetsByStrength`

A set with a non-numeric `weight` (`{}`) makes every clause `NaN`, so `NaN <= 0` is false and the reduce always takes the candidate: "best set" becomes the *last* set, and its label renders `"[object Object]x5"`. No throw, no loss, and the input order is now deterministic. If N1 is fixed with a shared text/number guard, this can go with it.

### N6 (Minor) — the permutation test does not pin what its comment claims

The implementer's honesty note is right, and **understated**. I ran exhaustive permutations under the *pre-round* intransitive comparator at n=3 (6), n=4 (24), n=5 (120), n=6 (720) and 400 random shuffles at n=40: **every case produced exactly 1 distinct order.** V8 never exposes the intransitivity here, so `new Set(orders).size === 1` cannot fail for that reason at any size I could reach — the report says the permutation test "pins the total-order property directly", and it does not. The literal-order assertion carries the whole RED.

If a real pin is wanted, the pairwise-vs-global check from §1's M-c entry is cheap (about 15 lines) and **does** fail under MO1. Otherwise the test's comment should say it pins output stability, not transitivity.

---

## 6. Mutation evidence

15 mutations re-run at HEAD, each named beside its count, lane = 33 suites / 379 tests. All files restored and `shasum -c`-verified after every one.

| # | Exact mutation | Killed | Named failure | vs report |
| --- | --- | --- | --- | --- |
| MO4 | delete `\|\| left.logId.localeCompare(right.logId)` from `compareRowsChronologically` (`hProjection.ts:208`) | **1** | `keeps same-workout rows adjacent so one workout is one session` (`sessionCount 4` not 2) | matches |
| MC1b | `setsUnreadable` → `return false` (`hUtils.ts:80`) | **4** | 3 × `rows an entry whose sets is …` + `rows an entry whose only set element is unreadable` | report 3 (stale) |
| MC1c | `setsUnreadable` → `!Array.isArray(entry.sets)` | **2** | `keeps the readable entry when a sibling's sets is undefined / null` | matches |
| MI1a | `unresolvedKey` → `return identity.groupKey` (`:110`) | **5** | both slot tests + `unresolved records › keeps an unknown canonical id…` + `shared projection boundary…` + `keeps a readable set that sits beside an unreadable one` | report 4 (stale) |
| ME1 | `readableEntries`: delete `if (!Array.isArray(log.entries)) return []` (`hUtils.ts:149`) | **6** | 5 × `keeps every other workout's history when one log's entries is …` + `keeps the drawer path readable too` | matches |
| ME3 | `readableEntries` renumbers indices after filtering | **1** | `keeps the readable entries of a log that also holds an unreadable one` | matches |
| MF5 | `allSets` → `item.entry.sets ?? []` (`:370`) | **1** | `keeps a readable set that sits beside an unreadable one` | matches — repair confirmed |
| MF6 | drop `textOf` from the row label fallbacks (`:298-299`) | **1** | `labels a row from an unreadable slot id as text` | matches — repair confirmed |
| ML1 | `labelOf` → plain `textOf` (`:243`) | **0** | — (see §3) | matches |
| M7-analogue | `compareSetsByStrength(best, candidate) <= 0` → `< 0` (`:374`) | **1** | `keeps the earliest set when volume, load and reps are all equal` | matches (was 0 of 203) |
| MB2 | delete the load clause from `compareSetsByStrength` (`:226`) | **2** | `breaks an equal-volume tie by the heavier load`, `compares the load tiebreak in pounds, not raw numbers` | matches |
| MO1 | restore the pre-round intransitive `performedAtOrder` | **2** | `sorts rows with an unparseable timestamp oldest`, `returns the same order for every input permutation` | matches |
| MO4 (fuzz) | same as MO4, judged by my independent fuzz | fails | `sessionCount` 3 vs 2 distinct logs | new — cross-check |
| MC1b (fuzz) | same as MC1b, judged by my independent fuzz | fails | expected identity set mismatch | new — cross-check |
| MO1 (pairwise) | same as MO1, judged by my pairwise-consistency probe | fails | pairwise order disagrees with global | new — cross-check |

MF5 and MF6 are the two the implementer disclosed as initially surviving. **Both repairs are real** — each now kills, and MF6's killing test asserts `typeof … === "string"` on the coerced label rather than just its value, so it cannot pass on a coincidence.

**Existing assertions:** the complete set of deleted lines across all three touched test files is four, and they are exactly the four key literals the report declares (`slot:slot-mystery` × 3 in `historyProjection.test.ts`, `slot:bench` × 1 in `HistoryClient.aggregateLogs.test.ts`). Nothing else was weakened, relaxed, or removed:

```
$ git diff 479e468..HEAD -- <the three test files> | grep '^-' | grep -v '^---'
-    expect(projection.versionSummaries.get("slot:bench")).toMatchObject({
-    expect(familyKeyForIdentity(identity)).toBe("slot:slot-mystery");
-    expect(versionKeyForIdentity(identity)).toBe("slot:slot-mystery");
-    expect(projection.familySummaries.get("slot:slot-mystery")).toMatchObject({
```

**Fixture coincidence check** on the new fixtures: `1000/1000` in the adjacency test are equal by design (identical entries), and the assertion that carries it is `sessionCount: 2` against `entryCount: 4`, which no merge or split can satisfy accidentally; the `720/720` pair in `ranks by set volume first` is a deliberate tie the 1600 answer must beat. No new fixture makes two independently-computed numbers agree by accident.

**Flake control:** not re-run. Three lanes share this worktree, so a `--maxWorkers=24` full-suite run would produce exactly the cross-lane misattribution the brief warns about, and the controller owns that gate. The control itself is sound — a throwaway worktree at `479e468` with none of the changes, same timeout shape, failing set a strict superset — and no timeout was touched (`git diff 479e468..HEAD -- src/` contains no timeout change).

---

## 7. For Task 13's brief

Replaces the first review's list; items 1-9 carry over, with the changes the implementer flagged folded in.

1. **`ExerciseSessionRow` still has no `logId`,** so the Today drawer still cannot group by workout, and `HistoryDrawer.tsx:66` still renders `{rows.length} sessions` — observed "3 sessions" for 2 workouts. Slightly easier now: `aggregateExerciseHistory` no longer throws on a corrupt `entries` list, so the drawer can move onto `projectExerciseHistory` without inheriting a crash path. (It *can* still throw on a corrupt `rawCell` until N1 is fixed.)
2. **Group same-workout rows visually.** Two rows from one workout render as two identical date blocks.
3. **`limit = 8` slices entries, not workouts,** so "· last 8" can show fewer than 8 workouts.
4. **Replace `aggregateLogs` — its `sessions` count is a live bug.** `HistoryClient.tsx:52,70` counts entries. Adopt `VersionHistorySummary.sessionCount` / `sessionVolumesLb`. The recent/stale filter at `:320-321` (`sessions > 3`) shifts once corrected. Unchanged and still pre-existing.
5. **Never share a key space between family and version, and now assume keys can contain `#`.** The spaces are `family = {movementId} ∪ {exercise:<id>} ∪ {slot:<id>#<name>} ∪ {name:<name>#<name>}` and `version = {concreteExerciseId} ∪ {movement:<id>[#<name>]} ∪ {exercise:<id>} ∪ {slot:<id>#<name>}`. `push-up` still yields `familyKey === versionKey === "push-up"`. Namespace explicitly (`family:` / `version:`) at any shared boundary. **Any key reaching a URL, a route param, a fragment, or an `id`/`aria-*` attribute must be encoded** — `#` truncates a URL at the fragment and is invalid unescaped in a CSS selector. `encodeURIComponent` on the way out, decode on the way in, and never build a selector from a raw key.
6. **Render `entryCount` alongside `sessionCount`** — the only field that lets the UI say "2 sessions, 3 entries" honestly.
7. **Family surfaces must not show PR, best set, or volume trend** (spec ~491). Do not compute them client-side from `rowsForIdentity`.
8. **`bestSetLabel` is fixed for bodyweight** (reps break a no-load tie), but `HistoryClient.tsx:63-65` still computes its own `best` with `find` on max volume and keeps the old first-wins tie. Adopt `VersionHistorySummary.bestSetLabel` and delete the duplicate.
9. **Do not assume `logId#entryIndex` is a unique React key** unless the log list is de-duplicated upstream.
10. **Expect rows with `sets: []` and `volumeLb: 0`.** An entry whose `sets` is present but unreadable now earns a dated row deliberately, so the user can see something was logged there. Render a marker, not a blank line — a blank row reads as a rendering bug and invites the user to delete real data.
11. **Rows can carry a `performedName` that came from a coerced non-string** (`"7"`, `"[object Object]"`). Do not assume a row label is a plausible exercise name.
12. **An unreadable entry *element* gets no row** by design. If Task 13 wants to surface "something unreadable was logged here", that is a new display decision, not a projection change.

---

## Status

**CHANGES REQUESTED**

**Must change:**

1. **N1 (Critical)** — guard `s.rawCell` and `s.notes` in `formatSetLabel` (`historyUtils.ts:18`) and `setHasData` (`:42`, `:46`). A single non-string `rawCell` throws out of `projectExerciseHistory` **and** out of `aggregateExerciseHistory`, so all history for every exercise disappears and both shipped surfaces (`WorkoutDayClient` drawer, `HistoryClient` via `:27`) crash. Same rule, same citations, same class as the six shapes already closed — and the round already fixed the entry-level `notes` while leaving the set-level one open. Tests per shape in both paths.
2. **N2 (Important)** — stop qualifying `movement:<id>` version keys with the performed name (`historyProjection.ts:125`). Measured: one underspecified squat logged as "Squat" / "Squats" / "Back Squat" now produces three one-session version summaries with three separate PRs instead of one history with a progression, on names the shipped catalogue's own disambiguation rules declare identical. Add the "Squat"/"Squats" merge test either way; the current behaviour is an unpinned healthy-data change.
3. **N3 (Important)** — coerce the `logId` tiebreak with `String(...)` in both comparators (`:190`, `:208`), matching what `performedAtOrder` already does two lines away at `:184`. Two logs at one instant with a non-string id throw out of the whole projection. Correct the report's "cannot throw" claim.

**Minor, not blocking:** N4 (re-measure or date the two stale counts), N5 (fold the `NaN` weight case into N1's guard), N6 (the permutation test's comment overstates what it pins — either add the pairwise check or soften the comment), and add `identity.ts:170` to `labelOf`'s comment as the external premise its by-construction argument rests on.

**Verified but could NOT falsify — the implementer is right about all of these:**

- **The M-a reversal.** My M5 finding was wrong: the `logId` tiebreak in `compareRowsChronologically` (`:208`) is live code. Deleting it gives `sessionCount: 4` for 2 workouts, killed by the new test and independently by my fuzz. A "no mutation kills this" correctly re-diagnosed as a test gap, not dead code.
- **The absent-vs-unreadable deviation.** Correct at `v10Identity.ts:158` and consistent with the ledger. The critical property holds in all five shapes: nothing throws, the readable sibling always survives, and both directions of the line are pinned (MC1b 4, MC1c 2).
- **The best-set total order.** All four levels pinned (M7-analogue 1, MB1-4), every fixture positioned so the answer is not the first set.
- **The comparator is now a genuine total order.** 0 inconsistent pairs of 56 at n=8 over mixed valid/unparseable/non-string stamps; 1 distinct order over 200 shuffles at n=12 and 400 at n=40; the pre-round comparator fails the pairwise check.
- **The M-c honesty note**, and then some: the permutation assertion is green under the *old* comparator at n=3, 4, 5, 6 exhaustively and n=40 randomly. The literal-order assertion carries the entire RED, exactly as disclosed.
- **Losslessness.** 300 randomized corpora with colliding instants and eight entry shapes: row identities equal the data-bearing set exactly, stored `entryIndex` preserved, one family and one version bucket per row, `Σ entryCount === rows.length`, `Σ sessionVolumesLb === Σ row.volumeLb`, `sessionCount === distinct logIds`. Fuzz proven non-vacuous (fails under MO4 and MC1b).
- **The extra hardening was in scope**, follows the same rule at every level, and preserves `logId#entryIndex` identity (ME3 kills).
- **Both self-disclosed weak tests (MF5, MF6) are genuinely repaired**, and the near-miss `textOf`/`labelOf` bug is correctly fixed — the coercion runs and the fall-through survives.
- **No existing assertion was weakened or deleted.** Exactly four removed lines across three test files, all four the declared key literals.
