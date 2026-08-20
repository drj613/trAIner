# Delivery handoff — exercise catalogue normalization

Written 2026-08-19. Branch `feat/exercise-catalog-normalization` pushed to `origin` at `63b830f`, upstream set. Not merged, no PR opened yet.

## The dated removal — September 30, 2026

One dated comment ships, and it is the only one. Verbatim, at `src/lib/catalog/identity.ts:300`:

```
  // TODO(2026-09-30): remove legacy exercise ID redirects after the compatibility window.
```

**On that date, remove the legacy exercise-ID redirect lookup.** Note the redirect table it guards is *currently empty* (see below), so the machinery is inert today — removing it on schedule costs nothing unless redirects are populated before then. If they are, this comment becomes load-bearing and the removal needs a migration plan.

## What actually shipped, in numbers

| Artifact | Records |
|---|---|
| `exercises.generated.json` | **3,175** entries |
| — of those, carrying a `movementId` | **142 (4.5%)** |
| `movements.generated.json` | 12 |
| `modifiers.generated.json` | 39 |
| `importDisambiguations.generated.json` | 20 |
| `legacyRedirects.generated.json` | **0** |
| `scripts/catalog-normalization/merges.json` | **0** |

**Read the 4.5% honestly.** 142 of 3,175 entries nest under a movement; the other 3,033 resolve as standalone. That is not a spec violation — the spec sets a *ceiling* of 300 assigned entries, never a floor, and explicitly prefers standalone over a misleading family. The final review tried to find a case where thin assignment makes the app worse than `master` and could not: standalone is the safe fallback in the resolver, the UI and history alike. So **95.5% of entries behave exactly as before and 4.5% behave better.** The change is purely additive.

Consequence worth stating plainly rather than discovering in use: `Barbell Squat` nests under the squat family; `Barbell Back Squat` does not.

## Deferred, and why — one gap wearing several hats

The final review's most useful conclusion: these are not independent deferrals, they are all **catalogue curation depth**.

1. **Deduplication was never curated.** `merges.json` is empty and **65 near-duplicate pairs** sit at `review-required`, including trivially safe singular/plural pairs. This is the largest gap between machinery and data on the branch, and the one genuine under-delivery.
2. **Redirect machinery is inert.** `legacyRedirects.generated.json` has zero records, so the compatibility path and its dated comment guard nothing yet.
3. **5 entries are shadowed by their own disambiguation rule** — `barbell-back-squat`, `squats`, `row`, `lateral-raises`, `split-squats`. Each has a canonical name that normalizes to an `underspecified-name` rule, and none appears in its own rule's `candidateExerciseIds`, so each is unreachable by its own canonical name and carries `movementId: null`. The mechanism is **rule-shadowing**, not name-bypass: the resolver consults disambiguation at `identity.ts:340` *before* canonical-name match at `:348`. No data loss — existing logs referencing them resolve by direct id, not by name.
4. **6 of 22 distinct disambiguation candidates carry `movementId: null`**, so choosing one exits the family. Pinned by a **characterization test**: an upstream `assignments.json` fix must update it, and that is success, not regression. (Derivation: 38 candidate refs → 22 distinct → 6 null.)
5. **The `or` rule** leaves 4 entries unreachable by canonical name and 2 unreachable by name *and* alias. Spec-intended (line 418): an alternative baked into an exercise name should become a user choice.
6. **The `weighted` strip rule was deliberately rejected.** 43 entries carry "weighted" as identity by name, and phrase stripping runs before exact matching, so honouring the spec literally would corrupt exact matching for real entries. Recorded as a spec-vs-catalogue conflict, not a defect.

## Open follow-ups (none blocking)

- **N3** — curate deduplication; 65 pairs waiting. Highest value of the five.
- **N4** — `compareGroups` (`groupCatalog.ts:93-100`) sorts all family rows ahead of the alphabetical standalone list within a muscle category; a scanning surprise at 4.5% assignment.
- **N5** — `aria-expanded` without `aria-controls` at `LibraryClient.tsx:416,599` and `NestedExerciseList.tsx:191`.
- **An e2e spec for backup restore.** Deliberately not written: it needs download interception, a dialog handler and `setInputFiles`, and shipping an unrunnable blind spec at the delivery gate is the same shape as the commit that silently broke `e2e/helpers.ts` mid-plan.
- **`LocalDataProvider` has no snapshot-restore path** because snapshot restore does not exist — Settings can create and delete snapshots, nothing restores one. This becomes a stale-data hole the moment that button is added.

## Quality gates at `63b830f`

```
bun run catalog:check          exit 0
bun run test -- --runInBand    111 suites / 1,660 tests / 0 failures
bun run typecheck              exit 0
bun run lint                   exit 0
bun run build                  exit 0 (Vite large-chunk advisory only)
git diff --check               exit 0
bun run test:e2e               94 passed, exit 0
```

`src/lib/prompts` is **byte-identical** to both the branch base `4a1caa4` and `origin/master` — verified, not asserted.

e2e was run **once, serially, by the controller**. Mid-plan, implementers were barred from running Playwright after concurrent agent runs left dozens of Chrome instances throttling the machine; they wrote specs and left them unexecuted. That single run was the first execution of `routine-builder`, `exercise-history`, `history-rawcell`, `program-import` and `workspace`, and all passed, so the ban cost nothing in escaped defects.

## Known-unverifiable, published rather than claimed

- **Compiler/runtime normalization equivalence.** `normalizeToken` and `normalizeExerciseName` have identical fixed-point sets over 16,275 measured strings, so **no test can prove the compiler calls the runtime rule**; it is confirmed by reading the import at `core.ts:23`.
- **Real-browser `structuredClone` / IndexedDB write-ordering divergence.** Unreachable in jest + `fake-indexeddb`, and e2e does not exercise migration. Permanently unverifiable in CI.
- **`void` vs `await` on the post-restore refresh** (M4). Unfalsifiable in this harness — the refresh starts in the same microtask either way and no user input can arrive in the window. The mutation that *does* matter, deleting the refresh, fails 2 tests.

## Invariants to keep true

- `by-normalized-alias` is the schema's **only** unique index. A new unique index reopens the rejected-write class that once bricked the database permanently.
- There is **no `IDBObjectStore.add()`** anywhere in `src/`. Every write is `put`.
- Unreadable content is never grounds for deletion — the sole exception is aliases, because an unreadable alias would occupy its token forever.
- Unreadable content in **one record** is not grounds for rejecting a **whole backup file**. `backup.ts` now validates a field only when both (1) some consumer dereferences it unconditionally and (2) no migration deliberately preserves the bad shape.
- Performed history labels are **immutable**. A correction changes current grouping and badges, never the stored historical label.
- The identity audit at `src/components/app/ExerciseIdentityAudit.test.ts` fails if a new `src/` module reads the catalogue without an audit row. Keep it honest; everything downstream trusts it.
