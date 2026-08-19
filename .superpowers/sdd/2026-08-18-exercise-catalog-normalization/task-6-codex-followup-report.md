# Task 6 Codex follow-up report

Done as part of the Task 7 fix round, on branch `feat/exercise-catalog-normalization`.
The transforms had already moved into `src/lib/storage/migrations/v10Identity.ts`,
so each item was located by behaviour, not by the brief's line numbers.

Commits:
- `62a2b13` — `fix: close migration rejection paths and preservation gaps` (C-2, C-3, C-4, gaps a–d, plus the `terminated()` test)
- `b1706fc` — `test: name the alias drop rule after what it measures` (fixture honesty follow-on from C-2)
- `49a9a81` — carries the corrected purge justification in the code comments (its main subject is the Task 7 v2 ruling)

## Settled-by-ruling item: the false premise

The claim *"all pre-v10 aliases are machine-created, so nothing user-authored is
lost"* is corrected everywhere it appeared in code. The purge itself is
unchanged for the path the spec intends it for (a pre-v10 database, and a
version-1 backup).

Where it appeared and what it says now:

- `v10Identity.ts`, the recipe header's policy-exception note. It used to end
  *"and unlike a program or log it carries no user-authored content"*. It now
  says, in full: do not justify the drop with "aliases are machine-created" —
  that is false, pre-v10 aliases came from the import flow where the resolution
  map is filled both by automatic scoring and by the user's explicit manual pick,
  with no stored field distinguishing the two. The honest justification is
  narrower: a row with no usable token and no usable target can never be matched,
  displayed, or redirected again.
- `appDb.ts`, the v10 block header, said "classify old **automatic** aliases".
  Now "classify the aliases that predate provenance".
- `classifyAliases`'s own comments no longer describe retained/purged rows in
  terms of who or what created them, only in terms of what is still resolvable.

Two places did *not* need correcting. `task-6-report.md:282` already records the
premise as wrong ("A user-authored alias *can* be dropped by this rule, and I
originally got two premises wrong here"). `progress.md` is the controller's
ledger and I did not touch it — the claim appears there and in the archived
review diffs, which are history rather than live justification.

The cost framing the brief asked for is now the one in the code: the purge is
deliberate, and the user re-chooses once through the new disambiguation flow and
can then explicitly Remember it, which the spec judges better than letting a
stale implicit choice win forever.

## C-2 — do not drop an alias that is still recoverable

`aliasRepo.find` queries the `by-normalized-alias` index and the resolver reads
`candidate.normalizedAlias || candidate.alias`, so an alias missing only its
*display* text is fully usable. `classifyAliases` now:

- drops immediately only when `canonicalExerciseId` is unusable (nothing to
  redirect to);
- computes the token from the display text when there is one, falls back to the
  stored `normalizedAlias` when there is not — or when the display text
  normalizes to nothing — and drops only when neither yields a non-empty token;
- passes the unreadable `alias` field through untouched, per rule 2: a display
  string is not ours to invent;
- reads the disambiguation rules from whichever text produced the token, so a
  token-only row is still checked for `or`-style alternatives and underspecified
  names instead of skipping the rules by accident.

RED, before the change (`v10Identity.test.ts`):

```
✕ retains an alias with an absent display text but a usable token and target
✕ retains an alias with a non-string display text but a usable token and target
✕ retains an alias with a display text that normalizes to nothing but a usable token and target
    - Expected  - 10
    + Received  +  1        (expected one retained row, got [])
Tests: 3 failed, 13 passed, 16 total
```

Both sides are tested: three retain cases and three drop cases as pure helpers,
plus an integration pair on a real database with the real unique index — five
`drops a legacy alias with …` cases and one `retains a legacy alias whose display
text is unreadable but whose token is not`, which also asserts
`aliasRepo.find()` can reach it.

Mutation (revert to `if (!isReadableText(alias.alias)) continue;`):
**4 failed, 105 passed** — the three pure retain cases plus the integration one.

**Fixture honesty problem this surfaced, and fixed (`b1706fc`).** Two of Task 6's
four `drops an unreadable legacy alias with …` cases only still passed for a
different reason than their name gives: `{ alias: 42, normalizedAlias: "42" }` is
now recoverable under C-2 and is dropped by the outcome gate instead. The block
is renamed to `unusableAliases` ("nothing left to match on"), the two misleading
fixtures now really have nothing usable, and an empty-after-normalization case
was added. Every case fails for the reason its name gives again.

## C-3 — attach `tx.done.catch()` unconditionally

`void tx.done.catch((error) => { upgradeError ??= error; })` is now the first
statement of the `upgrade` callback, before anything is issued. A commit-time
`QuotaExceededError`/`UnknownError` arrives after the last awaited request, so
the `try`/`catch` cannot see it; previously it became an unhandled rejection and
skipped the `upgradeError` routing that makes `getDb()` reject with the real
cause instead of a bare `AbortError`. The handler inside the catch block is gone
as redundant.

Round-3 subtleties kept: the `tx.abort()` is still guarded by its own
`try`/`catch`, nothing is rethrown from the callback, and the cause is still
routed via `upgradeError`. Both assignments now use `??=` so the AbortError the
deliberate rollback produces can never overwrite the failure that caused it —
first cause wins, deterministically.

## C-4 — a stale success handler must not write the globals

The success handler now compares `dbPromise === attempt` like the failure path
and `terminated()` already did. When it does not match — `resetDbConnection()`
installed a newer open while this one was in flight — the connection is
**closed**: `resetDbConnection` could not have closed it (it did not exist yet),
nothing will ever read it, and left open it blocks the next upgrade and the next
`deleteDatabase`, which is the one thing `resetWorkspace` needs to succeed.

Trade-off recorded in the code: a caller still holding the retired promise gets a
closed connection and will throw `InvalidStateError`, rather than silently using a
connection the app has decided to abandon. The identity event still fires if the
migration committed — the data really did change, and listeners re-read through
whichever connection is installed now.

RED (`appDbConnection.test.ts`): `closes an open that finished after a reset had
retired it` → `isOpen(strayDb)` **Expected: false, Received: true**.
Mutation (remove the guard): **1 failed, 3 passed**.

First attempt at this test hung the whole suite for 120 s: while the bug is
present the orphaned connection blocks the *next* test's `deleteDatabase`
forever. Both connection tests now close their subject in a `finally`, so the
mutation fails fast and loudly instead of timing out.

## Gap (a) — a genuinely rejected request / commit failure

Every previous injection in `appDbUpgradeFailure.test.ts` is a synchronous throw
from a module the upgrade calls. The class that actually bricks a database is
different: a request that is accepted and then fails asynchronously.

New test: `aborts when a request is rejected asynchronously rather than
throwing`. `IDBObjectStore.prototype.clear` is patched so the aliases store's
clear returns a **real** failing request — an `add` of a primary key that already
exists, rejected asynchronously by the store exactly as a quota failure would be
— rather than a hand-rolled fake that idb would not treat as a request at all.
Asserts `getDb()` rejects with `{ name: "ConstraintError" }` (the real cause, by
name: DOMException messages are long prose), the database stays at version 9 with
its aliases and `metrics` intact, and the next open migrates for real.

Mutation, the brief's own proof of the gap — `await aliasesStore.clear()` →
`void aliasesStore.clear()`: **2 failed, 4 passed**, the new test plus
`does not empty the alias store when the failure lands after aliases are
cleared`. It used to leave the suite green.

Note: only the `add()` sits in a test file. `src/` still contains no
`IDBObjectStore.add()` — invariant 7-H holds.

## Gap (b) — concurrent `getDb()`

New test: `gives two concurrent callers one open, not two`. Asserts the two
callers get the *same promise object* synchronously, that it resolves to one
connection, and that `openDB` was called once (the suite wraps `openDB` to
record each call while the real one does the work).

Mutation, the brief's proof — `if (!dbPromise)` → `if (!dbInstance)`:
**1 failed, 3 passed**. It used to stay green.

This one *does* discriminate, unlike the `dbPromise` stale-write invariant Task 6
gave up on: promise identity is observable synchronously, with no race to lose.

## Gap (c) — the migration's post-commit dispatch

`dispatches one identity event after the v10 migration commits` used to push a
`getDb()` read from inside the listener, which proves nothing: the read is
serialised behind the versionchange transaction either way. It now observes the
transaction lifecycle directly, as round 3 did for `aliasRepo` — but the
migration's transaction comes from the *open request*, not from
`IDBDatabase.transaction`, so the hook goes on the factory: patch
`indexedDB.open`, attach a `complete` listener to `request.transaction` during
`upgradeneeded`, and assert the flag was already true when the event fired.

Mutation (dispatch from inside the upgrade block instead of after the open
settles): **1 failed, 89 passed**.

## Gap (d) — preservation by full-document equality

`rewrites canonical references, preserves routine/log fields, and deletes
metrics` now reads the pre-migration `programs`/`logs` records at version 9,
clones them, applies only the canonical-id changes the migration is supposed to
make (four redirects, two name-only backfills, one warning suggestion), and
asserts `toStrictEqual` on the whole documents. `progression`, `import.rawJson`,
notes and tags are covered by construction rather than by whoever remembered to
list them. The log document gets the same treatment.

Mutation (`migrateProgram` sets `progression: []`): the preservation test fails.

**Number corrected in fix round 2.** My first mutation wrote `progression: []`
unconditionally, which *adds* the key to the malformed fixtures that never had
one — a key-set change, which the key-set suite catches for reasons that have
nothing to do with preservation. Re-measured with the key set held constant
(`...(Array.isArray(program.progression) ? { progression: [] } : {})`), the
value-only mutation is caught by **exactly one test: the preservation test**
(1 failed, 255 passed across `src/lib/storage` + `src/lib/backup`). The
key-set-changing variant fails 30 tests in the same sweep. So the gap the brief
describes was real and completely uncovered before gap (d): the old assertions
were `toMatchObject` over a hand-listed field set that never mentioned
`progression`.

## Noted only

The remembered-alias fixture still seeds a v9 provenance shape production never
wrote. Left as is, per the brief. It remains legitimate: the pre-Task-7
`restoreBackup` put alias records verbatim behind `hasIds` only, so a hand-edited
version-1 backup can carry `remembered` onto a pre-v10 client. Worth recording
that this is now *more* than a hypothetical — the Task 7 ruling makes a
provenance carried by a file load-bearing on the restore path, so the shape the
fixture pins is one the code now deliberately honours.

## Gates

```text
$ bun run test -- --runInBand src/lib/backup src/lib/storage src/lib/catalog
Test Suites: 1 failed, 17 passed, 18 total
Tests:       7 failed, 272 passed, 279 total
```

The one failing suite is `src/lib/catalog/shippedDisambiguations.test.ts`, an
**untracked file created by the concurrent Task 8 agent** — every suite in my
lane passes (`backup.test.ts`, `appDb.test.ts`, `appDbConnection.test.ts`,
`appDbUpgradeFailure.test.ts`, `migrations/v10Identity.test.ts`,
`aliasRepo.test.ts`, `normalizationOverrideRepo.test.ts`,
`userExerciseRepo.test.ts`, `sessionPersistence.test.ts`, and the rest of
`src/lib/storage`).

```text
$ bun run test -- --runInBand         (whole repo)
Test Suites: 1 failed, 94 passed, 95 total
Tests:       3 failed, 1235 passed, 1238 total
```

The three failures are all in `src/lib/import/parser.test.ts` — the Task 8
agent's in-flight work. Attributed elsewhere, not investigated further.

```text
$ bun run typecheck
src/lib/catalog/shippedDisambiguations.test.ts(56,9): error TS2741: Property
'provenance' is missing in type '{ id … }' but required in type 'AliasDocument'.
```

Also the Task 8 agent's untracked file. No error in any tracked file.

```text
$ bun run lint
(clean)

$ bun run build
✓ built in 3.68s   (only the pre-existing >500 kB chunk advisory)

$ git diff --check
(clean)
```

## What a reviewer should scrutinise most

1. **C-4 closing the retired connection** — the deliberate trade-off against a
   caller holding the retired promise. Argued in the code; I judged an orphan
   that blocks `deleteDatabase` forever the worse failure.
2. **The `add()`-as-`clear()` injection** in gap (a). It is a real failing
   request rather than a fake, but it is a patched prototype; if a reviewer knows
   a way to make fake-indexeddb fail a request at commit time without patching,
   that would be better.
3. **C-2's fallback order** (display text first, stored token second, drop last)
   and the decision to leave the unreadable `alias` field untouched rather than
   backfill it from the token.
4. **The renamed drop-rule fixtures** (`b1706fc`) — I changed Task 6 test data to
   keep each case's name true; worth confirming nothing was weakened.
