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

---

# Fix round 1

All five substantive items landed, plus the minors. Two of them (`C2`, `I2`) changed shipped behaviour; the rest are a token rename, a display cap, and corrected reasoning.

## C1 — the sheet had no border in any theme

`var(--line-strong)` has **zero definitions** in `globals.css` (verified: `grep -n "\-\-line-strong" src/app/globals.css` returns nothing, and the only occurrence anywhere in `src/` was my own line). An unresolvable `var()` invalidates the whole `border` shorthand at computed-value time, so the sheet's only visual boundary never rendered.

Fixed to `var(--line-2)`, which `globals.css` defines in all six theme blocks (lines 14, 35, 56, 78, 99, 120) with `#353c46` first — exactly the strong-line value in `DESIGN.md:11`. No new token invented, and no `var(--line-strong, var(--line))` fallback, which would have silently downgraded to the weaker line and hidden the mistake.

**The guard generalises.** A render test cannot see a missing border, so instead of pinning one token I added a scan: every `var(--token)` used by either component file must be defined in `globals.css`. It found exactly one violation (`--line-strong`) and carries a canary so a scan that matched nothing cannot pass.

## C2 — `Return to standalone` reported success while doing nothing

Confirmed the resolver order at source: `resolveName` returns from the alias branch at `identity.ts:283-298` before it ever reaches the `normalized-name` override at `identity.ts:336-340`. So for an alias-governed name every override write is dead weight.

Three changes, all in `writeOverride`:

1. **Clearing drops the alias.** For a `normalized-name` target with a governing alias, `aliasRepo.removeMany(ids, { dispatch: false })` runs before the override write, which then fires the single event. This is the one intent that *can* be honoured, because for such a name the alias **is** the identity being cleared.
2. **Assigning refuses instead of lying.** The only way to make an assignment take effect is to destroy a mapping the user did not offer up, so the sheet reports `“Hatfield Squat” is mapped to High Bar Back Squat. Return it to standalone, or replace the mapping, before assigning a movement.` and writes nothing.
3. **Success is verified against storage, not against the snapshot.** After the writes, `aliasRepo.find(target.value)` must come back empty. The sheet's own `context` has not reloaded yet, and a concurrent writer could have re-occupied the token.

`governingAliases` is a `filter`, not a `find`: the unique index permits only one row per token, but a list costs nothing and means a duplicate arriving from a hand-edited backup cannot survive a deliberate correction.

**M3 folded in, in the place where the dead data is created.** Creating a remembered alias makes any `normalized-name` override for that token permanently unreachable, so `writeAliasMapping` now deletes it. Ordered *after* the alias write, so a rejected mapping deletes nothing; a missing key is a no-op delete. The alias write is now `{ dispatch: false }` so the pair still fires exactly one identity event — pinned by an event counter in the mapping test (`expect(events).toBe(1)`), not merely implied.

I read "in the same place" as the map action rather than the standalone action, because that is where the unreachable row is *produced*, and because deleting the override on the standalone path would contradict spec ~176: `movementId: null` **is** the stored representation of standalone, not the absence of a row. Flagging the reading in case it was meant the other way.

## I1 — `Needs review` is now quiet by default

Reproduced the scale: `142 of 3,175` catalogue entries carry a `movementId`. The section is now **collapsed behind its count**, and when open renders at most 10 rows with a `+N more` row that reveals the rest — the same `+N` idiom the sheet uses for the version list. `CategorySection`'s collapse pattern in the same file was the model, so the Library has one disclosure vocabulary rather than two.

The count is the instrument; the rows are the detail you ask for. This is the pattern Tasks 11 and 13 will copy.

## I2 — `deriveNeedsReview` no longer rescans the catalogue per entry

Resolution outcomes are memoised on a key that determines everything the function reads. Measured with a throwaway harness (deleted, not committed — numbers below are the whole point of it):

| entries | `canonicalExerciseId` | before | after |
|---|---|---|---|
| 600 | present | 1ms | 1ms |
| 600 | absent (name-only) | **1,336ms** | **308ms** |
| 2,400 | present | 2ms | 4ms |
| 2,400 | absent (name-only) | **5,427ms** | **345ms** |

The important property is not the constant but the shape: cost became flat in the number of entries and linear only in the number of *distinct* identities (80 in the harness), so a user's growing log no longer makes every saved correction slower. My machine is slower than the reviewer's per resolve (~4ms vs ~1ms), so my absolute numbers are higher at both ends; the ratio is the same story.

**The key excludes `slotId` deliberately** and keys custom exercises on their **id**, not their name — a custom exercise resolves by id, so two custom exercises sharing a name are two different targets. That over-collapse is the failure mode a name-based key would introduce silently, so it has its own test.

## I3 — the radio-name rationale was wrong; corrected and measured

The reviewer is right and my comment was wrong. Reverting **only** the radio group `name` to a literal leaves the sheet suite at **16 passed, 16 total** (mutation F8 below). React's `updateNamedCousins` re-syncs controlled radios that share a name, so the other sheet's selection survives — my "silently clear the other's" claim was false.

The comment at `ExerciseCorrectionSheet.tsx:137-147` now states both mechanisms accurately: the **id** collision makes both labels resolve to the first control (falsifiable, killed by S7), while the shared **name** merges two sheets into one keyboard radio group so arrow keys jump between them (correct, but unfalsifiable in jsdom, which implements no radio-group arrow traversal).

I added the reviewer's state test anyway — two `normalized-name` sheets, click Map in A, assert B's `Assign a primary movement` is still checked. It passes on shipped code and, as measured, also passes with the mutation. It is recorded as a guarantee-pinning test, not as mutation coverage.

## Minors

- **M1 — recorded as a measured negative result, not an open question.** The `main.tsx` source-text assertion is adequate: the file is 13 lines, the regex catches removal of either the import or the wrapper, and the provider's own suite covers runtime behaviour. Not upgraded.
- **M2 — not taken.** No unmount guard on `setSnapshot`; harmless in React 19, and `appliedRequest` is the natural home if a future consumer needs one.
- **M4 — taken.** The version list is now filter-first: an empty filter lists **no** options and the placeholder reads `filter to choose a version…`, instead of presenting the 40 alphabetically-first of 3,175 entries as if they were a menu. The cap and its `+N` hint still apply once a query narrows the list (`squat` → 212 matches → 40 shown, `+172`).
- **M5 — left to Task 11**, as ruled.

## Two negative results the reviewer asked to have written down

1. **`main.tsx` coverage**: adequate as-is (see M1 above). Measured, not assumed.
2. **The atomic-reload probe records store *counts*.** A provider that mixed generation N aliases with generation N−1 overrides would pass if both generations happened to hold the same number of rows. Not worth fixing — the fixture adds exactly one row to each store, so the counts differ across generations by construction — but it is a real limit of the probe and is now recorded rather than implied. A content-hash probe would close it if a future task needs to.

## Two flaws I found in my own new tests

Both are the "passes for the wrong reason" family, and both were caught by running each test **in isolation** rather than only in suite order.

1. **`reports failure when the alias survives the clearing write` asserted synchronously after three IndexedDB round-trips.** It passed in suite order and **failed in isolation** — neither the alert nor the status existed yet, so the assertion was sampling an unfinished handler. Fixed to `await screen.findByRole("alert")`.
2. **`maps an unknown name…`'s event counter was sampled, not awaited** — `expect(events).toBe(1)` read `0` in **2 of 4** consecutive suite runs. Genuinely flaky, introduced by me in this round. Fixed by awaiting the status line (set only after both writes resolve) before asserting, then 6/6 clean runs.

I then audited every test that asserts after an async write and moved the completion wait *before* the spy assertions in three more places, so no assertion in the suite samples an in-flight handler. The second `Return to standalone` phase waits on the status **text changing** rather than on the element appearing, because a status line is already on screen from the save before it.

No timeout was raised anywhere in this round.

## Mutation evidence (fix round)

Each mutation was applied to the shipped file, run, then restored and `shasum`-verified against a pre-mutation copy (`fix.sheet.tsx` `36f3f43…`, `fix.library.tsx` `8d93be4…`, both matching after every restore).

Sheet — `ExerciseCorrectionSheet.tsx`, suite of 16:

| # | Exact mutation | Result |
|---|---|---|
| F1 | `border: "1px solid var(--line-2)"` → `var(--line-strong)` | 1 failed / 15 passed — `only uses theme tokens that globals.css actually defines` |
| F2 | `if (governingAliases.length > 0 && input.movementId !== null) {` → `if (false) {` | 1 failed / 15 passed — `refuses to assign a movement while an alias governs the name` |
| F3 | deleted the `aliasRepo.removeMany(governingAliases…)` block | 1 failed / 15 passed — `returns an alias-governed name to standalone by dropping the alias` |
| F4 | `if (target.kind === "normalized-name" && (await aliasRepo.find(target.value))) {` → `if (false) {` | 1 failed / 15 passed — `reports failure when the alias survives the clearing write` |
| F5 | deleted `await normalizationOverrideRepo.remove(normalizationOverrideKey(…))` | 3 failed / 13 passed — `clears an override…`, plus both alias tests via the lost event |
| F6 | removed `{ dispatch: false }` from both alias writes | 2 failed / 14 passed — the event counter reads 2 |
| F7 | `if (!query) return [];` → return the whole sorted catalogue | 1 failed / 15 passed — `lists no versions until the filter narrows them` |
| F8 | `name={`${fieldId}-action`}` → `name="correction-action"` | **16 passed / 16 — SURVIVED, as the reviewer measured.** Recorded under I3. |

Library — `LibraryClient.tsx`, suite of 9:

| # | Exact mutation | Result |
|---|---|---|
| L6 | `useState(false)` → `useState(true)` for the section's `open` | 7 failed / 2 passed (blunt: the helper's expand click then collapses it; the precise kill is `keeps the review list collapsed behind its count`) |
| L7 | `items.slice(0, NEEDS_REVIEW_PREVIEW)` → `items` | 1 failed / 8 passed — `caps the open list and reveals the rest on request` |
| L8 | `if (!outcomes.has(cacheKey)) {` → `if (true) {` | 1 failed / 8 passed — `resolves each distinct identity once` (4 resolves observed, 2 expected) |
| L9 | custom-exercise cache key `exerciseId` → `normalizeExerciseName(rawName)` | 1 failed / 8 passed — `does not collapse two custom exercises that share a name` |

## Gates (fix round)

```
$ bun run test -- --runInBand
Test Suites: 104 passed, 104 total
Tests:       1416 passed, 1416 total

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
(no output)

$ bun run lint
$ eslint .
(no output)

$ bun run build
✓ built in 2.44s
(!) Some chunks are larger than 500 kB after minification.   ← known-acceptable advisory

$ git diff --check
(clean)

$ bun run test:e2e
  93 passed (5.7m)
[exited with code 0]
```

## Foreign failures, checked rather than assumed

Every failure I saw outside my lane was verified before being attributed.

- **`src/components/workout/WorkoutDayClient.tsx:1030` typecheck error** (`ExerciseSessionRow[]` not assignable to `ExerciseHistoryRow[]`) — the workout lane mid-refactor. Verified not mine two ways: the types are Task 12/13's history projection, nothing my modules export; and `HistoryDrawer.tsx` imports `ExerciseCorrectionSheet`, `correctionTargetLabel`, and `CorrectionTarget` from me, all of which still exist with unchanged signatures. Cleared on a later run without any change from me.
- **`WorkoutDayClient.familyHistory.test.tsx` and `HistoryDrawer.test.tsx`, 21 tests, in 2 of 5 full-suite runs** — transient. The files changed *under the runner*: `WorkoutDayClient.familyHistory.test.tsx` no longer exists, and `HistoryDrawer.test.tsx` now passes 7/7 unchanged by me. That lane is also moving `historyProjection.ts`/`historyUtils.ts` into `src/components/workout/` as I write.
- **`e2e/history-rawcell.spec.ts`** failed once in a full e2e run and I nearly mis-attributed it — in the wrong direction. My first isolation attempt showed it passing *without* my changes, which looked damning, but that comparison was confounded: the other agent added files between the two runs. Re-run with my changes present it **passes in isolation** (`1 passed (5.9s)`), and the subsequent full e2e run is **93 passed, exit 0**. I did not touch the drawer's set-pill rendering, which is what the assertion is about. Worth stating plainly: a path-scoped stash is not a clean control while another lane is writing, and I would have drawn the wrong conclusion from one run.
- **One flake inside my own lane, disclosed rather than attributed away**: `renderSheet`'s 1000ms wait for the loaded snapshot blew its budget once in a 104-suite serial run (87s wall clock), on the first test in the file. It did not recur in four subsequent full runs. It is the RTL default async-util budget losing to a GC pause, not an ordering bug — but it is mine, and the honest statement is that my sheet suite is among the more expensive in the repo because every test recreates the database.

---

**Fix round status: DONE**

What a reviewer should scrutinise most in this round:

1. **My reading of M3** — I put the shadowed-override cleanup in the map action (where the dead row is created) rather than in the standalone action, because spec ~176 makes `movementId: null` the stored representation of standalone. If the intent was the other placement, say so.
2. **The assign refusal** — refusing is a product decision. The alternative was to drop the alias and write the override, which honours the click but destroys a remembered mapping the user never offered up.
3. **The post-write verification's falsifiability** — it is killed only by a fault-injected `removeMany` that resolves without deleting (F4). That injection is legitimate (it reproduces a concurrent re-occupier's end state) but it is an injection, not a natural path.
4. **`I1`'s numbers** — 10 preview rows and collapsed-by-default are judgement, not measurement. The measurement is only that 142/3,175 entries carry a movement.

---

# Fix round 2

Answering `task-10-review-2.md` (NEW-1 … NEW-5) plus Task 9's N1, and the
controller's mid-round empty-token hazard. Started from the six RED tests the
previous agent left uncommitted; inherited them critically, as instructed.

Commits, in order:

| SHA | What |
|---|---|
| `eb74798` | Item 2 — drop the unfalsifiable verbatim alias-token comparison |
| `dc154cf` | Item 1 + 3 + 5 — key name corrections on the resolver's token; write order; copy |
| `1701427` | Item 1 (import half) — the same keying for `Remember this interpretation` |
| `0ca5499` | Controller's hazard — refuse an annotation-only name in plain words |
| `1671076` | Simplification found while mutation-testing — derive the token in one place |
| `a62c8e4` | Self-review tidy — memo key, stray blank line |

## Critical assessment of the six inherited tests

All six were RED, and five were RED for the right reason. Measured baseline
before I touched anything: **6 failed / 25 passed** across the two catalog
suites, matching the controller's own reading. Real error text:

```
● keys an assigned annotated name on the token the resolver reads
    expect(received).toBe(expected)
    Expected: "squat"
    Received: undefined
    > 425 | expect((await resolveStoredName(annotatedName)).movementId).toBe("squat");

● keys a mapped annotated name on the resolver's token but keeps the user's words
    Expected: "barbell-high-bar-squat"
    Received: undefined
    > 445 | expect((await resolveStoredName(annotatedName)).concreteExerciseId).toBe(...)

● refuses to correct a name that offers a choice of exercises
    TestingLibraryElementError: Unable to find an accessible element with the role "alert"

● leaves an alias stored on a token the resolver never reads alone
    > 499 | expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    (the alert on screen read: “3 second paused Hatfield Squat” is mapped to
     High Bar Back Squat. — i.e. a refusal blocking a correction the user is
     entitled to make)

● keeps the remembered mapping when the standalone override write is rejected
    expect(received).toBeDefined()
    Received: undefined
    > 527 | expect(await aliasRepo.find("Hatfield Squat")).toBeDefined();

● returns an alias-governed name to standalone by dropping the alias   [modified, not new]
    Expected: Saved — returned to standalone; the mapping to High Bar Back Squat was removed.
    Received: Saved — returned to standalone.
```

Every one of those asserts against **storage or the DOM**, not against a spy, so
none of them can pass by the sheet merely claiming success. Three things I found
and changed:

1. **The sixth test was never RED, and it is not in the sheet suite.**
   `does not collapse two entries that share a name but not a canonical id`
   (NEW-3) passed from the start, because the shipped cache key was already
   correct — NEW-3 was a *test gap*, not a bug. The sixth failure in the 6/25
   baseline is the previous agent's edit to the existing clearing test. I kept
   the test and proved it earns its place by mutation instead of by RED: **R13**
   (drop `canonicalExerciseId` from `resolutionCacheKey`) went from surviving
   25/25 in the review to **1 failed / 30 passed**.

2. **`leaves an alias stored on a token the resolver never reads alone` had a
   fixture that my own fix would have invalidated.** It built the "old build"
   row with `aliasRepo.save`, which is the path I was about to re-key — so after
   the fix the fixture would have stored a *stripped* token and the test would
   have failed on its own canary rather than on the behaviour. Changed to
   `aliasRepo.putRaw`, which is the restore/migration path and derives the token
   from display text, so the fixture models a legacy row no matter what `save`
   keys on. Added an assertion that the planted row really holds the unstripped
   token.

3. **The governing-alias comparison was only half covered.** Mutation **M-F**
   (compare on `normalizeExerciseName(target.value)`) killed only the
   false-*refusal* direction. The false-*success* direction — an alias that
   really governs an annotated name, missed, so an assignment is written and
   reported as saved — had no test. Added
   `refuses to assign a movement while an alias governs another spelling of the
   name`: the mapping is made for the 3-second variant and the sheet is opened
   on the 5-second one. M-F now kills **2**.

Everything else in the six I kept as written; the canary helper
`expectAnnotationIsStripped` is the right shape and guards against the shipped
disambiguation artifact changing under the lane (it did change under me — the
catalogue agent edited `importDisambiguations.generated.json` mid-round).

## Item 1 — NEW-1, the token keying (CRITICAL)

Implemented the ruling: corrections key on
`prepareImportName(value, disambiguations).normalizedName`.

**Approach, and why it differs from the shape the ruling sketched.** The ruling
suggested letting a caller supply the lookup token while `alias` keeps the
display text. I built that first, then removed it, and the reason is measured:
mutation **M-O** (drop the sheet's explicit `normalizedAlias`) killed 2 tests —
but *only* spy-argument assertions, because `aliasRepo` derives the identical
token from `alias` anyway. An optional field that no input needs is one more way
for two surfaces to key one name differently, which is the defect being
removed. So the derivation lives in **one** place, `rememberedAliasToken` in
`aliasRepo.ts`, and both writers get it whether or not they think about it. Both
of the ruling's constraints hold:

- **No schema change, no unique-index change, no migration.**
  `by-normalized-alias` is still the only unique index, still no
  `IDBObjectStore.add()` anywhere. `putRaw` is untouched, so restored and
  migrated rows keep `aliasLookupToken`'s rule and resolve exactly as before —
  only NEW writes key differently.
- **Display text preserved.** `alias` is stored verbatim; the token never
  passes through it. Pinned by
  `keys a mapped annotated name on the resolver's token but keeps the user's
  words`, which asserts both fields.

Also re-keyed, all three siblings the review named:
`overrideTargetFor`'s `targetValue`; `governingAliases`, now byte-for-byte
`identity.ts:283-286`'s comparison; the post-write `aliasRepo.find` check; and
the map path's override-cleanup key.

**`reject-alternative` refuses**, in the same style as the C2 refusal, and it is
said *up front* on render rather than after a click that pretends to work:

> “Hatfield Squat or Lunge” names more than one exercise, so there is no single
> identity to correct. Change the name in the program or log to the one exercise
> you did.

**The one permitted line in `resolution.ts` was not enough, and I took three.**
Reported loudly rather than folded in. With the token derived inside `aliasRepo`
the alias *construction* at line 204 needed no change at all — but two
comparison keys in the same file did, and leaving them would have been worse
than the bug:

- `dedupeAliasResolutions`' key: two duration variants of one name now share a
  stored token, so keying them apart hands `saveMany` two answers for one unique
  index key. It rejects the **whole batch** — taking every unrelated alias in the
  same import with it. Keyed on the stored token, the conflict is dropped where
  the function already drops conflicts.
- `rememberedAliasConflicts`' input key: same reason, across imports rather than
  within one.

I also had to move the helper. My first version imported `rememberedAliasToken`
from `aliasRepo` into `resolution.ts`; that broke five tests in
`ImportClient.remember.test.tsx`, whose `jest.mock("@/lib/storage/aliasRepo")`
exports only `aliasRepo`. Rather than edit a file outside my lane I gave
`resolution.ts` its own two-line `storedAliasToken` built from the catalogue
primitives, which is better anyway: a pure-rules module should not drag
IndexedDB into its import graph, and the shared rule is `prepareImportName`
itself, not a wrapper. **Finding for the held Task 9 round:** that mock is the
same booby trap the controller already ruled on for `ImportClient.test.tsx` — it
will throw for the next person who adds an export.

## Item 2 — Task 9's N1, the dead superset

**Verified the reviewer's idempotence premise myself before deleting anything**,
as instructed. Throwaway probe, run and deleted: `normalizeExerciseName` is
idempotent on **200,003 inputs** — 200k pseudo-random strings over
`" aA0'’-_/.()#é\t\n%"`, plus every catalogue name and alias, plus every
disambiguation rule token. `NORM non-idempotent count: 0`. The reviewer is
right: the renormalized rule was already the superset and the verbatim half
could not differ for any input. Removed `occupiedAliasTokens`, inlined the
renormalized comparison, deleted the vacuous test (fixture `"back squat"`
renormalizes to itself, so it asserted nothing).

**Coherence with Item 1, stated plainly.** The operative rule is unchanged:
`resolveName` *re-normalizes the stored token* (`identity.ts:285`); it does not
run `prepareImportName` over stored rows. Item 1 changes what a NEW write puts
*in* that token, not how the token is read. So the two sides of
`rememberedAliasConflicts` are compared by deliberately different rules, and the
docblock now says so: a stored row is re-normalized; an input holds raw text and
goes through `storedAliasToken`.

The catalogue lane independently measured `prepareImportName(...).normalizedName`
to be a fixed point over 36,040 probes, which is the other half of the same
question and is recorded in the code comments.

## Item 3 — NEW-2, write order

Override first, alias delete second, with **conditional** suppression:

```ts
const clearsAlias = governingAliases.length > 0;
if (clearsAlias) {
  await normalizationOverrideRepo.save(input, { dispatch: false });
  await aliasRepo.removeMany(governingAliases.map((alias) => alias.id));
} else {
  await normalizationOverrideRepo.save(input);
}
```

A rejected override write now leaves the mapping intact and the failure visible.
On the write-rejection question the review asked about: neither call can hit a
`ConstraintError` — `removeMany` only deletes, and `normalizationOverrideRepo`
`put`s on a non-indexed primary key.

## Item 4 — NEW-3, and Item 5 — NEW-4 / NEW-5

NEW-3 closed by R13 above. NEW-4: the clearing test now counts events, and
**M-J** kills it. NEW-5: the standalone success line names what it discarded —
`Saved — returned to standalone; the mapping to High Bar Back Squat was
removed.` I chose *announce* over *confirm*: a second confirmation on the only
control that undoes a mapping would be friction on the recovery path, whereas
the asymmetry the review objected to is really that the destructive action was
*silent*. Naming it removes the asymmetry without adding a gate. Minor copy
taken too — the assign refusal now names `Map to an existing exercise`.

## The controller's mid-round hazard — the empty token

**1. Confirmed, by probe rather than by reading, that no row can be written and
no `ConstraintError` can occur.**

```
{"n":"Competition","plain":"competition","prepared":"","alt":false}
{"n":"Pain Free","plain":"pain free","prepared":"","alt":false}
{"n":"or","plain":"or","prepared":"","alt":true}
{"n":"!!!","plain":"","prepared":"","alt":false}
{"n":"To A Pain Free Depth","plain":"to a pain free depth","prepared":"","alt":false}
override validate: Error: Normalization override target cannot be empty | key: "normalized-name:"
alias saveMany: Error: Alias cannot be empty | rows: 0
```

Both guards fire **before** their transaction opens (`validateOverrideTarget:83`
runs inside `save` after read-only work; `assertRememberedInput` runs at
`saveMany`'s first statement, before `db.transaction`). Two empty-token names in
one `saveMany` batch left **0 rows**. Every write in `src/` is a `put`, so even a
shared key upserts rather than rejecting. Note also that a punctuation-only name
already normalized to `""` before this round, so the class is pre-existing and my
change widens it from "punctuation only" to "six phrase tokens as well".

**2. Made it an honest refusal.** The user saw `Normalization override target
cannot be empty`, which reads as a broken app. Now:

> “Competition” leaves no exercise name once its annotations are set aside, so
> there is nothing here to correct. Change the name in the program or log to the
> exercise you did.

**3. Tested.** `refuses to correct a name that is nothing but an annotation`
drives both actions and asserts zero rows in *both* stores. RED evidence:

```
Expected element to have text content: no exercise name
Received: Normalization override target cannot be empty
```

## Mutation evidence — every count beside its exact mutation

All applied to the shipped file, run, restored from a pre-mutation copy,
`shasum`-verified. Final restored hashes: `ExerciseCorrectionSheet.tsx`
`0956ded5…`, `LibraryClient.tsx` `8d93be41…`, `aliasRepo.ts` `ca1c9497…`,
`resolution.ts` `f157c3ef…`. Scope for the sheet/alias rows is
`src/components/catalog` + `aliasRepo.test.ts` (52 tests) unless noted; the
`aliasRepo`/`resolution` rows add `src/lib/import` (250 tests).

| # | Exact mutation | Result |
|---|---|---|
| M-A | `rememberedAliasConflicts` stored key `normalizeExerciseName(row.normalizedAlias)` → `row.normalizedAlias` | 2 failed / 248 — `compares normalized tokens, not display text`, `treats a stored token that only matches after normalizing as occupied` |
| M-B | `assertRememberedInput` token `rememberedAliasToken(input.alias)` → plain normalize | **5 failed / 245** — `keys a mapped annotated name…`, `refuses to assign a movement while an alias governs another spelling…`, `upserts by normalizedAlias…`, `stores a new alias under the token the resolver looks it up by`, `collapses two duration variants…` |
| M-C | `dedupeAliasResolutions` key `storedAliasToken` → plain normalize | 2 failed / 248 — `collapses two duration variants of one name and refuses to pick a winner`, `remembers one duration variant as the whole name, once` |
| M-D | `rememberedAliasConflicts` input key `storedAliasToken` → plain normalize | 1 failed / 249 — `sees a stored row occupying an annotated name's resolver token` |
| M-E | `overrideTargetFor` `targetValue: lookupToken` → `target.value` | 4 failed / 48 — `assigns and clears name-only targets`, `returns an alias-governed name to standalone…`, `keys an assigned annotated name…`, `leaves an alias stored on a token the resolver never reads alone` |
| M-F | `governingAliases` compared on `normalizeExerciseName(target.value)` | 2 failed / 50 — `refuses to assign a movement while an alias governs another spelling…` (false success), `leaves an alias stored on a token the resolver never reads alone` (false refusal) |
| M-G2 | `unaddressable`'s `hasAlternative` branch condition → `false` | 1 failed / 51 — `refuses to correct a name that offers a choice of exercises` |
| M-G3 | `unaddressable`'s empty-token branch condition → `false` | 1 failed / 51 — `refuses to correct a name that is nothing but an annotation` |
| M-H | alias delete moved back BEFORE the override write (the NEW-2 defect, ex-`R7b`) | **2 failed / 50** — `returns an alias-governed name to standalone…`, `keeps the remembered mapping when the standalone override write is rejected` (was 25/25 SURVIVING) |
| M-J | `save(input, { dispatch: false })` → `save(input)` on the clearing path (ex-`R8`) | **1 failed / 51** — `returns an alias-governed name to standalone…` (was 25/25 SURVIVING) |
| M-M | suppression applied unconditionally (the naive form the review measured as `R7`) | 5 failed / 47 — three assign tests, `keys an assigned annotated name…`, and `regroups live after a correction, without reloading logs` |
| M-K | standalone success line stops naming the discarded mapping | 1 failed / 51 — `returns an alias-governed name to standalone…` |
| M-N | assign refusal copy stops naming `Map to an existing exercise` | 1 failed / 51 — `refuses to assign a movement while an alias governs the name` |
| M-Q | `aliasRepo.find` token → plain normalize | 2 failed / 248 — `leaves an alias stored on a token the resolver never reads alone`, `upserts by normalizedAlias…` |
| M-R | `if (!normalizedAlias) throw new Error("Alias cannot be empty")` → `if (false)` | 1 failed / 249 — `saveMany rejects an alias that normalizes to nothing before opening a write transaction` (pre-existing test; the empty-token guard was already pinned) |
| R13 | `resolutionCacheKey` drops `canonicalExerciseId` | **1 failed / 249** — `does not collapse two entries that share a name but not a canonical id` (was 25/25 SURVIVING) |

### Survived, published as a gap rather than claimed as coverage

- **M-I** — post-write check `aliasRepo.find(lookupToken)` → `find(target.value)`:
  **33 passed / 33, survives.** Unfalsifiable **by construction**: `find` derives
  the token itself, so both arguments produce the same index key. Per the
  standing rule I removed the redundancy rather than keeping it — the call now
  reads `find(target.value)`, and the rule it depends on is pinned by M-Q.
- **M-O** — sheet stops supplying `normalizedAlias`: killed 2, but *only*
  spy-argument assertions, since `aliasRepo` derives the same token. Treated as
  redundant rather than as coverage, and the field was deleted (`1671076`).

## Gates — real output at `a62c8e4`

```
$ bun run test -- --runInBand
Test Suites: 103 passed, 103 total
Tests:       1493 passed, 1493 total
Time:        29.563 s

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json   (no output)

$ bun run lint
$ eslint .   (no output)

$ bun run build
✓ built in 1.97s        (only Vite's known large-chunk advisory)

$ git diff --check      (no output)

$ bun run test:e2e
93 passed (1.6m)
```

Baseline was 102 suites / 1,429 tests; the count moved because three lanes were
writing concurrently. **Foreign failures were attributed by filename, never
assumed.** Mid-round I saw 22 failures in `src/lib/workout/historyUtils.test.ts`
and `historyProjection.test.ts`; `git status` showed both files modified by the
Task 12 re-review agent, they failed in isolation with only their own files
dirty, and that agent has since landed `e07d8fa`/`acc61c2`/`d956791` and they are
green. The catalogue agent's edits to
`src/lib/catalog/importDisambiguations.generated.json` land inside my fixtures'
blast radius, which is exactly why `expectAnnotationIsStripped` exists.

**Flake checks.** All eight write-path tests run in isolation via `-t`:
`1 passed / 22 skipped` each. Four runs of the three affected lanes at
`--maxWorkers=24`: `250 passed` every time. No timeout was changed anywhere, and
I did not reproduce the previously disclosed `renderSheet` GC-pause flake.

## Self-review findings (fixed in `a62c8e4`)

- The `prepared` memo keyed on the `target` object, so a parent building the
  target inline would rebuild ten regexes on every keystroke in the version
  filter. Re-keyed on the name string.
- A stray double blank line where `occupiedAliasTokens` was removed.

## Deferred, with reasoning

- **`Remember this interpretation` on an alternatives (`or`) name still stores a
  row that can never be read.** Same lie class as NEW-1, on Task 9's surface.
  `dedupeAliasResolutions` could skip it in one line, but that trades a silent
  dead row for a silently-absent mapping; the honest fix needs a line of copy in
  `ImportClient.tsx` telling the user why the tick did not stick, and
  `src/components/import/**` is explicitly not my lane. Handing it to the held
  Task 9 round with the `ImportClient.remember.test.tsx` mock finding.
- **`correctionTargetKey` still keys review rows on the unstripped token**, so
  `3 second paused X` and `5 second paused X` list as two rows. Left alone
  deliberately: it is self-consistent, because correcting either one clears both
  from the queue on the next derivation, and merging them would need a
  disambiguation map that the pure key function does not have.
- **An annotation-only name still produces a `Needs review` row** the user can
  only resolve by renaming. That is honest rather than hidden, and the refusal
  says what to do; hiding such rows is the option the review's NEW-1 (c)
  described and the ruling rejected.

## Status

**DONE**

Commits `eb74798`, `dc154cf`, `1701427`, `0ca5499`, `1671076`, `a62c8e4`.
Gates: 103 suites / 1,493 tests / 0 failures; typecheck, lint, build,
`git diff --check` clean; e2e 93 passed.

What a reviewer should scrutinise most:

1. **The decision to derive the token inside `aliasRepo` rather than at the call
   site**, which is a deviation from the shape the ruling sketched. It makes the
   repository catalogue-aware, and it silently changes the key for any future
   caller of `save`/`saveMany`/`replaceRemembered`.
2. **The three lines taken in `resolution.ts` beyond the one permitted**, and
   whether the whole-batch-rejection argument for them holds.
3. **M-I and M-O**, the two redundancies I removed on the strength of a surviving
   mutation — check I removed the right one each time.
4. **The empty-token refusal's reachability claim**: I assert both stores refuse
   before any transaction opens. That is the write-rejection question, and it is
   the class that bricked this database once.
