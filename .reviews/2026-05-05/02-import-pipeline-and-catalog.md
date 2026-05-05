# Code Review: Import Pipeline & Exercise Catalog

Reviewer: architecture-reliability-reviewer  
Date: 2026-05-05  
Scope: `src/lib/import/`, `src/lib/catalog/`, `src/lib/analytics/`

---

## 1. Parser Robustness

### [Critical] Section type silently coerced to `"training"` for unknown values
`src/lib/import/parser.ts:87`, `src/lib/programs/domain.ts:8-13`

`normalizeSectionType` returns `"training"` for any unrecognized value with no warning emitted. The resolution test at `src/lib/import/resolution.test.ts:18-21` even includes a synthetic warning `"Unknown section type: power_endurance."` — that warning is **never produced anywhere in production code**. The contract documented in the test does not exist.

**Fix:** Emit an `ImportWarning` when section type is coerced.

### [Critical] Group `type` is silently coerced to `"single"` on unknown values
`src/lib/import/parser.ts:151-154`

A superset declared as `"super-set"` or `"giant_set"` is downgraded to `"single"`, losing programming intent with no warning.

**Fix:** Same pattern as above — emit `ImportWarning` on coercion.

### [High] `tags` block silently dropped if not an object
`src/lib/import/parser.ts:109-116`

LLM emitting `"tags": ["push", "compound"]` (array, common mistake) resets tags to `emptyTags()`. No warning.

### [High] Whole-program JSON shape detection is brittle
`src/lib/import/parser.ts:57-64`

Only recognizes 3 shapes. `{program:{days:[...]}}`, `{schedule:[...]}`, top-level array all throw `"No day or sections were found"` with no hint about what keys were found.

### [High] Exercise name prefix-strip regex strips too aggressively
`src/lib/import/parser.ts:107`

`name.replace(/^[a-z]\.\s+/i, "")` strips `"A. Squat"` → `"Squat"` before `matchExercise` is called, but the original JSON retains the unstripped name in `rawJson`. If two exercises collapse to the same display name after stripping (e.g., `"A. Squat"` and `"B. Squat"`), only one warning entry exists and the resolution applies to both — silent data corruption.

### [Medium] `stringFrom` does not trim returned values
`src/lib/import/parser.ts:164-166`

Guard checks `value.trim().length > 0` but returns `value` unchanged. Exercise/program names have stray whitespace that breaks string equality.

---

## 2. Resolution Flow Correctness (PRD Alignment)

### [Critical] Finalization is NOT actually blocked by unresolved-without-suggestions exercises
`src/components/import/ImportClient.tsx:51-55, 146-189`

`extractUnresolvedExercises` filters out warnings with `suggestions.length === 0`. Exercises with no suggestions go straight to the confirm step with no resolution UI. Save button is unconditionally enabled. **This violates the PRD requirement: "unresolved exercises must be manually resolved before finalizing."**

**Fix:** Include no-suggestion exercises in resolution; offer free-form catalog search; disable Save until all resolved or user explicitly acknowledges.

### [Critical] `applyResolutions` matched by `name` — duplicate names after prefix-strip collapse to one entry
`src/lib/import/resolution.ts:38, 42`

See parser finding above. Two exercises with the same display name post-strip share one resolution entry; applying it corrupts both.

**Fix:** Key resolutions on a stable per-exercise identifier (warning `path` or exercise `id`), not display name.

### [Critical] User-saved aliases are NEVER fed back into the parser on subsequent imports
`src/components/import/ImportClient.tsx:48`

`parseProgramJson(json)` called with no aliases argument. User-alias path in `match.ts:15-19` is dead code from the UI's perspective. Every subsequent import re-prompts for the same exercises.

**Fix:** Load `await aliasRepo.list()` before validating and pass as third argument.

### [High] `extractUnresolvedExercises` parses the rawName from a localized error message
`src/lib/import/resolution.ts:27`

`/^(.+) was imported without a catalog match\.$/' — fragile regex on a human-readable string. Copy change breaks it silently.

**Fix:** Add `rawName?: string` to `ImportWarning` type and populate it in the parser.

### [High] Save flow is not atomic across alias save + program save
`ImportClient.tsx:79-90`

If alias saves succeed but program save fails, next attempt auto-resolves the exercises (aliases are saved) but the program is missing. No try/catch — any thrown error becomes an unhandled promise rejection.

---

## 3. Matching Accuracy

### [High] Jaccard token similarity has no minimum-token-overlap threshold
`src/lib/catalog/match.ts:30-34`

`score > 0` means any shared word qualifies. `"Press"` (single token) matches every catalog entry containing "press" at identical scores, sorted by array order. Consider a minimum threshold (e.g. `score >= 0.3`) and stopword filtering.

### [High] No handling of plurals or hyphenation differences
`src/lib/catalog/normalize.ts`

`"Pullup"` vs `"Pull Up"` → similarity 0 → no suggestions. Consider light stemming or n-gram comparison.

### [High] `matchExercise` linearly scans the entire catalog 4+ times per exercise
`src/lib/catalog/match.ts:12-25`

For a 50-exercise import that's 200,000+ string comparisons. Pre-build index maps at module load:
```
{ byId, byNormalizedName, byNormalizedAlias: Map<string, ExerciseCatalogItem> }
```

### [Medium] `via: "canonical"` is essentially never returned
`src/lib/catalog/match.ts:12-13`

`normalizeExerciseName("Alternate Incline Dumbbell Curl")` produces `"alternate incline dumbbell curl"` but the catalog id is `"alternate-incline-dumbbell-curl"` — not equal. The canonical branch never fires; everything falls to alias/normalized.

---

## 4. Type Safety

### [High] `import.rawJson: unknown` is never re-validated on read
Any exotic values (non-JSON-clonable objects) silently become null on restore. Document that `import.rawJson` must be JSON-clonable, or strip before storage.

### [High] No schema validation on parser input
Given LLM-shaped input is the primary source, Zod/Valibot schema validation would give the user precise error messages and centralize the alias detection scattered across the parser.

### [Medium] `numberFrom`/`optionalNumber` silently drop numeric strings
LLMs sometimes emit `"sets": "3"` (string). Currently dropped to `undefined`. No warning.

---

## 5. Analytics Seam

### [Medium] Seam is a no-op stub with no replay buffer
`analyticsSeam.ts:1-5` — `Promise<void>` return type but no async behavior. In-flight events during page transitions will be lost when a real implementation is added.

### [Low] `WorkoutEvent = WorkoutSavedEvent` — no `schemaVersion` field
When schema evolves, consumers can't distinguish v1 from v2 events.

---

## 6. Heatmap Correctness

### [High] Percentile thresholds computed off user's own history — first session shows max intensity
`src/lib/analytics/trainingHeatmap.ts:49-52`

With a single log entry, `p33 = p66 = p90 = allVols[0]`. Every single-session user perpetually shows "max intensity." 

**Fix:** Require minimum sample size before banding, or use absolute tonnage thresholds.

### [High] Bodyweight workouts produce 0 volume — invisible in heatmap
`src/lib/analytics/trainingHeatmap.ts:40-44`

Volume = `weight * reps`. For pull-ups, push-ups, sit-ups (`weight === undefined`), volume is `0 * reps = 0`. Sessions don't appear in streak or completion tracking.

### [Medium] `todayStr + "T00:00:00Z"` — if `todayStr` contains time, produces invalid Date
`trainingHeatmap.ts:30`

Validate or accept `Date` directly.

---

## 7. PRD Alignment Summary

| PRD requirement | Status |
|---|---|
| Parser normalizes pasted JSON | Partial — ~3 known shapes only |
| Match: canonical → alias → normalized → fuzzy | Mostly — `via: "canonical"` is dead code |
| Unresolved must be manually resolved before finalizing | **Broken** — no-suggestion exercises bypass resolution |
| User-approved resolutions become local aliases for future imports | **Broken on read** — aliases saved but never re-fed to parser |
| Single-day & full-program JSON shapes | Partial — brittle shape detection |

---

## Top 5 Issues to Fix First

1. **C3** — Block save when unresolved exercises have no suggestions; offer free-form catalog search.
2. **C5** — Load saved aliases via `aliasRepo.list()` and pass to `parseProgramJson` on validate.
3. **C1/C2** — Emit `ImportWarning`s when section type or group type is coerced.
4. **H12/H13** — Fix heatmap intensity bands for early users and bodyweight workouts.
5. **H4** — Add `rawName` to `ImportWarning`; stop parsing it from a localized string.
