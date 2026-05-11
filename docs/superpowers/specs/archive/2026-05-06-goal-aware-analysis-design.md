# Goal-Aware Routine Analysis — Design Spec
Date: 2026-05-06

## Problem

The analysis system is calibrated for hypertrophy/RP science and applied universally. A powerlifting, OL, or powerbuilding program does not score lower — it receives actively wrong guidance that could lead the user to modify a well-designed program in a harmful direction.

The target user mixes training styles (hypertrophy, powerlifting, OL, powerbuilding) and cares about having structurally correct programs for each style. The system must serve all styles correctly.

## Scope

Three implementation tiers, ordered by dependency. Tier 1 is self-contained. Tiers 2 and 3 build on each other.

---

## Tier 1 — Targeted Fixes (no dependencies)

### 1a. Remove movement pattern severity warnings
`src/lib/analysis/balance.ts:155–166`

The code currently pushes red/yellow `Warning` objects for missing movement patterns. This was decided against — patterns are displayed neutrally (present/absent), with no severity and no score impact. Remove the two `warnings.push()` calls. The `movementPatternsCovered` / `movementPatternsMissing` arrays are already returned and rendered correctly in the UI.

### 1b. Fix front-squat catalog entry
`src/lib/catalog/exercises.generated.json` — entry `id: "front-squat"`

Currently has `movementPatterns: []` and `tags: []`. Change to:
- `movementPatterns: ["squat"]`
- `tags: ["compound"]`

Removes false "missing squat pattern" warning for OL programs that front-squat.

### 1c. Remove single-week program score penalty
`src/lib/analysis/score.ts:56`

`if (result.weeksDetected <= 1) score -= 30` — remove this line. The warning message already communicates "single-week program — consider adding progressive overload." The `-30` score hit is disproportionate and punishes the most common real-world use pattern (a user uploading a representative week).

### 1d. Display zero-set muscles as "Not trained" and exclude from scoring
`src/lib/analysis/volume.ts` — `classifyVolume`, `scoreVolume`  
`src/lib/analysis/score.ts` — `scoreVolumeDimension`  
`src/lib/analysis/toDisplayAnalysis.ts`

Two changes:

**Display:** `classifyVolume` returns `{ severity: "green", label: "Not trained" }` when `sets === 0`. A powerlifter choosing not to train biceps is not making an error.

**Scoring:** `scoreVolumeDimension` currently filters `effectiveSets > 0 || landmarks.mev > 0`, which includes zero-set muscles in the score. Change to filter `effectiveSets > 0` only — muscles the program does not train are excluded from the volume score entirely. Scoring only muscles that are actually trained makes the volume dimension a measure of "are the muscles you're training at the right volume?" rather than "are you training all recommended muscles?" — the latter is a goal-specific question that tier 3 handles properly.

---

## Tier 2 — Fuzzy Load Parser + Peak Week Detection

### 2a. `parseLoad(s: string)` utility
New file: `src/lib/analysis/parseLoad.ts`

The `ProgramExercise.load?: string` field is populated by the LLM but never consumed. LLM output is inconsistent — the parser must tolerate all of:
- `"80% 1RM"`, `"80%"`, `"~80%"`
- `"RPE 8"`, `"@8"`, `"rpe8"`, `"8 RPE"`
- `"3RIR"`, `"3 RIR"`, `"rir 3"`
- `"5RM"`, `"5 rep max"`, `"5-rep max"`
- Combinations: `"85% 1RM @ RPE 8"`, `"3RM ~90%"`

Return type:
```ts
type ParsedLoad = {
  pct1rm?: number;   // 0–100
  rpe?: number;      // 0–10
  rir?: number;      // 0–10
  repMax?: number;   // 1–20
}
```

Unknown or malformed input returns `{}`. Never throws. RIR and RPE are convertible (`rpe = 10 - rir`); normalise to RPE internally, expose both.

### 2b. Peak week detection in periodization analysis
`src/lib/analysis/periodization.ts`

Current: `deloadDetected = lastWeekVolume <= maxVolume * 0.7`

Extended logic:
1. Compute average parsed intensity for each week (mean of non-null `pct1rm` or `rpe` values across all exercises in that week).
2. A week is a **peak week** if: volume drops ≥30% from max AND (average `pct1rm` ≥ 85 OR average `rpe` ≥ 8.5 OR average reps ≤ 3).
3. A week is a **deload week** if: volume drops ≥30% from max AND it does NOT meet peak week criteria.
4. `PeriodizationResult` gains a `peakWeekDetected: boolean` field.
5. Suppress the "no deload week" warning when `peakWeekDetected === true`.

When intensity data is absent (no load fields populated), fall back to the current set-count-only heuristic — peak week detection is a best-effort enhancement.

---

## Tier 3 — Style Detection and Goal-Conditional Volume Landmarks

### 3a. Training style on Program type
`src/lib/programs/types.ts`

Add optional field:
```ts
trainingStyle?: "strength" | "hypertrophy" | "olympic_lifting" | "powerbuilding" | "mixed"
```

When set, this value is used directly and bypasses inference. The UI needs a way to set/clear this field (likely a selector in program settings — out of scope for this spec, but the data model must support it).

### 3b. Style detection
New file: `src/lib/analysis/detectStyle.ts`

Input: `ProgramDay[]` plus optionally the parsed load data from tier 2.

Scoring signals (each normalised 0–1):
| Signal | Strength | Hypertrophy | Olympic | Powerbuilding |
|---|---|---|---|---|
| Section type composition | "strength" sections dominant | "hypertrophy"/"accessory" dominant | "olympic" sections present | mixed types |
| Compound/isolation ratio | >0.85 | 0.5–0.75 | >0.95 | 0.7–0.85 |
| Rep range mode | 1–5 | 6–15 | 1–5 (competition) + 2–6 (squat variants) | 1–5 (compounds) + 6–15 (accessories) |
| Load signal | pct1rm ≥ 80 common | pct1rm 60–75 common | pct1rm ≥ 80 with ≤5 rep exercises | mixed |

Each style gets a score 0–1. Primary = highest scorer. Secondary = second-highest, omitted if < 0.3. If primary < 0.5, primary = "mixed".

Return:
```ts
type StyleDetection = {
  primary: TrainingStyle;
  secondary?: TrainingStyle;
  confidence: number;  // 0–1, score of the primary style
}
```

### 3c. Goal-conditional volume landmark application
`src/lib/analysis/volume.ts` — `scoreVolume` and `countWeeklyVolume`

Current: single `VOLUME_LANDMARKS` table applied to all muscles.

New: landmark selection depends on the exercise's role:

**For strength / OL / powerbuilding programs:**
- Identify *competition/primary compound* exercises: squat and squat variants, bench press variants, deadlift variants, snatch variants, clean & jerk variants. These are identified via exercise catalog `tags` (pattern: `"compound"` + movement pattern `"squat"` / `"hip_hinge"` / `"horizontal_push"`).
- For primary muscles of those exercises: use strength-oriented landmarks (lower MEV/MAV thresholds — strength athletes do fewer sets at higher intensity).
- For all other muscles (accessories, isolation): use current hypertrophy landmarks.

**For hypertrophy programs:** current landmarks unchanged.

**For mixed / general:** current landmarks, but zero-set muscles never penalised in score (display-only, no severity).

New constant in `thresholds.ts`:
```ts
export const STRENGTH_VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = { ... }
```

Values are a **required research step** before implementing 3c — derive from strength-sport programming literature (Sheiko, Prilepin, RP Strength). Key differences from hypertrophy landmarks: lower MEV/MAV for quads/hamstrings/glutes (high-volume squat work is expressed as fewer higher-intensity sets), near-zero MEV for arms/calves/isolation muscles (direct arm work is optional in strength programming), lower MRV across the board (strength athletes recover from fewer total sets at higher intensity).

### 3d. Frequency analysis (informational)
New sub-result on `AnalysisResult`: `muscleFrequency: Record<MuscleGroup, number>` — distinct training days per muscle per week.

Displayed as an informational note, not a scored dimension. For hypertrophy programs: note muscles trained only 1x/week (bro split pattern). For strength programs: note if primary lifts are trained fewer than 2x/week (below typical strength programming frequency). No score impact.

### 3e. Expanded periodization detection
`src/lib/analysis/periodization.ts`

With intensity data from tier 2, detect:
- **Block periodization:** volume-stable weeks with week-over-week load increase → "Intensity block"
- **DUP:** multiple rep ranges for the same muscle within a single week → "Daily undulating periodization"
- **Conjugate:** max effort + dynamic effort sections within the same week → "Conjugate"
- **Linear progression:** consistent load or volume increase week over week → "Linear"

Existing "static volume" penalty (`-20`) is suppressed when block periodization is detected.

---

## Data Flow Summary

```
Program
  └─ trainingStyle? (user override)
  └─ ProgramDay[]
       └─ exercise.load  →  parseLoad()  →  ParsedLoad
       └─ exercise.reps
       └─ exercise.tags
       └─ section.type

detectStyle(days, loads) → StyleDetection  [skipped if trainingStyle set]

analyzePeriodization(days, loads, weeklyReps) → PeriodizationResult + peakWeekDetected

scoreVolume(volumes, style) → MuscleVolumeResult[]  [landmark selection depends on style]

analyzeBalance(days) → BalanceResult  [movement pattern warnings removed]
```

---

## Out of Scope

- CrossFit-specific analysis (conditioning-based fatigue, AMRAP tracking)
- SRA cycle analysis (tracked separately in `/future-ideas.md`)

---

## Additional In-Scope Items

### trainingStyle UI control
`src/` — program settings/detail view (component TBD at implementation time)

A selector that lets the user set or clear `trainingStyle` on a program. Options: "Auto-detect", "Strength / Powerlifting", "Hypertrophy", "Olympic Lifting", "Powerbuilding", "Mixed / General". When set to anything other than "Auto-detect", inference is bypassed. This is a UI task that is independent of the analysis logic and can be implemented once the data model change (3a) is in place.

### Snatch / C&J movement pattern detection
`src/lib/catalog/exercises.generated.json` + `src/lib/analysis/muscles.ts` — `detectMovementPatterns`

Olympic lifting movements are currently invisible to movement pattern detection. The snatch touches multiple patterns at different phases (hip hinge, vertical pull, overhead squat/vertical push); the clean is hip hinge + vertical pull; the jerk is vertical push.

Two-part fix:
1. **Catalog enrichment:** Tag snatch variants, clean variants, and jerk variants with the appropriate `movementPatterns`. Given the multi-phase nature, assign the *dominant* pattern(s): snatch → `["hip_hinge", "vertical_pull"]`, clean → `["hip_hinge", "vertical_pull"]`, jerk → `["vertical_push"]`. Snatch also covers `"squat"` when performed as a squat snatch — tag squat-style snatch variants accordingly.
2. **`detectMovementPatterns` in `muscles.ts`:** No code change needed if catalog tags are correct — the function already reads from the catalog. Verify after catalog update that OL programs show their covered patterns correctly.
