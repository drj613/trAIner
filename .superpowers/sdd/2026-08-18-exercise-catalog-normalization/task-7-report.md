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
