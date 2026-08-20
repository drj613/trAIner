# Task 15 — Final Whole-Feature Review

Status: IN PROGRESS (built incrementally; do not treat as final until the status line at the bottom is present)

HEAD: 1c8cbe4 · branch feat/exercise-catalog-normalization · base 4a1caa4 · range origin/master...HEAD

## Scratch log (raw verification, will be folded into sections)

### Verified: NUL byte / binary-file scare (Task 11) — DISPROVEN at HEAD
- `grep -rlIP '\x00' src/` → no matches.
- `git grep -I --name-only -e '' -- src/ | wc -l` = 243; `git ls-files src/ | wc -l` = 243. Every tracked file in src/ is text to git. No file was silently excluded from review.
- `file src/lib/catalog/groupCatalog.ts` → UTF-8 text. `git diff --numstat origin/master...HEAD` reports `203 0` (real line counts), not `-  -` (binary). Clean.

### Verified: data-safety invariants at HEAD
- Unique indexes: exactly one, `aliases.createIndex("by-normalized-alias", "normalizedAlias", { unique: true })` at src/lib/storage/appDb.ts:120. No other `{ unique: true }` in production code.
- `IDBObjectStore.add()`: none in src/. Every `.add(` hit is `Set.add`/`Map.add` on in-memory collections (verified all 18 sites). All IDB writes are `put`, which is idempotent — this is what prevents the ConstraintError class of bricking.
- `putRaw`: defined at src/lib/storage/aliasRepo.ts:51/128; called only from tests. Zero production callers, as the ledger states.

### Verified: Task 14 audit completeness sweep FIRES (mutation-tested)
Baseline: `npx jest src/components/app/ExerciseIdentityAudit.test.ts` → 26 passed.

**Mutation A (positive control).** Added `src/lib/analysis/zzMutationProbeA.ts` importing `exerciseCatalog` and calling `.find`, with no audit-table row.
Result: `covers every runtime catalogue reader in src/` FAILED, naming the new file. Totals 26 (1 failed / 25 passed) = baseline, so no silent load failure. Probe deleted; `git status --porcelain` empty.
**The sweep is real. It detects its own gaps for the shape it is designed to detect.**

**Mutation B (the hole).** Added `src/lib/analysis/zzMutationProbeB.ts` importing `@/lib/catalog/exercises.generated.json` DIRECTLY (bypassing `exercises.ts`) and calling `.find` on it.
Result: **26 passed, sweep did NOT fire.** Probe deleted; `git status --porcelain` empty.

Cause: the completeness detector is `const CATALOG_REFERENCE = /\bexerciseCatalog\b|\bcatalogIndex\b/` (ExerciseIdentityAudit.test.ts:62). It is keyed on two *identifier names*, not on the catalogue *data module*. A new surface that imports the generated JSON directly mentions neither token and is invisible to the audit.

Blast radius today: latent, not live. Only `src/lib/catalog/exercises.ts` imports `exercises.generated.json`. Related observation: `src/lib/catalog/registries.ts` imports four generated artifacts (movements/modifiers/legacyRedirects/importDisambiguations) directly and carries no audit row — arguably out of the audit's stated scope ("the generated catalogue"), but it is identity-relevant data that the sweep cannot see.

**Mutation C.** Appended `canonicalExerciseId ?? exerciseId` to `src/lib/workout/historyProjection.ts`.
Result: `finds no history or analysis surface grouping by canonicalExerciseId ?? exerciseId` FAILED. Totals 26. Restored; `git diff --quiet` clean.

**Mutation D.** Renamed every `projectExerciseHistory` to `projectExerciseHistoryRenamed` in `src/components/workout/HistoryClient.tsx` (i.e. the surface stops routing through the shared projector).
Result: the `HistoryClient.tsx — resolver` row FAILED. Totals 26. Restored; `git diff --quiet` clean.
This kills the specific historical weakness the test's own comment describes (an earlier form accepted "any marker present" and stayed green through this rename).

**Verdict on the audit:** 3 of 4 sweeps mutation-proven live. One narrow, latent detector gap (Mutation B). The audit is trustworthy for what downstream depends on it for.

### Verified: UI in the 95%-standalone majority case
Delegated a full read of NestedExerciseList / LibraryClient / both pickers / correction sheet / groupCatalog against PRODUCT.md, DESIGN.md and the density-over-inflation preference. Findings:
- Standalone entries mount **no** family wrapper, no dead chevron, no "0 versions" badge. `GroupRows` (LibraryClient.tsx:639-650) returns `FamilyRow` only when `!group.standalone`; NestedExerciseList.tsx:250-271 does the same. Asserted by `data-standalone="true"` (LibraryClient.test.tsx:539) and by a test that the family-row control is absent for standalone (line 537).
- Zero extra wrapper nodes and zero extra indentation for the 95.5%. The indent tax (`paddingLeft` 28px vs 12px in LibraryClient.tsx:422; 20 vs 0 in NestedExerciseList.tsx:112-118) is paid only by nested children. The family feature adds no per-row cost to the majority case.
- `Needs review` is derived from **user data only** — `deriveNeedsReview` (LibraryClient.tsx:160-213) consumes `programCandidates(programs)`, `logCandidates(logs)`, `customCandidates(context.userExercises)` and never iterates `exerciseCatalog`. The 95.5% unassigned bundled catalogue does NOT flood it. It also ships collapsed with a capped 10-row preview, and the author's comment at LibraryClient.tsx:215-220 reasons explicitly about the 142/3,175 ratio.
- A family row is navigation, never a choice: its `onClick` only toggles open state and there is no code path from it to `onSelectVersion`/`onAdd`. It renders no check/radio glyph, unlike `VersionRow`. Tested at LibraryClient.test.tsx:506-517.
- No `role=tree`/`treeitem` misuse; no `aria-expanded` on a childless family node (FamilyRow only mounts for groups with >=1 version).

No P0 or P1 in the UI. Two cosmetic P2s: `compareGroups` (groupCatalog.ts:93-100) front-loads family rows before the alphabetical standalone list within a muscle category; and `aria-expanded` carries no `aria-controls` on the disclosure buttons.

### Verified: SettingsClient.test.tsx harness change did not weaken any assertion
Full diff is 16 added / 15 removed: one `import { LocalDataProvider }` line, and 15 `render(<MemoryRouter><SettingsClient /></MemoryRouter>)` lines rewritten to wrap in `<LocalDataProvider>`. **Zero assertion lines appear in the diff** — filtering the diff for `expect|toBe|toHave|toEqual|getBy|queryBy|findBy|waitFor` returns nothing. Claim confirmed exactly as reported.

### Verified: task-14a M4 (`void` vs `await`) — agree it does not matter
Clarification: M4 was a surviving **mutant**, not shipped code. HEAD has `await refreshLocalData();` (SettingsClient.tsx:195).
The ruling is correct. `void` would still start the refresh in the same microtask; it only loses sequencing before `setStats` and error containment inside the handler's `try`. No user input can arrive in that window, so no UI-driving test can separate them.

Crucially, the mutation that *is* load-bearing dies. I ran it myself:
**M2 re-run.** Replaced `await refreshLocalData();` with a comment (refresh removed entirely) in SettingsClient.tsx.
Result: `RestoreRefreshesLocalData.test.tsx` — **2 failed / 16 passed / 18 total**. Restored; `git diff --quiet` clean.
This is the exact data-loss scenario documented at SettingsClient.tsx:181-190 — the provider holds pre-restore programs, and the next `saveProgram` writes them back over the restored ones under the same id. That behaviour is genuinely pinned. M4 is a no-action item.

### Verified: `entry.exerciseName` non-string sweep is now COMPLETE
Premise confirmed: `restoreBackup` (backup.ts:234-301) validates only `programId`/`dayId`/`performedAt` on `logs[]`; `entries` is deliberately passed through unvalidated (`requireFields` at line 289). So any field of a log entry can be any type after restoring a hand-edited file.

Re-swept every non-test read of `exerciseName` in `src/`. **Every one funnels through one of three guards before any string operation:**
- `textOf(...)` — stringifies anything (LibraryClient.tsx:101; historyProjection.ts:347-349; historyCorrection.ts:37,40)
- `readableText` / `entryPerformedName` — string-or-undefined (historyUtils.ts:162; historyProjection.ts:182,315)
- `readableName(input.performedName)` inside `resolveExerciseIdentity` (identity.ts:190,226,255,284,385,398,403,409)
- plus an explicit early return in `migrateLogEntry`: `if (!isReadableText(entry.exerciseName) || !isReadableText(entry.exerciseId)) return entry;` (v10Identity.ts:250)

Also spot-checked the other unvalidated entry fields: `exerciseId` is `typeof === "string"`-gated in `entryIsFullyHydratable` (sessionState.ts:103) before being used as an object key; `sets`/`notes` are read only through `readableSets`/`entryNote`/`entryHasHistoryData`, all of which do `Array.isArray`/`isRecordLike`/`typeof` checks first.
**No RISKY site found.** The sweep the earlier reviewer twice found incomplete is now complete for `WorkoutLogEntry`.


### Verified: cross-task seam — "Remember this interpretation" vs the `or` rule (FALSE ALARM, seam is closed)
I chased this hard because it is the exact shape of a cross-lane disagreement. Mechanism looked damning:
- `rememberedAliasToken` (aliasRepo.ts:35-40) derives the stored token via `prepareImportName`, which **strips** the `or` phrase. I measured it: `"assisted or bodyweight neutral-grip pull-up"` stores under `"assisted bodyweight neutral grip pull up"`.
- `resolveName` (identity.ts:315-316) short-circuits `if (prepared.hasAlternative) return standaloneResult(...)` **before** the saved-alias lookup at line 318.

I wrote a throwaway test asserting a remembered alias for an `or` name resolves back. It FAILED: `source = standalone`, not `saved-alias`. So an alias stored under that token is permanently unreadable.

**But production can never create that alias.** `unrememberableReason` (resolution.ts:49-58) checks `prepared.hasAlternative` first and returns an explanatory string, which:
- disables the Remember checkbox in the UI (ResolutionStep.tsx:361-362) and renders the reason (line 392-395), and
- makes `buildRememberedAliases` skip the item outright (`if (unrememberableReason(item.rawName) !== undefined) continue;`, resolution.ts:247).

My probe hand-wrote a row production will not write. **Not a defect — the seam is closed at both the UI and persistence layers, with honest user-facing copy.** Recording the negative result so nobody re-opens it. Probe deleted; tree clean.

### Verified: spec-mandated structure is all present
- The exact dated note exists, once: `src/lib/catalog/identity.ts:300` — `// TODO(2026-09-30): remove legacy exercise ID redirects after the compatibility window.`
- All 11 spec-named curation inputs exist under `scripts/catalog-normalization/` (snapshot, sha256, movements, modifiers, merges, assignments, alias-classifications, disambiguations, variant-rules, reviews/variant-candidates, reviews/variant-adversarial-review).
- All 6 spec-named outputs exist (5 generated JSONs + `reports/catalog-normalization-report.json`).
- `catalog:build` invokes the offline compiler; `catalog:check` is the offline verifier; live fetch is quarantined as `catalog:ingest-sources` writing only to `staging/`. Matches the spec exactly.
- `DB_VERSION = 10` (appDb.ts:27); backup exports `version: 2` (backup.ts:153) and reads overrides only when `b.version === 2` (line 399).

### Verified/corrected: the headline numbers
| Claim | Verified | Note |
|---|---|---|
| 3,175 entries, 142 assigned (4.5%) | **CONFIRMED** | 142/3175 = 4.47% |
| `merges.json` zero records | **CONFIRMED** | `{"schemaVersion":1,"records":[]}` |
| `legacyRedirects.generated.json` zero records | **CONFIRMED** | follows from zero merges |
| 6 of 22 disambiguation candidates have `movementId: null` | **CONFIRMED EXACTLY** | see below |
| `or` rule leaves 4 entries unreachable by canonical name | **CONFIRMED** | the 4 named below |
| Tier-1 cap of 300 | **RESPECTED** | 142 approved rules; 161 proposed / 19 rejected |
| `barbell-back-squat` + 3 siblings | **CORRECTED — it is 5, and the mechanism is inverted** | see Finding N2 |

On the 6-of-22: this required resolving `candidateExerciseIds` across the 10 `underspecified-name` rules against the catalogue — 38 refs, **22 distinct**, of which **6** have null `movementId`: `lateral-raise-with-bands`, `dumbbell-shoulder-press`, `cable-shoulder-press`, `shoulder-press-with-bands`, `bulgarian-split-squat`, `dumbbell-split-squat`. The ledger's figure is exactly right. (A first pass of mine miscounted by reading the 20 top-level *records* instead of the distinct candidates — noting it because the same mistake would make the ledger look wrong.)

The 4 `or`-unreachable entries: `front-cone-hops-or-hurdle-hops`, `march-or-jog-in-place`, `neutral-grip-pull-ups-or-trx-rows`, `zone-2-bike-row-or-incline-walk`.


---

# VERDICT

## 1. Whole-feature spec compliance

**Compliant. The machinery the spec describes was built, and built well. What is thin is the curation data poured into it.**

Every structural promise is delivered: the two registries, the `movementId`/`movementModifierIds` shape on catalogue entries, the single typed resolver with the spec's exact input discriminants and precedence order, the provider + versioned hook + single refresh event, the normalization-override store with the deterministic `${targetKind}:${normalizedTargetValue}` key, the offline compiler with its staged pipeline and quarantined live-fetch, DB v10, backup v2, the grouped import disambiguation flow, nested selection surfaces, and shared family-history aggregation.

Two things worth stating plainly about the *union*, which no per-task review was positioned to say:

**(a) 4.5% assignment does not violate the spec.** The spec sets a *ceiling* ("no more than 300 reviewed concrete variants"), never a floor, and it explicitly instructs that "Catalogue entries whose family cannot be assigned safely remain standalone rather than being forced into a misleading family." 142 assigned entries is inside the letter and the spirit. It is under-*delivery* against the ambition, not non-compliance.

**(b) The one genuine under-delivery is deduplication.** The spec devotes a whole stage to it — merge exact/high-confidence duplicates, prefer curated survivors, flatten chains. `merges.json` ships with zero records, so that stage ran and did nothing. `reports/catalog-normalization-report.json` carries 65 near-duplicate pairs at `review-required` (e.g. `barbell-back-squat <-> barbell-hack-squat` at 0.944, plus obvious singular/plural pairs like `front-squat <-> front-squats`, `hack-squat <-> hack-squats`). The compiler correctly refuses to merge these on its own — the spec forbids fuzzy auto-merge — but the reviewed curation that was supposed to follow was not done. Zero redirects is a consequence, not an independent gap: nothing was removed, so nothing needs redirecting.

No problematic over-delivery. The prompt builder and routine JSON schema are untouched, as the spec requires.

## 2. Cross-task seam findings

I probed the seams where lanes could disagree and found them **held**:

- **Remember-alias vs the `or` rule** (Task 8 curation vs Task 9/10 alias persistence) — looked broken, is closed at both the UI and persistence layers. Full negative result recorded above. This is the single most impressive thing I found: two lanes that could not see each other nonetheless agreed on a non-obvious rule, and the agreement is enforced in two places with matching user-facing copy.
- **One rule, two encodings** — `unrememberableReason`, `rememberedAliasToken`, and the resolver all route through the *same* `prepareImportName`. There is no second opinion to drift.
- **Resolver precedence vs the disambiguation rules** (Task 5 vs Task 8) — the spec demands the underspecified rule beat exact-name matching. identity.ts checks disambiguation at line 340-346 and canonical-name match only at line 348. Correct ordering, and it is the *opposite* of what the ledger's Task-14 note assumes (see N2).
- **One dispatcher, one listener** for `trainer-exercise-identity-changed` — pinned by a test I mutation-verified.

## 3. The deferral set, judged as a set

**Acceptable together — because they are not six deferrals, they are one deferral wearing six hats.**

4.5% assigned, zero merges, zero redirects, 5 shadowed entries, 6 null-movement candidates, 4 `or`-unreachable names: every one of these is the same root cause — **catalogue curation depth was not completed**. Judged as a set that is *better* news than six independent gaps, because it is one bounded, resumable workstream with all its inputs checked in, not a scattering of unrelated rot.

The question that decides it is whether thin curation causes **harm** or merely **absence of benefit**. I checked, and it is absence of benefit:

- The resolver's fallback for an unassigned entry is `standalone`, keyed on the concrete id — which is exactly what `master` does today.
- The UI renders a standalone entry as a plain dense row with no family chrome (verified below).
- History for an unassigned entry groups by concrete id — again, master's behavior.

So for 95.5% of the catalogue the app behaves as it does today, and for 4.5% it behaves better, and the user has a working correction surface to move entries into families themselves. **That is a safe, purely additive release.** It stops being acceptable only if someone reads "exercise catalogue normalization — shipped" as "the catalogue is normalized." Hence the disclosure requirement in the status line.

The two non-curation deferrals are both fine: the hand-edited-backup purge (self-inflicted population, only machine-created `legacy-auto` shortcuts are ever lost, never a user's own `remembered` correction), and `putRaw` with no production callers (verified — it is restore-classifier machinery, and its safety argument is literally "nothing in `src/` calls it," which I confirmed).

## 4. Data safety — the strongest part of the branch

**No remaining defect in the class that produced the six bugs this branch fixed.** Re-confirmed at HEAD:

- `by-normalized-alias` is the **only** unique index in production code (appDb.ts:120). Unique indexes are what turn a recoverable write into a `ConstraintError` that bricks the upgrade.
- **Zero** `IDBObjectStore.add()` in `src/`. All 18 `.add(` hits are in-memory `Set`/`Map`. Every IDB write is `put` — idempotent, so a re-run cannot fail on a row it already wrote.
- Unreadable content is never grounds for deletion except aliases, where deletion is the spec's deliberate instruction (line 357) and was upheld against a Codex recommendation to quarantine instead.
- The `entry.exerciseName` non-string sweep is **now complete** — every non-test read funnels through `textOf`, `readableText`/`entryPerformedName`, or `readableName` inside the resolver, and the other unvalidated entry fields (`exerciseId`, `sets`, `notes`) are each guarded at their point of use. This is the sweep a reviewer twice found incomplete; I could not find a hole in it.
- The post-restore refresh — the fix for "a restore that let the next save overwrite the recovered data" — is genuinely pinned. I re-ran the deletion mutation myself: 2 tests fail.

One adjacent observation, deliberately *not* raised to P1: `ProgramExercise.name` inside `program.days` is not deep-validated on restore either, the same shape as the `logs[].entries` gap. Its consumers are guarded at point of use, so nothing breaks today. Follow-up, not a blocker.

## 5. UI in the 95%-standalone case

**Reads well. The majority case was designed for, not overlooked.**

The team did not test only on squat. `LibraryClient.tsx:215-220` contains a comment reasoning explicitly about the 142/3,175 ratio and choosing to collapse `Needs review` behind a count precisely so the Library does not "read as a report on the catalogue's incompleteness." That is the exact failure mode this review was sent to look for, already anticipated.

Concretely: standalone entries mount **no** family wrapper, no dead chevron, no "0 versions" badge; the indent tax is paid only by nested children; `Needs review` is derived from user data only (`programCandidates`/`logCandidates`/`customCandidates` — it never iterates `exerciseCatalog`), so the 95.5% cannot flood it; and a family row is navigation-only with no path to selection. Density preserved — list rows, not cards. No P0 or P1.

Also relevant to the nesting judgement: **there are no families of one.** All 12 movements have ≥7 assigned entries (smallest `loaded-carry` at 7, largest `deadlift-hinge` at 16). Where nesting appears, it earns its keep.

## 6. Findings

### P0 (must fix before push)
**None.**

### P1 (must fix before merge)
**None.** I looked hard for one and the only candidate I found — the Remember/`or` seam — disproved itself.

### P2 (file as follow-up)

**N1 — the audit's completeness detector is blind to direct generated-JSON imports.** *(NEW, proven by Mutation B.)* `CATALOG_REFERENCE` keys on the identifiers `exerciseCatalog`/`catalogIndex`, so a new module importing `exercises.generated.json` directly is invisible to the sweep. Latent today (only `exercises.ts` imports it), and `registries.ts` reads four generated artifacts with no audit row. One-line fix: add the artifact filenames to the detector. Worth doing because everything downstream trusts this audit.

**N2 — 5 catalogue entries are shadowed by their own disambiguation rule, and the ledger has this backwards.** *(NEW.)* `barbell-back-squat`, `squats`, `row`, `lateral-raises`, `split-squats` each have a canonical name that normalizes to an `underspecified-name` rule, and **none of them appears in its own rule's `candidateExerciseIds`**. The ledger records this as 4 entries that "match exactly by name, bypassing the disambiguation flow." Both halves are wrong: it is 5, and the resolver checks disambiguation *before* canonical-name match (identity.ts:340 vs 348), so the rule shadows the entry rather than the entry bypassing the rule. Net effect is the same severity — those 5 are unreachable by their own name and have `movementId: null` — but a follow-up written from the ledger's description would look in the wrong place. No data loss: existing logs referencing them resolve by direct id, not by name.

**N3 — deduplication curation was never done.** 65 near-duplicate pairs sit at `review-required` in the report, including trivially safe singular/plural pairs. This is the spec stage with the largest gap between machinery and data.

**N4 — `compareGroups` (groupCatalog.ts:93-100)** sorts all family rows ahead of the alphabetical standalone list within a muscle category. Minor scanning surprise at 4.5% assignment.

**N5 — `aria-expanded` without `aria-controls`** on the disclosure buttons in `LibraryClient.tsx` (416, 599) and `NestedExerciseList.tsx` (191). Optional per ARIA, cheap to add.

## 7. What I verified but could not falsify

Recorded so nobody mistakes these for unexamined:

- **The `or`-rule / Remember-alias seam.** Actively tried to break it, wrote a failing test, then found production cannot reach the state my test constructed. Closed at two layers.
- **The audit's three other sweeps.** Mutations A, C and D each died. Only the Mutation-B detector shape survives.
- **The `void` vs `await` post-restore refresh (M4).** Unfalsifiable in this harness for the reason the report gives — the refresh starts in the same microtask either way and no user input can arrive in the window. The mutation that matters (removing the refresh) dies.
- **Compiler `normalizeToken` vs runtime `normalizeExerciseName` fixed-point equivalence.** Still empirical only, as the ledger discloses. No test can prove the compiler calls the runtime rule; it is confirmed by reading the import. I did not improve on this.
- **Real-browser `structuredClone` / IndexedDB write-ordering divergence.** Unreachable in jest + fake-indexeddb, and the e2e suite does not exercise migration. Permanently unverifiable in CI; correctly published rather than falsely claimed.
- **The 4.5% figure as a *risk*.** I tried to find a case where thin assignment makes the app *worse* than master rather than merely not better, and could not. Standalone is the safe default in the resolver, the UI, and history alike.

## 8. Recommendation

Push it. The branch is in better shape than its own ledger suggests — the ledger is harder on itself than the code deserves, and two of the gaps it publishes are either already closed (the `or`/Remember seam) or mischaracterised in a way that overstates the mechanism (N2).

One thing must travel with it: **the PR description has to state that the catalogue ships 142 of 3,175 entries assigned (4.5%), that `merges.json` and `legacyRedirects.generated.json` are intentionally empty, and that the redirect machinery is therefore inert.** The deferral set is acceptable *because* it is disclosed. Shipping it silently is the one way to convert an honest partial delivery into a misleading one.

None of the five P2s should hold the push. N1 is the one I would do first, because an audit that cannot see its own blind spot is the artifact everything else trusts.

---

**CHANGES REQUESTED:** no.

**APPROVED FOR PUSH**

Conditions attached (none blocking the push itself):
1. PR description discloses the 4.5% assignment, the empty `merges.json`/`legacyRedirects.generated.json`, and the inert redirect machinery.
2. File N1–N5 as follow-ups. Recommend N1 first.
3. Correct the ledger's `barbell-back-squat` entry: it is 5 entries, not 4, and the mechanism is rule-shadowing, not name-bypass.

Verified but not falsifiable, listed in section 7.
