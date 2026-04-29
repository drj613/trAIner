# Prior Art — How Existing Apps Analyze Routines

## Tier 1: Sophisticated Analysis

### RP Hypertrophy App (Renaissance Periodization)

The most sophisticated volume-tracking system on the market. Built around the volume landmarks framework.

**Algorithm core**: Mesocycle progression model — start at MEV, add a set per muscle each week, decrease RIR over 4-6 weeks, then deload.

**Autoregulation via feedback**: After each session users report pump quality, soreness, perceived effort, "disruption" (systemic fatigue), joint pain, and performance. The app adjusts next week's volume based on these signals.

**What we can learn**: The volume landmark framework is the gold standard for per-muscle-group analysis. We should use their MEV/MAV/MRV numbers as our scoring thresholds.

**What we do differently**: RP is a full program generator + tracker. We're building analysis only — no feedback loop, no autoregulation. Our tool is diagnostic, not prescriptive.

### JuggernautAI

Uses an "Expert System AI" — not ML, but Chad Wesley Smith's coaching expertise encoded into rules.

**Algorithm core**: RPE-driven feedback. After main sets, users rate difficulty 1-10. The system collects sleep quality, nutrition, motivation, and muscle-group soreness. It adjusts weights/reps/sets weekly.

**Key features**:
- Adaptive cycle lengths based on user's powerlifting-to-bodybuilding emphasis ratio
- Daily accessory scaling with readiness feedback
- Auto-drop sets when readiness falls below threshold

**What we can learn**: The idea of scoring a routine's alignment with a specific goal (their powerlifting-to-bodybuilding slider) maps directly to our goal inference system.

### Dr. Muscle

Uses Daily Undulating Periodization (DUP) and RIR-based RPE.

**Key features**:
- Auto-adjusted reps and load every workout
- Targeted deloads: when a 1RM drops, cuts sets 50% and weight 10% on that specific exercise (not full program)
- Progressive overload automation
- 18+ advanced training methods (rest-pause, drop sets, etc.)

**What we can learn**: The concept of per-exercise deload detection (plateau → targeted reduction) is interesting for our periodization analysis.

### Fitbod

Most transparently documented algorithm. Two major components:

**Exercise Selector**: Scores each of 800+ exercises based on:
- How recovered the primary muscles are (0-100% recovery score)
- Equipment availability
- Exercise effectiveness for user's goal (data from millions of logged workouts)
- Diversity/variation

**Capability Recommender**: Tracks 1RM displacement continuously. Recognizes faster/slower adaptation and adjusts.

**Recovery Model**: Assigns each muscle group a fatigue percentage (0-100%). Uses 48-72 hour recovery windows. Full recovery assumed after 7 days of rest.

**What we can learn**: Their per-muscle recovery percentage visualization is a proven UX pattern. Their exercise-effectiveness scoring from aggregate data is interesting but requires a large user base we don't have.

## Tier 2: Basic Analysis

### JEFIT

Features an NSPI (North Star Progress Index) — a composite score consolidating strength gains, training volume, movement balance, and stimulus into a single number.

**What we can learn**: The idea of a single composite score is what we're building toward. Their scoring dimensions (strength, volume, balance, stimulus) align closely with ours.

### Hevy

Offers a muscle distribution chart (volume per body part as a bar chart) and a muscle group workout chart. Primarily tracking-focused rather than analysis-focused.

**What we can learn**: Their muscle distribution visualization is clean and intuitive. Good reference for our balance visualization.

### Strong

Minimal — fast logging with PR tracking and estimated 1RM calculation. No routine analysis.

## Tier 3: Different Approaches

### Gymscore AI

Focuses on movement quality scoring rather than program structure. Uses computer vision to score exercises 0-100 across five dimensions: bracing, posture, foot placement, range of motion, and movement efficiency.

**Not applicable to our use case** (we analyze program structure, not movement execution).

## Academic Frameworks

### ACSM 2026 Position Stand

Synthesized from 137 systematic reviews (30,000+ participants). First update in 17 years.

Key algorithmic recommendations:
- Strength: ≥80% 1RM, 2-3 sets/exercise, ≥2×/week
- Hypertrophy: 30-100% 1RM (broad!), ≥10 sets/muscle/week, ≥2×/week
- Power: 30-70% 1RM, ≤24 total reps × sets, fast concentric intent
- Minimum baseline: 1 set × 8-12 reps × 8-10 exercises × 2 days/week

### NSCA Foundations of Fitness Programming

Three design pillars: overload, variation, specificity.

Periodization hierarchy:
- Microcycle: 1 week to 10 days
- Mesocycle: 4-12 weeks
- Macrocycle: 10-12 months

Phase changes recommended every 4-6 weeks.

### Computational Approaches (Academic Literature)

Three methodological categories found in the literature:
1. **Discrete movement scoring**: Mathematical functions mapping outputs to 0-100
2. **Rule-based systems**: Expert knowledge as if/then rules (JuggernautAI's approach)
3. **Template-based approaches**: Comparing against reference patterns

Our algorithm combines all three: rule-based thresholds (volume landmarks), template matching (goal signature comparison), and discrete scoring (per-dimension 0-100 grades).

## Feature Comparison Matrix

| Feature | RP App | Juggernaut | Dr. Muscle | Fitbod | JEFIT | Hevy | **trAIner** |
|---|---|---|---|---|---|---|---|
| Volume tracking | Per-muscle | Per-lift | Per-exercise | Per-muscle | Aggregate | Per-muscle | **Per-muscle (tiered)** |
| Volume landmarks | Yes (MV-MRV) | Implicit | Implicit | Recovery % | No | No | **Yes (MV-MRV)** |
| Goal inference | Manual | Manual (slider) | Manual | Manual | Manual | Manual | **Automatic** |
| Balance analysis | No | No | No | Limited | Yes (NSPI) | Basic | **Yes (multi-ratio)** |
| Movement patterns | No | No | No | No | No | No | **Yes (6 patterns)** |
| Periodization analysis | Yes (mesocycle) | Yes (block) | Yes (DUP) | No | No | No | **Yes (multi-week)** |
| Session structure check | Implicit | Implicit | Implicit | Yes | No | No | **Yes (explicit)** |
| Overall score | No | No | No | No | Yes (NSPI) | No | **Yes (A-F grade)** |
| Runs offline | Yes (app) | Yes (app) | Yes (app) | Yes (app) | Yes (app) | Yes (app) | **Yes (client-side JS)** |
| AI generation validation | No | No | No | No | No | No | **Yes (primary use case)** |

## Sources

- RP Strength: rpstrength.com/pages/hypertrophy-app
- JuggernautAI: juggernautai.app
- Dr. Muscle: dr-muscle.com
- Fitbod: fitbod.me/blog/fitbod-algorithm/
- JEFIT: jefit.com
- Hevy: hevyapp.com/features/training-chart/
- Gymscore: gymscore.ai
- ACSM 2026 Position Stand: acsm.org/resistance-training-guidelines-update-2026/
- NSCA: nsca.com/contentassets/foundations-of-fitness-programming
- PMC: "Review of Computational Approaches" (PMC7189627)
