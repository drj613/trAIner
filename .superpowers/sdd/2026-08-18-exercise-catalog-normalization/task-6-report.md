# Task 6 — Persisted identity migration report

## Delivered boundary

- `DB_VERSION = 10`. The v9 → v10 upgrade creates `normalizationOverrides`, normalizes every stored catalogue reference in the same upgrade transaction, classifies legacy aliases, drops the obsolete `metrics` store, and dispatches one identity event after the open resolves.
- `AliasDocument.provenance` is now required (`"legacy-auto" | "remembered"`).
- New `aliasRepo` surface: `saveMany`, `putRaw`, `replaceRemembered`, `removeMany`, with `save` delegating to `saveMany`. Alias save now rejects a conflicting existing target instead of silently overwriting it.
- New `normalizationOverrideRepo` with deterministic target keys and full save validation.
- New `dispatchExerciseIdentityChanged()` / `IdentityWriteOptions` in `src/lib/catalog/identityEvents.ts`; every identity-affecting repository write dispatches once after `tx.done` and can be suppressed with `{ dispatch: false }` for internal/bulk paths.
- `userExerciseRepo` save/remove dispatch after commit.
- `metricsRepo` and its test are deleted; nothing references them.
- `backup.ts` restore is now v10-safe: it no longer transacts against or clears `metrics`, and it defaults a missing/unrecognized alias `provenance` to `legacy-auto` while preserving every other stored field verbatim.

## Work done in this (resumed) session

The previous agent left Task 6 implemented but uncommitted, with one red test. I:

1. Fixed the single failure: `restoreBackup` put v1 alias records verbatim, so a pre-provenance alias was restored without a `provenance` field. Restore now fills in `legacy-auto` (matching what the v10 migration assigns) and preserves `id`, `alias`, `normalizedAlias`, `canonicalExerciseId`, and `createdAt` untouched. Scope held to restore safety — no backup v2 envelope, no new export stores, no override export. That is Task 7.
2. Audited the whole uncommitted diff against every Task 6 requirement (below).
3. Closed the one real coverage gap I found: no test pinned the fresh-database path (`oldVersion === 0`), where `metrics` does not exist and no identity event should fire.

## Requirement-by-requirement verification

| Requirement | Status | Evidence |
| --- | --- | --- |
| v10 creates `normalizationOverrides`, backfills atomically in the same upgrade transaction, deletes `metrics` only when present | Met | `appDb.ts` `if (oldVersion < 10)` block: creates the store, reads/writes programs, logs, aliases through the upgrade `tx`, and guards `deleteObjectStore("metrics")` with `objectStoreNames.contains`. Fresh-DB test added this session. |
| Migration rewrites only explicit catalogue references — never a routine slot `id` or a log `exerciseId` | Met | `migrateProgramExercise` / `migrateLogEntry` spread the record and set only `canonicalExerciseId`. `appDb.test.ts` asserts `id: before.slotId` and `exerciseId: before.slotId` survive. |
| Sets, notes, dates, performed labels, unknown IDs preserved verbatim | Met | Fixture stores nontrivial sets (incl. a `rawCell` AMRAP set), exercise/group/day/log notes, `performedAt`/`performedDate`/`completedAt`, tags, and an unknown `unknown-catalog-id`. Test compares them to pre-upgrade values and asserts `unknown: "unknown-catalog-id"`. |
| Name-only canonical IDs populated only for unique exact concrete matches | Met | Resolver result gated on `specificity === "exact" && concreteExerciseId`. Tests: `High Bar Back Squat` → `barbell-high-bar-squat`; ambiguous `Back Squat` and unknown `Mystery lift` stay unset in both programs and logs. |
| Alias provenance/classification preserves remembered aliases, purges ambiguous/noisy legacy-auto | Met | `classifyAliases` short-circuits `remembered`; otherwise drops empty, noisy (`\d|@|amrap|rpe|rir|reps|sets`), alternative-bearing, and underspecified tokens, and requires exactly one concrete outcome equal to the redirected target. Test: `RDL` kept as `legacy-auto`, `Back Squat` and `3x8 @ RPE 7` purged, `My high bar` kept as `remembered`. |
| Override validation: exact allowlist, canonical order, implication closure, exclusions, exclusive groups, family maximum, null-movement rule | Met | `validateNormalizationOverrideInput` covers all seven plus unknown movement/modifier, duplicates, and unknown targets. `it.each(invalidOverrideInputs())` runs nine negative cases and also asserts nothing was persisted. |
| Every identity-affecting write dispatches `trainer-exercise-identity-changed` exactly once, after commit; bulk ops and the migration dispatch once total | Met for this task's scope | Alias `saveMany`/`removeMany`/`replaceRemembered`/`putRaw`, override save/remove, and user-exercise save/remove all dispatch after `await tx.done`; each has a test asserting `toHaveBeenCalledTimes(1)` and that a listener firing at that moment can already read the committed data. The migration dispatches once after the open resolves, and only when `oldVersion > 0`. Backup restore's dispatch is explicitly Task 7's (plan Task 7: "Restore atomically and dispatch one identity event after commit"). |
| A second migration pass / second database open is a byte-for-byte no-op | Met | `snapshotNormalizedStores()` (stable JSON over programs/logs/aliases/overrides) is identical across `resetDbConnection()` + reopen. Note the honest limit below. |

## TDD evidence

RED for the resumed failure (pre-existing, left by the interrupted session):

```text
bun run test -- --runInBand src/lib/backup/backup.test.ts
FAIL restoreBackup v10 store safety › preserves legacy alias ids and defaults missing provenance before Task 7
```

GREEN after the restore fix:

```text
bun run test -- --runInBand src/lib/backup/backup.test.ts
PASS: 1 suite, 33 tests
```

The fresh-database test I added was green on first run, because the guarded code already existed. To prove it has teeth rather than asserting a tautology, I mutated `appDb.ts` (`shouldDispatchIdentityChange = true` and an unguarded `deleteObjectStore("metrics")`) and re-ran:

```text
✕ creates a fresh v10 database without a metrics store and without an identity event
Tests: 1 failed, 21 passed, 22 total
```

Then reverted the mutation byte-for-byte and confirmed green.

## Gates

```text
bun run test -- --runInBand src/lib/storage src/lib/backup/backup.test.ts
Test Suites: 11 passed, 11 total
Tests:       123 passed, 123 total

bun run test -- --runInBand
Test Suites: 92 passed, 92 total
Tests:       1103 passed, 1103 total

bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(clean)

bun run lint
$ eslint .
(clean)

bun run build
✓ built in 1.53s   (only the pre-existing >500 kB chunk advisory)

git diff --check
(clean)
```

Console noise observed: React Router future-flag warnings, one intentional persistence error-path log, and the Vite large-chunk advisory. All pre-existing.

## Files changed

- `src/lib/programs/types.ts` — `AliasDocument.provenance` required.
- `src/lib/storage/appDb.ts`, `appDb.test.ts`, `appDb.testFixtures.ts` (new).
- `src/lib/storage/aliasRepo.ts`, `aliasRepo.test.ts`.
- `src/lib/storage/normalizationOverrideRepo.ts` (new), `normalizationOverrideRepo.test.ts` (new).
- `src/lib/storage/userExerciseRepo.ts`, `userExerciseRepo.test.ts`.
- `src/lib/catalog/identityEvents.ts` (new).
- `src/lib/backup/backup.ts`, `backup.test.ts`.
- Deleted: `src/lib/storage/metricsRepo.ts`, `metricsRepo.test.ts`.
- Task 1–5 files touched, forced by making `provenance` required — flagging loudly as instructed:
  - `src/lib/catalog/identity.ts`: `IdentityAlias` now `Omit<AliasDocument, "provenance"> & { provenance?: ... }` so the resolver context still accepts alias records without provenance. Type-only change.
  - `src/lib/import/resolution.ts`: `AliasSaveInput` gains `provenance: "remembered"` and `dedupeAliasResolutions` sets it — required because import-created aliases are user-remembered.
  - `src/lib/import/importConstraint.test.ts`: expectations updated for that field.
  These are the minimum edits that keep the required field honest end to end; no behavior in Tasks 1–5 changed.

## Self-review findings

- Verified nothing in `src/` still imports `metricsRepo` or opens a `metrics` store outside old-version test fixtures.
- Verified `aliasRepo.saveMany` stages by `normalizedAlias`, so repeats inside one call reuse the existing `id`/`createdAt` and a conflicting target in the same batch throws before any `put`.
- Verified the migration's identity context passes `normalizationOverrides: []`, which is correct: the override store is created empty in the same upgrade, so no override can exist yet.
- Verified `deleteObjectStore` still runs inside the live versionchange transaction (only IDB request awaits precede it, no macrotask yield).
- Confirmed `save`/`remove` single-item paths delegate to or mirror the bulk commit-then-dispatch ordering, as the brief requires.

## Deliberately deferred (minor)

- `normalizationOverrideRepo.save` opens its transaction as `readwrite` over `["normalizationOverrides", "userExercises"]` although `userExercises` is only read. Broader lock than strictly needed; harmless locally, not worth splitting into two transactions and losing the single-transaction validation read.
- The "second pass is a no-op" test proves a second *database open* changes nothing. It cannot re-enter the `oldVersion < 10` branch without bumping the version, so migration-function idempotency is proven indirectly (the migrate helpers are pure and not exported).
- `noisyLegacyAlias` will purge a legacy-auto alias whose text contains `set`/`rep`/`rpe`. Intentional per spec; remembered aliases are never affected.

## Concerns a reviewer should look at closely

1. **Import save path regression window (cross-task).** `src/components/import/ImportClient.tsx` still calls `aliasRepo.save(entry)` once per alias inside `Promise.all`, so it dispatches N identity events and, more importantly, now *throws* when an incoming raw name already has a stored alias pointing at a different exercise (previously it silently overwrote). Because that call sits before `saveProgram`, the whole import would surface an error instead of saving. The plan assigns ImportClient's move to `aliasRepo.saveMany` to Task 9, so I did not touch it — but Task 9 must also decide what the UI does when `saveMany` rejects on a conflicting remembered alias. This is the one user-visible rough edge open on the branch after this commit.
2. **Backup restore does not yet dispatch an identity event**, and does not yet apply the legacy alias purge rules. Both are explicitly Task 7 per the plan; my restore change is deliberately limited to the store list and provenance defaulting.
3. `appDb.test.ts` module-scope mocks of `@/lib/catalog/exercises` and `@/lib/catalog/registries` (adding `surviving-squat-id`, a `removed-squat-id` redirect, and a `back squat` underspecified rule) apply to every describe in that file, including the older v1–v9 migration tests. Harmless additive data, but worth knowing when reading those tests.

## Fix round 1 — hardening the v10 migration

All three must-fix items and both cheap items are done. I agree with every finding; the severe one is real and I reproduced each failure mode before fixing it.

### Must-fix 1 (severe) — malformed legacy documents no longer abort the upgrade

The traversal now tolerates every missing array and null element instead of throwing, and passes the unreadable record through untouched — a record we cannot read is a record we must not rewrite. Added `mapArray` (returns the value unchanged when it is not an array) and an `isRecord` guard, applied across the *whole* v10 traversal, not only the three named sites:

- `program.days`, `program.overrides`
- `override.replacement` when null, and when it is an array containing null (`migrateProgramReplacement`)
- `day.sections`, `section.groups`, `group.exercises`, and a null exercise element
- `program.import.warnings`, `warning.suggestions`, and a null suggestion element
- `log.entries` and a null entry element

RED evidence — 15 new tests failed first, for exactly the reported reasons:

```text
bun run test -- --runInBand src/lib/storage/appDb.test.ts
Tests: 15 failed, 24 passed, 39 total

   8  TypeError: Cannot read properties of undefined (reading 'map')
   2  TypeError: Cannot read properties of null (reading 'sections')
   2  TypeError: Cannot read properties of null (reading 'canonicalExerciseId')
   1  TypeError: (0 , appDb_2.createMigrationContext) is not a function
   1  TypeError: (0 , appDb_2.classifyAliases) is not a function
```

New coverage: `describe("DB v10 — malformed legacy documents")` seeds each shape as a raw v9 record (typed repositories cannot express "a log that predates the `entries` field"), asserts `openCurrentDatabase()` resolves, and asserts the stored record round-trips deep-equal. One case pairs a malformed program with a healthy one and proves the healthy record is still normalized. New fixture helpers: `seedVersion9Records`, `readRawRecord`, plus an extracted `openEmptyVersion9Database`.

### Must-fix 2 — real idempotency coverage

Agreed the old test was vacuous. `migrateProgram`, `migrateLog`, `classifyAliases`, and `createMigrationContext` (formerly the private `identityContext`) are now exported, and a new `describe("v10 migration idempotency (pure helpers)")` asserts fixed-point behaviour two ways: over the post-migration store contents, and over the raw pre-migration fixture as `f(f(x)) === f(x)` for programs, logs, and aliases.

Mutation evidence (`concreteExerciseId ?? \`${canonicalExerciseId}-x\``, i.e. a suffix appended on every pass):

```text
✕ rewrites canonical references, preserves routine/log fields, and deletes metrics
✕ is a fixed point: migrating already-migrated records changes nothing
✕ is a fixed point from the pre-migration fixture too: f(f(x)) equals f(x)
Tests: 3 failed, 36 passed, 39 total
```

Note what stayed green under that mutation: the old second-open test. That is the reviewer's point demonstrated directly. Reverted byte-for-byte afterwards. The second-open test is kept but renamed to "leaves the stores untouched when the database is reopened", with a comment saying explicitly that it does not carry the idempotency claim.

### Must-fix 3 — `noisyLegacyAlias` deleted

Agreed and removed, no narrowed form kept. Spec line 357 lists exactly three purge reasons — "an underspecified choice, an alias collision, or removed noise" — and all three are already decided by the existing checks: the disambiguation lookup covers underspecified choices, `outcomes.size > 1` covers collisions, and `outcomes.size === 0` covers removed noise (that is what purges `"3x8 @ RPE 7"`, whose normalized token `3x8 rpe 7` has no concrete outcome). The regex added a fourth rule the spec does not authorize, against line 357's "retains and redirects only legacy aliases whose token still has one unique concrete outcome". 70 shipped catalogue names contain a digit or degree sign, so a digit can never be noise on its own.

Both sides are now pinned. Purge side (existing test, comment added): `Back Squat` purged as an underspecified choice, `3x8 @ RPE 7` purged for zero outcomes. Retain side (new test): the fixture gained a `90/90 Hamstring` alias stored against `legacy-90-90-id`, and a mocked redirect to the real shipped `90-90-hamstring`, proving the digit-bearing token is both retained as `legacy-auto` and redirected.

Teeth check on the remaining rule — replacing `if (outcomes.size !== 1 || !outcomes.has(canonicalExerciseId)) continue;` with `if (false) continue;`:

```text
✕ classifies legacy aliases without deleting remembered aliases
Tests: 1 failed, 38 passed, 39 total
```

### Cheap item — after-commit dispatch is now order-sensitive

`aliasRepo.test.ts` gains "dispatches only after the write transaction has actually committed". It patches `IDBDatabase.prototype.transaction` to attach a native `complete` listener to the readwrite transaction and records whether that had fired at dispatch time. The listener is registered at transaction creation, before idb attaches the handler backing `tx.done`, so it always runs first. Restored in `finally`.

Mutation evidence (moving `dispatchAfterWrite(options)` above `await tx.done` in `saveMany`, the reviewer's exact mutation):

```text
✕ dispatches only after the write transaction has actually committed
    Expected: true
    Received: false
Tests: 1 failed, 10 passed, 11 total
```

Per the coordinator's scoping ("at least the `aliasRepo` case"), the user-exercise, override, and migration dispatch tests still assert only "once"; the `aliasRepo` case is the ordering guard.

### Cheap item — override upsert (spec line 563)

`normalizationOverrideRepo.test.ts` gains "upserts a repeated save on the same target to one record with a bumped `updatedAt`". It saves twice on the same target with different modifier sets, faking only `Date` (`doNotFake` covers every timer API, otherwise fake-indexeddb's request callbacks stall), and asserts the id is stable, `updatedAt` advanced, and `list()` holds exactly the second document. Teeth check — appending a random suffix to the deterministic id fails 5 tests including this one.

### Gates after fix round 1

```text
bun run test -- --runInBand src/lib/storage src/lib/backup/backup.test.ts
Test Suites: 11 passed, 11 total
Tests:       142 passed, 142 total

bun run test -- --runInBand
Test Suites: 92 passed, 92 total
Tests:       1122 passed, 1122 total   (was 1103; +19 new tests)

bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(clean)

bun run lint
$ eslint .
(clean)

bun run build
✓ built in 1.36s   (only the pre-existing >500 kB chunk advisory)

git diff --check
(clean)
```

### Disagreements

None. Every finding held up against the code.

### Untouched, per the coordinator's scoping

`src/components/import/ImportClient.tsx` (Task 9), fresh-install `metrics` creation, the three copies of provenance defaulting (Task 7), the exclusive-group-without-overlapping-excludes case, and all backup v2 work.

## Fix round 2 — guarding unreadable leaf fields

Agreed with the ruling and with every repro. Fix round 1 hardened container shapes; this round applies the same principle to the leaf strings those containers hold. `normalizeExerciseName` does `value.toLowerCase()`, so any missing or non-string id/name reaching it aborts the upgrade transaction, and `getDb()` clearing `dbPromise` makes every retry rethrow — storage becomes permanently unopenable. The reachability argument is right too: `restoreBackup` validates aliases with `hasIds` only (`backup.ts:130-136`) and deliberately defers deep validation (`backup.ts:17-23`), so a truncated or hand-edited backup can plant these shapes on a pre-v10 client.

I did not stop at the four named sites. Sweeping every leaf read that reaches `normalizeExerciseName`, `prepareImportName`, or the resolver produced seven guards, each added behind a `isReadableText(value): value is string` helper:

| Site | Guard | Covers |
| --- | --- | --- |
| `canonicalizeExplicitExerciseId` | return the input unchanged unless it is a string | program-exercise and log-entry `canonicalExerciseId`, `warning.suggestions[].exerciseId`, alias targets |
| `migrateProgramExercise` | take the name path only when `exercise.name` is a string | non-string/absent routine exercise names |
| `migrateLogEntry` | `!isReadableText(entry.exerciseName)` replaces the old falsy check | a numeric/object `exerciseName` that used to pass the truthy test |
| `migrateProgram` | spread `program.import` only when it is a record | a non-object `import` (spreading a string would splice char-indexed keys into the record — real corruption, not just a throw) |
| `concreteOutcomesForToken` | skip custom exercises whose `name` is not a string | alias outcome counting |
| `classifyAliases` | skip any alias whose `alias` or `canonicalExerciseId` is not a string | both alias repros |
| `createMigrationContext` | filter non-string-named custom exercises out of the resolution context | the resolver's unique-custom-name fallback (`identity.ts` `customMatch`), reachable only when the catalogue does not match first |

RED evidence — 12 new tests, failing first with the actual TypeError class:

```text
bun run test -- --runInBand src/lib/storage/appDb.test.ts
Tests: 12 failed, 39 passed, 51 total

   8  TypeError: value.toLowerCase is not a function
   3  TypeError: Cannot read properties of undefined (reading 'toLowerCase')
```

The twelfth failure is the non-object `import` case, which is a silent-corruption diff rather than a throw — I found that one while sweeping; it was not on the reviewer's list.

Every guard is individually load-bearing. Removing them one at a time (reverting to the exact prior expression, restoring the file between runs):

```text
guard: canonicalize typeof            Tests: 4 failed, 47 passed, 51 total
guard: exercise.name                  Tests: 1 failed, 50 passed, 51 total
guard: import isRecord                Tests: 1 failed, 50 passed, 51 total
guard: entry.exerciseName             Tests: 1 failed, 50 passed, 51 total
guard: user exercise name in outcomes Tests: 1 failed, 50 passed, 51 total
guard: classifyAliases skip           Tests: 2 failed, 49 passed, 51 total
guard: context userExercises filter   Tests: 1 failed, 50 passed, 51 total
```

Note on test design: my first version of the custom-exercise test used the name `High Bar Back Squat`, and it passed before the guard existed — the catalogue match returns at `identity.ts:316` before the custom-name fallback at `identity.ts:328` is ever reached. I rewrote it around `Mystery lift` (no catalogue match) plus a healthy alias to force both the resolver fallback and the outcome-counting path, and only then was it RED.

### Skip vs pass-through for unreadable aliases: dropped, deliberately

An unreadable alias is dropped, not retained unclassified. Reasoning:

- An alias exists only to short-circuit name resolution. One we cannot read cannot be classified, cannot be shown correctly in a correction UI, and cannot be redirected — but it would still sit on its normalized token and keep pre-empting the new disambiguation flow, which is precisely the failure mode spec line 357 exists to end.
- Retaining one would move the crash into the runtime resolver, not just the migration. `identity.ts:285` reads `normalizeExerciseName(candidate.normalizedAlias || candidate.alias)` over every context alias on every name resolution, so one unreadable alias left in the store would break name resolution app-wide, on every page, forever. (Corrected in fix round 3: this is the strongest argument and it was missing from my original list.)
- A user-authored alias *can* be dropped by this rule, and I originally got two premises wrong here (corrected in fix round 3). The guard sits at `appDb.ts:278`, *before* the `remembered` short-circuit at `appDb.ts:282`, so that short-circuit is not what protects user intent; and `remembered` is reachable pre-v10, because the old `restoreBackup` put alias records verbatim behind `hasIds` only, so a hand-edited v1 backup can carry one onto a pre-v10 client. The ruling still stands: the only aliases dropped are ones that can never be matched, displayed, or redirected, whatever their provenance claims.
- It is consistent with the surrounding rule rather than a new one: the spec already deletes legacy aliases with zero or multiple concrete outcomes. "Zero readable outcomes" is the same disposal, and worst case the user re-teaches the interpretation once through `Remember this interpretation`.
- The routines and logs those aliases might have resolved are untouched; only the shortcut disappears.

Programs, logs, and user exercises take the opposite disposition — passed through byte-identical — because those records *are* the user's data. Dropping a shortcut is recoverable; dropping a workout is not.

### Catalogue count corrected

Both numbers were right about different things, so I measured and wrote down exactly what each one counts. Against the 3,175 shipped catalogue entries: **70** canonical names contain a digit or degree sign; the deleted predicate matched **71** names, the extra one being `front lever reps` (matched by the word list, not a digit); and **6** further entries would have been caught through their aliases (`Farmer Carry with 2-Second March Pauses`, `figure 4 stretch`, ...), for **77** entries in total that the predicate would have wrongly unlinked. The `appDb.ts` comment now states all three figures; the test comment says "70 of the 3,175 shipped catalogue names contain a digit or degree sign".

### Gates after fix round 2

```text
bun run test -- --runInBand src/lib/storage
Tests:       121 passed, 121 total

bun run test -- --runInBand
Test Suites: 92 passed, 92 total
Tests:       1134 passed, 1134 total   (was 1122; +12 new tests)

bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(clean)

bun run lint
$ eslint .
(clean)

bun run build
✓ built in 1.52s   (only the pre-existing >500 kB chunk advisory)

git diff --check
(clean)
```

One small note: `...(program.import && isRecord(program.import) ? ...` keeps the seemingly redundant truthiness check because `isRecord` returns `boolean` rather than a type predicate, and TypeScript needs the `&&` to narrow `program.import` away from `undefined` (`error TS18048` without it). Making `isRecord` a predicate would mis-narrow the spread of the typed containers elsewhere.

### Disagreements

None. All four repros were real, and the sweep found three more sites in the same class.

### Untouched, per the coordinator's scoping

No extraction into `src/lib/storage/migrations/v10Identity.ts` (Task 7). Still untouched: `ImportClient.tsx`, fresh-install `metrics` creation, the three provenance-defaulting copies, the exclusive-group override case, backup v2.

## Fix round 3 — the upgrade now actually aborts

I reproduced the finding independently before touching anything, and it is exactly as described: idb never awaits the `upgrade` callback, so a throw after the first `await` left the versionchange transaction to commit whatever had already been issued.

### Must-fix 1: `try`/`catch`/`abort` around the v10 block

Measured with the same failure injected at the same point (a resolver throw on `removed-squat-id`, which is only reached after `await aliasesStore.clear()`), before and after the fix:

```text
before:  outcome=resolved                                version=9→10  hasMetrics=true  aliasCount=0
after:   outcome=rejected(injected migration failure)    version=9     hasMetrics=true  aliasCount=5
```

The "before" line is the catastrophe in full: the open resolves, the version is stamped 10 so `oldVersion < 10` never runs again, `metrics` survives, programs and logs are half-normalized, and the alias store is permanently empty with no error anywhere. Directly contrary to spec line 528.

The fix wraps the whole `oldVersion < 10` body in `try`/`catch`. Three details worth review:

1. `tx.abort()` is wrapped in its own `try`/`catch`, because a failed IDB *request* aborts its own transaction and `abort()` on a finished transaction throws `InvalidStateError` — which would replace the real cause with a bogus one.
2. The error is **not** rethrown. Rethrowing works (the abort still fails the open) but adds a second unhandled rejection, since idb ignores the callback's promise — jest reported it as a test failure, and a browser would log `Uncaught (in promise)`. Instead the cause is stored in `upgradeError` and the existing `.catch` on the open rethrows it, so `getDb()` rejects with `injected migration failure` rather than a generic `AbortError`. The new test asserts that specific message, which pins the plumbing.
3. `void tx.done.catch(() => {})` runs before the abort, because idb's cached `done` promise rejects with `AbortError` and nothing is listening — without it the deliberate rollback produces an unhandled rejection of its own.

New file `src/lib/storage/appDbUpgradeFailure.test.ts`, two tests, failure injected by mocking `resolveExerciseIdentity`:

- rejects with the real cause; version stays 9; `metrics` still present; aliases, programs, and logs byte-equal to the pre-upgrade snapshot; and a later open with the failure removed migrates for real.
- the worst case specifically: a failure landing *after* `aliasesStore.clear()` leaves all 5 fixture aliases intact.

Both fail without the abort (`Received promise resolved instead of rejected`, and the dumped database shows `version: 10` with `metrics` still in `objectStoreNames`).

### Other upgrade blocks and restore

**The v7 and v8 blocks have the identical exposure; v5 does not; restore does not.**

- `appDb.ts:398` — `(log.entries ?? []).some(...)` throws if `entries` is truthy but not an array; `appDb.ts:402` — `localDateOf(log.performedAt)` does not throw on a bad value (it yields `NaN-NaN-NaN`, wrong but not fatal).
- `appDb.ts:420-424` — `(log.entries ?? []).map`, `(entry.sets ?? []).map`, and `set.rawCell.trim()` (truthiness-guarded only, so a non-string `rawCell` throws).
- `appDb.ts:366-389` (v5) reads only `completedAt`/`performedAt` and calls `cursor.update` — no string operations, no exposure.
- `restoreBackup` is *not* affected by this class at all, because it awaits its own transaction: a failed `put` aborts the transaction and `await tx.done` rejects into the caller. The bug is specific to idb not awaiting the `upgrade` callback.

Consequence if a v7/v8-era failure happens: the version still commits at 10 and the v10 block never runs, so identity normalization is silently skipped forever for that user — same class, slightly different blast radius (no store is cleared there).

**My recommendation:** wrap the entire `upgrade` callback body in one `try`/`catch`/`abort` instead of just the v10 block. It is a smaller change than what I did here, covers every past and future block by construction, and matches spec line 528 as written ("migration failures abort"). I did *not* do it, per your instruction not to widen scope silently — it changes behaviour for upgrade paths Task 6 does not own (a user on v≤6 today), and that deserves your ruling. If you would rather it wait, the v7/v8 exposure is at least now documented in the file's comments.

### Must-fix 2: comments corrected

`appDb.ts` (leaf guards), `appDb.ts` (container guards), and both `appDb.test.ts` block comments no longer claim "aborts the whole upgrade transaction" / "permanently unopenable database". They now describe the post-fix truth: the throw is caught, the upgrade rolls back, the stored version stays at 9, and the next load retries — so the guards are what let the migration *succeed*, not what prevent data loss. You and the reviewer own the original framing; it was wrong and it is now gone from the code.

### Must-fix 3: completion canaries

Every pass-through case now asserts `metrics` is absent — the block's last statement, so its absence proves the migration ran to the end. Applied to all four `it.each` blocks (the 13 container cases as well as the 7 leaf cases, since they had the same hole) plus the four alias-drop cases.

Quantified with the silent-bail mutation (an early `return` right after `aliasesStore.clear()`, which commits at version 10 with no error):

```text
mutation, canaries removed:  18 of the 20 pass-through cases still PASS
                             (only the 2 carrying an expected-normalized value caught it)
mutation, canaries present:  all 20 FAIL
no mutation, canaries present: 51 passed, 51 total
```

### Cosmetic item: I was wrong, the generic predicate works

Adopted `function isRecord<T>(value: T): value is T & object`, and the `program.import &&` prefix is gone. My round-2 claim that a predicate would mis-narrow the typed spreads was unfounded — `bun run typecheck` is clean on both `tsconfig.json` and `tsconfig.test.json` with the prefix removed. No compile error to show, because there isn't one.

### Gates after fix round 3

```text
bun run test -- --runInBand
Test Suites: 93 passed, 93 total
Tests:       1136 passed, 1136 total   (was 1134; +2 upgrade-failure tests)

bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(clean)

bun run lint
$ eslint .
(clean)

bun run build
✓ built in 1.58s   (only the pre-existing >500 kB chunk advisory)

git diff --check
(clean)
```

### Disagreements

None on the three must-fixes or the cosmetic item — all four were right and one of them (the cosmetic) corrected a wrong claim of mine. The only thing I have pushed back on is scope: I believe the whole-callback abort is the right shape and I am asking you to rule rather than doing it unilaterally.

### Untouched, per the coordinator's scoping

`ImportClient.tsx`, fresh-install `metrics` creation, the three provenance-defaulting copies, the exclusive-group override case, backup v2, and the `migrations/v10Identity.ts` extraction (Task 7).

## Fix round 4 — abort and guard every upgrade block

Ruling implemented as given, and I agree with your reasoning over mine: abort alone would have converted a silent partial commit into a deterministic brick for any user holding a malformed log, which is not an improvement. Guards make the abort a net.

### 1. The abort now wraps the whole `upgrade` callback

The v10-only `try` is gone; the entire callback body is wrapped in one `try`/`catch`. All three round-3 subtleties are preserved verbatim: the guarded `tx.abort()` (a failed IDB request aborts its own transaction, so a second `abort()` throws `InvalidStateError` and would mask the real cause), the no-rethrow/`upgradeError` routing (rethrowing adds a second unhandled rejection because idb ignores the callback's promise), and `void tx.done.catch(() => {})` before the abort (idb's cached `done` promise otherwise rejects unobserved).

### 2. Before/after for the older blocks

v7 block, failure injected at its one external call (`localDateOf`), seeded at version 6:

```text
before:  outcome=resolved                          version=10  performedDate=undefined  hasOverrides=false
after:   outcome=rejected(injected v7 failure)     version=6   performedDate=undefined  hasOverrides=false
```

The "before" line is worse than I described last round. The database is stamped **version 10** while `normalizationOverrides` was never created and the v7 backfill never ran — so every later `normalizationOverrideRepo.list()` would fail against a store that does not exist, permanently, with no version left that would ever re-run the migration. After the fix the open rejects with the real cause and the database is untouched at version 6.

v8 block, failure injected at the only global it calls (`parseFloat`, narrowed to the fixture's value), seeded at version 7: same shape — the open now rejects, the version stays at 7, the raw cell is untouched, `normalizationOverrides` does not exist, and a retry with the failure removed migrates to version 10 and rescues the cell.

Both new abort tests fail without the abort with `Received promise resolved instead of rejected` (all four tests in `appDbUpgradeFailure.test.ts` do).

### 3. v7/v8 guards, per site

Only helpers already in the file (`mapArray`, `isRecord`, `isReadableText`) plus one inline `Array.isArray` — no new abstraction:

| Site | Failure before | Guard |
| --- | --- | --- |
| v7 phantom check, `log.entries` non-array | `.some is not a function` (only when no completedAt/skippedAt/dayNote/notes short-circuits first) | truthy non-array counts as *unreadable*, so the log has data and is kept |
| v7 phantom check, null entry element | `Cannot read properties of null (reading 'sets')` | `isRecord(e) && …` |
| v8 `(log.entries ?? []).map` | `.map is not a function` | `mapArray` |
| v8 null entry element | `Cannot read properties of null (reading 'sets')` | `isRecord(entry) ? … : entry` |
| v8 `(entry.sets ?? []).map` | `.map is not a function` | `mapArray` |
| v8 null set element | `Cannot read properties of null (reading 'weight')` | `isRecord(set)` |
| v8 `set.rawCell.trim()` | `set.rawCell.trim is not a function` | `isReadableText(set.rawCell)` |

RED first: the six malformed-log cases failed with exactly those TypeErrors before any guard existed (`Tests: 6 failed, 51 passed, 57 total`). Every guard is individually load-bearing — removing them one at a time, restoring the file between runs, fails 1, 1, 2, 1, 1, 1, 1 tests respectively.

One judgement call worth review, because it is a semantic choice and not a mechanical guard: **v7 keeps a log whose `entries` is a truthy non-array, but still deletes one whose only content is a null entry.** A non-array is unreadable — something is stored there and we cannot parse it, so deleting it would be destroying data we never read. A `[null]` element is readable and demonstrably carries nothing, which is exactly the phantom-log definition the v7 block already implements. Both directions are pinned by their own test.

### 4. Healthy behaviour unchanged, and no existing test modified

Every malformed case seeds a healthy log in the same database and asserts it still receives the v7 `performedDate` backfill *and* the v8 kg rescue *and* that the migration reached the v10 block's last statement (the `metrics` canary from round 3). So the guards demonstrably make the abort a net, not a wall.

`git diff 22ba71f --numstat -- src/lib/storage/appDb.test.ts` reports **731 insertions, 1 deletion** across all of Task 6, and that single deletion is the `aliasRepo.save` call that had to gain `provenance` in the original task. **No v5, v7, or v8 test was modified in any round** — the new coverage is additive only, in a new `describe("DB v7/v8 — malformed legacy logs")` block plus two tests in `appDbUpgradeFailure.test.ts`.

### Task 7 input: restore stamps version 10 without ever running the migration

Not fixed here, per your instruction. The mechanism, for Task 7 (spec line 373):

- `restoreBackup` (`src/lib/backup/backup.ts:190`) calls `getDb()`, which opens at `DB_VERSION` and runs the v10 upgrade against whatever is in the stores *at that moment* — then clears and repopulates every user store from the backup file inside its own transaction (`backup.ts:198-217`).
- So restored records never pass through the v10 migration: the version is already 10, `oldVersion < 10` is false forever, and the restored programs, logs, and aliases keep whatever legacy canonical IDs and unclassified aliases the file carried. The only normalization applied today is the alias `provenance` default I added in the original task (`backup.ts:206-213`).
- `restoreBackup` is *not* exposed to the silent-partial-commit class, because it awaits its own transaction: a failed `put` aborts and `await tx.done` rejects into the caller.
- Task 7 therefore needs restore-side classification and redirect rewriting explicitly — the same `migrateProgram` / `migrateLog` / `classifyAliases` helpers this task exported, applied to the incoming document before the restore transaction. That is also the natural moment for the `migrations/v10Identity.ts` extraction you assigned there.

### Gates after fix round 4

```text
bun run test -- --runInBand
Test Suites: 93 passed, 93 total
Tests:       1145 passed, 1145 total   (was 1136; +9)

bun run test -- --runInBand src/lib/storage
Tests:       130 passed, 130 total

bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(clean)

bun run lint
$ eslint .
(clean)

bun run build
✓ built in 1.68s   (only the pre-existing >500 kB chunk advisory)

git diff --check
(clean)
```

### Disagreements

None with the ruling. The one thing I want on the record as a decision rather than a mechanism is the keep-vs-delete line in the v7 phantom check described above; if you read it the other way, say so and I will invert it.

### Untouched, per the coordinator's scoping

`ImportClient.tsx`, fresh-install `metrics` creation, the three provenance-defaulting copies, the exclusive-group override case, backup v2, and the `migrations/v10Identity.ts` extraction (Task 7).

## Fix round 5 — unreadable content is never grounds for deletion

Inverted as ruled, and the cost-asymmetry argument is the right one: retaining a genuinely empty log costs the user one deletion, deleting a real one destroys their only copy. I had weighed "readable" against "unreadable" and missed that a null entry is not proven-empty — it is unrecoverable.

The v7 phantom check now treats three things as content, under one rule instead of two competing ones:

| Shape | Before round 5 | Now |
| --- | --- | --- |
| `entries` present but not an array | kept | kept (unchanged) |
| an entry element that is not a record (e.g. `null`) | **deleted** | **kept** |
| `sets` present but not an array | deleted when it had no readable `length` | **kept** |

That third row is the "same logic elsewhere" you asked me to look for, and it is the only other place it appears. `(e.sets?.length ?? 0) > 0` happily reads a `length` off whatever is there, so `sets: "corrupt"` already looked like data by accident (length 7), while `sets: { corrupt: true }` looked like *no* data and would have been deleted. Both now go through the same `unreadableValue` predicate, so the accident becomes a rule. The v8 block needs no equivalent — it never deletes.

Implementation: one small predicate beside the other guard helpers, `unreadableValue(value)` = "present, but not the array we expected", used at both levels. Absent stays absent, so a log with no `entries` at all is still a phantom — that is what the rule exists for.

RED first: both new expectations failed with `Received: undefined` (the logs had been deleted). All three retain rules are individually load-bearing — reverting them one at a time fails exactly one test each.

Existing v7 semantics are untouched, and the proof is not just my reading: `sessionPersistence.test.ts:100` ("deletes dataless phantom logs") seeds `entries: [{ exerciseId: "e1", sets: [] }]` — readable record, readable empty array — and stayed green through every mutation above without being edited. `git diff 22ba71f --numstat` still reports **1 deletion** in `appDb.test.ts` (the original `aliasRepo.save` provenance line) and **no change at all** to `sessionPersistence.test.ts`.

The flipped test is named "keeps a log whose only entry is unreadable rather than deleting it as a phantom" and carries the full reasoning in a comment, including the pointer to where the real phantom rule is still tested, so the next reader sees a decision rather than an oversight.

### Gates after fix round 5

```text
bun run test -- --runInBand
Test Suites: 93 passed, 93 total
Tests:       1146 passed, 1146 total   (was 1145; +1)

bun run test -- --runInBand src/lib/storage
Tests:       133 passed, 133 total

bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(clean)

bun run lint
$ eslint .
(clean)
```

## Cleanup round — stale comments, test strength, and plan jargon

Eight items fixed (A1-A6, A8, A9); A7 deferred to Task 7 as ruled. No production behaviour changed anywhere in this round except nothing — every edit is a comment, a test name, a test body, or a fixture.

### A3 (the substantive one) — `{ dispatch: false }` suppression now has real coverage

You were right that this was an unverified spec requirement, not polish. In all four tests the suppressed write ran *before* `addEventListener`, so the listener could not have seen an event either way. All four now attach the listener first, assert `not.toHaveBeenCalled()` after the suppressed write (plus that the write itself landed), then perform the unsuppressed write and assert exactly one event:

- `aliasRepo.test.ts` — `putRaw(..., { dispatch: false })` before `replaceRemembered`
- `aliasRepo.test.ts` — `saveMany(..., { dispatch: false })` before `removeMany`
- `userExerciseRepo.test.ts` — `save(..., { dispatch: false })` before `remove`
- `normalizationOverrideRepo.test.ts` — `save(..., { dispatch: false })` before `remove`

Mutation evidence, breaking suppression in all three repos (`dispatchAfterWrite` dispatches unconditionally):

```text
mutation + new tests:        Tests: 4 failed, 30 passed, 34 total
                             Expected number of calls: 0
                             Received number of calls: 1   (×4)

mutation + old committed tests: Tests: 34 passed, 34 total
```

The second line is the finding in one number: the requirement had zero coverage. Both repos and tests restored byte-for-byte afterwards; the guard expression is back to `if (options?.dispatch !== false)`.

### A4 — the sibling test no longer implies ordering it cannot prove

"dispatches once after a multi-alias transaction commits" read the alias from inside the listener, which the very next test's comment explains proves nothing (the read is serialised behind the open transaction either way). Renamed to "dispatches once for a whole multi-alias transaction, not once per alias", the listener-read machinery is gone, and a comment points at the transaction-lifecycle test that owns the ordering claim.

### A1, A2 — comments that misdescribed the code

- `backup.test.ts:13` cited `expect(mockClear).toHaveBeenCalledWith("metrics")` as the example for the shared spy, while the live assertion is now `not.toHaveBeenCalledWith("metrics")`. Example changed to `"aliases"`.
- `appDb.ts` container-guard comment said "the v7/v8 blocks **above**" (they are ~270 lines *below*) and "the **v10 block's** catch" (round 4 replaced it with the whole-callback catch). Both corrected, and the version-specific phrasing replaced with "the current version" so it does not rot at v11.

### A5, A6 — test tables

All four `it.each` titles were the identical string `"passes through a $name unchanged"`, and three `programCases` deliberately *do* change (`removed-squat-id` → `surviving-squat-id`). Now table-identifying and honest:

```text
program: override with a null replacement — readable parts migrated, malformed part left alone
log:     log holding a null entry — readable parts migrated, malformed part left alone
program: exercise with a non-string name — left exactly as stored
log:     log entry with a non-string exerciseName — left exactly as stored
```

`programCases` also gained a comment explaining what `expected` means (absent = byte-identical). `logCases`' `expected?` field was dead — no case set it — so it and the `expected ?? seeded` fallback are gone.

### A8, A9 — rename and fixture integrity

- `describe("DB v10 — upgrade failure safety")` → `"DB upgrade failure safety — every block"`, since half its tests are v7/v8-era.
- `appDb.testFixtures.ts` now calls the real `normalizeExerciseName` instead of a hand-rolled `toLocaleLowerCase().replace(...)` copy, with a comment saying why: a divergence would seed index keys the app can no longer look up while the tests kept passing.

### Plan jargon removed from source

`backup.ts` ("Task 6 restore safety", "backup v2 (Task 7)"), `backup.test.ts` (test name "…before Task 7"), `appDb.test.ts` ("Fix round 2: …"). All now state the behaviour instead of the ticket. `grep -rn "Task 6\|Task 7\|Task 9\|Fix round" src/` returns nothing.

### Task 7 input (A7, deferred)

`dispatchAfterWrite` is byte-identical in `aliasRepo.ts:39`, `userExerciseRepo.ts:15`, `normalizationOverrideRepo.ts:121`, and the event name `"trainer-exercise-identity-changed"` is hand-written in **21** places across implementation and tests. A typo in any one of them is a silently dead listener, so the shared constant should land with the consolidation and the `migrations/v10Identity.ts` extraction.

### Constraints honoured

`git diff 22ba71f --numstat -- src/lib/storage/appDb.test.ts` is still **752 insertions, 1 deletion** (that deletion remains the original `aliasRepo.save` provenance line), and `sessionPersistence.test.ts` — which owns the real v5/v7/v8 coverage — does not appear in the diff at all. Test count is unchanged at 1146: this round strengthened bodies rather than adding cases.

### Gates after the cleanup round

```text
bun run test -- --runInBand
Test Suites: 93 passed, 93 total
Tests:       1146 passed, 1146 total

bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(clean)

bun run lint
$ eslint .
(clean)

bun run build
✓ built in 1.54s   (only the pre-existing >500 kB chunk advisory)

git diff --check
(clean)
```

## Code-quality round — the constraint-rejection class

The critical finding is real and I reproduced it before changing anything. It is also a genuinely different failure class from everything the five fix rounds addressed, and the reviewer's framing is the lesson: **the guard scheme protects against exceptions thrown by bad reads; nothing protected against an IDB request rejected by a constraint.**

### Critical — duplicate recomputed `normalizedAlias`

Two aliases whose *stored* tokens differ (so v9's unique index accepted both) but which recompute to the same token. Before/after, same fixture:

```text
before:  openCurrentDatabase() → Rejected to value:
         [ConstraintError: A mutation operation in the transaction failed because a
          constraint was not satisfied...]                     version stays 9, retry identical
after:   version 10, metrics deleted, exactly one alias survives
```

Two halves fixed:

1. **`classifyAliases` dedupes by recomputed token.** A `byToken` map replaces the output array, with a `claim()` helper: a `remembered` document displaces a `legacy-auto` one on the same token; otherwise first writer wins, which keeps the pass deterministic and idempotent (the fixed-point tests still hold). Rationale in the code: a user's own correction outranks a legacy guess, and losing a legacy duplicate costs one re-teach where a bricked database costs the app.
2. **`putRaw` recomputes `normalizedAlias` from `input.alias`** instead of trusting the file — closing the vector at source, as you asked, since `backup.ts` validates aliases with `hasIds` only.

Tests: two colliding-token cases (legacy/legacy and remembered/legacy) plus a `putRaw` case asserting the recomputed token is what makes `find()` work again. Mutation evidence:

```text
remove the dedupe entirely                   → 2 failed (both ConstraintError)
first-writer-wins instead of remembered-wins → 1 failed
putRaw trusts the file token again           → 1 failed
```

The precedence test is table-driven over **both row orderings**, because `getAll` returns rows in key order: my first attempt at it passed under the first-writer-wins mutation purely because the remembered row happened to sort first. Worth recording as its own small lesson — a precedence test that does not control ordering is not testing precedence.

### Rejected-vs-thrown sweep

Mechanical, over every write in the upgrade callback and every alias write outside it:

- **`by-normalized-alias` is the schema's only unique index** (`appDb.ts:384`; the other three indexes are non-unique), so constraint rejection is possible *only* on alias writes. That is now covered in the migration and in `putRaw`.
- Every `createObjectStore`/`deleteObjectStore` is `contains`-guarded, except the v1 block which runs only against an empty database at `oldVersion === 0`.
- `cursor.update` in v5/v7/v8 never alters `id` (the keyPath), so no `DataError`; `cursor.delete` cannot be rejected.
- `programsStore.put` / `logsStore.put` write records read from the same keyPath store and never touch `id`, and the traversal only spreads plain objects and arrays, so nothing becomes unclonable.
- `aliasRepo.saveMany` stages by token and reuses the existing row's `id`, so it cannot create a duplicate token.
- **One remaining verbatim path, and it is Task 7's:** `backup.ts:215` still writes the file's `normalizedAlias`. A hand-edited backup carrying two aliases with the same token fails the restore with `ConstraintError`. That is *not* a brick — restore awaits its own transaction, so the pre-restore data is preserved atomically and the error surfaces to the caller — but restore should dedupe and recompute the way the migration now does. Added to the Task 7 input list.
- Environmental rejection (`QuotaExceededError`) can hit any put; the round-4 abort already handles it correctly — data preserved, retried next load.

### Important items

**2. Five toothless `isRecord` guards** — new rows in the pass-through table for a non-record section, group, override, warning and suggestion. All five removal-mutations now fail (2, 2, 1, 1, 1 tests respectively).

**3. Self-heal untested** — new test in `appDbUpgradeFailure.test.ts` that calls `getDb()` a second time with **no** `resetDbConnection()`. Removing the clear-on-failure line fails it. The pre-existing retry assertions only ever proved the manual path.

**4. Two unverified classification rules** — both now pinned, and pinning the first required new fixtures: the `hasAlternative` rule is unreachable as a *distinct* behaviour unless the token also has a unique concrete outcome, so the test mock gained a `reject-alternative` phrase rule for `"or"` and a catalogue entry named `"Squat or Hinge"` (pre-curation entries genuinely looked like that, which is why the rule exists). The second — an alias whose token no longer resolves to its stored target — is the valuable one, and is exactly the silent mis-resolution the new disambiguation flow exists to end. Both mutations now fail.

**5. `isRecord` accepted arrays** — added `&& !Array.isArray(value)` with tests for a day, section and group stored as an array (`{ ...[] }` is `{}`, the same silent-corruption shape as the `program.import` find). Restoring the old predicate fails 3 tests. Also added `isReadableText` guards on `exercise.id` and `entry.exerciseId` before they reach the resolver as `slotId`, each with a test; both removal-mutations fail.

One related shape I checked and deliberately did *not* add a test for: an **entry** stored as an array is already passed through today, because `migrateLogEntry` returns the original object once the name guard trips rather than spreading it. A test there would have been green before and after, so it would have proved nothing.

### Minors

- **`unreadableValue` null policy pinned**, and the comment now says what the line actually is: *absent* versus *present-but-unreadable*, not null versus non-null. `undefined`/`null` are the legitimate shape of logs predating `entries` and stay deletable (v7 semantics preserved); `"corrupt"` stays. New test asserts `entries: null` is still deleted as a phantom; treating null as unreadable fails it.
- **`dbPromise` stale-write hazard** — the open is captured as `attempt` and both the failure path and `terminated()` only clear when `dbPromise === attempt`, so a late failure cannot discard a newer connection installed by `resetDbConnection()`. Honest caveat: this one is **not** covered by a test — it needs a real race between a slow failing open and a reset, and I judged a timing-dependent test worse than none. It is a two-line invariant with the reasoning in a comment.
- **`toStrictEqual`** for all pass-through assertions. Real-browser nuance worth recording: under `structuredClone` a malformed record *gains* an own `days: undefined` key (fake-indexeddb drops it, which is why `toEqual` passed either way). The clean fix is a conditional spread — `...(Array.isArray(day.sections) ? { sections: … } : {})` — which is a `mapArray` restructure, so it goes with the Task 7 extraction rather than being written twice.
- **One normalisation path for override targets** — `normalizeTargetValue` is now the only normaliser and the only place an unknown `targetKind` is rejected; `overrideKeyFor` joins an already-normalized value; the exported `normalizationOverrideKey` composes the two. `save` normalizes exactly once.
- **Validation moved before the write transaction** (`db.getAllKeys("userExercises")` in its own readonly transaction), so bad input no longer dangles a readwrite transaction. This also retires the earlier deferred minor about that transaction holding `userExercises` in readwrite for a read.
- **`backup.ts`** equality branch dropped.

### Requested wording for the Task 7 "adding a field" recipe

To carry into the brief verbatim if it is useful:

```ts
// Adding a field to this traversal? Three rules, in order:
//   1. Read nothing without a type guard. Containers go through mapArray (an
//      array we can walk, or the value untouched); records through isRecord
//      (which excludes arrays, because spreading one rewrites it into an
//      index-keyed object); leaf strings through isReadableText before they
//      reach normalizeExerciseName, prepareImportName, or the resolver.
//   2. Never rewrite what you could not read. A malformed record is passed
//      through exactly as stored — including its key set, so prefer a
//      conditional spread over assigning a possibly-undefined mapped value.
//   3. Check whether your write can be *rejected* as well as throw. Guards
//      catch bad reads; a unique index (today only by-normalized-alias) or an
//      invalid key rejects the request instead, and the upgrade's abort turns
//      that into a deterministic failed migration on every load. If the field
//      feeds an index, make the write set legal before issuing it.
// Anything you add here needs a malformed-shape test AND a mutation showing
// the guard is load-bearing — four toothless guards shipped without one.
```

### Constraints honoured

`git diff 22ba71f --numstat -- src/lib/storage/appDb.test.ts` is **930 insertions, 1 deletion** (still the original `aliasRepo.save` provenance line), and `sessionPersistence.test.ts` — which owns the real v5/v7/v8 coverage — is absent from the diff entirely. Healthy-data behaviour is unchanged: the only production behaviour changes are the alias dedupe, the recomputed `putRaw` token, the array exclusion in `isRecord`, the two slot-id guards, and the override-repo restructure.

### Gates after the code-quality round

```text
bun run test -- --runInBand
Test Suites: 93 passed, 93 total
Tests:       1164 passed, 1164 total   (was 1146; +18)

bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(clean)

bun run lint
$ eslint .
(clean)

bun run build
✓ built in 1.42s   (only the pre-existing >500 kB chunk advisory)

git diff --check
(clean)
```
