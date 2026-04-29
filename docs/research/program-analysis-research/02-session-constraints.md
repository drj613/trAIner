# Session-Level Constraints & AI Failure Modes

## Why This Matters

AI-generated routines are the primary consumer of this analysis. LLMs generate workout plans by pattern-matching against training data (articles, forums, programs) — they have no internal model of fatigue accumulation, recovery capacity, or time budgets. They produce plans that look "complete" on paper at the expense of being practically executable.

## Documented AI Failure Modes

| Failure | Description | Source |
|---------|------------|--------|
| Too many exercises | 8-15 exercises when 4-6 is appropriate | Time, GymStreak, TechRadar |
| Unrealistic rest periods | 30s rest between heavy squats (should be 3-5 min) | Tom's Guide |
| No periodization | Same Week 1 repeated indefinitely | Multiple sources |
| Cookie-cutter volume | Same volume for beginners and 10-year veterans | Washington Post study |
| Duration blindness | 60+ min session when 30 min was requested | Time Magazine |
| Missing set/rep details | Exercises listed without sets, reps, or structure | GymStreak |
| Incomplete coverage | Only 41% of ACSM's six exercise prescription components addressed | Washington Post (study) |

## Session-Level Benchmarks

### Exercises Per Session

| Count | Verdict | Notes |
|---|---|---|
| 1-2 | Too few | Unless it's a technique/skill-only session |
| 3 | Low | Acceptable for compound-only full body |
| 4-8 | Good | Productive range for all training styles |
| 9-10 | Warning | High end — check if some should be supersetted or cut |
| 11+ | Fail | Almost certainly too many; quality will degrade |

Context matters: a bro-split day targeting one muscle group should have 4-6 exercises. A full-body day might have 6-8. A PPL day typically has 5-7.

### Total Working Sets Per Session

| Count | Verdict | Notes |
|---|---|---|
| 1-7 | Low | Unless very short/focused session |
| 8-9 | Borderline low | Acceptable for beginners or short sessions |
| 10-25 | Good | Productive range |
| 26-30 | Warning | High volume, check recovery feasibility |
| 31+ | Fail | Junk volume territory |

Research data point: a 35-set session in a controlled study took ~68 minutes and participants were training to failure on every set (8-12 rep range). This represents a hard ceiling for even trained subjects in a laboratory setting.

### Sets Per Muscle Group Per Session

| Count | Verdict | Rationale |
|---|---|---|
| 1-4 | Good | Especially effective at high frequency (3+/week) |
| 5-8 | Optimal | Best stimulus-to-fatigue ratio per session |
| 9-10 | Warning | MPS plateau reached; diminishing returns |
| 11+ | Fail | Beyond productive capacity; cut and redistribute to another day |

### Estimated Session Duration

**Formula**: `estimated_minutes = (total_working_sets × 3) + 10`

The ×3 accounts for average time per set including rest (45s work + 90-180s rest + transitions). The +10 covers warm-up and setup.

More precise estimation by section type:
- Heavy compound sets (strength/power sections): ~4-5 min each
- Moderate compound sets (hypertrophy sections): ~3 min each
- Isolation sets (accessory sections): ~2 min each
- Circuit/metcon sets: ~1.5 min each (shorter rest)
- Warmup sets: ~1.5 min each

| Estimated Duration | Verdict | Notes |
|---|---|---|
| < 20 min | Warning | Too short for meaningful training |
| 20-30 min | Low | Acceptable for focused/minimal sessions |
| 30-75 min | Good | Productive range for most people |
| 76-90 min | Warning | Long but possible for advanced lifters |
| 91+ min | Fail | Unrealistic for most; quality degradation well-documented |

### Average gym session (survey data): 47 minutes (2,000-person study)

## Sets Per Exercise

| Avg Sets/Exercise | Verdict | Notes |
|---|---|---|
| 1 | Warning | Not enough depth per exercise |
| 2 | Borderline | Acceptable for accessories |
| 3-4 | Good | Most common and productive |
| 5 | Borderline | Acceptable for main lifts |
| 6+ | Warning | Too much time on one exercise |

## Quality Degradation Timeline

Research on within-session performance decline:

| Timepoint | Effect |
|---|---|
| Sets 1-6 (per muscle) | Full performance, high quality stimulus |
| Sets 7-10 (per muscle) | ~10-15% force output reduction, moderate fatigue |
| Sets 11+ (per muscle) | Significant fatigue, dramatically reduced SFR |
| After ~60-75 min total | Cortisol rises, focus deteriorates |
| After ~90 min total | Near-universal quality degradation for non-elite |

## Cross-Validation Checks

These catch structural incoherence in AI-generated programs:

```
1. Duration vs. sets coherence:
   If estimated_duration < (total_sets × 2) → flag impossible
   If estimated_duration > (total_sets × 5) → flag suspicious

2. Exercises vs. sets coherence:
   If avg_sets_per_exercise < 2 → flag "too many exercises, not enough depth"
   If avg_sets_per_exercise > 5 → flag "too few exercises, too much volume each"

3. Frequency vs. weekly volume:
   If sessions/week × avg_sets_per_session_per_muscle > MRV → flag overtraining
   If total_weekly_sets / sessions_per_week > 30 → flag sessions too dense
```

## Sources

- Time Magazine: "I Used ChatGPT as My Personal Trainer" (2024)
- Washington Post: "ChatGPT's AI-generated workouts were incomplete, too cautious" (2024)
- Tom's Guide: "Following a ChatGPT training program can be ineffective" (2024)
- GymStreak: "Using ChatGPT as a Workout Planner Is a Bad Idea"
- Stronger By Science: "When does training volume reach diminishing returns?"
- Menno Henselmans: "Maximum productive training volume per session"
- Hevy App: "How Long Should a Workout Be"
- A Workout Routine: "How Long Should My Workout Be?"
