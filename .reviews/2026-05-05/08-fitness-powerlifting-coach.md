# Fitness Domain Review: Powerlifting Coach Perspective

Reviewer: Powerlifting Coach (Sheiko, RTS/RPE, conjugate, evidence-based)  
Date: 2026-05-05  
Scope: `src/lib/analysis/` — powerlifting domain correctness

---

## Summary

The analysis system applies RP hypertrophy-science landmarks universally. For a powerlifter, this produces actively misleading scores. A Sheiko-style program would likely score C or D overall while a balanced hypertrophy split scores B+/A. None of the truly critical powerlifting-specific concepts (intensity distribution, competition lift specificity, SRA cycles, peaking structure) exist anywhere in the codebase.

---

## 1. Volume Calculation — Rating: MISLEADING

**`muscles.ts:62`** — Every set counted identically regardless of %1RM, RPE, or intent. A 5×1 at 97% 1RM and a 3×15 pump set both contribute the same "effective sets" to quads.

**`thresholds.ts:14` — Quads: `{ mv:3, mev:5, mavLow:6, mavHigh:14, mrv:18 }`** — These are RP-derived hypertrophy landmarks. A Sheiko program running squats 3×/week at 75-85% for 5-6 sets per session (18 sets/week) would be flagged yellow ("High — approaching limit"). In powerlifting terms that is a moderate, well-managed training block.

**`thresholds.ts:11` — `biceps: { mv:7, mev:9 }`** — A powerlifter doing 0 direct biceps work (common and defensible across Sheiko, RTS, and most elite programs) scores red. This warning has no valid interpretation for this population.

---

## 2. Intensity / RPE Tracking — Rating: MISLEADING

Zero intensity tracking anywhere. No RPE field in `types.ts`. No percentage-of-1RM. The only intensity proxy is rep range:

```ts
if (mid <= 5) heavy += sets;   // goals.ts:59
```

This conflates rep range with intensity. A 5×5 at 60% and a 5×5 at 95% are treated identically. The analysis cannot distinguish:
- Accumulation block (high volume, 70-80% 1RM, RPE 6-8) from realization block (low volume, 90%+, RPE 9-10)
- Technique work (50-60%, high reps) from true max effort work
- An RTS-style daily max from a Westside ME session

---

## 3. Periodization Detection — Rating: Questionable

**`periodization.ts:37-55`** — Entire periodization analysis is a set-count trajectory. Detects four patterns: static, increasing, decreasing, wave. That's it.

**Classification errors:**
- Linear accumulation with deload (Weeks 1-2-3-deload) is classified as "wave" because the last diff is negative — same label as true DUP.
- Deload detection only checks the final week. Mid-block deloads are missed.
- The 70% threshold is too aggressive — programmed light weeks at 75-80% of peak are missed.

**Missing entirely:**
- Conjugate recognition (ME + DE days)
- DUP detection (same muscle at different rep ranges within the week)
- Intensity wave detection
- Peaking block detection (volume declining while intensity increases)
- SRA cycle length analysis

`PeriodizationResult` type has only four fields (`weeksDetected`, `volumePattern`, `deloadDetected`, `warnings`) — no periodization style, no intensity progression data.

---

## 4. How a Sheiko Program Would Score — Rating: MISLEADING

Sheiko #37 profile: 4 days/week, squat+bench 3-4×/week, deadlift 2×/week, 20-30 sets/session, rep ranges primarily 4-6, no isolation work, no exercise taken to failure.

**Session dimension** (`thresholds.ts:26`): `greenMax: 25, yellowMax: 30`. A full Sheiko Day 1 (squat+bench+squat) commonly runs 28+ working sets → yellow or red.

**Volume dimension**: Biceps = 0 direct sets → `mev: 9` → RED. This penalizes a powerlifting program for not doing curls.

**Balance dimension**: High bench frequency may exceed push:pull warnMax of 1.5:1 → red warning. In powerlifting, bench volume appropriately exceeds row volume.

**Overall weighting** (`thresholds.ts:49-55`): `volume: 30%, balance: 25%` = 55% of score. Both heavily penalize powerlifting-style programming.

**Estimated score:** Sheiko program likely scores C or D. The `imbalancedProgram` fixture (chest bro split) would score comparably or better due to lower session sets and partial coverage of accessory muscles.

---

## 5. Movement Pattern Identification — Rating: Acceptable / Questionable

The six patterns (horizontal push/pull, vertical push/pull, hip hinge, squat) are the right framework. Detection logic is reasonable.

**Problem for powerlifting:** The system treats missing any one pattern equally. Missing `vertical_pull` in a powerlifting program is completely acceptable; missing `squat` or `hip_hinge` is a red flag of a different magnitude. No differentiation based on goal.

---

## 6. Squat/Hinge Sufficiency Check — Rating: Questionable

Even if the system correctly identifies a "strength" goal, there is no check that validates: "where is the squat? where is the deadlift?" `scoreGoalCoherence` uses `goal.confidence × 100` regardless of whether competition lifts are present. No exercise allowlist per goal archetype.

`balance.ts:102-108` — "No lower body training" only fires if `lowerSets === 0`. A bench-only powerlifting variant with some deadlifts passes this check even though the squat (a competition lift) is absent.

---

## 7. What Would Actively Mislead a Powerlifter

| Issue | File:Line | Impact |
|---|---|---|
| Biceps MEV penalties | `thresholds.ts:11` | Red warning for not doing curls — no valid interpretation |
| Session set caps | `thresholds.ts:26` | Smolov Jr., Sheiko flagged as excessive |
| 3-min/set duration estimate | `session.ts:31` | Underestimates by 30-50% for 4-min rest strength work |
| Decreasing volume = valid peaking | `periodization.ts:47-53` | Correct meet prep receives no credit |
| No `powerlifting` archetype | `types.ts:18-20` | Goal coherence collapses for competition-focused programs |
| Push:pull threshold | `thresholds.ts:33-34` | Bench-heavy programming flagged as dangerous |

---

## Critical Recommendations

1. Add a `powerlifting` goal archetype with required movement checks for squat, bench, deadlift presence
2. Separate volume landmarks by goal — hypertrophy landmarks do not apply to strength programs
3. Add intensity tracking — at minimum, rep-range-based intensity zones at the exercise level
4. Exempt isolation muscles from MEV penalties when goal is `strength` or `powerlifting`
5. Raise `SESSION_LIMITS.totalSets.greenMax` to at least 35 or make it goal-dependent
6. Add competition-lift frequency checks for powerlifting (squat ≥2×/week, bench ≥2×/week, deadlift ≥1×/week)
7. Differentiate movement pattern criticality by goal
