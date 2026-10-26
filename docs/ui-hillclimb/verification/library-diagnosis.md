## Diagnosis checkpoint — Library failures are test-tooling performance, not an app bug

### Root cause (measured)
Opening the Quads category unfiltered mounts **349 standalone rows / 279 buttons / 2,595 DOM nodes**. Testing Library's `*ByRole` name queries compute an accessible name (and visibility) for every candidate, and in jsdom that costs ~35–200 ms each. Instrumented per-call timings on the exact failing test:

```
render                    609–1156 ms
findByRole region          452–545 ms
getByRole quads button     842–2180 ms
user.click quads          1322–2664 ms
getByRole family row     9696–18696 ms   ← not the Quads render
queryByRole High Bar    10077–15805 ms
user.click family          → 30 s test timeout
```

Same DOM, alternative queries:

| query | time |
|---|---|
| `getAllByRole(... {name:/^Squat movement.../}, {hidden:true})` | 12,360 ms |
| `getAllByRole(... /High Bar Back Squat/, {hidden:true})` (no match) | 59,686 ms |
| `getAllByLabelText(/^Squat movement, \d+ versions$/)` | **56 ms** |
| `getByText(/High Bar Back Squat/)` | **35 ms** (346 ms first call, no match) |
| `querySelectorAll('[aria-label^="Squat movement, "]')` | **10 ms** |

The second failure (`offers no correction`) was collateral, not independent: it appeared as a `beforeEach` hook timeout at `deleteDB` (line 451) in the latest run and as a "Needs review" miss in baseline — both after the first test was killed mid-flight.

### Fix (test-only, 1 file)
`src/components/catalog/LibraryClient.test.tsx`, collapsed-family test only:
- family row: `getByRole("button", {name})` → `getByLabelText` on the **same `aria-label`**, plus `expect(family.tagName).toBe("BUTTON")` so button/role intent stays pinned;
- version presence/absence: `*ByRole` name scans → `queryByText` / `getByText` on the rendered title.

No source, resolver, config, or app-data changes. No timeout changes. Diagnostic harness lives entirely in `/tmp/opencode/` (`jest.diag.config.js`, `rtl-wrapper.js`, `ue-wrapper.js`); no `[DIAG-*]` in the repo.

### Verification
```bash
npx jest src/components/catalog/LibraryClient.test.tsx --runInBand -t "keeps a family collapsed until the user opens it"
# ✓ 2.6 s (was 30 s timeout)

npx jest src/components/catalog/LibraryClient.test.tsx --runInBand
# ✓ 19/19, 18.0 s — repeated: 19/19 24.0 s, 19/19 21.7 s
```
Assigned 9-suite set: **97/98 pass**; Library, Analysis, Workout, Profile sparkline, History all green.

### One remaining blocker (not mine, outside allowed scope)
`ProfileClient.test.tsx:131` now fails deterministically (`8 tests, 1 failed`, also alone). Commit **`d75e6b3` (17:57)** changed `ProfileClient.tsx` from `★ {GOAL_LABELS[...]}` to `Primary goal: {...}` but left the assertion `getByText(/★.*strength/i)`. That commit landed after the 17:43 assigned run, which is why that run showed ProfileClient passing. Full unit will stay red until the owner either updates that test line to the new copy or restores the ★ badge. I did not touch it.

Caveat: one cold, uninstrumented isolated run initially missed the 1 s `findByRole` page-load wait; I left that line unchanged and four subsequent runs passed. If it recurs, it is a separate cold-start flake, not the Quads query cost.
