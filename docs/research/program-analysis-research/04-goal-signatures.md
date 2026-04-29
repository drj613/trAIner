# Goal Inference from Routine Structure

## Why Infer?

User goals in the profile are free-text strings that can be anything ("I want to do handstands!", "feel better", "look good naked"). These are valuable for AI prompt generation but unreliable for programmatic alignment. Instead, the algorithm infers the *actual* training goal from the routine's structural fingerprint.

## Goal Archetypes

### 1. Hypertrophy / Bodybuilding

**Structural signals:**
- Rep ranges predominantly 6-12 (50-60% of exercises)
- Compound:isolation ratio 55-75% compound
- High exercise variety (multiple exercises per muscle group)
- Section types: `hypertrophy`, `accessory` sections present
- Supersets and giant-sets common
- Rest periods: 1.5-3 min
- Moderate-high total volume (15-25 sets/session)
- All muscle groups addressed (symmetry focus)
- Tempo specifications present (controlled eccentrics)

**Distinguishing tags**: `isolation`, `hypertrophy` section types, exercises with `pump` modifier

**Key metric**: Total weekly sets per muscle group should be in MAV range (12-20)

### 2. Strength / Powerlifting

**Structural signals:**
- Rep ranges predominantly 1-5 (40-60% of exercises)
- Compound:isolation ratio 85-95% compound
- Low exercise variety (high specificity — same core lifts repeated)
- Section types: `strength`, `power` sections dominant
- Single exercises (not supersetted) with long rest
- Rest periods: 3-5+ min
- Moderate total sets but high intensity
- Squat, bench press, deadlift (or close variations) appear frequently
- `powerlifting` tag on multiple exercises

**Distinguishing tags**: `powerlifting`, `strength`, `compound` heavily dominant

**Key metric**: Frequency of competition-style lifts (2-4×/week each)

### 3. Olympic Weightlifting

**Structural signals:**
- Rep ranges predominantly 1-3 for main lifts
- `olympic weightlifting` movement pattern on multiple exercises
- `explosive` tag and modifier prevalent
- Section types: `explosive`, `strength` dominant
- Snatch and clean & jerk variations appear
- Front squat and overhead squat present
- Almost exclusively compound movements (95%+)
- Full-body structure every session
- `mobility` sections often included

**Distinguishing tags**: `olympic weightlifting`, `explosive`, `plyometrics`

**Key metric**: Presence and frequency of snatch/clean/jerk variations

### 4. General Fitness / Athletic Performance

**Structural signals:**
- Mixed rep ranges (5-8, 8-15, 15-20+ all present)
- All movement patterns represented
- Compound-dominant (80-90%)
- Section variety: warmup + strength + conditioning/cardio
- Session duration 45-60 min
- Moderate volume per muscle (6-15 sets/week)
- `conditioning`, `cardio`, `metcon` sections present
- Balanced upper:lower and push:pull ratios

**Distinguishing tags**: `conditioning`, `cardio`, `metcon`, mixed section types

**Key metric**: Movement pattern coverage (should be 6/6)

### 5. CrossFit / Functional Fitness

**Structural signals:**
- Highly varied rep ranges (1-5 AND 15-50+)
- `metcon` sections prominent
- Circuit and AMRAP-style groups (`circuit` group type)
- Olympic lifting + gymnastics + monostructural conditioning mixed
- High exercise variety across sessions
- Short rest periods in conditioning portions
- Both `explosive` and `conditioning` tags present
- `bodyweight` exercises mixed with barbell work

**Distinguishing tags**: `metcon`, `conditioning`, `bodyweight`, `olympic weightlifting` co-occurring

**Key metric**: Concurrent presence of strength, skill, and conditioning components

### 6. Rehab / Mobility Focus

**Structural signals:**
- `rehab`, `mobility`, `warmup` section types dominant
- `prehab`, `activation`, `stretching`, `mobility` tags prevalent
- Low load prescriptions
- Higher rep ranges (12-20+)
- Exercises targeting `rotator cuff`, `scapular stabilizers`, `core`
- Bands and bodyweight equipment dominant
- Low total volume

**Distinguishing tags**: `prehab`, `activation`, `mobility`, `stretching`

## Inference Algorithm

Score each archetype using weighted signals:

```
For each archetype:
  score = 0

  // Section type signals
  For each section in program:
    score += section_type_weights[archetype][section.type]

  // Rep range distribution
  score += rep_range_match(archetype, program.rep_distribution)

  // Tag frequency
  score += tag_match(archetype, program.tag_frequencies)

  // Movement pattern signals
  score += movement_pattern_match(archetype, program.movement_patterns)

  // Structural signals (compound ratio, exercise variety, etc.)
  score += structure_match(archetype, program.structure_metrics)

// Primary goal = highest scoring archetype
// Secondary goal = second highest (if within 70% of primary score)
```

### Output Format

The fingerprint should read like:
- "Hypertrophy-focused program with moderate strength component"
- "General fitness program emphasizing conditioning"
- "Powerlifting program with accessory hypertrophy work"
- "Olympic weightlifting program with supplemental strength"

## Rep Range Distribution Targets by Goal

| Goal | 1-5 reps | 6-12 reps | 13-20 reps | 20+ reps |
|---|---|---|---|---|
| Hypertrophy | 10-20% | 50-60% | 20-30% | 0-10% |
| Strength | 40-60% | 30-40% | 5-15% | 0-5% |
| Olympic WL | 60-80% | 15-25% | 0-10% | 0% |
| General Fitness | 15-25% | 40-50% | 20-30% | 5-15% |
| CrossFit | 20-30% | 20-30% | 20-30% | 15-25% |

## Section Type Weights by Goal

| Section Type | Hypertrophy | Strength | Olympic WL | General | CrossFit |
|---|---|---|---|---|---|
| warmup | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| explosive | 0.0 | 0.2 | 1.0 | 0.3 | 0.5 |
| strength | 0.3 | 1.0 | 0.7 | 0.5 | 0.4 |
| power | 0.1 | 0.7 | 0.9 | 0.3 | 0.5 |
| hypertrophy | 1.0 | 0.1 | 0.0 | 0.3 | 0.1 |
| accessory | 0.7 | 0.3 | 0.1 | 0.3 | 0.1 |
| metcon | 0.0 | 0.0 | 0.0 | 0.5 | 1.0 |
| cardio | 0.0 | 0.0 | 0.0 | 0.5 | 0.3 |
| conditioning | 0.0 | 0.0 | 0.0 | 0.7 | 0.8 |
| rehab | 0.0 | 0.0 | 0.1 | 0.2 | 0.0 |
| mobility | 0.0 | 0.1 | 0.5 | 0.3 | 0.1 |
| cooldown | 0.0 | 0.0 | 0.0 | 0.1 | 0.0 |
| training | 0.3 | 0.3 | 0.3 | 0.3 | 0.3 |

## Sources

- ACSM 2026 Position Stand: goal-specific load, volume, and frequency recommendations
- NSCA Foundations of Fitness Programming: periodization and program design principles
- RP Strength: hypertrophy-specific programming guidelines
- Catalyst Athletics: Olympic weightlifting programming methodology
- CrossFit GPP methodology: concurrent training model
- Barbell Medicine: concurrent training and the interference effect
