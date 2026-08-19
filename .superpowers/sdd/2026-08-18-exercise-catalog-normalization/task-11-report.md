# Task 11 — Nest versions in the library and exercise pickers

## Delivered boundary

`groupCatalogItems(items, resolve) -> CatalogGroup[]` and
`searchCatalogGroups(groups, query) -> CatalogGroup[]` in
`src/lib/catalog/groupCatalog.ts`, plus a third pure helper the two surfaces
both needed, `filterGroupVersions(groups, keep)`. One shared nested list,
`src/components/catalog/NestedExerciseList.tsx`, drives the add and replace
sheets. `LibraryClient.tsx` is extended, not forked: `Needs review` and Task
10's correction surface are untouched and every one of its fourteen tests still
passes unchanged.

Commits, in order:

| SHA | What |
|---|---|
| `8fd0d6c` | `groupCatalog.ts` + fixtures + tests (pure grouping/search) |
| `bcf47b6` | Library nests versions under their movement |
| `24f7cc8` | Add and replace pickers nest versions |
| `f6c2436` | Fix: a stray NUL byte in the rank key (self-review finding) |
| `09c7733` | Exercise editor links to the shared correction sheet |
| `6649437` | Refactor: one shared version filter; un-export three names |
| `6a3c103` | Task 14's exact-lookup comment moved onto its own line |
| `fa0ab11` | Fix a real `--maxWorkers=24` flake I introduced |
| `fdb8db9` | e2e spec updated for the family row (**unexecuted**) |

## The invariant, and how it is proved

**A family row is navigation only.** It has no selection control, no
`aria-pressed`, and its click handler only opens and closes. In the pickers the
only thing a click can select is a concrete version; in the Library the only
thing that opens a detail panel — and therefore the only thing with a
`Change movement` action — is a concrete version.

The mandated mutation, run three ways because the invariant lives in three
places:

- **P1** — give the picker family row `onClick={() => onSelectVersion(group.versions[0])}` and
  `aria-pressed`: **3 killed** of 11 (`cannot select a family row` in both
  sheets, plus `nests concrete versions…`).
- **L1b** — give the Library family row its own `Change movement` button:
  **1 killed** of 19 (`offers no correction on the family row`).
- **L1** — render a family as an ordinary selectable `ExerciseRow`:
  **3 killed** of 19.

Both picker invariant tests carry a canary: after clicking the family the
footer is still unarmed **and** the family collapsed (so the click was
navigation, not a no-op), and then a concrete version under that same family
arms the footer on the next click — so a sheet that had simply stopped
responding could not pass.

## Deviations from the plan's illustrative test code, and why

1. **`barbell-back-squat` is not a squat version.** The plan's sketch expects
   `versions: [barbell-back-squat, barbell-high-bar-squat, barbell-low-bar-squat]`.
   The shipped entry carries `movementId: null` (the known defect carried to
   final review), so grouping it under Squat would mean inventing a family
   membership the catalogue does not assert. The fixture uses the three real
   squat-family entries plus a kettlebell one, and there is a dedicated test —
   `keeps the unassigned barbell-back-squat entry out of the squat family` —
   that pins the defect's *current* behaviour rather than papering over it.
2. **Search keeps a family's siblings.** The plan's search test only requires
   `versions.some(v => v.id === "barbell-high-bar-squat")`, which both readings
   satisfy. I kept every version and named the matches in `matchedVersionIds`,
   because the spec says "reveals **and highlights**" — a filtered list makes
   "highlights" meaningless, and high-bar vs low-bar is precisely the choice the
   user is making. Flagged below as the judgement call to second-guess.

## TDD evidence — real RED, real error text

### Step 1-2, the pure module

First RED was only `Cannot find module './groupCatalog'`, which proves nothing,
so I wrote a deliberately flat stub (today's behaviour: one standalone group per
item, name-only search) and re-ran. **10 failed / 5 passed**:

```
● groupCatalogItems › nests concrete squat versions under one movement family
    expect(received).toMatchObject(expected)
    -   "id": "movement:squat",
    +   "id": "exercise:squat--kettlebell",
    -   "standalone": false,
    +   "standalone": true,

● groupCatalogItems › orders versions by canonical modifier order, not by name
    no group movement:squat in [exercise:squat--kettlebell, exercise:ab-wheel-rollout,
    exercise:barbell-low-bar-squat, exercise:barbell-bench-press, exercise:user-zercher,
    exercise:barbell-high-bar-squat, exercise:barbell-back-squat, exercise:barbell-squat]

● groupCatalogItems › orders families by movement sort order …
    - "movement:squat",       + "exercise:squat--kettlebell",
    - "movement:bench-press", + "exercise:barbell-low-bar-squat",

● searchCatalogGroups › reveals and highlights the matching version for a modifier query
    Expected: "movement:squat"
    Received: "exercise:barbell-high-bar-squat"

● searchCatalogGroups › matches a version alias and a primary muscle, not only the display name
    TypeError: Cannot read properties of undefined (reading 'matchedVersionIds')
```

### Library

```
● shows one Squat family row with its concrete versions beneath it
    TestingLibraryElementError: Unable to find an accessible element with the role
    "button" and name "Squat movement, 1 version"
● lists the user's own exercises alongside the bundled catalogue
    Unable to find role="button" and name `/My squat/`
● keeps an unassigned entry out of the family it is named after
    Unable to find an accessible element with the role "button" and name `/^Barbell Back Squat/`
```

### Pickers — 9 failed / 2 passed

```
● ExercisePickerSheet › nests concrete versions under one movement family row
    Unable to find an accessible element with the role "button" and name
    `/^Squat movement, \d+ versions$/`
● ExercisePickerSheet › says how many matches it is not showing …
    Unable to find an element with the text: /more matches/
● ExerciseReplaceSheet › cannot select a family row — the confirm button stays unarmed
    Unable to find an accessible element with the role "button" and name
    `/^Squat movement, \d+ versions$/`
```

The two that were green from the start (`adds the concrete version the user
picked`, `replaces with the concrete version`) are regression guards on
behaviour the flat list already had; they earn their place by mutation (P7, P9)
rather than by RED, and I say so rather than counting them as new coverage.

### Editor

```
● ExerciseEditSheet — identity correction › opens the shared correction sheet …
    Unable to find an accessible element with the role "button" and name /change movement/i
```

## Mutation evidence — every count beside its exact mutation

Mutated with **no worktree footprint**: an out-of-tree Jest config whose
`moduleNameMapper` swaps in a mutated copy, with the mutant entry listed
**before** `^@/(.*)$`. Nothing tracked was ever edited, so there was nothing to
restore. `moduleDirectories` had to be widened to the worktree's `node_modules`
or the out-of-tree mutant could not resolve `react/jsx-runtime` — the exact
"mutant fails to load and reports a clean pass" trap; every table below states
the **total**, and every total matches the harness baseline.

### `groupCatalog.ts` — harness baseline **20 passed / 20 total**

| # | Mutation | Killed |
|---|---|---|
| M1b | family group built with `standalone: true` | 4 |
| M2 | `key = \`exercise:${item.id}\`` instead of `identity.groupKey` (never nest) | 10 |
| M3 | `byOrder = 0` (families no longer sorted by movement sort order) | 2 |
| M4 | drop `compareByModifiers` from `compareVersions` (name sort only) | 3 |
| M5 | `left.standalone ? -1 : 1` (standalones before families) | 4 |
| M6 | search filters `versions` down to the matches | 2 |
| M7 | search returns `matchedVersionIds: []` | 2 |
| M8 | drop the version-match clause from the include test | 2 |
| M9 | `versionMatches` returns false for aliases and muscles | 1 |
| M10 | blank query returns `[]` | 1 |
| M11 | reverse the modifier-count tie-break (longer prefix first) | 3 |
| M12 | `unresolved` resolved as `catalog-reference` | 1 |
| M13 | `user` resolved as `import-name` | 1 |
| M14 | `groupNameMatches = false` | 1 |
| M16 | `bundled` resolved as `import-name` | 7 |
| M17 | family name `identity.movementId` instead of `movementName ?? movementId` | 1 |
| M18 | skip the version sort entirely | 3 |
| M19 | drop the empty-group skip in `filterGroupVersions` | 1 |
| M20 | `filterGroupVersions` keeps `matchedVersionIds` unfiltered | 1 |
| M21 | `filterGroupVersions` keeps every version | 2 |

### `LibraryClient.tsx` — harness baseline **19 passed / 19 total**

| # | Mutation | Killed |
|---|---|---|
| L1 | family rendered as a selectable `ExerciseRow` | 3 |
| L1b | family row grows its own `Change movement` button | 1 |
| L2 | family versions rendered whether open or not | 1 |
| L3 | family never auto-opens (`useState(false)`) | 2 |
| L4 | `highlighted={false}` on every version | 1 |
| L5 | user exercises dropped from `selectable` | 1 |
| L6 | every group forced `standalone: true` | 3 |
| L7 | `ExerciseRow` starts open | 4 |
| X1 | cross-module: `groupCatalog` files every unassigned entry under Squat | 7 |

X1 is there because `keeps an unassigned entry out of the family it is named
after` is a grouping claim, and no *component* mutation can falsify it. Rather
than call it covered by M2/M16 in another suite, I ran the grouping mutation
against the Library suite and measured it: **7 killed**, including that test.

### `NestedExerciseList.tsx` — harness baseline **11 passed / 11 total** (both picker suites)

| # | Mutation | Killed |
|---|---|---|
| P1 | family row selects its first version and takes `aria-pressed` | 3 |
| P3 | every group rendered as standalone (no family rows at all) | 6 |
| P4 | `autoOpen = false` | 6 |
| P5 | drop the 60-group cap | 4 |
| P6 | user exercises dropped from the selectable set | 2 |
| P7 | a version row selects `group.versions[0]` instead of itself | 2 |
| P8 | muscle filter ignored | 1 |
| P9 | `catalogItemForVersion` always returns the synthesised stub | 2 |

### `ExerciseEditSheet.tsx` — harness baseline **7 passed / 7 total**

| # | Mutation | Killed |
|---|---|---|
| E1 | correction panel starts open | 7 |
| E2 | name-only target keyed on `exercise.id` instead of `exercise.name` | 1 |
| E3 | target is always `normalized-name` | 1 |
| E4 | `isUserExercise = true` | 1 |
| E5 | the link renders nothing | 2 |

## Three tests that verified nothing, caught by mutation and fixed

1. **M13 survived** — resolving a user exercise by name instead of by id was
   indistinguishable, because the fixture's `Zercher hold squat` matches no
   catalogue entry, so both routes produced the identical group key. That is the
   "fixture cannot distinguish the rule from its absence" shape. Fixed with a
   test whose user exercise is named `High Bar Back Squat`, exactly like a
   bundled version: by id it stays the user's own entry, by name it would be
   silently merged into the Squat family. M13 now kills 1.
2. **M14 survived** — the family-name half of search was never the sole reason
   a group was included, because in the original fixture every version of a
   family contained the family's word. Added `cable-pulldown` (real entry, real
   family `Pull-up and Pulldown`, and neither its name nor its alias nor its
   muscle contains "pull-up"), plus a test that queries the family name and gets
   exactly that family with `matchedVersionIds: []`. M14 now kills 1.
3. **P9 survived** — both picker tests asserted only `objectContaining({id, name})`,
   which a stub with empty `muscles`/`equipment` satisfies. That matters: the
   routine builder copies `muscles.primary` and `equipment` straight off the
   item onto the stored exercise, so the mutation would have silently stripped
   metadata from every added exercise. Both assertions now pin the real
   catalogue values. P9 now kills 2.

## One mutation I could not kill, published rather than claimed

**M15** — building a standalone group's `name` from `identity.displayLabel`
instead of `item.name` — survives, and it is **unfalsifiable by construction**,
not a coverage gap: the resolver derives `displayLabel` from the same catalogue
entry or the same name for all three `SelectableExercise` sources, so the two
expressions cannot disagree for any input this function can be given. The code
keeps `item.name` because it is the cheaper of two identical answers, and the
reason is written in the comment at the call site so nobody deletes it later
citing a green mutation.

Separately, the `!group.standalone` guard on the family-name check **was** dead
by construction (a standalone group's name is its single version's name), so I
deleted it rather than keeping an unkillable branch, and left the measurement in
the comment.

## Existing tests: nothing modified, nothing folded in

No existing assertion was changed to make new code pass. The three flat-list
surfaces had no tests of their own before this task, and all fourteen existing
`LibraryClient` tests pass byte-for-byte unchanged — including
`opens the shared correction sheet from catalogue detail`, which still finds
`Hatfield Squat` as a top-level row because it carries `movementId: null` and
therefore stays standalone.

Two things I *did* change and am flagging loudly rather than hiding:

- `e2e/routine-builder.spec.ts` tests 6 and 7 were rewritten (`fdb8db9`). They
  clicked "the first button matching /squat/i", which is now the Squat family
  row — navigation, so the old flow would click it and then find no
  `Add 1 exercise` footer. Rewritten to pick a concrete version, and a new case
  added that pins the family click leaving the footer disabled. **These are
  unexecuted.** Task 13 had finished with `e2e/` by the time I touched it
  (`4534e85`, then `b62d94f` recording its completion).
- `ExerciseEditSheet.test.tsx` gained a wait helper (`fa0ab11`) — see the flake
  section. No assertion changed; a race was removed.

## Density over inflation

- List rows, not cards. A family is **one row** in the same list as everything
  else, at the same 9px padding as an exercise row; the only extra weight is a
  chevron, a count, and one glyph column that already existed.
- Nesting costs **8px of left padding**, not a nested container, border, or
  background. The disclosure is the hierarchy; the indent is a reading aid.
- **Standalone entries have no disclosure at all.** With 3,033 of 3,175 entries
  unassigned, making the common case pay for the rare one would have added a
  click to 95% of the catalogue to serve 5%. A standalone group renders exactly
  the row it rendered before this task.
- Families are **quiet by default** — closed unless the query reached inside
  them. A query that matched only the family's own name leaves it one row.
- Task 10's `CategorySection` and its collapse idiom are reused unchanged, so
  the Library still has one disclosure vocabulary.
- The pickers stop at 60 groups with `N more matches — keep typing to narrow`,
  which is Task 10's filter-first precedent applied to a list that was
  previously rendering 3,175 rows on open.

Three `design-system-font-size` hook findings on `NestedExerciseList.tsx`
(`fontSize: 13`, `text-[10px]`) and two on `ExercisePickerSheet.tsx`
(`rgba(0,0,0,0.4)` backdrop, `12px` sheet radius) are values copied verbatim
from the code being replaced — the sheets' own existing sheet chrome and the
Library's existing row typography. Leaving them keeps the two surfaces
identical; changing them would be an unrelated design-system change inside a
structural task.

## Performance

Grouping the whole shipped catalogue is **10ms for 3,175 items → 3,045 groups**,
and a `searchCatalogGroups("squat")` over the result is **1ms → 191 groups**
(measured with a throwaway suite, removed afterwards; `git status` confirmed
clean). This is nothing like Task 10's 3,292ms, because that was resolution by
*name* — a full catalogue scan per entry — while this resolves catalogue entries
by id, one map lookup each. It is still memoised on `[selectable, resolve]`, so
it recomputes when the provider republishes (which is exactly what a committed
correction must cause) and not on every render.

## Data safety

Read-and-select, but a selection is a write into the user's program:

- What gets added is **the item object that was ticked**, held in the selection
  state. Neither sheet re-derives it from an id or a name at confirm time —
  the old `exerciseCatalog.find(e => e.id === selected)` is gone. P7 (select
  `group.versions[0]` instead of the clicked version) kills 2.
- `by-normalized-alias` is still the schema's only unique index, and
  `rg 'IDBObjectStore\.add|\.add\(' src` still finds no `add()`. Nothing in this
  task writes to IndexedDB at all.

## Judgement calls a reviewer should check

1. **Search keeps the siblings and highlights the match** rather than filtering
   the family down to matching versions. Argued from "reveals **and**
   highlights" and from high-bar/low-bar being the actual choice. The opposite
   reading of "returns … relevant nested versions" is defensible; if the
   controller prefers it, the change is one line in `searchCatalogGroups` plus
   two test expectations.
2. **A family is filed under one muscle bucket — its first version's.** Splitting
   a family across the muscle buckets its versions touch would put two rows
   called "Squat" on one page holding different halves of one family, which is
   the fragmentation nesting exists to remove. The cost is that a glutes-primary
   squat version is reachable under `quads`.
3. **User exercises are now selectable in the pickers**, per the spec line. The
   consequence: their id is written to `canonicalExerciseId`, which
   `resolveCanonicalId` does not know. Resolution falls back to the stored
   performed name and finds the custom exercise (`identity.ts` `resolveName` →
   `customMatch`), so nothing is lost, but it is a reference shape that did not
   exist before. Deleting the custom exercise later leaves a dangling id and a
   standalone resolution — visible, not lossy.
4. **The 60-group cap** trades "scroll the whole catalogue" for "keep typing".
   Nobody scrolls 3,175 rows, but it is a visible behaviour change.
5. **`NestedExerciseList.tsx` is a new file not named in the plan.** The
   alternative was two copies of the invariant, one per sheet. Task 14's
   `IDENTITY_CONSUMERS` table should probably gain this path.

## Self-review findings (found and fixed before finishing)

1. **A literal NUL byte in `groupCatalog.ts`** (`f6c2436`). The composed rank
   key `` `${key}\0${item.id}` `` made git classify the whole module as binary —
   `Bin 0 -> 7044 bytes` in the diff stat, i.e. an unreviewable diff. Replaced by
   keying the rank map on the item object, which is also the correct fix on the
   merits: ids are catalogue and user data and can hold any character, so no
   composed separator is safe. **Caveat for the reviewer:** because the first
   blob was binary, `git diff 61d3486..HEAD` still shows `Bin` for that one file.
   Diff from `f6c2436` onward, or just read the file. I did not rebase, because
   a sibling agent had commits interleaved with mine on this branch.
2. **The same filter written twice** (`6649437`) — the Library's equipment
   filter and the pickers' muscle filter. Only half of that function is obvious:
   an emptied group must disappear **and** a highlight whose version was removed
   must be forgotten, or a family auto-opens on a row that is not there.
   Extracted to `filterGroupVersions` with two tests; M19/M20/M21 kill all three
   halves. Also un-exported `PICKER_GROUP_LIMIT`, `useSelectableCatalogGroups`
   and `filterGroupsByMuscle`, which nothing outside the module used.
3. **Task 14's exact-lookup comment was on the wrong line** (`6a3c103`). The
   plan says *same-line*; mine was above the lookup. Moved.
4. **A stale-open bug in both family rows.** My first version seeded `open` with
   `useState(matchedVersionIds.length > 0)`. The row stays mounted while the
   user types, so it froze whatever a half-typed query happened to match — the
   picker tests caught it immediately (`Unable to find … High Bar Back Squat`
   with the family visible). Replaced with a derived value plus a click override
   that resets when the automatic answer changes. **The same latent bug exists
   in Task 10's `CategorySection`** (`defaultOpen` is a `useState` seed, so a
   query narrows a mounted section without opening it) — pre-existing, its test
   comments already acknowledge it, and I left it alone rather than change
   behaviour Task 10's tests depend on. Reported, not fixed.
5. Library copy updated to mention that movements hold their versions.

## Flakiness under `--maxWorkers=24` — a real one, found and fixed

My first `ExerciseEditSheet.test.tsx` failed **3 of 3** runs at
`--maxWorkers=24` and never under `--runInBand`:

```
● ExerciseEditSheet — identity correction › corrects a name-only exercise by its name
    InvalidStateError: An operation was called on an object on which it is not allowed…
      70 |     return (await getDb()).getAll("aliases");
      at FDBDatabase.transaction (node_modules/fake-indexeddb/build/cjs/FDBDatabase.js:143:13)
```

Not a scheduling artefact: the provider reads three stores on mount and the
correction sheet renders `Reading stored corrections…` until they land, so a
test that stopped at `findByRole("region")` left live reads behind, and the next
`beforeEach`'s `resetDbConnection()` closed the connection under them. An
earlier symptom of the same bug crashed the whole jest process with
`InvalidStateError` *after* reporting `8 passed` — a suite exiting non-zero
while claiming green.

Fixed at the cause: every test now waits for the sheet to be **read**, not
merely mounted, and the one test that asserted only an absence was folded into
the test that waits. **No timeout was changed anywhere.** Five consecutive runs
of my whole lane at `--maxWorkers=24`: `80 passed, 80 total` each time.

## Foreign failures, checked rather than assumed

One full-suite run mid-task reported `2 failed, 104 passed / 11 failed, 1600
passed`. Attributed by filename, not assumed: both failing suites were
`src/lib/workout/localDate.test.ts` and its sibling — Task 13's lane, which the
brief explicitly fences off from me, and which that agent was mid-edit on. They
went green with Task 13's `5801ebc`. Every run since has been clean.

## Gates

```
### bun run test -- --runInBand
Test Suites: 107 passed, 107 total
Tests:       1621 passed, 1621 total
Snapshots:   0 total
Time:        30.423 s
Ran all test suites.

### bun run typecheck
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json

### bun run lint
$ eslint .

### bun run build
dist/assets/index-Cmd6GLNZ.css     27.70 kB │ gzip:   6.99 kB
dist/assets/index-hjTnD9G8.js   1,567.24 kB │ gzip: 279.48 kB
(!) Some chunks are larger than 500 kB after minification. …
✓ built in 1.23s

### git diff --check
(no output)

### e2e not run — controller instruction
```

**For the controller's single serial run:** `e2e/routine-builder.spec.ts` is
changed and unexecuted (three cases: family row visible, family click adds
nothing, concrete version adds). It is the only e2e spec that drives the
exercise picker; `grep -rl "Add exercises|Replace with|Search exercises" e2e`
returns that file alone. Nothing else in my diff plausibly needs a browser.

## Deliberately deferred, with reasoning

1. **Standalone unresolved *names* are not selectable in the pickers.** The spec
   says pickers include them; `groupCatalogItems` supports the `unresolved`
   source and it is tested (M12 kills 1). No surface feeds it, because a picked
   row is written into the program as `canonicalExerciseId` and a name has no id
   to write — fabricating one would put an identity into the user's routine that
   nothing else in the app agrees with. In the **Library** the requirement is
   already met by Task 10's `Needs review` section, which lists exactly those
   names, filters on the same query box, and offers the correction sheet. If the
   controller wants them in the pickers too, that needs a ruling on what id gets
   stored — I did not guess.
2. **`CategorySection`'s stale `defaultOpen`** (self-review item 4) — Task 10's
   surface, pre-existing, and its tests are written around the current
   behaviour.
3. **Modifier names are not searchable.** Version display names in this
   catalogue already carry their modifiers ("High Bar Back Squat"), and
   `SelectableExercise` is pinned by the plan, so adding a modifier-name field
   would change the published interface for a case I could not find a real
   example of.
4. **`barbell-back-squat` is not fixed** — carried to final review by ruling. My
   grouping surfaces it as its own top-level row, which is what the catalogue
   currently asserts, and a test pins that so the day it is fixed the test says
   so.

---

**Status: DONE_WITH_CONCERNS**

Concerns, in the order I would look at them:

1. The **search-keeps-siblings** reading (judgement call 1) is the one place a
   different reading of the spec sentence gives a different UI. One line to
   reverse if the controller disagrees.
2. **User exercises now write their id into `canonicalExerciseId`** (judgement
   call 3). Resolution handles it via the name fallback, but it is a new
   reference shape and Task 14's audit should see it.
3. `git diff 61d3486..HEAD -- src/lib/catalog/groupCatalog.ts` still renders as
   `Bin` because of the NUL byte in the first commit of that file, fixed in
   `f6c2436`. The file at HEAD is ordinary UTF-8.
4. The **e2e spec change is unexecuted** and needs the controller's serial run.

Commits: `8fd0d6c`, `bcf47b6`, `24f7cc8`, `f6c2436`, `09c7733`, `6649437`,
`6a3c103`, `fa0ab11`, `fdb8db9` (+ this report).
Gates: 107 suites / 1,621 tests / 0 failures; typecheck, lint, build,
`git diff --check` clean; e2e not run — controller instruction.
