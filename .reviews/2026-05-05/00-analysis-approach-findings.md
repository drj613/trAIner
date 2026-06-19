# Routine Analysis — Approach Findings
Date: 2026-05-05  
Source reviews: 06–09 (fitness domain specialists), plus analysis-calibration observations from 03  
Scope: `src/lib/analysis/` — fitness-domain correctness, analytical framework validity

> ⚠️ **Status (2026-06-19): the "Recommended Resolution Paths" / decided roadmap below was largely NOT
> implemented.** Tier 2 (load parser) and Tier 3 (goal-aware analysis, frequency, style detection) never
> shipped; several Tier-1 items (neutral movement-pattern display, single-week penalty removal) are also
> still open. Goal coherence was *removed* rather than replaced, making the engine more goal-blind. A
> fresh audit cross-checking design-vs-shipped and verifying every threshold against current S&C evidence
> is at [`../2026-06-19/00-analysis-framework-evidence-audit.md`](../2026-06-19/00-analysis-framework-evidence-audit.md).
> The fitness-domain *analysis* below remains accurate; only the implementation-status assumptions are stale.

These findings are about *what the analysis system assumes good training looks like*, not about code bugs in the strict sense. A different severity scale applies: **Misleading** = produces actively wrong guidance for real users. **Questionable** = may mislead in common scenarios. **Acceptable** = reasonable simplification with known limitations. **Sound** = grounded in fitness science.

---

## Frame: Who the System Is Calibrated For

The analysis framework borrows the correct vocabulary — MEV/MAV/MRV, per-muscle set counts, six movement patterns, compound/isolation ratio — from Renaissance Periodization (Israetel et al.) and the broader hypertrophy-science literature. These are the right tools for a general-fitness or muscle-building trainee.

The problem is that **all thresholds, scoring weights, and scoring logic are calibrated for hypertrophy/RP science and applied universally**. When the same framework is applied to a powerlifter, an Olympic lifter, or a CrossFit athlete, it does not just give a lower score — it gives wrong guidance that may lead a real user to modify a well-designed program in a harmful direction.

**Target user (decided 2026-05-06):** A single user who mixes training styles — hypertrophy, powerlifting, Olympic lifting, powerbuilding — and cares about having well-structured programs for each. The system must serve all these styles correctly, not just score them lower. Where making the analysis multi-goal-aware would reduce complexity (e.g. by removing universal rules that are only valid for one style), that reduction is acceptable.

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

## 3. No Intensity Tracking of Any Kind — **DECISION MADE**

The analysis has zero representation of intensity — no %1RM, no RPE/RIR field, no rep-max notation. Set count is the only variable in every dimension.

**Consequences (still relevant):**
- 3×5 at 90% 1RM and 3×15 pump sets contribute identical "effective sets" to quads.
- Accumulation blocks (high volume, 70–80%, RPE 6–8) and realization/peaking blocks (low volume, 90%+, RPE 9–10) are indistinguishable.
- Technique work (50–60%, 5+ reps, focus on bar path) looks identical to true max effort.
- Progressive overload across weeks — 3×10 → 3×8 → 3×5 — shows as "decreasing volume" with no recognition of increasing intensity.

**Decision (2026-05-06):** Read the `load` field. The `ProgramExercise.load?: string` field is populated by the LLM but never consumed by any analysis module. It will be parsed to extract intensity signals — %1RM values, RPE/RIR notation, and rep-max notation (e.g. "5RM", "3 @ RPE 9"). Because LLM output is inconsistent, the parser must be fuzzy and tolerant: extract what it can, treat unrecognised values as absent (not as errors). Parsed intensity feeds into:
- Deload/peak week classification (finding 1)
- Periodization style detection (finding 4)
- Training style fingerprint (TBD — finding 9 / style classification discussion)

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

## 8. Push:Pull Accounting Is Broken for Posterior-Chain Programs — **RESOLVED**

`src/lib/analysis/muscles.ts:94–101`

~~The `classifyMovement` function routes hinge movements (deadlift, RDL, good morning) to `"other"`, not `"pull"`. See also technical finding H17.~~

Fixed in technical batch (H17): `classifyMovement` now returns `"legs"` for hinge patterns ("hinge", "hip hinge", "hip extension"). Deadlifts and RDLs correctly contribute to the legs bucket rather than being invisible to balance accounting. The push:pull ratio for posterior-chain-heavy programs is no longer artificially skewed push-dominant.

---

## 9. Movement Pattern Display Should Be Neutral, Not Prescriptive — **DECISION MADE**

`src/lib/analysis/balance.ts:126–142`

Missing any of the six core movement patterns (horizontal push, horizontal pull, vertical push, vertical pull, hip hinge, squat) triggers a yellow or red warning regardless of training goal.

**Powerlifting:** Competitive powerlifters in a meet-prep block commonly eliminate vertical pulling (lat pulldown, pull-up) and all horizontal pressing beyond competition bench. The system flags this as RED missing patterns.

**OL competition prep:** OL athletes do not typically program horizontal pressing. They correctly avoid it in peak weeks. The system flags this as RED missing movement patterns.

**Decision:** Severity design language (red/yellow/green) is reserved exclusively for MEV/MAV/MRV volume analysis. Movement pattern coverage is displayed neutrally — present/absent, no score impact, no severity coloring. This lets the user see what patterns their program covers without the system prescribing what a complete program must include.

**Style fingerprint and goal-conditional scoring (decided 2026-05-06):**

The fingerprint carries a detected training style: "Strength / Powerlifting", "Hypertrophy", "Olympic Lifting", "Powerbuilding", or "Mixed / General". Detection is based on a weighted combination of:
- Section type composition (`ProgramSection.type`)
- Compound/isolation exercise ratio
- Rep range distribution across the program
- Parsed intensity signals from `exercise.load` (once tier 2 load parser exists)

Each style is scored 0–1; the highest becomes the primary label, the second-highest the secondary. If no style scores above a confidence threshold (~0.5), the primary label is "Mixed / General". The style is **overridable** — the user can set an explicit style on a program, which bypasses inference entirely.

The detected/overridden style feeds volume landmark selection (tier 3):
- **Strength / Powerlifting / OL:** strength-oriented thresholds for compound/competition movements; hypertrophy thresholds for accessory muscles. Competition lifts (squat, bench, deadlift, snatch, C&J variants) are identified from the exercise catalog and evaluated against strength landmarks; all other exercises use hypertrophy landmarks.
- **Hypertrophy:** current RP-derived landmarks for all muscles.
- **Powerbuilding:** same split as strength — compound movements use strength thresholds, accessories use hypertrophy thresholds. Distinct from pure strength only in that isolation accessories are expected and not penalised.
- **Mixed / General:** hypertrophy thresholds, but muscles with `effectiveSets === 0` are never penalised (they show as "Not trained", no score impact).

---

## 10. OL-Specific Structural Gaps — MISLEADING

### Snatch and clean/jerk are invisible to movement pattern detection

`src/lib/analysis/muscles.ts:108–138`

`detectMovementPatterns` has no branch for Olympic lifting patterns. The snatch — the defining OL movement — contributes zero to any of the six core patterns. A program containing only snatch, clean, and jerk variations would have all six patterns flagged as missing.

The snatch is simultaneously a hip hinge, vertical pull, overhead squat, and vertical push at different phases. None of this is captured.

### `accessory` section type scores 0 for OL goal inference — **MOOT**

Goal inference and goal coherence scoring have been removed entirely. `GOAL_SECTION_WEIGHTS` no longer exists. This sub-finding no longer applies.

### Front squat catalog entry has empty `movementPatterns` and `tags`

`exercises.generated.json` — `front-squat-barbell` (and likely variants) has `movementPatterns: []`, `tags: []`. Any front-squat-based program receives a false RED "missing squat pattern" warning despite front squat being one of the primary OL assistance movements.

---

## 11. Goal Inference Has Structural Gaps — **RESOLVED**

`src/lib/analysis/goals.ts`, `src/lib/analysis/types.ts`

~~Goal coherence was a 15%-weight scoring dimension that inferred a training archetype (hypertrophy, strength, OL, etc.) from section types and compound/isolation ratios, then penalized programs that did not score strongly against any single archetype.~~

The entire goal inference and goal coherence system has been removed. `goals.ts` is deleted. `GoalArchetype`, `GoalSignature`, `AnalysisResult.goal`, and `AnalysisResult.dimensions.goalCoherence` no longer exist. `GOAL_SECTION_WEIGHTS`, `GOAL_COMPOUND_RATIO`, and `GOAL_REP_RANGES` are removed from `thresholds.ts`. Scoring weights are now 4-dimensional: `{ volume: 0.353, session: 0.235, balance: 0.294, periodization: 0.118 }`.

The archetypal gaps (no powerlifting archetype, no powerbuilding archetype, broken confidence formula) are all moot.

---

## 12. Volume Scoring Penalizes Skipping Optional Muscles — **DECISION MADE**

`src/lib/analysis/score.ts:23`

`scoreVolumeDimension` includes almost every muscle (16 of 19 have `mev > 0`) even when not trained. Programs that legitimately skip direct forearm, adductor, abductor, or calf work take red marks dragging down the volume score.

For a powerbuilder or powerlifter: skipping forearms and adductors is not a programming error. For a CrossFit athlete: the volume model has no concept of conditioning-based fatigue management that justifies fewer isolation sets.

**Decision (2026-05-06):** Keep the current filter logic (`effectiveSets > 0 || landmarks.mev > 0`) — muscles with MEV thresholds are still considered relevant. However, muscles with `effectiveSets === 0` are displayed as **"Not trained"** (neutral, no severity color) rather than "Below maintenance" (red). The volume *score* still accounts for them (a powerlifter who does zero biceps work still takes a modest volume hit), but the UI no longer presents zero-set muscles as errors. The display change alone is meaningful because the current red "Below maintenance" label on untrained optional muscles reads as an actionable problem when it is a deliberate programming choice.

---

## 13. Scoring Weights Are Calibrated for Hypertrophy/RP

`src/lib/analysis/thresholds.ts:49–55`

```ts
// Original (removed)
volume: 0.30, session: 0.20, balance: 0.25, goalCoherence: 0.15, periodization: 0.10

// Current (goalCoherence dimension removed)
volume: 0.353, session: 0.235, balance: 0.294, periodization: 0.118
```

With goal coherence removed, the 15% weight was redistributed proportionally across the remaining four dimensions. Volume and balance together still represent ~65% of total score — the underlying calibration problem (both penalize non-hypertrophy programming) is unchanged. The remaining issues are:
- Volume: RP-derived muscle landmarks → still penalizes powerlifting and OL
- Balance: movement pattern display is now neutral (no severity, no score impact) — this dimension's remaining weight now reflects compound/isolation ratio and push:pull balance only
- Periodization weight increased from 10% to 11.8%, a marginal improvement

---

## Summary: What Is Sound, Acceptable, or Missing

| Area | Rating | Notes |
|---|---|---|
| Tiered volume counting (1.0/0.5/0.25) | Sound | Correct methodology for hypertrophy |
| Six core movement patterns | Sound | Standard FMS framework |
| Push:pull thresholds (warnMax 1.5:1) | Sound | Correct for shoulder health |
| Rep range bins (≤5 heavy, ≤12 moderate) | Acceptable | Slightly outdated (meta-analysis supports broader ranges) |
| Single set of volume landmarks for all goals | Misleading | RP hypertrophy values applied universally — goal-conditional landmarks needed |
| Deload detection from set count | Misleading | Inverts OL/strength peak weeks — fix via load field + reps heuristic (finding 1, open) |
| No intensity tracking | Decided | Read `load` field with fuzzy parser; feeds deload/peak/periodization detection |
| Frequency analysis absent | Misleading | Bro split = PPL in this system (for hypertrophy users) |
| Session set caps | Questionable | Flag normal Sheiko/Smolov/CrossFit sessions |
| Single-week program penalty | Questionable | Penalizes the most common real-world use pattern |
| Goal archetype coverage | Resolved | Goal inference removed entirely |
| Movement pattern requirements unconditional | Resolved | Patterns now displayed neutrally — covered/absent, no severity, no score impact |
| OL movement pattern detection | Misleading | Snatch/clean/jerk invisible to the system (still relevant for neutral display) |
| Peak week detection | Misleading | Max-intensity singles labeled "deload" — fix pending finding 1 decision |
| Goal coherence = confidence | Resolved | Goal coherence dimension removed |
| Volume: zero-set muscles displayed as errors | Decided | Muscles with effectiveSets === 0 now display as "Not trained" (neutral), not "Below maintenance" |

---

## Recommended Resolution Paths

**Decided scope (2026-05-06):** The system must serve all training styles correctly. The full path is the target. Items below are ordered by dependency — earlier items unblock later ones.

**Tier 1 — No-dependency fixes (implement now):**
1. Fix front squat catalog entry — `movementPatterns: ["squat"]`, `tags: ["compound"]` — one data line.
2. Fix movement pattern warnings in `balance.ts:155–166` — remove severity pushes; patterns are already tracked in `movementPatternsCovered`/`movementPatternsMissing` and displayed neutrally in the UI. *(Decision already made, code not yet updated.)*
3. Fix `score.ts:56` single-week `-30` penalty — the warning message is already informative; the score penalty is disproportionate.
4. Display muscles with `effectiveSets === 0` as "Not trained" (neutral) in `toDisplayAnalysis.ts` rather than inheriting the "Below maintenance" red label.

**Tier 2 — Requires fuzzy load parser (blocks finding 1 and periodization work):**
5. Write a `parseLoad(s: string)` utility that extracts: `{ pct1rm?: number, rpe?: number, rir?: number, repMax?: number }` from free-text LLM output. Tolerant — unknown formats return `{}`.
6. Fix deload/peak week detection in `periodization.ts` using parsed load + reps: classify a week as "peak" if average intensity is high (≥85% 1RM / ≤ RPE 8 by exclusion / rep-max ≤ 3) and volume drops ≥30%. Suppress "no deload" warning in this case.

**Tier 3 — Full goal-aware analysis (requires style detection first):**
7. Detect training style from section types, compound/isolation ratio, rep range distribution, and parsed load. Score each candidate style 0–1; primary = highest, secondary = second-highest, fallback = "Mixed / General" if top < 0.5.
8. Add user-overridable style field on program — when set, bypasses inference entirely.
9. Introduce goal-conditional volume landmark application (see finding 9): competition/compound movements evaluated against strength thresholds when style is strength/OL/powerbuilding; all other exercises use hypertrophy thresholds.
10. Add frequency analysis — per-muscle distinct-day count — as a sub-score or informational note.
11. Expand periodization detection to recognize block structure, conjugate, and DUP from the intensity × volume matrix (enabled by tier 2 load parser).
