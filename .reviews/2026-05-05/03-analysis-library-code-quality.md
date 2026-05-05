# Code Review: Analysis Library (Code Quality)

Reviewer: architecture-reliability-reviewer  
Date: 2026-05-05  
Scope: `src/lib/analysis/`

## Summary

The analysis library is well-organized with clear separation of concerns (one module per dimension) and a mostly-clean type system. However, there are **two critical algorithmic correctness bugs** that produce systematically wrong outputs for normal programs, plus a PRD-alignment gap in how `llmPrompt.ts` is wired.

---

## 1. Algorithmic Correctness

### [Critical] Upper/Lower/Chest/Back double-counting in `analyzeBalance`
`src/lib/analysis/balance.ts:33-53`

The inner loop iterates `exercise.tags.primary` and adds `sets` to upper/lower/chest/back buckets once **per matching label**. Any compound with two primary muscles in the same bucket gets credited twice.

Trace: Bench Press 4×, primary `["chest","front delts"]` → `upperSets += 4 + 4 = 8` (should be 4). For Day 1 of the balanced fixture, `upperSets = 34` vs the correct 23 — ~50% over-count.

**Fix:** Collect the set of canonical muscles per exercise first, then classify the exercise once per bucket.

### [Critical] `analyzeProgram` only computes volume for week 1
`src/lib/analysis/analyze.ts:21`

```ts
const weeklyVolume = countWeeklyVolume(days, 1);
```

Hardcoded `1` means any multi-week progressive-overload program is scored against its first (lightest) week. A 4-week program correctly ramping to MAV in week 3 scores "Maintenance only" throughout.

**Fix:** Iterate per-week and return per-week volume reports, or take max/modal week volume across weeks.

### [High] `detectMovementPatterns` is dead without `canonicalExerciseId`
`src/lib/analysis/muscles.ts:108-139`

When `exercise.canonicalExerciseId` is undefined (every exercise in every test fixture), `catalogItem` is `undefined`, all fallback branches fail, and `patterns = []`. Every program lacking catalog-matched exercises eats a -20 balance penalty. The test at `balance.test.ts:24-31` codifies this as expected behavior — normalizing the bug into the test contract.

**Fix:** Add label-based fallbacks (bench → horizontal_push, squat → squat, deadlift/RDL → hip_hinge, OHP → vertical_push, pull-up → vertical_pull, row → horizontal_pull).

### [High] `mapMuscle("shoulders") → side_delts` over-attributes OHP/front-delt work
`src/lib/analysis/muscles.ts:18`

OHP tagged `["front delts","shoulders"]` gets both front_delts and side_delts credit. Similarly, `mapMuscle("full body") → core` makes a deadlift tagged "full body" register as core only.

### [Medium] Deload detection only inspects the last week
`src/lib/analysis/periodization.ts:35`

A 6-week program with a deload in week 4 followed by ramp-up in 5–6 will not have `deloadDetected = true`.

### [Medium] `Infinity:1` ratio leaks into UI strings
`src/lib/analysis/balance.ts:63-70`

When pull volume is 0 and push > 0, `pushPullRatio = Infinity`. `toDisplayAnalysis.formatRatio` calls `Infinity.toFixed(2)` → `"Infinity : 1"`.

### [Medium] `scoreVolumeDimension` "trained" filter is a near no-op
`src/lib/analysis/score.ts:22-32`

Almost every muscle has `mev > 0`. Untrained groups score red and drag the average down even for programs that legitimately skip them.

### [Low] `setsPerExercise` threshold in `thresholds.ts:30` is never read by `session.ts`

---

## 2. Type Safety

### [Medium] `(secondary as GoalArchetype)` cast in goals
`src/lib/analysis/goals.ts:27,31` — works but fragile; add null check.

### Positive
No `any` casts, no `!` non-null assertions, no `unknown` escapes in production analysis modules.

---

## 3. LLM Prompt Construction

### [High] `buildLlmAnalysisPrompt` does not consume `AnalysisResult`
`src/lib/analysis/llmPrompt.ts:5-20`

```ts
export function buildLlmAnalysisPrompt(program: ProgramDocument, profile?: ProfileDocument): string
```

The prompt asks the LLM to recompute everything the local analysis already produced. The PRD says analysis feeds the prompt. Either the local math is decorative, or the LLM is meant to validate it — but neither is explicitly true. The local results should be included as a section so the LLM can compare.

### [Medium] `VOLUME_REFERENCE` table omits 7+ muscle groups
`src/lib/analysis/llmPrompt.ts:27-45` — Missing: `lower_back`, `forearms`, `core`, `adductors`, `abductors`, `rotator_cuff`, `neck`.

### [Medium] Prompt text duplicates `thresholds.ts` values by hand
If `chest.mev` changes, the prompt still says the old value.

---

## 4. Display Layer Consistency

### [High] `toDisplayAnalysis.ts:72` flag inversion misrepresents under-trained muscles

```ts
flag: mv.severity === "red" ? "above_mrv" : mv.severity === "yellow" ? "below_mev" : undefined,
```

`severity === "red"` covers **both** `sets < mv` (under-trained) and `sets > mrv` (over-trained). The display unconditionally labels both as `"above_mrv"` — an under-trained muscle is reported as over-trained in the UI.

**Fix:** Recompute the flag from actual numeric position relative to landmarks, not the severity bucket.

### [Medium] `goalCoherence` note always claims a match regardless of confidence
`src/lib/analysis/toDisplayAnalysis.ts:53`

### [Medium] `DisplayAnalysis.strengths` is always `[]`
`src/lib/analysis/toDisplayAnalysis.ts:142`

### [Low] `capitalize` doesn't handle underscores — `"olympic_weightlifting"` → `"Olympic_weightlifting"`

---

## 5. Test Quality

- `balance.test.ts:24-31` codifies the broken movement-pattern detection as expected behavior — a test that will not fail when the bug is fixed
- `analyze.test.ts:16-20` only asserts `balanced.overall.score > imbalanced.overall.score` — both could be 30 and it passes
- `goals.test.ts:7` accepts three different primaries; cannot fail for any plausible change to the goal model
- No fixture has `canonicalExerciseId` set — the entire movement-pattern code path is never executed in tests

---

## Top 5 Issues to Fix First

1. `balance.ts` upper/lower/chest/back double-counting — Critical, distorts every ratio
2. `analyze.ts:21` hardcoded week 1 — Critical, silently mis-scores any multi-week program
3. `toDisplayAnalysis.ts:72` flag inversion — High, mislabels under-trained muscles as over-trained
4. `detectMovementPatterns` dead without `canonicalExerciseId` — High, every user-authored program eats -20
5. `buildLlmAnalysisPrompt` does not consume `AnalysisResult` — High, product decision needed
