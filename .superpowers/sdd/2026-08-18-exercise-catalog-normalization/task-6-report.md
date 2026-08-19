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
