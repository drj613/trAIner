# Volume Landmarks by Muscle Group

## Framework

The Renaissance Periodization (RP) volume landmark model defines four thresholds per muscle group, measured in **direct working sets per week**:

| Landmark | Abbreviation | Meaning |
|----------|-------------|---------|
| Maintenance Volume | MV | Minimum to prevent muscle loss |
| Minimum Effective Volume | MEV | Minimum to produce measurable growth |
| Maximum Adaptive Volume | MAV | Optimal range for best long-term gains |
| Maximum Recoverable Volume | MRV | Ceiling beyond which recovery fails |

## Per-Muscle-Group Thresholds (Intermediate Lifters)

These numbers are for lifters with 1-7 years of consistent training. Beginners need less; advanced lifters may need more.

| Muscle Group | MV | MEV | MAV Low | MAV High | MRV | Optimal Freq (sessions/wk) |
|---|---|---|---|---|---|---|
| Chest | 2-4 | 4-6 | 6 | 16 | 16-24 | 2-4 |
| Back (total) | 4-6 | 6-8 | 10 | 20 | 20-30 | 2-4 |
| Quads | 2-4 | 4-6 | 6 | 14 | 14-18 | 2-5 |
| Hamstrings | 0-2 | 2-4 | 2 | 8 | 8-14 | 2-3 |
| Glutes | 2-6 | 6-8 | 8 | 24 | 24-30 | 2-5 |
| Biceps | 6-8 | 8-10 | 14 | 20 | 20-26 | 3-6 |
| Triceps | 0-4 | 4-6 | 6 | 16 | 16-20 | 2-4 |
| Side delts | 2-6 | 6-8 | 8 | 24 | 24-30 | 3-6 |
| Rear delts | 0-4 | 0-4 | 4 | 12 | 12-20 | 3-6 |
| Front delts | 0-2 | 0-2 | 4 | 8 | 8-12 | 2-3 |
| Calves | 2-4 | 4-6 | 6 | 16 | 16-24 | 3-6 |
| Core/abs | 0 | 0 | 8 | 16 | ~20 | 2-5 |
| Forearms | 0 | 0-2 | 2 | 8 | ~12 | 2-4 |

### Important Notes

**Indirect volume is significant.** Front delts, triceps, and hamstrings often show MV/MEV of 0 because compound movements cover their needs:
- Front delts: covered by all pressing (bench, overhead press)
- Triceps: covered by all pressing movements
- Hamstrings: covered by squats, deadlifts, hip hinges
- Core: covered by heavy compound lifts (squats, deadlifts, overhead press)

**Back volume should be split** between vertical pulling (pullups, pulldowns) and horizontal pulling (rows). A prescription of 20 sets/week means ~10 each, not 20 of both.

## Adjustments by Training Age

| Experience Level | Volume Multiplier | Typical Range (sets/muscle/wk) |
|---|---|---|
| Beginner (0-1 yr) | 0.6-0.8× | 6-12 |
| Intermediate (1-3 yr) | 1.0× (baseline) | 10-18 |
| Advanced (3-7 yr) | 1.1-1.3× | 15-25 |
| Elite (7+ yr) | 1.2-1.5× | 18-30 |

Schoenfeld 2017 meta-analysis: each additional weekly set correlates with an effect size increase of 0.023, or ~0.37% greater hypertrophy. Lifters doing 10+ sets/muscle/week saw ~40% more growth than those doing fewer than 5.

## Per-Session Volume Caps

Research shows diminishing returns beyond 6-8 sets per muscle group in a single session:

| Sets/Muscle/Session | Effectiveness |
|---|---|
| 1-4 | Effective, especially at high frequency |
| 5-8 | Optimal range |
| 9-10 | Upper boundary, acceptable for advanced |
| 11+ | Junk volume — MPS no longer elevated, SFR plummets |

This is why frequency matters: distributing 16 weekly sets across 2-3 sessions (5-8 per session) beats cramming them into one session (16 sets, most of which are unproductive).

## Algorithm Implementation Notes

### Counting with Tiered Weights

```
For each ProgramExercise:
  For each muscle in exercise.tags.primary:   volume[muscle] += sets × 1.0
  For each muscle in exercise.tags.secondary: volume[muscle] += sets × 0.5
  For each muscle in exercise.tags.incidental: volume[muscle] += sets × 0.25
```

### Scoring Each Muscle Group

```
weekly_sets = sum of effective_sets across all days in the week

if weekly_sets < MV:           "atrophying" (red)
if MV <= weekly_sets < MEV:    "maintenance only" (yellow)
if MEV <= weekly_sets <= MAV_high: "productive" (green)
if MAV_high < weekly_sets <= MRV:  "high — approaching limit" (yellow)
if weekly_sets > MRV:          "excessive — recovery impaired" (red)
```

### Handling Missing Set Counts

If `ProgramExercise.sets` is undefined, default to 3 (the most common prescription in the catalog and general fitness programming).

## Sources

- RP Strength individual muscle group hypertrophy guides (chest, quads, back, biceps, triceps, glutes, hamstrings, calves, side delts, rear delts, front delts) — rpstrength.com/blogs/articles/
- Schoenfeld et al. 2017 — "Dose-response relationship between weekly resistance training volume and increases in muscle mass" (PMID: 27433992)
- Schoenfeld et al. 2019 — "Resistance Training Volume Enhances Muscle Hypertrophy" (PMID: 30153194)
- RP Training Volume Landmarks — rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth
- Menno Henselmans — "Maximum productive training volume per session" — mennohenselmans.com
