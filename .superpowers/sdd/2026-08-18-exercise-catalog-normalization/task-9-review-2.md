# Task 9 fix-round re-review — import lane

Scope: `src/components/import/**`, `src/lib/import/**`, `e2e/program-import.spec.ts`.
Fix round under review: `0eca59e, 3af8ee7, 1b3cd8e, 1553e15, b79ebf1, 4199d92`.
Baseline: `bun run test -- --runInBand src/lib/import src/components/import` → **8 suites / 214 tests / 0 failures**.
Every mutation below was applied to a byte-identical snapshot and restored; `git status --short -- src/components/import src/lib/import e2e` is empty and the lane is back to 214/214.

Not run (controller owns the gate): full unit suite, `typecheck`, `lint`, `build`, e2e. m7 is therefore assessed by reading only, and I say so below.

---

## Mutation table

| ID | Exact mutation | Result |
|---|---|---|
| M-ORD | `ImportClient.tsx` `handleSave`: move the `rememberedAliasInputs` + `rememberAliases` block **above** `await saveProgram(resolvedProgram)` | **1 failed / 213 passed** — `writes no alias when the routine itself could not be saved` |
| M-I1a | Reinstate the deleted partial `jest.mock("@/lib/import/resolution", …)` (4 exports) in `ImportClient.test.tsx`, new test body kept | **1 failed** — `TypeError: (0 , resolution_1.groupResolutionOccurrences) is not a function` |
| M-I1b | `ImportClient.tsx` confirm copy → `{days.length} day(s) · {exerciseCount} exercise(s)` | new test **1 failed**; same mutation + the **old** (`c5e34dc`) test body → **1 passed** |
| M-I3a | Delete the `storedCount === 0 && (…won't apply…)` block, `ResolutionStep.tsx:292-296` | **1 failed / 213 passed** — `says so when a decision would not reach any exercise` |
| M-m1 | Delete `if (!canonicalExerciseId \|\| canonicalExerciseId === CUSTOM_ID) continue;` from `dedupeAliasResolutions` | **3 failed / 211 passed** |
| M-m2 | Confirm-step `resolvedCount` back to `unresolvedItems.filter(…).length` | **1 failed / 213 passed** — `counts stored exercises in the confirm summary, not occurrence paths` |
| M-m2b | Confirm-step **`customCount` only** back to `.length` | **214 passed — NOT PINNED** |
| M-m3 | Delete the stale-tick `useEffect` (`ImportClient.tsx:85-104`) | **1 failed / 213 passed**; with the intermediate `not.toBeChecked()` line also removed, `expect(mockAliasSaveMany).not.toHaveBeenCalled()` fails too → pinned **by effect**, not only by UI |
| M-m4 | Remember label back to the literal `Remember this interpretation` | **10 failed / 204 passed** — 9 locator dependencies + 1 real judgement |
| M-m5a | `const resolvedProgram = applied;` (drop id reuse) | **1 failed / 213 passed** — `re-validating the same paste updates one program instead of creating a second` |
| M-m5b | `handleValidate` clears `savedProgramId`/`savedJson` unconditionally | **1 failed / 213 passed** — same test |
| M-m5c | **Both** loosened: `handleValidate` never clears **and** `handleSave` drops `savedJson === json` | **214 passed — NOT PINNED** |
| M-m6a | `occupiedAliasTokens` → `return [renormalized].filter(Boolean)` (exactly the pre-fix-round rule) | **78 passed — NOT PINNED** |
| M-m6b | `occupiedAliasTokens` → `return [verbatim].filter(Boolean)` | **2 failed / 76 passed** |
| P1 | Throwaway `src/lib/import/__zzprobe.test.ts` (since deleted): `JSON.stringify(review.program)` identical before/after `storedOccurrenceCounts` + `storedExerciseCount`, no `stored-count-probe` substring, count `4` while `occurrenceCount` is `1` | passed |

---

## Important 1 — the stale `resolution` mock: **CONFIRMED CLOSED**, and the trap was live

Both halves of the claim verified, and the second is the more important one.

- **M-I1a**: the mock was a live trap. Reinstating it while keeping the new test body throws `TypeError: (0 , resolution_1.groupResolutionOccurrences) is not a function`. Dropping the mock entirely (rather than topping it up) is the right fix — `@/lib/import/resolution` is pure and cheap, so there is nothing to fake, and a partial mock of a module the component keeps growing imports from will go stale again.
- **M-I1b** is the finding that matters and it is worse than the report claims. With `day(s) · exercise(s)` literally shipping in `ImportClient.tsx:373`, the **old** test reported `1 passed, 1 total`. The test named "does not use (s) suffixes in confirm step" would have passed with the exact defect it names in the product. The new body reaches the confirm step and fails under the same mutation, with `1 day · 1 exercise` as a completion canary that cannot be satisfied from the paste step.

Verdict: **PASS.** This was the eleventh-and-a-bit instance of the vacuous-test mode on this plan and it is now genuinely closed.

## Important 2 — no global alias for a failed program save: **CONFIRMED, this is the headline verification**

**M-ORD** (the faithful ordering swap) kills **exactly one** test, and for exactly the right reason:

```
● ImportClient: … › writes no alias when the routine itself could not be saved
  expect(jest.fn()).not.toHaveBeenCalled()
  Received number of calls: 1
  1: [{"alias": "Back Squat", "canonicalExerciseId": "barbell-low-bar-squat", "provenance": "remembered"}]
```

Under the mutant a permanent global alias is persisted for a routine the user does not have. Fix round 1 left all 191 green under the same mutant; it now fails. **Ordering is load-bearing and pinned**, as the narrow invariant it actually is rather than as a headline rule. This was the single most important item in my scope and it is discharged.

Verdict: **PASS.**

## Important 3 — the silent no-op: **implementation matches the settled ruling**

Not relitigating the ruling. Checking the three things I was asked to check:

1. **The row genuinely states it will not apply.** `ResolutionStep.tsx:292-296` renders `won't apply — the routine's structure is ambiguous here` on `storedCount === 0`. **M-I3a** (delete the block) kills exactly the one test. The `undefined` case is safe (`undefined === 0` is false), so a group whose count has not been computed does not get scolded.
2. **It is genuinely excluded from the tally.** `ImportClient.tsx:356` sources `resolvedCount` from `storedExerciseCount`, which returns `0` for a structurally ambiguous path; `ImportClient.tsx:374` gates the line on `resolvedCount > 0`, so the "1 exercise mapped to catalog" lie is gone entirely rather than becoming "0 exercises mapped". **M-m2** kills the confirm-count test. The zero case at unit level carries a **differential control** — `resolution.test.ts:1418-1422` asserts `occurrenceCount > 0` **and** stored count `0` in the same test, so no fixture can make the two numbers coincidentally agree.
3. **The structural-warning safeguard survives.** `applyResolutionsWithStats` only calls `recordPatch` when it actually patches (`resolution.ts:447, 461`), and `resolvedPaths` is now populated *only* through `recordPatch`, so an unpatched ambiguous path keeps its warning at `resolution.ts:538`. Pre-existing tests pin this (`resolution.test.ts:643-666`).

Verdict: **PASS.**

## Minors

- **m1 — PASS.** The skip lives inside `dedupeAliasResolutions` (`resolution.ts:194-198`). **M-m1** kills 3 tests, and crucially those three call `dedupeAliasResolutions` **directly**, bypassing the stronger `rememberableTarget` guard upstream in `rememberedAliasInputs` — so this is not the "stronger earlier guard" shape that produced the M4 mask last round.
- **m2 — PARTIAL.** `resolvedCount` is pinned (M-m2, 1 test, on a 4-week fixture where the two numbers deliberately disagree 4-vs-1). **`customCount` is not**: **M-m2b** reverts only it to `.length` and leaves 214/214 green. Minor finding below.
- **m3 — PASS, stronger than reported.** M-m3 kills the test on the checkbox assertion; with that assertion removed the write assertion *also* fails, so the "no alias persisted off a stale tick" half is independently mutation-proved rather than shadowed. No render loop: `groups` is memoized on `review` and the reducer returns the same reference when nothing changed.
- **m4 — PASS, and the honesty claim is exact.** M-m4 fails **10** tests. Nine are `getByRole("checkbox", { name: /^Remember "Back Squat"/ })` locator dependencies; the tenth, `names the exercise and the chosen version in the Remember label`, is the one independent judgement. Calling this a locator dependency rather than ten judgements was correct.
- **m5 — PASS on the reported direction, GAP on the inverse.** `newId` is `crypto.randomUUID()` (`parser.ts:707-709`), so the second-document bug was real and the fix is not a no-op. M-m5a and M-m5b each kill the one test. But **M-m5c** (both guards loosened) leaves 214/214 green — see Important finding below.
- **m6 — the REASONING is right and overturns the controller's instruction; the CODE it produced is dead.** See Important finding below.
- **m7 — cannot falsify (e2e not in my remit), reads correct.** `e2e/program-import.spec.ts:53-85` now asserts the select is visible, that `Review import` is **disabled** before an answer, and that the Remember checkbox is disabled before an answer. The E2 mutant described (re-adding the 0.65 auto-select) would pre-answer the select, which makes `await expect(reviewBtn).toBeDisabled()` fail — so the assertion does discriminate "silently answered" from "required", which is the class that slipped through before. One structural note: spec 5 now opens by clicking `Review import` and depends on spec 4 having left the page on the resolve step. That is consistent with the file's declared serial mode but couples the two.

---

## Controller question 1 — is Task 8's held item I2 genuinely closed?

**Yes, with one consumer that needs naming rather than fixing.** Every consumer of each number:

| Surface | Number it reads | Correct? |
|---|---|---|
| `ResolutionStep.tsx:290` — `used N times` | `storedCount` ← `storedOccurrenceCounts` ← `applyResolutionsWithStats` | Yes — spec ~428's "count of stored exercise occurrences" |
| `ResolutionStep.tsx:292` — `won't apply` | `storedCount === 0` | Yes |
| `ImportClient.tsx:356` — `N exercises mapped to catalog` | `storedExerciseCount` | Yes |
| `ImportClient.tsx:362` — `N exercises imported as custom` | `storedExerciseCount` | Yes (but see m2b) |
| `ResolutionStep.tsx:371` — whether to render `Resolve occurrences separately` | `group.occurrenceCount > 1` | **Yes, and this is the right number.** It renders no number; it gates the escape hatch, which expands into one selector per *authoritative resolution path*. `occurrenceCount` is exactly the count of separately addressable paths. Spec ~432 ties the control to "identical text intentionally refers to different concrete exercises", i.e. paths, not stored clones — and week-clones are not separately addressable, so a 4-week single-`Back Squat` program correctly offers no split while correctly reading `used 4 times`. |
| `resolution.ts:52,125,133` | `occurrenceCount` definition/population | Internal warning-path count, documented as such at `resolution.ts:267` |

**No user-facing consumer displays `occurrenceCount`.** Not a Critical spec deviation. I2 is closed.

## Controller question 2 — does `applyResolutionsWithStats` remove the second-traversal class, and does the sentinel leak?

**Removed, not relocated.** `patchedByPath` is incremented inside `recordPatch`, which is called at the only two sites that write `canonicalExerciseId` (`resolution.ts:447, 461`). `resolvedPaths` is now populated *only* via `recordPatch`, so warning-clearing and counting share one population rule and cannot disagree. `countProbedExercises` and its independent walk over `program.days` + `getOverrideReplacementDays(override)` are gone. "`applyResolutions` patches a container the counter did not walk" is now unrepresentable: the count comes from the patch.

**The sentinel does not leak.** `storedExerciseCount` returns a number and discards the patched program (`resolution.ts:298-306`); `storedOccurrenceCounts` returns only counts. `applyResolutionsWithStats` is exported but its only non-test callers are `applyResolutions` and the two count functions (grep over `src/` and `e2e/`). Proved empirically with throwaway test **P1**: `JSON.stringify(review.program)` is byte-identical before and after both count calls and contains no `stored-count-probe` substring, while the count comes out `4` against an `occurrenceCount` of `1`.

## Controller question 3 — wire the conflict notice to `ExerciseCorrectionSheet` now?

**No. Defer to Task 11.** The code is cheap (~15 lines) but the dependency order is wrong three ways:

1. `src/components/catalog/**` is another agent's lane this round, and Task 10 still has **two open Criticals** — `var(--line-strong)` renders no border at all (C1) and `Return to standalone` is a no-op for an alias-governed name (C2). Wiring now would ship the import surface an invisible sheet with one broken action, and would put Task 9's binding obligation — the conflict notice is the artifact it is judged on — behind another lane's re-review.
2. The notice already satisfies the spec's requirement in prose (spec ~443: "directs the user to the correction surface"). `ImportClient.tsx:206` names the alias, names its current meaning, and says "remove or replace that mapping from the exercise catalog", with `Open program →` as the out. A link is *better*, not *missing*.
3. Task 11 already owns extending `src/components/catalog/` and the sheet, so it can add the entry point alongside its own work instead of Task 9 reaching across lanes.

Sketch for whoever picks it up (do not implement here):

- `src/components/import/ImportClient.tsx:199-207` — `describeRememberConflicts` returns one prose string. Keep it, and alongside it store `conflicts.map(({ input }) => ({ kind: "normalized-name", value: input.alias }) as CorrectionTarget)` in a new `conflictTargets` state next to `rememberNotice` (`ImportClient.tsx:44`).
- `src/components/import/ImportClient.tsx:389-393` — where `rememberNotice` renders, add one `Fix mapping` button per target that sets a `correctionTarget`, and render `<ExerciseCorrectionSheet target={correctionTarget} onClose={() => setCorrectionTarget(null)} />` below it.
- `{ kind: "normalized-name", value }` is the right target kind: `ExerciseCorrectionSheet.tsx:22-25`, and per Task 10's ruling `replaceRemembered` is reachable *only* for a `normalized-name` target whose token is held by a different exercise — which is precisely this conflict.
- Preconditions: `ImportClient` must sit under `ExerciseNormalizationProvider` (already true via `src/main.tsx`), and Task 10's C1 and C2 must land first.

---

## NEW findings

### Important N1 — m6's "deliberate superset" is dead code, and its test is vacuous

The **push-back itself is correct and I endorse it against the controller's instruction**, with the file:line evidence checked:

- `aliasRepo.ts:67` keys `staged` on `alias.normalizedAlias` **verbatim**, so a legacy non-normalize-stable row is invisible to `saveMany`'s conflict check;
- `by-normalized-alias` is a unique index on `normalizedAlias`, so the second row takes a *different* index key and the write is **not** rejected — no `ConstraintError`, the row lands;
- `identity.ts:284-286` matches on `normalizeExerciseName(candidate.normalizedAlias || candidate.alias)` through `findUnique`, which returns `undefined` when `matches.length !== 1` (`identity.ts:118-121`). Two rows → the name stops resolving via alias **entirely**.

So keying the pre-check on the **re-normalized** stored token is right, and unifying onto `saveMany`'s verbatim rule would have been strictly weaker. That half is pinned: **M-m6b** (verbatim only) fails 2 tests.

**But the verbatim token the fix round added contributes nothing.** **M-m6a** — reverting `occupiedAliasTokens` to `[renormalized]`, i.e. exactly the pre-fix-round rule — leaves **78/78 green**. And it is not merely unpinned, it is **unfalsifiable by construction**:

- the lookup key is always `normalizeExerciseName(input.alias)` (`resolution.ts:333`), i.e. always in the image of `normalizeExerciseName`;
- `normalizeExerciseName` (`normalize.ts:5-12`) emits only `[a-z0-9]` and single interior spaces, trimmed — so its image is exactly its set of fixed points and it is idempotent;
- therefore the verbatim token can only ever match when `row.normalizedAlias` is already a fixed point, in which case `renormalized` is the identical string.

The renormalized rule was **already** the superset over `saveMany`'s verbatim rule. Nothing was widened.

The test `treats the verbatim stored token as occupied even if it does not renormalize` (`resolution.test.ts:1546-1552`) is misnamed and vacuous: its fixture token `"back squat"` **does** renormalize to itself, so it exercises the same code path as the test above it. This is the "fixture makes two independently-computed values coincidentally agree" shape — the same shape that hid Task 8's I2.

Per the standing rule, "unfalsifiable by construction → dead code, delete it." Required: drop the `verbatim` entry from `occupiedAliasTokens` (or delete the helper and restore the one-line map), keep the docblock's reasoning about the two consumers because it is correct and valuable, and either delete or honestly rename the vacuous test. One real behavioural difference the rewrite did introduce and should be stated if the helper is kept: `if (!byToken.has(token))` changed duplicate-token reporting from last-wins to **first-wins**, which only affects which occupant the message names in a situation where the resolver already returns nothing.

### Important N2 — m5's fix creates a program-overwrite capability whose safe direction is unpinned

Before this fix `saveProgram` always received a fresh `crypto.randomUUID()` id, so overwriting an existing program document was impossible from the import screen. The fix deliberately introduces a write-over-existing-document path (`ImportClient.tsx:225-229`), guarded twice: `handleValidate` clears `savedProgramId`/`savedJson` when the text changed (`:136-139`), and `handleSave` re-checks `savedJson === json`.

**M-m5c** loosens both and all 214 tests still pass. The behaviour under that mutant is a silent data loss: save routine A on the conflict path → edit the textarea to routine B → validate → save → **routine B is written under routine A's id and routine A is gone**, with no error and no navigation change.

This is not a live defect: each guard alone blocks it, so a single-guard regression stays safe. But the *inverse* invariant of the only new data-write capability in this fix round has no test at all, on a plan where three data-loss paths were already found invisible to a green suite. One test closes it: after the conflict-path save, go back, paste **different** JSON, validate, save, and assert `second.id !== first.id`. Same fixture family as the existing m5 test, four extra lines.

### Minor N3 — `customCount` can drift back to occurrence paths unnoticed

**M-m2b**: reverting only `customCount` (`ImportClient.tsx:362`) to `unresolvedItems.filter(…).length` leaves 214/214 green. `resolvedCount` and `customCount` are the same claim on the same screen and only one is pinned. One line in the existing 4-week test: click `Keep as custom` and assert `4 exercises imported as custom`.

### Minor N4 — the spec's literal `Remember this interpretation` now exists only in comments

The m4 relabel is correct and I endorse it (the accessibility problem was real). But the string the spec names as the action (`design.md` ~441) no longer appears in any UI or locator — only in six comments and docblocks: `ResolutionStep.tsx:37, 170, 238`, `resolution.ts:45, 237`, `ImportClient.remember.test.tsx:4`. `resolution.ts:237` in particular documents `rememberedAliasInputs` in terms of a label that no longer exists. Worth one pass to say "the Remember tick" instead.

### Minor N5 — the confirm-step zero case is pinned only transitively

Nothing asserts end-to-end that a structurally ambiguous import shows **no** `mapped to catalog` line at the confirm step. The behaviour is correct (`resolvedCount > 0` gate at `:374`) and both halves are pinned separately — the `0` from `storedExerciseCount` at unit level and the row copy at `ResolutionStep` level — but the composition is not. Low priority given the two pins.

### Minor N6 — a zero-count group can still be remembered

`rememberableTarget` does not consider `storedCount`, so a user may tick Remember on a group whose patch reaches nothing and a global alias is written. I think this is **correct** — an alias is about the name, not about this routine — and I raise it only so the next reader does not read it as an oversight.

---

## Verified but could NOT falsify

- **m7 / e2e.** Out of my remit to run. The assertions read as discriminating (`Review import` disabled before an answer is what makes the E2 "silently answered" mutant fail), but I did not execute either e2e mutation.
- **Repo-wide `typecheck`, `lint`, `build`, full unit suite.** Not run; other agents had live mutations in the worktree (`scripts/catalog-normalization/compiler/core.ts`, `src/lib/catalog/importDisambiguations.generated.json`, and three `__ZZ*` scratch test files) during my window, so any repo-wide number would have been misattributed.
- **Flake behaviour under `--maxWorkers=24`.** Not exercised; the fix round adds one `useEffect` with no new async boundary and the reducer returns an identical reference when nothing changes, so I saw no new race to expose with `asyncUtilTimeout: 1`.
- **Data-safety invariants re-checked and holding.** No `IDBObjectStore.add()` anywhere in `src/` (every `.add(` hit is a `Set`). `by-normalized-alias` remains the only `{ unique: true }` index. The conflict path withholds occupied tokens *before* the write, and since the withhold rule is a strict superset of `saveMany`'s, a `ConstraintError` from a pre-existing row is unreachable through the import screen; a concurrent-tab claim between check and write is caught and reported with the routine already saved.

---

## Status

**CHANGES REQUESTED** — no Critical. Both Important items are new; all three prior Importants and six of seven minors are confirmed closed, and Important 2 in particular is now genuinely pinned rather than decorative.

Must change:

1. **N1** — delete the `verbatim` token from `occupiedAliasTokens` (`resolution.ts:361-364`): it is unfalsifiable by construction, M-m6a reverting it leaves 78/78 green. Keep the docblock reasoning. Delete or honestly rename `treats the verbatim stored token as occupied even if it does not renormalize` (`resolution.test.ts:1546-1552`), whose fixture makes the two token rules coincidentally agree. If the helper is kept for shape, state the measured negative result in the comment per the standing rule, and note the last-wins → first-wins change.
2. **N2** — add the inverse m5 test: after a conflict-path save, paste **different** JSON, validate, save, assert `second.id !== first.id`. This is the only new data-write capability in the round and its safe direction is unpinned (M-m5c: 214/214 green).
3. **N3** — extend the existing 4-week confirm test to assert the `imported as custom` count too (M-m2b: 214/214 green).
4. **N4, N5, N6** — comment/wording cleanup and an optional composition test; reviewer's discretion, not gating.

Task 9's binding obligation remains discharged and is now protected by a working ordering pin.
