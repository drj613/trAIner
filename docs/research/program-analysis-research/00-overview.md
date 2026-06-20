# Program Analysis Algorithm — Research Overview

> ⚠️ **Status (2026-06-19): this doc describes DESIGN INTENT, not the shipped engine.**
> Several capabilities below were never wired: goal "fingerprint"/inference, training-age-adjusted
> landmarks, a `frequency` dimension, and goal-aware scoring. The shipped engine is goal-blind and
> set-count-only. For the current implemented state + an evidence audit of every threshold, see
> [`.reviews/2026-06-19/00-analysis-framework-evidence-audit.md`](../../../.reviews/2026-06-19/00-analysis-framework-evidence-audit.md).

## Purpose

A client-side JS algorithm that analyzes workout routines and produces:

1. **Scorecard** — per-dimension grades (volume, balance, frequency, structure) plus an overall rating
2. **Profile/fingerprint** — descriptive characterization ("upper-body hypertrophy emphasis with moderate posterior chain work")
3. **Warnings/flags** — actionable issues ("session 3 has 14 exercises", "biceps below MEV")

## When It Runs

- **Automatically** on program import (before user accepts)
- **On-demand** via a button when viewing a routine

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Secondary muscle weighting | **Tiered**: primary=1.0, secondary=0.5, incidental=0.25 | Matches existing `ProgramExercise.tags` three-tier structure |
| Goal detection | **Inferred** from routine structure | User goals are free-text and unreliable for programmatic alignment |
| User bias/priorities | **Neutral** — no user-declared priority muscles | Keep analysis abstract and objective |
| Multi-week support | **Yes** — analyze full mesocycle structure | Programs have `weekNumber` on days; detect periodization patterns |
| Runtime | **Client-side JS** — no server dependency | App is local-first; must work offline |

## Input Data Available

From the exercise catalog (880 exercises):
- `muscles.primary` / `muscles.secondary` (27 muscle groups)
- `movementPatterns` (19 patterns: horizontal push, squat, olympic weightlifting, etc.)
- `tags` (24 values: compound, isolation, explosive, powerlifting, etc.)
- `equipment` (16 types)

From program structure:
- `ProgramDay.sections` with `SectionType` (warmup, explosive, strength, hypertrophy, metcon, etc.)
- `ProgramGroup.type` (single, superset, circuit, giant-set)
- `ProgramExercise` with sets, reps, rest, tempo, and `tags` (primary/secondary/incidental muscles, modifiers)
- `weekNumber` for multi-week programs

From user profile:
- `trainingAge` (beginner, intermediate, advanced)
- `defaultDaysPerWeek`
- `goals` (free text — used for fingerprinting, not scoring) *(not yet wired — engine reads no user profile)*
- `equipment` and `constraints`

## Algorithm Dimensions

See individual research files for deep dives on each:

| Dimension | File | What It Measures |
|-----------|------|-----------------|
| Volume adequacy | `01-volume-landmarks.md` | Sets/muscle/week against MEV-MAV-MRV thresholds |
| Session structure | `02-session-constraints.md` | Exercise count, total sets, estimated duration, per-session muscle caps |
| Balance | `03-balance-ratios.md` | Push:pull, upper:lower, anterior:posterior, movement pattern coverage |
| Goal inference | `04-goal-signatures.md` | Structural fingerprint → probable training goal | *(design intent — not shipped; engine scores only volume/session/balance/periodization)*
| Scoring thresholds | `05-scoring-thresholds.md` | Concrete green/yellow/red thresholds for each metric |
| Prior art | `06-prior-art.md` | How existing apps and research approach routine analysis |
| Visualization | `07-visualization.md` | UI approaches for presenting analysis results |

## Muscle Group Taxonomy Mapping

The catalog uses 27 muscle group labels. For volume analysis, these should be normalized to ~14 canonical groups to match research literature:

| Canonical Group | Catalog Labels Mapped |
|----------------|----------------------|
| Chest | chest, upper chest |
| Back (lats) | lats |
| Back (upper) | middle back, upper back, traps |
| Back (lower) | lower back |
| Shoulders (front) | front delts |
| Shoulders (side) | shoulders (when not front/rear) |
| Shoulders (rear) | rear delts |
| Biceps | biceps |
| Triceps | triceps |
| Forearms | forearms |
| Quads | quadriceps, quads |
| Hamstrings | hamstrings |
| Glutes | glutes |
| Calves | calves |
| Core | abdominals, core |
| Adductors | adductors |
| Abductors | abductors |
| Rotator cuff | rotator cuff, scapular stabilizers, serratus anterior |
| Full body | full body (distribute to all groups at reduced weight) |
| Neck | neck |

## Volume Counting Formula

For each exercise in the program:
```
effective_sets(muscle) =
  sets × 1.0   if muscle in exercise.tags.primary
  sets × 0.5   if muscle in exercise.tags.secondary
  sets × 0.25  if muscle in exercise.tags.incidental
```

Weekly volume per muscle = sum of effective_sets across all days in a week.

## Sources

All findings are backed by research from:
- Renaissance Periodization (Israetel) — volume landmark framework
- ACSM 2026 Position Stand — 137 systematic reviews, 30,000+ participants
- Schoenfeld et al. — meta-analyses on volume, frequency, rep ranges
- NSCA — program design guidelines, periodization frameworks
- Fitbod, RP App, JuggernautAI, Dr. Muscle — industry implementations

See individual files for specific citations.
