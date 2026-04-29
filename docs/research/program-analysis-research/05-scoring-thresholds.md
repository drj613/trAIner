# Scoring Thresholds — Codeable Reference

All thresholds in this file are designed for direct implementation in client-side JS.

## Color System

| Color | Meaning | UI Implication |
|---|---|---|
| Green | Good / within evidence-based range | No action needed |
| Yellow | Borderline / worth noting | Informational flag |
| Red | Outside productive range | Warning with explanation |

## 1. Session-Level Thresholds

### Exercises Per Session

```js
const exerciseCount = {
  red_low:    { max: 2,  label: "Too few exercises" },
  yellow_low: { max: 3,  label: "Low exercise count" },
  green:      { min: 4, max: 8,  label: "Good" },
  yellow_high:{ min: 9, max: 10, label: "High — consider consolidating" },
  red_high:   { min: 11, label: "Too many exercises — quality will degrade" },
};
```

### Total Working Sets Per Session

```js
const totalSets = {
  red_low:    { max: 7,  label: "Very low volume" },
  yellow_low: { max: 9,  label: "Low volume" },
  green:      { min: 10, max: 25, label: "Good" },
  yellow_high:{ min: 26, max: 30, label: "High volume" },
  red_high:   { min: 31, label: "Excessive — junk volume likely" },
};
```

### Estimated Duration (minutes)

```js
const estimatedDuration = {
  red_low:    { max: 19, label: "Too short for meaningful training" },
  yellow_low: { max: 29, label: "Short session" },
  green:      { min: 30, max: 75, label: "Good" },
  yellow_high:{ min: 76, max: 90, label: "Long session" },
  red_high:   { min: 91, label: "Unrealistically long" },
};
```

### Sets Per Muscle Per Session

```js
const setsPerMusclePerSession = {
  green:      { min: 1, max: 8,  label: "Productive range" },
  yellow_high:{ min: 9, max: 10, label: "Approaching diminishing returns" },
  red_high:   { min: 11, label: "Junk volume — redistribute to another day" },
};
```

### Sets Per Exercise

```js
const setsPerExercise = {
  yellow_low: { max: 1,  label: "Very low — may lack stimulus" },
  green_low:  { min: 2, max: 2,  label: "Acceptable for accessories" },
  green:      { min: 3, max: 4,  label: "Optimal" },
  green_high: { min: 5, max: 5,  label: "Acceptable for main lifts" },
  yellow_high:{ min: 6, label: "High — consider splitting across sessions" },
};
```

## 2. Weekly Volume Thresholds (Per Muscle Group)

### Generic Thresholds (when training-age-specific data unavailable)

```js
const weeklyVolume = {
  red_low:    { max: 3,  label: "Below maintenance — muscle may atrophy" },
  yellow_low: { min: 4, max: 5,  label: "Maintenance only — won't grow" },
  green_low:  { min: 6, max: 9,  label: "Minimum effective — will grow" },
  green:      { min: 10, max: 20, label: "Optimal range" },
  yellow_high:{ min: 21, max: 25, label: "High — monitor recovery" },
  red_high:   { min: 26, label: "Excessive — recovery likely impaired" },
};
```

### Per-Muscle-Group Thresholds

See `01-volume-landmarks.md` for the full table. The algorithm should use muscle-specific MEV/MAV/MRV values from that table rather than these generic thresholds when possible.

### Adjustment by Training Age

```js
const trainingAgeMultiplier = {
  beginner:     0.7,   // expects ~70% of intermediate volume
  intermediate: 1.0,   // baseline
  advanced:     1.25,  // expects ~125% of intermediate volume
};

// Apply: adjusted_threshold = base_threshold * multiplier
```

## 3. Balance Ratio Thresholds

### Push:Pull (Weekly Volume)

```js
const pushPullRatio = {
  green:      { min: 0.67, max: 1.0,  label: "Balanced (slightly pull-biased to equal)" },
  yellow:     { min: 0.5, max: 0.67,  label: "Pull-heavy" },
  yellow2:    { min: 1.0, max: 1.5,   label: "Push-heavy" },
  red:        { outsideOf: [0.5, 1.5], label: "Significant imbalance" },
};
// Ratio = push_sets / pull_sets. Ideal is <1.0 (more pulling than pushing)
```

### Upper:Lower (Weekly Volume)

```js
const upperLowerRatio = {
  green:      { min: 0.8, max: 1.2,  label: "Balanced" },
  yellow:     { min: 0.5, max: 0.8,  label: "Lower-dominant" },
  yellow2:    { min: 1.2, max: 2.0,  label: "Upper-dominant" },
  red:        { outsideOf: [0.5, 2.0], label: "Significant imbalance" },
};
```

### Quad:Hamstring (Weekly Volume)

```js
const quadHamRatio = {
  green:      { min: 1.0, max: 1.67, label: "Balanced (quads slightly higher is normal)" },
  yellow:     { min: 1.67, max: 2.0, label: "Quad-dominant" },
  red:        { min: 2.0, label: "Significantly quad-dominant — hamstring injury risk" },
};
// Ratio = quad_sets / hamstring_sets
```

### Chest:Back (Weekly Volume)

```js
const chestBackRatio = {
  green:      { min: 0.67, max: 1.0,  label: "Balanced" },
  yellow:     { min: 1.0, max: 1.5,   label: "Chest-dominant" },
  red:        { min: 1.5, label: "Significantly chest-dominant — shoulder health risk" },
};
```

## 4. Movement Pattern Coverage

```js
const corePatterns = [
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'hip_hinge',
  'squat',
];

const patternCoverage = {
  green:  { min: 6, label: "All core patterns covered" },
  yellow: { min: 5, label: "One pattern missing" },
  red:    { max: 4, label: "Multiple movement patterns missing" },
};
```

## 5. Compound:Isolation Ratio

Score against inferred goal (see `04-goal-signatures.md`):

```js
const compoundRatio = {
  hypertrophy:    { min: 0.55, max: 0.75 },
  strength:       { min: 0.85, max: 0.95 },
  olympic_wl:     { min: 0.90, max: 1.00 },
  general:        { min: 0.75, max: 0.90 },
  crossfit:       { min: 0.85, max: 0.95 },
};
// Green if within range, yellow if within 10% of range, red if >10% outside
```

## 6. Frequency Thresholds

```js
const frequencyPerMuscle = {
  red_low:    { max: 0.5, label: "Undertrained — less than 1× every 2 weeks" },
  yellow_low: { max: 1.0, label: "Once per week — suboptimal for most goals" },
  green:      { min: 1.5, max: 4.0, label: "Good frequency" },
  yellow_high:{ min: 4.0, max: 6.0, label: "Very high — acceptable for small muscles" },
  red_high:   { min: 6.0, label: "Excessive" },
};
```

## 7. Multi-Week / Periodization Checks

```js
const periodizationFlags = {
  // Detect if volume changes across weeks
  volume_static:     "Same volume every week — no periodization detected",
  volume_increasing: "Volume increases across weeks — progressive overload pattern",
  volume_wave:       "Volume varies non-linearly — undulating periodization pattern",
  volume_decreasing: "Volume decreases — possible taper/deload pattern",

  // Detect deload presence
  deload_present:    "Deload week detected (>30% volume reduction)",
  deload_missing:    "No deload week in program — recommend adding one every 4-6 weeks",

  // Detect intensity changes
  intensity_static:  "Rep ranges constant across weeks",
  intensity_varies:  "Rep ranges shift across weeks — periodization detected",
};
```

## 8. Overall Score Computation

Weighted average of dimension scores:

```js
const dimensionWeights = {
  volume_adequacy:     0.30,  // Are muscles getting enough/not too much?
  session_structure:   0.20,  // Are sessions reasonable?
  balance:             0.25,  // Push:pull, upper:lower, pattern coverage
  goal_coherence:      0.15,  // Does the structure match its inferred goal?
  periodization:       0.10,  // Multi-week structure quality
};
```

Each dimension scored 0-100:
- Green metrics → 80-100
- Yellow metrics → 50-79
- Red metrics → 0-49

Overall score = weighted average, displayed as letter grade:
- A: 90-100
- B: 75-89
- C: 60-74
- D: 45-59
- F: 0-44
