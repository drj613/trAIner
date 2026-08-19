# Task 9 report: Make import choices local by default

Branch `feat/exercise-catalog-normalization`, worktree
`.worktrees/exercise-catalog-normalization`.

**Suite floor at my start: 97 suites / 1,282 tests / 0 failures** (the brief said
1,281; measured 1,282 before I touched anything). **Final gate: 102 suites /
1,365 tests / 0 failures.** My work adds **2 suites and 29 tests**:

| File | Tests added |
|---|---|
| `src/lib/import/resolution.test.ts` | +18 (4 `rememberableTarget`, 5 `rememberedAliasInputs`, 4 `rememberedAliasConflicts`, 5 `storedOccurrenceCounts`) |
| `src/components/import/ResolutionStep.test.tsx` | +6 (new suite) |
| `src/components/import/ImportClient.remember.test.tsx` | +5 (new suite) |

The remaining +54 tests in the full run are other agents' work landing in this
shared worktree while I ran (`src/components/app/ExerciseNormalizationProvider*`,
`src/components/catalog/ExerciseCorrectionSheet*`, `LibraryClient*`,
`src/lib/storage/*`, `src/main.tsx`). I staged nothing outside my lane.

Files I changed:

| File | Change |
|---|---|
| `src/lib/import/resolution.ts` | `rememberableTarget`, `rememberedAliasInputs`, `rememberedAliasConflicts`, `storedOccurrenceCounts`; `dedupeAliasResolutions` parameter widened to `{path, rawName}[]` |
| `src/components/import/ResolutionStep.tsx` | rebuilt around groups: one selector + count per repeated name, Remember tick, occurrence-level expansion |
| `src/components/import/ImportClient.tsx` | routine saved first, one `aliasRepo.saveMany`, conflict UX, remember state |
| `src/lib/import/resolution.testFixtures.ts` | corrected a fixture docblock claim (see "count" section) |
| `e2e/helpers.ts`, `e2e/program-import.spec.ts` | answer the new version choice — **scope addition, justified below** |

---

## 1. The `ImportClient` regression — what it does now, and the proof

### What was broken

`ImportClient.tsx:128` saved one alias per name with `Promise.all(… aliasRepo.save …)`
**before** `saveProgram`. Task 6 made alias save reject a token that already
maps elsewhere (spec line 178). So the rejection propagated to the outer
`catch`, `saveError` showed the repo's internal string, and **`saveProgram`
never ran** — the whole import was lost.

### Is it actually reachable? Yes, and not only by a race

My first concern was that the case might be unreachable in a single-tab flow: if
an alias already maps `back squat`, the parser resolves the name at parse time
(`identity.ts:283-289`), so no choice is offered and nothing is remembered.

It is reachable through a **dangling alias**. `resolveName` finds the alias row,
then looks its target up in `catalogById` and `userExercises`
(`src/lib/catalog/identity.ts:285-297`); when neither has it, execution **falls
through to the underspecified rule**. So a remembered alias pointing at a user
exercise the user has since deleted:

- keeps occupying the `back squat` token on the unique index, and
- lets the name present a version choice again.

Pick a version, tick Remember, save → the token is taken by a different id →
`saveMany` rejects the batch. That is the shape my regression test uses. I
verified it with a probe against the real parser before writing the test: the
fixture with that alias present still yields `underspecified:back squat n=8`.

### The conflict UX I built, and why this shape

Four decisions, in order of importance:

1. **The routine is saved first.** `await saveProgram(resolvedProgram)` now
   precedes the alias phase. An alias is a shortcut for *future* imports; the
   parsed routine is what the user came for. Losing a shortcut is recoverable
   (re-tick it next time), losing the import is not.
2. **Conflicts are found before the write, not caught after it.**
   `rememberedAliasConflicts(inputs, await aliasRepo.list())` returns the inputs
   whose normalized token is already taken by a different id. Those are left out
   of the batch and everything else is still written. `saveMany` is all-or-
   nothing, so checking first is the only way one taken name does not silently
   cost the user the other four they ticked. The spec supports the narrow
   reading: it says import save "rejects the overwrite", not "rejects the
   import".
3. **One bulk call.** `aliasRepo.saveMany(savable)` — one transaction, one
   identity event, instead of N racing single writes.
4. **A quiet, actionable, in-place message — not a modal, not a raw
   `Error.message`.** A single `--warn` line on the confirm step:

   > `"Back Squat" is already remembered as High Bar Back Squat. This import used your choice for itself only — remove or replace that mapping from the exercise catalog to remember a new one.`

   It names the alias **as the user's routine wrote it** (`occurrences[0].rawName`)
   and, when the target is resolvable, names what the token currently means. When
   the target is dangling it degrades to "as another exercise" rather than
   printing an internal id. The Save button is replaced by **`Open program →`**,
   so the user is not stranded on a step whose work is already saved. Changing
   any choice or Remember tick clears that state and offers Save again.

There is also a `catch` around the whole alias phase as a backstop for a token
claimed by another tab between the check and the write, or any other rejected
write. It returns `"The routine is saved, but your Remember choices could not be
stored."` — the routine survives a rejection even if the pre-check misses.

**Deliberately not built:** a link to the correction surface. Task 10 owns it;
the copy names the destination in words and leaves the seam.

### The tests that prove it closed

`ImportClient.remember.test.tsx` drives the **real** parser, resolution
grouping and catalogue; only the repos and the router are mocked.

- `keeps the import when a remembered name is already taken` — asserts
  `saveProgram` ran once, **all eight** occurrences carry `barbell-low-bar-squat`,
  `saveMany` was **not** called, the message contains `Back Squat` and `already
  remembered`, an `Open program →` button exists, and navigation did not happen.
- `keeps the import even if the alias write is rejected outright` — `saveMany`
  rejects; the routine is still saved and the fallback message shows.

**Mutation M16 restores the exact pre-Task-9 shape** — aliases before the
routine, no pre-check, no containment — and kills both:

```
● ImportClient … › keeps the import when a remembered name is already taken
● ImportClient … › keeps the import even if the alias write is rejected outright
Tests:       2 failed, 8 passed, 10 total
```

**An honest negative result.** Reverting the *ordering alone* (M2) left all 191
tests green, because the containment `catch` means a rejected batch cannot
escape regardless of order. So my tests prove the regression is closed; they do
**not** prove ordering is independently load-bearing. Ordering plus containment
each close it, and M15 (containment removed, program still first) proves the
routine survives even then — it fails only on the message, not on the save. I
kept program-first anyway because it is the property that stays true if someone
later removes the `catch`.

---

## 2. Local by default

`rememberedAliasInputs(groups, resolutions)` filters to `group.remember === true`
and nothing else, then routes the surviving occurrences through the existing
`dedupeAliasResolutions`, so the spec's conflict-dropping dedup is preserved
rather than reimplemented. An import that remembers nothing calls no alias API
at all — no write, no identity event.

`rememberableTarget(group, resolutions)` is the single rule behind both the
disabled Remember tick and the persistence filter. It returns `undefined` when
the occurrence choices disagree, when one is undecided, or when the answer is
"keep as custom" — the spec's "remembered aliases cannot be ambiguous", stated
once and read from two places.

**The brief's specific mutation, M1** (`remember` filter dropped → always
persist) is killed at both layers:

```
● rememberedAliasInputs › returns nothing for a fully resolved group nobody asked to remember
● ImportClient … › saves the choice into the program and remembers nothing
```

That first test carries a completion canary: it asserts the *same* group with
`remember: true` yields one input before asserting the unmarked case yields
none, so an empty result cannot be an unrelated bail-out. The UI test asserts
the **effect** — all eight stored exercises carry the chosen id — not a spinner.

---

## 3. Grouped UI

`ResolutionStep` is now driven by `ResolutionGroup[]`:

- one row per repeated name with `used N times` beside it;
- a `<select>` (`aria-label="Choose version for Back Squat"`) for an
  **underspecified** group, because its candidates are a reviewed closed list;
  an **unmatched** group keeps the fuzzy suggestion rows with their scores,
  since fuzzy similarity is suggestion-only;
- `Remember this interpretation`, unticked, disabled until one version is agreed;
- `Resolve occurrences separately` expands to **one selector per authoritative
  path**, path shown in mono;
- one selection fans out by calling `onChange(path, id)` for each occurrence, so
  `applyResolutions` keeps its name and ambiguity guards.

Structural changes worth a reviewer's eye:

- **Groups stay on screen once decided** (muted surface) instead of collapsing
  into a separate "Auto-resolved" disclosure. They have to: `Remember` only
  becomes available *after* a version is chosen, and the old layout removed the
  card at exactly that moment. This replaced the redundant per-item "Resolved"
  and "custom chips" blocks, which duplicated what the group row now shows.
- **"Auto-resolved" was renamed** — nothing is auto-resolved since Task 8
  removed fuzzy auto-selection, so the label was a lie.
- `Keep as custom` flips to `Map to catalog` for a group already kept custom,
  preserving the old chip's escape hatch.
- Density: list rows in existing `panel`/`tx-mono`/`text-[10px]` house style, no
  new card grid, no shadows, `--warn` used semantically for the notice and
  `--accent` for a resolved version.

The impeccable hook flagged `design-system-font-size` on `text-[10px]`,
`text-[11px]` and `fontSize: "0.7rem"`. Those are pre-existing values in this
same file and across the repo; I introduced no new step (I did change one
`0.72rem` I had written to the file's existing `0.7rem`). Left as-is
deliberately rather than silenced.

---

## 4. `occurrenceCount` counted the wrong thing (mid-task addition)

Reproduced the controller's measurement with a probe before writing anything:

```
weeks: 4, one base "Back Squat", no variants
→ warnings 1, occurrenceCount 1, stored Back Squats 4
```

**Decision: derive the stored count; do not rename the field.** The number the
user reads is a promise about their routine, and `used 1 time` followed by four
patched exercises is a broken promise. `occurrenceCount` keeps its honest
meaning — fan-out paths — and the UI stops reading it.

**How it is derived, and why that way.** `storedOccurrenceCounts(program, groups)`
runs the **real `applyResolutions`** once per group with a probe id and counts
what changed. It deliberately does not re-derive the addressing rules, because a
second implementation would drift from the first. This gets, for free and
correctly:

- week-clone expansion (`weeks: 4` → 4);
- the name guards (the eight-back-squat fixture stays 8 rather than 16, because
  each base slot is a Back Squat in only one of its two weeks);
- override replacement paths addressing exactly one exercise;
- variants nested inside an override replacement staying excluded — the
  controller's specific question. Confirmed: 8, with the structural warning
  still present;
- **0 for a structurally ambiguous duplicated day number**, where
  `applyResolutions` refuses to patch. Promising a count there would be a lie,
  and the UI shows no count line rather than a wrong one.

Cost: one program walk per group, memoised on `[review, groups]`, so once per
import.

I also corrected the `makeEightBackSquatReview` docblock. It claimed paths and
stored exercises "independently agree" at 8; that is true **by fixture
construction only** and is precisely what masked this bug. The docblock now says
so and points at the separate `weeks: 4` case.

Mutation evidence:

| Mutation | Killed |
|---|---|
| M17 count = `occurrenceCount` (the reported bug) | 3: `counts every week-clone…`, `agrees with what one grouped choice actually patches`, `counts zero for a structurally ambiguous day…` |
| M18 count ignores override replacement days | 3: `counts the worked example's eight…`, `does not resurrect an override-nested variant…`, `ResolutionStep › shows one choice for eight…` |
| M19 UI renders `occurrenceCount` again | 1: `ResolutionStep › shows the stored-exercise count, not the occurrence-path count` |

That last UI test is the one that matters at the render layer: it feeds a
`storedCounts` of 4 to a group with 8 occurrence paths and asserts the screen
says `used 4 times` and not `used 8 times`, so the component cannot be reading
the wrong number.

**Weakest of the count tests, disclosed:** `does not resurrect an override-nested
variant under week expansion` is killed by M18 but not by an independent
mutation, because the unsupported nested variant is dropped at parse time and I
could not reach it from my lane to make it countable. It asserts a true
invariant with less discriminating power than the others.

---

## 5. RED evidence

**`rememberableTarget` / `rememberedAliasInputs` / `rememberedAliasConflicts`:**

```
$ bun run test -- --runInBand src/lib/import/resolution.test.ts
  ● rememberableTarget › returns the single concrete id every occurrence agreed on
    TypeError: (0 , resolution_1.rememberableTarget) is not a function
  ● rememberedAliasInputs › returns nothing for a fully resolved group nobody asked to remember
    TypeError: (0 , resolution_1.rememberedAliasInputs) is not a function
  ● rememberedAliasConflicts › reports an occupied token pointing at a different exercise
    TypeError: (0 , resolution_1.rememberedAliasConflicts) is not a function
Tests:       13 failed, 51 passed, 64 total
```

**`storedOccurrenceCounts`:**

```
  ● storedOccurrenceCounts › counts every week-clone one base-day path expands into
    TypeError: (0 , resolution_1.storedOccurrenceCounts) is not a function
Tests:       5 failed, 64 passed, 69 total
```

**Grouped UI** — the old per-item rendering, caught red-handed:

```
$ bun run test -- --runInBand src/components/import/ResolutionStep.test.tsx
  ● ResolutionStep grouped choices › shows one choice for eight repeated occurrences
    Expected length: 1
    Received length: 16
    Received array:  [<p class="text-sm font-semibold">Back Squat</p>, <span class="flex-1">Back Squat</span>, … ×8 cards]
  ● … › fans one selection out to every authoritative occurrence path
    TestingLibraryElementError: Unable to find a label with the text of: Choose version for Back Squat
Tests:       5 failed, 5 total
```

**`ImportClient`:**

```
$ bun run test -- --runInBand src/components/import/ImportClient.remember.test.tsx
  TypeError: Cannot read properties of undefined (reading 'map')
      at ResolutionStep (src/components/import/ResolutionStep.tsx:166:17)
  ● … › saves the choice into the program and remembers nothing
    Unable to find a label with the text of: Choose version for Back Squat
Tests:       3 failed, 3 total
```

**Two tests were written after their behaviour, and I am flagging it rather
than dressing it up:** `keeps the import even if the alias write is rejected
outright` and `offers the save again once the user changes their mind`. Both
came out of my own self-review of the diff, and both passed on first run. They
are pinned by mutation instead — M15/M16 for the first, M20 for the second.

---

## 6. Full mutation table

Each applied alone, restored byte-for-byte afterwards, run against
`bun run test -- --runInBand src/lib/import src/components/import` (191-199
tests as the suite grew).

| # | Mutation | Failures | Killed |
|---|---|---|---|
| M1 | `rememberedAliasInputs` drops the `remember` filter (**always persist**) | 2 | pure local-default test + the UI local-default test |
| M2 | aliases saved **before** the routine (old order) | **0** | nothing — see the honest negative above |
| M3 | conflict pre-check removed | 1 | regression test |
| M4 | ambiguity gate `chosen.size !== 1` → `< 1` | 3 | 2 × `rememberableTarget`, ResolutionStep ambiguity |
| M5 | `CUSTOM_ID`/empty gate removed | 2 | `rememberableTarget` custom, `rememberedAliasInputs` custom |
| M6 | Remember pre-ticked for the user | 3 | ResolutionStep tick + both Remember-dependent ImportClient tests |
| M7 | group choice stops fanning out (first path only) | 4 | ResolutionStep fan-out + all three ImportClient tests |
| M8 | occurrence selector writes to every path | 1 | separate-occurrence expansion |
| M9 | conflicts compare raw display text | 1 | `compares normalized tokens, not display text` |
| M10 | `dedupeAliasResolutions` conflict-drop removed | 3 | cross-kind token conflict + 2 pre-existing dedup tests |
| M11 | occurrence count hardcoded to 1 | 1 | `shows one choice for eight…` |
| M12 | Remember enabled regardless of ambiguity | 1 | ResolutionStep ambiguity |
| M13 | conflict notice never surfaced | 1 | regression test |
| M14 | `saveMany` called with the conflicting batch | 1 | regression test |
| M15 | alias rejection no longer contained | 1 | `rejected outright` |
| M16 | **exact pre-Task-9 shape** (aliases first, no pre-check, no containment) | 2 | both regression tests |
| M17 | stored count = warning paths | 3 | 3 × `storedOccurrenceCounts` |
| M18 | count ignores override replacement days | 3 | 2 × count + 1 UI |
| M19 | UI renders `occurrenceCount` again | 1 | `shows the stored-exercise count…` |
| M20 | saved state never invalidated | 1 | `offers the save again…` |

`git status` confirms all three mutated files end clean.

### One mutation that did NOT kill a test it looked like it should

M4 (ambiguity gate) left `rememberedAliasInputs › drops a marked group whose
occurrences were resolved separately to different ids` **green**. With the gate
weakened, that group survives into `dedupeAliasResolutions`, which drops it as a
token conflict anyway — a **stronger later guard** masking the one under test.
The test still asserts a true outcome, but the rule it looks like it pins is
pinned by the four `rememberableTarget` tests instead. Recording it because it
is exactly the failure shape this plan keeps producing, and a reviewer reading
that test alone would over-trust it.

---

## 7. Flake check

RTL assertions run clean under the repo's known flake conditions:

```
$ bun run test -- --maxWorkers=24 src/components/import src/lib/import   (×3)
Tests:       198 passed, 198 total   (×3)

$ npx jest -c jest.tight.config.js --maxWorkers=24 src/components/import   # asyncUtilTimeout: 1
Tests:       11 passed, 11 total   (×2)
```

`asyncUtilTimeout: 1` passing means every `waitFor`/`findBy` in my tests
resolves on the first tick — no timeout is doing hidden work. No timeout was
raised anywhere.

---

## 8. Scope addition: the e2e suite was already broken, and I fixed it

**This is outside the plan's staged path list and I want it looked at.**

The curation commit (`8177616`, which populated `disambiguations.json`) made
plain `Squat` an underspecified name. `e2e/helpers.ts`'s `IMPORT_PROGRAM_JSON`
uses exactly that name, so the resolve step now demands a version and
`Review import →` stays disabled. Measured on the branch **before** my changes:

```
$ bun run test:e2e -- program-import.spec.ts
  1 failed
    › valid JSON parses and shows confirm step
  4 did not run
  3 passed
```

`seedDemoIfNeeded` in `e2e/helpers.ts` has the same break and is used by **nine**
spec files. The plan's Task 9 file list names `e2e/program-import.spec.ts` but
not `helpers.ts`; I fixed both, because leaving a shared helper broken would
hand Task 15 a red e2e suite for a reason that has nothing to do with Task 15.
The change is test-only, confined to a directory no reviewer is reading, and is
one new exported helper:

```ts
export async function chooseImportVersions(page: Page)  // answers each group-level
                                                        // "Choose version for X" with the first version
```

Result:

```
$ bun run test:e2e
  92 passed (1.8m)
```

One earlier full e2e run showed 2 failures (`modify-ai › closes modal with
Escape key`, `workout-logging › logs a set value in a cell`); both passed in
isolation (23/23) and in the confirming full run — shared-dev-server flakes, not
mine.

The page snapshot Playwright captured mid-debug is also the only visual
confirmation in this report that the new step renders as intended:

```yaml
- paragraph: Squat
- button "Keep as custom"
- combobox "Choose version for Squat":
  - option "Choose version…" [selected]
  - option "Barbell Squat"
  - option "Front Rack Barbell Squat"
  - option "Bodyweight Squat"
  - option "Dumbbell Squat"
- checkbox "Remember this interpretation" [disabled]
```

---

## 9. Gates

```
$ bun run test -- --runInBand
Test Suites: 102 passed, 102 total
Tests:       1365 passed, 1365 total
Snapshots:   0 total
Time:        19.193 s

$ bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json
exit=0

$ bun run lint
$ eslint .
exit=0

$ bun run build
dist/index.html                     1.40 kB │ gzip:   0.70 kB
dist/assets/index-DRZU_Zh2.css     27.67 kB │ gzip:   6.97 kB
dist/assets/index-yyfNe6hG.js   1,548.69 kB │ gzip: 273.82 kB
(!) Some chunks are larger than 500 kB after minification.   [known-acceptable]
✓ built in 1.48s

$ git diff --check
exit=0

$ bun run test:e2e
92 passed (1.8m)
```

Post-commit re-run: **102 suites / 1,367 tests / 0 failures** (two more tests
landed from another agent between the gate run and the amend). My slice alone is
deterministic: `src/lib/import` + `src/components/import` → 199 passed, three
runs in a row.

**Foreign failures attributed.** One intermediate full-suite run showed **26
failures, all in `src/lib/storage/appDb.test.ts`**, while another agent was
mid-write on `src/lib/storage/aliasRepo.ts` and `migrations/v10Identity` (the
harness told me that file changed under me). The next run was green and stayed
green. A later run showed 2 failures that did not reproduce on the next three
runs and that I could not attribute to a file before they vanished; my slice was
green in the same runs. Same phenomenon Task 8 reported. I did not touch `src/lib/storage/`,
`src/lib/backup/`, `src/lib/catalog/`, `scripts/catalog-normalization/`,
`src/lib/workout/`, or `src/main.tsx`.

---

## 10. Self-review findings I fixed before committing

- **A stale "already saved" state.** After a conflict the confirm step showed
  `Open program →` permanently — a user who went Back, untick­ed Remember and
  returned could not save again. Any resolution or Remember change now clears
  it. Found by reading my own diff; pinned by a test and M20.
- `rememberAliases` took `ReturnType<typeof rememberedAliasInputs>`. Replaced
  with the exported `AliasSaveInput[]`.
- My first grouped-count assertion was `getAllByText("Back Squat")` → 1, which
  failed at 2 because the generic candidate `<option>` is *also* named "Back
  Squat". Narrowed with `{ selector: "p" }` rather than loosening the count.
- One `fontSize: "0.72rem"` I had invented, changed to the file's existing
  `0.7rem`.

## 11. Deliberately deferred, with reasoning

- **`src/lib/storage/aliasRepo.ts` untouched**, though the plan's Task 9 file
  list names it. The concurrency instruction in my brief forbids editing
  `src/lib/storage/`, another agent was actively editing that exact file
  mid-task, and `saveMany` already had everything I needed from Task 6. No
  change was required.
- **`src/components/import/ImportClient.test.tsx` untouched.** Its
  `jest.mock("@/lib/import/resolution")` factory does not export
  `groupResolutionOccurrences`, `storedOccurrenceCounts` or
  `rememberedAliasInputs`. It still passes, because its single test never leaves
  the paste step, but it is a latent trap: the moment anyone adds a test there
  that clicks Validate, it will throw. I left it alone rather than edit an
  existing test file, per the standards. **A reviewer may want to overrule me
  and have the mock completed.**
- **`rememberedAliasConflicts` compares `normalizeExerciseName(row.normalizedAlias)`,
  not the newer shared `aliasLookupToken`.** That helper lives in
  `src/lib/storage/migrations/v10Identity.ts`, which another agent was editing
  and which my lane should not import from. Normalizing the stored token matches
  what the unique index enforces for every row production writes.
- **No link to the correction surface.** Task 10 owns it; copy names it in words.
- **Warmup/cooldown underspecified items still auto-become custom**, which Task
  8 flagged. `buildInitialResolutions` marks them custom before kind is
  consulted; unchanged here, as it was unchanged there.

---

## 12. What a reviewer should scrutinise most

1. **The conflict UX decision to save the non-conflicting subset** rather than
   abandoning the whole remembered batch. It reads "import save rejects the
   overwrite" (spec ~445) narrowly. If the intended reading is "reject the whole
   batch", the fix is one line — drop the `savable` filter — but the user then
   loses four good ticks because of one taken name.
2. **The M2 negative result.** Ordering is not independently proven by test.
   Decide whether you want a test that pins program-first specifically, given
   the containment `catch` makes it unobservable.
3. **`storedOccurrenceCounts` deriving the count by running `applyResolutions`
   with a probe id.** It is correct by construction and cheap here, but it is a
   patch-and-count, not a pure calculation. If a future `applyResolutions` gains
   a side effect, this inherits it.
4. **`ResolutionStep` groups now stay on screen after being decided**, which
   removed the separate "Resolved" disclosure and the custom chip strip. That is
   a visible change to an existing flow beyond the letter of the task, and it
   exists because Remember is unreachable otherwise.
5. **The `e2e/helpers.ts` scope addition** (section 8).
6. **The masked mutation in section 6** — one `rememberedAliasInputs` test is
   protected by a later guard and looks stronger than it is.

---

**Status: DONE.**

Commits, in order:

- `9c6aff1` feat: keep import resolutions local unless remembered
- `344a7f6` feat: resolve repeated exercise names during import
- `0785354` test: answer the new import version choice in e2e
- docs: report task 9 local-by-default import choices (this commit; SHA in the handoff status line)

Gates: 102 suites / 1,365 tests / 0 failures; typecheck, lint, build, `git diff
--check` all clean; e2e 92 passed.

---

# Fix round 1

Commits: `0eca59e`, `3af8ee7`, `1b3cd8e`, `1553e15`, `b79ebf1`, plus this report
amend. All ten items taken, nothing declined. **15 new unit tests** (my slice:
199 → 214) plus one new e2e test and two existing tests given teeth.

## Important 1 — the stale `resolution` mock (ruled, and now landed)

Dropped the mock entirely rather than completing it, as the reviewer preferred.
The real module is pure and cheap, so there was nothing to fake.

Two things fell out of doing it properly. First, **the trap was real**, and the
predicted error is exactly the predicted error:

```
M-I1a: put the stale partial mock back
  ● ImportClient confirm step pluralization › does not use (s) suffixes in confirm step
    TypeError: (0 , resolution_1.groupResolutionOccurrences) is not a function
Tests:       1 failed, 1 total
```

Second, **that test could never have failed.** Its subject is confirm-step
copy, and it asserted on `document.body.textContent` while still on the *paste*
step — the strings under test were not rendered at all. It now pastes, clicks
Validate, and asserts `1 day · 1 exercise` as a completion canary before
checking for `(s)`. Teeth confirmed:

```
M-I1b: regress the confirm copy to "day(s) · exercise(s)"
  ● ImportClient confirm step pluralization › does not use (s) suffixes in confirm step
Tests:       1 failed, 1 total
```

Making it reach the step needed `overrides: []` on the mocked program (the real
`storedExerciseCount` walks overrides). No assertion was weakened; one was added.

## Important 2 — no alias for an import whose program save failed

The reviewer was right that this was the invariant ordering protects and that
nothing covered. New test: `mockSaveProgram.mockRejectedValue(new Error("QuotaExceededError"))`
with Remember ticked, asserting `saveMany` was never called, `saveError` shows,
and no navigation happened.

**Re-confirmed on the current tree, as asked.** The ordering swap now kills
exactly one test — this one:

```
N1: aliases written before the routine
   ● ImportClient: what a failed or repeated save must not do › writes no alias when the routine itself could not be saved
Tests:       1 failed, 213 passed, 214 total
```

Compare with round 1, where the same mutant left all 191 tests green. Ordering
is load-bearing now, and it is pinned as the narrow invariant it actually is
rather than as the headline rule.

## Important 3 — a structurally ambiguous group was silently a no-op

Confirmed the whole chain: `storedOccurrenceCounts` returns `0`, the row showed
nothing (the count only rendered above 1), the banner said handled, and the
confirm step counted warning paths and claimed the exercise was mapped.

Two fixes, both quiet and factual:

- the row now says `won't apply — the routine's structure is ambiguous here` in
  `--warn`. Worded without naming the cause on purpose: duplicate day numbers
  are the realistic path to `0`, but `patchExercise` can also decline on a name
  guard, and stating a reason I cannot prove would be worse than stating none.
- the confirm tally counts stored exercises, so a group that patches nothing
  contributes nothing. That exclusion is not special-cased — it falls out of
  counting the patch.

```
N5: remove the zero-count note
   ● ResolutionStep grouped choices › says so when a decision would not reach any exercise
Tests:       1 failed, 213 passed, 214 total
```

**One thing I did not do, deliberately:** I did not block `Review import →` for
such a group. Spec ~445 says the import "cannot finalize those resolutions",
and it does not — nothing is patched, and the warnings survive in the saved
program. Blocking the button would block the whole import, and a user cannot
fix duplicate day numbers from this screen, so it would trade a silent no-op
for a dead end. Flagging it in case the controller reads the spec as requiring
the harder stop.

## Minors

### m5 (prioritised) — a second program document

Reproduced first: two saves, two ids.

```
  Expected: "program-45ca5512-5684-4d94-a463-ab962b94b255"
  Received: "program-a4d544e4-62e9-4fd9-9119-d372b0583c58"
```

Fixed by keying the saved document to the pasted text. This needed the state
split apart, which is the substantive part of the change: `savedProgramId` +
`savedJson` are now the **document's identity** and survive edits, while a new
`settled` flag is the **UI state** that swaps Save for `Open program →`. Round
1's `clearSavedState()` cleared the id, which is precisely why re-validating
minted a new one.

```
N3: document id not reused
   ● ImportClient … › re-validating the same paste updates one program instead of creating a second
Tests:       1 failed, 213 passed, 214 total
```

### m7 — nothing asserted the version step exists

This one got the most attention, because the original defect was exactly this
shape: a helper that returns silently after a timeout inside an `if (isVisible)`
wrapper. New e2e test asserts the choice appears, that `Review import →` is
**disabled** until it is answered, and that Remember is disabled before and
enabled-but-unticked after. The permissive helper stays for the other nine
specs, which only need a program.

Two mutations, because the second is the one that matters:

```
E1: the version step stops rendering (isVersionChoice = false)
  ✘ 4 › an underspecified name demands a version before the import may proceed
    Error: expect(locator).toBeVisible() failed — element(s) not found
    > 63 |     await expect(select).toBeVisible();
  1 failed, 3 passed
```

```
E2: the choice is silently answered for the user (the old 0.65 auto-select, re-added)
  ✘  4 › an underspecified name demands a version before the import may proceed
    Error: expect(locator).toBeDisabled() failed
    > 64 |     await expect(... /review import/i ...).toBeDisabled();
  ✓ 10-15 › e2e/today.spec.ts (all six, through the permissive helper)
  1 failed, 9 passed
```

E2 is the proof the coordinator asked for. Under a mutant where the
underspecified flow silently stops being **required**, every `today.spec.ts`
test that goes through `chooseImportVersions` stays green, and only the new
assertion fails. That is the defect class that slipped through before.

### m1 — `dedupeAliasResolutions` relied on a caller-side filter

Skip moved inside the loop, so the shared function is safe for the contract it
advertises rather than for the one caller that happened to pre-filter.

```
N7: skip removed
   ● … › skips an occurrence kept as custom instead of remembering it
   ● … › skips an undecided occurrence instead of remembering an empty target
   ● … › still remembers the concrete answers alongside a skipped one
Tests:       3 failed, 211 passed, 214 total
```

### m2 — the confirm summary counted paths

Both tallies now go through `storedExerciseCount`, so "used 4 times" and "4
exercises mapped to catalog" cannot disagree about the same routine. Pinned with
a 4-week/one-path routine, which is the only shape where the two numbers differ.

```
N4: tally counts occurrence paths again
   ● ImportClient … › counts stored exercises in the confirm summary, not occurrence paths
Tests:       1 failed, 213 passed, 214 total
```

### m3 — a stale Remember tick

Worth stating precisely, because the hazard is narrower than it looks: a stale
tick could never have **persisted** an alias, since `rememberedAliasInputs`
gates on `rememberableTarget` independently. The real hazard is re-arming — tick
for high-bar, split the occurrences (tick greys out), settle them all on low-bar,
and the tick returns meaning something the user never confirmed. A `useEffect`
now drops a tick once its group stops having one answer, returning the same
object when nothing changed so it cannot loop.

```
N2: prune removed
   ● ImportClient … › does not remember a stale tick after the choice becomes ambiguous and settles elsewhere
Tests:       1 failed, 213 passed, 214 total
```

### m4 — the Remember label

Now `Remember "Back Squat" as Low Bar Back Squat`, or `Remember "Back Squat"`
before a version is chosen. Kept fully **visible** rather than hidden in an
`aria-label`, so the accessible name contains the visible label (WCAG 2.5.3) and
sighted users get the same disambiguation.

```
N6: label drops the name
   10 failed, 204 passed, 214 total
```

Ten is a locator dependency, not ten independent judgements — the label is how
every test finds the checkbox. The one meaningful killer is
`names the exercise and the chosen version in the Remember label`. Reporting the
raw count with that caveat rather than the flattering number.

### m6 — one token rule (with a partial push-back)

**I could not do what was literally asked, and I think the substance is better
served anyway.** `saveMany` is in `src/lib/storage/aliasRepo.ts`, outside my
lane, and a second agent was editing that exact file this round (it now imports
`aliasLookupToken` from `migrations/v10Identity.ts`, which it did not at round
1). So a helper shared with `saveMany` was not mine to create.

More to the point, three different rules already exist and they are not
interchangeable:

- `aliasRepo.ts:67` builds its conflict map from `alias.normalizedAlias`
  **verbatim** — the value the unique index actually keys on;
- `aliasRepo.ts:30` normalizes the **input** text;
- `identity.ts:285` **re-normalizes** the stored token before matching.

Unifying on `saveMany`'s rule would have made my pre-check *weaker*: a stale
stored token is invisible to the index but load-bearing for the resolver, so
writing past it leaves two rows matching one name and `findUnique` then resolves
neither — the name stops working entirely. So `rememberedAliasConflicts` now
compares against **both** tokens through one local helper,
`occupiedAliasTokens`, documented as a deliberate superset with that reasoning.
Withholding one Remember tick is recoverable; silently shadowing a mapping the
user already made is not.

```
N8: verbatim-token comparison only
   ● rememberedAliasConflicts › compares normalized tokens, not display text
   ● rememberedAliasConflicts token rules › treats a stored token that only matches after normalizing as occupied
Tests:       2 failed, 212 passed, 214 total
```

## Optional — taken

Replaced the sentinel-plus-second-traversal with
`applyResolutionsWithStats(program, resolutions) -> { program, patchedByPath }`.
`applyResolutions` now delegates to it and keeps its signature, so no caller
changed. The count comes from the patch reporting what it did, which removes the
fragility the reviewer identified: a second walk that could undercount if the
patch ever touched a container the walk missed.

A placeholder id is still needed (the patch only records a non-empty,
non-`CUSTOM_ID` target), but nothing is keyed on its value and the patched
program is discarded — only counts leave the function.

```
N9: count once per path instead of once per patched exercise
   ● storedOccurrenceCounts › counts every week-clone one base-day path expands into
   ● storedOccurrenceCounts › agrees with what one grouped choice actually patches
   ● applyResolutionsWithStats › reports how many stored exercises each path patched
   ● ImportClient … › counts stored exercises in the confirm summary, not occurrence paths
Tests:       4 failed, 210 passed, 214 total
```

## Gates — fix round

```
$ bun run test -- --runInBand src/lib/import src/components/import
Test Suites: 8 passed, 8 total
Tests:       214 passed, 214 total

$ bun run test -- --runInBand
Test Suites: 2 failed, 102 passed, 104 total
Tests:       2 failed, 1414 passed, 1416 total     [both foreign — attributed below]

$ bun run typecheck
exit=0

$ bun run lint
exit=0

$ bun run build
dist/assets/index-DRZU_Zh2.css     27.67 kB │ gzip:   6.97 kB
dist/assets/index-z0Ce1eFN.js   1,557.79 kB │ gzip: 276.73 kB
(!) Some chunks are larger than 500 kB after minification.   [known-acceptable]
✓ built in 2.23s

$ git diff --check
exit=0

$ bun run test:e2e
93 passed (2.4m)
```

## Foreign failures, attributed by filename — checked, not assumed

Two other agents are resuming with uncommitted work. I checked each failure
rather than waving at it:

| File | Verdict |
|---|---|
| `src/components/workout/HistoryClient.test.tsx` | Foreign. **Untracked** file belonging to the workout agent. Passes alone (8/8). |
| `src/lib/storage/appDb.test.ts` | Foreign trigger. The file is clean and committed, and passes alone (99/99). |
| `src/components/catalog/ExerciseCorrectionSheet.test.tsx` | Foreign. **Modified**, uncommitted, catalog agent. |

The failing *set* rotates with which foreign suites share a run, which is the
signature of in-flight code sharing global fake-IndexedDB and identity-event
state:

```
appDb.test.ts + MY LANE ONLY                        → 313 passed, 0 failed
appDb.test.ts + src/components/workout              → 1 failed (HistoryClient)
appDb.test.ts + src/components/catalog + app        → 154 passed, 0 failed
appDb.test.ts + workout + catalog + app             → 1 failed (ExerciseCorrectionSheet)
src/lib/storage + src/lib/backup                    → 257 passed, 0 failed
```

The first line is the one that matters: **my suites cannot be the trigger.**
Neither failing file imports anything from `src/lib/import/` or
`src/components/import/` (verified by grep). I changed nothing in their lanes.

Also worth recording: an earlier run this round showed a typecheck error at
`src/components/workout/WorkoutDayClient.tsx:1030`
(`ExerciseSessionRow[]` not assignable to `ExerciseHistoryRow[]`) and three
history-drawer e2e failures. That agent has since fixed it — typecheck and e2e
are both clean now — but it is why the intermediate gate output in this round
was red.

## What a reviewer should scrutinise most (fix round)

1. **The Important 3 judgement call**: a zero-count group is flagged and
   excluded from the tally, but `Review import →` is not blocked. If the spec's
   "cannot finalize" means a hard stop, that is a one-line change with a real
   cost (the user cannot fix duplicate day numbers from this screen).
2. **The m6 push-back**: `rememberedAliasConflicts` is deliberately a *superset*
   of `aliasRepo.saveMany`'s rule rather than the same helper. If you disagree,
   the argument to beat is `identity.ts:285` versus `aliasRepo.ts:67`.
3. **The m5 state split**: `savedProgramId`/`savedJson` now survive edits while
   `settled` does not. Reusing a program id is the kind of thing worth a second
   pair of eyes, since logs and sessions key off it.
4. **`applyResolutionsWithStats`**: `applyResolutions` is heavily used and now
   delegates. Its ~40 existing tests all still pass, and `is what
   applyResolutions returns` pins the equivalence, but the refactor touched the
   patch's inner loop.
5. **N6's blast radius (10 tests)** is a locator dependency, not evidence. The
   real killer is one test.

**Status: DONE.**
