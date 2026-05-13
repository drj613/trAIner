# ExerciseDBPro Catalog Reconciliation

**Date:** 2026-05-12

## Context

ExerciseDBPro was purchased and its data placed in `exerciseDBpro720px/`. It contains 1,324 exercises with fields our catalog lacks (`instructions`, `description`, `difficulty`, `category`, per-exercise GIF animations). We want to fold this into the existing catalog pipeline to expand coverage and enrich existing entries.

**What we're keeping from Pro:**
- Net-new exercises (no confident match in existing catalog)
- `target` + `secondaryMuscles` → merged into `muscles.primary` / `muscles.secondary`
- `equipment` → normalized and merged into `equipment`
- `category` → normalized and mapped into `movementPatterns` and `tags`

**What we're not doing:**
- GIFs: deferred entirely. The 1.2GB asset folder won't go in the repo. Coverage would be spotty (only 1,324 of 2,000+ exercises have GIFs) so there's no point building UI around it yet.
- No new fields on `ExerciseCatalogItem`. The schema stays exactly as-is.
- `instructions`, `description`, `difficulty`: not captured. No UI home for them and the catalog doesn't need them for its current purposes (matching, muscle analysis, exercise picking).

## Overlap Analysis

Fuzzy token-overlap (Jaccard) between Pro names and existing catalog names:

| Tier | Jaccard | Count | Treatment |
|------|---------|-------|-----------|
| Strong match | ≥ 0.80 | ~326 | Auto-enrich existing entry |
| Likely match | 0.60–0.80 | ~412 | Enrich above threshold, emit review report for the rest |
| Weak / no match | < 0.60 | ~586 | Add as new catalog entries |

The 180 exact name matches are a subset of the strong-match tier. "Net new" exercises from Pro is roughly 500–600, not 1,144 as a naive name-equality check suggested.

## Changes

### 1. Absorb `catalog-local-overrides.json` into `scripts/sources/curated.json`

The override file was created as one-off import-testing patches that were never applied to the catalog proper. These entries (banded face pull, pull-up, barbell bench press, etc.) are curated, authoritative data that should be a first-class source — not a late-stage override pass.

- Rename/move to `scripts/sources/curated.json`
- Load it in `build-exercise-catalog.mjs` as the first source (highest priority — never overwritten by other sources)
- Keep the override mechanism in the build script for genuine future one-offs, but point it at an empty `catalog-local-overrides.json` (or remove the file and the override pass if there's nothing left)

### 2. New ingest script: `scripts/ingest/ingest-exercisedbpro.mjs`

Reads `exerciseDBpro720px/exerciseData_complete.json` and outputs `scripts/sources/exercisedbpro-snapshot.json` in the existing `ExerciseCatalogItem` format.

**Normalization:**

Pro's single-string `equipment` needs splitting and aliasing (e.g. `"body weight"` → `["bodyweight"]`, `"ez barbell"` → `["ez bar"]`, compound strings like `"dumbbell, exercise ball"` → `["dumbbell", "exercise ball"]`). Reuses and extends the existing `EQUIPMENT_ALIASES` map.

Pro's `target` (single string) and `secondaryMuscles` (array) are run through the existing `MUSCLE_ALIASES` normalization (e.g. `"pectorals"` → `"chest"`, `"delts"` → `"shoulders"`). Additional mappings needed: `"quadriceps"` → `"quads"`, `"back"` (coarse) → `"upper back"` (Pro uses this as a catch-all; the existing alias already handles `"levator scapulae"` and `"spine"`). Coarse `"back"` is treated as `"upper back"` given Pro's `bodyPart` context.

**Name cleaning:** Pro names with gender suffixes like `(male)` or `(female)` are stripped before slug generation and name storage. A few Pro entries have apparent typos (e.g. `"squad"` for `"quad"`) — these are stored as-is but the review report will surface them as low-confidence matches to resolve manually.

Pro's `category` maps to `movementPatterns` and `tags` entries:

| Pro `category` | Added to `movementPatterns` | Added to `tags` |
|---|---|---|
| `strength` | `strength` | `strength` |
| `cardio` | `cardio` | `cardio` |
| `mobility` | `mobility` | `mobility` |
| `plyometrics` | `plyometrics` | `plyometrics` |
| `stretching` | `flexibility` | `flexibility` |
| `balance` | `stability` | `stability` |
| `rehabilitation` | `rehab` | `rehab` |

**Matching:**

For each Pro exercise, compute Jaccard token-overlap against all existing catalog slugs. At threshold ≥ 0.80, emit the entry using the **existing catalog slug** as `id` (so `mergeExercise` unifies them). Below threshold, generate a new slug from Pro's name.

The script also writes `scripts/sources/exercisedbpro-review.txt` — a human-readable list of the 0.60–0.80 tier matches for manual inspection. Correct matches can be added to `catalog-local-overrides.json` (id override) to pull them into the enrichment pass.

### 3. Build script updates: `scripts/build-exercise-catalog.mjs`

Two changes:

**a. Curated source as first pass.** Load `scripts/sources/curated.json` before live sources, using `byId.set` directly (not `addExercises`'s skip-if-exists guard). This makes curated entries authoritative — subsequent sources merge into them rather than replacing them.

**b. Pro snapshot as enrichment pass.** After all other sources are loaded, process `scripts/sources/exercisedbpro-snapshot.json` through `mergeExercise` for every entry — even ones already in `byId`. This is the mechanism that enriches existing entries with Pro's muscle/equipment/movement data rather than skipping them. New entries (not yet in `byId`) are added normally.

`mergeExercise` already union-merges arrays, so existing curated muscle/equipment data is preserved and Pro's normalized data is addended, not overwritten.

## File Summary

| File | Action |
|---|---|
| `scripts/sources/curated.json` | New — absorbs `catalog-local-overrides.json` |
| `scripts/catalog-local-overrides.json` | Emptied (or removed if override pass is dropped) |
| `scripts/ingest/ingest-exercisedbpro.mjs` | New |
| `scripts/sources/exercisedbpro-snapshot.json` | Generated by ingest script (gitignored or committed) |
| `scripts/sources/exercisedbpro-review.txt` | Generated by ingest script — manual review aid |
| `scripts/build-exercise-catalog.mjs` | Updated — curated first-pass, Pro enrichment pass, front_delts taxonomy normalization |
| `src/lib/catalog/exercises.ts` | No changes |
| `src/lib/catalog/exercises.generated.json` | Regenerated |

### 4. Taxonomy correction: `front_delts` on pressing exercises

The RP volume landmark model explicitly treats front delt volume from pressing as **indirect**. The `mavHigh: 8` threshold in `thresholds.ts` is calibrated for *direct* front delt work (front raises, etc.) — all pressing movements are assumed to cover front delt maintenance needs separately. When pressing exercises tag `front_delts` as primary and volume counting applies the 1.0× primary multiplier, front delt volume is overstated relative to what the threshold was designed for.

**Current state:** 46 exercises in the catalog are pressing movements (detected by name keywords: press, push-up, fly, dip, bench) that have `front_delts` in `muscles.primary`. Most have empty `movementPatterns`, which is why this wasn't caught by pattern-based detection.

**Fix:** Add a post-merge normalization pass in `build-exercise-catalog.mjs` that demotes `front_delts` from primary to secondary on pressing exercises. Detection uses the same name-keyword approach since `movementPatterns` is too sparsely populated to rely on. This applies to both existing catalog entries and any pressing exercises added from Pro.

The same logic applies during Pro ingest: if Pro's `target` normalizes to `front delts` on a pressing exercise, emit it as secondary rather than primary.

This is a **catalog data correction**, not a threshold change. The values in `thresholds.ts` are correct as documented in `docs/research/program-analysis-research/01-volume-landmarks.md` (RP volume landmark model, cross-referenced with Schoenfeld 2017/2019 meta-analyses).

## Out of Scope

- GIF display UI
- `difficulty`, `instructions`, `description` fields
- Any changes to `ExerciseCatalogItem` type
- Changes to how exercises are consumed by the app (matching, analysis, picker)
