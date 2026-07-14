# Working-volume semantics and override diagnostics
## Final TDD implementation plan

## Objective
Correct false-positive routine analysis caused by treating ordinary warmups, activation drills, mobility work, rehabilitation work, and similar preparation as productive working volume. The implementation must: add an explicit exercise-level working-volume signal; preserve it through JSON import, backup, editing, swapping, and manual routine construction; apply one shared resolution rule across all set-based analyzers; distinguish total prescribed sets from productive working sets; continue counting all programmed activity toward exercise complexity and estimated duration; correct canonical muscle duplication within each tag tier; align unmatched-exercise warning paths with resolution paths; support unmatched-exercise resolution inside override replacement days; detect inert or ineffective overrides without blocking import; stop generated prompts from teaching models to emit no-op overrides; preserve local/permissive/diagnostic architecture; introduce every behavioral change through a failing test; keep every committed repository state type-safe, test-green, build-green.

## Product decisions
1. Add `countsTowardVolume?:boolean` to each program exercise.
2. Explicit values authoritative.
3. Section type is fallback for legacy/manual content, not authoritative.
4. Exact normalized modifiers may override section fallback for obvious prep.
5. All productive-set analyzers operate on same resolved working-exercise population.
6. Weekly muscle-volume ranges advisory.
7. Explicit athlete specialization may exceed ranges.
8. Warnings non-blocking.
9. `totalSets` = all prescribed sets.
10. Add `workingSets` = only sets contributing to working-volume analysis.
11. Exercise count includes all objects.
12. Duration uses all prescribed sets.
13. Only within-tier dup corrected.
14. Cross-tier additive unchanged.
15. AI tags primary instance source.
16. Catalog tags fallback/matching.
17. Swaps preserve slot volume role.
18. Injury fields user-omittable.
19. Circuit rounds out of scope.
20. Auto progression out of scope.
21. Imports permissive.
22. Override diagnostics warnings not rejection.
23. Existing routines re-grade dynamically.
24. Every commit passes typecheck/test/e2e/build.

## TDD operating rules
Per behavioral phase: smallest failing test → verify fails for expected reason → minimum production change → focused test green → related dir → complete gate → refactor only while green → commit only when fully green.

**Gate = `bun run typecheck && bun run test && bun run test:e2e && bun run build`.**

The e2e run (`bun run test:e2e`, i.e. `playwright test`) is part of the required gate, not an optional follow-up. Any commit that changes analysis-visible output (volume, working sets, balance, periodization, session panels, prompts) MUST pass the e2e suite before it is committed, and the full gate including e2e MUST pass at Phase 12.4 and at the Definition of Done. Local red is expected during a phase; red states are never committed.

# Phase 0 — Activate real TypeScript checking (no product behavior; ONE atomic green commit because activating test project exposes ten existing errors immediately)
0.1 Verify current failure: run `tsc --noEmit -p tsconfig.test.json --listFilesOnly`, confirm no test files included because `tsconfig.test.json` inherits prod exclude `["node_modules","src/**/*.test.ts","src/**/*.test.tsx"]`. Target `src/lib/analysis/session.test.ts`. Local red verification, not a separate commit.
0.2 Activate: update `tsconfig.test.json` so its own exclude replaces inherited: `{extends "./tsconfig.json", compilerOptions{noEmit:true}, include ["src/**/*.ts","src/**/*.tsx"], exclude ["node_modules"]}`. Retain existing test JSX/module-resolution/env-type config where present. Load-bearing: `exclude:["node_modules"]`. Must include all test files.
0.3 Add script `"typecheck":"tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json"`.
0.4 Fix all ten surfaced test errors in same atomic commit: `toDisplayAnalysis.test.ts` add `peakDetected`+`intensityProgression` to periodization fixture; `RoutineAnalysisCard.test.tsx` fix six readonly tuple errors from `as const` (mutable `DimensionKey[]`/remove `as const`/`LlmAnalysisSheet.test.tsx` pattern; don't weaken prod type); `backup.test.ts` both locations `const indexedDbMock = global.indexedDB as unknown as { deleteDatabase: jest.Mock }` (NOT `IDBDatabase`; `deleteDatabase` is `IDBFactory` surface); `sessionState.test.ts` remove/correct unsupported `exerciseId` from literal whose target only supports `notes`.
0.5 Verify inclusion: rerun `--listFilesOnly`, confirm all test files incl `session.test.ts`.
0.6 Gate + commit config activation and all ten fixes together: `"chore: activate test typechecking and fix surfaced errors"`.

# Phase 1 — Preserve exercise volume-role field (model/import/storage/backup/edit/swap only; must NOT reference Phase 2 section-default map)
1.1 Red parser tests: `{countsTowardVolume:true}`, `{counts_toward_volume:false}`. Assert explicit true survives, explicit false survives, `"true"` rejected→undefined, missing→undefined, unknown fields discarded. Fail initially because `normalizeExercise` builds fresh literal dropping new field.
1.2 Add field to `ProgramExercise` (`countsTowardVolume?:boolean`, before `tags`).
1.3 Add `optionalBoolean(value):boolean|undefined = typeof==="boolean"?value:undefined`. In `normalizeExercise`: `const countsTowardVolume = optionalBoolean(raw.countsTowardVolume) ?? optionalBoolean(raw.counts_toward_volume)`. Explicit false must survive nullish-coalescing. Copy into normalized literal.
1.4 Red persistence tests: backup export/import preserves true; preserves false; edit preserves; swap preserves true/false/undefined. Backup stores whole program docs, no bespoke migration.
1.5 Update reconstruction paths (any prod path that rebuilds `ProgramExercise` rather than spreading). Swap preserves `countsTowardVolume: existingExercise.countsTowardVolume` (explicit assignment OK even if spread already preserves). No catalog inference.
1.6 Gate. Commits `"test: define volume-role import persistence"` / `"feat: preserve countsTowardVolume through program flows"`.

# Phase 2 — Shared defaults and resolver
2.1 Red exhaustive section-default tests all 13: warmup false, explosive true, strength true, power true, hypertrophy true, accessory true, metcon true, cardio false, conditioning true, rehab false, mobility false, cooldown false, training true. No `rest` type; rest days have no sections, don't invoke resolver.
2.2 Add `DEFAULT_COUNTS_BY_SECTION: Record<SectionType,boolean>` (those 13). Exhaustive `Record` must fail typecheck if a future section type lacks default. metcon+conditioning true.
2.3 Red resolver precedence tests (16): explicit true over warmup; explicit false over strength; activation exact false; trim; case-insensitive; warmup/warm-up false; cooldown/cool-down false; mobility false; rehab false; prehab false; skill NOT auto-false; technique NOT auto-false; primer NOT auto-false; ambiguous training true; metcon true; conditioning true.
2.4 Implement `NON_VOLUME_MODIFIERS = {warmup,warm-up,activation,mobility,cooldown,cool-down,rehab,prehab}`; `resolveCountsTowardVolume(exercise,sectionType)`: explicit boolean → modifiers set (trim+lowercase) → `DEFAULT_COUNTS_BY_SECTION[sectionType] ?? true`.
2.5 Red manual-builder tests (after map exists): warmup false, mobility false, cardio false, rehab false, strength true, hypertrophy true, metcon true, conditioning true, training true.
2.6 Implement `draftToProgram`: `countsTowardVolume: DEFAULT_COUNTS_BY_SECTION[selectedSectionType]`. No duplicate local table. If builder can't create all 13, test exposed ones + separately test exhaustive map.
2.7 Gate. Commits test/feat defaults+resolver, test/feat builder defaults.

# Phase 3 — Weekly volume gating
3.1 Red: warmup activation zero volume; mobility zero; explicit true in warmup contributes; explicit false in hypertrophy zero; conditioning defaults contributing; metcon defaults contributing; legacy strength still contributes.
3.2 Implement in `countWeeklyVolume`: retain section context, gate `if(!resolveCountsTowardVolume(exercise,section.type)) continue;` before adding primary/secondary/incidental/full-body. Do NOT change median aggregation, landmarks, goal gating, scoring weights, cross-tier weighting.
3.3 Gate.

# Phase 4 — Within-tier canonical muscle dedup (separate from gating)
4.1 Red: `["chest","Chest"]`; two aliases same canonical; `["full body","quads"]`; `["full body","full body"]`; primary`["chest"]`+secondary`["chest"]`. Expected: canonical counts once within a tier; after expansion retain largest factor within tier; different tiers additive.
4.2 Implement per tier: normalize label → expand aliases+full-body → `Map<canonical,factor>` → retain `Math.max` → apply tier multiplier → add to shared total. `["full body","quads"]` → quads=`max(0.5,1.0)=1.0` not 1.5. Cross-tier addition preserved.
4.3 Gate.

# Phase 5 — Split total/working session sets (workingSets addition ATOMIC across type/producer/mapper/consumers/all literals)
5.1 Red: session w/ warmup+mobility+strength+excluded skill. Assert `totalSets`=all, `workingSets`=only resolved, `exerciseCount`=all objects, `estimatedMinutes`=`totalSets*3+10`.
5.2 Red direct-muscle-cap: glute session whose activation warmup currently pushes primary glute past threshold; after: activation excluded from direct glute cap, working hip-thrust counts, activation stays in total+duration.
5.3 Atomic impl in ONE green change: add `workingSets:number` to `SessionResult`; producer `session.ts` (`exerciseCount`/`totalSets`/`workingSets` accumulators, gate `workingSets` by resolver); duration `totalSets*3+10`; classification uses `workingSets` for 10-25+working-set warnings+direct caps, `totalSets` for total activity/duration/summary; **the primary-muscle direct-set accumulator (`session.ts:23-26`) MUST be behind the same `resolveCountsTowardVolume(exercise, section.type)` guard as `workingSets` — `muscleSetCounts` must reflect only the working population, not all exercises, so the direct per-muscle cap test in 5.2 excludes activation/warmup contributions**; mapper `toDisplayAnalysis.ts` `workingSets:result.workingSets`; consumers `SessionDisplay`/`RoutineAnalysisCard`/`LlmAnalysisSheet`/`sheetPrompt.ts` + any other complete display session; complete test literals `toDisplayAnalysis.test.ts`/`RoutineAnalysisCard.test.tsx`/`LlmAnalysisSheet.test.tsx` + shared `SessionResult` factories + any further revealed by typecheck. No intermediate commit missing the field anywhere.
5.4 Warning copy retains day context `"{day.title}: working sets are above the preferred range."`
5.5 Display both `"23 total prescribed sets / 18 working sets"`; 10-25 applies to working only.
5.6 Gate (typecheck before focused jest). Commits test/feat; impl commit atomic across full type+display path.

# Phase 6 — Gate balance
6.1 Red: warmup pull-aparts don't change push/pull; activation doesn't change upper/lower; non-volume handstand doesn't satisfy vertical-push coverage; explicit-counting warmup does affect; pure-mobility returns null/empty ratios no throw.
6.2 Implement `balance.ts` gate every exercise before push/pull/upper/lower/pattern-totals/set-based coverage via `resolveCountsTowardVolume`.
6.3 Coverage regression: if `coverage.ts` derives from gated volumes don't duplicate filter; add regression test excluded work doesn't reappear.
6.4 Gate.

# Phase 7 — Gate periodization
7.1 Red traversal: week w/ low-rep warmup ramp sets don't affect `heavySetShare`/`avgReps`/`avgPct`/heavy-week/peak. Fails initially because flattened list loses section context.
7.2 Filter during traversal (not after flatten): `ExerciseWithSection{exercise,sectionType}` OR `getWorkingWeekExercises(days,weekNumber)` filtering by `effectiveWeekNumber(day)===weekNumber` + `resolveCountsTowardVolume(exercise,section.type)`. All set-derived metrics use same population: weekly volume, `heavySetShare`, `avgPct`, `avgReps`, heavy-week, peak, deload, goal-mismatch notes.
7.3 Red real-deload: multi-week constant warmup + reduced working volume + reduced working intensity in deload → deload detected, warmup doesn't mask, peak not detected.
7.4 Red zero-working-volume: multi-week pure-mobility → `peakDetected` false, `deloadDetected` false, no NaN/Infinity/div-by-zero.
7.5 Implement guard `volumeDropped = maxVolume>0 && weekVolume<=maxVolume*0.7`. Equivalent positive-reference guards on any proportional comparison that could classify zero-working-volume routine.
7.6 Red goal-mismatch notes derive from gated `heavySetShare`/`avgPct`/`avgReps`.
7.7 Gate.

# Phase 8 — Canonical base-day warning paths (fix pre-existing index-vs-dayNumber mismatch before extending overrides)
8.1 Red non-sequential `[{day:1},{day:3},{day:5}]`, unmatched on Day3, assert path `days.3.sections.0.groups.0.exercises.0` NOT `days.2...`; apply resolution → Day3 patched, Days1/5 unchanged.
8.2 Refactor `normalizeDay` compute `dayNumber` first (`numberFrom(raw.day??raw.dayNumber, fallbackDayNumber)`), derive `dayPath=`${pathPrefix}.${dayNumber}``, pass semantic path into section/group/exercise normalizers.
8.3 Shared path builders `baseExercisePath(dayNumber,si,gi,ei)`, `overrideExercisePath(oi,dayNumber,si,gi,ei)` used in emission, extraction, base+override application, tests.
8.4 Duplicate base-day diagnostics on normalized `baseDays` BEFORE `expandDays`: `parseBaseDays` → `diagnoseDuplicateBaseDayNumbers(baseDays,warnings)` → `expandDays`. Do NOT check expanded days. Tests: `[{day:1},{day:3},{day:3}]`→dup Day3 warning; base Day1 × four weeks → no dup warning. Ambiguous dup path → don't apply resolution through it.
8.5 Gate.

# Phase 9 — Override warning propagation + exercise resolution
9.1 Red lost-warning: override replacement w/ unmatched exercise; assert current parser fails to expose via `program.import.warnings`.
9.2 `parseOverrides` merge local warnings into shared collection; override paths `overrides.{oi}.days.{dayNumber}.sections.{si}.groups.{gi}.exercises.{ei}`; partial override replacing only declared Day3 at array pos 0 emits `overrides.0.days.3.sections.0.groups.0.exercises.0` not `days.1`.
9.3 `getOverrideReplacementDays(override) = Array.isArray?replacement:[replacement]`, traversal only; don't rewrite stored single→array; preserve single as single, array as array; used in application/diagnostics/extraction/resolution/tests.
9.4 Red partial-override resolution: only replacement is Day3; assert path `overrides.0.days.3...`, applying patches actual replacement exercise, base Day3 unaffected unless separately resolved, replacement gets canonical id, `countsTowardVolume` preserved, slot id preserved, cross-week history via canonical.
9.5 Extend `applyResolutions` traverse `program.days` + `program.overrides[*].replacement`, same shared path builders, patch actual nested replacement not detached copy.
9.6 Remove resolved warnings: `ImportWarning` has no `kind` discriminator; only add path to `resolvedPaths` after successful patch; filter `program.import.warnings.filter(w=>!resolvedPaths.has(w.path))`; preserve unapplied exercise warnings/unrelated structural/other paths; after resolution `extractUnresolvedExercises(updated)` must not return resolved base or override exercise.
9.7 Tests: base resolution removes warning; override resolution removes warning; failed resolution leaves warning; structural remain; base/override paths can't collide; single shape preserved; array shape preserved; canonical history linkage remains.
9.8 Gate.

# Phase 10 — Override diagnostics (warning-only, no reject/delete)
10.1 Effective weeks from expanded days. Order: `parseBaseDays` → `diagnoseDuplicateBaseDayNumbers(baseDays,warnings)` → `days=expandDays(baseDays,lengthWeeks)` → `effectiveWeeks=Set(days.map(day=>effectiveWeekNumber(day)))` → `parseOverrides(raw.overrides,{expandedDays:days,effectiveWeeks,warnings})`. Use `effectiveWeekNumber(day)` NOT `effectiveWeekNumber(day.weekNumber)`; helper accepts `ProgramDay`.
10.2 Red expanded-week: 4-week program from one base template + override for Week4 → no out-of-range warning. Pins validation to post-expansion set.
10.3 Diagnostic cases+warnings: no replacement days `"Week 5 override contains no replacement days..."`; missing weekNumber `"A week override is missing weekNumber..."`; week absent `"Week 9 override does not match any week..."`; replacement day absent `"Week 6 override references Day 5..."`; empty/rest day neutral `"Week 4, Day 2 replaces the base workout with an empty or rest day. Confirm..."`; imported day-scope w/o dayId `"Imported day-scope overrides cannot be applied..."`. Internal edit-generated day-scope still supported (valid internal ids).
10.4 Warning-only: don't reject/delete/mutate override for ineffectiveness; preserve raw JSON, normalized data, runtime no-op.
10.5 Runtime diagnostics: pure pass for stored routines detecting same cases, no migration.
10.6 Gate.

# Phase 11 — Update all AI-facing prompts (3 surfaces: generation, external analysis `sheetPrompt.ts`, modify-with-AI)
11.1 Generation red tests: includes `countsTowardVolume`; requires on every exercise; explains true; explains false; keeps muscle tags accurate when false; "working sets" for 10-25; distinguishes total vs working; ranges advisory defaults; allows specialization; numeric sets match top-set/back-off prose; prohibits reason-only overrides; prohibits empty override day arrays; contains real replacement-day example; doesn't describe override days as optional when an override exists.
11.2-11.7 schema wording (add `countsTowardVolume` to example, explain true/false + "boolean controls analysis not anatomy"); session wording (4-8 all count, 10-25 working only, duration all, direct working ≤8 unless specialization); volume wording (advisory guardrails, specialization preserved); audit wording (exclude false from working/volume/direct/balance/periodization); numeric set consistency; override skeleton (remove "OPTIONAL...Omit if all weeks identical", require ≥1 complete replacement day, real example, reason descriptive only).
11.8 External `sheetPrompt.ts` asserts `"Total prescribed sets: 23 / Working sets: 18 / Preferred working-set range: 10-25"` + explains `countsTowardVolume`, exclusion from volume/balance/periodization, within-tier dedup, full-body max, cross-tier additive, advisory ranges.
11.9 Modify-with-AI inline example `{name,sets,reps,countsTowardVolume:true}` + "Preserve `countsTowardVolume` for unchanged exercises... Do not remove the field when modifying a day"; where existing routine JSON supplied instruct preserve unrelated fields.
11.10 Gate.

# Phase 12 — Full integration
12.1 Mixed multi-week fixture: base days 1/3/5, activation warmup, mobility, handstand non-volume, low-rep ramp non-volume, working strength, working hypertrophy, working conditioning/metcon, real deload, partial Week4 override replacing only Day3, unmatched base exercise, unmatched override exercise, reason-only inert override, duplicate muscle aliases, full body + explicit quads.
12.2 Assert 20: explicit booleans survive; base paths declared day numbers; override paths declared replacement day numbers; base resolution patches non-sequential day; override resolution patches replacement exercise; resolved warnings disappear; warmup/mobility zero working volume; remain in total sets; remain in duration; absent from working sets; balance ignores; ramp sets don't inflate `heavySetShare`; warmup volume doesn't mask deload; conditioning included; dup aliases once; full-body+quads larger within-tier; same muscle primary+secondary additive; inert override warnings appear; reason-only don't alter rendered base weeks; deterministic.
12.3 Pure-mobility multi-week: `totalSets`>0, `workingSets`=0, effective volume zero, working push/pull null/empty, working upper/lower null/empty, working coverage absent, `peakDetected` false, `deloadDetected` false, `heavySetShare` not falsely positive, duration finite, no NaN, no Infinity, no throw, repeated identical. Don't assert absence of general "no deload detected" advisory.
12.4 Final gate (including e2e) + re-verify test project includes all files. Run the full gate `bun run typecheck && bun run test && bun run test:e2e && bun run build`.
12.5 **e2e working-volume regression:** `e2e/helpers.ts:75-88` seeds a `warmup` section (Banded Face Pulls / Scapular Pull-Ups / Band Pull-Aparts) that previously counted toward analysis. Before this phase can close, `e2e/analysis-card.spec.ts` must be handled one of two ways, explicitly:
  (a) confirmed to assert no warmup-dependent per-muscle effective-set numbers (i.e. its assertions are presence/rendering/total-set based and unaffected by the warmup now being excluded from working volume/balance/muscle counts), OR
  (b) updated for the new working-volume gating — its expected per-muscle effective-set / working-set numbers adjusted so the warmup no longer inflates them, and (optionally) new assertions added for the total-vs-working distinction now shown in the session panel.
  Whichever applies, the e2e suite (`bun run test:e2e`) must be green as part of 12.4. If a per-muscle or working-set assertion in any e2e spec depended on the warmup counting, updating it is in scope for this phase.

# Phase 13 — Docs/release notes
Persistent copy explaining working-volume exclusion + excluded work still counts to total/exercise-count/duration; document existing routines re-grade on reopen; no migration (dynamic recompute + optional field). Do NOT add warning-dismissal state / auto program changes / circuit-round storage / structured duration logging / structured RIR-RPE logging / per-user landmark tables / injury enforcement / provider-specific prompts / recursive partial override merge.

# Final commit sequence (27)
1. `chore` activate+fix
2-3. volume-role import persistence + preserve
4-5. defaults+precedence + resolver
6-7. builder defaults test+feat
8-9. gated volume test+feat
10-11. within-tier dedup test+fix
12-13. total/working session test+feat (13 atomic across type/producer/mapper/consumers/sheet/fixtures **and the gated `muscleSetCounts` direct-cap accumulator**)
14-15. balance test+fix
16-17. periodization test+fix
18-19. base-day paths test+fix
20-21. override warning+resolution test+fix
22-23. override diagnostics test+feat
24-25. prompt contracts test+feat
26. integration (includes the e2e working-volume regression handling from 12.5)
27. docs

Adjacent test+impl may combine into atomic red-green per repo convention. No committed state red (including e2e for commits that change analysis-visible output).

# Definition of done

Grouped by category. Every item must hold on the final state; the two follow-up-touched items (10 and the quality-gate e2e items) are marked.

## Type / storage
1. `countsTowardVolume?:boolean` added to `ProgramExercise`, positioned before `tags`.
2. Explicit `true`/`false` survive JSON import via both `countsTowardVolume` and `counts_toward_volume`.
3. Non-boolean values (`"true"`, numbers) normalize to `undefined`; missing → `undefined`; explicit `false` is not coalesced away.
4. Field preserved through backup export/import with no bespoke migration.
5. Field preserved through edit and through swap (explicit `existingExercise.countsTowardVolume`), including `undefined`.
6. All prod reconstruction paths that rebuild a `ProgramExercise` retain the field.
7. `DEFAULT_COUNTS_BY_SECTION: Record<SectionType,boolean>` exists with all 13 section types and no `rest` key; omitting a future section type is a compile error.
8. `resolveCountsTowardVolume` resolves explicit boolean → `NON_VOLUME_MODIFIERS` (trim+lowercase) → section default → `true`.
9. Manual builder assigns `countsTowardVolume` from the shared map (no duplicate local table).

## Analysis
10. **`totalSets` counts all prescribed sets; `workingSets` counts only resolved working sets; `exerciseCount` counts all objects; duration uses all prescribed sets (`totalSets*3+10`). The primary-muscle direct-set accumulator (`session.ts:23-26`) is gated by the same `resolveCountsTowardVolume(exercise, section.type)` as `workingSets`, so `muscleSetCounts` and the direct per-muscle cap reflect only the working population — warmup/activation exercises never contribute to the direct cap. (Follow-up folded in.)**
11. `workingSets:number` is a required field present everywhere `SessionResult` and `SessionDisplay` are constructed (producer, mapper, all consumers, all test literals, shared factories) — no intermediate state missing it.
12. Working-set warning copy retains day context: `"{day.title}: working sets are above the preferred range."`; the 10-25 range applies to working sets only.
13. Session display shows both total prescribed sets and working sets ("23 total prescribed sets / 18 working sets").
14. `countWeeklyVolume` gates each exercise via `resolveCountsTowardVolume` before adding any tier; median aggregation, landmarks, goal gating, scoring weights and cross-tier weighting unchanged.
15. Within a tier, a canonical muscle is counted once, retaining the largest factor (`["full body","quads"]`→1.0, not 1.5); cross-tier contributions remain additive.
16. `balance.ts` gates every exercise before push/pull, upper/lower, ratios and set-based movement-pattern coverage; excluded prep does not satisfy coverage or shift ratios.
17. Pure-mobility routines yield null/empty balance ratios with no throw.
18. `coverage.ts` does not double-filter if it derives from gated volumes; a regression test confirms excluded work does not reappear.
19. Periodization filters working exercises during traversal (section context retained), and all set-derived metrics (weekly volume, `heavySetShare`, `avgPct`, `avgReps`, heavy-week, peak, deload, goal-mismatch notes) use that single population.
20. `volumeDropped = maxVolume>0 && weekVolume<=maxVolume*0.7`; equivalent positive-reference guards on any proportional comparison; zero-working-volume routines produce no deload/peak/intensification and no NaN/Infinity/div-by-zero.
21. Goal-mismatch notes derive from gated `heavySetShare`/`avgPct`/`avgReps`.

## Resolution / overrides
22. Base warning paths use the declared day number, not array index (`baseExercisePath`).
23. Override warning paths use `overrideExercisePath` with `overrides.{oi}.days.{dayNumber}...`.
24. Shared path builders are used by emission, extraction, base+override application, and tests — no divergent path strings.
25. Duplicate base-day numbers are diagnosed on `baseDays` before `expandDays`; multi-week fan-out of a single base day does not warn; resolution is not applied through an ambiguous duplicate path.
26. Override replacement unmatched-exercise warnings propagate into `program.import.warnings`.
27. `getOverrideReplacementDays` normalizes shape for traversal only; stored single/array replacement shape is preserved (never rewritten single→array).
28. `applyResolutions` patches nested exercises in both `program.days` and `program.overrides[*].replacement`, preserving slot id, `countsTowardVolume`, and canonical-id→history linkage; the actual stored node is patched, not a detached copy.
29. Resolved warnings are removed via `filter(w=>!resolvedPaths.has(w.path))` (no `kind` discriminator; only successfully-patched paths enter `resolvedPaths`); unapplied exercise warnings and unrelated structural warnings are preserved; `extractUnresolvedExercises(updated)` no longer returns a resolved base or override exercise.
30. Effective weeks are computed from expanded days; override week validation is warning-only and uses `effectiveWeekNumber(day)`.
31. Override diagnostics emit warnings (no replacement days, missing `weekNumber`, out-of-range week, absent replacement day, empty/rest replacement day, imported day-scope without `dayId`) without rejecting, deleting or mutating the override; raw JSON, normalized data and runtime no-op are preserved.
32. Runtime diagnostics detect the same cases for stored routines with no migration.

## Prompt consistency
33. Generation prompt requires `countsTowardVolume` on every exercise and explains both values and that the boolean controls analysis, not anatomy.
34. Generation prompt uses "working sets" for the 10-25 range, distinguishes total vs working, presents ranges as advisory defaults, and permits explicit specialization.
35. Generation prompt keeps numeric sets consistent with top-set/back-off prose.
36. Generation prompt prohibits reason-only overrides and empty override day arrays, contains a real replacement-day example, and does not describe override days as optional when an override exists.
37. `sheetPrompt.ts` renders "Total prescribed sets: N / Working sets: M / Preferred working-set range: 10-25" and explains exclusion from volume/balance/periodization, within-tier dedup, full-body max, cross-tier additivity, and advisory ranges.
38. Modify-with-AI inline example includes `countsTowardVolume:true` and instructs preserving the field for unchanged exercises and preserving unrelated fields when routine JSON is supplied.

## Quality gate
39. `bun run typecheck` passes (prod + test projects).
40. The test project demonstrably includes all test files (`tsc --noEmit -p tsconfig.test.json --listFilesOnly` lists every `*.test.ts(x)`).
41. `bun run test` (jest) passes.
42. **`bun run test:e2e` (playwright) passes as part of the required gate, not as a deferred follow-up. (Follow-up folded in.)**
43. **`e2e/analysis-card.spec.ts` is either confirmed independent of warmup-dependent per-muscle effective-set numbers, or updated for the new working-volume gating given the warmup section seeded at `e2e/helpers.ts:75-88`. (Follow-up folded in.)**
44. `bun run build` passes.
45. Both integration fixtures (mixed multi-week, and pure-mobility multi-week) pass.
46. No committed repository state leaves any part of the gate red — including e2e for any commit that changes analysis-visible output.

## Required command (full gate)
```
bun run typecheck && bun run test && bun run test:e2e && bun run build
```
(`test:e2e` = `playwright test`, already wired in `package.json`.)

---

# Appendix A — Verbatim copy (restored from raw plan)

The compressed Phase 10/11 lines above paraphrase copy. When implementing those phases, use the exact strings below.

## A.10.3 Override-diagnostic warning strings (exact)
- No replacement days: `Week 5 override contains no replacement days. The base weekly template will be used unchanged.`
- Missing `weekNumber`: `A week override is missing \`weekNumber\` and cannot be applied.`
- Week absent from effective weeks: `Week 9 override does not match any week represented by this routine and will not be applied.`
- Replacement day absent from base template: `Week 6 override references Day 5, which does not exist in the base weekly template. That replacement will not be applied.`
- Empty/rest replacement day (neutral): `Week 4, Day 2 replaces the base workout with an empty or rest day. Confirm that this is intentional.`
- Imported day-scope without usable `dayId`: `Imported day-scope overrides cannot be applied without a matching internal routine day. Use a week override with replacement day objects instead.`

(The numeric week/day values above are illustrative of the message shape; emit the actual override's week/day numbers.)

## A.11.2 Exercise-schema explanation (exact)
```
Set `countsTowardVolume` to `true` when the prescribed sets are intended to contribute to working strength, hypertrophy, muscular conditioning, or explosive training volume.

Set it to `false` for ordinary warmups, activation drills, mobility work, cooldowns, rehabilitation or prehabilitation work, and low-fatigue practice that is not intended as productive muscular working volume.

Muscle tags still describe anatomical involvement when `countsTowardVolume` is false. The boolean controls analysis, not anatomy.
```

## A.11.3 Session wording (exact — note the 30-75 minute duration figure)
```
- Listed exercises or protocols per session: generally 4-8. All warmup, mobility, skill, conditioning, and cooldown exercises count toward this number.

- Working sets per session: generally 10-25. Only exercises with `countsTowardVolume: true` count toward this range.

- Estimated session duration: 30-75 minutes, including all programmed work.

- Direct working sets per muscle group per session: generally no more than 8, unless the athlete deliberately requests specialization and accepts the tradeoff.
```

## A.11.4 Volume wording (exact)
```
The weekly volume ranges are default programming guardrails, not mandatory targets for every muscle.

Prioritized hypertrophy muscles should generally fall within their productive ranges. Maintenance muscles may fall below them.

When the athlete explicitly requests specialization above a preferred range, preserve the decision when the recovery and session tradeoffs remain plausible. Acknowledge the tradeoff during conversation rather than automatically reducing the requested volume.

Hard limits are strong caution thresholds, not automatic reasons to reject an explicit athlete request.
```

## A.11.5 Audit wording (exact)
```
Exclude exercises with `countsTowardVolume: false` from working-set, weekly muscle-volume, direct-muscle-set, movement-balance, and periodization calculations.

Do not classify an athlete-requested and acknowledged specialization as an audit failure merely because it departs from a preferred range.
```

## A.11.6 Numeric set-consistency wording (exact — includes the sets:4 / sets:3 examples)
```
The numeric `sets` value controls the number of workout logging rows.

It must equal the complete prescription described in `reps`, `load`, and `notes`.

Examples:
- One top set plus three back-off sets uses `"sets": 4`.
- One top set plus two back-off sets uses `"sets": 3`.
```

## A.11.7 Override-skeleton wording (exact — replaces the removed "OPTIONAL … Omit if all weeks identical")
```
Only emit an override when at least one routine day actually changes.

Every override must contain one or more complete replacement day objects.

An override with omitted `days` or an empty `days` array does not alter the routine and must not be emitted.

If a week is identical to the base template, omit the entire override object.

The `reason` field is descriptive only. It does not alter sets, repetitions, loads, exercises, or effort targets.
```
Provide a structurally valid replacement-day example alongside this text.

## A.11.9 Modify-with-AI wording (exact)
```
Preserve `countsTowardVolume` for unchanged exercises.

Use `true` for productive working sets and `false` for ordinary warmup, activation, mobility, cooldown, rehabilitation, prehabilitation, or low-fatigue practice.

Do not remove the field when modifying a day.
```
Where existing routine JSON is supplied, instruct the model to preserve all fields unrelated to the requested modification.
