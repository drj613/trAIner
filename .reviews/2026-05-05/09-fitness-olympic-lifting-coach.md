# Fitness Domain Review: Olympic Lifting / Athletic Performance Coach Perspective

Reviewer: Olympic Weightlifting / Athletic Performance Coach (USAW, NSCA)  
Date: 2026-05-05  
Scope: `src/lib/analysis/` — OL/athletic performance domain correctness

---

## Summary

The analysis framework breaks down significantly for Olympic lifting and CrossFit programming. Soviet block periodization is fundamentally invisible. Peak weeks are misidentified as deloads. Bicep MEV warnings are actively harmful for this population. The section-type vocabulary is adequate but goal weighting undermines its utility.

---

## 1. Explosive/Power vs. Grinding Strength — Rating: QUESTIONABLE

**`muscles.ts:62`** — `getEffectiveSets()` returns a flat set count with no intensity awareness. A snatch at 85% and a squat at 85% are counted identically. This is acceptable as a hypertrophy proxy but breaks down for power development where neural demand, technical complexity, and recovery requirements per set are fundamentally different.

**Session duration** (`session.ts:31`): `totalSets * 3 + 10` minutes assumes ~3 min per set. Heavy OL sets require 4–6 min rest. A 5×3 snatch session takes 25–35 min, not the formula's 15 sets × 3 min estimate. Wrong by design for strength work.

**Sound element:** `repMidpoint` correctly classifies ≤5-rep sets as "heavy"; `GOAL_REP_RANGES` sets OL's heavy fraction target at 0.70 — a reasonable approximation.

---

## 2. Position Work / Pause Variations as Distinct Categories — Rating: QUESTIONABLE

The `SECTION_TYPES` include `explosive`, `power`, `strength`, `mobility`, `rehab`, `accessory` — adequate vocabulary. **But no section type for position/technical work** (snatch balance, drop snatch, tall cleans, segment pulls, pause variations at specific positions).

**Catalog data quality issue:** `pause-squat-barbell` and `pause-deadlift-barbell` have empty `movementPatterns: []` and `tags: []` — they contribute zero to movement pattern detection, zero to goal inference, and zero to balance analysis.

**`GOAL_SECTION_WEIGHTS` for `olympic_weightlifting`** (`thresholds.ts:70`): `{ explosive: 1.0, power: 0.9, strength: 0.7, mobility: 0.5 }`. The `accessory` section type scores **0**. Snatch balance sets, pause squats, and jerk balance drills placed in an `accessory` section contribute nothing to OL goal confidence.

---

## 3. Soviet Block / Conjugate Periodization — Rating: MISLEADING

The periodization system at `periodization.ts` operates on set count per week as a volume proxy. Soviet block periodization tracks tonnage (sets × reps × load), average training intensity (ATI), and frequency distributions of competition lifts vs. derivatives. None of this is captured.

**Critical failure — peak week falsely identified as deload:**

```ts
const deloadDetected = lastWeekVolume <= maxVolume * 0.7 && weeklyVolumes.length >= 3;
// periodization.ts:35
```

In a Prilepin-style OL peaking block, the final pre-competition week drops to 3×1 at 90–95% — perhaps 6–8 total sets. The preceding accumulation weeks might have 25–30 sets. The system computes: `6 ≤ 30 × 0.7 = 21` → `deloadDetected = true`. **This is functionally incorrect.** A peak week with maximal singles is the most demanding training of the entire cycle.

**`score.ts:65`** penalizes `volumePattern === "static"` at -20 points. Many high-level OL programs maintain constant set counts while manipulating intensity week-to-week — these receive a spurious penalty for perfectly structured programming.

Conjugate sequencing is not detectable at all (requires tracking exercise selection rotation).

---

## 4. Volume Calculations for OL Programs — Rating: MISLEADING

MEV/MAV/MRV landmarks are sourced from Renaissance Periodization's hypertrophy-science framework. For OL athletes:

**`thresholds.ts:11` — `biceps: { mv: 7, mev: 9 }`**: The highest maintenance floor. An Olympic lifter doing zero direct bicep work (universal in OL programming) receives a **RED "Below maintenance" warning**. This is coaching malpractice directed at a population where direct arm work is contraindicated for skill development.

**`thresholds.ts:17` — `calves: { mv: 3 }`**: OL athletes do zero calf isolation work but receive exceptional calf development from positional demands. System flags this RED.

**Snatch volume fragmentation:** `countWeeklyVolume` applies `1.0 / 0.5 / 0.25` weighting. For the snatch with primary=`quads` and secondary including shoulders, lats, traps, glutes, hamstrings — snatch sets count fractionally toward 7 different muscle groups simultaneously, diluting all counts and causing cascade of false below-MEV warnings.

---

## 5. Conditioning / Energy System Work — Rating: QUESTIONABLE

Section type vocabulary includes `metcon`, `cardio`, `conditioning` — positive. CrossFit goal correctly weights these.

**But conditioning has zero representation in volume, balance, and session analysis.** `countWeeklyVolume` maps exercises to `MuscleGroup`. Conditioning work (assault bike, rowing, burpees, running) maps to `core` via `"full body"` catch-all or falls through as untracked. A 20-minute AMRAP of kettlebell swings and box jumps generates approximately 0 muscle volume for every group.

**CrossFit session duration:** A metcon with 1 recorded "set" of a 20-minute AMRAP contributes 3 minutes to duration estimate. The actual duration is 30 minutes. Systematic underestimation by 3–5×.

**`GOAL_SECTION_WEIGHTS` for `olympic_weightlifting` has no conditioning key** — GPP conditioning work scores 0 toward OL goal confidence.

---

## 6. Section-Type System for OL Structure — Rating: ACCEPTABLE

Available section types (`warmup`, `explosive`, `strength`, `power`, `accessory`, `metcon`, `mobility`) provide adequate vocabulary for OL program structure.

**Gaps:**
- No section type for "position work," "technical drills," or "skill practice."
- `warmup` section scores 0 for all goals, including OL. Technical warmup (empty barbell work, segment lifts, position drills) accounts for 20–30% of OL session time but is invisible to goal inference.
- Generic `training` section scores 0 across all goals — AI-generated OL programs using this type are goal-invisible.

---

## 7. CrossFit Program Analysis — Rating: QUESTIONABLE

**Sound:**
- `crossfit` archetype exists with correct section weights.
- `GOAL_COMPOUND_RATIO` correctly sets CrossFit at 0.85–0.95.
- `scoreTagSignals` correctly boosts CrossFit score for explosive modifiers.

**Problems:**
- **`SESSION_LIMITS.yellowMax: 10` exercises.** A CrossFit chipper (10-movement workout) with a strength component receives RED warnings for exercise count. Normal CrossFit programming flagged as excessive.
- **A CrossFit week with 4 metcons** (each 1 recorded "set") produces near-zero muscle volume counts. Every muscle shows RED "Below maintenance." A CrossFit athlete reading this analysis would incorrectly conclude their program has severe development gaps.
- **Gymnastics movements** (muscle-ups, handstand push-ups, toes-to-bar) have inconsistent catalog entries — movement pattern detection will skew toward muscle groups that happen to have well-tagged catalog entries.

---

## 8. Confirmed Actively Misleading Outputs

| Case | File:Line | Issue |
|---|---|---|
| Bicep volume warnings for OL athletes | `thresholds.ts:11` | RED for not doing curls — no valid OL interpretation |
| Front squat as invisible movement | `exercises.generated.json:front-squat` | Empty `movementPatterns`, `tags` — RED "missing squat pattern" warning for a front-squat-based program |
| Peak week falsely identified as deload | `periodization.ts:35` | Low set count at maximum intensity = "deload detected" |
| Missing horizontal patterns warning | `balance.ts:130-135` | OL competition prep (no horizontal press/row) = RED for "missing movement patterns" |
| Snatch contributes zero core patterns | `muscles.ts:108-138` | The defining OL movement is invisible to balance analysis |

---

## Top Priority Fixes

1. **Goal-conditional volume landmarks** — suppress hypertrophy-centric MEV warnings when `goal.primary === "olympic_weightlifting"`. At minimum, zero MV floor for biceps, calves, isolation muscles.

2. **Fix front squat catalog entry** — add `movementPatterns: ["squat", "compound"]` and `tags: ["compound", "strength"]`. One-line data fix with cascading correctness improvements.

3. **Fix deload detection to exclude high-intensity final weeks** — if final week has high proportion of 1-rep sets, classify as "competition peak week" not "deload."

4. **Suppress horizontal pattern requirements for OL goal** — when `goal.primary === "olympic_weightlifting"`, required core patterns should exclude horizontal push/pull.

5. **Register OL movements in pattern detection** — `detectMovementPatterns` needs a branch for `patterns.includes("olympic weightlifting")` mapping snatch to hip_hinge + vertical_pull, jerk to vertical_push.
