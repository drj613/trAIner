# Task 10 — fix-round review (round 3)

Reviewed at HEAD `73f62ee`; code under review is the round `eb74798 … df16445`.
Lane: `src/components/catalog/**` and `src/lib/storage/aliasRepo.ts` (mutated for verification only, restored byte-for-byte).
`src/lib/import/resolution.ts` and `src/lib/catalog/**` read only — never written by me.
Baseline for the sheet scope (`src/components/catalog` + `src/lib/storage/aliasRepo.test.ts`): **52 passed / 52**.
Wide scope (adds `src/lib/import`): **250 passed / 250**.

Restores verified at the end of every mutation and at the end of the review:

```
18d342e447ab0467471da9de14a288fe45eda1ec  src/components/catalog/ExerciseCorrectionSheet.tsx
8d93be412d65f9e731feaabef6895ce91891e15f  src/components/catalog/LibraryClient.tsx
2d01d1dcfb84dee491d4982b437e758996e875e7  src/components/catalog/ExerciseCorrectionSheet.test.tsx
0030b2a1c5a7eeaa4a0dbdf4f6e77b0fb506c11f  src/components/catalog/LibraryClient.test.tsx
ca1c9497bdb85f9b67ffbf023b87cbbcc4d6b35a  src/lib/storage/aliasRepo.ts
```

All five match HEAD. Six throwaway probe files were created inside my lane and deleted
(`__zzr3e2e.test.tsx`, `__zzr3e2eb.test.tsx`, `__zzr3probe.test.ts`, `__zzr3restore.test.ts`);
final `git status` shows nothing modified or untracked in `src/components/catalog/` or
`src/lib/storage/`. The modifications visible in `src/lib/import/**` and
`src/components/import/**` are the Task 9 lane's live work, not mine — see "Deferred items".

---

## Verdict on the ruling's implementation

**The ruling took effect. Both write paths key on the resolver's token, and I confirmed it
end to end rather than from unit assertions.** The two refusals are honest and write nothing.

There is one **Critical** new problem the round did not create deliberately but did open:
a correction written under the new keying **stops working after a backup restore**, because
the restore path re-derives the token by the old rule. Detail in NEW-A. Everything else is
either right or Minor.

---

## End-to-end reproduction — driven through the real UI, not through spies

Probe: `LocalDataProvider` + `ExerciseNormalizationProvider` + `LibraryClient` over a real
(fake-indexeddb) database, one log entry, `Needs review` opened the way a user opens it.

| # | Scenario | Result |
|---|---|---|
| **E2E-A** | Log entry `3 second paused Hatfield Squat` → open `Needs review` → click the row → select `Squat` → `Save correction` | Storage holds `{"id":"normalized-name:paused hatfield squat","targetValue":"paused hatfield squat","movementId":"squat"}`. The row **leaves the queue** — in fact the whole `Needs review` region unmounts, because it was the only row. **PASS** |
| **E2E-B** | Same name → `Map to an existing exercise` → `high bar back squat` → save | Alias stored as `{"alias":"3 second paused Hatfield Squat","normalizedAlias":"paused hatfield squat"}` — resolver token stored, **user's wording preserved**. Row leaves the queue. **PASS** |
| **E2E-C** | Log entry `Hatfield Squat or Lunge` (`hasAlternative: true`) | Alert on render: *"names more than one exercise…"*. After a save attempt: `aliases: []`, `normalizationOverrides: []`. The row honestly **stays** in the queue. **PASS** |
| **E2E-D** | Log entries `3 second paused …` **and** `5 second paused …` | Two review rows before; correcting **one** clears **both** (region unmounts). This measures the deferred `correctionTargetKey` decision the implementer left alone, and its stated reasoning holds. **PASS** |
| **E2E-E** | Log entry `Competition` (prepares to `""`) | A review row does appear, the sheet refuses in the user's language — *"leaves no exercise name once its annotations are set aside…"* — and both stores stay at 0 rows. **PASS** |

The probe is not vacuous. Two mutations, each applied to the shipped file and restored:

| # | Exact mutation | Result |
|---|---|---|
| **E2E-M1** | `ExerciseCorrectionSheet.tsx:68` `targetValue: lookupToken` → `targetValue: target.value` | **E2E-A fails** (row never leaves the queue); B and C still pass |
| **E2E-M2** | `aliasRepo.ts:33` `prepareImportName(alias, disambiguations).normalizedName` → `normalizeExerciseName(alias)` | **E2E-B fails**; A and C still pass |

So each half of the ruling is independently load-bearing in the real UI, and the original
`Saved — Squat`-on-a-row-that-never-leaves defect is dead on both paths.

---

## The three declared deviations

### Deviation 1 — deriving the token inside `aliasRepo` — **ACCEPT, with two named seams (Minor)**

The controller checked that the provider uses the same singleton. Here is the rest of it.

**Can the two maps diverge in production? No, and not by accident either.**
`disambiguationsByNormalizedName` is a `const` module-scope `Map` built from the bundled
artifact (`registries.ts:114`). Nothing mutates it and nothing swaps it:
`ExerciseNormalizationProvider.tsx:50`, `v10Identity.ts:79` and `match.ts:43` are the only
three places a resolution context's `disambiguations` is populated in non-test code, and all
three name that same const. `loadDisambiguationRules` (`registries.ts:124`) exists but is not
wired into the provider. So there is exactly one map at runtime.

**Can they diverge in a test? For the sheet, no — there is no seam.** The sheet reads its
context only through `useExerciseNormalization()`, whose sole `Provider` is
`ExerciseNormalizationProvider`; there is no injectable-context prop, so no test can hand the
sheet a different map while `aliasRepo` uses the shipped one.

**But there is a narrower test-fidelity gap worth recording.** `identity.testFixtures.ts:63`
builds a context with `disambiguations: new Map()`, and `resolution.testFixtures.ts:139`
builds one from a *synthetic* rule set. `dedupeAliasResolutions` and
`rememberedAliasConflicts` take no context at all — they call `storedAliasToken`, which
hardcodes the shipped artifact (`resolution.ts:28`). So an import-lane test can drive the
resolver with a synthetic rule map while the functions under test key on the shipped one.
Production is consistent; the *test* is not necessarily measuring the pairing it looks like it
measures. This is a note for the Task 9 lane, not a defect here.

**Is a divergence in the repository's own map pinned?** Yes, and well. Mutation **M-B**
(`rememberedAliasToken` → plain `normalizeExerciseName`) → **5 failed / 245**:
`keys a mapped annotated name on the resolver's token but keeps the user's words`,
`refuses to assign a movement while an alias governs another spelling of the name`,
`leaves an alias stored on a token the resolver never reads alone`,
`stores a new alias under the token the resolver looks it up by`,
`collapses two duration variants of one name onto a single mapping`.
(The report's M-B row names two tests I did not see and misses two I did; the count is the
same. Probably measured pre-`a62c8e4` — see NEW-C.)

**Layering — acceptable here.** The edge is storage → catalogue, and the catalogue half is
pure rules with no storage import, so the plan's reviewed no-storage-import seam in the
projection points the other way and is not touched. The edge is also not new: `aliasRepo`
already imported `@/lib/catalog/normalize` and `@/lib/catalog/identityEvents` before this
round. What changed is its width — `identity` + `registries` instead of `normalize` — which
in a single-bundle Vite SPA costs nothing the app was not already paying.

**The residual cost the implementer named is real**, and I would add one thing to it:
`rememberedAliasToken(alias, disambiguations = disambiguationsByNormalizedName)` exposes an
optional second parameter **no caller passes**. That is precisely the "one more way for two
surfaces to key one name differently" that the deviation exists to remove, reintroduced in the
signature of the function that removes it. **Minor: drop the parameter.** If a future caller
ever needs a different map, that is a decision worth making explicitly rather than by default
argument.

Verdict: the implementer overturned the shape its brief sketched and was **right** to.
M-O's measurement (an optional field killed only spy-argument assertions) is the correct
reading of that mutation, and the resulting design is the safer one.

### Deviation 2 — three lines in `resolution.ts`, not one — **VERIFIED TRUE, justified**

I did not take the whole-batch claim on trust; I reproduced it.

Probe **P1** — `aliasRepo.saveMany` with three inputs: `3 second paused Hatfield Squat` →
high-bar, `5 second paused Hatfield Squat` → low-bar, and one **completely unrelated** alias:

```
threw: Alias already maps to a different exercise: 5 second paused Hatfield Squat. …
rows after: 0
unrelated survived?: false
```

The throw happens at `aliasRepo.ts:101`, **inside the already-open readwrite transaction**
(opened at `:91`), so the transaction never commits and **the whole batch is lost, including
the unrelated alias**. Exactly the claim, exactly the blast radius.

Probe **P2** confirms the fix is in the right place: with the shipped keying, two variants
resolving to *different* ids produce `[]` — dropped where `dedupeAliasResolutions` already
drops conflicts — and two variants agreeing collapse to **one** input. On plain
`normalizeExerciseName` the two keys differ (`true`), so both would have been handed to
`saveMany`. Probe **P3** confirms the sibling change: `rememberedAliasConflicts` now sees a
stored row occupying an annotated name's resolver token across imports.

The extra two lines are a genuine data-safety save, not scope creep. Reported loudly, which is
the right way to take them. **Approved.**

### Deviation 3 — announce rather than confirm (NEW-5) — **ACCEPT, one Minor**

Can a user still lose a remembered mapping without agreeing to it? **Strictly, yes**: one
click on `Return to standalone` (`ExerciseCorrectionSheet.tsx:666`) deletes the alias, and the
only notice is the post-hoc status line. Nothing warns beforehand.

I still think announce is the right call, for the reason the implementer gives: the button's
label states the intent unambiguously, the alias is the one deletion the standards sanction,
and a gate on the recovery path is the wrong friction. Reachability also stays narrow — an
alias-governed name normally resolves concretely, so `targetFor` (`LibraryClient.tsx:104-109`)
returns a `catalog-exercise` target and `governingAliases` (`:305`) is empty by its
`kind === "normalized-name"` guard.

**Minor:** the pre-hoc half is one interpolation away. `Return to standalone` could name what
it will drop when `governingAliases.length > 0` — the sheet already computes
`aliasTargetLabel` for the status line — which is pre-hoc honesty without a gate.
Pinned today only after the fact: **M-K** (per the report) kills the status wording.

---

## The two inherited-test problems

### "The sixth RED test was never RED" — **CONFIRMED**

`git show eb74798~1:src/components/catalog/LibraryClient.tsx` has `resolutionCacheKey`
byte-identical to HEAD, including the `canonicalExerciseId` segment, and `LibraryClient.tsx`
hashes `8d93be41…` both before and after the round — the file was never touched. The test
could not have been RED. NEW-3 was a **test gap**, not a bug, and the test now earns its place
by mutation: **R13** (drop `canonicalExerciseId` from `resolutionCacheKey`) → **1 failed / 51**,
`does not collapse two entries that share a name but not a canonical id`. It survived 25/25 in
round 2. Closed.

One correction to the implementer's framing, for the record: **round 2 did not
mischaracterise this.** `task-10-review-2.md:167` says in as many words *"NEW-3 (Important,
test gap) — the `canonicalExerciseId` half of the cache key is unpinned"*. What was wrong was
the **inherited agent's** presentation of six tests as six REDs. The implementer is right about
the substance and slightly unfair about the source; the correct thing to record plainly is that
one of the six inherited tests was a coverage test wearing a RED test's clothes.

### Test 4's fixture switched from `aliasRepo.save` to `putRaw` — **SOUND, and necessary**

`putRaw` routes through `aliasLookupToken` (`aliasRepo.ts:130`), which recomputes the token
from the display text. Measured (probe P5): planting `3 second paused Hatfield Squat` through
`putRaw` stores `normalizedAlias: "3 second paused hatfield squat"` — the unstripped token, i.e.
a real legacy row, **whatever `save` keys on**. Had the fixture kept `save`, after the fix it
would have planted the *stripped* token, the alias would then have genuinely governed the name,
and the sheet would have refused — the test would have died on its own canary rather than on
the behaviour. The switch was not optional.

It is also not a dodge: the fixture asserts the planted token explicitly
(`ExerciseCorrectionSheet.test.tsx:570`) and asserts the row does **not** govern
(`:572`), so it cannot go vacuous if the artifact changes. `putRaw` has no production callers,
and the restore path (`backup.ts:329` → `classifyAliases`) shares the same
`aliasLookupToken` rule, so `putRaw` is the honest imperative twin of restore rather than a
back door. **Correct call.**

### The added false-success test — **real, and it was a genuine hole**

`refuses to assign a movement while an alias governs another spelling of the name`
(`:501`) is the direction nothing covered: the mapping is made on the 3-second variant, the
sheet is opened on the 5-second one, and a comparison on raw text would miss it and report a
success that changes nothing. Its canary asserts the stored mapping really does govern the
other spelling first (`:507`), so it cannot pass by never reaching the code. Good test.

---

## The empty-token hazard — re-verified independently

Probe **P7**, 54,902 inputs (50,000 fuzzed over `" aA0'’-_/.()#é\t\n%xyz"`, plus every
catalogue name and alias, plus every rule token):

```
normalize non-idempotent:                                   0
prepare non-fixed-point:                                    0
prepared tokens that are not already normalized:            0
inputs with a non-empty normalized form that prepare to "": 6
distinct such forms: competition, pain free, pain free depth,
                     to pain free depth, to a pain free depth, or
```

Exactly the sibling's six, reproduced from scratch. Nothing else in that space empties out.

Probe **P4**, on writes rather than reads:

- `aliasRepo.saveMany` with **two** empty-token names in one batch → throws
  `Alias cannot be empty`, **0 rows**. The guard (`aliasRepo.ts:57`) runs from
  `assertRememberedInput` at `:89`, before `getDb()`/`db.transaction` at `:90-91`. Confirmed
  by reading, and the row count confirms nothing landed.
- `normalizationOverrideRepo.save({ targetValue: "" })` → throws
  `Normalization override target cannot be empty`, **0 rows**. `validateNormalizationOverrideInput`
  runs at `normalizationOverrideRepo.ts:191`, before `db.transaction` at `:196`.

**And I checked that a write can be REJECTED, not only that a read can throw** — which is
the part that makes the negative result meaningful rather than vacuous. Writing two rows with
the same `normalizedAlias` **straight to the object store**, bypassing every guard, produces a
real rejection in this harness:

```
ConstraintError: A mutation operation in the transaction failed because a constraint
was not satisfied. …
rows holding 'dupe token': 0
```

So `fake-indexeddb` does enforce `by-normalized-alias`, and the "no `ConstraintError` is
reachable" claim is a measured negative, not an artefact of a permissive harness.

Two further points the implementer did not make, both supporting the fix:

- `normalizationOverrides` has **no indexes at all** (probe P9). An empty target would not be
  *rejected* there — it would **upsert** onto the single shared primary key
  `normalized-name:`, so every annotation-only name would silently overwrite the previous
  one's classification. Silent overwrite is worse than rejection, and the guard is what
  prevents it.
- The UI half is pinned: **M-G3** (empty-token branch condition → `false`) → **1 failed / 51**,
  `refuses to correct a name that is nothing but an annotation`. **M-G2**
  (`hasAlternative` branch → `false`) → **1 failed / 51**,
  `refuses to correct a name that offers a choice of exercises`.

Probe **P9** also confirms the standing constraints: `by-normalized-alias (UNIQUE)` is the
**only** unique index in the whole schema, and a grep of `src/` finds **no
`IDBObjectStore.add()`** — every alias write is `store.put` (`aliasRepo.ts:117, 139, 151`).

---

## Existing stored rows

Probe **P5**, two legacy rows planted through `putRaw`:

| Row | Stored token | `resolveName` | `aliasRepo.find` |
|---|---|---|---|
| `Hatfield Squat` (plain) | `hatfield squat` | resolves → `barbell-high-bar-squat` | found |
| `3 second paused Hatfield Squat` | `3 second paused hatfield squat` | **does not resolve** | not found |

Said plainly, as asked: **a pre-existing row whose name carries a phrase is unreachable — and
it already was before this round.** `resolveName` has always looked up the phrase-stripped
token (`identity.ts:280-286`); that mismatch is the defect NEW-1 named. This round does not
make such a row worse, and it does not make it better either. No migration was requested and
none happened. It is a finding only in the sense that the class still exists in the wild:
users who mapped an annotated name under an older build still have a dead row, and nothing
tells them.

The good news, also measured: making a **new** correction over such a stale row works
(`P5: annotated now resolves to goblet-squat`) and **leaves the stale row alone** — the sheet
deletes nothing the user did not ask about. Correct behaviour under the standards.

---

## Exactly one identity event per path

Probe **P6**, counting `EXERCISE_IDENTITY_CHANGED_EVENT` around each call:

```
aliasRepo.save                          -> 1
aliasRepo.save(..., {dispatch:false})   -> 0
aliasRepo.removeMany(ids)               -> 1
aliasRepo.removeMany([])                -> 0   (nothing written; correct)
overrideRepo.remove(missing key)        -> 1   (no early return; the map path depends on it)
```

Sheet paths, from the code plus the mutations below: assign/standalone with no governing alias
→ `save(input)` → 1; standalone with an alias → `save(input, {dispatch:false})` then
`removeMany(ids)` → 1; the two refusals → 0 with nothing written; map → alias write suppressed,
`override.remove` announces → 1. **No path fires zero after a successful write.**

The conditional suppression is required and is now pinned in both directions:

| # | Exact mutation | Result |
|---|---|---|
| **M-J** | `ExerciseCorrectionSheet.tsx:395` `save(input, { dispatch: false })` → `save(input)` on the clearing path | **1 failed / 51** — `returns an alias-governed name to standalone by dropping the alias` (was 25/25 SURVIVING as R8) |
| **M-M** (report) | suppression applied unconditionally | 5 failed / 47 — the naive form, killed on the ordinary path |

---

## Write order (NEW-2) — closed

| # | Exact mutation | Result |
|---|---|---|
| **M-H** | swap `ExerciseCorrectionSheet.tsx:395-396` so `aliasRepo.removeMany(ids, {dispatch:false})` runs **before** `normalizationOverrideRepo.save(input)` | **2 failed / 50** — `returns an alias-governed name to standalone by dropping the alias`, `keeps the remembered mapping when the standalone override write is rejected` |

Round 2's R7b survived 25/25. It is dead now, and the destructive delete is last, so a rejected
override write leaves the mapping intact and the failure visible. The new test's canary
(`ExerciseCorrectionSheet.test.tsx:596`) proves the alias really governed the name first.
Correctly fixed.

---

## NEW findings

### NEW-A (Critical) — a correction written under the new keying **does not survive a backup restore**

The round's own comment claims the opposite. `aliasRepo.ts:25-27`:

> *Restored and migrated rows deliberately do NOT come through here: `putRaw` keeps
> `aliasLookupToken`'s rule so an existing row resolves after a restore exactly as it did
> before it.*

That is true of rows written **before** this round and false of rows written **after** it.
`aliasLookupToken` recomputes the token **from the display text** by the plain-normalize rule
(`v10Identity.ts:327-334`), and both `putRaw` and `backup.ts`'s `classifyAliases`
(`backup.ts:329`) use it. So a row this sheet writes as
`{alias: "3 second paused Hatfield Squat", normalizedAlias: "paused hatfield squat"}` comes
back from a restore as `normalizedAlias: "3 second paused hatfield squat"` — the token the
resolver never reads.

Measured, on the real functions:

```
exported row:            ["3 second paused Hatfield Squat", "paused hatfield squat"]
resolves before restore: goblet-squat
aliasLookupToken says:   {"normalizedAlias":"3 second paused hatfield squat","fromDisplayText":true}
restored row:            ["3 second paused Hatfield Squat", "3 second paused hatfield squat"]
resolves after restore:  undefined            <-- the correction stopped working
putRaw round-trip:       identical result
control (plain name):    hatfield squat -> hatfield squat, resolves after restore
```

And it is worse than a re-key when both generations of row exist. Two rows for the same display
name — a legacy one keyed unstripped and a new one keyed stripped — **collapse to one on
restore**, because `classifyAliases` dedupes on the recomputed token:

```
restored rows: [["new", "3 second paused hatfield squat", "goblet-squat"]]
resolves to:   undefined
```

One remembered mapping is silently discarded and the survivor does not work.

Why this is Critical rather than Important: it is the **same lie class the round exists to
kill**, merely displaced from write time to restore time. The user makes a correction, sees it
take effect, exports a backup, restores it — and the row is back in `Needs review` with no
explanation and no way to tell what happened. Backup/restore is a first-class local-first
workflow, not an edge case, and this is the one path on which the app *deliberately* rewrites
the user's key set.

The fix is not in Task 10's lane — it belongs in `v10Identity.aliasLookupToken` /
`classifyAliases`, which decide what a restored row's token is. It needs a controller ruling,
and it interacts with the standing rule *"a record we cannot read is a record we must not
rewrite, key set included"*: restore rewrites the key set of a row it read perfectly well.
The narrow options I can see are (a) have `aliasLookupToken` derive the token by the same
`prepareImportName` rule when the display text is usable, which re-keys legacy rows too and so
is really the migration the ruling declined; (b) trust a `provenance: "remembered"` row's
stored token rather than recomputing it, which keeps this round's rows working but weakens the
integrity recompute the comment at `backup.ts:311-317` justifies; (c) accept it and say so.
I recommend against (c).

**What Task 10 must do regardless of the ruling:** delete or correct the claim at
`aliasRepo.ts:25-27` and the matching sentence in the report. Right now the code asserts a
property that is measurably false, which is the shape of thing this plan has had to unwind
eleven times.

### NEW-B (Important, test gap) — the fixed-point property the whole re-keying rests on is unpinned

Three separate comparisons now depend on `prepareImportName(x).normalizedName` being both
already normalized and a fixed point:

- `resolveName`'s override match, `normalizeExerciseName(override.targetValue) === prepared.normalizedName` (`identity.ts:300-304`);
- the sheet's `governingAliases`, `normalizeExerciseName(alias.normalizedAlias) === lookupToken` (`ExerciseCorrectionSheet.tsx:305-307`);
- the post-write `aliasRepo.find(target.value)` (`:410`), whose redundancy the implementer removed on M-I's survival — correctly, but *only* because of this property.

I measured it holds today (P7: 0/54,902 on both halves). Nothing pins it.
`shippedDisambiguations.test.ts` has 11 tests and none of them asserts it.
`progress.md:388` already flagged exactly this to the Task 8 lane — *"any phrase rule producing
a token unstable under a second normalization pass would now corrupt corrections"* — and no
pin has landed. A one-line property test over the shipped artifact closes it, and it belongs
next to the artifact, not in this lane.

This is the standards' "unfalsifiable **by construction**" test applied honestly: M-I's
survival is legitimate *given* the property, so the property is now load-bearing and should be
guarded like one.

### NEW-C (Minor) — the round's mutation evidence was measured against a tree it did not ship

The report's "final restored hashes" are `ExerciseCorrectionSheet.tsx 0956ded5…` and
`resolution.ts f157c3ef…`. Those are the files at `1671076`. The tidy commit `a62c8e4`
changed **both** afterwards (`18d342e4…`, `8e559212…`), so the whole mutation table predates
the shipped tree. I read `a62c8e4` — a `useMemo` key change from the target object to the name
string, plus a blank line — and it is behaviour-preserving, and the six mutations I re-ran at
HEAD all reproduce. So the conclusion stands; the bookkeeping does not. Re-run the table, or
say the hashes are pre-tidy.

### NEW-D (Minor) — the map path does not clean up an override keyed on the old token

`writeAliasMapping` removes `normalizationOverrideKey("normalized-name", lookupToken)`
(`:459`), which is right for anything this build wrote. An override left by an **older** build
is keyed on the unstripped token and is not removed — so it survives as unreachable identity in
every backup export, which is exactly the dead data the map-path cleanup exists to prevent.
One extra `remove` on the unstripped key would close it. Low value on its own; worth folding
into whatever lands for NEW-A, since both are the "two generations of key" problem.

### NEW-E (Minor) — `rememberedAliasToken`'s unused `disambiguations` parameter

`aliasRepo.ts:29-34` takes an optional map no caller supplies. It is the same
two-surfaces-one-name seam the deviation removes, left open in the signature of the function
that removes it. Delete the parameter.

---

## The e2e attribution — sound

`31 passed, 35 did not run`, `net::ERR_CONNECTION_REFUSED at http://localhost:5173`,
backgrounded while other lanes were driving Playwright on the shared dev-server port; re-run
serially at the final tree, **93 passed**. I judge the attribution sound on three grounds:
the signature is a dead server rather than assertion failures; *"did not run"* rather than
*"failed"* is what port contention looks like and not what a code regression looks like; and
the re-run was **serial and at the final tree**, which is the right way to settle it rather
than a retry-until-green. The 93 also matches what the sibling lanes report. I did not run
e2e myself — the controller owns that gate.

## Flakes

Three consecutive `--maxWorkers=24` runs of the sheet scope: **52 / 52 / 52**. No timeout is
raised anywhere in the round's diff, and I found no test asserting a spinner, a batching
artefact, or a spy where storage was available. I did not reproduce the previously disclosed
`renderSheet` GC-pause flake — it needs the full suite, which is not mine to run. Unverified,
not cleared.

---

## Mutation evidence — every count beside its exact mutation

All applied to the shipped file at HEAD, run, restored from a pre-mutation copy,
`shasum`-verified. Sheet scope = `src/components/catalog` + `src/lib/storage/aliasRepo.test.ts`
(**52**). Wide scope adds `src/lib/import` (**250**).

| # | Exact mutation | Scope | Result |
|---|---|---|---|
| **M-H** | `ExerciseCorrectionSheet.tsx:394-397`: alias `removeMany(ids, {dispatch:false})` moved **before** `overrideRepo.save(input)` | 52 | **2 failed / 50** — `returns an alias-governed name to standalone…`, `keeps the remembered mapping when the standalone override write is rejected` (round 2's R7b survived 25/25) |
| **M-J** | `:395` `save(input, { dispatch: false })` → `save(input)` | 52 | **1 failed / 51** — `returns an alias-governed name to standalone…` (round 2's R8 survived 25/25) |
| **M-G2** | `:252` `const unaddressable = prepared?.hasAlternative` → `= false` | 52 | 1 failed / 51 — `refuses to correct a name that offers a choice of exercises` |
| **M-G3** | `:255` `: prepared && !lookupToken` → `: false` | 52 | 1 failed / 51 — `refuses to correct a name that is nothing but an annotation` |
| **R13** | `LibraryClient.tsx:135` `canonicalExerciseId` dropped from `resolutionCacheKey` | 52 | **1 failed / 51** — `does not collapse two entries that share a name but not a canonical id` (round 2 survived 25/25) |
| **M-B** | `aliasRepo.ts:33` `prepareImportName(alias, disambiguations).normalizedName` → `normalizeExerciseName(alias)` | 250 | **5 failed / 245** — list above |
| **E2E-M1** | `ExerciseCorrectionSheet.tsx:68` `targetValue: lookupToken` → `target.value` | probe | E2E-A fails: the annotated row never leaves the queue |
| **E2E-M2** | same as M-B | probe | E2E-B fails: the mapped annotated row never leaves the queue |

Mutations I did **not** re-run, and am therefore reporting as the implementer's measurement
rather than mine: M-A, M-C, M-D, M-E, M-F, M-K, M-M, M-N, M-Q, M-R, M-I, M-O.

---

## Deferred items — confirmed live, not dropped

Both hand-offs are being implemented in the Task 9 lane **right now**: the working tree carries
an uncommitted `unrememberableReason(rawName)` in `src/lib/import/resolution.ts`, wired into
`dedupeAliasResolutions`, together with edits to `ResolutionStep.tsx`,
`ImportClient.remember.test.tsx` and `resolution.test.ts`. The `or`-name dead-row item and the
partial-mock booby trap are correctly out of Task 10's lane and are in hand.

The third deferral — `correctionTargetKey` still keying review rows on the unstripped token, so
two duration variants list as two rows — I verified rather than accepted: **E2E-D** shows both
rows clear when either one is corrected. The reasoning holds; leave it.

---

## Where the implementer is right

- **Deviation 1** overturns the shape its brief sketched, on a measurement (M-O), and produces the safer design. `registries.ts:114` + `ExerciseNormalizationProvider.tsx:50` + `v10Identity.ts:79` + `match.ts:43` make the single-map claim airtight in production.
- **Deviation 2** is a genuine data-safety save, reproduced at `aliasRepo.ts:91-104`: 0 rows survive a conflicting batch, unrelated aliases included.
- **The `putRaw` fixture switch** was necessary, not convenient, and the fixture asserts its own premise at `ExerciseCorrectionSheet.test.tsx:570-574`.
- **The sixth test was never RED**; `git show eb74798~1:…LibraryClient.tsx` proves the key was already correct.
- **M-I's removal** is the right reading of "unfalsifiable by construction" — `find` derives the token itself, so both arguments produce the same index key — subject to NEW-B.
- **The m6 dead superset deletion is justified by construction, not merely uncovered.** Probe P8: every writer of `aliases` (`saveMany`, `replaceRemembered`, `putRaw`, and the v10 classifier) stores an already-normalized token, and normalize is idempotent (0/54,902), so `verbatim` and `renormalized` cannot differ for any row any code path in `src/` can produce. I planted a deliberately non-normalized token through `putRaw` and it came back normalized (`"  Hatfield   Squat  "` → `"hatfield squat"`), which closes the hand-edited-backup route as well. Correctly deleted.
- **NEW-2, NEW-3, NEW-4 and the two copy Minors are all genuinely closed**, each with a mutation that now kills where it previously survived.

---

## Status

**CHANGES REQUESTED**

What must change:

1. **NEW-A (Critical)** — a correction written under the new keying stops working after a
   backup restore, and two generations of row for one name collapse to one on restore with the
   survivor dead. Needs a controller ruling on where the token is derived at restore time
   (`v10Identity.aliasLookupToken` / `classifyAliases`), which is outside Task 10's lane.
   **Task 10's own obligation is unconditional:** remove or correct the false claim at
   `aliasRepo.ts:25-27` and the matching sentence in `task-10-report.md`, because right now the
   code documents a guarantee it does not have.
2. **NEW-B (Important)** — pin the fixed-point property of the shipped disambiguation artifact
   (`prepareImportName(x).normalizedName` is already normalized and stable under a second
   pass). It is now load-bearing for three comparisons and for M-I's deletion, and
   `progress.md:388` already asked for it. Belongs beside the artifact, not in this lane.
3. **NEW-C (Minor)** — re-run the mutation table at the shipped tree, or state that the hashes
   in it are pre-`a62c8e4`.
4. **NEW-D, NEW-E (Minor)** — clean up an override keyed on the old token on the map path;
   drop `rememberedAliasToken`'s unused `disambiguations` parameter.
5. **Minor copy** — let `Return to standalone` name the mapping it will drop, so the honesty is
   pre-hoc as well as post-hoc.

Verified but could **NOT** falsify (recorded as gaps, not as coverage):

- **The single-map guarantee between the provider and `aliasRepo`.** Nothing fails if
  `ExerciseNormalizationProvider.tsx:50` is pointed at a different map; I did not mutate it,
  because the provider is outside my lane. Argued airtight from four call sites, not measured.
- **The fixed-point property** (NEW-B). 0/54,902 measured, 0 tests asserting it.
- **`ExerciseCorrectionSheet.tsx:146-153`'s radio-`name` claim** — still unfalsifiable in this
  harness (jsdom has no radio-group arrow traversal), still correctly said so in the comment.
  Keep it.
- **The `renderSheet` GC-pause flake** — needs the full suite; not reproduced, not cleared.
- **The e2e suite** — controller's gate; I did not run it. The `ERR_CONNECTION_REFUSED`
  attribution I judged sound on its signature and its serial re-run, not by re-running it.
