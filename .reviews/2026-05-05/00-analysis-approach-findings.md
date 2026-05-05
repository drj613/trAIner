# Routine Analysis — Approach Findings
Date: 2026-05-05  
Source reviews: 06–09 (fitness domain specialists), plus analysis-calibration observations from 03  
Scope: `src/lib/analysis/` — fitness-domain correctness, analytical framework validity

These findings are about *what the analysis system assumes good training looks like*, not about code bugs in the strict sense. A different severity scale applies: **Misleading** = produces actively wrong guidance for real users. **Questionable** = may mislead in common scenarios. **Acceptable** = reasonable simplification with known limitations. **Sound** = grounded in fitness science.

---

## Frame: Who the System Is Calibrated For

The analysis framework borrows the correct vocabulary — MEV/MAV/MRV, per-muscle set counts, six movement patterns, compound/isolation ratio — from Renaissance Periodization (Israetel et al.) and the broader hypertrophy-science literature. These are the right tools for a general-fitness or muscle-building trainee.

The problem is that **all thresholds, scoring weights, and scoring logic are calibrated for hypertrophy/RP science and applied universally**. When the same framework is applied to a powerlifter, an Olympic lifter, or a CrossFit athlete, it does not just give a lower score — it gives wrong guidance that may lead a real user to modify a well-designed program in a harmful direction.

The findings below are grouped by the type of failure, not by reviewer.

---

## 1. The Deload/Peak-Week Confusion — MISLEADING

`src/lib/analysis/periodization.ts:35`

```ts
const deloadDetected = lastWeekVolume <= maxVolume * 0.7 && weeklyVolumes.length >= 3;
```

The system detects deload by checking whether the final week's **set count** drops to ≤70% of the peak set count. For Olympic lifting and strength-sport peaking, the opposite is true: the pre-competition week drops to 3×1 at 90–95% 1RM — perhaps 6–8 total sets versus 25–30 in accumulation weeks. The formula computes `6 ≤ 30 × 0.7 = 21 → deloadDetected = true`.

**A peak week performing maximal singles at 90–95% is labeled "deload detected."** For an OL athlete who understands that a "deload" in a pre-comp week means rest and recovery, seeing this label could prompt them to modify their peaking block.

The root cause is that set count is the only volume proxy. Intensity (% 1RM, RPE, rep maxes) is invisible. There is no mechanism to distinguish high-intensity/low-volume from low-intensity/low-volume.

This is the highest-risk finding in the entire analysis system.

---

## 2. Volume Landmarks Are Hypertrophy-Specific, Applied to All Goals — MISLEADING

`src/lib/analysis/thresholds.ts`

All 19 muscle groups have a single set of `{ mv, mev, mavLow, mavHigh, mrv }` values. These values are sourced from RP hypertrophy science. There is no goal-conditional branching.

**Concrete cases where this actively misleads:**

**Biceps (mv: 7, mev: 9):** A powerlifter or Olympic lifter doing zero direct biceps work receives a RED "Below maintenance" warning. Direct arm work is contraindicated in OL programming (risks biceps tendon under supramaximal eccentric load on missed snatches). The warning has no valid interpretation for this population.

**Quads (mev: 5, mavHigh: 14, mrv: 18):** A Sheiko program running squats 3×/week at 75–85% for 5–6 sets/session accumulates ~18 sets/week of quad work — flagged yellow ("High — approaching limit"). In powerlifting, that is a moderate, well-managed block.

**Calves (mv: 3):** OL athletes receive exceptional calf development from positional demands (triple extension) but do zero calf isolation work. Flagged RED.

**Rear delts (mev: 2):** Dangerously low for hypertrophy purposes. Programs doing 4 sets of rows with no direct rear delt work read as "productive range." Most hypertrophy coaches require dedicated rear delt isolation to reach MEV.

**Practical consequence:** A Sheiko #37 profile (4 days/week, high-frequency squat/bench/deadlift, no isolation) would likely score **C or D overall**. A balanced hypertrophy split (moderate frequency, full accessory complement) scores **B+/A**. The scoring is inverted for strength-sport athletes.

---

## 3. No Intensity Tracking of Any Kind — MISLEADING

The analysis has zero representation of intensity — no %1RM, no RPE/RIR field, no rep-max notation. Set count is the only variable in every dimension.

**Consequences:**
- 3×5 at 90% 1RM and 3×15 pump sets contribute identical "effective sets" to quads.
- Accumulation blocks (high volume, 70–80%, RPE 6–8) and realization/peaking blocks (low volume, 90%+, RPE 9–10) are indistinguishable.
- Technique work (50–60%, 5+ reps, focus on bar path) looks identical to true max effort.
- Progressive overload across weeks — 3×10 → 3×8 → 3×5 — shows as "decreasing volume" with no recognition of increasing intensity.

The `ProgramExercise` type has a `load?: string` field that the LLM is instructed to populate (e.g. "80% 1RM"), but it is never read by any analysis module. The data is available in principle.

---

## 4. Periodization Detection Is Set-Count Trajectory Only — QUESTIONABLE

`src/lib/analysis/periodization.ts`

The entire periodization model detects four patterns (static, increasing, decreasing, wave) based on set-count changes per week. No periodization style is identifiable from this data.

**What cannot be detected:**
- **Conjugate/Westside:** Max effort rotation + dynamic effort — requires tracking exercise selection variation and intensity, not just set count.
- **Daily undulating periodization (DUP):** Multiple rep ranges for the same muscle within a week. The system would label a DUP week with equal set counts in heavy/moderate/light work as "static."
- **Block periodization (Soviet/OL model):** Volume-stable, intensity-progressing mesocycles are indistinguishable from true static volume.
- **Peaking:** A block where volume decreases and intensity increases receives no special recognition — just "decreasing volume pattern."
- **SRA cycle analysis:** The system has no concept of stimulus, recovery, and adaptation cycle length.

The `-20` penalty for `volumePattern === "static"` punishes Soviet-style block periodization (which holds set count constant while ramping %1RM week by week) as poorly structured.

---

## 5. Frequency Analysis Is Completely Absent — MISLEADING (for hypertrophy goals)

No analysis module checks how many distinct training days each muscle group is stimulated per week.

`countWeeklyVolume` folds all days into a single accumulated total. A classic bro split (16 sets of chest Monday, zero sets of chest Tuesday–Sunday) and a PPL split (8 sets chest Monday + 8 sets chest Thursday) produce **identical `effectiveSets` and identical severity ratings**.

This is the single largest gap relative to hypertrophy science. Two-times-per-week frequency is among the most consistently supported hypertrophy variables (Schoenfeld meta-analyses 2016/2019). The analysis will explicitly validate bro splits as equivalent to higher-frequency designs for a hypertrophy goal user.

The data to compute frequency is available — `ProgramDay` has `dayNumber` and `weekNumber`. No module uses it.

---

## 6. Session Duration Formula Assumes Hypertrophy Rest Intervals

`src/lib/analysis/session.ts:31` — `estimatedMinutes = totalSets * 3 + 10`

3 minutes per set is appropriate for hypertrophy work (60–90s between sets). For strength and OL work where rest intervals are 3–5 minutes, the estimate is wrong by 30–50%:

- Sheiko Day 1: 28 working sets × 4 min rest = ~122 min actual. Formula says 94 min.
- OL snatch session: 5×3 snatch + 5×3 back squat = 30 sets × 5 min = ~160 min. Formula says 100 min.
- CrossFit 20-min AMRAP logged as 1 "set": formula estimates 13 min for a 20-min workout.

---

## 7. Session Set Caps Flag Normal Strength and CrossFit Sessions

`src/lib/analysis/thresholds.ts:26–27`

```ts
totalSets: { greenMin: 10, greenMax: 25, yellowMax: 30 }
exercises: { greenMin: 4, greenMax: 8, yellowMax: 10 }
```

**For powerlifting (Sheiko/Smolov style):** A full Sheiko Day 1 (squat + bench + squat) commonly runs 28+ working sets → yellow/red. Smolov base cycle days exceed 30 sets.

**For CrossFit:** A chipper workout with 10 movements hits `yellowMax: 10` exercises immediately. A 4-metcon week with each metcon recorded as a session comfortably exceeds the set cap. Normal CrossFit programming is flagged as excessive.

---

## 8. Push:Pull Accounting Is Broken for Posterior-Chain Programs

`src/lib/analysis/muscles.ts:94–101`

The `classifyMovement` function routes hinge movements (deadlift, RDL, good morning) to `"other"`, not `"pull"`. See also technical finding H17.

The fitness-domain consequence: a posterior-chain-heavy powerlifting program (squat + bench + deadlift with rows as accessories) has all its deadlift/RDL volume excluded from the pull count. The push:pull ratio skews toward push-dominant, and the system warns to add more pulling work to a program that has substantial posterior-chain stimulus.

---

## 9. Movement Pattern Requirements Should Be Goal-Conditional

`src/lib/analysis/balance.ts:126–142`

Missing any of the six core movement patterns (horizontal push, horizontal pull, vertical push, vertical pull, hip hinge, squat) triggers a yellow or red warning regardless of training goal.

**Powerlifting:** Competitive powerlifters in a meet-prep block commonly eliminate vertical pulling (lat pulldown, pull-up) and all horizontal pressing beyond competition bench. The system flags this as RED missing patterns.

**OL competition prep:** OL athletes do not typically program horizontal pressing. They correctly avoid it in peak weeks. The system flags this as RED missing movement patterns.

**Fix shape:** Movement pattern requirements should be conditional on `goal.primary`. When `goal.primary === "olympic_weightlifting"`, horizontal push/pull should not be required. When `goal.primary === "strength"`, missing a vertical pull pattern should be a yellow note, not a red warning.

---

## 10. OL-Specific Structural Gaps — MISLEADING

### Snatch and clean/jerk are invisible to movement pattern detection

`src/lib/analysis/muscles.ts:108–138`

`detectMovementPatterns` has no branch for Olympic lifting patterns. The snatch — the defining OL movement — contributes zero to any of the six core patterns. A program containing only snatch, clean, and jerk variations would have all six patterns flagged as missing.

The snatch is simultaneously a hip hinge, vertical pull, overhead squat, and vertical push at different phases. None of this is captured.

### `accessory` section type scores 0 for OL goal inference

`src/lib/analysis/thresholds.ts:70`

`GOAL_SECTION_WEIGHTS["olympic_weightlifting"]`: `{ explosive: 1.0, power: 0.9, strength: 0.7, mobility: 0.5 }`. The `accessory` type scores 0. Snatch balance, jerk balance, pause squats, and position drills — all commonly placed in an `accessory` section — contribute nothing to OL goal confidence.

### Front squat catalog entry has empty `movementPatterns` and `tags`

`exercises.generated.json` — `front-squat-barbell` (and likely variants) has `movementPatterns: []`, `tags: []`. Any front-squat-based program receives a false RED "missing squat pattern" warning despite front squat being one of the primary OL assistance movements.

---

## 11. Goal Inference Has Structural Gaps

### No `powerlifting` archetype
`src/lib/analysis/goals.ts:6–9` and `types.ts`

The six archetypes are: `hypertrophy, strength, olympic_weightlifting, general_fitness, crossfit, rehab`. There is no `powerlifting` archetype. Competition-focused programs score against `strength`, which has different thresholds (compound ratio target 0.85–0.95, `GOAL_COMPOUND_RATIO[strength].min`) and no requirement to verify the presence of squat, bench, and deadlift.

### No `powerbuilding` archetype
Powerbuilding (deliberate blend of strength and hypertrophy) is an extremely common self-directed training goal. The system has no archetype for it. A well-designed powerbuilding program will show low goal confidence because it blends signals that look incoherent to the classifier.

### `GOAL_COMPOUND_RATIO[strength]` is too high
`src/lib/analysis/thresholds.ts:77`

`{ min: 0.85, max: 0.95 }`. Most powerlifting programs include significant accessory work; the realistic compound ratio is 0.70–0.85. Programs within the actual powerlifting norm are penalized.

### Confidence formula is a mathematical artifact
`src/lib/analysis/goals.ts:24`

```ts
const confidence = primaryScore / (primaryScore + secondaryScore || 1);
```

When `secondaryScore = 0` and `primaryScore > 0`, this simplifies to `primaryScore / primaryScore = 1.0`. A program with a single exercise faintly matching one archetype returns 100% confidence. This feeds the overall score at 15% weight.

### Goal coherence penalizes intentional blending
A deliberately balanced powerbuilding program scores low goal coherence because the confidence formula interprets balanced signal as ambiguity. The system has no concept of "coherent blending" — only "dominant archetype."

---

## 12. Volume Scoring Penalizes Skipping Optional Muscles

`src/lib/analysis/score.ts:23`

`scoreVolumeDimension` includes almost every muscle (16 of 19 have `mev > 0`) even when not trained. Programs that legitimately skip direct forearm, adductor, abductor, or calf work take red marks dragging down the volume score.

For a powerbuilder or powerlifter: skipping forearms and adductors is not a programming error. For a CrossFit athlete: the volume model has no concept of conditioning-based fatigue management that justifies fewer isolation sets.

---

## 13. Scoring Weights Are Calibrated for Hypertrophy/RP

`src/lib/analysis/thresholds.ts:49–55`

```ts
volume: 0.30, session: 0.20, balance: 0.25, goalCoherence: 0.15, periodization: 0.10
```

Volume (30%) and balance (25%) together = 55% of total score. Both dimensions heavily penalize non-hypertrophy programming:
- Volume: RP-derived muscle landmarks → penalizes powerlifting and OL
- Balance: universal movement pattern requirements → penalizes sport-specific prep

Periodization (10%) is too low to meaningfully reward multi-week structured programs.

---

## Summary: What Is Sound, Acceptable, or Missing

| Area | Rating | Notes |
|---|---|---|
| Tiered volume counting (1.0/0.5/0.25) | Sound | Correct methodology for hypertrophy |
| Six core movement patterns | Sound | Standard FMS framework |
| Push:pull thresholds (warnMax 1.5:1) | Sound | Correct for shoulder health |
| Rep range bins (≤5 heavy, ≤12 moderate) | Acceptable | Slightly outdated (meta-analysis supports broader ranges) |
| Single set of volume landmarks for all goals | Misleading | RP hypertrophy values applied universally |
| Deload detection from set count | Misleading | Inverts OL/strength peak weeks |
| No intensity tracking | Misleading | Renders periodization analysis near-useless for strength sports |
| Frequency analysis absent | Misleading | Bro split = PPL in this system (for hypertrophy users) |
| Session set caps | Questionable | Flag normal Sheiko/Smolov/CrossFit sessions |
| Single-week program penalty | Questionable | Penalizes the most common real-world use pattern |
| Goal archetype coverage | Questionable | Missing powerlifting, powerbuilding |
| Movement pattern requirements unconditional | Questionable | Wrong for OL/strength-sport prep |
| OL movement pattern detection | Misleading | Snatch/clean/jerk invisible to the system |
| Peak week detection | Misleading | Max-intensity singles labeled "deload" |
| Goal coherence = confidence | Questionable | Penalizes intentional blending |

---

## Recommended Resolution Paths

**Short path (add disclaimers, fix the most dangerous outputs):**
1. Add a visible banner: "This analysis is calibrated for general/hypertrophy training. Strength-sport programs will score lower by design."
2. Fix front squat catalog entry — `movementPatterns: ["squat"]`, `tags: ["compound"]` — one data line, removes false RED for OL athletes.
3. Suppress movement-pattern requirements when `goal.primary === "olympic_weightlifting"` or `"strength"`.
4. Fix deload detection to exclude final weeks with a high proportion of 1-rep sets (classify as "peak week" instead).
5. Fix single-week program penalty — normal usage should not score -30.

**Full path (make analysis goal-aware):**
1. Add `powerlifting` and `powerbuilding` archetypes.
2. Introduce goal-conditional volume landmarks — separate `thresholds` sets per archetype family (hypertrophy, strength/OL, general).
3. Add frequency analysis — per-muscle distinct-day count — as a new dimension or sub-score.
4. Add intensity tracking — read the `load` field, classify exercises by rep-range-derived intensity zone, track zone distribution across weeks.
5. Expand periodization detection to recognize block structure, conjugate, and DUP by pattern-matching across the intensity × volume matrix.
