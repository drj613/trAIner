# Task 10 — Provider and global correction surface report

## Delivered boundary

- `src/components/app/ExerciseNormalizationProvider.tsx` — `ExerciseNormalizationProvider` and `useExerciseNormalization()`. Publishes `{ version, context, resolve, loaded }`. The generated half of the resolution context is built once at module scope; the three stored collections (aliases, user exercises, normalization overrides) are read together and applied in one state update.
- `src/components/catalog/ExerciseCorrectionSheet.tsx` — one reusable sheet supporting the spec's three actions (spec ~445, ~463): remembered alias mapping to a concrete version, movement + compatible modifier assignment, and return-to-standalone. Exports `CorrectionTarget`, `correctionTargetKey`, `correctionTargetLabel`.
- `src/components/catalog/LibraryClient.tsx` — derived `Needs review` section (never persisted) plus `Change movement` on catalogue detail, both opening the same sheet. Exports `deriveNeedsReview` for direct testing.
- `src/main.tsx` — the provider wraps `<App />` at the root, so every route (Task 11/13 included) reads the same snapshot.

Out of scope and untouched: nested catalogue views (Task 11), history rendering (Tasks 12–13), the import lane (Task 9).

## The two invariants

### 1. Context reload is atomic — and the first attempt at proving it was toothless

`reload()` issues all three reads in one `Promise.all` and commits one `setSnapshot`, per plan Step 3.

My first version of `never publishes a snapshot where one store is fresh and another stale` observed every rendered `{aliases, userExercises, overrides}` triple and asserted none was mismatched. **It survived the mutation.** With the provider rewritten to "reload each store independently" (three sequential `await` + `setSnapshot` pairs) the suite reported `8 passed, 8 total`. The reason is React's automatic batching: three IndexedDB reads that all settle inside one macrotask produce one commit, so the torn state existed and no test could see it.

The fix was to make the tearing observable rather than to weaken the claim: each store's `list()` is spied to resolve behind a real `setTimeout(…, 0)` boundary, which is what three separate IndexedDB transactions actually do at different speeds. With that, the same mutation fails with the torn shapes printed:

```
Expected  -  1
Received  + 14
- Array []
+ Array [
+   Object { "aliases": 1, "overrides": 0, "userExercises": 0, "version": 1 },
+   Object { "aliases": 1, "overrides": 1, "userExercises": 0, "version": 1 },
  …
```

The test proves one coherent snapshot, not eventual convergence: the batch adds exactly one row to each of the three stores under a single dispatched event, so the only coherent triples are all-zero and all-one, and the assertion names no ordering (a per-store reload may land aliases or overrides first). It carries a completion canary — `observed.at(-1)` must equal `{version: 2, aliases: 1, userExercises: 1, overrides: 1}` — without which a provider that loaded nothing at all would satisfy it.

A second, related hole is closed by `ignores a stale reload that resolves after a newer one`: reloads are event-triggered, so two can be in flight, and a slow earlier read landing last republishes data that predates the write which triggered it. A monotonic request id drops superseded results. The test gates two reloads (A started before the override was committed, B after), lands B, then lands A, and asserts the movement and the version do not move. Removing the guard fails exactly that test.

`version` is a snapshot generation, not a reload counter: it starts at 1 (the generated registries are usable before IndexedDB answers), the first stored snapshot does not advance it, and each committed change advances it by exactly one. Making the initial load advance it too fails three tests.

### 2. Correction validation precedes writes

The sheet calls `validateNormalizationOverrideInput` — Task 6's exported validator, not a second opinion — on the pending override, both live (for the inline `role="alert"`) and again as the gate inside `writeOverride` before any repository call. Nothing about identity resolution moved into React: the sheet and `deriveNeedsReview` both call the pure `resolveExerciseIdentity` through the provider's `resolve`.

Deliberately, **the Save button is never disabled**. A disabled button would make the "write then validate" mutation unkillable, because no click could reach the write path at all. Instead an invalid draft is clickable, reports the specific validator message, and writes nothing. Moving the `normalizationOverrideRepo.save` call above the validation gate fails two tests (`rejects an invalid target before writing`, `rejects an incompatible modifier set before writing`) — the repository validates too, so the mutation still would not persist, which is exactly why the assertion is on the spy rather than on the stored row.

The sheet also emits modifiers in canonical sort order always, so `Modifier order is not canonical` is unreachable from this surface; the user is never shown a failure for the order they happened to tick boxes in.

### The one sanctioned overwrite

`replaceRemembered` is reached only from this sheet, only for a `normalized-name` target, only when the normalized token is held by a different exercise, and only after the user ticks `Replace the existing mapping` with the current occupant named in the alert. Clicking Save without that tick calls neither `aliasRepo.save` nor `aliasRepo.replaceRemembered`. Swapping `replaceRemembered` for `save` fails the test; so does removing the confirmation gate.

## TDD evidence

RED for the provider (plan Step 2), before any implementation existed:

```
● Test suite failed to run
  Cannot find module './ExerciseNormalizationProvider' from 'src/components/app/ExerciseNormalizationProvider.test.tsx'
```

RED for the sheet:

```
● Test suite failed to run
  Cannot find module './ExerciseCorrectionSheet' from 'src/components/catalog/ExerciseCorrectionSheet.test.tsx'
```

RED for the Library section — the modules existed by then, so this one had to fail on behaviour:

```
✕ lists unresolved program, log, and custom exercises with their occurrence counts
✕ leaves out a target the user has already returned to standalone
✕ regroups live after a correction, without reloading logs
✕ opens the shared correction sheet from catalogue detail
  ● TestingLibraryElementError: Unable to find role="region" and name "Needs review"
Tests: 4 failed, 4 total
```

## Mutation evidence

Every mutation was applied to the shipped file, run, then restored and re-hashed byte-for-byte (`shasum` compared against a pre-mutation copy each time).

Provider — `src/components/app/ExerciseNormalizationProvider.tsx` (8 tests):

| # | Mutation | Result |
|---|---|---|
| M1 | Atomic reload → reload each store into its own state update | **First attempt: SURVIVED, 8 passed** → test rewritten with real macrotask boundaries → 1 failed / 7 passed, torn triples printed |
| M2 | Remove the stale-request guard | 1 failed / 7 passed (`ignores a stale reload…`) |
| M3 | Initial load also advances `version` | 3 failed / 5 passed |
| M4 | Drop the unreadable-alias filter | 1 failed / 7 passed, with `TypeError: value.toLowerCase is not a function` at `normalize.ts:7` |
| M5 | Drop the unreadable-user-exercise filter | 1 failed / 7 passed |
| M6 | Unwrap `<App />` in `main.tsx` | 1 failed / 7 passed |
| M7 | Never subscribe to the identity event | 4 failed / 4 passed |

Sheet — `src/components/catalog/ExerciseCorrectionSheet.tsx` (10 tests):

| # | Mutation | Result |
|---|---|---|
| S1 | Write first, validate after | 2 failed / 7 passed |
| S2 | Overwrite an occupied alias with `save()` instead of `replaceRemembered()` | 1 failed / 8 passed |
| S3 | Replace without confirmation | 1 failed / 8 passed |
| S4 | Emit modifiers in click order instead of canonical order | 1 failed / 8 passed |
| S6 | Remove the version-list cap | 1 failed / 9 passed |
| S7 | Share literal field ids between sheets | 1 failed / 14 passed (catalog lane) |

Library — `src/components/catalog/LibraryClient.tsx` (5 tests):

| # | Mutation | Result |
|---|---|---|
| L1 | Stop excluding targets that already have a movement | 1 failed / 3 passed |
| L2 | Stop excluding targets the user already decided | 1 failed / 3 passed |
| L3 | Reload logs on every identity change | 1 failed / 3 passed |
| L4 | Compute `Needs review` once, never regroup | 1 failed / 3 passed (re-verified after the dependency array was simplified) |
| L5 | Key name targets on raw text instead of the normalized token | 1 failed / 3 passed |

Traps I specifically guarded against, and how:

- **A "reloads once" test that cannot tell one reload from three** — `reloads once per event and never reads logs` asserts `aliasRepo.list` and `normalizationOverrideRepo.list` were each called exactly twice (mount + one reload) after a settle tick, and that `logRepo.list` was never called at all. M7 and M3 both fail it.
- **Asserting a spinner rather than the effect** — no test asserts the "Reading stored corrections…" line. They await the real form control, then assert the write and the resulting `role="status"`.
- **Passing because something re-rendered for an unrelated reason** — the torn-snapshot test records every render's store *contents*, not render counts; the live-regrouping test asserts the corrected row disappears while a second unresolved row is still listed.
- **A canary on the exclusion tests** — `leaves out a target the user has already returned to standalone` first asserts the other two unresolved targets are still listed, so it cannot pass with the whole section broken.

## Design choices, and density over inflation

- **List rows, not cards.** `Needs review` is a hairline-separated list inside one bordered panel — the same shape as the existing muscle sections — with a three-column grid of `label / origins / count` at `7px 12px`. No per-item card, no shadow. The correction sheet is a stack of label-plus-field rows separated by 1px lines: it reads as a data inspector, not a wizard.
- **Pseudo-element hit areas, not padding.** Rows, radio labels, and modifier checkboxes use the existing `.tap-target` class, which `globals.css` already gives a `max(100%, var(--tap))` `::after` under `pointer: coarse`. Touch targets get comfortable on a phone without any row growing visually. No CSS file was modified — the mechanism already existed.
- **Flat at rest.** The sheet is raised by a `--line-strong` hairline with no fill, because it opens inside two different parents (`--bg-2` panel, `--bg-3` expanded catalogue row) and a fixed fill would invert the tonal ladder in one of them. Fields use the DESIGN `input` fill (`--bg-2`) with a 2px radius, matching `cell` density rather than the roomier 8px form input.
- **The data is the interface.** Occurrence counts and origin tags (`routine · log · custom`) are mono micro-labels, so the list answers "how much does this actually matter" without prose. Movement and modifier IDs never appear as ordinary copy (spec: the editor "does not expose internal IDs as ordinary copy"); the only IDs on screen are inside validator messages, where the precise token is the point.
- **Quiet by default.** One `role="alert"` region for the live validator message or an occupied-alias warning; one `role="status"` line after a save. No toast, no modal, no confetti. The sheet does not auto-close on save, so the correction and its result stay in one place and `Return to standalone` remains one click away.
- **The version list is filter-first and capped at 40** with a `+N` mono hint. A `<select>` holding all 3,175 catalogue entries is unusable on a phone and re-renders on every keystroke; the filter above it is the real instrument. This also cut the two mapping tests from ~740ms/1110ms to ~180ms each.

## Deliberate deviations from the plan's illustrative test code

1. **The atomic-reload test saves an `exercise-id` override, not a `normalized-name` one.** `Hatfield Squat` is a real catalogue entry (`ssb-hatfield-squat`) with `movementId: null`. `resolveName` matches the exact catalogue name at `identity.ts:308-311` *before* consulting a normalized-name override, so the plan's `validSquatOverride` would have been shadowed and the probe would never have shown `Squat`. Using the exercise-id override keeps the assertion (`Standalone` → `Squat`) and exercises the bundled-assignment action honestly. This is resolver precedence working as specified, not a defect — the same precedence the Task 8 review verified.
2. **Sheet tests render inside `ExerciseNormalizationProvider`.** The plan's snippets render the sheet bare, but validating an `exercise-id` target requires the stored user-exercise ids, and the provider is the sanctioned supplier. `renderSheet` waits for the loaded snapshot rather than acting on the pre-load one.
3. **`barbell-back-squat` replaces `barbell-high-bar-squat`** as the catalog-exercise target, because the latter already carries `movementId: "squat"` and `["barbell","back-rack","high-bar"]` — clicking `Barbell` there would *un*tick it. `barbell-back-squat` is the unassigned entry the Task 8 review flagged, so it is also the realistic correction target.
4. **Modifiers are ticked out of canonical order** (`Paused` then `Barbell`) and the exact saved array is asserted, which is what kills S4. `objectContaining({movementId})` would not have.

## Judgement calls a reviewer should check

- **What counts as "needs review".** The spec says the section derives from "unresolved program exercises, log entries, and user exercises" without defining unresolved. I used: **no `movementId`, and not classified by an override**. Two consequences worth confirming. First, it must be "no movement" rather than "no concrete match", or custom exercises could never appear — they always resolve concretely — and the spec names them explicitly. Second, `source === "user-override"` is excluded so a user who deliberately chose standalone (`movementId: null`) is not nagged forever. Because 3,033 of 3,175 catalogue entries are still unassigned, a routine full of unassigned bundled exercises will produce a long list; that is honest (none of them nest into a family) but it is a product judgement, not a spec quotation.
- **The sheet stays open after a save** and shows a `role="status"` line instead of closing. A correction inspector that vanishes on save cannot be checked or immediately undone. `onClose` is wired to an explicit Close button.
- **Multi-transaction reads.** `Promise.all` issues three separate IndexedDB read transactions, so this is atomic *as published state*, not a single database snapshot. A concurrent tab writing between the reads is theoretically visible; each subsequent event triggers a full reload, so it converges. Reading all three stores in one transaction would be strictly stronger but departs from the plan's stated shape and from the repo's repository API.
- **Unreadable rows are filtered out of the runtime context** using the exported `isReadableText`, matching `createMigrationContext`'s rule and rationale. Nothing is rewritten or deleted; the row simply does not enter resolution. Both filters are mutation-verified (M4, M5) rather than left as unverified guards.

## Gates

```
$ bun run test -- --runInBand
Test Suites: 102 passed, 102 total
Tests:       1368 passed, 1368 total
Snapshots:   0 total
Time:        17.95 s

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(no output)

$ bun run lint
$ eslint .
(no output)

$ bun run build
✓ 1765 modules transformed.
dist/index.html                     1.40 kB │ gzip:   0.70 kB
dist/assets/index-DRZU_Zh2.css     27.67 kB │ gzip:   6.97 kB
dist/assets/index-CquEsBUi.js   1,548.73 kB │ gzip: 273.80 kB
(!) Some chunks are larger than 500 kB after minification.   ← known-acceptable advisory
✓ built in 1.85s

$ git diff --check
(clean)
```

The full suite was run three times at default concurrency: `1367 passed` / `1367 passed` / `1367 passed` (before the final two tests were added), then `1368 passed` on the final run. **No foreign failures were observed at all**, so there is nothing to attribute to another lane. The floor in the brief (97 suites / 1306 tests) has moved to 102 / 1368 with the concurrent work that landed.

## Flakiness under `--maxWorkers=24`

My component suites do time out intermittently at 24 workers, and I did not paper over it. What I measured, on a 10-core machine (2.4× oversubscription):

- **Baseline without my suites:** `bun run test -- --maxWorkers=24 src/components/workout src/components/import src/components/app` fails `WorkoutDayClient.integration.test.tsx` in 2 of 2 runs. The saturation failure mode predates this task.
- **With my suites:** `ExerciseCorrectionSheet` and `LibraryClient` join `WorkoutDayClient.provider.integration`, `WorkoutDayClient.integration`, and `ImportClient.remember` in failing, with `Exceeded timeout of 5000 ms` and RTL's 1000ms async-util cap being hit while the test budget still had room.
- **What I did about it:** cut real cost rather than raise a limit — the 3,175-option select became a filter-first capped list (mapping tests 740ms → 180ms, 1110ms → 170ms) and the typed query in the Library test was shortened. No `jest.setTimeout`, no `waitFor` timeout, no `asyncUtilTimeout` change anywhere.
- **Why `asyncUtilTimeout: 1` does not apply here:** it proves a fix for a *race* that a longer wait was masking. There is no ordering bug to expose — the provider genuinely awaits three IndexedDB reads, so at `asyncUtilTimeout: 1` every async component test in this repo fails, mine and pre-existing alike. The failures at 24 workers are CPU starvation, evidenced by the same tests passing 3/3 at default concurrency and 3/3 in the full `--runInBand` gate.

## Self-review findings (found and fixed before committing)

1. **Duplicate DOM ids and a shared radio-group `name`** — two sheets can be open at once (one under a `Needs review` row, one inside an expanded catalogue row). Literal ids like `correction-movement` made both labels resolve to the same control, and a shared radio `name` would have made selecting an action in one sheet silently clear the other's. Fixed with `useId()`, pinned by `keeps two open sheets' fields independent`, and mutation-verified (S7).
2. **Post-save flicker** — `setDraft(null)` after a successful write made the form follow the stored identity while the provider reload was still in flight, flashing the pre-save classification for a frame. It now shows exactly what was written.
3. **Untested exported surface** — the provider originally exposed `refresh`. No production caller needs it (every identity-affecting repository write dispatches the event itself), and shipping an untested escape hatch invites a future caller to bypass the event path. Removed; Task 11/13 can add it with a test if they need it.
4. **`version` as a `useMemo` dependency** produced an eslint `unnecessary dependency` warning, and silencing it with a disable comment was the wrong trade. Removed; regrouping is driven by the provider republishing a new context, which L4 confirms is tested.
5. **Indentation** of the children wrapped in the new `<section aria-label="Catalogue">` was left un-reindented by the initial edit. Fixed.
6. One design-hook finding fired on `src/app/globals.css:210` (`#f6f7f9` outside the palette). That file is pre-existing and outside my lane; I did not touch it and did not suppress the finding.

## Deliberately deferred

- **Nested family/version catalogue rows** (Task 11) and **history entry points into this sheet** (Tasks 12–13). The sheet takes a `CorrectionTarget` and nothing else, so a history row or the Today drawer can open it with no changes here.
- **A name-only correction on a name that also exists in the catalogue** (e.g. `Hatfield Squat`) writes a normalized-name override that resolution will shadow, because exact catalogue-name matching precedes normalized-name overrides. In practice name-only targets come from names that matched nothing, so the path is not reachable from `Needs review`. Worth a look at final review if any surface can hand the sheet a name that does match the catalogue.
- **Error-path coverage for a rejected alias write.** `writeAliasMapping` surfaces a thrown message in the alert region, untested; the reachable rejection (an occupied token) is handled up front by the confirmation gate.

---

**Status: DONE**

Commits: `b5bd461` provider, `087f5a1` correction sheet, `2de83a0` Library needs-review wiring.

Reviewer attention, in priority order:

1. The **toothless-then-fixed atomic-reload test** — confirm the macrotask-boundary technique is doing what I claim, and that the coherent-triple assertion cannot be satisfied by a provider that loads nothing.
2. **The `Needs review` definition** (`no movementId` and `source !== "user-override"`) — the spec does not define "unresolved", and this choice determines how long the list is for a real user given 3,033 unassigned catalogue entries.
3. **The stale-reload guard** — whether dropping a superseded reload can ever drop the newest data, and whether `version` semantics (generation, not reload count) are right for Task 11/13 consumers.
4. **The replacement gate** — that no path reaches `replaceRemembered` without the confirmation, and that replacing a `legacy-auto` occupant (not just a `remembered` one) is the intended behaviour.
5. **`main.tsx` wiring coverage** — it is a source-text assertion, not a render test. It catches removal but proves nothing about runtime behaviour; the provider's own suite covers that.
