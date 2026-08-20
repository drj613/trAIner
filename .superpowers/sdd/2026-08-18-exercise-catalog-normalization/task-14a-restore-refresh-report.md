# Task 14a report — a restore must refresh `LocalDataProvider`

Branch `feat/exercise-catalog-normalization`, worktree
`/Users/djdjo/Documents/mine/trAIner/.worktrees/exercise-catalog-normalization`.
Start `80d6545` (110 suites / 1,657 tests). End `b083ae3` (111 suites / 1,659
tests).

**e2e not run — controller instruction.** Specs for the single serial run are
named in §7.

---

## 1. The defect

`SettingsClient.handleImport` restored a backup and then refreshed only its own
stats panel:

```ts
await restoreBackup(data);
setStats(await loadWorkspaceStats());
```

`LocalDataProvider` (`src/components/app/LocalDataProvider.tsx:76-78`) loads
`programs` and `profile` in a mount-time `useEffect` and listens for nothing.
`src/App.tsx:48` mounts it **above** the router, so it survives the trip to
Settings and back still holding the **pre-restore** documents.

That is not a display bug. `saveProgram` (`LocalDataProvider.tsx:43-51`) writes
whatever document the provider is holding, under the same id. So the first edit
a user makes anywhere in the app after a restore — `RoutinesIndexClient`,
`WorkoutDayClient`, `DiffPage`, `ImportClient` all follow the same
read-from-context / hand-back-to-`saveProgram` shape — puts the pre-restore
program back over the restored one. IndexedDB is the only copy, and the loss
lands at the exact moment the user is recovering data.

---

## 2. Sweeping the class, not the line

The audit named `LocalDataProvider.tsx:76`, `App.tsx:48` and
`SettingsClient.tsx:180`. I enumerated every production site that can replace
storage out from under the provider.

| Sweep | Command | Result |
|---|---|---|
| Every `restoreBackup` / `resetWorkspace` / `useLocalData` reference | `grep -rn "restoreBackup\|resetWorkspace\|useLocalData" src e2e` | see below |

- **`restoreBackup` — one production caller**, `SettingsClient.tsx:180`. Every
  other hit is a test. **Fixed.**
- **`resetWorkspace` — one production caller**, `SettingsClient.tsx:405`, which
  calls `window.location.reload()` on success. A full reload remounts the
  provider, so there is no stale copy to write back. **No hole.** The failure
  path is also safe: `resetWorkspace` (`backup.ts:479-494`) is a single
  `indexedDB.deleteDatabase`, which is all-or-nothing — if it rejects, nothing
  was deleted and the provider's copy is still correct. A refresh there would
  be dead code.
- **Snapshot restore — does not exist.** `SettingsClient` can *create*
  (`handleSnapshot`) and *delete* (`handleDeleteSnapshot`) snapshots; there is
  no UI that restores one. `backupRepo` is never fed back into `restoreBackup`
  in `src/`. Nothing to fix, and worth recording so the next reader does not
  re-derive it. If a snapshot-restore button is ever added, it must call
  `refresh()` too.
- **`useLocalData` consumers — 10 production files.** All of them read
  `programs`/`profile` from the one provider instance, so fixing the provider's
  freshness fixes all of them at once. None of them owns a second copy.

So the class is exactly one site, and it is fixed. The two plausible siblings
were checked and each has a specific reason it is not a hole, recorded above.

---

## 3. RED — the data-loss failure, with real output

Test written first: `src/components/app/RestoreRefreshesLocalData.test.tsx`.
It renders the **real** `SettingsClient` under the **real** `LocalDataProvider`
against `fake-indexeddb`, drives the **real** `restoreBackup` through the real
file input, then clicks a probe that does what every real consumer does — hands
a context-held program back to `saveProgram` with one field changed.

`SettingsClient.test.tsx` mocks `@/lib/backup/backup` wholesale, so a test
written there proves nothing about restore. This file mocks nothing on the
restore path.

Against `80d6545` (before the fix), `bun run test -- --runInBand
src/components/app/RestoreRefreshesLocalData.test.tsx`:

```
● a backup restore refreshes LocalDataProvider › does not let a later save write the pre-restore program back over the restored one

  expect(received).toBe(expected) // Object.is equality

  Expected: "Restored routine"
  Received: "Stale routine"

  > 224 |     expect(stored?.title).toBe(RESTORED_TITLE);
```

```
● a backup restore refreshes LocalDataProvider › refreshes the provider exactly once for one restore

  expect(element).toHaveTextContent()

  Expected element to have text content:
    Restored routine
  Received:
    Stale routine

  > 235 |     await waitFor(() => expect(screen.getByTestId("probe-title")).toHaveTextContent(RESTORED_TITLE));
```

```
Test Suites: 1 failed, 1 total
Tests:       2 failed, 2 total
```

The first is the one that matters: **storage ended up holding the pre-restore
document after the restore had already written the good one.** It is an
assertion failure, not a timeout, and the canary immediately above it
(`expect(p?.active).toBe(false)`) passed — so the save definitely landed and
definitely carried the stale title with it.

---

## 4. The fix

`src/components/app/SettingsClient.tsx` — one call, between the restore and the
stats reload, plus the reasoning in a comment:

```ts
await restoreBackup(data);
// ... (comment: why, and why not a listener)
await refreshLocalData();
setStats(await loadWorkspaceStats());
```

`const { refresh: refreshLocalData } = useLocalData();` at the top of the
component.

**Why not a listener inside the provider.** `restoreBackup` already dispatches
`trainer-exercise-identity-changed` after commit (`backup.ts:476`). Having
`LocalDataProvider` listen to it would (a) fire a second refresh on top of this
one and (b) reload `programs` on all nine dispatch sites, including every alias
write. Calling `refresh()` from the one handler that replaces the workspace is
exactly one refresh for exactly the event that needs it.

**`SettingsClient.test.tsx` — harness change only.** 15 `render(...)` calls now
wrap `<SettingsClient />` in `<LocalDataProvider>`, because the component now
requires the context the app has always given it. No assertion, mock, fixture or
test name changed; the suite is 16/16 before and after. Flagging it explicitly
because the standards forbid editing existing tests to make new code pass — this
is a mounting requirement, not a semantics move, and the diff shows it.

---

## 5. Mutation evidence — every count with its mutation named

Method: out-of-tree Jest config, no worktree footprint. `moduleNameMapper` swaps
in a mutated copy from the scratchpad; the mutation entries come **before**
`"^@/(.*)$"` (the documented trap), and `modulePaths` points at the repo's
`node_modules` — without it the out-of-tree mutant cannot resolve
`react/jsx-runtime` and jest reports `Tests: 0 total`, which is the "clean pass
with tests silently missing" trap. Every run below is checked against the
control total.

Suites in every run: `RestoreRefreshesLocalData` (2) + `SettingsClient` (16) +
`ExerciseIdentityIntegration` (2) + `ExerciseIdentityAudit` (26) = **46**.

| # | Mutation | Result | Killed by |
|---|---|---|---|
| control | mapper points at the real `SettingsClient.tsx` | 46 passed / 46 total | — |
| **M1** | delete `await refreshLocalData();` from `handleImport` (the fix, removed) | 2 failed / 44 passed / 46 total | **2** — both new tests |
| **M2** | duplicate the line: `await refreshLocalData(); await refreshLocalData();` | 1 failed / 45 passed / 46 total | **1** — `refreshes the provider exactly once` |
| **M3** | move the refresh from *after* `restoreBackup` to *before* it | 2 failed / 44 passed / 46 total | **2** — both new tests |
| **M4** | `void refreshLocalData();` instead of `await` | 46 passed / 46 total | **0 — survivor, see below** |
| **M5** | in `LocalDataProvider.refresh`, drop `setPrograms(storedPrograms)` (profile still reloads) | 4 failed / 42 passed / 46 total | **4** — 2 new + 2 in `ExerciseIdentityIntegration` |

M1 and M3 confirm the fix is load-bearing and that its *position* is
load-bearing. M2 is the one that matters most for this plan's history: it is the
"reloads once test that cannot tell one from three" failure, and it caught a
first draft of my own test — see §6. M5 confirms the tests are measuring the
provider and not something adjacent.

### The published survivor — M4

`void refreshLocalData()` instead of `await refreshLocalData()` kills nothing.
This is **unfalsifiable in this harness, not dead code**, and the measured
negative result is recorded here so nobody deletes the `await` citing a green
mutation:

- The refresh still starts in the same microtask; it simply is not sequenced
  before `setStats`. No user input can arrive in that window, so no test that
  drives the UI can separate the two.
- The `await` is kept because it is the honest sequencing — the stats panel
  should not tell the user the restore is done while the provider is still
  mid-read — and because it keeps the refresh inside `handleImport`'s
  `try`/`catch` rather than leaving a floating promise.

---

## 6. Self-review findings (fixed before the final commit)

1. **My own first "exactly once" probe was one of this plan's twelve.** It
   counted how many times the provider republished `programs`, via a
   `useEffect` on `[programs]`. Two adjacent `await refresh()` calls settle in
   a **single React commit**, so the probe reported `1` for both one refresh
   and two, and **M2 survived it** (18 passed / 18 total). Rewritten to count
   `programRepo.list` calls, which cannot be batched away. M2 now dies.
2. **The refresh count is calibrated, not hand-reasoned.** `programRepo.list`
   is called by the provider's `refresh` *and* by `loadWorkspaceStats`, so a
   raw count would be a magic constant. The test first clicks **Snapshot**,
   which runs the same tail as the import handler (export the workspace, reload
   the stats panel) and touches the provider not at all, and measures what that
   costs. The restore then has to beat that measured floor by exactly one.
   `exportBackup` reads the database directly and never calls `programRepo`
   (verified: no `programRepo` reference anywhere in `backup.ts`), so the two
   paths differ by the refresh and nothing else.
3. **The completion signal does not depend on the fix.** Waiting for the
   provider to show fresh data would turn a missing refresh into a *timeout*
   rather than a failed assertion. The test waits instead for the stats panel's
   `logs` row to read `3` — `setStats` is the last thing `handleImport` does,
   after both the restore and the refresh, and the backup carries three logs
   where the pre-restore store had none. Confirmed by M1: the test reached the
   title assertion and failed on it, rather than timing out.
4. A dangling empty line was left in a doc comment when the old probe was
   removed. Fixed.
5. The impeccable design hook reported 11 findings in `SettingsClient.tsx`
   (radius/colour literals at L56, L232, L294, L382, L383 …). All are on lines
   this task did not touch and predate it. Left alone.

---

## 7. Gates — real output

```
$ bun run test -- --runInBand
Test Suites: 111 passed, 111 total
Tests:       1659 passed, 1659 total
Snapshots:   0 total
Time:        31.325 s

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(no output)

$ bun run lint
$ eslint .
(no output)

$ bun run catalog:check
$ bun scripts/catalog-normalization/compiler/check.ts
(no output)

$ bun run build
dist/assets/index-Cmd6GLNZ.css     27.70 kB │ gzip:   6.99 kB
dist/assets/index-CNA3W5C_.js   1,567.39 kB │ gzip: 279.62 kB
(!) Some chunks are larger than 500 kB after minification.   ← known-acceptable
✓ built in 1.40s

$ git diff --check
(no output, exit 0)
```

Baseline was 110 suites / 1,657 tests. Now **111 / 1,659**: one new suite, two
new tests. **The audit's own numbers did not move** —
`ExerciseIdentityAudit.test.ts` is still **26**, `ExerciseIdentityIntegration
.test.tsx` still **2**, `SettingsClient.test.tsx` still **16**. Logs still do
not reload on identity-context changes: that invariant lives in
`ExerciseIdentityIntegration`, which is green and unmodified, and
`LocalDataProvider` reads programs and profile only — it never touches
`logRepo`.

### Concurrency

`bun run test -- --maxWorkers=24`: **one failing run out of eleven**, then ten
consecutive clean runs (`1659 passed, 1659 total`). I did not capture the
failing suite name on that first run and could not reproduce it in ten
subsequent attempts, including six loaded runs of
`RestoreRefreshesLocalData` + `SettingsClient` alone (`18 passed` every time).
This matches Task 14's finding (f) — an unattributed loaded-run flake that
predates this change. Reporting it rather than claiming eleven clean runs.

### e2e

**e2e not run — controller instruction.**

Specs that must be in the single serial run because of *this* change:

| Spec | Why |
|---|---|
| `e2e/workspace.spec.ts` | `SettingsClient` now requires `LocalDataProvider`. In the app it always has it (`App.tsx:48`), but this spec is what proves the Settings page still mounts in a real browser. If the fix were wired wrongly, every test in it would fail. |

Everything Task 14 named for the serial run still applies unchanged
(`routine-builder`, `exercise-history`, `history-rawcell`, `program-import`,
`helpers.ts` consumers).

**No new e2e spec written — deliberate, see §8.**

---

## 8. Deferred, with reasoning

1. **No new e2e spec for restore-then-edit.** A browser spec for this needs a
   download interception, a `confirm()` dialog handler, and `setInputFiles`
   with a file produced by a previous step. I cannot execute Playwright, and an
   unrunnable spec authored blind at the delivery gate is a coin flip that
   costs the controller a round if it is wrong — the same shape as the curation
   commit that broke `e2e/helpers.ts`. The defect is fully covered by a rendered
   jsdom test against real `fake-indexeddb` through the real component, which
   the standards name as the right tool for exactly this. Recommend a ticket for
   a browser-level restore spec after delivery.
2. **`LocalDataProvider` still refreshes only on mount and on demand.** It does
   not listen for anything. That is intentional (§4) and it means any *future*
   code path that replaces storage wholesale must call `refresh()` itself. The
   comment at the call site says so. A general
   `trainer-workspace-restored` event would move that obligation into
   `backup.ts`; it is more surface than this defect justifies at the delivery
   gate, and it is a design decision for whoever owns the next change here.
3. **Task 14 findings (b)-(e) untouched** — catalogue nesting coverage, the
   `appDb.ts:199` invented date, the `1 movements` grammar, user-exercise
   analysis coverage. All outside this brief.

---

## 9. What delivery should scrutinise most

1. **The `SettingsClient.test.tsx` harness change.** 15 mechanical edits. Read
   the diff and confirm no assertion moved — that is the one thing in here that
   touches existing tests.
2. **The calibrated refresh count** (§6.2). It depends on `exportBackup` never
   calling `programRepo`. That is true today and verified, and if it ever
   changed both sides of the comparison would move together — but it is the
   subtlest thing in the test.
3. **M4, the published survivor.** Confirm you agree the `await` should stay.
4. **The "no snapshot-restore path exists" finding** (§2). If anyone is
   planning to add that button, it needs the same `refresh()` call.

---

## Status

**DONE**

**Commits** (on top of `80d6545`):

| SHA | Subject |
|---|---|
| `6e2a9f1` | fix: refresh local data after a restore so a later save cannot undo it |
| `b083ae3` | test: count restore refreshes by storage reads, not React commits |

**Gates:** test 111 suites / **1,659** / 0 failures · typecheck 0 · lint 0 ·
`catalog:check` 0 · build 0 · `git diff --check` 0 · **e2e not run — controller
instruction**.
