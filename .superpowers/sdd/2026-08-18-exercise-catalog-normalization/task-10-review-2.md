# Task 10 — fix-round review (round 2)

Reviewed at HEAD `9089f16`; code under review is `188aa5b`. Lane: `src/components/catalog/**` only.
Baseline: `bun run test -- --runInBand src/components/catalog` → **25 passed, 25 total** (16 sheet + 9 library).
Every mutation below was applied to the shipped file, run, restored from a pre-mutation copy, and `shasum`-verified:
`ExerciseCorrectionSheet.tsx 36f3f43…`, `LibraryClient.tsx 8d93be4…`, `ExerciseCorrectionSheet.test.tsx 25f787e…`, `LibraryClient.test.tsx f7f07e1…` — all four matching after every restore, and `git status` clean for the lane at the end.

---

## Per-item verdicts

### C1 — undefined border token — **FIXED, verified**

`--line-2` is the right token, not a judgement call: `globals.css:14,35,56,78,99,120` defines it in all six theme blocks, and the first-theme value `#353c46` is exactly what `DESIGN.md:11` records as `line-strong`. No new token, no `var(--line-strong, var(--line))` downgrade. Correct.

**The scan test is genuine**, and I checked all three things asked:

- *Does it parse both files?* Yes — `ExerciseCorrectionSheet.test.tsx:257` iterates both filenames and reads each with `readFileSync`.
- *Would it catch a newly-introduced undefined token?* Yes, **and in the other file**, which the report did not demonstrate. Mutation **R2** — `LibraryClient.tsx:303` `color: "var(--fg-3)"` → `var(--fg-quiet)` — gives **1 failed / 24 passed**, killed by `only uses theme tokens that globals.css actually defines`. The guard is not pinned to the sheet.
- *Is the canary real?* Yes. Mutation **R3** — the test's own scan list `["ExerciseCorrectionSheet.tsx", "LibraryClient.tsx"]` → `[] as string[]` — gives **1 failed / 24 passed** with `expect(used.size).toBeGreaterThan(5)` / `Received: 0`. A scan matching nothing cannot pass. The reverse direction is covered too: an empty `defined` set would fail the first assertion.
- Mutation **R1** (the original defect, `var(--line-2)` → `var(--line-strong)`) — **1 failed / 24 passed**, same test. Matches the report's F1.

Two residual limits, both **Minor**, neither worth blocking: the file list is hardcoded, so a third file added to `src/components/catalog/` is unscanned; and a token name assembled by concatenation (`` `var(--line-${n})` ``) slips the regex. Say so in the test comment if you touch it; do not build machinery for it.

### C2 — the correction that lied — **FIXED for the alias case, but the same lie class survives elsewhere. See NEW-1 (Critical).**

The alias half is real and well covered:

| # | Exact mutation | Result |
|---|---|---|
| R4 | `ExerciseCorrectionSheet.tsx:286` `if (governingAliases.length > 0 && input.movementId !== null) {` → `if (false) {` | 1 failed / 24 passed — `refuses to assign a movement while an alias governs the name` |
| R5 | deleted lines 295-297 (the whole `aliasRepo.removeMany(...)` block) | 1 failed / 24 passed — `returns an alias-governed name to standalone by dropping the alias` |
| R6 | line 304 `if (target.kind === "normalized-name" && (await aliasRepo.find(target.value))) {` → `if (false) {` | 1 failed / 24 passed — `reports failure when the alias survives the clearing write` |

All three reproduce the report's F2/F3/F4 exactly. The clearing test's canary (`resolveStoredName` before the correction, `ExerciseCorrectionSheet.test.tsx:298`) is the right shape — it proves the alias really governed the name first, so the test cannot pass by never reaching the code.

Two things the fix round did **not** pin, both new:

- **NEW-2 (Important)** — the write *order* is unpinned and is the less safe of the two options. See below.
- **NEW-4 (Minor)** — the standalone path's single-event property is untested. Mutation **R8** (`removeMany(ids, { dispatch: false })` → `removeMany(ids)`, line 296) leaves **25 passed / 25**. The report's F6 only covers the two alias writes on the *map* path (I reproduced that as **R16**: `{ dispatch: false }` stripped from lines 341-342 → **2 failed / 23 passed**).

### I1 — `Needs review` collapsed and capped — **FIXED, verified, and it matches the density preference**

| # | Exact mutation | Result |
|---|---|---|
| R9 | `NeedsReviewSection`'s `const [open, setOpen] = useState(false)` → `useState(true)` | 7 failed / 18 passed (blunt, as reported; the precise kill is `keeps the review list collapsed behind its count`) |
| R10 | `items.slice(0, NEEDS_REVIEW_PREVIEW)` → `items` | 1 failed / 24 passed — `caps the open list and reveals the rest on request` |

On the UI standards: the header button is byte-for-byte the same geometry as the existing `CategorySection` header in the same file (`padding: "9px 12px"`, `flex` row, count in mono at 10px, chevron) — so the Library has one disclosure vocabulary and the row was **not** inflated. The `+N more` is a list row at mono 10.5px in `--fg-3`, not a card or a button-looking control. Hit area comes from `className="tap-target"`, which `globals.css:544-557` implements as a `::after` pseudo-element sized `max(100%, var(--tap))` — pseudo-element hit area, no padding inflation. This is the correct reading of the standing preference.

Two **Minor** notes: neither the section header nor the row toggles carry `aria-expanded`, so a screen-reader user hears "needs review 3, button" with no state. That is consistent with the pre-existing `CategorySection`, so it is not a regression introduced here — but this is the pattern Tasks 11 and 13 are told to copy, so it is cheaper to add now than to fix in three places later. Also `showAll` is never reset when the section collapses, so a user who expanded to 15 rows gets 15 again on reopen; trivial, mention only.

### I2 — memoised resolution — **FIXED; the key is provably complete for what the function reads**

I checked the claim at source rather than taking it. In `identity.ts`, `slotId` and the raw `performedName` text feed **only** `groupKey` (`:178` `slot:${input.slotId}`), `displayLabel` (`:171`), and the echoed `performedName` field (`:157`, `:191`, `:220`, `:249`). The three fields `deriveNeedsReview` actually reads — `identity.movementId`, `identity.source`, `identity.concreteExerciseId` — depend only on `(kind, canonicalExerciseId, prepared name)`, and `prepareImportName` operates on `normalizeExerciseName(name)`, so two raw spellings with the same normalized form always resolve identically. The key is sound, and keying custom exercises on `exerciseId` is right (`identity.ts:355` resolves them by id).

| # | Exact mutation | Result |
|---|---|---|
| R11 | `if (!outcomes.has(cacheKey)) {` → `if (true) {` | 1 failed / 24 passed — `resolves each distinct identity once` (4 resolves, 2 expected) |
| R12 | custom key `` `custom:${candidate.input.exerciseId}` `` → `` `custom:${normalizeExerciseName(candidate.rawName)}` `` | 1 failed / 24 passed — `does not collapse two custom exercises that share a name` |
| R14 | `` :${normalizeExerciseName(candidate.rawName)} `` → `` :${candidate.rawName} `` (under-collapse) | 1 failed / 24 passed — `resolves each distinct identity once` |
| **R13** | dropped `canonicalExerciseId` from the key: `` `${kind}:${canonicalExerciseId}:${normalizeExerciseName(rawName)}` `` → `` `${kind}:${normalizeExerciseName(rawName)}` `` | **25 passed / 25 — SURVIVES** |

R13 is **NEW-3 (Important, test gap not a code bug)**: the shipped key is correct, but the exact over-collapse the controller asked me to hunt is unpinned. Two log entries with the same `exerciseName` and different `canonicalExerciseId` — the realistic shape, since `v10Identity` backfills that field only for exact matches, so a name can appear both backfilled and not — would share a cache entry, and the second would silently inherit the first's outcome. That is a dropped or mis-listed review row with no failing test anywhere. One fixture fixes it.

### I3 — radio-`name` rationale — **FIXED, and the negative result is genuinely in the comment**

`ExerciseCorrectionSheet.tsx:137-147` now says the id collision makes both labels resolve to the first control (falsifiable) and that the shared `name` merges the two sheets into one keyboard radio group, then states plainly: *"jsdom implements no radio-group arrow traversal, so that half is correct but unfalsifiable in this harness."* That satisfies the standing rule for keeping something no mutation kills, so F8's survival is legitimately recorded as a guarantee rather than claimed as coverage. The implementer was right to concede the `updateNamedCousins` point; my predecessor's correction was right and is now reflected accurately.

### Minors

- **M1** — accepted. A 13-line `main.tsx` with a regex that catches removal of either the import or the wrapper is proportionate, and the provider's own suite owns runtime behaviour. Recorded as measured, not assumed. Closed.
- **M2** — accepted, not taken. Correct call for React 19.
- **M3** — the placement is **right**. Details under controller question 2.
- **M4** — taken and verified. Mutation **R15**: `if (!query) return [];` (`ExerciseCorrectionSheet.tsx:191`) commented out → **1 failed / 24 passed**, `lists no versions until the filter narrows them, then caps the list`. The placeholder now distinguishes `filter to choose a version…` from `choose a version…`, which is the honest version of the control.
- **M5** — deferred to Task 11 as ruled. No objection.

---

## Answers to the six controller questions

**1. Is refusing right? Is the message actionable? Are both routes reachable?**

Refusing is right, and the spec says so almost in these words. Spec ~455 already establishes the same policy one layer down: *"If a different remembered alias already occupies the normalized token, import save rejects the overwrite and directs the user to the correction surface to remove or replace the old mapping deliberately. `aliasRepo.save` never silently changes an existing token to a different target."* The correction surface is designated as the place where an existing mapping is given up **deliberately**; silently destroying it to honour an unrelated click would make the sheet the one place in the app that does the thing the import path is explicitly forbidden from doing. `PRODUCT.md`'s "no friction between intent and logging" is about not standing between the user and *recording what they did* — it is not a licence to guess which of two mappings they meant to discard.

The message is actionable and both routes it names are reachable **from that same sheet without closing it**: `Return to standalone` is the always-rendered button at `:549`, and "replace the mapping" is the `Map to an existing exercise` radio at `:405` plus the `Replace the existing mapping` checkbox at `:515`. So it does tell the user what to do next. One **Minor** copy note: "replace the mapping" does not name the control, and the user has to guess that the Map radio is where replacement lives. `Return it to standalone, or use “Map to an existing exercise” to replace the mapping, before assigning a movement.` costs nothing.

**2. The M3 placement — settled: the implementer is right. Stop asking.**

Spec ~176 is unambiguous: *"`movementId: null` explicitly clears a bad assignment and returns the target to standalone; null requires an empty modifier list."* A stored row with `movementId: null` **is** the representation of standalone, and `normalizationOverrideRepo` treats it that way — `validateNormalizationOverrideInput` (`:161-166`) has an explicit accept branch for `movementId === null`, and `save` upserts it like any other row. Deleting the row on the standalone path would not mean "standalone"; it would mean "no opinion", and I verified that is a materially different answer: `resolveName` consults a `normalized-name` override only at `identity.ts:338-340`, *after* the legacy-name, catalogue-alias, and custom-name matches, so absence of a row lets a name fall back to whatever the catalogue happens to match. The null row is load-bearing.

The map path is the opposite case, and the same spec paragraph says why: *"Mapping an unknown name to an existing concrete catalogue version uses a `remembered` alias **instead of** duplicating concrete identity in this override store."* Once the alias exists it outranks the override permanently (`:283-298` before `:338-340`), so the row is unreachable, and shipping unreachable identity in every backup export is exactly the dead data the plan has been removing. Cleanup belongs where the dead row is produced. Correct as implemented; this is closed.

**3. Is the post-write verification falsifiable, or dead code?**

Falsifiable, and not only by injection — so it is not dead code and the F4 injection is legitimate. There is a natural path the report undersells: `governingAliases` is read from `context.aliases`, a snapshot that can be stale by the time the button is clicked. `aliasRepo.replaceRemembered` mints a **new** `crypto.randomUUID()` for the replacement row (`aliasRepo.ts:125`), so if another tab (or the import lane) replaces that alias between the provider's read and the click, `removeMany` deletes an id that no longer exists, the new row survives, and the check fires on a real user's real data. The test's `mockResolvedValue(undefined)` reproduces that end state faithfully. This belongs in the "unfalsifiable in this harness / falsifiable in production" column, not the dead-code column.

Optional strengthening (**Minor**, not required): the natural path is reproducible without a mock — save the alias, render, then `await aliasRepo.replaceRemembered(...)` to mint a new id, then click. That would replace an injection with the real mechanism.

**4. The I2 cache key — does it exclude anything the function reads?**

No. Proven at source (see I2 above): the three result fields the function reads are functions of `(kind, canonicalExerciseId, normalized name)` only; `slotId` reaches nothing but `groupKey`/`displayLabel`/`performedName`, and the displayed label comes from `candidate.rawName`, not from the cached result. There is no colon-collision risk either, since exercise ids are slugs and the `custom:` namespace is disjoint from `stored-exercise:`/`import-name:`. The label-sharing subtlety is benign: two spellings of one name share a cache entry, so the target keeps the first-seen raw text — which is what the un-cached version did too, because `items.get(key)` already kept the first label.

The gap is in the tests, not the key: **R13** proves the `canonicalExerciseId` half is unpinned (NEW-3).

**5. Data safety of the new delete path.**

Three separate findings, in descending order.

- **NEW-2 (Important) — the write order is backwards, and nothing pins it.** `writeOverride` deletes the alias *first* (`:296`) and writes the override *second* (`:298`). If the override write fails after the delete — `getDb()` rejecting, a `QuotaExceededError` on `tx.done`, a page closed between two awaits — the user is left with **neither**: the remembered mapping is gone and no `movementId: null` row was recorded, so the name falls back to whatever `resolveName`'s legacy-name matching produces. Worse, **no event fires at all** on that path (the `removeMany` is `{ dispatch: false }` and `save` throws before its dispatch), so the provider never reloads and the UI keeps showing a mapping that no longer exists in storage. Mutation **R7b** — swap the two statements so the override is written first and the alias deleted second — leaves **25 passed / 25**: the ordering is entirely unpinned. Reversing it is strictly safer, because a failed override write then leaves the alias intact and the existing `aliasRepo.find` check reports the failure honestly. To keep exactly one event, move the suppression rather than the dispatch:

  ```ts
  const suppress = governingAliases.length > 0;
  await normalizationOverrideRepo.save(input, suppress ? { dispatch: false } : undefined);
  if (suppress) await aliasRepo.removeMany(governingAliases.map((a) => a.id));
  ```
  (I measured the naive version of this — suppressing `save` unconditionally — as **R7: 5 failed / 20 passed**, because it kills the event on the ordinary no-alias path. The conditional form is required.)

- **NEW-5 (Minor) — the delete is unconfirmed and unannounced, while the *less* destructive action is confirmed.** Replacing an alias needs an explicit `Replace the existing mapping` tick (`:333`); destroying one needs a single click on a button labelled `Return to standalone`, and the success line reads only `Saved — returned to standalone.` The asymmetry is backwards. I do not think it needs a modal — but the sheet already knows the mapping it is about to discard, and saying so is one interpolation: `Saved — returned to standalone; the mapping to High Bar Back Squat was removed.` Reachability is currently narrow, which is why this is Minor rather than Important: an alias-governed name normally resolves concretely, so `targetFor` (`LibraryClient.tsx:104-109`) hands back a `catalog-exercise` target and this path is not entered. It is entered when the alias is dangling, when two rows share a token (`findUnique` returns `undefined`), or via the phrase-name case in NEW-1 — and `HistoryDrawer`, which another lane is wiring to this sheet, may widen it.

- No new unique index, no `IDBObjectStore.add()`, no rewrite of a record that was not read: the delete is by primary key on rows already read out of the snapshot, and `removeMany` (`aliasRepo.ts:136-144`) is a plain keyed `delete` in one transaction. Deleting an alias is also the one deletion the standards explicitly sanction ("unreadable *aliases* are dropped, because an alias is only a resolution shortcut"). On the write-rejection question: no write here can hit a `ConstraintError`, since `removeMany` only deletes and `normalizationOverrideRepo.save` puts on a non-indexed primary key. Those constraints hold.

**6. Exactly one event per path — confirmed, with one hole.**

| Path | Writes | Events |
|---|---|---|
| assign / standalone, no governing alias | `overrideRepo.save` | 1 |
| standalone, alias governing | `removeMany{dispatch:false}` + `save` | 1 |
| assign over a governing alias (refusal) | none | 0 — correct, nothing was written |
| map, token free | `alias.save{dispatch:false}` + `override.remove` | 1 |
| map, token occupied + confirmed | `replaceRemembered{dispatch:false}` + `override.remove` | 1 |
| map, no version chosen / unconfirmed | none | 0 — correct |

No path fires zero events after a successful write. I specifically checked the case the map path depends on — that `normalizationOverrideRepo.remove` still dispatches when the key does not exist, since that is the common case and a silent early return would make the whole map path fire zero. It does: `remove` (`:205-211`) has no early return, and a throwaway probe (`remove("normalized-name:nothing here")` on an empty database, event counter = 1) passed. The one hole is the mid-failure path in NEW-2: alias deleted, override write throws, zero events, stale UI over changed storage.

---

## NEW findings

### NEW-1 (Critical) — C2's lie class is still live for any name containing a non-identity phrase, and *both* correction actions are affected

`resolveName` looks up aliases and `normalized-name` overrides using `prepareImportName(name, disambiguations).normalizedName` — the **phrase-stripped** token. The sheet, `aliasRepo`, and `normalizationOverrideRepo` all key on plain `normalizeExerciseName(...)` — the **unstripped** token. Wherever those differ, every correction the sheet offers is stored under a key the resolver never reads, and the sheet reports success. `importDisambiguations.generated.json` currently ships five `strip` phrases (`competition`, `pain free` and three variants), four `paused-duration` phrases (`1/2/3/5 second paused`), and one `reject-alternative` phrase (`or`) — all of which appear in real LLM-generated routine names.

For `reject-alternative` it is worse still: `identity.ts:280` returns `standaloneResult` **before** the alias branch and before the override branch, unconditionally, so an `or` name can never be corrected by any means.

Measured with a throwaway probe (created in my lane, run, deleted; the lane files are `shasum`-verified unchanged):

| name | baseline | assign a movement → | map to a concrete version → |
|---|---|---|---|
| `Hatfield Squat or Lunge` | standalone, no movement → **appears in Needs review** | override id `normalized-name:hatfield squat or lunge`; resolver returns `movementId: undefined`, `source: standalone` | alias token `hatfield squat or lunge`; resolver returns `concreteExerciseId: undefined` |
| `3 second paused Hatfield Squat` | standalone, no movement → **appears in Needs review** | override id `normalized-name:3 second paused hatfield squat`; resolver returns `movementId: undefined` | resolver returns `concreteExerciseId: undefined` |

And end-to-end through the real UI (`LibraryClient` + provider + IndexedDB, one log entry named `3 second paused Hatfield Squat`): open `Needs review`, click the row, select `Squat`, click `Save correction`. The sheet renders **`Saved — Squat`**, storage holds `{"id":"normalized-name:3 second paused hatfield squat","movementId":"squat"}` — and the row **never leaves the review queue**, because `resolveName` looks for `normalized-name:hatfield squat`. The user can click Save forever and the queue will not shrink.

This is the same defect the controller classified Critical as C2: *reports success while the correction does not take effect*. C2 fixed the alias-shadowing instance; this instance is untouched, and it is reachable from the primary entry point without any hand-edited data.

The fix is a decision I should not make for you, so it needs a controller ruling between (at least):

- **(a)** key `normalized-name` targets and remembered aliases on the resolver's token — pass `prepareImportName(target.value, context.disambiguations).normalizedName` as the `targetValue`/`alias`, so the sheet writes the key the resolver reads. Cheapest, but it changes what `targetValue` means and the stored display text, and it still cannot help `reject-alternative` names, whose resolution ignores both stores.
- **(b)** refuse, in the same honest style as the C2 refusal: when `prepareImportName(value).normalizedName !== normalizeExerciseName(value)`, tell the user the name carries a prescription annotation and cannot be corrected as written. Preserves the "never lie" invariant with the least machinery.
- **(c)** exclude such names from `Needs review` entirely and handle them where the annotation is authored. Quietest, but it hides real unresolved history.

My recommendation is **(b) now** — the invariant that the sheet never claims a success it did not achieve is the one thing this task cannot ship without — with (a) considered as a follow-up if the controller wants these names correctable. Either way, `aliasRepo.find(target.value)` in the post-write check has the same unstripped/stripped mismatch and needs the same treatment. Note also that `governingAliases` (`:235-238`) uses the unstripped comparison, so it can both *miss* an alias that really governs (→ false success) and *report* one that does not (→ a refusal that blocks a correction for no reason).

### NEW-2 (Important) — write order on the alias-clearing path. Full detail under controller question 5.

### NEW-3 (Important, test gap) — the `canonicalExerciseId` half of the cache key is unpinned (R13 survives 25/25). Detail under I2.

### NEW-4 (Minor) — the standalone path's `{ dispatch: false }` is unpinned (R8 survives 25/25). One event-counter assertion on the clearing test closes it.

### NEW-5 (Minor) — the alias delete is unconfirmed and unannounced while the less destructive replace is confirmed. Detail under question 5.

---

## The async-assertion audit — verified, not trusted

The two self-disclosed flaws are genuinely fixed: `reports failure when the alias survives the clearing write` now waits on `await screen.findByRole("alert")` (`:335`) and `maps an unknown name…` waits on `await screen.findByRole("status")` before reading the event counter (`:151`). The status line is set only after both writes resolve, and `dispatchAfterWrite` fires inside `remove` before it returns, so the counter is read after the event by construction, not by luck.

I audited every assertion in both files that follows an async write and found none still sampling an in-flight handler. The negative spy assertions (`expect(overrideSave).not.toHaveBeenCalled()` at `:196`, `:214`, `:236`, `:287`) are safe by a different mechanism worth stating: a `jest.spyOn` records at *invocation*, not completion, so a broken guard that reached the repository would already have been recorded by the time `user.click` returns. And the second phase of `assigns and clears name-only targets` correctly waits on the status **text** changing (`:97`) rather than on the element appearing, since a status line is already on screen.

Measurements:

- 4 consecutive serial runs of the lane: **25/25** each.
- Every write-path test in isolation via `-t` (9 of them, including all six that assert after a write): **1 passed / 24 skipped** each. This is the run mode that caught the implementer's own two bugs, and it is clean now.
- 6 concurrent `--maxWorkers=24` runs of the lane: **25/25** all six.

I did **not** reproduce the one flake the implementer disclosed (`renderSheet`'s 1000ms wait for the loaded snapshot losing to a GC pause in an 87-second 104-suite serial run), because reproducing it requires the full suite, which is the controller's gate and not mine to run. I record that as unverified rather than resolved. The implementer's diagnosis is plausible and its handling was right — it disclosed the flake instead of raising the timeout, and no timeout was raised anywhere in this round (confirmed: the diff contains no timeout argument and no `configure({ asyncUtilTimeout })`).

---

## Mutation evidence — every count with its exact mutation

| # | Exact mutation | Result |
|---|---|---|
| R1 | `ExerciseCorrectionSheet.tsx` `border: "1px solid var(--line-2)"` → `var(--line-strong)` | 1 failed / 24 — `only uses theme tokens that globals.css actually defines` |
| R2 | `LibraryClient.tsx:303` `color: "var(--fg-3)"` → `var(--fg-quiet)` (new undefined token in the *other* file) | 1 failed / 24 — same test; proves the scan generalises |
| R3 | test's scan list `["ExerciseCorrectionSheet.tsx", "LibraryClient.tsx"]` → `[] as string[]` | 1 failed / 24 — canary `expect(used.size).toBeGreaterThan(5)`, `Received: 0` |
| R4 | line 286 `if (governingAliases.length > 0 && input.movementId !== null) {` → `if (false) {` | 1 failed / 24 — `refuses to assign a movement while an alias governs the name` |
| R5 | deleted lines 295-297, the `aliasRepo.removeMany(...)` block | 1 failed / 24 — `returns an alias-governed name to standalone by dropping the alias` |
| R6 | line 304 `if (target.kind === "normalized-name" && (await aliasRepo.find(target.value))) {` → `if (false) {` | 1 failed / 24 — `reports failure when the alias survives the clearing write` |
| R7 | order swapped **and** `save(input, { dispatch: false })` unconditionally | 5 failed / 20 — shows the naive reordering kills the event on the no-alias path |
| R7b | order swapped only (`save(input)` first, `removeMany(..., { dispatch: false })` second) | **25 passed / 25 — SURVIVES**; the write order is unpinned (NEW-2) |
| R8 | line 296 `removeMany(ids, { dispatch: false })` → `removeMany(ids)` (standalone path) | **25 passed / 25 — SURVIVES** (NEW-4) |
| R15 | line 191 `if (!query) return [];` → removed | 1 failed / 24 — `lists no versions until the filter narrows them, then caps the list` |
| R16 | lines 341-342, `{ dispatch: false }` stripped from `replaceRemembered` and `save` | 2 failed / 23 — `maps an unknown name…`, `replaces an occupied remembered alias…` |
| R9 | `NeedsReviewSection` `useState(false)` → `useState(true)` for `open` | 7 failed / 18 (blunt; precise kill `keeps the review list collapsed behind its count`) |
| R10 | `items.slice(0, NEEDS_REVIEW_PREVIEW)` → `items` | 1 failed / 24 — `caps the open list and reveals the rest on request` |
| R11 | `if (!outcomes.has(cacheKey)) {` → `if (true) {` | 1 failed / 24 — `resolves each distinct identity once` |
| R12 | custom key `` `custom:${input.exerciseId}` `` → `` `custom:${normalizeExerciseName(rawName)}` `` | 1 failed / 24 — `does not collapse two custom exercises that share a name` |
| R13 | `canonicalExerciseId` dropped from the stored-exercise cache key | **25 passed / 25 — SURVIVES** (NEW-3) |
| R14 | `` :${normalizeExerciseName(candidate.rawName)} `` → `` :${candidate.rawName} `` | 1 failed / 24 — `resolves each distinct identity once` |

Restores verified after every mutation: `ExerciseCorrectionSheet.tsx 36f3f43194c8b0558e34701631ea30e437665365`, `LibraryClient.tsx 8d93be412d65f9e731feaabef6895ce91891e15f`, `ExerciseCorrectionSheet.test.tsx 25f787e9578ca6cbbe35beccc2c137f32c779040`, `LibraryClient.test.tsx f7f07e13d63f25316e5bc5f840f06f1a3f8cd7cc`. Final `git status` shows no change in `src/components/catalog/`, and the lane suite is 25/25 on the restored tree. Three throwaway probe files were created in the lane and deleted (`__zzreview2.test.tsx`, `__zzevents.test.tsx`, `__zzhole.test.tsx`); nothing outside `src/components/catalog/**` was touched.

---

## Status

**CHANGES REQUESTED**

Must change:

1. **NEW-1 (Critical)** — stop the sheet claiming success for a `normalized-name` target whose phrase-stripped token differs from its plain normalized token, and for `reject-alternative` (`or`) names, where no store the sheet writes can ever be read. Needs a controller ruling between refusing (recommended) and re-keying; then apply the same treatment to the `aliasRepo.find` post-write check and to `governingAliases`, which share the mismatch.
2. **NEW-2 (Important)** — reverse the two writes on the alias-clearing path so the destructive delete is last, using the conditional-suppression form given above so exactly one event still fires on both paths, and add a test that pins the order (a rejected `overrideRepo.save` must leave the alias intact and report failure).
3. **NEW-3 (Important)** — add a `deriveNeedsReview` fixture with two candidates sharing a `rawName` and differing `canonicalExerciseId`, so R13 no longer survives.
4. **NEW-4, NEW-5 (Minor)** — pin the standalone path's single-event property with an event counter, and name the discarded mapping in the standalone success line.
5. **Minor copy** — name the `Map to an existing exercise` control in the refusal message.

Verified but could NOT falsify (recorded as gaps, not as coverage):

- `ExerciseCorrectionSheet.tsx:137-147`'s radio-`name` claim (report's F8). Unfalsifiable **in this harness** — jsdom implements no radio-group arrow traversal — and the comment says so, which is what the standing rule requires. Keep it.
- The write ordering on the alias-clearing path (R7b survives) — the reason it is finding NEW-2 rather than a note.
- The `canonicalExerciseId` half of the resolution cache key (R13 survives) — NEW-3.
- The standalone path's `{ dispatch: false }` (R8 survives) — NEW-4.
- The implementer's disclosed `renderSheet` GC-pause flake: not reproducible within my lane, and I did not run the full suite. Unverified, not cleared.

Overturned in the implementer's favour: the M3 placement (right, and settled by spec ~176 plus `validateNormalizationOverrideInput:161-166` — it should not be reopened), the C2 assign-refusal as a product decision (right, and directly supported by spec ~455), and the post-write verification's legitimacy (falsifiable in production via the stale-snapshot / new-UUID path, so not dead code). The C1, I1, I2, and I3 fixes are all correct and correctly tested.
