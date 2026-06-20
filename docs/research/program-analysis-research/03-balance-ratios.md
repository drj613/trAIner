# Balance Ratios & Movement Pattern Coverage

## Push:Pull Ratio

### Research Findings

The most studied balance metric. Research on upper body push/pull strength ratios:

- **Target**: 1:1 to 1:1.5 (pull equal to or slightly dominant over push)
- **Actual measured**: Males average 1.57:1 push-dominant; females 2.72:1 push-dominant — both significantly imbalanced
- **Impact**: Recreational lifters with push-dominant imbalances showed significantly higher predisposition to shoulder disorders
- **Correction timeline**: Minor imbalances correct in 4-6 weeks; larger ones in 12-16 weeks

### Scoring

| Push:Pull Ratio | Verdict |
|---|---|
| 1:1.5 to 1:1 | Ideal (slightly pull-biased to balanced) |
| 1:1 to 1.5:1 | Acceptable |
| 1.5:1 to 2:1 | Warning (push-dominant) |
| > 2:1 either direction | Fail (significant imbalance) |

### How to Classify

Exercises are classified by their `movementPatterns` tags:
- **Push**: `horizontal press`, `push`, `shoulder flexion`
- **Pull**: `horizontal pull`, `vertical pull`, `pull`

Count total weekly sets for each category (using the tiered muscle weighting).

## Upper:Lower Ratio

### Target

Roughly 1:1 by total weekly volume. This doesn't mean equal exercises — it means equal total effective sets.

### Scoring

| Upper:Lower Ratio | Verdict |
|---|---|
| 0.8:1 to 1.2:1 | Balanced |
| 1.2:1 to 1.5:1 | Slight upper bias (common, acceptable) |
| 1.5:1 to 2:1 | Warning |
| > 2:1 | Fail (one side severely neglected) |

### How to Classify

- **Upper**: chest, back (all), shoulders (all), biceps, triceps, forearms
- **Lower**: quads, hamstrings, glutes, calves, adductors, abductors
- **Neither** (exclude from ratio): core/abs, neck, full body

## Anterior:Posterior Ratio

Most trainees overdevelop anterior chain ("mirror muscles") relative to posterior chain.

### Key Sub-Ratios

**Quad:Hamstring (H:Q strength ratio)**:
- Target: 0.6-0.8 (hamstrings at 60-80% of quad volume)
- Athletic populations: closer to 0.8-1.0
- ACL injury prevention: ideally approaching 1.0
- Flag if quads exceed hamstrings by > 2:1 in weekly sets

**Chest:Back**:
- Target: 1:1 to 1:1.25 (back slightly higher)
- Flag if chest exceeds back by > 1.5:1

**Front delts:Rear delts**:
- Pressing already covers front delts heavily
- Rear delts need dedicated work
- Flag if front delt direct work exceeds rear delt direct work by > 2:1

## Movement Pattern Coverage

A balanced program should cover all fundamental movement patterns weekly:

| Pattern | Mapped From `movementPatterns` | Primary Muscles |
|---|---|---|
| Horizontal Push | `horizontal press` | Chest, front delts, triceps |
| Horizontal Pull | `horizontal pull` | Mid-back, rear delts, biceps |
| Vertical Push | `push` + shoulder exercises | Shoulders, triceps, upper chest |
| Vertical Pull | `vertical pull` | Lats, biceps, rear delts |
| Hip Hinge | exercises tagged with hamstrings/glutes as primary + `compound` | Posterior chain |
| Squat/Knee Dominant | `squat` | Quads, glutes |
| Carry/Loaded Movement | `strongman` or farmer's walk variants | Core, grip, full-body |

### Scoring Movement Pattern Coverage

| Patterns Covered (of 6 core) | Verdict |
|---|---|
| 6/6 | Excellent |
| 5/6 | Good (identify which is missing) |
| 4/6 | Warning (two gaps) |
| 3 or fewer | Fail (program has significant holes) |

Note: Carry/loaded movement is the 7th pattern and is beneficial but not essential. The 6 core patterns are the two pushes, two pulls, hinge, and squat.

*Note: in the shipped engine, missing movement patterns are INFORMATIONAL only — `balance.ts` emits no severity warning for them.*

## Compound:Isolation Ratio

### Research-Based Targets by Goal

| Goal | Compound % | Isolation % |
|---|---|---|
| Beginner / General Fitness | 80-90% | 10-20% |
| Intermediate Hypertrophy | 65-75% | 25-35% |
| Advanced Bodybuilding | 55-65% | 35-45% |
| Powerlifting | 85-95% | 5-15% |
| Olympic Weightlifting | 95%+ | <5% |

### How to Classify

Use `tags` on exercises:
- **Compound**: tagged `compound` or has 2+ primary muscles
- **Isolation**: tagged `isolation` or has exactly 1 primary muscle

### Scoring

Score relative to the inferred goal (see `04-goal-signatures.md`). If the goal can't be inferred, use the intermediate hypertrophy targets as default. *(not implemented — shipped balance.ts computes no compound:isolation ratio and no goal inference)*

## Joint Health Indicators

These are bonus checks — not scored as heavily, but flagged as recommendations:

| Check | Flag If |
|---|---|
| Rotator cuff work | No exercises targeting `rotator cuff` or `rear delts` in a program with significant pressing volume |
| Scapular stabilizers | No exercises targeting `scapular stabilizers` or `serratus anterior` |
| Posterior chain | Hamstring + glute volume < 50% of quad volume |
| Mobility/prehab | Zero sections of type `mobility`, `rehab`, or `warmup` in the program |

## Sources

- PMC 2013: "Upper Body Push and Pull Strength Ratio in Recreationally Active Adults" (PMC3625793)
- PMC 2024: "Push-Pull Strength Ratio in Elite Throwers" (PMC11359276)
- PMC 2003: "H:Q Ratio in Intercollegiate Athletes" (PMC155432)
- The Prehab Guys: "Hamstring to Quadriceps Strength Ratio"
- NASM: "Preventing Shoulder and Rotator Cuff Injuries Through Corrective Exercise Programming"
- Kinvent: "Shoulder Rotator Assessment — Normative ER:IR Values"
