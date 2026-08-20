# Task 14 report — audit and live-invalidation verification

Branch `feat/exercise-catalog-normalization`, worktree
`/Users/djdjo/Documents/mine/trAIner/.worktrees/exercise-catalog-normalization`.
Start `709131c` (107 suites / 1,621 tests). End `a3a985b` (110 suites / 1,657 tests).

**e2e not run — controller instruction.** Specs that must be in Task 15's single
serial run are named in the final section.

---

## 1. The enumeration — what was audited, and how

The plan supplies one `rg` and a 13-entry table. Both were used as a floor. What
follows is every sweep run, the command, and what it returned.

### 1.1 Sweeps run over `src/`

| # | What | How | Result |
|---|---|---|---|
| S1 | The plan's mandated pattern | `rg -n 'exerciseCatalog\.(find\|filter\|flatMap)\|catalogIndex\.get\|canonicalExerciseId \?\? .*exerciseId\|entries\.find\|\.canonicalExerciseId\)' src --glob '!**/*.test.*'` | 21 hits, 13 files |
| S2 | Every importer of the catalogue module | `rg -ln 'from "@/lib/catalog/exercises"\|from "\./exercises"'` | 16 files (2 type-only) |
| S3 | Every mention of the `exerciseCatalog` symbol | `rg -n '\bexerciseCatalog\b'` | 12 files that reference it at runtime |
| S4 | The forbidden grouping shape, newline-tolerant | `rg -nU --multiline 'canonicalExerciseId\s*\?\?\s*[^;\n]*(exerciseId\|slotId\|\.id)\b' src` | 2 hits, **both prose comments**; zero in code |
| S5 | Every `exerciseId` read in history/analysis | `rg -n 'exerciseId' src/lib/workout src/components/workout src/lib/analysis src/lib/analytics` | all are slot-id plumbing into the resolver's `slotId` input |
| S6 | Registry/redirect/disambiguation imports | `rg -n 'legacyRedirects\|importDisambiguations\|movements.generated\|modifiers.generated'` | only `registries.ts` |
| S7 | The raw event string | `rg -n 'trainer-exercise-identity-changed' src e2e` | 1 production file (`identityEvents.ts`); every other hit is a test spelling the literal on purpose |
| S8 | Uses of the constant | `rg -n 'EXERCISE_IDENTITY_CHANGED_EVENT'` | dispatcher + one listener |
| S9 | Dispatch sites | `rg -n 'dispatchExerciseIdentityChanged\|dispatchAfterWrite'` | 9 production sites, enumerated in §3 |
| D1 | Unique indexes | `rg -n 'createIndex\(' src` | `{ unique: true }` appears on `by-normalized-alias` and nowhere else |
| D2 | `IDBObjectStore.add()` | `rg -n '\.add\(' src --glob '!**/*.test.*'` | 17 hits, **all `Set.prototype.add`**; no store `add()` |
| D3 | `putRaw` callers | `rg -n 'putRaw' src` | declaration + tests only; **no production caller** |
| D4 | Every read of a log's `entries` | `rg -n '\.entries\b' src --glob '!**/*.test.*'` | 9 real readers, all guarded — enumerated in §4.5 |
| D5 | Every read of `entry.exerciseName` | `rg -n '\.exerciseName' src --glob '!**/*.test.*'` | 8 readers — **2 unguarded, fixed**, see §5 |

**A sweep the plan's `rg` misses, worth recording.** `ResolutionStep.tsx:99`
writes `const catalogResults = exerciseCatalog` and `.filter(` on the next line.
A line-oriented pattern cannot see it. The audit test therefore parses with a
newline-tolerant regex instead of grepping, and that site is one of the five
that were missing the mandated marker.

### 1.2 The audit table, now executable

`src/components/app/ExerciseIdentityAudit.test.ts` holds a 22-row
`IDENTITY_CONSUMERS` table (the plan's 13 plus 9 the plan predates) and asserts
each row. Three verdicts:

- **`resolver`** — the file must contain the *named* entry point it resolves
  through (`via`), and must contain **zero** unmarked direct lookups.
- **`exact-only`** — every direct lookup site must carry the mandated same-line
  comment, and there must be **at least one** (a row that stopped being a
  consumer cannot sit here claiming coverage).
- **`declaration`** — one file, `exercises.ts`, which builds the array.

| File | Verdict | Routed through / why |
|---|---|---|
| `src/lib/catalog/identity.ts` | resolver | the resolver itself |
| `src/lib/catalog/exercises.ts` | declaration | declares the array, reads nothing out of it |
| `src/lib/catalog/match.ts` | resolver | `resolveExerciseIdentity` |
| `src/lib/catalog/groupCatalog.ts` | resolver | grouping keyed on `identity.groupKey` |
| `src/components/app/ExerciseNormalizationProvider.tsx` | resolver | builds the one shared context |
| `src/lib/import/parser.ts` | resolver | `matchExercise` |
| `src/lib/import/resolution.ts` | resolver | `prepareImportName` |
| `src/components/import/ImportClient.tsx` | exact-only | labels a chosen concrete id (1 site) |
| `src/components/import/ResolutionStep.tsx` | exact-only | labels + searches concrete versions (2 sites) |
| `src/lib/storage/aliasRepo.ts` | resolver | `prepareImportName` |
| `src/lib/storage/appDb.ts` | resolver | `createMigrationContext` |
| `src/lib/storage/migrations/v10Identity.ts` | exact-only | rewrites via the resolver; the alias-purge outcome gate enumerates exact names (1 site) |
| `src/lib/storage/normalizationOverrideRepo.ts` | exact-only | exercise-id target existence check (1 site) |
| `src/components/catalog/ExerciseCorrectionSheet.tsx` | resolver | `useExerciseNormalization` |
| `src/lib/backup/backup.ts` | resolver | `createMigrationContext` |
| `src/lib/analysis/muscles.ts` | exact-only | muscles/equipment off one concrete record (1 site) |
| `src/components/catalog/LibraryClient.tsx` | resolver | `groupCatalogItems` |
| `src/components/catalog/NestedExerciseList.tsx` | resolver | `groupCatalogItems` |
| `src/components/workout/ExercisePickerSheet.tsx` | exact-only | muscle-filter options only; nesting is `NestedExerciseList`'s |
| `src/components/workout/ExerciseReplaceSheet.tsx` | exact-only | muscle-filter options only |
| `src/lib/workout/historyProjection.ts` | resolver | one `resolveExerciseIdentity` per log entry |
| `src/components/workout/HistoryClient.tsx` | resolver | `projectExerciseHistory` |
| `src/components/workout/WorkoutDayClient.tsx` | resolver | `projectExerciseHistory` |

Checked and **excluded with reasons**, so the exclusions are on the record too:

- `src/lib/workout/exerciseSwap.ts`, `src/components/workout/RoutineBuilderClient.tsx`
  — `import type { ExerciseCatalogItem }` only. No lookup, no grouping.
- `context.catalogById.get(...)` in `identity.ts`, `match.ts`, `LibraryClient.tsx`
  and `ExerciseCorrectionSheet.tsx` — reads of the **resolver's own context**,
  downstream of a resolution that already happened. Marking those as bypasses
  would mark the resolver as bypassing itself.
- `exerciseCatalog.map(...)` / `.length` — whole-array enumeration to build a
  list for the resolver, or a count in the footer. Not a lookup; the mandated
  comment would be a false statement there.

**Five sites were missing the mandated marker and now carry it**:
`muscles.ts:65`, `ResolutionStep.tsx:90` and `:99`, `ImportClient.tsx:193`,
`v10Identity.ts:276`, `normalizationOverrideRepo.ts:85` (six lines, five files).

The table test also detects **derived indexes** generically — a module-level
`Map`/`Set` built from the catalogue and then read by key — rather than naming
`catalogIndex`. That is what caught `normalizationOverrideRepo`'s
`catalogExerciseIds.has(...)`, which no hard-coded name would have found.

**Verdict on requirement 1 (no identity bypass): PASS.** No history, analysis,
library, picker, import, migration or backup surface groups by
`canonicalExerciseId ?? exerciseId`, and every surviving direct lookup is exact
metadata with the mandated marker.

---

## 2. Prompt files verified unchanged — with evidence

The plan says diff against `origin/master`. `origin/master` is `aea0e2b`, a
**different** commit from the branch base `4a1caa4`. **I used `4a1caa4`**, and
ran both.

```
$ git diff --exit-code 4a1caa4 -- src/lib/prompts ; echo "exit=$?"
exit=0
$ git diff --stat origin/master -- src/lib/prompts ; echo "exit=$?"
exit=0
```

Stronger than a diff — blob identity, which no whitespace or mode setting can
launder:

```
$ git ls-tree 4a1caa4 -r src/lib/prompts | sort
100644 blob 23a40b6da02acfd67af749433915523dcbdafc5c  src/lib/prompts/builder.test.ts
100644 blob 2d8991ef72b32ba99ef62cadf7dca7c4d8d3b64a  src/lib/prompts/personas.test.ts
100644 blob 7227d8ddab679f8dc86dc897f659937e9a169429  src/lib/prompts/profileFields.ts
100644 blob 9b34e912d2c04d1751627eba0fbdadc2332e520f  src/lib/prompts/profileFields.test.ts
100644 blob a77507d70cac2c64b0d36036de0bd85e0b46f812  src/lib/prompts/personas.ts
100644 blob f3003264231b4336aa4d82b7a3020a39ce0b90d6  src/lib/prompts/builder.ts
$ git ls-tree HEAD -r src/lib/prompts | sort
   ... six identical blob hashes ...
```

Nothing in this task touched prompt construction, so the standing
"never feed the prompt builder an existing routine or log" rule was not engaged.

---

## 3. Exactly one refresh, and logs do not reload

### 3.1 The wiring, enumerated

One dispatcher module (`identityEvents.ts`), one listener
(`ExerciseNormalizationProvider.tsx:126`). Nine production dispatch sites:
`aliasRepo` ×4, `userExerciseRepo` ×2, `normalizationOverrideRepo` ×2,
`backup.ts:476` (restore, after commit), `appDb.ts:358/367` (migration, after
commit, gated on `shouldDispatchIdentityChange`).

The `EXERCISE_IDENTITY_CHANGED_EVENT` carry-forward is **satisfied**: the literal
string appears in exactly one production file. Tests spell it deliberately, and
`identityEvents.ts` says why. Both facts are now pinned by a test
(`keeps one dispatcher and one listener for the identity refresh signal`).

### 3.2 The integration evidence

`src/components/app/ExerciseIdentityIntegration.test.tsx` renders, under **one**
`ExerciseNormalizationProvider` on real `fake-indexeddb`: an analysis probe
calling the real `lookupCatalogExercise`, the real `LibraryClient`, the real
`HistoryClient`, and the real `WorkoutDayClient` with its history drawer open.

Fixture: `ssb-hatfield-squat` ships with `movementId: null`;
`barbell-high-bar-squat` already carries `movementId: "squat"`. One override
(`squat` + `barbell`, a modifier the family genuinely allows) moves Hatfield
into an existing family, so the test can distinguish *regrouped* from
*relabelled*.

Measured across the one write:

- all-time index `2 movements · 2 workouts` → `1 movements · 2 workouts`
- library gains a `Squat movement, N versions` row it did not have
- the open Today drawer gains `225x3` while keeping `315x5`
- analysis metadata unchanged (`quads,glutes,adductors`)
- provider generation `versionBefore + 1` — **exactly**
- `normalizationOverrideRepo.list` calls `+1` — **exactly**
- `logRepo.list` call count **frozen**, and asserted `> 0` first, so a frozen
  count of zero cannot pass

A second test does the same for a **backup restore**: export a workspace
containing the correction, delete the correction from the store, mount, restore.
Same three exact-number assertions.

### 3.3 Deliberate deviation from the plan's Step 1 snippet — disclosed

The plan's snippet asserts `getByTestId("analysis-movement")` shows `"Squat"`.
That is not achievable, and should not be: `lookupCatalogExercise` reads muscles
and equipment off one concrete record and resolves no family, and an override
changes grouping, never what an exercise trains. The spec explicitly permits
this — consumers "must migrate to the resolver **or** document that they
intentionally require only an exact concrete catalogue record", and it names
"Analysis muscle lookup" in that list. So the probe asserts the *other* half of
the same property: analysis is measurably **unmoved** by a correction, and the
audit table proves it performs no grouping. Both halves are mutation-killed
(MI7 below).

**Verdict on requirements 2 and 3: PASS.**

---

## 4. Carry-forward items — one verdict each

### Catalogue defects

**`barbell-back-squat` with `movementId: null`.** *Confirmed, decision still
right, still recorded.* At HEAD:

```
barbell-back-squat     | Barbell Back Squat     | movementId: null | mods: []
barbell-squat          | Barbell Squat          | movementId: squat| mods: ["barbell","back-rack"]
barbell-high-bar-squat | High Bar Back Squat    | movementId: squat| mods: ["barbell","back-rack","high-bar"]
barbell-low-bar-squat  | Low Bar Back Squat     | movementId: squat| mods: ["barbell","back-rack","low-bar"]
ssb-back-squat         | Safety Bar Back Squat  | movementId: null | mods: []
```

**3,033 of 3,175** entries carry no `movementId` — the ledger's figure exactly.
188 squat-named entries have no family. `merges.json` has **zero** records, and
`legacyRedirects.generated.json` therefore also has zero — internally
consistent, and worth stating plainly because it means the whole legacy-redirect
mechanism ships **empty**. Not reopened; carried to final review as ruled.

**Disambiguation candidates with `movementId: null`.** *Confirmed; the ledger's
count is slightly off and the corrected figure is here.* Measured at HEAD: 10
underspecified rules, 38 candidate references, **22 distinct** candidates, of
which **6 distinct** carry `movementId: null` (9 references across 5 rules). The
ledger records "7 of 23". The decision is unaffected. The characterization test
`shippedDisambiguations.test.ts:126-134` says, verbatim, *"when `assignments.json`
gains coverage this expectation shrinks, and editing it downward is SUCCESS, not
a regression. Never resolve a failure here by editing the candidate lists."* —
**the required comment is present and correct.**

**The `or` rule's unreachable entries.** *Confirmed, and sharpened.* Measured
over the whole 3,175-entry catalogue:

- entries whose **canonical name** is unreachable by exact match: **4**
  (`front-cone-hops-or-hurdle-hops`, `march-or-jog-in-place`,
  `neutral-grip-pull-ups-or-trx-rows`, `zone-2-bike-row-or-incline-walk`)
- of those, entries with **no reachable alias either**: **2**
  (`march-or-jog-in-place`, `neutral-grip-pull-ups-or-trx-rows`)

The ledger's "exactly four" is the first number. The "verified over names *and*
aliases" phrasing reads as if 4 were the both-unreachable count; it is 2. Both
figures are now on the record. Spec-intended either way.

**The `weighted` strip rejection.** *Confirmed exactly.* **43** catalogue entries
carry `weighted` in their canonical name, and stripping precedes exact matching,
so the rejection stands.

### Verification targets from earlier reviews

**Restore-validation boundary rule, condition (2).** *PASS — audited, not
assumed.* Condition (2) is "no migration deliberately preserves the bad shape".
The only field any migration deliberately preserves in a bad shape is
`log.entries`: `appDb.ts:190-195` (v7, `unreadableValue`) and `appDb.ts:223`
(v8, `mapArrayOrKeep`). Nothing preserves a malformed `programs[].days`,
`programs[].overrides`, `logs[].performedAt`, `logs[].programId` or
`logs[].dayId`. So `entries` correctly fails (2) and every retained field
correctly passes it.

**Completeness of the 30-site `entries` consumer sweep.** *PASS — there is no
third unguarded reader.* All nine readers at HEAD:

| Site | Guard |
|---|---|
| `historyUtils.ts:206` (`readableEntries`) | `Array.isArray` |
| `trainingHeatmap.ts:49` | via `readableEntries` |
| `historyProjection.ts:329` | via `readableEntries` |
| `LibraryClient.tsx:91` | via `readableEntries` |
| `appDb.ts:193-194` (v7) | `unreadableValue` short-circuits before `.some` |
| `appDb.ts:223` (v8) | `mapArrayOrKeep` |
| `v10Identity.ts:267` | `mappedArrayField` |
| `WorkoutDayClient.tsx:113-114` | explicit `Array.isArray` |
| `WorkoutDayClient.tsx:825` | `Array.isArray(target.entries) ? … : []` |

**Non-string `entry.exerciseName`.** *WAS a live defect, now FIXED — see §5.*
The history path had already been closed (`entryPerformedName` uses
`readableText`), but `LibraryClient` still had two `?? ""` guards that do not
fire for a non-nullish value, and the resolver itself threw. It does not ship.

**The compiler's fixed-point caveat at `core.ts:23`.** *PASS — confirmed by
reading, as instructed.* `scripts/catalog-normalization/compiler/core.ts:23-26`
carries the comment and `import { normalizeExerciseName } from
"../../../src/lib/catalog/normalize";`. The runtime rule is imported, not
reimplemented. Used at `core.ts:332`. The compiler keeps its own
`normalizeToken` for token curation (`normalize.ts:31`), which is the shape the
caveat describes.

**The hand-edited-backup purge deferral.** *PASS — premise re-verified by grep
at HEAD.* `rg -n 'putRaw' src` returns the interface declaration
(`aliasRepo.ts:51`), the implementation (`:128`), a doc comment in
`v10Identity.ts:366-368`, and **test files only**. No production caller. The
narrowed premise ("every mismatch row a production path writes carries
`provenance: "remembered"`") therefore still carries the deferral.

**Task 11's new `canonicalExerciseId` reference shape.** *PASS, and it is not
new.* `handleAddToUserCatalog` existed at the branch base
(`git show 4a1caa4:src/components/import/ImportClient.tsx`, line 98) and already
wrote a user-exercise id into a resolution, hence into `canonicalExerciseId`.
Task 11 added a second producer (`catalogItemForVersion` →
`exerciseSwap.swapExercise/addExercise`), not a new shape. Tolerance checked at
every consumer:

- resolver: `resolveCanonicalId` misses, falls back to the performed name, and
  `resolveName`'s `customMatch` branch reaches the user exercise. `custom-exercise`
  inputs resolve by id directly.
- migration/restore: `canonicalizeExplicitExerciseId` returns the **original id**
  when unresolvable, so a user-exercise id survives v10 and a restore untouched.
- backup validation: `restoreBackup` never validates `canonicalExerciseId`.
- override validation: `normalizationOverrideRepo` accepts user-exercise ids
  explicitly (`userExerciseIds.has`).
- analysis: returns `undefined`, and a user exercise has no muscle data to lose
  (`UserExerciseDocument` is `{ id, name, createdAt }`), so nothing is dropped
  that could have been read. Now documented in `muscles.ts`.

**Task 11's deferral — name-only entries groupable but not selectable.**
*Coherent.* `NestedExerciseList.tsx:26-30` states the reason (a picked row is
written into a program as a catalogue reference and a name has no id to write),
and `LibraryClient.tsx:750-753` states that `Needs review` lists them and filters
on the same query. Two comments, one story, no contradiction.

**Task 13 disclosures.** `versionKey` is present on `ExerciseHistoryRow` and
load-bearing (the drawer's version filter reads it) — an addition, not a
removal, so no consumer broke. Item 13 ("something unreadable was logged here")
is still unsurfaced; confirmed no such affordance exists. The `recent`/`stale`
split is on `latestPerformedAt` against a time window
(`HistoryClient.tsx:249-263`), matching the controller's ruling and spec line
497, and the comment explains the change.

**Older deferrals.** `terminated()`'s `dbInstance` clear is still guarded by
`if (dbPromise !== attempt) return;` (`appDb.ts`) — unchanged, still unreachable
single-tab. `abortOnFailure`/`applyUpgrades` do not exist as separate names; the
split remains deferred as recorded.

### Data-safety invariants at HEAD

- `by-normalized-alias` is the **only** unique index (D1).
- **No `IDBObjectStore.add()`** anywhere in `src/` — all 17 `.add(` hits are
  `Set.prototype.add` (D2).
- No NUL bytes in any `src/**/*.ts(x)`; no binary files in this task's diff.

---

## 5. The defect this audit found and fixed

**A name the resolver cannot read threw, and blanked `/library`.**

`normalizeExerciseName(value)` calls `value.toLowerCase()`. Nothing enforces
that an exercise name is a string on the way in: `appDb`'s v7 rule deliberately
keeps a log whose `entries` it cannot read, and — since the Task 10b boundary
fix — `restoreBackup` no longer validates `logs[].entries` at all, so a
hand-edited or foreign backup restores cleanly with `exerciseName: 7`.

`LibraryClient`'s `deriveNeedsReview` runs inside a `useMemo` **during render**,
and the app has **no error boundary** (`App.tsx`). One such entry blanked the
whole page. This is the same `?? ""`-does-not-fire class, on the sibling field,
fifteen lines below the `?? []` guard the Task 10b lane added — and the comment
on that guard says exactly why `?? ` is not enough.

### RED (real output)

```
● resolver: non-string performedName
  TypeError: value.toLowerCase is not a function
    at normalizeExerciseName (src/lib/catalog/normalize.ts:7:6)
    at resolveName (src/lib/catalog/identity.ts:280:20)
    at resolveExerciseIdentity (src/lib/catalog/identity.ts:367:9)
● resolver: non-string import name            — same TypeError, identity.ts:371
● resolver: non-string custom-exercise name   — same TypeError, identity.ts:358
● resolver: non-string canonicalExerciseId    — same TypeError, identity.ts:351
● deriveNeedsReview: non-string exerciseName  — same TypeError
Tests:       5 failed, 5 total
```

### The fix, and where it lives

Guarded **once**, in `resolveExerciseIdentity` — the single funnel every
consumer uses — for the reason `logLocalDate` gives: one guard covers the
history projection, the library, the pickers, the importer, the migration and
restore, and there is no second variant to drift. `LibraryClient`'s two
`rawName: … ?? ""` sites use the existing shared `textOf`.

**A rule I got wrong first, and how it was caught.** My first version blanked a
non-string label to `""`. That broke an existing Task 13 test
(`historyProjection.test.ts:814`) which asserts a row from an unreadable slot id
still labels as `"7"` — the settled rule at `historyUtils.ts:153` is
*"showing '7' is a worse label than a real name and a better one than nothing"*.
I replaced my variant with an import of `textOf` itself. **No existing test was
modified**; the existing test was right and my code was wrong.

Healthy-data behaviour is unchanged — pinned by an explicit control test
("keeps readable names resolving exactly as before") and by the full suite
going from 1,621 to 1,657 with zero existing failures.

---

## 6. Mutation evidence

Every mutation is named beside its count. Totals were compared to baseline on
every run (the mutant-fails-to-load trap): **no run lost a test**. All source
mutations were applied after committing, and the tree was verified clean against
HEAD (`git status --porcelain` empty) after each batch — `git checkout --`
discards uncommitted work in the mutated path.

### `ExerciseIdentityAudit.test.ts` — baseline 26 passed / 26 total

| Mutation | Killed |
|---|---|
| MA1 — remove the marker from `muscles.ts:65` | 1 / 26 |
| MA2 — remove the marker from `ResolutionStep`'s **multi-line** chain | 1 / 26 |
| MA3 — remove the marker from `normalizationOverrideRepo` (derived `Set` index) | 1 / 26 |
| MA4 — add `exerciseCatalog.find(...)` to a `resolver`-verdict file (`HistoryClient`) | 1 / 26 |
| MA5 — add a brand-new `src/` file that reads the catalogue | 1 / 26 |
| MA6 — reintroduce `canonicalExerciseId ?? entry.exerciseId` in `historyProjection` | 1 / 26 |
| MA7 — spell the wire name in a second file instead of importing the constant | 1 / 26 |
| MA8 — `HistoryClient` stops calling `projectExerciseHistory` | 1 / 26 |
| MA9 — `LibraryClient` stops calling `groupCatalogItems` | 1 / 26 |
| MA10 — `NestedExerciseList` stops calling `groupCatalogItems` | 1 / 26 |
| MA11 — `backup.ts` stops using `createMigrationContext` | 1 / 26 |
| MA12 — `WorkoutDayClient` stops calling `projectExerciseHistory` | 1 / 26 |

**MA8 and MA9 first SURVIVED, twice, and the test was wrong both times.**
Publishing the sequence because it is the exact shape this plan keeps paying for:

1. First form used `source.includes(marker)`. `projectExerciseHistoryX` **contains**
   `projectExerciseHistory`, so a renamed — i.e. removed — call passed. 26 green.
2. Second form used a word boundary but accepted *any* marker from a list.
   `HistoryClient` also imports `useExerciseNormalization`, so it still had one.
   26 green again.
3. Third form requires the **specific** entry point named on each row (`via`).
   Both mutations now kill.

The false-positive direction was measured too: the derived-index pattern first
matched `const outcomes = new Set<string>();` several lines above an unrelated
`exerciseCatalog` and reported a phantom site in `v10Identity.ts:480`. Tightened
to `[^;]`, so the index must be built **from** the catalogue in one statement.

### `ExerciseIdentityIntegration.test.tsx` — baseline 2 passed / 2 total

| Mutation | Killed |
|---|---|
| MI1 — `HistoryClient`'s projection stops depending on `context` | 2 / 2 |
| MI2 — `LibraryClient`'s `allGroups` drops `resolve` from its deps | **0 / 2 — survived** |
| MI2b — `LibraryClient`'s `allGroups` computed once (deps `[]`) | 1 / 2 |
| MI3 — Today drawer's `historyView` drops `identityContext` | 1 / 2 |
| MI4 — the provider reloads logs on every identity change | 2 / 2 |
| **MI5 — every identity write publishes the event THREE times** | **2 / 2** |
| MI6 — the override write publishes nothing | 1 / 2 |
| MI7 — `lookupCatalogExercise` returns `undefined` (probe liveness) | 1 / 2 |
| MI8 — `restoreBackup` publishes nothing | 1 / 2 |
| MI9 — `restoreBackup` publishes **twice** | 1 / 2 |
| MI10 — CONTROL: rename an unrelated placeholder in `HistoryClient` | 0 / 2 (correctly survives) |

**MI5 and MI9 are the "one vs three" evidence the brief demands.** Three
dispatches per write kills both tests; two dispatches on restore kills the
restore test. A test that could not tell one refresh from three would survive
both.

**MI2's survival is published as a coverage gap, not hidden.** `resolve` is a
redundant dependency there: `selectable` is rebuilt from `context.userExercises`,
which is a fresh array on every provider reload, so `allGroups` recomputes
whether or not `resolve` is listed. The property the test actually pins is
"the library regroups after a correction", and MI2b kills that. Removing the
`resolve` dep would be safe today and would silently couple the library's
correctness to an unrelated array identity, so it stays.

### `identityUnreadableNames.test.ts` — baseline 8 passed / 8 total

| Mutation | Killed |
|---|---|
| MG1 — revert the `stored-exercise` `performedName` guard | 2 / 8 |
| MG2 — revert the `import-name` guard | 1 / 8 |
| MG3 — revert the `custom-exercise` name guard | 1 / 8 |
| MG4 — revert the `catalog-reference` id guard | 1 / 8 |
| MG5 — revert `LibraryClient`'s **log** `rawName` to `?? ""` | 1 / 8 |
| MG6 — revert `LibraryClient`'s **routine** `rawName` to `?? ""` | **0 / 7 first, 1 / 8 after** |
| MG7 — drop the `performedName` spread guard | 1 / 8 |

**MG6 survived on the first pass** because no fixture passed a program at all —
the routine half of the same field was entirely unpinned. A test with a program
whose slot name is a number was added; MG6 now kills 1. Reported rather than
quietly fixed, because "the guard is there" and "the guard is tested" were two
different things here.

---

## 7. Gates — real output

```
$ bun run catalog:check
$ bun scripts/catalog-normalization/compiler/check.ts
exit=0

$ bun run test -- --runInBand
Test Suites: 110 passed, 110 total
Tests:       1657 passed, 1657 total
Snapshots:   0 total
Time:        31.41 s

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
exit=0

$ bun run lint
$ eslint .
exit=0

$ bun run build
dist/assets/index-Cmd6GLNZ.css     27.70 kB │ gzip:   6.99 kB
dist/assets/index-Ctqr9-4M.js   1,567.33 kB │ gzip: 279.61 kB
(!) Some chunks are larger than 500 kB after minification.     ← known-acceptable
✓ built in 1.30s

$ git diff --check
exit=0

$ git diff --exit-code 4a1caa4 -- src/lib/prompts
exit=0

$ git status --porcelain
(empty)
```

**e2e not run — controller instruction.**

Baseline at `709131c` was 107 suites / 1,621 tests. Now 110 / 1,657: +3 suites,
+36 tests, all mine, no foreign delta.

### Concurrency

Twelve `--maxWorkers=24` repo-wide runs. **The first two failed** (3 and 2 tests
respectively); I did not capture the suite names before the pattern was fixed,
and **ten consecutive runs since have been clean** at 110 / 1,657. I could not
reproduce it and therefore **cannot attribute it** — recording it as an open
watch item rather than claiming it is saturation. No timeout was changed. The
serial `--runInBand` suite has been green on every run.

---

## 8. Self-review findings

- Corrected three of my own audit-table verdicts that the first RED run exposed:
  `exercises.ts` is a `declaration` not a `resolver`; `parser.ts` resolves via
  `matchExercise`, which was missing from the entry-point list;
  `normalizationOverrideRepo` reads a derived `Set`, which the first detector
  could not see.
- Replaced a tautological assertion (`expect(X).toEqual(X)`) I had written in
  the completeness sweep with a real one.
- Replaced my own `readableLabel` with the existing `textOf` after it broke a
  Task 13 test — one rule, one implementation.
- NUL-byte scan across `src/**/*.ts(x)`: none. No binary files in the diff.
- The marker on `ResolutionStep.tsx:99` sits mid-chain
  (`const catalogResults = exerciseCatalog // …`) because the plan mandates a
  same-line comment and the chain spans two lines. Valid, slightly awkward,
  left as-is rather than reformatting production code to suit a test.

---

## 9. What Task 15 must know before delivery

### 9.1 Unexecuted e2e specs — all must be in the single serial run

| Spec | Why |
|---|---|
| `e2e/routine-builder.spec.ts` | Task 11 updated it; its old "click the first /squat/i button" now hits a **family row**, which is the nesting change working |
| `e2e/exercise-history.spec.ts` | Task 13 rewrote both history surfaces onto `projectExerciseHistory` |
| `e2e/history-rawcell.spec.ts` | same rewrite |
| `e2e/program-import.spec.ts` | named by the plan's Step 4; drives plain `Squat`, now legitimately underspecified |
| `e2e/helpers.ts` consumers | the curation commit once silently broke demo seeding here and passed three green unit suites |

I added no new e2e spec. My changes are a resolver guard, six comments, and
three test files; none introduces a flow a browser would exercise differently.

### 9.2 Open findings, in severity order

**(a) NEEDS_CONTEXT — `LocalDataProvider` is stale after a restore, and a
subsequent save can overwrite restored data.** Pre-existing, unchanged by this
branch, but reachable and adjacent to this task's invalidation remit.

`LocalDataProvider.tsx:76-78` loads programs and profile once on mount and
listens for nothing. `App.tsx:48` mounts it **above** the router, so it survives
navigation. `SettingsClient.tsx:180-181` calls `restoreBackup(data)` and then
only `setStats(...)`. Consequence: after restoring a backup the user still sees
their **pre-restore** programs, and `saveProgram` on one of those stale
documents writes it back over the restored program with the same id.

I did not change it: it is outside the identity-context contract the spec
defines, and altering app-wide refresh semantics at the delivery gate is exactly
the guess I was told not to make. Options:

1. `SettingsClient` calls `useLocalData().refresh()` after `restoreBackup` and
   after `resetWorkspace` — smallest, targeted, testable.
2. `LocalDataProvider` listens for a new `trainer-workspace-restored` event —
   more general, more surface.
3. Ship as-is and ticket it — it predates this plan.

**(b) The catalogue ships almost entirely un-nested.** 3,033 of 3,175 entries
carry no `movementId`; `merges.json` and `legacyRedirects.generated.json` both
have **zero** records. The mechanism is complete and correct; the *content* is
142 entries deep. The visible consequence a user will hit first:
`Barbell Squat` nests under Squat while `Barbell Back Squat` does not.
Ruled: carry to final review. **Task 15 should decide whether this is
deliverable as a user-facing feature or should ship behind more curation.**

**(c) `appDb.ts:199` invents a date.** The v7 upgrade writes
`performedDate: localDateOf(log.performedAt)` with no type guard. A non-string
`performedAt` yields `"NaN-NaN-NaN"` (it does **not** throw — `localDateString`
reads `getFullYear()` etc., not `toISOString()`), which contradicts
`logLocalDate`'s own stated rule that it returns `""` rather than *"a confident
lie"*. Low severity, needs a pre-v7 database with a corrupt timestamp. Not
changed: it is a migration path and the risk of touching it exceeds the edge
case.

**(d) Grammar, cosmetic.** `HistoryClient.tsx:344` renders
`{families.length} movements` unconditionally, so a single-family workspace
reads `1 movements`. My test asserts the current string; if Task 15 fixes the
grammar, `ExerciseIdentityIntegration.test.tsx` needs the same one-word edit.

**(e) A user exercise contributes nothing to analysis.**
`catalogItemForVersion` synthesises empty `muscles`, so `swapExercise`/
`addExercise` write empty `tags.primary`/`secondary`. This is faithful, not a
bug — `UserExerciseDocument` has no muscle data to carry — but it means picking
a custom exercise silently produces zero volume/balance coverage. Product
decision, not an audit finding.

**(f) The `--maxWorkers=24` flake described in §7.** Unreproduced in ten
consecutive runs; unattributed. Worth one more loaded run at delivery.

### 9.3 What a reviewer should scrutinise most

1. **The resolver guard in `identity.ts`.** It is the only behaviour change in
   this task and it sits at the single funnel every consumer uses. The control
   test and the full-suite delta are the evidence that the healthy path did not
   move; MG1-MG7 are the evidence that the unhealthy path is pinned.
2. **MI2's published survivor.** Confirm you agree the `resolve` dependency
   should stay despite no mutation killing it.
3. **The §3.3 deviation from the plan's `analysis-movement` assertion.** It is
   spec-sanctioned, but it is a deviation and it is deliberate.
4. **Finding (a).** It is the one thing here I judged out of scope, and it is
   the one with a data-overwrite path.

---

## Status

**DONE_WITH_CONCERNS**

**Commits** (mine, on top of `709131c`):

| SHA | Subject |
|---|---|
| `bc4cd7e` | test: audit every identity consumer for resolver routing |
| `37f7cce` | test: require a named resolver entry point per audit row |
| `2edf648` | fix: assert the audit row's entry point is a known one |
| `db4d021` | test: verify exercise normalization end to end |
| `08c9f9a` | fix: treat a name the resolver cannot read as absent |
| `a3a985b` | test: pin the routine-slot half of the unreadable-name guard |

**Gates:** `catalog:check` 0 · test 110 suites / **1,657** / 0 failures ·
typecheck 0 · lint 0 · build 0 · `git diff --check` 0 ·
`git diff --exit-code 4a1caa4 -- src/lib/prompts` 0 · tree clean.
**e2e not run — controller instruction.**

**Concerns:** finding (a), the stale `LocalDataProvider` after a restore, which
needs a decision before delivery; and finding (b), a catalogue whose nesting
mechanism is complete over content that is 4.5% assigned.
