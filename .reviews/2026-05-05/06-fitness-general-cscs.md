# Fitness Domain Review: General CSCS Perspective

Reviewer: General CSCS / Evidence-Based S&C  
Date: 2026-05-05  
Scope: `src/lib/analysis/` — fitness domain correctness

---

## Summary

The system would likely be characterized as "a solid starting framework with meaningful blind spots." The core architecture — tiered volume counting, the six movement patterns, the MV/MEV/MAV/MRV landmark framework — reflects contemporary evidence-based practice. However, the landmarks, scoring weights, and thresholds are all calibrated for hypertrophy science (RP framework) and applied universally, which misleads users on non-hypertrophy training styles.

---

## 1. Volume Calculations — Rating: Acceptable

**Sound:**
- Tiered weighting (primary 1.0 / secondary 0.5 / incidental 0.25) is used in modern evidence-based frameworks (Israetel et al.). Correct unit — sets per muscle group, not tonnage.
- `DEFAULT_SETS = 3` is a reasonable fallback.

**Problems:**
- **No load/intensity tracking.** 3×5 at 90% 1RM and 3×15 pump sets contribute identically. The system is entirely volume-in with no ability to detect intensity progression or accumulated fatigue.
- **Freeform set strings (`BWx8`, `Skipped`, `60x10`) are never parsed.** The `load` field is never read. Zero concept of actual weight lifted.
- **`mapMuscle("full body") → core`** loses all volume credit for full-body movements.

---

## 2. Muscle Balance — Rating: Questionable

**Sound:**
- Push:Pull threshold (warnMax 1.5:1) is correct; pull-biased training protects shoulder health.
- Upper:Lower and Quad:Ham thresholds are reasonable.
- Six core movement patterns (horizontal push/pull, vertical push/pull, hip hinge, squat) match the standard FMS framework.

**Problems:**
- **Push/pull counting only works for cataloged exercises.** `classifyMovement()` requires `canonicalExerciseId`; non-catalog exercises route to `"other"` → systematic undercounting.
- **Hinge movements (RDL, deadlift, good morning) are not classified as `"pull"`** — they route to `"other"`. A posterior-chain-heavy program appears push-dominant.
- **`serratus anterior → rotator_cuff`** is anatomically incorrect (serratus is a shoulder stabilizer, not part of the rotator cuff).
- **`"full body" → core`** causes Turkish get-ups and thrusters to appear as core exercises only.
- **No loaded carry pattern** — farmer's walks, suitcase carries, yoke carries are a legitimate movement category many coaches include.

---

## 3. Periodization Assessment — Rating: Questionable

**Sound:**
- Deload detection threshold (70% volume reduction) is correct.
- Multi-week program detection is appropriate.

**Problems:**
- **Set-only tracking.** A program going 3×10 → 3×8 → 3×5 (progressive intensity overload) shows as "static" volume and generates a false warning. Progressive load increase is one of two primary axes of overload.
- **Single-week programs penalized (-30 points).** Most lifters run a 1-week template indefinitely with progressive load tracked in their log. This is completely normal and correct programming; penalizing it frustrates the majority of users.
- **Deload detection only checks the final week.** A mid-block deload is missed.
- **Wave/undulating periodization (DUP) should receive positive recognition** — it's arguably the most evidence-supported loading scheme but gets the same treatment as "static."

---

## 4. Session Quality Scoring — Rating: Acceptable

**Sound:**
- Exercise count limits (4–8 green, >10 red) are reasonable for intermediate lifters.
- Total sets (10–25 green, >30 red) are appropriate, perhaps slightly conservative for advanced hypertrophy.
- Per-muscle session cap (>8 yellow, >10 red) aligns with diminishing returns data.

**Problems:**
- `estimatedMinutes = totalSets × 3 + 10` — 3 min/set works for hypertrophy (60-90s rest) but severely underestimates strength programs with 3–5 min rest intervals. A 25-set powerlifting session at 4 min rest = ~110 min; formula says 85 min.
- No intensity context — 25 sets of 1-rep max attempts scores identically to 25 sets of 15-rep pump work.

---

## 5. Goals Alignment — Rating: Acceptable

**Sound:**
- Rep range boundaries (≤5 heavy, ≤12 moderate, >12 light) align with standard convention.
- `GOAL_COMPOUND_RATIO[hypertrophy]: {min: 0.55, max: 0.75}` is correct.

**Problems:**
- **`GOAL_COMPOUND_RATIO[strength]: {min: 0.85, max: 0.95}` is too high.** Most powerlifting programs include significant accessory work; 0.70–0.85 is more accurate.
- **Goal coherence = confidence** penalizes intentional blended programs (powerbuilding). A low confidence score for a deliberately blended program implies it's a programming flaw when it's intentional.
- **No `powerbuilding` archetype.** An extremely common self-directed training goal is absent.

---

## 6. Muscle Coverage — Rating: Acceptable

**Concrete anatomical error:**
- `serratus anterior → rotator_cuff` — the serratus is not part of the rotator cuff (infraspinatus, supraspinatus, teres minor, subscapularis).

**Missing groups:**
- Hip external rotators (piriformis, deep hip rotators) — major ACL and IT band risk factor.
- Tibialis anterior (minor).

**Misleading mappings:**
- `"hips" → glutes` is too broad — includes hip flexors, external rotators, abductors.
- `"full body" → core` silently undercredits full-body movements.

---

## 7. Overall Scoring Weights — Rating: Questionable

```
volume: 30%, session: 20%, balance: 25%, goalCoherence: 15%, periodization: 10%
```

- Volume (30%) and balance (25%) together = 55%. Both heavily penalize non-hypertrophy programming.
- Periodization (10%) is too low for intermediate/advanced trainees.
- Goal coherence (15%) penalizes blended programs — confidence is not coherence.
- Volume scoring averages across ALL muscles with mev > 0 — a program that perfectly trains 15/19 muscles but ignores 4 can still score 77/100 despite major gaps.

---

## What a CSCS Would Say

The system correctly catches **gross imbalances** — missing lower body training, severe push dominance, excessive single-session volume. For these it is functional and correct. It is less reliable for nuanced program quality, and the automated score should not be presented as a precise measure of program quality.

**Critical recommendations:**
1. Add goal-dependent landmark sets — or explicitly state the analysis is calibrated for general/hypertrophy training
2. Fix single-week program penalty (backwards — penalizes normal usage)
3. Fix hinge classification gap (RDL/deadlift → pull for push/pull ratio)
4. Fix serratus → rotator_cuff anatomical error
5. Add frequency analysis (sets per week vs. frequency per muscle are both needed)
