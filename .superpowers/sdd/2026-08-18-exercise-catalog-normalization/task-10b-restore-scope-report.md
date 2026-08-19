# Task 10b — restore scope: one unreadable log must not condemn the whole file

Storage/backup lane fix round. One Critical (the unrestorable backup) plus review
findings F1-F6 from `task-10a-review.md`.

- Worktree: `/Users/djdjo/Documents/mine/trAIner/.worktrees/exercise-catalog-normalization`, branch `feat/exercise-catalog-normalization`
- HEAD at start: `e780234`, tree clean, baseline **103 suites / 1,569 tests / 0 failures**
- Commits: `6653035`, `2b45247`, `f3d9ce0`, plus the report commit below
- **e2e not run — controller instruction.** No Playwright in any form at any point.

---

## ITEM 1 (Critical) — the app could produce a backup it could not restore

### The defect, reproduced

`restoreBackup` listed `entries` in the `logs` `requireFields` block
(`backup.ts:248` at HEAD), checked with `isArrayOfNonNullObjects`. One malformed
log therefore refused the **entire** file.

Reachability, confirmed rather than assumed:

- `appDb.ts:181-191` (the v7 rule) **deliberately keeps** a log whose `entries`
  is a non-array, and one whose element is not a record, because the unreadable
  value "may be standing in for real sets we have no way to recover".
- `exportBackup` (`backup.ts:139`) is `getAll()`, so it copies that log into the
  file verbatim.
- `restoreBackup` then rejected the file.

`isArrayOfNonNullObjects` rejects **both** `entries: "corrupt"` and
`entries: [null]`, and `[null]` is a shape the v7 ruling explicitly preserves. No
hand-editing is required at any step.

### RED — real output

New tests in `src/lib/backup/backup.test.ts`, against the actual `restoreBackup`
over a backup holding one malformed log plus one healthy one:

```
● restoreBackup — an unreadable `entries` does not condemn the file › restores every record when one log has a non-array entries

  expect(received).resolves.toBeUndefined()
  Received promise rejected instead of resolved
  Rejected to value: [Error: Invalid backup: logs[0] (id l-bad) — 'entries' must be an array of objects.]

    > 825 |     await expect(restoreBackup(doc)).resolves.toBeUndefined();

● restoreBackup — an unreadable `entries` does not condemn the file › restores every record when one log has an array whose element is null

  Rejected to value: [Error: Invalid backup: logs[0] (id l-bad) — 'entries' must be an array of objects.]

Tests:       2 failed, 50 skipped, 1 passed, 53 total
```

Both shapes, the exact reported error, at the exact reported line. The third test
in the block (`still refuses a log whose performedAt is unreadable`) was green at
RED, deliberately — it pins the half of the boundary that must not move.

### Where I drew the boundary, and why

The comment at `backup.ts:234-236` justified the block with a claim about
**consumers**: "a record that passes the shallow id check but lacks required
structure would commit, destroy the workspace, and crash every page that reads
it." That is sound reasoning, and it is exactly what over-reached: it is a claim
about what readers do, so it only holds for fields readers still dereference
unconditionally, and it says nothing about fields the *database itself* keeps on
purpose.

I did not delete the block. I made its membership rule explicit. A field is
validated here only when **both** hold:

1. **Some consumer still dereferences it unconditionally.** Otherwise passing a
   bad value through trades an unrestorable file for a crashing page, which is
   not an improvement — the brief's own test, and the reason this is a two-part
   condition rather than "unreadable content is never grounds for rejection".
2. **The database cannot already hold the bad shape on purpose.** If a migration
   deliberately preserves it, refusing it here contradicts the store the file was
   copied out of, and the file is not hand-edited — it is one this build wrote.

`entries` fails (2), unambiguously and by an explicit ruling. Removed.

Everything else in both `requireFields` lists passes both, checked with
file:line rather than by symmetry:

| Field | (1) unguarded consumer | (2) preserved by a migration? | Verdict |
|---|---|---|---|
| `logs[].entries` | none left (see the audit below) | **yes** — `appDb.ts:181-191` | **removed** |
| `logs[].performedAt` | `trainingHeatmap.ts:39` `log.performedAt.slice(0, 10)`, unguarded | no | kept |
| `logs[].programId`, `.dayId` | the references attaching a log to a routine | no | kept |
| `programs[].days` | `LibraryClient.tsx:45-50` `[...program.days, ...]`, unguarded | no | kept |
| `programs[].overrides` | `LibraryClient.tsx:45-50` `program.overrides.flatMap(...)`; `requireOverrideReplacements` (`backup.ts:82-92`) indexes it as an array; `getRenderableDays` sorts a copy on every program page | no | kept |
| `programs[].title`, `.createdAt`, `.updatedAt` | unchanged | no | kept |

**On the brief's explicit question about `programs`' `days` and `overrides`: the
same over-reach does NOT exist there, and I did not widen the change.** Two
independent reasons, either sufficient:

- Their consumers are **not** hardened. `daysOf` in `LibraryClient.tsx:45-50` is a
  bare `program.overrides.flatMap(...)` and `[...program.days, ...]`. Task 12's
  sweep was a *log/entries* sweep; it did not touch program structure.
- No migration preserves a malformed `days` or `overrides`. The v7 ruling is
  about a log's `entries` specifically. So a bad one cannot arrive from a file
  this app wrote — it means a hand-edited file, which is precisely the population
  this validation exists to refuse. The asymmetry is not an inconsistency; it is
  the rule doing its job.

Both conditions are written into `backup.ts` above the block, with the reasoning
and a "do not widen this by symmetry with `entries`" line, so the next reader has
the test rather than the outcome.

### Verification that every `entries` consumer survives the passed-through value

The brief required this be verified, not assumed. I audited every read of a
log's `entries` in `src/` — 30 sites — against both shapes. **Two were not
hardened.** Both are fixed (see Item 1b); the rest:

| Site | Guard | `"corrupt"` | `[null]` |
|---|---|---|---|
| `historyUtils.ts:213` `readableEntries` | `Array.isArray` + `isRecordLike`, index preserved | SAFE (`[]`) | SAFE (filtered) |
| `historyUtils.ts:133` `readableSets` | `Array.isArray` + `isRecordLike` | SAFE | SAFE |
| `HistoryClient.tsx:69,77`; `historyUtils.ts:254`; `historyProjection.ts:320,410` | via `readableEntries` | SAFE | SAFE |
| `WorkoutDayClient.tsx:766-777` | `Array.isArray` + `entryIsFullyHydratable` | SAFE | SAFE (parked by index) |
| `WorkoutDayClient.tsx:97-102` `parkedUnreadableEntries` | explicit non-array test | SAFE (parks it) | SAFE |
| `WorkoutDayClient.tsx:51-57` `mergePreservedEntries` | operates on the freshly built array | SAFE | SAFE (`null` re-emitted verbatim) |
| `sessionState.ts:100-139` | `entryIsFullyHydratable` then `readableSets` | SAFE | SAFE |
| `appDb.ts:192-195` (v7) | `unreadableValue` **short-circuits before** `.some` | SAFE — log kept | SAFE — log kept |
| `appDb.ts:223-238` (v8) | `mapArrayOrKeep` (`v10Identity.ts:127`) | SAFE — returned untouched, no `cursor.update` | SAFE |
| `v10Identity.ts:267` `migrateLog` | `mappedArrayField` returns `{}` for a non-array, so `...log` keeps the value **and does not add an `entries: undefined` key** | SAFE | SAFE |
| `v10Identity.ts:239` `migrateLogEntry` | `isRecord` (arrays excluded) | n/a | SAFE — `null` returned untouched |
| `logRepo.ts:6-33` | never reads `.entries`; `save` is a bare `put` | SAFE | SAFE |
| `dayResolver.ts:22`, `ProgramDetailClient.tsx:145`, `programRepo.ts:34`, `stats.ts:41`, `TodayClient.tsx:32` | read `completedAt`/`dayId`/`length` only | SAFE | SAFE |

`src/lib/analysis/*` and `src/lib/prompts/*` never read `WorkoutLogDocument` at
all (grep: zero hits).

### Can the change introduce a mid-transaction throw?

No, and the question was checked rather than waved at:

- `migrateLog` runs **before** the transaction opens (`backup.ts:355`) and is
  total for these shapes (`mappedArrayField` guards, table above).
- The value is written by `store.put`, whose only new failure class would be a
  non-cloneable value. Both callers of `restoreBackup` hand it a `JSON.parse`
  result (`SettingsClient.tsx:179-180`), which cannot produce one; and anything
  round-tripped from IndexedDB was cloneable by definition to have got in.
- Proved rather than argued: the round-trip test below runs `exportBackup` →
  `deleteDB` → `restoreBackup` → `logRepo.list()` over real `fake-indexeddb` and
  the value comes back intact.
- No new `IDBObjectStore.add()`; no schema change; `by-normalized-alias` is
  still the only unique index. Nothing in this change touches the alias path.

### GREEN — the tests

`src/lib/backup/backup.test.ts` — `restoreBackup — an unreadable \`entries\` does not condemn the file`:
both shapes restore, the malformed log is `put` **byte-for-byte as the file held
it**, the healthy sibling lands, `mockClear` shows the stores really were
cleared-then-repopulated, and `txCommitted` is a completion canary so the
assertions cannot be passing over a restore that bailed before writing.

`src/lib/storage/appDb.test.ts` — `export → restore round trip with a log the
database keeps but cannot read`: the same property end to end over real
`fake-indexeddb` rather than a mocked transaction. It asserts the malformed value
is **in the exported file** first (otherwise the restore assertion would be
vacuous), then that after a `deleteDB` and restore the value is preserved
verbatim *and* the healthy log, the program, the alias and the profile all
landed.

### Two existing tests changed — declared

Semantics moved by controller ruling, so this is disclosed rather than assumed.

| Test | Change | Why |
|---|---|---|
| `rejects a log with non-array entries` | **deleted** | It asserted exactly the behaviour the ruling reverses. Its shape is now asserted to restore. |
| `rejects null elements inside days/entries` | split; renamed `rejects null elements inside a program's days` | The `programs`/`days` half is unchanged and still asserted. Only the `entries` half — again the reversed behaviour — is gone. |

Nothing else was touched, and a comment in the file records what was removed and
where the two shapes are now asserted, so the deletion cannot read as a quiet
weakening.

---

## ITEM 1b (required by Item 1) — two unhardened consumers, outside my lane

**Declared prominently because it is a lane excursion.** Item 1 is only safe if
every reader survives the passed-through value. Two do not:

- `src/lib/analytics/trainingHeatmap.ts:40-41` — bare `for (const entry of
  log.entries)` / `for (const s of entry.sets)`, no guard at all.
- `src/components/catalog/LibraryClient.tsx:78` — `(log.entries ?? []).map(...)`;
  `?? []` does not fire for a non-nullish unreadable value.

I fixed both rather than reporting and stopping, because leaving them means the
Critical cannot be fixed at all, and because **both are already reachable today**,
independent of this change: the database keeps these shapes on purpose, and
`trainingHeatmap` additionally throws on `entries: undefined`, the shape of every
log predating the field. Both fixes reuse Task 12's `readableEntries` /
`readableSets` rather than writing a third and fourth variant of the rule. They
are in their **own commit, landed first**, so the tree is never in a state where
restore passes the value through to a throwing reader.

Blast radius of what was fixed, which is why I judged this worth the excursion:

- Heatmap: `ProfileClient.tsx:278-281` has no `.catch`, so one such log left
  `heatmapCells` `null` and the whole 26-week heatmap silently absent for the
  rest of the visit.
- Library: `deriveNeedsReview` runs in a `useMemo` **during render** and the app
  has no error boundary anywhere, so the throw unmounted the tree — a **blank
  `/library` page**, not a missing section. Pinned with a rendered RTL test
  against `fake-indexeddb` through the real component, per the standards, not
  downgraded to a unit test (a unit-level twin exists alongside it).

RED, real output:

```
● LibraryClient — logs the database keeps but cannot read › still renders the library when one log has a non-array entries
  TypeError: (log.entries ?? []).map is not a function
● LibraryClient — logs the database keeps but cannot read › still renders the library when one log has an entries array whose element is null
  TypeError: Cannot read properties of null (reading 'exerciseName')
Tests:       2 failed, 12 skipped, 14 total

● buildHeatmapCells — … › … a non-array entries
  TypeError: entry.sets is not iterable            (at trainingHeatmap.ts:41:29)
● buildHeatmapCells — … › … an entries array whose element is null
  TypeError: Cannot read properties of null (reading 'sets')
● buildHeatmapCells — … › … no entries key at all
  TypeError: log.entries is not iterable           (at trainingHeatmap.ts:40:29)
● buildHeatmapCells — … › … an entry whose sets is not an array
  expect(received).toBe(expected)  Expected: 0  Received: 2
```

**A near-vacuous row I caught and fixed, recorded because it is the shape this
plan keeps hitting.** The `sets: "corrupt"` row did **not** throw: a string is
*iterable*, so `for (const s of "corrupt")` walks seven characters, each
contributing the 70kg bodyweight default — 490 units of invented volume. My first
draft asserted only "the healthy session still charts", which that row satisfied
while the bug was fully present. It now asserts the unreadable log's own cell has
intensity **0**, which is what made it RED (`Expected: 0  Received: 2`). A
"does not throw" assertion is not enough where the unguarded read is silently
wrong instead of loud.

My first completion canary was also wrong and I replaced it: `weeklyAvg > 0` is
`round((1/26)*10)/10 = 0`, so it failed for the *fixture*, not the behaviour. It
is now a grid-shape assertion.

---

## ITEM 2 — F1 and F2: two false shipped comments, both the inverse of the code

Both corrected to state what is true now, not merely softened.

- `src/lib/backup/backup.ts` (the `classifyAliases` integrity bullet): was *"the
  token is recomputed from the alias text… The file's own `normalizedAlias` is
  never written"*. Now states that the file's own token **is** what gets written,
  put through the normalize pass and deduped on the result, that re-deriving it
  was the NEW-A defect, and — the reviewer's strengthening argument, which
  belongs next to the code — that an exported file's tokens are distinct **by
  construction** because they came out of a database with that unique index, so
  keeping them cannot introduce a collision the source did not have whereas
  recomputing can collapse two live keys onto one.
- `src/lib/storage/aliasRepo.ts` (`putRaw`): was *"recomputed from the display
  text, falling back to the stored token"*. Now states the exact inverse, which
  is the code: the row's own token is kept and normalized, display text is the
  fallback only, neither usable means the write is rejected.

Also corrected, found while working and in the same defect class — **two further
false claims created by Item 1 itself**, in `WorkoutDayClient.tsx`'s parking
note, which cited the old rejection as a premise:

- *"`restoreBackup` rejects a non-array `entries` outright, so it takes two
  separate hand-edits"* — now explains that a restore only *copies*, so the
  hand-edit is still required, once rather than twice.
- *"Parking additionally fixes a restore failure"* — now records that the
  Critical is fixed at its source and points at the boundary note.

---

## ITEM 3 — F3: the report credited evidence that is vacuous by construction

Corrected **in place** in `task-10a-alias-restore-report.md`, not deleted. The
false sentence is struck through with the correction beneath it, so the record
shows what was claimed as well as what is true.

The correction states: the digest **does** establish that legacy retention is
unchanged (3,749 both scopes, reproduced independently by the reviewer to the
unit); it establishes **nothing** about the `or` trap, because it is invariant
under M-A, M-B and M-C alike (`c8923047…` every time); and it is vacuous **by
construction** — for a legacy-shaped row `token === normalizeExerciseName(alias)`
and `prepareImportName` begins with `normalizeExerciseName`, so
`prepareImportName(alias.alias)` and `prepareImportName(token)` are the same
call. No legacy-shaped corpus of any size can express the trap. What actually
closes it is named: the M-B test, and the total equivalence of `aliasRuleText` to
the old `textForRules` for every input.

The general lesson is written into the report, as the brief asked, because this
is the second such corpus in one lane: *check corpus **shape** against the failure
mode before reporting corpus **size**; a five-figure row count reads as
thoroughness and can be worth nothing.*

The "what a reviewer should scrutinise" list is annotated too, so item 4 there no
longer reads as if the digest settled more than it did.

---

## ITEM 4 — F5, F4, F6

**F5.** `aliasRepo.test.ts` `putRaw keeps the token the row was written under,
normalized` → **`putRaw repairs case and spacing in the stored token`**. The body
now records the trap explicitly: `"90/90 Hamstring"` is a plain name, both rules
normalize to `"90 90 hamstring"`, so the fixture is structurally unable to tell
them apart and restoring the pre-fix preference leaves it green. It states what
it *does* pin (the normalize pass) and points at the annotated sibling that pins
the real property. Renamed rather than re-fixtured because the sibling already
covers it and a duplicate would be dead weight.

**F4.** `v10Identity.ts` `aliasLookupToken`'s doc now lists **two** consequences
rather than one, and names the second as a **bounded loss path** in those words:
two rows with different display texts sharing one stored token collapse to one,
where re-deriving kept both. Recorded with its three bounds — unreachable from a
legally exported file (the unique index forbids the two rows coexisting),
absorbed by `winsCollision` rather than by arbitrary key order, and covered by
the standing alias exception — and marked "Accepted, not overlooked."

**F6.** `backup.test.ts`: *"No writer in `src/` can produce such a row"* →
*"No writer in `src/` **with a production caller**"*, with the reason spelled out
rather than the one word changed: `save` and `replaceRemembered` both mint
mismatch rows (that is what a phrase-stripped remembered correction **is**) and
`putRaw` stores any token verbatim; what saves the first two is the hard-coded
`provenance: "remembered"` short-circuiting classification before the outcome
gate under both scopes, and what saves `putRaw` is that nothing calls it.

---

## Mutation evidence

Zero worktree footprint: out-of-tree Jest config in the session scratchpad
(`t10b_mut/jest.mut.js`) whose `moduleNameMapper` swaps in mutant copies kept
**outside** `src/` and outside the worktree entirely, under a `t10b_` prefix. No
tracked file was edited to mutate anything, so there is nothing to restore and
nothing to clobber.

**Config detail, applied as the brief instructed:** the mutation entries are
spread **before** `...base.moduleNameMapper`, so they precede `"^@/(.*)$"`. Both
the `@/`-aliased and the relative specifier are mapped for each target. Two
further traps hit and recorded for the next user of this technique:

1. A mutant that imports a **relative** sibling (`./ExerciseCorrectionSheet`)
   cannot resolve it from outside the tree — rewrite those to `@/`.
2. A `.tsx` mutant outside the project cannot resolve `react/jsx-runtime` by
   walking up for `node_modules` — needs `modulePaths`. **This failed silently in
   the useful direction and would have corrupted a count if unchecked:** the
   suite did not *fail loudly*, it simply did not load, and the run reported
   `311 passed, 311 total` — a clean-looking green with 14 tests missing, which
   reads as "0 killed". Always compare the mutation run's **total** against the
   baseline total, not just its failure count.

**Scope S** = `src/lib/storage` + `src/lib/backup` + `src/lib/analytics` +
`src/components/catalog`, 18 suites. **Baseline 325 passed / 325**, verified again
after the config fix.

**Harness non-vacuity**: M-4 is the known-killable control. It removes a check I
deliberately **kept**, and it kills a pre-existing test as well as one of mine —
so the harness demonstrably reaches `backup.ts` through both the `@/` and the
relative import path.

| # | Exact mutation | Killed | Which tests |
|---|---|---|---|
| **M-1** | `backup.ts`: re-insert `{ name: "entries", check: isArrayOfNonNullObjects, expected: "an array of objects" }` into the `logs` `requireFields` list — **the Critical, restored verbatim** | **4 / 325** | both `restoreBackup — an unreadable \`entries\` does not condemn the file` rows, and both `export → restore round trip with a log the database keeps but cannot read` rows |
| **M-2** | `trainingHeatmap.ts`: `readableEntries(log)`/`readableSets(entry)` reverted to `log.entries`/`entry.sets` | **4 / 325** | all four `buildHeatmapCells — logs the database keeps but cannot read` rows |
| **M-3** | `LibraryClient.tsx`: `readableEntries(log).map(({ entry }) => …)` reverted to `(log.entries ?? []).map((entry) => …)` | **4 / 325** | both `LibraryClient — logs the database keeps but cannot read` rows (rendered) **and** both `deriveNeedsReview — unreadable log entries` rows |
| **M-4** | `backup.ts`: **delete** `{ name: "performedAt", … }` from the `logs` `requireFields` list — the retained half of the boundary | **2 / 325** | `still refuses a log whose performedAt is unreadable` (mine) and the pre-existing `rejects a log missing performedAt, without touching the db` |

Every mutation kills **exactly** the tests written for it and nothing else, and
each of the four new test groups is killed by exactly one mutation. M-4 is the
one that matters for the boundary argument: it proves the retained checks are
still load-bearing, so Item 1 narrowed the scope rather than gutting it.

### Vacuity shapes hunted, per the brief

- **Corpus that cannot express the failure** — see Item 1b: the `sets: "corrupt"`
  row was exactly this and was strengthened until it went RED for the right
  reason.
- **Plain-name fixture** — F5; renamed, with the limitation written into the body.
- **Probe downstream of the failure** — the backup-level test asserts on the
  actual `put` payload, and the round-trip test asserts on `logRepo.list()` after
  a real `deleteDB`. Both are at the failure, not after it.
- **Compound guard mutated as a whole** — the two halves of the log boundary are
  mutated **separately**: M-1 (add `entries` back) and M-4 (remove
  `performedAt`). Mutating the `requireFields` list as a unit would have hidden
  that neither half is independently pinned.
- **Completion canaries** — `txCommitted` and `mockClear("logs")` in the backup
  test; grid dimensions in the heatmap test; the "value really is in the exported
  file" pre-assertion in the round-trip test; the program/custom-source
  assertions in the rendered library test.

---

## Healthy-data behaviour must not change

Proved, not asserted: **all 1,569 baseline tests still pass**, with no test
modified except the two disclosed above, whose behaviour the controller
deliberately reversed. The full suite is 103 suites / **1,581 tests** — 1,569
baseline + 13 new − 1 (two tests merged into one). The whole existing
`backup.test.ts` restore surface (52 tests, including the version-1/version-2
alias paths, override validation, atomicity and rollback) and the
`appDb.test.ts` export/restore round trips are untouched and green.

The mutation runs reinforce it from the other side: M-1 through M-4 each kill
**only** the new tests. If any of them had moved healthy-data behaviour, an
existing test would have failed under the mutation — none did.

---

## Gates — real output

```
$ bun run test -- --runInBand
Test Suites: 103 passed, 103 total
Tests:       1581 passed, 1581 total
Snapshots:   0 total
Time:        22.647 s
Ran all test suites.

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
  (no output)

$ bun run lint
$ eslint .
  (no output)

$ bun run build
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.26s
  (Vite's large-chunk advisory — known-acceptable)

$ git diff --check
  (clean)
```

**e2e not run — controller instruction.**

**What I believe needs the controller's single serial run**, flagged rather than
discovered at the delivery gate: nothing in this change is e2e-shaped, and I
wrote no new spec. The restore path is covered at the database level over real
`fake-indexeddb`, and the one UI defect (`/library` blanking) is covered by a
rendered RTL test through the real component, which the standards treat as the
right tool and not a downgrade. The two consumer fixes are strict wideners — they
handle inputs that previously threw — so no existing e2e assertion should move.
`e2e/helpers.ts` and the demo-seeding path are untouched. Unverified, not cleared.

---

## Self-review of the full diff

Read the whole diff, tracked and untracked, with fresh eyes before the final
commit. What it turned up and I fixed:

1. Two stale claims in `WorkoutDayClient.tsx` that **my own change** falsified.
   They cited "restoreBackup rejects a non-array `entries`" as a premise. Caught
   by grepping `restoreBackup` across `src/` rather than by reading the diff —
   the diff would never have shown them, because they are in a file the diff does
   not touch. Worth generalising: **after changing a rule, grep for the rule's
   name, not just its call sites.** The plan's own observation is that the missed
   comment is the one nearest the change; this is the variant where it is
   nowhere near it.
2. The near-vacuous heatmap row and the arithmetically-broken canary, both
   described in Item 1b.
3. The silent mutation-harness undercount (`311 / 311`), described above.

Untracked files: none in the worktree. Every mutant, config and snapshot lived in
the session scratchpad under `t10b_mut/` and is deleted. `git status --porcelain`
is clean apart from this report.

## Deliberately NOT done, with reasoning

- **`programs[].days` / `.overrides` were not narrowed.** Reported instead, per
  the brief. Both conditions fail: consumers unhardened (`LibraryClient.tsx:45-50`)
  and no migration preserves the shape. Widening by symmetry would trade a
  refused hand-edited file for a crashing program page.
- **The hand-edited-backup purge deferral is untouched**, per the ruling.
- **A non-string `entry.exerciseName` is out of scope** and pre-existing:
  `isArrayOfNonNullObjects` accepted `entries: [{ exerciseName: 7 }]` before this
  change too, so a backup carrying one already restored today. It flows into
  `normalizeExerciseName`, which `historyUtils.ts:167-170` says throws.
  `LibraryClient.tsx:86`'s `entry.exerciseName ?? ""` does not guard a non-string.
  **Flagged for the controller as a separate, pre-existing item** — I did not
  widen this round to cover it.
- **`ProfileClient.tsx:278-281`'s missing `.catch`** on `logRepo.list().then(...)`
  is a real robustness gap independent of `entries`; the throw it was swallowing
  is gone, but the pattern remains. Not fixed — out of scope, and unrelated to any
  finding in this round.

---

## Status

**DONE_WITH_CONCERNS** — the work is complete and every gate is green; the
concern is procedural, not technical.

**Commits**

| SHA | What |
|---|---|
| `6653035` | F1, F2, F4, F5 — the four comment/name corrections |
| `2b45247` | Item 1b — the two unhardened `entries` readers (**lane excursion**) |
| `f3d9ce0` | Item 1 — the Critical, plus the `WorkoutDayClient` note |
| (this commit) | Item 3 correction in `task-10a-alias-restore-report.md`, and this report |

**Gates:** 103 suites / 1,581 tests / 0 failures; typecheck clean; lint clean;
build clean; `git diff --check` clean. **e2e not run — controller instruction.**

**What a reviewer should scrutinise most**

1. **The Item 1 boundary.** It is the consequential judgement of the round. The
   two conditions are stated in `backup.ts`; attack condition (2) in particular —
   I claim no migration deliberately preserves a malformed `programs[].days` or
   `.overrides`, which is what makes the asymmetry with `entries` principled
   rather than convenient. If that claim is wrong, `programs` needs the same
   treatment and its consumers need hardening first.
2. **The lane excursion in `2b45247`.** Two files outside `src/lib/storage/**`
   and `src/lib/backup/**`. I judged it required rather than optional: without
   it, Item 1 trades an unrestorable file for a crashing page, which the brief
   forbids. Both defects predate this change. Overrule me if the lane rule was
   meant to bind harder than the correctness condition.
3. **The consumer audit's completeness.** The whole Critical rests on "every
   reader of `entries` is guarded". I enumerated 30 sites and found two gaps; a
   third gap I missed would mean the passthrough crashes a page. The likeliest
   place to find one is a reader that does not import from `historyUtils` at all
   — that is exactly what both misses had in common.
4. **The two deleted/split `backup.test.ts` assertions.** Confirm they were
   reversed by the ruling rather than quietly weakened, and that the `programs`
   half survived intact.
5. **M-4.** It is the only evidence that Item 1 narrowed the validation rather
   than gutting it. If it can be made to kill nothing, the boundary is not pinned.
