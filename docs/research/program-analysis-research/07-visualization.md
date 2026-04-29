# Visualization Approaches for Routine Analysis

## Constraint

The app is local-first and must work offline. All visualizations must be implementable in client-side JS/React with no external service dependencies. Tailwind CSS is available for styling.

## Proven Patterns from Existing Apps

### 1. Muscle Heatmap (Body Outline)

**Used by**: MuscleSquad, Fitbod, Muscle Map, ChunkItUp

An anatomical body outline (front + back view) where muscle regions are colored by volume intensity. Darker/warmer = more volume, lighter/cooler = less.

**Pros**: Instantly intuitive, visually striking, maps directly to the body
**Cons**: Requires SVG body illustration, complex to build, takes up significant screen space

**Implementation options**:
- SVG with dynamic fill colors per muscle region
- Canvas-based rendering
- Pre-built: Muscle Visualizer API (musclevisualizer.exercisedb.dev) — but this is an external dependency

**Mapping**: Each of the ~14 canonical muscle groups maps to an SVG region. Color intensity = `weekly_effective_sets / MAV_high` (so MAV = full intensity, below MEV = very faint, above MRV = red/warning color).

### 2. Muscle Volume Bar Chart

**Used by**: Hevy, JEFIT

Horizontal or vertical bar chart showing weekly sets per muscle group. Simple, information-dense.

**Pros**: Easy to implement, easy to read, works at any screen size
**Cons**: Less visually engaging than heatmap, doesn't map to body

**Enhancement**: Add horizontal reference lines for MEV and MRV thresholds. Bars between MEV and MRV are green; below MEV are yellow; above MRV are red.

### 3. Radar/Spider Chart

**Used by**: Academic literature, coaching tools (less common in apps)

Multi-axis chart showing balance across dimensions (push/pull, upper/lower, anterior/posterior, or across muscle groups).

**Pros**: Excellent for showing imbalances at a glance — asymmetric shapes are immediately obvious
**Cons**: Harder to read precise values, can be cluttered with many axes

**Best used for**: The balance scorecard dimension — push:pull, upper:lower, movement pattern coverage as 6 axes of a radar chart.

### 4. Score Card / Report Card

**Used by**: JEFIT (NSPI score)

Letter grades or numeric scores per dimension, arranged in a card/grid layout.

**Pros**: Summarizes everything at a glance, familiar format
**Cons**: Loses nuance, needs drill-down for details

**Layout suggestion**:
```
┌─────────────────────────────┐
│  Overall: B+ (82/100)       │
│  ─────────────────────────  │
│  Volume:      A  (91)       │
│  Balance:     B  (78)       │
│  Structure:   A- (88)       │
│  Coherence:   B+ (83)       │
│  Periodization: C (65)      │
└─────────────────────────────┘
```

### 5. Volume Trend Chart (Multi-Week)

**Used by**: RP App, JEFIT, Fitbod

Time-series showing weekly sets per muscle group across the program's weeks. Reveals periodization patterns (or lack thereof).

**Pros**: Shows progression, deloads, periodization at a glance
**Cons**: Only meaningful for multi-week programs

**Implementation**: Line chart with one line per muscle group (or grouped into upper/lower/push/pull). X-axis = week number. Y-axis = weekly effective sets. Horizontal reference lines for MEV and MRV.

## Recommended Visualization Stack

For the initial implementation, prioritize these in order:

### Must-Have (v1)

1. **Score Card** — the primary view. Overall grade + per-dimension grades. Tappable to drill into details.

2. **Muscle Volume Bars** — horizontal bars per muscle group with MEV/MRV reference lines. Color-coded green/yellow/red. This is the most information-dense and easiest to implement.

3. **Warnings List** — a flat list of flags/warnings with severity icons. "Session 3 has 12 exercises (recommended: 4-8)". This is the actionable output.

### Nice-to-Have (v2)

4. **Radar Chart (Balance)** — 6-axis spider chart for movement pattern coverage. Push/pull/vertical push/vertical pull/hinge/squat as axes.

5. **Fingerprint Badge** — a styled label showing the inferred goal: "Hypertrophy-focused • Upper-body emphasis". Think of it like a tag/badge at the top of the analysis.

### Aspirational (v3)

6. **Muscle Heatmap** — SVG body outline with color mapping. High visual impact but significant implementation effort.

7. **Volume Trend Chart** — for multi-week programs. Line chart showing volume progression across weeks.

## Color Palette Suggestions

For consistency with a fitness app aesthetic:

| Status | Color | Hex (suggestion) | Usage |
|---|---|---|---|
| Good / optimal | Green | `#22c55e` (Tailwind green-500) | Within evidence-based range |
| Borderline / note | Amber | `#f59e0b` (Tailwind amber-500) | Worth noting |
| Warning / issue | Red | `#ef4444` (Tailwind red-500) | Outside productive range |
| Neutral / info | Slate | `#64748b` (Tailwind slate-500) | Informational |
| Inactive / zero | Gray | `#d1d5db` (Tailwind gray-300) | No data / not applicable |

## Responsive Considerations

- Score card: works at any width
- Volume bars: horizontal bars work well on mobile (muscle label left, bar right)
- Radar chart: needs ~250px minimum width to be readable
- Heatmap: needs ~300px width for front+back body views
- Trend chart: scrollable horizontally on mobile

## Sources

- MuscleSquad: musclesquad.com/blogs/musclesquad-training-app/hits-and-heatmap
- Hevy: hevyapp.com/features/training-chart/
- Fitbod: fitbod.me/blog/tracking-volume-intensity-and-recovery-with-fitbod/
- Muscle Visualizer API: musclevisualizer.exercisedb.dev
- Muscle Map: muscle-map.com
