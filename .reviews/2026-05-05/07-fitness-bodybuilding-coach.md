# Fitness Domain Review: Bodybuilding / Hypertrophy Coach Perspective

Reviewer: Bodybuilding & Hypertrophy Coach  
Date: 2026-05-05  
Scope: `src/lib/analysis/` — hypertrophy science domain correctness

---

## Summary

The framework borrows the right vocabulary (MEV/MAV/MRV, per-muscle set counts, compound/isolation ratio) and applies it with reasonable structural soundness. The most critical missing feature from a hypertrophy-science perspective is **frequency analysis** — the system cannot distinguish a bro split from a PPL despite this being one of the most evidence-supported variables for muscle growth.

---

## 1. Volume Tracking: Per-Muscle Set Counts vs. Tonnage — Rating: Acceptable

**Sound:** Counting discrete sets per muscle group (not total load) is the correct unit for hypertrophy programming. The primary/secondary/incidental weighting scheme (`1.0 / 0.5 / 0.25`) is a reasonable approximation of effective set theory.

**Problems:**
- **Double-credit on multi-primary exercises.** A bench press tagged `["chest", "front delts"]` contributes full set count to both muscles simultaneously. Front delts especially accumulate phantom volume and will rarely trigger below-MEV warnings.
- **Accounting diverges across modules.** `volume.ts:19-21` uses the full weighted model; `session.ts:23-25` and `balance.ts:44-53` sum raw sets against primary tags only. Same exercise produces different numbers depending on which dimension asks.

---

## 2. MEV / MAV / MRV Landmarks — Rating: Acceptable (structure), Questionable (values)

**Sound:** All five landmark fields (`mv`, `mev`, `mavLow`, `mavHigh`, `mrv`) are present. Severity classification in `volume.ts:52-61` gates on them in order.

**Concrete data bug:**
- **`thresholds.ts:15` — Hamstrings `mavLow: 2` is below `mev: 3`.** MAV range cannot start below MEV floor. Fortunately `mavLow` is a dead field (`classifyVolume` never reads it), so classification is unaffected — but this reveals the landmarks weren't sanity-checked.

**`mavLow` is never used.** It exists in the type, is stored in every result, and displayed in UI, but `scoreVolumeDimension` skips it entirely. Either gate a "productive but submaximal" band, or remove from the type.

**Questionable MEV values:**
- `rear_delts: mev: 2` — dangerously low. Programs doing 4 sets of rows with no direct rear delt work will read as "productive range." Most hypertrophy coaches prescribe dedicated rear delt isolation.
- `biceps: mev: 9` — unusually high. Flags programs with 6–8 sets (adequate for many trainees with significant rowing volume) as below MEV.
- `calves: mev: 5` — borderline; most literature cites MEV closer to 8–10 with MRV much higher.

---

## 3. Primary Movers vs. Synergists — Rating: Questionable

**Sound:** The map correctly distinguishes `rear_delts`, `front_delts`, `side_delts` as separate targets. Rear delts receive secondary credit from rows.

**Problems:**
- **Secondary weighting is consistent in `volume.ts` but ignored in `balance.ts:44-53`.** The balance module reads only `exercise.tags.primary`. A program built on heavy rows accrues rear delt secondary volume in the weekly score but the balance module sees only primary tags. No warning flags inadequate direct rear delt work.
- **`"full body" → core` loses all other muscle activation.** Thrusters, cleans, Turkish get-ups contribute only to core volume.

---

## 4. Frequency Analysis — Rating: MISLEADING

**This dimension does not exist.** Nowhere is there a check for how many training days each muscle group is stimulated per week. `countWeeklyVolume` folds all days into a single accumulated total. A classic bro split (16 sets of chest on Monday, zero the rest of the week) and a PPL (8 sets on Monday + 8 sets Thursday) produce identical `effectiveSets` and identical severity ratings.

This is the **single biggest hypertrophy-science gap** in the codebase. Two-times-per-week frequency is one of the most consistently supported variables in hypertrophy research (Schoenfeld meta-analyses 2016/2019). The app will actively validate bro splits as equivalent to higher-frequency designs.

The data to compute this is available — `ProgramDay` has `weekNumber` and `dayNumber` — but no module uses it.

**Fix:** For each `MuscleGroup`, count how many distinct days it appears as primary. Flag any muscle receiving 5+ sets/week on only 1 day.

---

## 5. Isolation vs. Compound Weighting — Rating: Acceptable

**Sound:** The compound/isolation ratio check in `goals.ts:81-106` is well-constructed. Hypertrophy target range of 0.55–0.75 compound correctly acknowledges isolation needs. `isCompound` uses catalog tags with reasonable fallback.

**Missing:** No signal for stretch-mediated hypertrophy. Lengthened-position loading (incline curls, RDLs, overhead tricep extensions, deficit split squats) is among the strongest emerging hypertrophy signals (Maeo et al. 2021, Kassiano et al. 2023) and is completely absent.

---

## 6. Program Split Detection — Rating: Questionable

**The balanced fixture correctly gets flagged** — `"Chest Bro Special"` has no lower body, triggering red warnings.

**A classic full bro split (chest/back/shoulders/arms/legs across 5 days) would pass cleanly:**
- Each muscle accumulates correct weekly sets.
- No frequency check — system cannot see chest was trained once at 16 sets.
- Push/pull balance accumulates weekly across separate days — no ratio warning.
- Would score identically to a PPL or full-body program with the same weekly volume.

---

## 7. Actively Misleading Elements

**`score.ts:23` — Volume score penalizes skipping optional muscles:**
`forearms.mev = 1`, `adductors.mev = 2`, `abductors.mev = 2` — any program skipping direct work on these gets red/yellow marks dragging the overall volume score down. Creates pressure toward wrist curl programming to improve scores.

**`goals.ts:24` — Goal coherence confidence formula is a mathematical artifact:**
`confidence = primaryScore / (primaryScore + secondaryScore || 1)`. A program with primaryScore=2 and secondaryScore=0 returns 1.0 confidence (100%) despite near-zero evidence. This feeds into overall score at 15% weight.

**Rep-range binning embeds outdated assumptions:**
`goals.ts:59-62` classifies heavy as ≤5. Current meta-analysis (Schoenfeld et al. 2017; Lopez et al. 2021) shows equivalent hypertrophy across 5–30 rep ranges when taken near failure. High-rep/short-rest programs are misclassified as "less hypertrophy-oriented."

**Hinge movements disappear from push/pull accounting:**
`muscles.ts:98-101` — RDLs, deadlifts, good mornings route to `"other"`. A posterior-chain-heavy program appears push-dominant and gets warned to add more pulling.

---

## Priority Recommendations

**Must fix to avoid misleading trainees:**
1. Add per-muscle frequency counter — the single highest-value missing feature.
2. Fix the hinge classification gap in `muscles.ts:100` — route hinge movements to "pull" for push/pull ratio.
3. Remove forearms, adductors, abductors from the volume score denominator (or set `mev: 0`) — stop punishing programs that legitimately skip them.

**High value:**
4. Raise `rear_delts.mev` from 2 to at least 5–6.
5. Add frequency-per-muscle field to `MuscleVolumeResult` and expose it in UI.
6. Track lengthened-position loading (catalog boolean `isLengthenedLoad`).
