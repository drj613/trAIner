# Task 7 report: Add backup v2 and temporary v1 restoration

Base: `3442f33`. Branch `feat/exercise-catalog-normalization`.

Commits:
- `2e78e3f` — `refactor: extract v10 identity transforms into their own module` (inherited items 7-C, 7-D, 7-E, 7-F, 7-G)
- `b2ac7e9` — `feat: include exercise normalization in backups` (plan work + 7-A, 7-B)

Suite: **93 suites / 1164 tests → 94 suites / 1194 tests**, 0 failures.
Per file: `backup.test.ts` 31 → 49, `appDb.test.ts` 75 → 82, new `migrations/v10Identity.test.ts` 7.
`sessionPersistence.test.ts` is absent from the diff, as it has been for all of Task 6.

---

## Plan work

### Versioned envelope (`src/lib/programs/types.ts`)

`BackupDocument` is now `BackupDocumentV1 | BackupDocumentV2`, with
`LegacyAliasDocument = Omit<AliasDocument, "provenance">` and
`BackupDocumentV2 = Omit<BackupDocumentV1, "version" | "aliases"> & { version: 2; aliases: AliasDocument[]; normalizationOverrides: NormalizationOverrideDocument[] }` —
exactly the plan's shapes. `types.ts` gained one `import type` from
`@/lib/catalog/identity`; it is type-only, so there is no runtime cycle even
though `identity.ts` imports document types back from `types.ts`.

### v2 export

One readonly transaction over a single `BACKED_UP_STORES` list (8 stores now,
`normalizationOverrides` added) that both the export snapshot and the restore
write set use, so they cannot drift apart. `exportBackup` returns
`Promise<BackupDocumentV2>` and stamps `version: 2`. `backups` stays out of the
list deliberately: in-app snapshots are undo points for this database, not user
data to carry between installs.

### v2 restore

Validation order, all of it **before** `getDb()`:

1. existing v1 checks (arrays, ids, program/log required fields, override replacements);
2. `normalizationOverrides` must be present and an array of objects with string ids — absent is legal only in a v1 file, where it means "none". A v2 file that lost the field is truncated, not empty;
3. per-item shape (`targetKind`, `targetValue`, `movementId` string-or-null, `movementModifierIds` array of strings, `updatedAt`), reported as `normalizationOverrides[i]`;
4. `validateNormalizationOverrideInput` — the same function and the same bundled movement/modifier definitions the override editor uses, so a file cannot install an override the app would have refused to save;
5. duplicate targets, keyed on `normalizationOverrideKey(...)`, so two rows with different ids that normalize to the same target are rejected rather than one silently overwriting the other.

Then one readwrite transaction clears and repopulates all eight stores, and one
identity event is dispatched **after** `tx.done`.

Stored override documents are rebuilt through a new
`canonicalNormalizationOverride` in `normalizationOverrideRepo.ts` — the id and
`targetValue` come from the normalizer, never from the file. `repo.save` now
goes through the same function, so there is still exactly one path that derives
an override's key fields (the divergence Task 6 closed stays closed).

### Temporary v1 restore

A v1 document is accepted, its overrides default to `[]`, and its records go
through `classifyAliases` / `migrateProgram` / `migrateLog` from the extracted
module. A version other than 1 or 2 is rejected with
`Unsupported backup version: N. Expected 1 or 2.` rather than coerced.

**Decision worth review:** the normalization pass runs for **both** versions,
not only v1. For a v2 file it is a fixed point (proved by the Task 6 idempotency
tests), so healthy-data behaviour does not change; running it unconditionally is
what makes a file exported by an older build safe to restore into a newer one —
the same hazard as 7-B, one release later. The alternative (v1-only) is closer
to the spec's literal wording; I judged the wider version strictly safer and
documented the reasoning in the code.

**Scoping decision:** the migration context is built with
`normalizationOverrides: []` even when the file has overrides. Overrides are a
read-time input; baking override-derived identity into stored records would
survive the override being deleted. Stated at the call site.

---

## Inherited items

### 7-A. Alias token written verbatim — silently dead aliases — FIXED

Restore no longer writes the file's `normalizedAlias`. `classifyAliases`
recomputes each token from the alias text and dedupes on the recomputed value,
which is the same code the v10 upgrade runs.

RED (real database, real unique index), before the fix:

```
● restoreBackup — version-1 compatibility on a current database
  › makes a restored alias findable even when the file's own token was stale
  Received: undefined      // aliasRepo.find("RDL") after restoring normalizedAlias: "WRONG-TOKEN"
```

Also covered at the mocked level: `recomputes normalizedAlias from the alias
text` and `keeps one row when two aliases recompute to the same token`.

### 7-B. Restore never ran the v10 migration — FIXED

RED, before the fix:

```
● restoreBackup — version-1 compatibility on a current database
  › retains unique legacy aliases and purges ambiguous or noisy ones
  Received: {"alias": "Back Squat", ..., "provenance": "legacy-auto"}   // should have been purged

● restoreBackup — version-1 compatibility on a current database
  › rewrites legacy canonical ids in restored programs and logs
  Expected: "surviving-squat-id"
  Received: "removed-squat-id"
```

The strongest of the new tests is `produces the same stores as migrating the
same records in place`: it seeds the v9 fixture, reads the raw pre-migration
records, migrates in place, snapshots, then restores the *same* records as a v1
file into a fresh already-upgraded database and asserts the snapshots are equal.
It also asserts the raw records differ from the migrated ones, so the comparison
cannot pass for a restore that did nothing. Helpers are reused, not restated.

### 7-C. Extraction into `src/lib/storage/migrations/v10Identity.ts` — DONE

`createMigrationContext`, `migrateProgram`, `migrateLog`, `classifyAliases` and
the four guards moved there; `appDb.ts` shrank by ~290 lines and now imports
them. The module header states that these transforms are for migration, not
reads, so nobody reintroduces the per-read normalization the spec replaced.
`createMigrationContext` takes `normalizationOverrides` as a **required** third
argument, so the value can no longer be silently inherited from a context that
was only correct inside the v10 upgrade.

First RED was the missing module:

```
Cannot find module './v10Identity' from 'src/lib/storage/migrations/v10Identity.test.ts'
```

### 7-D. `dispatchAfterWrite` and the event name — DONE

`dispatchAfterWrite` now lives in `identityEvents.ts` beside
`IdentityWriteOptions`; the three byte-identical copies are gone.
`EXERCISE_IDENTITY_CHANGED_EVENT` is exported and used by the dispatcher.

**Deliberate exception, worth a reviewer's eye:** the 20 remaining literals are
all in test files, and I left them as literals. A test that imported the
constant would agree with a wrong value; the literal in the tests is what
actually pins the wire name. There are no production listeners yet (Tasks 8+
add them) — the constant exists for those. Noted in the file.

Mutation: inverting `options?.dispatch !== false` to `=== false` →
**8 failed, 27 passed** across the three repo suites.

### 7-E. Guard-scheme naming and recipe — DONE

`mapArray` → `mapArrayOrKeep`. The Task 6 recipe comment is in the new module's
header **verbatim** (three ordered rules plus the malformed-shape-test-and-
mutation requirement), followed by the policy exception the brief asked for:
unreadable records pass through untouched **except aliases, which
`classifyAliases` drops**, with the reason.

### 7-F. Real-browser `structuredClone` divergence — FIXED

A private `mappedArrayField(key, value, mapper)` returns `{}` instead of
`{ key: undefined }` when the field is not a walkable array, so a malformed or
absent field is left off the rewritten record entirely and the key set matches
what was stored. Applied at all eight traversal sites (program days/overrides/
import warnings/suggestions, day sections, section groups, group exercises, log
entries).

Since fake-indexeddb cannot see this, the tests are on the pure helpers, with
`hasOwnProperty` plus `toStrictEqual`. Mutation = the pre-fix implementation
(`field: mapArrayOrKeep(...)`) restored byte-for-byte afterwards:

```
✕ does not add an entries key to a log that predates the field      Expected: false  Received: true
✕ does not add days or overrides keys to a program that lacks them  Expected: false  Received: true
✕ does not add a sections key to a day that lacks one               Expected: false  Received: true
✕ does not add a groups key to a section that lacks one             + "groups": undefined,
✕ does not add a suggestions key to an import warning that lacks one + "suggestions": undefined,
Tests: 6 failed, 1 passed, 7 total
```

Honest caveat on one of the five: the *original* code guarded `suggestions` with
a truthiness check, so that specific case would have passed on the real old
code; my reverted variant dropped that guard. The other four are genuine
regressions of shipped behaviour. The new form covers all five uniformly.

### 7-G. Smaller items

- **Precedence comment replaced.** `classifyAliases`'s collision rule now lives
  in a named `winsCollision` with the real reasoning: two colliding *legacy*
  rows provably share a target (the `outcomes.size === 1 && outcomes.has(...)`
  gate forces it), so their survivor only changes display text; two colliding
  *remembered* rows can disagree, so the newer `createdAt` wins, with
  first-writer-wins for equal or unreadable timestamps. The optional
  improvement was taken. Both orderings are tested; mutation = the old
  first-writer-wins rule → `✕ keeps the newer remembered row on a token
  collision (older row first)`, `1 failed, 6 passed`.
- **`terminated()`** now clears `dbInstance` and `dbPromise` only when
  `dbPromise === attempt`, completing Task 6's capture-and-compare invariant.
  **Not covered by a test** — mutation back to the unconditional clear left
  `appDb.test.ts` + `appDbUpgradeFailure.test.ts` at **80 passed, 0 failed**.
  Same reasoning Task 6 recorded for the failure path: it needs a real race
  between a slow open and a reset, and a timing-dependent test is worse than
  none. Two lines with the reasoning in a comment.
- **`validateNormalizationOverrideInput` decomposed** into
  `validateOverrideTarget`, `resolveModifiers`, `validateModifierOrder`,
  `validateModifierCompatibility`. Each modifier is resolved once and the
  definitions are passed on, so the `modifiersById.get(...)!` lookups are gone.
  Check order and every message are unchanged; the 16 existing tests (one per
  message) stayed green throughout.
- **`getDb` split into `abortOnFailure`/`applyUpgrades`: deferred.** The brief
  marked it optional and the reviewer judged either timing defensible. This task
  already touches `appDb.ts` heavily (−290 lines); reshaping the upgrade
  callback in the same round would bury the two behaviour changes in it.

### 7-H. Standing invariant — PRESERVED

No `IDBObjectStore.add()` anywhere in `src/`; every new write in this task is a
`put`. No new index of any kind, so `by-normalized-alias` remains the schema's
only unique index — and the restore path now actively protects it by deduping
recomputed tokens before issuing the write set.

Check: `grep -rn "\.add(" src/lib/storage src/lib/backup` → no object-store
`add` calls.

---

## Mutation evidence (feature work)

Each mutation was applied to the committed file, the suite run, and the file
restored byte-for-byte (`diff` confirmed) before the next one. Numbers are from
`backup.test.ts` + `appDb.test.ts` together (131 tests).

| # | Mutation | Result |
|---|---|---|
| M1 | export `version: 2` → `1` | 3 failed |
| M2 | drop `normalizationOverrides` from `BACKED_UP_STORES` (and its getAll/put) | 13 failed |
| M3 | skip the duplicate-target check | 3 failed |
| M4 | skip `validateNormalizationOverrideInput` | 3 failed |
| M5 | write the file's aliases verbatim instead of `classifyAliases` | 7 failed |
| M6 | skip `migrateProgram`/`migrateLog` on restore | 2 failed |
| M7 | dispatch the identity event before `await tx.done` | 1 failed |
| M7b | never dispatch | 1 failed |
| M8 | accept a v2 file with no `normalizationOverrides` | 1 failed |
| M9 | validate overrides after the write transaction opens | 6 failed |
| M10 | accept version 3 | 2 failed |
| M11 | skip per-item override shape validation | 1 failed |
| M12 | drop `canonicalNormalizationOverride` on the restore path | 1 failed |
| M13 | `normalizeTargetValue` silently trims an unknown target kind | 1 failed |

Named failures for the correctness-critical ones:

```
M5 → preserves legacy alias ids and defaults a missing provenance
     recomputes normalizedAlias from the alias text
     keeps one row when two aliases recompute to the same token
     purges a legacy alias whose token has no unique concrete outcome
     retains unique legacy aliases and purges ambiguous or noisy ones
     makes a restored alias findable even when the file's own token was stale
     produces the same stores as migrating the same records in place
M6 → rewrites legacy canonical ids in restored programs and logs
     produces the same stores as migrating the same records in place
M7 → dispatches exactly one identity event, after the transaction commits
M9 → rejects duplicate override targets before clearing stores
     treats differently-spelled targets that normalize alike as duplicates
     rejects an unknown movement / modifier / noncanonical order before clearing stores
     leaves the existing workspace intact when the document is rejected
```

**One toothless test found and fixed by mutation, exactly the failure mode the
brief warned about.** The first version of `dispatches exactly one identity
event, after the transaction commits` compared put counts at dispatch time.
M7 (dispatch moved before `await tx.done`) passed: every put is issued
synchronously before the await, so counting them cannot see the ordering. The
test now flips a `txCommitted` flag from the mocked `tx.done` continuation and
asserts the listener saw `true`, and a real-database companion test asserts the
listener can read the restored programs. M7 then failed.

---

## RED evidence summary

| Behaviour | RED reason (actual output) |
|---|---|
| extraction | `Cannot find module './v10Identity'` |
| 7-F key sets | `Expected: false Received: true` ×3, `+ "groups": undefined,`, `+ "suggestions": undefined,` |
| 7-G tiebreak | received `alias-older` / `pull-up` instead of `alias-newer` / `goblet-squat` |
| export v2 | `Expected: 2 Received: 1` |
| v2 restore | `Unsupported backup version: 2. Expected 1.` |
| 7-A | put with `normalizedAlias: "WRONG-TOKEN"`; `aliasRepo.find("RDL")` → `undefined` |
| 7-B | ambiguous `"Back Squat"` retained; `Expected "surviving-squat-id" Received "removed-squat-id"` |
| override validation | 16 failed / 31 passed on the first `backup.test.ts` run |
| canonicalization | `✕ re-derives an override's id and target value from its target text` |

---

## Self-review findings (fixed before committing)

1. **Toothless dispatch-ordering test** — see above. Found by mutation, not by reading.
2. **`deleteDB` hang.** The divergence test deadlocked (120 s timeout, empty output) because I called `deleteDB` while `getDb`'s connection was still open. Fixed with the `resetDbConnection()` the neighbouring tests already use.
3. **`programRepo.save` bumps `updatedAt`,** so `toEqual([demoProgram])` in the rejected-restore test was comparing against a stale timestamp. Now compares against the list read back before the rejected restore.
4. **Unknown `targetKind` was unguarded by a test.** `canonicalNormalizationOverride` throws on it, but only by luck of running before `getDb()`. Added `rejects an unknown override target kind before opening the write transaction`, and mutation-verified it via M13 (a single guard mutation; M9 alone does not fail it, because three separate pre-transaction call sites reject an unknown kind).
5. **`warning.suggestions!`** non-null assertion in the first draft of the extraction; `mappedArrayField` now takes `T[] | undefined` so no assertion is needed.
6. **Existing tests that had to change** (all in `backup.test.ts`, none in `sessionPersistence.test.ts`): the export-version assertion (1 → 2), the two store-list assertions (7 → 8 stores), the legacy-provenance test's fixture alias (`RDL` → `Romanian Deadlift`, because that suite does not mock the catalogue and `rdl` has no outcome in the shipped 3,175 entries, so `classifyAliases` correctly purges it), and the "does not call getDb when validation fails" fixture (version 2 → 3, since version 2 is now supported). `appDb.test.ts` needed the moved import and the third `createMigrationContext` argument.

## Deliberately deferred

- **`getDb` `abortOnFailure`/`applyUpgrades` split** (7-G) — optional per the brief; reasoning above.
- **`terminated()` has no test** — reasoning above; the mutation genuinely passes.
- **appDb's v8 block still does `mapArrayOrKeep(entry.sets ?? [], …)`,** which can turn an absent `sets` into `[]` on an entry that is rewritten because a *different* entry changed. Pre-existing, outside the v10 traversal 7-F named, and it needs an entry that violates its own type to be observable. Flagging rather than fixing in this round.
- **A hand-crafted `version: 1` file that also carries `normalizationOverrides` has that field ignored.** Version 1 by definition has none, so this only affects files nothing produces; rejecting it seemed worse than ignoring it.
- **`ImportClient.tsx` untouched** (Task 9, ruled twice). **Fresh-install `metrics` creation untouched** (out of scope).

## Gates

```text
$ bun run test -- --runInBand
Test Suites: 94 passed, 94 total
Tests:       1194 passed, 1194 total
Snapshots:   0 total
Time:        20.377 s

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(clean)

$ bun run lint
$ eslint .
(clean)

$ bun run build
✓ built in 2.34s
(only the pre-existing >500 kB chunk advisory)

$ git diff --check
(clean)
```

## What a reviewer should scrutinise most

1. **Running the normalization pass on v2 restores as well as v1** — the one place I went past the spec's literal wording, with reasoning in `backup.ts`.
2. **The purge semantics of restoring a v2 file:** a `legacy-auto` row whose token no longer has one unique outcome is dropped on restore. Deliberate (it is the migration's rule), but it means a restore is not byte-identical to the file when the catalogue has moved under it.
3. **`createMigrationContext(..., [])` at both call sites** — whether "overrides are read-time only" is the right call for restore.
4. **Test literals for the identity event name** (7-D) — I kept them on purpose; if the controller wants the constant everywhere, that is a one-line sed and the loss of a real check.
5. **`produces the same stores as migrating the same records in place`** — the divergence guard. Its value depends entirely on `snapshotNormalizedStores` covering the stores that matter (programs, logs, aliases, overrides; not profile/userExercises/bodyweight/promptPresets, which the pass does not touch).
6. **`terminated()`** — the one behaviour change in this task with no test.

DONE

---

# Fix round 1

Commits (Codex follow-up items are detailed in `task-6-codex-followup-report.md`):
- `ac887ec` — `fix: validate the restored profile and abort a failing restore` (C1)
- `49a9a81` — `fix: classify only aliases that arrive without a provenance` (Q1b ruling + I1)
- `62a2b13` — `fix: close migration rejection paths and preservation gaps` (Codex C-2/C-3/C-4, gaps a–d, I2, I3, m2)
- `44d6328` — `refactor: drop the unfalsifiable override id guard` (m1)
- `b1706fc` — `test: name the alias drop rule after what it measures`

## C1 — a malformed `profile` destroyed the entire workspace

Reproduced exactly as reported, on a real database:

```
● rejects a primitive profile without destroying the workspace
  DataError: Data provided to an operation does not meet requirements.
      > 316 |   if (b.profile) tx.objectStore("profile").put(b.profile);

  (with the throw assertion relaxed, the second half:)
  expect(received).resolves.toEqual(expected)
  - Expected  - 126      // the seeded program
  + Received  +   1      // Array []
```

Fixed in three layers, increasing in generality:

1. **Validation before the transaction.** `profile` must be absent, null, or an
   object with a string `id`. It was the only backed-up field with just a
   truthiness check while every other store got `isArrayOfObjects` + `hasIds`.
2. **Nothing but `clear`/`put` inside the transaction.** `migrateProgram` and
   `migrateLog` now run to completion *before* `db.transaction(...)`, so a throw
   from a transform cannot land after the clears. I took the reviewer's suggested
   shape; it makes the wrapper below belt-and-braces rather than the only defence.
3. **The structural net.** The transaction body is wrapped: on any throw it
   aborts, marks the resulting AbortError handled, and rethrows the original
   cause. Each issued write's own rejection is marked handled as it is issued
   (`issue(...)`), because `tx.done` is the authoritative outcome and aborting
   otherwise turns every in-flight request into a separate unhandled AbortError —
   which is exactly what happened on the first attempt and is now prevented by
   construction rather than by luck.

Tests (real database, `appDb.test.ts`): three rejection cases (primitive, no id,
non-string id) each asserting the pre-restore programs *and* an empty logs store
survive; an `accepts an absent or null profile` companion; and a separate
`aborts the transaction when a write throws after the stores are cleared` that
patches `IDBObjectStore.prototype.put` to throw for the `programs` store, so the
net is tested independently of any one field's validation.

Mutations:
- drop the profile validation → **3 failed, 133 passed**. Worth noting what
  *survives* this mutation: the workspace is intact (the net catches it), and the
  three tests fail only on the error message. Defence in depth, working.
- drop the `tx.abort()` branch → **1 failed, 135 passed** (the net test).

The first draft of the net test was vacuous and I caught it before committing: it
patched `put` for the `logs` store, but `programs` is written *before* `logs`, so
the program had already been re-put and the assertion held either way. Re-pointed
at `programs`, it failed as it should.

## Q1b ruling — the v2 purge narrowed, recompute kept unconditional

Implemented as ruled, and I agree with the reasoning; the argument I had not made
myself is the decisive one: **a live v10 database never re-classifies on read**,
so a `legacy-auto` alias that later becomes ambiguous keeps working there
indefinitely. Purging it on restore made restore strictly more destructive than
the state it claimed to reproduce.

`classifyAliases` now classifies only rows that arrive **without** a provenance —
a pre-v10 database row, or a version-1 file. Rows carrying `legacy-auto` or
`remembered` keep it. Recompute-and-dedupe still applies to every row, in every
version. The v10 migration is unchanged (pre-v10 rows have no provenance).

One consequence I had to follow through: rows arriving already classified skip
the outcome gate, so two colliding `legacy-auto` rows *can* genuinely disagree
about their target — the previous comment's claim that colliding legacy rows
provably share a target is only true of rows classified here. `winsCollision` now
applies newest-`createdAt` within a provenance class rather than leaving that case
to `getAll`'s key order, and its comment says which rows the "provably agree"
argument covers.

`backup.ts`'s comment (the one the reviewer flagged as implying the opposite) is
rewritten to separate the two jobs explicitly: integrity for every version,
classification only for rows with no provenance, each with its reason.

## I1 — coverage for the ruled behaviour

New tests, all mutation-verified:

- `keeps a $name alias whose token is now an underspecified choice` (real
  database, both `legacy-auto` and `remembered`). RED before the fix:
  `aliasRepo.find("Back Squat")` → `undefined`.
- `still recomputes a stale token on an already-classified alias` — the integrity
  half, which must *not* be narrowed with the purge.
- `keeps the newer legacy-auto row on a token collision` (both orderings, pure
  helper).

Mutations:
- the exact one the reviewer used (any row carrying a provenance skips
  re-classification → revert the gate to remembered-only): **4 failed, 144
  passed**. It left the suite green before this round.
- trust the file's token in the already-classified branch: **8 failed, 140
  passed**.
- revert `winsCollision` to remembered-only: **1 failed, 8 passed**.

## I2 — `terminated()` is testable, and my Task 7 report was wrong to imply otherwise

Correcting the record: I reported the mutation as passing, which was true of the
suite as it stood, and I over-generalised from the sibling `dbPromise` invariant.
The reviewer is right that this one discriminates. New `appDbConnection.test.ts`
wraps `openDB` to record every open and its callbacks, then fires the *first*
open's `terminated` late, after a reset installed a second connection.

I could not use "a third open occurs" as the observable — the pre-guard code
already compared `dbPromise === attempt` for `dbPromise`, so no reopen happens
either way. What discriminates is the harm itself: with the unconditional
`dbInstance = undefined`, the live connection is orphaned, so a later
`resetDbConnection()` cannot close it. The test asserts no reopen *and* that the
live connection is closed after a reset.

Mutation (restore the unconditional clear): **1 failed, 3 passed**. The test
closes its subject in a `finally`, because an orphan otherwise blocks the next
test's `deleteDatabase` and the mutation shows up as a 120-second hang instead of
a failure — which is how I first hit it.

## I3 — override validation against the file's own custom exercises

New test `validates an override against a custom exercise from the same file`:
restores a v2 document carrying `userExercises: [{ id: "user-custom-1", … }]` and
an `exercise-id` override targeting it, then asserts both the override and the
custom exercise landed.

Mutation (validate against an empty `Set` instead): **1 failed, 139 passed**.
Confirms the wiring, and that the failure mode would have been a permanently
unrestorable backup with an error blaming the user's file.

## m1 — the unfalsifiable id guard, deleted

`hasIds(doc["normalizationOverrides"])` is gone. `canonicalNormalizationOverride`
derives the id from the target, so no input could ever fail that check. A comment
now says why there is no id check, so nobody adds it back. Reviewer and I agreed;
this is the class the recipe comment legislates against.

## m2 — the divergence guard now covers the alias resolution context

The v9 divergence fixture gains one alias whose token is the only thing that can
give the fixture's otherwise-unknown "Mystery lift" slot a canonical id, plus an
anti-vacuity assertion that the in-place migration really did resolve it.

Mutation (pass `[]` as the alias context in restore): **1 failed, 139 passed**.
It left the suite green before.

**Finding worth recording, from getting this wrong first.** My first attempt used
a *legacy* alias and failed: `readCanonicalIdForName("Mystery lift")` →
`undefined`. A legacy alias is only retained when its token already has exactly
one concrete catalogue outcome — in which case the name resolves without the alias
— so a row classified in that pass cannot be what the fixture measures.

**Corrected in fix round 2 — see I-3 there.** I generalised that into "after v10
no `legacy-auto` alias can ever be the sole reason a name resolves", which is
false, and the ledger repeated it. The narrow true claim is about rows classified
in-process, at the moment they are classified.

## Concurrency with Task 8

Staged by explicit path throughout; no `git add -A`. `src/lib/programs/types.ts`
was dirty from the other agent for most of this round and I did not touch it (my
type union landed in `b2ac7e9`, before the fix round).

Suites I could **not** attribute to myself, both from the Task 8 agent's
in-flight work:

- `src/lib/import/parser.test.ts` — 3 failures.
- `src/lib/catalog/shippedDisambiguations.test.ts` — 7 failures, and the one
  `bun run typecheck` error (a fixture missing `provenance` on `AliasDocument`).
  The file is untracked and was created after my last commit.

I checked each rather than assuming: my own lane runs clean.

## Gates

```text
$ bun run test -- --runInBand src/lib/backup src/lib/storage src/lib/catalog
Test Suites: 1 failed, 17 passed, 18 total     (the failure is the untracked
Tests:       7 failed, 272 passed, 279 total    shippedDisambiguations.test.ts)

my lane, individually:
  backup.test.ts                    49 passed
  appDb.test.ts                     93 passed
  migrations/v10Identity.test.ts    16 passed
  appDbUpgradeFailure.test.ts        6 passed
  appDbConnection.test.ts            4 passed   (new suite)
  aliasRepo / userExerciseRepo / normalizationOverrideRepo / sessionPersistence
  and the rest of src/lib/storage — all PASS

$ bun run test -- --runInBand          (whole repo)
Test Suites: 1 failed, 94 passed, 95 total
Tests:       3 failed, 1235 passed, 1238 total   (src/lib/import/parser.test.ts)

$ bun run typecheck
one error, in the other agent's untracked shippedDisambiguations.test.ts;
no error in any tracked file

$ bun run lint
(clean)

$ bun run build
✓ built in 3.68s   (only the pre-existing >500 kB chunk advisory)

$ git diff --check
(clean)
```

Floor check: before this round the repo was at 94 suites / 1194 tests. My lane
added a suite and 44 tests (1238 total now, of which the Task 8 agent contributed
some); the 3 remaining failures are theirs.

## What a reviewer should scrutinise most, this round

1. **C1's third layer** — `issue(...)` swallowing each request's individual
   rejection. It is correct because a failed request aborts its own transaction
   and `tx.done` carries the cause, but it is the kind of `catch(() => {})` that
   deserves a second reading.
2. **The v2 purge narrowing at the seam with `remembered`** — a file can now make
   a provenance load-bearing on restore, which is what makes the Task 6
   "fixture pins a shape production never wrote" note less hypothetical than it
   was.
3. **`winsCollision` generalised to newest-within-class** — new behaviour for
   colliding `legacy-auto` rows arriving from a file.
4. **C-4 closing a retired connection** (detailed in the Codex report) — the one
   place I chose to break a caller rather than leak.

DONE


---

# Fix round 2

Commits:
- `1fdacdf` — `fix: scope alias classification by file version, not by row` (m-2 ruling)
- `00188b3` — `fix: report the real cause when a restore write is rejected` (I-1, I-2, m-4)
- `c1f25da` — `fix: one alias-token rule, and order collisions by instant` (m-5, m-6, m-1 edges)
- `4864676` — `test: seed the second store the profile guard is meant to protect` (m-3)
- `f001285` — `docs: correct the claim that a legacy-auto alias cannot matter` (I-3)

## I-1 — `issue()` threw away the real cause

Fixed with the recipe from `appDb.ts`: the per-request catch keeps
`writeError ??= error`, and the catch block throws `writeError ?? error`. The
`?? error` fallback preserves today's behaviour on the synchronous-throw path,
where no request ever failed.

Mutations:
- discard the request cause (the previous code): **1 failed, 146 passed** — the
  new I-2 test.
- `=` instead of `??=`: **147 passed, 0 failed.** Not a gap, and worth the detail
  because I went looking for a scenario that would discriminate and measured why
  none exists. I probed fake-indexeddb directly with a colliding put followed by a
  put to another store:

  ```
  PROBE outcomes at catch time: ["failing:ConstraintError"] done:AbortError
  PROBE outcomes after a tick:  ["failing:ConstraintError","after:AbortError"]
  ```

  The AbortError rejections of requests queued behind the failing one arrive a
  tick *after* `tx.done` rejects — so by the time the catch reads `writeError`,
  nothing has overwritten anything, with `=` or `??=`. I kept `??=` because that
  ordering is not something to depend on across engines and it costs one
  character, and I wrote the measurement into the comment so nobody "simplifies"
  it later on the grounds that a mutation does not catch it.

## I-2 — the asynchronous rejection path on restore

New test `aborts and reports the real cause when a write is rejected
asynchronously`: patches `IDBObjectStore.prototype.put` for the `aliases` store to
force two rows onto one `normalizedAlias`, so the second write is rejected by the
unique index rather than throwing.

RED before I-1: `rejects.toMatchObject({ name: "ConstraintError" })` received
`AbortError`. The rollback was reporting itself.

The test also carries a `bodyweight` row, written *after* the aliases, so the
abort rejects a second request too — that is what makes the first-cause-wins
question observable at all (see the probe above for why it still is not, under
this engine).

Mutation (drop the `tx.abort()` branch): **1 failed, 146 passed** — the
rollback assertion.

## I-3 — the false insight, corrected in code and pinned by a test

You are right, and the refutation reproduces. Corrected in three places:

- `appDb.test.ts`, the divergence fixture's comment — now says the redundancy
  claim is about rows classified *in that pass, at that moment*, and explicitly
  records that the earlier version claimed otherwise.
- `v10Identity.ts`, at the outcome gate — a new paragraph states what the gate
  does **not** establish, gives both mechanisms (a version-2 file's rows are never
  re-classified under the new scope rule; the resolver consults `context.aliases`
  before the underspecified check and before catalogue name matching; and
  regenerating the catalogue does the same to a row retained under an older one),
  and says in as many words: do not treat "drop every legacy-auto row" at the
  September 30 removal as safe on the grounds that they cannot matter.
- this report, above.

Prose is not enough for something a future task will be tempted by, so the
general case is now a test: `lets a restored legacy-auto alias be the only reason
a name resolves` restores the same program twice, once with no aliases (slot
resolves to `undefined`) and once with a `legacy-auto` "Back Squat" row (slot
resolves to `barbell-back-squat`).

Verified it is load-bearing on the scope rule: forcing v2 files through scope
`"all"` fails it along with the two other v2 retention tests (**3 failed, 96
passed**).

## m-2 ruling — classification scoped by file version

`classifyAliases` takes an explicit `AliasClassificationScope`:

- `"all"` — the v10 upgrade and version-1 files. Both predate the provenance
  field, so a provenance found in one was hand-written and is not evidence that
  anything classified the row.
- `"unclassified"` — version-2 files, whose provenance was written by a build that
  did classify the row.
- `remembered` is retained under both (spec line 560).

This also closed a second instance of the same hole I had not been asked about:
the **migration** was reading a hand-planted provenance on a pre-v10 row as
evidence of classification, since the pre-Task-7 restore wrote alias rows verbatim
behind a string-id check. That is now `"all"`, restoring Task 6's semantics.

RED: `purges an ambiguous v1 alias carrying a hand-added legacy-auto provenance`
→ received the retained row. (The unrecognized-provenance variant of that case
already passed: an unknown value falls through to classification.)

Mutations:
- row-level rule, ignoring the scope: **3 failed, 163 passed** (v1 smuggling, the
  migration's hand-planted row, and the pure scope test).
- restore passes `"unclassified"` for a v1 file: **1 failed, 165 passed**.
- restore passes `"all"` for a v2 file: **2 failed, 164 passed**.
- the v10 migration passes `"unclassified"`: **1 failed, 165 passed**.

## m-3 — the vacuous log assertion

The rejected-restore cases now seed a log and assert it survived, instead of
asserting an empty store is still empty. Mutation (drop the profile validation):
**3 failed, 95 passed**, where the same mutation previously left that line
untouched.

## m-4 — `issue` renamed

`issueTransactionWrite`, typed `Promise<IDBValidKey | void>`. Recorded honestly in
the comment that the type cannot carry the invariant — an `async` validation
returning `Promise<void>` would still type-check — so the name is what carries it.

## m-5 — `putRaw` aligned with `classifyAliases`

Both now call one exported `aliasLookupToken(alias)`, which returns the token and
which field it came from, or `undefined` when nothing is usable. `classifyAliases`
drops those rows; `putRaw` rejects them rather than storing a row `find()` could
never reach.

RED (restore `putRaw`'s old unguarded `normalizeExerciseName(input.alias)`):
**3 failed, 12 passed**, with `Received message: "value.toLowerCase is not a
function"` — the exact row `b1706fc` taught the classifier to recover.

Kept rather than deleted, per the Task 6 brief's interface mandate. Still no
production callers; it is now at least consistent with the path that has them.

## m-6 — `saveMany`, and a push-back on half of it

Input-shape validation (`assertRememberedInput`) moved before the transaction, so
a rejected call no longer leaves a readwrite transaction dangling. New test
asserts no `readwrite` transaction is opened at all for either input-shape error;
mutation (validate inside the loop again): **2 failed, 15 passed**.

**The conflict check stays inside the transaction, deliberately.** Moving *that*
out would be a downgrade, not a fix: it needs the stored rows, and a
read-then-write across two transactions lets a concurrent tab claim the same token
in between — at which point this write takes a fresh UUID for a token another row
already holds and the unique index rejects it. That is the write-rejection class
this whole effort exists to avoid. The current wart is benign by comparison: the
throw happens after `getAll` and before any `put`, so the transaction commits
nothing and only a brief readwrite lock is lost. `normalizationOverrideRepo.save`
is not a counter-example — its pre-transaction read is a *different* store
(`userExercises`), so it has no read-write race to lose. Reasoning is in the code.

## m-1 edges — both fixed

`winsCollision` compares `Date.parse` instants, not strings: these rows can come
from a hand-edited file and ISO 8601 permits an offset, so
`…T23:00:00.000-02:00` sorted before `…T00:00:00.000Z` while being an hour later.
And an unreadable timestamp now loses to a readable one instead of winning by
arriving first — no evidence should not outrank evidence.

Two RED tests before the change: `compares createdAt as an instant, not as a
string` and `prefers the row whose createdAt can be read at all` (**2 failed, 20
passed**).

## Number corrected from fix round 1

The `progression` claim in `task-6-codex-followup-report.md` is fixed in place.
Re-measured with the key set held constant, the **value-only** mutation is caught
by **exactly one test** — the preservation test — so the gap I closed was real and
was completely uncovered. My earlier "25 malformed-document tests catch it too"
came from a mutation that wrote `progression: []` unconditionally and therefore
*added* the key to fixtures that never had one; that key-set-changing variant
fails 30 tests in the same sweep. Substance held, number did not.

## Gates

```text
$ bun run test -- --runInBand src/lib/storage src/lib/backup src/lib/catalog
Test Suites: 18 passed, 18 total
Tests:       306 passed, 306 total

my lane, individually:
  backup.test.ts                    49 passed
  appDb.test.ts                     99 passed
  migrations/v10Identity.test.ts    22 passed
  aliasRepo.test.ts                 17 passed
  appDbConnection.test.ts            4 passed
  appDbUpgradeFailure.test.ts        6 passed

$ bun run test -- --runInBand           (whole repo)
Test Suites: 1 failed, 98 passed, 99 total
Tests:       3 failed, 1333 passed, 1336 total

$ bun run typecheck
(clean)

$ bun run lint
(clean)

$ bun run build
✓ built in 2.16s   (only the pre-existing >500 kB chunk advisory)

$ git diff --check
(clean)
```

The one failing suite is `src/components/import/ImportClient.remember.test.tsx`
(3 tests) — the import agent's lane, attributed by filename and not touched.
Typecheck and lint were both dirty from that lane mid-round and are clean again
now; nothing in my lane contributed to either.

## What a reviewer should scrutinise most, this round

1. **The scope rule's third caller** — I applied `"all"` to the v10 upgrade,
   which is a behaviour change beyond the ruling's letter (it restores Task 6
   semantics for a hand-planted provenance on a pre-v10 row). Argued in the commit
   message and pinned by a test; worth confirming it is wanted.
2. **`saveMany`'s conflict check staying inside the transaction** — the one place
   I declined half a minor, with reasoning above.
3. **`??=` in `issueTransactionWrite`** — kept although no mutation catches it,
   with the probe measurement recorded as the reason.
4. **The I-3 test** — whether restoring the same document twice in one test is
   the clearest way to show the alias is the sole cause.

DONE
