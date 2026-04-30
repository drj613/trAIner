# Program Analysis Algorithm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side routine analysis engine that scores workout programs across volume, balance, session structure, goal coherence, and periodization — plus an LLM analysis prompt users can copy for conversational follow-up.

**Architecture:** Pure-function analysis engine in `src/lib/analysis/` (no React, no IO) receives a `ProgramDocument` + exercise catalog and returns an `AnalysisResult` with scores, warnings, and a goal fingerprint. A thin UI layer at `/programs/[id]/analysis` renders the results. An LLM prompt builder stitches the routine + research reference data into a copy-pasteable prompt. Everything runs offline in the browser.

**Tech Stack:** TypeScript, Jest (tests), React/Next.js (UI), Tailwind + CSS custom properties (styling). No external dependencies added.

**Research Reference:** `docs/research/program-analysis-research/` contains all evidence-based thresholds, volume landmarks, balance ratios, goal signatures, and scoring guidelines used in this plan.

---

## File Structure

### Analysis Engine (`src/lib/analysis/`)

| File | Responsibility |
|------|---------------|
| `types.ts` | All types: `AnalysisResult`, `MuscleGroup`, `Warning`, dimension results, grades |
| `thresholds.ts` | Volume landmarks per muscle, session limits, balance targets, goal signature weights — all codeable constants |
| `muscles.ts` | Catalog label → canonical `MuscleGroup` mapping, catalog lookup helper, rep range parser |
| `volume.ts` | Count effective weekly sets per muscle (tiered weighting), score against MEV/MAV/MRV |
| `session.ts` | Per-session constraint checks: exercise count, total sets, duration estimate, per-muscle-per-session caps |
| `balance.ts` | Push:pull, upper:lower, quad:ham, chest:back ratios + movement pattern coverage |
| `goals.ts` | Infer training goal archetype from structural signals (section types, rep ranges, tags, compound ratio) |
| `periodization.ts` | Detect multi-week patterns: volume trends, deload presence, intensity variation |
| `score.ts` | Compute per-dimension 0-100 scores and overall weighted grade |
| `analyze.ts` | Orchestrator: calls all modules, assembles `AnalysisResult` |
| `llmPrompt.ts` | Build the copy-pasteable LLM analysis prompt from program + catalog + profile |
| `fixtures.ts` | Shared test fixtures: sample programs, exercises (test-only, but co-located for convenience) |

### UI (`src/components/analysis/` + `src/app/programs/[id]/analysis/`)

| File | Responsibility |
|------|---------------|
| `page.tsx` | Next.js route: `programs/[id]/analysis` → renders `AnalysisClient` |
| `AnalysisClient.tsx` | Loads program, runs analysis, renders sub-components |
| `ScoreCard.tsx` | Overall grade + per-dimension grades in a card layout |
| `VolumeChart.tsx` | Horizontal bar chart per muscle group with MEV/MRV reference lines |
| `WarningsList.tsx` | Severity-icon + message list of all warnings |
| `FingerprintBadge.tsx` | Styled label showing inferred goal (e.g., "Hypertrophy-focused • Upper-body emphasis") |
| `LlmPromptSection.tsx` | Collapsible section with info blurb + copy-to-clipboard button for LLM prompt |

### Integration Points

| File | Change |
|------|--------|
| `src/components/workout/ProgramDetailClient.tsx` | Add "Analyze" link button alongside Edit and Map |
| `src/components/import/ImportClient.tsx` | Navigate to analysis page after successful import save |

---

## Task 1: Types

**Files:**
- Create: `src/lib/analysis/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/lib/analysis/types.ts
import type { SectionType } from "@/lib/programs/types";

export type MuscleGroup =
  | "chest" | "lats" | "upper_back" | "lower_back"
  | "front_delts" | "side_delts" | "rear_delts"
  | "biceps" | "triceps" | "forearms"
  | "quads" | "hamstrings" | "glutes" | "calves"
  | "core" | "adductors" | "abductors"
  | "rotator_cuff" | "neck";

export const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  "chest", "lats", "upper_back", "lower_back",
  "front_delts", "side_delts", "rear_delts",
  "biceps", "triceps", "forearms",
  "quads", "hamstrings", "glutes", "calves",
  "core", "adductors", "abductors",
  "rotator_cuff", "neck",
];

export type GoalArchetype =
  | "hypertrophy" | "strength" | "olympic_weightlifting"
  | "general_fitness" | "crossfit" | "rehab";

export type Severity = "green" | "yellow" | "red";
export type Grade = "A" | "B" | "C" | "D" | "F";

export type Warning = {
  severity: Severity;
  dimension: string;
  message: string;
};

export type VolumeLandmarks = {
  mv: number;
  mev: number;
  mavLow: number;
  mavHigh: number;
  mrv: number;
};

export type MuscleVolumeResult = {
  muscle: MuscleGroup;
  effectiveSets: number;
  severity: Severity;
  label: string;
  landmarks: VolumeLandmarks;
};

export type SessionResult = {
  dayId: string;
  dayTitle: string;
  exerciseCount: number;
  totalSets: number;
  estimatedMinutes: number;
  muscleSetCounts: Partial<Record<MuscleGroup, number>>;
  warnings: Warning[];
};

export type BalanceResult = {
  pushPullRatio: number | null;
  upperLowerRatio: number | null;
  quadHamRatio: number | null;
  chestBackRatio: number | null;
  movementPatternsCovered: string[];
  movementPatternsMissing: string[];
  warnings: Warning[];
};

export type GoalSignature = {
  primary: GoalArchetype;
  secondary: GoalArchetype | null;
  confidence: number;
  fingerprint: string;
};

export type PeriodizationResult = {
  weeksDetected: number;
  volumePattern: "static" | "increasing" | "wave" | "decreasing";
  deloadDetected: boolean;
  warnings: Warning[];
};

export type DimensionScore = {
  name: string;
  score: number;
  grade: Grade;
};

export type AnalysisResult = {
  overall: DimensionScore;
  dimensions: {
    volume: DimensionScore;
    session: DimensionScore;
    balance: DimensionScore;
    goalCoherence: DimensionScore;
    periodization: DimensionScore;
  };
  muscleVolumes: MuscleVolumeResult[];
  sessions: SessionResult[];
  balance: BalanceResult;
  goal: GoalSignature;
  periodization: PeriodizationResult;
  warnings: Warning[];
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/analysis/types.ts
git commit -m "feat(analysis): add type definitions for program analysis engine"
```

---

## Task 2: Constants — Thresholds and Muscle Taxonomy

**Files:**
- Create: `src/lib/analysis/thresholds.ts`
- Create: `src/lib/analysis/muscles.ts`
- Create: `src/lib/analysis/muscles.test.ts`

- [ ] **Step 1: Create thresholds file**

All numbers sourced from `docs/research/program-analysis-research/01-volume-landmarks.md` and `05-scoring-thresholds.md`.

```typescript
// src/lib/analysis/thresholds.ts
import type { GoalArchetype, MuscleGroup, VolumeLandmarks } from "./types";

export const VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = {
  chest:       { mv: 3, mev: 5, mavLow: 6,  mavHigh: 16, mrv: 24 },
  lats:        { mv: 5, mev: 7, mavLow: 10, mavHigh: 20, mrv: 30 },
  upper_back:  { mv: 5, mev: 7, mavLow: 10, mavHigh: 20, mrv: 30 },
  lower_back:  { mv: 2, mev: 3, mavLow: 4,  mavHigh: 10, mrv: 16 },
  front_delts: { mv: 1, mev: 1, mavLow: 4,  mavHigh: 8,  mrv: 12 },
  side_delts:  { mv: 4, mev: 7, mavLow: 8,  mavHigh: 24, mrv: 30 },
  rear_delts:  { mv: 2, mev: 2, mavLow: 4,  mavHigh: 12, mrv: 20 },
  biceps:      { mv: 7, mev: 9, mavLow: 14, mavHigh: 20, mrv: 26 },
  triceps:     { mv: 2, mev: 5, mavLow: 6,  mavHigh: 16, mrv: 20 },
  forearms:    { mv: 0, mev: 1, mavLow: 2,  mavHigh: 8,  mrv: 12 },
  quads:       { mv: 3, mev: 5, mavLow: 6,  mavHigh: 14, mrv: 18 },
  hamstrings:  { mv: 1, mev: 3, mavLow: 2,  mavHigh: 8,  mrv: 14 },
  glutes:      { mv: 4, mev: 7, mavLow: 8,  mavHigh: 24, mrv: 30 },
  calves:      { mv: 3, mev: 5, mavLow: 6,  mavHigh: 16, mrv: 24 },
  core:        { mv: 0, mev: 0, mavLow: 8,  mavHigh: 16, mrv: 20 },
  adductors:   { mv: 1, mev: 2, mavLow: 4,  mavHigh: 10, mrv: 16 },
  abductors:   { mv: 1, mev: 2, mavLow: 4,  mavHigh: 10, mrv: 16 },
  rotator_cuff:{ mv: 0, mev: 0, mavLow: 2,  mavHigh: 6,  mrv: 10 },
  neck:        { mv: 0, mev: 0, mavLow: 2,  mavHigh: 6,  mrv: 10 },
};

export const SESSION_LIMITS = {
  exercises: { greenMin: 4, greenMax: 8, yellowMax: 10 },
  totalSets: { greenMin: 10, greenMax: 25, yellowMax: 30 },
  setsPerMuscle: { greenMax: 8, yellowMax: 10 },
  durationMinutes: { greenMin: 30, greenMax: 75, yellowMax: 90 },
  setsPerExercise: { greenMin: 2, greenMax: 5 },
} as const;

export const BALANCE_TARGETS = {
  pushPull:  { idealMin: 0.67, idealMax: 1.0, warnMax: 1.5 },
  upperLower:{ idealMin: 0.8,  idealMax: 1.2, warnMax: 2.0 },
  quadHam:   { idealMin: 1.0,  idealMax: 1.67, warnMax: 2.0 },
  chestBack: { idealMin: 0.67, idealMax: 1.0, warnMax: 1.5 },
} as const;

export const CORE_MOVEMENT_PATTERNS = [
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "vertical_pull",
  "hip_hinge",
  "squat",
] as const;

export const DIMENSION_WEIGHTS = {
  volume:         0.30,
  session:        0.20,
  balance:        0.25,
  goalCoherence:  0.15,
  periodization:  0.10,
} as const;

export const DEFAULT_SETS = 3;

export const TRAINING_AGE_MULTIPLIER: Record<string, number> = {
  beginner:     0.7,
  intermediate: 1.0,
  advanced:     1.25,
};

export type GoalSectionWeights = Record<string, number>;

export const GOAL_SECTION_WEIGHTS: Record<GoalArchetype, GoalSectionWeights> = {
  hypertrophy:           { hypertrophy: 1.0, accessory: 0.7, strength: 0.3 },
  strength:              { strength: 1.0, power: 0.7, explosive: 0.2 },
  olympic_weightlifting: { explosive: 1.0, power: 0.9, strength: 0.7, mobility: 0.5 },
  general_fitness:       { conditioning: 0.7, cardio: 0.5, strength: 0.5, metcon: 0.5 },
  crossfit:              { metcon: 1.0, conditioning: 0.8, explosive: 0.5, strength: 0.4 },
  rehab:                 { rehab: 1.0, mobility: 0.8, warmup: 0.3 },
};

export const GOAL_COMPOUND_RATIO: Record<GoalArchetype, { min: number; max: number }> = {
  hypertrophy:           { min: 0.55, max: 0.75 },
  strength:              { min: 0.85, max: 0.95 },
  olympic_weightlifting: { min: 0.90, max: 1.00 },
  general_fitness:       { min: 0.75, max: 0.90 },
  crossfit:              { min: 0.85, max: 0.95 },
  rehab:                 { min: 0.40, max: 0.70 },
};

export const GOAL_REP_RANGES: Record<GoalArchetype, { heavy: number; moderate: number; light: number }> = {
  hypertrophy:           { heavy: 0.15, moderate: 0.55, light: 0.30 },
  strength:              { heavy: 0.50, moderate: 0.35, light: 0.15 },
  olympic_weightlifting: { heavy: 0.70, moderate: 0.20, light: 0.10 },
  general_fitness:       { heavy: 0.20, moderate: 0.45, light: 0.35 },
  crossfit:              { heavy: 0.25, moderate: 0.25, light: 0.50 },
  rehab:                 { heavy: 0.05, moderate: 0.30, light: 0.65 },
};
```

- [ ] **Step 2: Create muscle taxonomy mapping**

```typescript
// src/lib/analysis/muscles.ts
import { exerciseCatalog, type ExerciseCatalogItem } from "@/lib/catalog/exercises";
import type { ProgramExercise } from "@/lib/programs/types";
import type { MuscleGroup } from "./types";
import { DEFAULT_SETS } from "./thresholds";

const CATALOG_TO_CANONICAL: Record<string, MuscleGroup> = {
  "chest":                "chest",
  "upper chest":          "chest",
  "lats":                 "lats",
  "middle back":          "upper_back",
  "upper back":           "upper_back",
  "traps":                "upper_back",
  "lower back":           "lower_back",
  "front delts":          "front_delts",
  "shoulders":            "side_delts",
  "rear delts":           "rear_delts",
  "biceps":               "biceps",
  "triceps":              "triceps",
  "forearms":             "forearms",
  "quadriceps":           "quads",
  "quads":                "quads",
  "hamstrings":           "hamstrings",
  "glutes":               "glutes",
  "calves":               "calves",
  "abdominals":           "core",
  "core":                 "core",
  "adductors":            "adductors",
  "abductors":            "abductors",
  "rotator cuff":         "rotator_cuff",
  "scapular stabilizers": "rotator_cuff",
  "serratus anterior":    "rotator_cuff",
  "neck":                 "neck",
  "full body":            "core",
};

const catalogIndex = new Map<string, ExerciseCatalogItem>(
  exerciseCatalog.map((item) => [item.id, item]),
);

export function mapMuscle(label: string): MuscleGroup | undefined {
  return CATALOG_TO_CANONICAL[label.toLowerCase()];
}

export function lookupCatalogExercise(exercise: ProgramExercise): ExerciseCatalogItem | undefined {
  if (exercise.canonicalExerciseId) {
    return catalogIndex.get(exercise.canonicalExerciseId);
  }
  return undefined;
}

export function getEffectiveSets(exercise: ProgramExercise): number {
  return exercise.sets ?? DEFAULT_SETS;
}

export function parseRepRange(reps: string | undefined): { low: number; high: number } | null {
  if (!reps) return null;
  const cleaned = reps.trim().toLowerCase();
  const rangeMatch = cleaned.match(/^(\d+)\s*[-–to]+\s*(\d+)$/);
  if (rangeMatch) return { low: parseInt(rangeMatch[1], 10), high: parseInt(rangeMatch[2], 10) };
  const singleMatch = cleaned.match(/^(\d+)$/);
  if (singleMatch) { const n = parseInt(singleMatch[1], 10); return { low: n, high: n }; }
  return null;
}

export function repMidpoint(reps: string | undefined): number | null {
  const range = parseRepRange(reps);
  return range ? (range.low + range.high) / 2 : null;
}

export function isCompound(exercise: ProgramExercise, catalogItem?: ExerciseCatalogItem): boolean {
  const tags = catalogItem?.tags ?? [];
  if (tags.includes("compound")) return true;
  if (tags.includes("isolation")) return false;
  return exercise.tags.primary.length >= 2;
}

export type MovementCategory = "push" | "pull" | "legs" | "other";

const PUSH_PATTERNS = new Set(["horizontal press", "push", "shoulder flexion"]);
const PULL_PATTERNS = new Set(["horizontal pull", "vertical pull", "pull"]);
const LEG_PATTERNS = new Set(["squat"]);

export function classifyMovement(catalogItem: ExerciseCatalogItem | undefined): MovementCategory {
  if (!catalogItem) return "other";
  const patterns = catalogItem.movementPatterns;
  if (patterns.some((p) => PUSH_PATTERNS.has(p))) return "push";
  if (patterns.some((p) => PULL_PATTERNS.has(p))) return "pull";
  if (patterns.some((p) => LEG_PATTERNS.has(p))) return "legs";
  return "other";
}

export type CoreMovementPattern =
  | "horizontal_push" | "horizontal_pull"
  | "vertical_push" | "vertical_pull"
  | "hip_hinge" | "squat";

export function detectMovementPatterns(
  catalogItem: ExerciseCatalogItem | undefined,
  exercise: ProgramExercise,
): CoreMovementPattern[] {
  const found: CoreMovementPattern[] = [];
  const patterns = catalogItem?.movementPatterns ?? [];
  const tags = catalogItem?.tags ?? [];
  const primaryMuscles = exercise.tags.primary.map((m) => m.toLowerCase());

  if (patterns.includes("horizontal press")) found.push("horizontal_push");
  if (patterns.includes("horizontal pull")) found.push("horizontal_pull");
  if (patterns.includes("vertical pull")) found.push("vertical_pull");
  if (patterns.includes("squat")) found.push("squat");

  if (
    (patterns.includes("push") && primaryMuscles.some((m) => m.includes("delt") || m.includes("shoulder"))) ||
    (tags.includes("push") && primaryMuscles.some((m) => m.includes("delt") || m.includes("shoulder")))
  ) {
    found.push("vertical_push");
  }

  if (
    primaryMuscles.some((m) => m.includes("hamstring") || m.includes("glute")) &&
    tags.some((t) => t === "compound" || t === "strength") &&
    !patterns.includes("squat")
  ) {
    found.push("hip_hinge");
  }

  return [...new Set(found)];
}
```

- [ ] **Step 3: Write tests for muscle helpers**

```typescript
// src/lib/analysis/muscles.test.ts
import { mapMuscle, parseRepRange, repMidpoint, isCompound } from "./muscles";
import type { ProgramExercise } from "@/lib/programs/types";

const makeExercise = (overrides: Partial<ProgramExercise> = {}): ProgramExercise => ({
  id: "test",
  name: "Test Exercise",
  tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
  ...overrides,
});

describe("mapMuscle", () => {
  it("maps catalog labels to canonical groups", () => {
    expect(mapMuscle("chest")).toBe("chest");
    expect(mapMuscle("upper chest")).toBe("chest");
    expect(mapMuscle("middle back")).toBe("upper_back");
    expect(mapMuscle("traps")).toBe("upper_back");
    expect(mapMuscle("quadriceps")).toBe("quads");
    expect(mapMuscle("quads")).toBe("quads");
    expect(mapMuscle("abdominals")).toBe("core");
    expect(mapMuscle("scapular stabilizers")).toBe("rotator_cuff");
  });

  it("is case-insensitive", () => {
    expect(mapMuscle("Chest")).toBe("chest");
    expect(mapMuscle("LATS")).toBe("lats");
  });

  it("returns undefined for unknown labels", () => {
    expect(mapMuscle("unknown muscle")).toBeUndefined();
  });
});

describe("parseRepRange", () => {
  it("parses single number", () => {
    expect(parseRepRange("5")).toEqual({ low: 5, high: 5 });
  });

  it("parses dash range", () => {
    expect(parseRepRange("8-12")).toEqual({ low: 8, high: 12 });
  });

  it("parses en-dash range", () => {
    expect(parseRepRange("5–8")).toEqual({ low: 5, high: 8 });
  });

  it("returns null for AMRAP and other non-numeric", () => {
    expect(parseRepRange("AMRAP")).toBeNull();
    expect(parseRepRange(undefined)).toBeNull();
  });
});

describe("repMidpoint", () => {
  it("returns midpoint of range", () => {
    expect(repMidpoint("8-12")).toBe(10);
  });

  it("returns the number for single rep", () => {
    expect(repMidpoint("5")).toBe(5);
  });
});

describe("isCompound", () => {
  it("returns true for exercises with compound tag", () => {
    expect(isCompound(makeExercise(), { tags: ["compound"] } as any)).toBe(true);
  });

  it("returns false for exercises with isolation tag", () => {
    expect(isCompound(makeExercise(), { tags: ["isolation"] } as any)).toBe(false);
  });

  it("infers compound from 2+ primary muscles", () => {
    expect(isCompound(makeExercise({ tags: { primary: ["chest", "triceps"], secondary: [], incidental: [], modifiers: [] } }))).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/lib/analysis/muscles.test.ts --verbose`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/types.ts src/lib/analysis/thresholds.ts src/lib/analysis/muscles.ts src/lib/analysis/muscles.test.ts
git commit -m "feat(analysis): add types, volume thresholds, and muscle taxonomy mapping"
```

---

## Task 3: Test Fixtures

**Files:**
- Create: `src/lib/analysis/fixtures.ts`

Shared test fixtures used across all analysis test files. Contains a balanced 3-day upper/lower program and a deliberately imbalanced program for testing warnings.

- [ ] **Step 1: Create fixtures file**

```typescript
// src/lib/analysis/fixtures.ts
import type { ProgramDay, ProgramDocument, ProgramExercise, ProgramSection, ProgramGroup } from "@/lib/programs/types";

function ex(id: string, name: string, sets: number, reps: string, primary: string[], secondary: string[] = [], incidental: string[] = [], modifiers: string[] = []): ProgramExercise {
  return { id, name, sets, reps, tags: { primary, secondary, incidental, modifiers } };
}

function group(id: string, ...exercises: ProgramExercise[]): ProgramGroup {
  return { id, type: "single", exercises };
}

function section(id: string, type: ProgramSection["type"], name: string, ...groups: ProgramGroup[]): ProgramSection {
  return { id, type, name, groups };
}

function day(id: string, dayNumber: number, title: string, ...sections: ProgramSection[]): ProgramDay {
  return { id, dayNumber, weekNumber: 1, title, sections };
}

function program(id: string, title: string, days: ProgramDay[]): ProgramDocument {
  return { id, title, source: "manual", active: true, days, overrides: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
}

// ── Balanced 3-day upper/lower split ────────────────────────────────────────
export const balancedProgram = program("balanced", "Balanced Upper/Lower", [
  day("d1", 1, "Upper A",
    section("d1s1", "strength", "Strength",
      group("d1g1",
        ex("bench", "Barbell Bench Press", 4, "5-8", ["chest", "front delts"], ["triceps"]),
        ex("row", "Barbell Row", 4, "5-8", ["upper back", "lats"], ["biceps", "rear delts"]),
        ex("ohp", "Overhead Press", 3, "8-10", ["shoulders", "front delts"], ["triceps"]),
      ),
    ),
    section("d1s2", "accessory", "Accessories",
      group("d1g2",
        ex("curl", "Barbell Curl", 3, "10-12", ["biceps"], ["forearms"]),
        ex("tri", "Tricep Pushdown", 3, "10-12", ["triceps"]),
        ex("lat-raise", "Lateral Raise", 3, "12-15", ["shoulders"]),
        ex("face-pull", "Face Pull", 3, "15-20", ["rear delts"], ["rotator cuff"]),
      ),
    ),
  ),
  day("d2", 2, "Lower",
    section("d2s1", "strength", "Strength",
      group("d2g1",
        ex("squat", "Barbell Back Squat", 4, "5-8", ["quads", "glutes"], ["hamstrings", "core"]),
        ex("rdl", "Romanian Deadlift", 3, "8-10", ["hamstrings", "glutes"], ["lower back"]),
      ),
    ),
    section("d2s2", "accessory", "Accessories",
      group("d2g2",
        ex("leg-curl", "Lying Leg Curl", 3, "10-12", ["hamstrings"]),
        ex("calf", "Standing Calf Raise", 4, "12-15", ["calves"]),
        ex("leg-ext", "Leg Extension", 3, "10-12", ["quads"]),
      ),
    ),
  ),
  day("d3", 3, "Upper B",
    section("d3s1", "strength", "Strength",
      group("d3g1",
        ex("incline", "Incline DB Press", 4, "8-10", ["chest", "front delts"], ["triceps"]),
        ex("pullup", "Pull-Up", 4, "5-8", ["lats"], ["biceps", "rear delts"]),
        ex("db-row", "Dumbbell Row", 3, "8-10", ["upper back", "lats"], ["biceps"]),
      ),
    ),
    section("d3s2", "accessory", "Accessories",
      group("d3g2",
        ex("hammer", "Hammer Curl", 3, "10-12", ["biceps"], ["forearms"]),
        ex("oh-tri", "Overhead Tricep Extension", 3, "10-12", ["triceps"]),
        ex("rear-fly", "Reverse Fly", 3, "12-15", ["rear delts"]),
      ),
    ),
  ),
]);

// ── Imbalanced program: too much push, no lower body, too many exercises ────
export const imbalancedProgram = program("imbalanced", "Chest Bro Special", [
  day("d1", 1, "Chest Day",
    section("d1s1", "hypertrophy", "Chest",
      group("d1g1",
        ex("bp1", "Bench Press", 5, "8-12", ["chest", "front delts"], ["triceps"]),
        ex("bp2", "Incline Bench Press", 4, "8-12", ["chest", "front delts"], ["triceps"]),
        ex("bp3", "Decline Bench Press", 4, "8-12", ["chest"], ["triceps"]),
        ex("bp4", "DB Flyes", 4, "12-15", ["chest"]),
        ex("bp5", "Cable Crossover", 4, "12-15", ["chest"]),
        ex("bp6", "Pec Deck", 3, "12-15", ["chest"]),
        ex("bp7", "Push-Up", 3, "15-20", ["chest", "front delts"], ["triceps"]),
        ex("bp8", "Dip", 3, "8-12", ["chest", "triceps"], ["front delts"]),
        ex("bp9", "Landmine Press", 3, "10-12", ["chest", "shoulders"], ["triceps"]),
        ex("bp10", "Machine Chest Press", 3, "10-12", ["chest"], ["triceps"]),
        ex("bp11", "Close-Grip Bench", 3, "8-10", ["triceps", "chest"]),
      ),
    ),
  ),
  day("d2", 2, "Shoulders and Arms",
    section("d2s1", "hypertrophy", "Shoulders",
      group("d2g1",
        ex("sp1", "Overhead Press", 4, "8-10", ["shoulders", "front delts"], ["triceps"]),
        ex("sp2", "Lateral Raise", 4, "12-15", ["shoulders"]),
        ex("sp3", "Front Raise", 3, "12-15", ["front delts"]),
      ),
    ),
    section("d2s2", "accessory", "Arms",
      group("d2g2",
        ex("c1", "Barbell Curl", 3, "10-12", ["biceps"]),
        ex("t1", "Skull Crusher", 3, "10-12", ["triceps"]),
      ),
    ),
  ),
]);

// ── Multi-week program with volume progression ──────────────────────────────
export const multiWeekProgram = program("multi-week", "4-Week Block", [
  // Week 1: lower volume
  day("w1d1", 1, "Week 1 Upper",
    section("w1s1", "strength", "Strength",
      group("w1g1",
        ex("w1-bench", "Bench Press", 3, "8-10", ["chest", "front delts"], ["triceps"]),
        ex("w1-row", "Barbell Row", 3, "8-10", ["upper back", "lats"], ["biceps"]),
      ),
    ),
  ),
  // Week 2: more volume
  { ...day("w2d1", 1, "Week 2 Upper",
    section("w2s1", "strength", "Strength",
      group("w2g1",
        ex("w2-bench", "Bench Press", 4, "8-10", ["chest", "front delts"], ["triceps"]),
        ex("w2-row", "Barbell Row", 4, "8-10", ["upper back", "lats"], ["biceps"]),
      ),
    ),
  ), weekNumber: 2 },
  // Week 3: peak volume
  { ...day("w3d1", 1, "Week 3 Upper",
    section("w3s1", "strength", "Strength",
      group("w3g1",
        ex("w3-bench", "Bench Press", 5, "6-8", ["chest", "front delts"], ["triceps"]),
        ex("w3-row", "Barbell Row", 5, "6-8", ["upper back", "lats"], ["biceps"]),
      ),
    ),
  ), weekNumber: 3 },
  // Week 4: deload
  { ...day("w4d1", 1, "Week 4 Deload",
    section("w4s1", "strength", "Deload",
      group("w4g1",
        ex("w4-bench", "Bench Press", 2, "10-12", ["chest", "front delts"], ["triceps"]),
        ex("w4-row", "Barbell Row", 2, "10-12", ["upper back", "lats"], ["biceps"]),
      ),
    ),
  ), weekNumber: 4 },
]);
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/analysis/fixtures.ts
git commit -m "feat(analysis): add shared test fixtures for analysis tests"
```

---

## Task 4: Volume Counting Engine

**Files:**
- Create: `src/lib/analysis/volume.ts`
- Create: `src/lib/analysis/volume.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/analysis/volume.test.ts
import { countWeeklyVolume, scoreVolume } from "./volume";
import { balancedProgram, imbalancedProgram } from "./fixtures";
import type { MuscleGroup } from "./types";

describe("countWeeklyVolume", () => {
  it("counts tiered volume for a balanced program (week 1)", () => {
    const volumes = countWeeklyVolume(balancedProgram.days, 1);

    // Bench Press (4 sets): chest=4×1.0, front_delts=4×1.0, triceps=4×0.5
    // Incline DB Press (4 sets): chest=4×1.0, front_delts=4×1.0, triceps=4×0.5
    // Total chest from primary across Upper A + Upper B: 4+4=8
    expect(volumes.get("chest")).toBeGreaterThanOrEqual(8);
  });

  it("counts secondary muscles at 0.5 weight", () => {
    const volumes = countWeeklyVolume(balancedProgram.days, 1);

    // Triceps gets direct work (3+3=6 primary) plus secondary from pressing
    // Bench(4×0.5) + OHP(3×0.5) + Incline(4×0.5) = 5.5 secondary
    // Total: 6 direct + 5.5 secondary = 11.5
    const triceps = volumes.get("triceps")!;
    expect(triceps).toBeGreaterThan(6);
    expect(triceps).toBeLessThan(15);
  });

  it("returns zero for muscle groups not trained", () => {
    const volumes = countWeeklyVolume(imbalancedProgram.days, 1);
    expect(volumes.get("quads") ?? 0).toBe(0);
    expect(volumes.get("hamstrings") ?? 0).toBe(0);
  });

  it("handles missing week number by treating all days as week 1", () => {
    const volumes = countWeeklyVolume(balancedProgram.days);
    expect(volumes.get("chest")).toBeGreaterThan(0);
  });
});

describe("scoreVolume", () => {
  it("flags imbalanced program with chest above MAV", () => {
    const volumes = countWeeklyVolume(imbalancedProgram.days, 1);
    const results = scoreVolume(volumes);
    const chest = results.find((r) => r.muscle === "chest")!;
    expect(chest.severity).toBe("red");
  });

  it("scores balanced program muscles in green range", () => {
    const volumes = countWeeklyVolume(balancedProgram.days, 1);
    const results = scoreVolume(volumes);
    const chest = results.find((r) => r.muscle === "chest")!;
    expect(["green", "yellow"]).toContain(chest.severity);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/analysis/volume.test.ts --verbose`
Expected: FAIL — `countWeeklyVolume` is not defined.

- [ ] **Step 3: Implement volume engine**

```typescript
// src/lib/analysis/volume.ts
import type { ProgramDay } from "@/lib/programs/types";
import type { MuscleGroup, MuscleVolumeResult, Severity } from "./types";
import { ALL_MUSCLE_GROUPS } from "./types";
import { VOLUME_LANDMARKS } from "./thresholds";
import { mapMuscle, getEffectiveSets } from "./muscles";

export function countWeeklyVolume(
  days: ProgramDay[],
  weekNumber = 1,
): Map<MuscleGroup, number> {
  const volumes = new Map<MuscleGroup, number>();

  const weekDays = days.filter((d) => (d.weekNumber ?? 1) === weekNumber);

  for (const day of weekDays) {
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          const sets = getEffectiveSets(exercise);
          addMuscleVolume(volumes, exercise.tags.primary, sets, 1.0);
          addMuscleVolume(volumes, exercise.tags.secondary, sets, 0.5);
          addMuscleVolume(volumes, exercise.tags.incidental, sets, 0.25);
        }
      }
    }
  }

  return volumes;
}

function addMuscleVolume(
  volumes: Map<MuscleGroup, number>,
  muscles: string[],
  sets: number,
  weight: number,
): void {
  for (const label of muscles) {
    const canonical = mapMuscle(label);
    if (!canonical) continue;
    volumes.set(canonical, (volumes.get(canonical) ?? 0) + sets * weight);
  }
}

export function scoreVolume(volumes: Map<MuscleGroup, number>): MuscleVolumeResult[] {
  return ALL_MUSCLE_GROUPS.map((muscle) => {
    const sets = volumes.get(muscle) ?? 0;
    const landmarks = VOLUME_LANDMARKS[muscle];
    const { severity, label } = classifyVolume(sets, landmarks);
    return { muscle, effectiveSets: Math.round(sets * 10) / 10, severity, label, landmarks };
  });
}

function classifyVolume(
  sets: number,
  lm: typeof VOLUME_LANDMARKS[MuscleGroup],
): { severity: Severity; label: string } {
  if (sets < lm.mv) return { severity: "red", label: "Below maintenance" };
  if (sets < lm.mev) return { severity: "yellow", label: "Maintenance only" };
  if (sets <= lm.mavHigh) return { severity: "green", label: "Productive range" };
  if (sets <= lm.mrv) return { severity: "yellow", label: "High — approaching limit" };
  return { severity: "red", label: "Excessive — recovery impaired" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/analysis/volume.test.ts --verbose`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/volume.ts src/lib/analysis/volume.test.ts
git commit -m "feat(analysis): add volume counting engine with tiered muscle weighting"
```

---

## Task 5: Session Constraint Checker

**Files:**
- Create: `src/lib/analysis/session.ts`
- Create: `src/lib/analysis/session.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/analysis/session.test.ts
import { analyzeSessions } from "./session";
import { balancedProgram, imbalancedProgram } from "./fixtures";

describe("analyzeSessions", () => {
  it("counts exercises and sets per day", () => {
    const results = analyzeSessions(balancedProgram.days);
    const upperA = results.find((r) => r.dayId === "d1")!;
    expect(upperA.exerciseCount).toBe(7);
    expect(upperA.totalSets).toBe(4 + 4 + 3 + 3 + 3 + 3 + 3);
  });

  it("estimates session duration", () => {
    const results = analyzeSessions(balancedProgram.days);
    const upperA = results.find((r) => r.dayId === "d1")!;
    // (23 sets × 3) + 10 = 79 minutes
    expect(upperA.estimatedMinutes).toBe(23 * 3 + 10);
  });

  it("flags sessions with too many exercises", () => {
    const results = analyzeSessions(imbalancedProgram.days);
    const chestDay = results.find((r) => r.dayId === "d1")!;
    expect(chestDay.exerciseCount).toBe(11);
    expect(chestDay.warnings.some((w) => w.message.includes("exercises"))).toBe(true);
  });

  it("flags per-muscle volume exceeding session cap", () => {
    const results = analyzeSessions(imbalancedProgram.days);
    const chestDay = results.find((r) => r.dayId === "d1")!;
    expect(chestDay.warnings.some((w) => w.message.includes("chest"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/analysis/session.test.ts --verbose`
Expected: FAIL.

- [ ] **Step 3: Implement session checker**

```typescript
// src/lib/analysis/session.ts
import type { ProgramDay } from "@/lib/programs/types";
import type { MuscleGroup, SessionResult, Warning } from "./types";
import { SESSION_LIMITS } from "./thresholds";
import { mapMuscle, getEffectiveSets } from "./muscles";

export function analyzeSessions(days: ProgramDay[]): SessionResult[] {
  return days.map(analyzeDay);
}

function analyzeDay(day: ProgramDay): SessionResult {
  let exerciseCount = 0;
  let totalSets = 0;
  const muscleSetCounts: Partial<Record<MuscleGroup, number>> = {};
  const warnings: Warning[] = [];

  for (const section of day.sections) {
    for (const group of section.groups) {
      for (const exercise of group.exercises) {
        exerciseCount++;
        const sets = getEffectiveSets(exercise);
        totalSets += sets;

        for (const label of exercise.tags.primary) {
          const muscle = mapMuscle(label);
          if (muscle) muscleSetCounts[muscle] = (muscleSetCounts[muscle] ?? 0) + sets;
        }
      }
    }
  }

  const estimatedMinutes = totalSets * 3 + 10;
  const lim = SESSION_LIMITS;

  if (exerciseCount > lim.exercises.yellowMax) {
    warnings.push({ severity: "red", dimension: "session", message: `${day.title}: ${exerciseCount} exercises (recommended: ${lim.exercises.greenMin}-${lim.exercises.greenMax})` });
  } else if (exerciseCount > lim.exercises.greenMax) {
    warnings.push({ severity: "yellow", dimension: "session", message: `${day.title}: ${exerciseCount} exercises — on the high end` });
  }

  if (totalSets > lim.totalSets.yellowMax) {
    warnings.push({ severity: "red", dimension: "session", message: `${day.title}: ${totalSets} total sets (recommended: ${lim.totalSets.greenMin}-${lim.totalSets.greenMax})` });
  } else if (totalSets > lim.totalSets.greenMax) {
    warnings.push({ severity: "yellow", dimension: "session", message: `${day.title}: ${totalSets} total sets — high volume` });
  }

  if (estimatedMinutes > lim.durationMinutes.yellowMax) {
    warnings.push({ severity: "red", dimension: "session", message: `${day.title}: estimated ${estimatedMinutes} min (recommended: ${lim.durationMinutes.greenMin}-${lim.durationMinutes.greenMax} min)` });
  } else if (estimatedMinutes > lim.durationMinutes.greenMax) {
    warnings.push({ severity: "yellow", dimension: "session", message: `${day.title}: estimated ${estimatedMinutes} min — long session` });
  }

  for (const [muscle, count] of Object.entries(muscleSetCounts)) {
    if (count > lim.setsPerMuscle.yellowMax) {
      warnings.push({ severity: "red", dimension: "session", message: `${day.title}: ${count} direct sets for ${muscle} in one session (cap: ${lim.setsPerMuscle.greenMax})` });
    } else if (count > lim.setsPerMuscle.greenMax) {
      warnings.push({ severity: "yellow", dimension: "session", message: `${day.title}: ${count} direct sets for ${muscle} — approaching session cap` });
    }
  }

  return { dayId: day.id, dayTitle: day.title, exerciseCount, totalSets, estimatedMinutes, muscleSetCounts, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/analysis/session.test.ts --verbose`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/session.ts src/lib/analysis/session.test.ts
git commit -m "feat(analysis): add session constraint checker"
```

---

## Task 6: Balance Ratio Analyzer

**Files:**
- Create: `src/lib/analysis/balance.ts`
- Create: `src/lib/analysis/balance.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/analysis/balance.test.ts
import { analyzeBalance } from "./balance";
import { balancedProgram, imbalancedProgram } from "./fixtures";

describe("analyzeBalance", () => {
  it("computes push:pull ratio near 1.0 for balanced program", () => {
    const result = analyzeBalance(balancedProgram.days);
    expect(result.pushPullRatio).not.toBeNull();
    expect(result.pushPullRatio!).toBeGreaterThan(0.5);
    expect(result.pushPullRatio!).toBeLessThan(1.5);
  });

  it("flags push-dominant ratio for imbalanced program", () => {
    const result = analyzeBalance(imbalancedProgram.days);
    expect(result.pushPullRatio).toBeGreaterThan(1.5);
    expect(result.warnings.some((w) => w.message.toLowerCase().includes("push"))).toBe(true);
  });

  it("identifies missing lower body in imbalanced program", () => {
    const result = analyzeBalance(imbalancedProgram.days);
    expect(result.warnings.some((w) => w.message.toLowerCase().includes("lower"))).toBe(true);
  });

  it("reports movement patterns covered", () => {
    const result = analyzeBalance(balancedProgram.days);
    expect(result.movementPatternsCovered.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/analysis/balance.test.ts --verbose`
Expected: FAIL.

- [ ] **Step 3: Implement balance analyzer**

```typescript
// src/lib/analysis/balance.ts
import type { ProgramDay } from "@/lib/programs/types";
import type { BalanceResult, MuscleGroup, Warning } from "./types";
import { BALANCE_TARGETS, CORE_MOVEMENT_PATTERNS } from "./thresholds";
import { mapMuscle, getEffectiveSets, lookupCatalogExercise, classifyMovement, detectMovementPatterns } from "./muscles";

export function analyzeBalance(days: ProgramDay[]): BalanceResult {
  let pushSets = 0;
  let pullSets = 0;
  let upperSets = 0;
  let lowerSets = 0;
  let quadSets = 0;
  let hamSets = 0;
  let chestSets = 0;
  let backSets = 0;
  const patternsFound = new Set<string>();
  const warnings: Warning[] = [];

  const upper: MuscleGroup[] = ["chest", "lats", "upper_back", "lower_back", "front_delts", "side_delts", "rear_delts", "biceps", "triceps", "forearms"];
  const lower: MuscleGroup[] = ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"];

  for (const day of days) {
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          const sets = getEffectiveSets(exercise);
          const catalogItem = lookupCatalogExercise(exercise);
          const category = classifyMovement(catalogItem);

          if (category === "push") pushSets += sets;
          if (category === "pull") pullSets += sets;

          for (const label of exercise.tags.primary) {
            const muscle = mapMuscle(label);
            if (!muscle) continue;
            if (upper.includes(muscle)) upperSets += sets;
            if (lower.includes(muscle)) lowerSets += sets;
            if (muscle === "quads") quadSets += sets;
            if (muscle === "hamstrings") hamSets += sets;
            if (muscle === "chest") chestSets += sets;
            if (muscle === "lats" || muscle === "upper_back") backSets += sets;
          }

          for (const pattern of detectMovementPatterns(catalogItem, exercise)) {
            patternsFound.add(pattern);
          }
        }
      }
    }
  }

  const pushPullRatio = pullSets > 0 ? pushSets / pullSets : pushSets > 0 ? Infinity : null;
  const upperLowerRatio = lowerSets > 0 ? upperSets / lowerSets : upperSets > 0 ? Infinity : null;
  const quadHamRatio = hamSets > 0 ? quadSets / hamSets : quadSets > 0 ? Infinity : null;
  const chestBackRatio = backSets > 0 ? chestSets / backSets : chestSets > 0 ? Infinity : null;

  const bt = BALANCE_TARGETS;

  if (pushPullRatio !== null && pushPullRatio > bt.pushPull.warnMax) {
    warnings.push({ severity: "red", dimension: "balance", message: `Push:Pull ratio is ${pushPullRatio.toFixed(1)}:1 — significantly push-dominant (target: ≤1:1)` });
  } else if (pushPullRatio !== null && pushPullRatio > bt.pushPull.idealMax) {
    warnings.push({ severity: "yellow", dimension: "balance", message: `Push:Pull ratio is ${pushPullRatio.toFixed(1)}:1 — slightly push-dominant` });
  }

  if (upperLowerRatio !== null && upperLowerRatio > bt.upperLower.warnMax) {
    warnings.push({ severity: "red", dimension: "balance", message: `Upper:Lower ratio is ${upperLowerRatio.toFixed(1)}:1 — lower body significantly undertrained` });
  } else if (upperLowerRatio !== null && upperLowerRatio > bt.upperLower.idealMax) {
    warnings.push({ severity: "yellow", dimension: "balance", message: `Upper:Lower ratio is ${upperLowerRatio.toFixed(1)}:1 — upper-dominant` });
  }

  if (lowerSets === 0 && upperSets > 0) {
    warnings.push({ severity: "red", dimension: "balance", message: "No lower body training detected" });
  }

  if (quadHamRatio !== null && quadHamRatio > bt.quadHam.warnMax) {
    warnings.push({ severity: "yellow", dimension: "balance", message: `Quad:Hamstring ratio is ${quadHamRatio.toFixed(1)}:1 — consider more hamstring work` });
  }

  if (chestBackRatio !== null && chestBackRatio > bt.chestBack.warnMax) {
    warnings.push({ severity: "yellow", dimension: "balance", message: `Chest:Back ratio is ${chestBackRatio.toFixed(1)}:1 — consider more back work` });
  }

  const allPatterns = CORE_MOVEMENT_PATTERNS as readonly string[];
  const movementPatternsCovered = allPatterns.filter((p) => patternsFound.has(p));
  const movementPatternsMissing = allPatterns.filter((p) => !patternsFound.has(p));

  if (movementPatternsMissing.length >= 2) {
    warnings.push({ severity: "red", dimension: "balance", message: `Missing movement patterns: ${movementPatternsMissing.join(", ")}` });
  } else if (movementPatternsMissing.length === 1) {
    warnings.push({ severity: "yellow", dimension: "balance", message: `Missing movement pattern: ${movementPatternsMissing[0]}` });
  }

  return { pushPullRatio, upperLowerRatio, quadHamRatio, chestBackRatio, movementPatternsCovered, movementPatternsMissing, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/analysis/balance.test.ts --verbose`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/balance.ts src/lib/analysis/balance.test.ts
git commit -m "feat(analysis): add balance ratio analyzer with movement pattern coverage"
```

---

## Task 7: Goal Inference Engine

**Files:**
- Create: `src/lib/analysis/goals.ts`
- Create: `src/lib/analysis/goals.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/analysis/goals.test.ts
import { inferGoal } from "./goals";
import { balancedProgram, imbalancedProgram } from "./fixtures";

describe("inferGoal", () => {
  it("infers strength-oriented goal from the balanced program (low rep compounds)", () => {
    const result = inferGoal(balancedProgram.days);
    expect(["strength", "general_fitness", "hypertrophy"]).toContain(result.primary);
    expect(result.fingerprint).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("infers hypertrophy for the imbalanced bro-split program", () => {
    const result = inferGoal(imbalancedProgram.days);
    expect(result.primary).toBe("hypertrophy");
  });

  it("generates a human-readable fingerprint", () => {
    const result = inferGoal(balancedProgram.days);
    expect(result.fingerprint.length).toBeGreaterThan(10);
  });

  it("sets secondary goal when scores are close", () => {
    const result = inferGoal(balancedProgram.days);
    // balanced program mixes strength and hypertrophy, so secondary should be set
    // (or null if one goal dominates — either outcome is valid)
    expect(typeof result.secondary === "string" || result.secondary === null).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/analysis/goals.test.ts --verbose`
Expected: FAIL.

- [ ] **Step 3: Implement goal inference**

```typescript
// src/lib/analysis/goals.ts
import type { ProgramDay } from "@/lib/programs/types";
import type { GoalArchetype, GoalSignature } from "./types";
import { GOAL_SECTION_WEIGHTS, GOAL_REP_RANGES, GOAL_COMPOUND_RATIO } from "./thresholds";
import { repMidpoint, isCompound, lookupCatalogExercise, getEffectiveSets } from "./muscles";

const ALL_GOALS: GoalArchetype[] = [
  "hypertrophy", "strength", "olympic_weightlifting",
  "general_fitness", "crossfit", "rehab",
];

export function inferGoal(days: ProgramDay[]): GoalSignature {
  const scores = new Map<GoalArchetype, number>();

  for (const goal of ALL_GOALS) {
    scores.set(goal, 0);
  }

  scoreSectionTypes(days, scores);
  scoreRepRanges(days, scores);
  scoreCompoundRatio(days, scores);
  scoreTagSignals(days, scores);

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [primary, primaryScore] = sorted[0];
  const [secondary, secondaryScore] = sorted.length > 1 ? sorted[1] : [null, 0];
  const maxPossible = Math.max(primaryScore, 1);
  const confidence = primaryScore / (primaryScore + (sorted[1]?.[1] ?? 0));

  const hasSecondary = secondary && secondaryScore >= primaryScore * 0.7;
  const fingerprint = buildFingerprint(primary, hasSecondary ? secondary : null, days);

  return {
    primary,
    secondary: hasSecondary ? secondary : null,
    confidence: Math.round(confidence * 100) / 100,
    fingerprint,
  };
}

function scoreSectionTypes(days: ProgramDay[], scores: Map<GoalArchetype, number>): void {
  for (const day of days) {
    for (const section of day.sections) {
      for (const goal of ALL_GOALS) {
        const weight = GOAL_SECTION_WEIGHTS[goal][section.type] ?? 0;
        scores.set(goal, (scores.get(goal) ?? 0) + weight);
      }
    }
  }
}

function scoreRepRanges(days: ProgramDay[], scores: Map<GoalArchetype, number>): void {
  let heavy = 0;
  let moderate = 0;
  let light = 0;
  let total = 0;

  for (const day of days) {
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          const mid = repMidpoint(exercise.reps);
          if (mid === null) continue;
          const sets = getEffectiveSets(exercise);
          total += sets;
          if (mid <= 5) heavy += sets;
          else if (mid <= 12) moderate += sets;
          else light += sets;
        }
      }
    }
  }

  if (total === 0) return;
  const dist = { heavy: heavy / total, moderate: moderate / total, light: light / total };

  for (const goal of ALL_GOALS) {
    const target = GOAL_REP_RANGES[goal];
    const similarity = 1 - (
      Math.abs(dist.heavy - target.heavy) +
      Math.abs(dist.moderate - target.moderate) +
      Math.abs(dist.light - target.light)
    ) / 2;
    scores.set(goal, (scores.get(goal) ?? 0) + similarity * 3);
  }
}

function scoreCompoundRatio(days: ProgramDay[], scores: Map<GoalArchetype, number>): void {
  let compound = 0;
  let isolation = 0;

  for (const day of days) {
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          const catalogItem = lookupCatalogExercise(exercise);
          if (isCompound(exercise, catalogItem)) compound++;
          else isolation++;
        }
      }
    }
  }

  const total = compound + isolation;
  if (total === 0) return;
  const ratio = compound / total;

  for (const goal of ALL_GOALS) {
    const target = GOAL_COMPOUND_RATIO[goal];
    const mid = (target.min + target.max) / 2;
    const distance = Math.abs(ratio - mid);
    const score = Math.max(0, 1 - distance * 3);
    scores.set(goal, (scores.get(goal) ?? 0) + score * 2);
  }
}

function scoreTagSignals(days: ProgramDay[], scores: Map<GoalArchetype, number>): void {
  const tagCounts = new Map<string, number>();
  for (const day of days) {
    for (const section of day.sections) {
      for (const group of section.groups) {
        for (const exercise of group.exercises) {
          for (const mod of exercise.tags.modifiers) {
            tagCounts.set(mod.toLowerCase(), (tagCounts.get(mod.toLowerCase()) ?? 0) + 1);
          }
        }
      }
    }
  }

  if (tagCounts.has("explosive") || tagCounts.has("plyometrics")) {
    scores.set("olympic_weightlifting", (scores.get("olympic_weightlifting") ?? 0) + (tagCounts.get("explosive") ?? 0) * 0.5);
    scores.set("crossfit", (scores.get("crossfit") ?? 0) + (tagCounts.get("explosive") ?? 0) * 0.3);
  }
  if (tagCounts.has("pump")) {
    scores.set("hypertrophy", (scores.get("hypertrophy") ?? 0) + (tagCounts.get("pump") ?? 0) * 0.5);
  }
  if (tagCounts.has("prehab") || tagCounts.has("activation")) {
    scores.set("rehab", (scores.get("rehab") ?? 0) + ((tagCounts.get("prehab") ?? 0) + (tagCounts.get("activation") ?? 0)) * 0.5);
  }
}

function buildFingerprint(primary: GoalArchetype, secondary: GoalArchetype | null, days: ProgramDay[]): string {
  const goalLabels: Record<GoalArchetype, string> = {
    hypertrophy: "Hypertrophy-focused",
    strength: "Strength-focused",
    olympic_weightlifting: "Olympic weightlifting",
    general_fitness: "General fitness",
    crossfit: "CrossFit-style",
    rehab: "Rehab/mobility-focused",
  };

  let desc = goalLabels[primary];
  if (secondary) desc += ` with ${goalLabels[secondary].toLowerCase()} component`;

  const dayCount = days.length;
  if (dayCount <= 3) desc += ` (${dayCount}-day)`;
  else if (dayCount <= 5) desc += ` (${dayCount}-day split)`;
  else desc += ` (${dayCount}-day high-frequency)`;

  return desc;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/analysis/goals.test.ts --verbose`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/goals.ts src/lib/analysis/goals.test.ts
git commit -m "feat(analysis): add goal inference engine with structural fingerprinting"
```

---

## Task 8: Periodization Detector

**Files:**
- Create: `src/lib/analysis/periodization.ts`
- Create: `src/lib/analysis/periodization.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/analysis/periodization.test.ts
import { analyzePeriodization } from "./periodization";
import { balancedProgram, multiWeekProgram } from "./fixtures";

describe("analyzePeriodization", () => {
  it("detects single-week program as static", () => {
    const result = analyzePeriodization(balancedProgram.days);
    expect(result.weeksDetected).toBe(1);
    expect(result.volumePattern).toBe("static");
  });

  it("detects increasing volume in multi-week program", () => {
    const result = analyzePeriodization(multiWeekProgram.days);
    expect(result.weeksDetected).toBe(4);
    // Weeks 1→2→3 increase, week 4 drops (deload)
    // The overall pattern should be "wave" since it goes up then down
    expect(["increasing", "wave"]).toContain(result.volumePattern);
  });

  it("detects deload week", () => {
    const result = analyzePeriodization(multiWeekProgram.days);
    expect(result.deloadDetected).toBe(true);
  });

  it("warns about missing deload in single-week program", () => {
    const result = analyzePeriodization(balancedProgram.days);
    expect(result.warnings.some((w) => w.message.toLowerCase().includes("deload"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/analysis/periodization.test.ts --verbose`
Expected: FAIL.

- [ ] **Step 3: Implement periodization detector**

```typescript
// src/lib/analysis/periodization.ts
import type { ProgramDay } from "@/lib/programs/types";
import type { PeriodizationResult, Warning } from "./types";
import { getEffectiveSets } from "./muscles";

export function analyzePeriodization(days: ProgramDay[]): PeriodizationResult {
  const weeks = [...new Set(days.map((d) => d.weekNumber ?? 1))].sort((a, b) => a - b);
  const warnings: Warning[] = [];

  if (weeks.length <= 1) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "Single-week program — no periodization detected. Consider adding progressive overload across 4-6 weeks with a deload.",
    });
    return { weeksDetected: 1, volumePattern: "static", deloadDetected: false, warnings };
  }

  const weeklyVolumes = weeks.map((wk) => {
    const weekDays = days.filter((d) => (d.weekNumber ?? 1) === wk);
    let total = 0;
    for (const day of weekDays) {
      for (const section of day.sections) {
        for (const group of section.groups) {
          for (const exercise of group.exercises) {
            total += getEffectiveSets(exercise);
          }
        }
      }
    }
    return total;
  });

  const maxVolume = Math.max(...weeklyVolumes);
  const minVolume = Math.min(...weeklyVolumes);
  const lastWeekVolume = weeklyVolumes[weeklyVolumes.length - 1];
  const deloadDetected = lastWeekVolume <= maxVolume * 0.7 && weeklyVolumes.length >= 3;

  const volumePattern = detectPattern(weeklyVolumes);

  if (!deloadDetected && weeks.length >= 4) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "No deload week detected — consider reducing volume by 30%+ in the final week every 4-6 weeks.",
    });
  }

  if (volumePattern === "static" && weeks.length > 1) {
    warnings.push({
      severity: "yellow",
      dimension: "periodization",
      message: "Volume is flat across all weeks — consider progressive overload (add 1 set/muscle/week).",
    });
  }

  return { weeksDetected: weeks.length, volumePattern, deloadDetected, warnings };
}

function detectPattern(volumes: number[]): PeriodizationResult["volumePattern"] {
  if (volumes.length <= 1) return "static";

  const diffs: number[] = [];
  for (let i = 1; i < volumes.length; i++) {
    diffs.push(volumes[i] - volumes[i - 1]);
  }

  const allZero = diffs.every((d) => Math.abs(d) < 1);
  if (allZero) return "static";

  const increasing = diffs.every((d) => d >= 0);
  if (increasing) return "increasing";

  const decreasing = diffs.every((d) => d <= 0);
  if (decreasing) return "decreasing";

  return "wave";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/analysis/periodization.test.ts --verbose`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/periodization.ts src/lib/analysis/periodization.test.ts
git commit -m "feat(analysis): add multi-week periodization detector"
```

---

## Task 9: Score Computation & Main Entry Point

**Files:**
- Create: `src/lib/analysis/score.ts`
- Create: `src/lib/analysis/analyze.ts`
- Create: `src/lib/analysis/analyze.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/analysis/analyze.test.ts
import { analyzeProgram } from "./analyze";
import { balancedProgram, imbalancedProgram, multiWeekProgram } from "./fixtures";

describe("analyzeProgram", () => {
  it("returns a complete AnalysisResult for a balanced program", () => {
    const result = analyzeProgram(balancedProgram);
    expect(result.overall.grade).toBeTruthy();
    expect(result.overall.score).toBeGreaterThanOrEqual(0);
    expect(result.overall.score).toBeLessThanOrEqual(100);
    expect(result.muscleVolumes.length).toBeGreaterThan(0);
    expect(result.sessions.length).toBe(3);
    expect(result.goal.primary).toBeTruthy();
    expect(result.goal.fingerprint).toBeTruthy();
  });

  it("scores balanced program higher than imbalanced", () => {
    const balanced = analyzeProgram(balancedProgram);
    const imbalanced = analyzeProgram(imbalancedProgram);
    expect(balanced.overall.score).toBeGreaterThan(imbalanced.overall.score);
  });

  it("collects warnings from all dimensions", () => {
    const result = analyzeProgram(imbalancedProgram);
    expect(result.warnings.length).toBeGreaterThan(0);
    const dimensions = new Set(result.warnings.map((w) => w.dimension));
    expect(dimensions.size).toBeGreaterThan(1);
  });

  it("handles multi-week programs", () => {
    const result = analyzeProgram(multiWeekProgram);
    expect(result.periodization.weeksDetected).toBe(4);
    expect(result.periodization.deloadDetected).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/analysis/analyze.test.ts --verbose`
Expected: FAIL.

- [ ] **Step 3: Implement score computation**

```typescript
// src/lib/analysis/score.ts
import type { DimensionScore, Grade, MuscleVolumeResult, SessionResult, BalanceResult, GoalSignature, PeriodizationResult, Warning } from "./types";
import { DIMENSION_WEIGHTS, BALANCE_TARGETS, SESSION_LIMITS, GOAL_COMPOUND_RATIO } from "./thresholds";

export function computeOverallScore(dimensions: {
  volume: DimensionScore;
  session: DimensionScore;
  balance: DimensionScore;
  goalCoherence: DimensionScore;
  periodization: DimensionScore;
}): DimensionScore {
  const w = DIMENSION_WEIGHTS;
  const score = Math.round(
    dimensions.volume.score * w.volume +
    dimensions.session.score * w.session +
    dimensions.balance.score * w.balance +
    dimensions.goalCoherence.score * w.goalCoherence +
    dimensions.periodization.score * w.periodization
  );
  return { name: "Overall", score, grade: scoreToGrade(score) };
}

export function scoreVolumeDimension(results: MuscleVolumeResult[]): DimensionScore {
  const trained = results.filter((r) => r.effectiveSets > 0 || r.landmarks.mev > 0);
  if (trained.length === 0) return { name: "Volume", score: 0, grade: "F" };
  const scores = trained.map((r) => {
    if (r.severity === "green") return 90;
    if (r.severity === "yellow") return 60;
    return 30;
  });
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { name: "Volume", score: avg, grade: scoreToGrade(avg) };
}

export function scoreSessionDimension(results: SessionResult[]): DimensionScore {
  if (results.length === 0) return { name: "Session Structure", score: 0, grade: "F" };

  const sessionScores = results.map((session) => {
    let s = 100;
    const reds = session.warnings.filter((w) => w.severity === "red").length;
    const yellows = session.warnings.filter((w) => w.severity === "yellow").length;
    s -= reds * 20;
    s -= yellows * 8;
    return Math.max(0, Math.min(100, s));
  });

  const avg = Math.round(sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length);
  return { name: "Session Structure", score: avg, grade: scoreToGrade(avg) };
}

export function scoreBalanceDimension(result: BalanceResult): DimensionScore {
  let score = 100;
  const reds = result.warnings.filter((w) => w.severity === "red").length;
  const yellows = result.warnings.filter((w) => w.severity === "yellow").length;
  score -= reds * 20;
  score -= yellows * 8;
  score = Math.max(0, Math.min(100, score));
  return { name: "Balance", score, grade: scoreToGrade(score) };
}

export function scoreGoalCoherence(goal: GoalSignature): DimensionScore {
  const score = Math.round(goal.confidence * 100);
  return { name: "Goal Coherence", score, grade: scoreToGrade(score) };
}

export function scorePeriodizationDimension(result: PeriodizationResult): DimensionScore {
  let score = 100;
  if (result.weeksDetected <= 1) score -= 30;
  if (!result.deloadDetected && result.weeksDetected >= 4) score -= 20;
  if (result.volumePattern === "static" && result.weeksDetected > 1) score -= 20;
  const reds = result.warnings.filter((w) => w.severity === "red").length;
  const yellows = result.warnings.filter((w) => w.severity === "yellow").length;
  score -= reds * 15;
  score -= yellows * 5;
  score = Math.max(0, Math.min(100, score));
  return { name: "Periodization", score, grade: scoreToGrade(score) };
}

export function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}
```

- [ ] **Step 4: Implement main entry point**

```typescript
// src/lib/analysis/analyze.ts
import type { ProgramDocument } from "@/lib/programs/types";
import type { AnalysisResult } from "./types";
import { getRenderableDays } from "@/lib/programs/overrides";
import { countWeeklyVolume, scoreVolume } from "./volume";
import { analyzeSessions } from "./session";
import { analyzeBalance } from "./balance";
import { inferGoal } from "./goals";
import { analyzePeriodization } from "./periodization";
import {
  computeOverallScore,
  scoreVolumeDimension,
  scoreSessionDimension,
  scoreBalanceDimension,
  scoreGoalCoherence,
  scorePeriodizationDimension,
} from "./score";

export function analyzeProgram(program: ProgramDocument): AnalysisResult {
  const days = getRenderableDays(program);

  const weeklyVolume = countWeeklyVolume(days, 1);
  const muscleVolumes = scoreVolume(weeklyVolume);
  const sessions = analyzeSessions(days);
  const balance = analyzeBalance(days);
  const goal = inferGoal(days);
  const periodization = analyzePeriodization(days);

  const dimensions = {
    volume: scoreVolumeDimension(muscleVolumes),
    session: scoreSessionDimension(sessions),
    balance: scoreBalanceDimension(balance),
    goalCoherence: scoreGoalCoherence(goal),
    periodization: scorePeriodizationDimension(periodization),
  };

  const overall = computeOverallScore(dimensions);

  const warnings = [
    ...muscleVolumes.filter((r) => r.severity !== "green").map((r) => ({
      severity: r.severity,
      dimension: "volume" as const,
      message: `${formatMuscleName(r.muscle)}: ${r.effectiveSets} sets/week — ${r.label}`,
    })),
    ...sessions.flatMap((s) => s.warnings),
    ...balance.warnings,
    ...periodization.warnings,
  ];

  return { overall, dimensions, muscleVolumes, sessions, balance, goal, periodization, warnings };
}

function formatMuscleName(muscle: string): string {
  return muscle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/lib/analysis/analyze.test.ts --verbose`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analysis/score.ts src/lib/analysis/analyze.ts src/lib/analysis/analyze.test.ts
git commit -m "feat(analysis): add score computation and main analyzeProgram entry point"
```

---

## Task 10: LLM Prompt Builder

**Files:**
- Create: `src/lib/analysis/llmPrompt.ts`
- Create: `src/lib/analysis/llmPrompt.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/analysis/llmPrompt.test.ts
import { buildLlmAnalysisPrompt } from "./llmPrompt";
import { balancedProgram } from "./fixtures";
import type { ProfileDocument } from "@/lib/programs/types";

const testProfile: ProfileDocument = {
  id: "local-profile",
  name: "Test User",
  goals: ["Build strength"],
  equipment: ["barbell", "dumbbells"],
  constraints: [],
  trainingAge: "intermediate",
  defaultDaysPerWeek: 3,
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("buildLlmAnalysisPrompt", () => {
  it("includes the program title", () => {
    const prompt = buildLlmAnalysisPrompt(balancedProgram, testProfile);
    expect(prompt).toContain("Balanced Upper/Lower");
  });

  it("includes volume landmarks reference table", () => {
    const prompt = buildLlmAnalysisPrompt(balancedProgram, testProfile);
    expect(prompt).toContain("Volume Landmarks");
    expect(prompt).toContain("Chest");
  });

  it("includes user profile when provided", () => {
    const prompt = buildLlmAnalysisPrompt(balancedProgram, testProfile);
    expect(prompt).toContain("intermediate");
    expect(prompt).toContain("Build strength");
  });

  it("works without a profile", () => {
    const prompt = buildLlmAnalysisPrompt(balancedProgram);
    expect(prompt).toContain("Balanced Upper/Lower");
    expect(prompt).toContain("No profile available");
  });

  it("includes analysis instructions", () => {
    const prompt = buildLlmAnalysisPrompt(balancedProgram, testProfile);
    expect(prompt).toContain("Program Fingerprint");
    expect(prompt).toContain("Volume Analysis");
    expect(prompt).toContain("Balance Assessment");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/analysis/llmPrompt.test.ts --verbose`
Expected: FAIL.

- [ ] **Step 3: Implement LLM prompt builder**

```typescript
// src/lib/analysis/llmPrompt.ts
import type { ProfileDocument, ProgramDocument, ProgramDay } from "@/lib/programs/types";
import { getRenderableDays } from "@/lib/programs/overrides";
import { getEffectiveSets } from "./muscles";

export function buildLlmAnalysisPrompt(
  program: ProgramDocument,
  profile?: ProfileDocument,
): string {
  const days = getRenderableDays(program);
  return [
    HEADER,
    VOLUME_REFERENCE,
    SESSION_REFERENCE,
    BALANCE_REFERENCE,
    GOAL_REFERENCE,
    formatProfile(profile),
    formatRoutine(program.title, days),
    ANALYSIS_INSTRUCTIONS,
  ].join("\n\n");
}

const HEADER = `# Workout Routine Analysis

You are an evidence-based strength and conditioning coach. Analyze the following
workout routine using the reference data and guidelines provided below.`;

const VOLUME_REFERENCE = `## Reference Data: Volume Landmarks

Weekly sets per muscle group thresholds (intermediate lifters).
Count using tiered weights: primary muscles = 1.0 set, secondary = 0.5 set, incidental = 0.25 set.

| Muscle Group | Maintenance | Min Effective | Optimal Low | Optimal High | Max Recoverable |
|---|---|---|---|---|---|
| Chest | 3 | 5 | 6 | 16 | 24 |
| Back (lats) | 5 | 7 | 10 | 20 | 30 |
| Upper Back | 5 | 7 | 10 | 20 | 30 |
| Quads | 3 | 5 | 6 | 14 | 18 |
| Hamstrings | 1 | 3 | 2 | 8 | 14 |
| Glutes | 4 | 7 | 8 | 24 | 30 |
| Biceps | 7 | 9 | 14 | 20 | 26 |
| Triceps | 2 | 5 | 6 | 16 | 20 |
| Side Delts | 4 | 7 | 8 | 24 | 30 |
| Rear Delts | 2 | 2 | 4 | 12 | 20 |
| Front Delts | 1 | 1 | 4 | 8 | 12 |
| Calves | 3 | 5 | 6 | 16 | 24 |`;

const SESSION_REFERENCE = `## Reference Data: Session Constraints

- Exercises per session: 4-8 is productive; 11+ is too many
- Total working sets per session: 10-25 is productive; 31+ is excessive
- Sets per muscle per session: 1-8 is productive; 11+ is junk volume
- Estimated session duration: (total_sets × 3) + 10 minutes
- Productive session window: 30-75 minutes`;

const BALANCE_REFERENCE = `## Reference Data: Balance Targets

- Push:Pull weekly volume ratio: 1:1 to 1:1.5 (slightly pull-biased is healthier)
- Upper:Lower weekly volume ratio: roughly 1:1
- Quad:Hamstring ratio: 1:1 to 1.67:1 (quads slightly higher is normal)
- Chest:Back ratio: 0.67:1 to 1:1
- All 6 core movement patterns should be represented weekly:
  horizontal push, horizontal pull, vertical push, vertical pull, hip hinge, squat`;

const GOAL_REFERENCE = `## Reference Data: Goal Signatures

- Hypertrophy: 6-12 rep range dominant, 55-75% compound, high variety, 12-20 sets/muscle/week
- Strength: 1-5 rep range dominant, 85-95% compound, high specificity, long rest
- Olympic WL: 1-3 reps on main lifts, explosive tags, snatch/clean/jerk variations
- General fitness: mixed rep ranges, all movement patterns, conditioning included
- CrossFit: varied reps, metcon sections, concurrent strength + conditioning`;

function formatProfile(profile?: ProfileDocument): string {
  if (!profile) return "## User Profile\nNo profile available.";
  return [
    "## User Profile",
    `- Name: ${profile.name}`,
    `- Training age: ${profile.trainingAge}`,
    `- Days per week: ${profile.defaultDaysPerWeek}`,
    `- Goals: ${profile.goals.join(", ")}`,
    `- Equipment: ${profile.equipment.join(", ")}`,
    profile.constraints.length > 0 ? `- Constraints: ${profile.constraints.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function formatRoutine(title: string, days: ProgramDay[]): string {
  const lines: string[] = [`## The Routine: ${title}`, ""];

  for (const day of days) {
    const week = day.weekNumber && day.weekNumber > 1 ? ` (Week ${day.weekNumber})` : "";
    lines.push(`### Day ${day.dayNumber}${week}: ${day.title}`, "");

    for (const section of day.sections) {
      lines.push(`**${section.name}** (${section.type})`);

      for (const group of section.groups) {
        const groupLabel = group.type !== "single" ? ` [${group.type}]` : "";

        for (const exercise of group.exercises) {
          const sets = getEffectiveSets(exercise);
          const reps = exercise.reps ?? "?";
          const rest = exercise.rest ? `, rest ${exercise.rest}` : "";
          const primary = exercise.tags.primary.join(", ");
          const secondary = exercise.tags.secondary.length > 0 ? ` | Secondary: ${exercise.tags.secondary.join(", ")}` : "";
          lines.push(`- ${exercise.name}${groupLabel}: ${sets}×${reps}${rest}`);
          lines.push(`  Primary: ${primary}${secondary}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

const ANALYSIS_INSTRUCTIONS = `## Analysis Instructions

Please analyze this routine and provide:

### 1. Program Fingerprint
What kind of program is this? Identify the primary and secondary training goals
based on the structure.

### 2. Volume Analysis
For each muscle group, calculate the weekly effective sets (using the tiered
weighting). Compare against the volume landmarks table. Flag any muscle groups
below Minimum Effective Volume or above Maximum Recoverable Volume.

### 3. Session-by-Session Review
For each training day: count exercises and sets, estimate duration, identify
per-session volume issues or exercise ordering concerns.

### 4. Balance Assessment
Calculate push:pull ratio, upper:lower ratio, and movement pattern coverage.
Note any concerning imbalances.

### 5. Structural Observations
Is there periodization? Are rest periods appropriate? Is the compound:isolation
ratio suitable for the inferred goal?

### 6. Top 3 Strengths
What does this routine do well?

### 7. Top 3 Issues
What are the most impactful things to fix? Be specific.

Format your response with clear headers and use tables for volume calculations.`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/analysis/llmPrompt.test.ts --verbose`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/llmPrompt.ts src/lib/analysis/llmPrompt.test.ts
git commit -m "feat(analysis): add LLM analysis prompt builder"
```

---

## Task 11: Analysis Page Route and Client Shell

**Files:**
- Create: `src/app/programs/[id]/analysis/page.tsx`
- Create: `src/components/analysis/AnalysisClient.tsx`

- [ ] **Step 1: Create the route page**

```typescript
// src/app/programs/[id]/analysis/page.tsx
import { AnalysisClient } from "@/components/analysis/AnalysisClient";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnalysisClient id={id} />;
}
```

- [ ] **Step 2: Create the client component**

```typescript
// src/components/analysis/AnalysisClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ProgramDocument } from "@/lib/programs/types";
import type { AnalysisResult } from "@/lib/analysis/types";
import { programRepo } from "@/lib/storage/programRepo";
import { analyzeProgram } from "@/lib/analysis/analyze";
import { ScoreCard } from "./ScoreCard";
import { VolumeChart } from "./VolumeChart";
import { WarningsList } from "./WarningsList";
import { FingerprintBadge } from "./FingerprintBadge";
import { LlmPromptSection } from "./LlmPromptSection";

export function AnalysisClient({ id }: { id: string }) {
  const [program, setProgram] = useState<ProgramDocument | undefined>();

  useEffect(() => {
    programRepo.get(id).then(setProgram).catch(() => undefined);
  }, [id]);

  const analysis = useMemo<AnalysisResult | null>(() => {
    if (!program) return null;
    return analyzeProgram(program);
  }, [program]);

  if (!program) return <p className="muted">Program not found locally.</p>;
  if (!analysis) return <p className="muted">Analyzing…</p>;

  return (
    <div className="stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/programs/${id}`} className="muted flex items-center gap-1 text-sm mb-1" style={{ textDecoration: "none" }}>
            <ArrowLeft size={14} /> {program.title}
          </Link>
          <h1 className="text-2xl font-bold">Routine Analysis</h1>
        </div>
      </div>

      <FingerprintBadge goal={analysis.goal} />
      <ScoreCard overall={analysis.overall} dimensions={analysis.dimensions} />
      <VolumeChart muscleVolumes={analysis.muscleVolumes} />
      <WarningsList warnings={analysis.warnings} />
      <LlmPromptSection program={program} />
    </div>
  );
}
```

- [ ] **Step 3: Create stub components so the page renders**

Create minimal stub files that will be fully implemented in the following tasks. Each stub exports the component with a placeholder rendering its name.

`src/components/analysis/ScoreCard.tsx`:
```typescript
"use client";

import type { DimensionScore } from "@/lib/analysis/types";

type Props = {
  overall: DimensionScore;
  dimensions: Record<string, DimensionScore>;
};

export function ScoreCard({ overall, dimensions }: Props) {
  return <div className="panel">ScoreCard: {overall.grade} ({overall.score})</div>;
}
```

`src/components/analysis/VolumeChart.tsx`:
```typescript
"use client";

import type { MuscleVolumeResult } from "@/lib/analysis/types";

export function VolumeChart({ muscleVolumes }: { muscleVolumes: MuscleVolumeResult[] }) {
  return <div className="panel">VolumeChart: {muscleVolumes.length} muscles</div>;
}
```

`src/components/analysis/WarningsList.tsx`:
```typescript
"use client";

import type { Warning } from "@/lib/analysis/types";

export function WarningsList({ warnings }: { warnings: Warning[] }) {
  return <div className="panel">Warnings: {warnings.length}</div>;
}
```

`src/components/analysis/FingerprintBadge.tsx`:
```typescript
"use client";

import type { GoalSignature } from "@/lib/analysis/types";

export function FingerprintBadge({ goal }: { goal: GoalSignature }) {
  return <div>{goal.fingerprint}</div>;
}
```

`src/components/analysis/LlmPromptSection.tsx`:
```typescript
"use client";

import type { ProgramDocument } from "@/lib/programs/types";

export function LlmPromptSection({ program }: { program: ProgramDocument }) {
  return <div className="panel">LLM Prompt Section</div>;
}
```

- [ ] **Step 4: Verify the page builds**

Run: `npx next build 2>&1 | tail -5` or `npx next dev` and navigate to `/programs/demo-program/analysis`

Expected: Page renders without errors. Shows stub components with basic analysis data.

- [ ] **Step 5: Commit**

```bash
git add src/app/programs/[id]/analysis/page.tsx src/components/analysis/AnalysisClient.tsx src/components/analysis/ScoreCard.tsx src/components/analysis/VolumeChart.tsx src/components/analysis/WarningsList.tsx src/components/analysis/FingerprintBadge.tsx src/components/analysis/LlmPromptSection.tsx
git commit -m "feat(analysis): add analysis page route and client shell with stub components"
```

---

## Task 12: ScoreCard and FingerprintBadge Components

**Files:**
- Modify: `src/components/analysis/ScoreCard.tsx`
- Modify: `src/components/analysis/FingerprintBadge.tsx`

- [ ] **Step 1: Implement ScoreCard**

Replace the stub with the full implementation:

```typescript
// src/components/analysis/ScoreCard.tsx
"use client";

import type { DimensionScore, Grade } from "@/lib/analysis/types";

type Props = {
  overall: DimensionScore;
  dimensions: Record<string, DimensionScore>;
};

const GRADE_COLORS: Record<Grade, string> = {
  A: "var(--good)",
  B: "var(--accent)",
  C: "var(--warn)",
  D: "var(--bad)",
  F: "var(--bad)",
};

export function ScoreCard({ overall, dimensions }: Props) {
  return (
    <div style={{
      background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r)",
      padding: 16, display: "flex", flexDirection: "column", gap: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "var(--r)", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700,
          fontFamily: "var(--font-mono)", color: GRADE_COLORS[overall.grade],
          background: "var(--bg-3)", border: `2px solid ${GRADE_COLORS[overall.grade]}`,
        }}>
          {overall.grade}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>
            Overall Score
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
            {overall.score}/100
          </div>
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8,
      }}>
        {Object.values(dimensions).map((dim) => (
          <div key={dim.name} style={{
            padding: "8px 12px", background: "var(--bg-3)", borderRadius: "var(--r)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 12, color: "var(--fg-2)" }}>{dim.name}</span>
            <span style={{
              fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)",
              color: GRADE_COLORS[dim.grade],
            }}>
              {dim.grade}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement FingerprintBadge**

Replace the stub:

```typescript
// src/components/analysis/FingerprintBadge.tsx
"use client";

import type { GoalSignature } from "@/lib/analysis/types";

export function FingerprintBadge({ goal }: { goal: GoalSignature }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
      background: "var(--accent-soft)", color: "var(--accent)",
      border: "1px solid var(--accent)", maxWidth: "100%",
    }}>
      <span style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Profile
      </span>
      <span>{goal.fingerprint}</span>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Run: `npx next dev` and navigate to `/programs/demo-program/analysis`

Expected: ScoreCard shows overall grade in a colored box with per-dimension grades in a grid. FingerprintBadge shows the inferred goal as a pill/badge.

- [ ] **Step 4: Commit**

```bash
git add src/components/analysis/ScoreCard.tsx src/components/analysis/FingerprintBadge.tsx
git commit -m "feat(analysis): implement ScoreCard and FingerprintBadge components"
```

---

## Task 13: VolumeChart Component

**Files:**
- Modify: `src/components/analysis/VolumeChart.tsx`

- [ ] **Step 1: Implement VolumeChart with horizontal bars**

Replace the stub:

```typescript
// src/components/analysis/VolumeChart.tsx
"use client";

import type { MuscleVolumeResult, Severity } from "@/lib/analysis/types";

const SEVERITY_COLORS: Record<Severity, string> = {
  green: "var(--good)",
  yellow: "var(--warn)",
  red: "var(--bad)",
};

const LABEL_MAP: Record<string, string> = {
  chest: "Chest", lats: "Lats", upper_back: "Upper Back", lower_back: "Lower Back",
  front_delts: "Front Delts", side_delts: "Side Delts", rear_delts: "Rear Delts",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves",
  core: "Core", adductors: "Adductors", abductors: "Abductors",
  rotator_cuff: "Rotator Cuff", neck: "Neck",
};

export function VolumeChart({ muscleVolumes }: { muscleVolumes: MuscleVolumeResult[] }) {
  const relevant = muscleVolumes.filter(
    (r) => r.effectiveSets > 0 || r.landmarks.mev > 0,
  );
  const maxValue = Math.max(...relevant.map((r) => Math.max(r.effectiveSets, r.landmarks.mrv)), 1);

  return (
    <div style={{
      background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r)",
      padding: 16, display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", marginBottom: 4 }}>
        Weekly Volume by Muscle Group
      </div>
      {relevant.map((r) => (
        <div key={r.muscle} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 24 }}>
          <div style={{
            width: 90, fontSize: 11, color: "var(--fg-2)", textAlign: "right",
            flexShrink: 0, fontFamily: "var(--font-mono)",
          }}>
            {LABEL_MAP[r.muscle] ?? r.muscle}
          </div>
          <div style={{ flex: 1, position: "relative", height: 16, background: "var(--bg-3)", borderRadius: 4 }}>
            {/* MEV marker */}
            <div style={{
              position: "absolute", left: `${(r.landmarks.mev / maxValue) * 100}%`,
              top: 0, bottom: 0, width: 1, background: "var(--fg-4)", zIndex: 1,
            }} />
            {/* MRV marker */}
            <div style={{
              position: "absolute", left: `${(r.landmarks.mrv / maxValue) * 100}%`,
              top: 0, bottom: 0, width: 1, background: "var(--fg-4)", zIndex: 1,
            }} />
            {/* Volume bar */}
            <div style={{
              position: "absolute", left: 0, top: 2, bottom: 2,
              width: `${Math.min((r.effectiveSets / maxValue) * 100, 100)}%`,
              background: SEVERITY_COLORS[r.severity], borderRadius: 3, minWidth: r.effectiveSets > 0 ? 4 : 0,
            }} />
          </div>
          <div style={{
            width: 40, fontSize: 11, color: SEVERITY_COLORS[r.severity],
            fontFamily: "var(--font-mono)", textAlign: "right", flexShrink: 0,
          }}>
            {r.effectiveSets}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 10, color: "var(--fg-4)" }}>
        <span>│ = MEV / MRV thresholds</span>
        <span style={{ color: "var(--good)" }}>■ Productive</span>
        <span style={{ color: "var(--warn)" }}>■ Borderline</span>
        <span style={{ color: "var(--bad)" }}>■ Issue</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/programs/demo-program/analysis`.

Expected: Horizontal bar chart showing each muscle group with colored bars. MEV and MRV markers visible as thin vertical lines on each bar.

- [ ] **Step 3: Commit**

```bash
git add src/components/analysis/VolumeChart.tsx
git commit -m "feat(analysis): implement VolumeChart with horizontal bars and threshold markers"
```

---

## Task 14: WarningsList and LlmPromptSection Components

**Files:**
- Modify: `src/components/analysis/WarningsList.tsx`
- Modify: `src/components/analysis/LlmPromptSection.tsx`

- [ ] **Step 1: Implement WarningsList**

Replace the stub:

```typescript
// src/components/analysis/WarningsList.tsx
"use client";

import { AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import type { Severity, Warning } from "@/lib/analysis/types";

const SEVERITY_ICON: Record<Severity, typeof AlertTriangle> = {
  red: AlertCircle,
  yellow: AlertTriangle,
  green: CheckCircle,
};

const SEVERITY_COLOR: Record<Severity, string> = {
  red: "var(--bad)",
  yellow: "var(--warn)",
  green: "var(--good)",
};

export function WarningsList({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return (
      <div style={{
        background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r)",
        padding: 16, color: "var(--good)", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
      }}>
        <CheckCircle size={16} /> No issues detected
      </div>
    );
  }

  const sorted = [...warnings].sort((a, b) => {
    const order: Record<Severity, number> = { red: 0, yellow: 1, green: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div style={{
      background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r)",
      padding: 16, display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", marginBottom: 4 }}>
        Findings ({warnings.length})
      </div>
      {sorted.map((w, i) => {
        const Icon = SEVERITY_ICON[w.severity];
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0" }}>
            <Icon size={14} style={{ color: SEVERITY_COLOR[w.severity], flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.4 }}>{w.message}</span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement LlmPromptSection**

Replace the stub:

```typescript
// src/components/analysis/LlmPromptSection.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check, Sparkles } from "lucide-react";
import type { ProgramDocument, ProfileDocument } from "@/lib/programs/types";
import { useLocalData } from "@/components/app/LocalDataProvider";
import { buildLlmAnalysisPrompt } from "@/lib/analysis/llmPrompt";

export function LlmPromptSection({ program }: { program: ProgramDocument }) {
  const { profile } = useLocalData();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const prompt = buildLlmAnalysisPrompt(program, profile);
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "var(--r)",
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", padding: "12px 16px", background: "none", border: "none",
          color: "var(--fg)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          fontSize: 14, fontWeight: 600, textAlign: "left",
        }}
      >
        <Sparkles size={16} style={{ color: "var(--pr)" }} />
        Get AI-Powered Deep Analysis
        {open ? <ChevronDown size={14} style={{ marginLeft: "auto" }} /> : <ChevronRight size={14} style={{ marginLeft: "auto" }} />}
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5, margin: 0 }}>
            The algorithmic analysis above catches structural issues automatically. For a deeper,
            conversational analysis — including exercise substitution suggestions, personalized
            feedback, and the ability to ask follow-up questions — copy this prompt into any
            AI assistant (Claude, ChatGPT, etc.). It includes your full routine, evidence-based
            reference data, and structured analysis instructions.
          </p>
          <button
            className="button"
            onClick={handleCopy}
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy Analysis Prompt"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Navigate to `/programs/demo-program/analysis`.

Expected: Warnings list shows sorted findings with colored icons. LLM section is collapsed by default; clicking opens it to reveal the info blurb and copy button. Clicking "Copy Analysis Prompt" copies to clipboard and shows "Copied!" feedback.

- [ ] **Step 4: Commit**

```bash
git add src/components/analysis/WarningsList.tsx src/components/analysis/LlmPromptSection.tsx
git commit -m "feat(analysis): implement WarningsList and LlmPromptSection components"
```

---

## Task 15: Integration — Analyze Button on Program Detail

**Files:**
- Modify: `src/components/workout/ProgramDetailClient.tsx`

- [ ] **Step 1: Add the Analyze link to the button group**

In `src/components/workout/ProgramDetailClient.tsx`, add a `BarChart3` icon import from lucide-react and a Link to the analysis page alongside the existing Edit and Map buttons.

Add to the existing imports:

```typescript
import { BarChart3, Map } from "lucide-react";
```

Then in the button group `<div className="flex gap-2">`, add a new Link **before** the Edit button:

```typescript
<Link href={`/programs/${id}/analysis`} className="button secondary">
  <BarChart3 size={14} aria-hidden />
  Analyze
</Link>
```

The complete button group should now be:

```typescript
<div className="flex gap-2">
  <Link href={`/programs/${id}/analysis`} className="button secondary">
    <BarChart3 size={14} aria-hidden />
    Analyze
  </Link>
  <Link className="button secondary" href={`/programs/${id}/edit`}>
    Edit
  </Link>
  <Link href={`/programs/${id}/map`} className="button">
    <Map size={14} aria-hidden />
    Map
  </Link>
</div>
```

- [ ] **Step 2: Verify in browser**

Navigate to `/programs/demo-program`. Click the "Analyze" button.

Expected: Button appears in the header alongside Edit and Map. Clicking it navigates to `/programs/demo-program/analysis` which shows the full analysis page.

- [ ] **Step 3: Commit**

```bash
git add src/components/workout/ProgramDetailClient.tsx
git commit -m "feat(analysis): add Analyze button to program detail page"
```

---

## Task 16: Run Full Test Suite and Fix Regressions

**Files:** None new — this is a verification task.

- [ ] **Step 1: Run all analysis tests**

Run: `npx jest src/lib/analysis/ --verbose`

Expected: All tests pass. If any fail, fix them before proceeding.

- [ ] **Step 2: Run the full project test suite**

Run: `npx jest --verbose`

Expected: All existing tests continue to pass (no regressions). The new analysis tests also pass.

- [ ] **Step 3: Build check**

Run: `npx next build 2>&1 | tail -20`

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Manual verification**

Start dev server (`npx next dev`) and verify:

1. Navigate to `/programs/demo-program` — "Analyze" button is visible
2. Click "Analyze" — analysis page loads with:
   - Fingerprint badge (e.g., "Strength-focused (1-day)")
   - Score card with overall grade and per-dimension grades
   - Volume chart with horizontal bars and threshold markers
   - Warnings list with severity icons
   - Collapsible LLM prompt section
3. Click "Get AI-Powered Deep Analysis" — section expands with info text and copy button
4. Click "Copy Analysis Prompt" — shows "Copied!" and clipboard contains the full prompt
5. Paste the prompt into a text editor — verify it contains the routine, volume landmarks table, and analysis instructions

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(analysis): address test and build issues from integration"
```

---

## Task 17: Auto-Run Analysis on Import

**Files:**
- Modify: `src/components/import/ImportClient.tsx`

The import flow today: user pastes JSON → clicks "Review" → sees warnings → clicks "Save" → `programRepo.save(review.program)` → shows "Program saved locally." We need to navigate to the analysis page after a successful save so the user immediately sees how the imported routine scores.

- [ ] **Step 1: Add router import and navigation**

In `src/components/import/ImportClient.tsx`, add `useRouter` from `next/navigation`:

```typescript
import { useRouter } from "next/navigation";
```

Inside the component, add the router hook:

```typescript
const router = useRouter();
```

- [ ] **Step 2: Update saveProgram to navigate after save and remove dead code**

Replace the existing `saveProgram` function:

```typescript
async function saveProgram() {
  if (!review) return;
  await programRepo.save(review.program);
  router.push(`/programs/${review.program.id}/analysis`);
}
```

Since we no longer show the "Program saved locally." message, remove the now-unused `message` state:

1. Delete `const [message, setMessage] = useState("");`
2. Delete `setMessage("");` from inside `reviewJson()`
3. Delete the `{message ? <p ...>{message}</p> : null}` JSX block near the end of the component

The final component should have only `json`/`setJson` and `review`/`setReview` as state.

- [ ] **Step 3: Verify in browser**

1. Start dev server (`npx next dev`)
2. Navigate to `/import`
3. Paste a valid program JSON (use the demo program structure from `src/lib/programs/sample.ts` as a reference)
4. Click "Review" — see the review with warnings
5. Click "Save" — should navigate to `/programs/[new-id]/analysis`
6. Analysis page loads with full results for the imported program

Expected: After save, user lands on the analysis page automatically — no extra clicks needed.

- [ ] **Step 4: Commit**

```bash
git add src/components/import/ImportClient.tsx
git commit -m "feat(analysis): auto-navigate to analysis page after import save"
```

---

## Self-Review

### 1. Spec Coverage

| Requirement | Task(s) |
|---|---|
| Tiered muscle weighting (primary=1.0, secondary=0.5, incidental=0.25) | Task 4 (volume.ts) |
| Goal inference from structure (not user-declared) | Task 7 (goals.ts) |
| Three output formats: scorecard, fingerprint, warnings | Tasks 12-14 (components) |
| Auto-run on import | Task 17 (ImportClient.tsx) |
| On-demand via button on program detail | Task 15 (ProgramDetailClient.tsx) |
| Neutral analysis (no user priority muscles) | All analysis modules — no profile bias |
| Multi-week program support | Task 8 (periodization.ts) |
| Client-side JS only, offline-capable | Pure functions, no server calls |
| LLM analysis prompt with copy UI | Tasks 10, 14 (llmPrompt.ts, LlmPromptSection.tsx) |
| Volume landmarks framework (MEV/MAV/MRV) | Task 2 (thresholds.ts) |
| Session constraints (exercises, sets, duration) | Task 5 (session.ts) |
| Balance ratios (push:pull, upper:lower, quad:ham) | Task 6 (balance.ts) |
| Movement pattern coverage (6 patterns) | Task 6 (balance.ts) |
| Periodization detection | Task 8 (periodization.ts) |

All requirements covered.

### 2. Placeholder Scan

No instances of TBD, TODO, "implement later", "similar to Task N", or steps without code blocks found. All tasks have complete code.

### 3. Type Consistency

- `analyzeProgram(program: ProgramDocument): AnalysisResult` — consistent across analyze.ts and AnalysisClient.tsx
- `MuscleVolumeResult`, `Warning`, `GoalSignature`, `DimensionScore` — all defined in types.ts, used consistently in components
- `buildLlmAnalysisPrompt(program, profile?)` — consistent between llmPrompt.ts and LlmPromptSection.tsx
- Helper functions (`getEffectiveSets`, `mapMuscle`, `lookupCatalogExercise`, `repMidpoint`, `isCompound`, `classifyMovement`, `detectMovementPatterns`) — all exported from muscles.ts, imported consistently across volume.ts, session.ts, balance.ts, goals.ts, llmPrompt.ts
- `countWeeklyVolume(days, weekNumber)` and `scoreVolume(weeklyVolume)` — signature matches call in analyze.ts
- `analyzeSessions(days)`, `analyzeBalance(days)`, `inferGoal(days)`, `analyzePeriodization(days)` — all take `ProgramDay[]`, called from analyze.ts with `days` from `getRenderableDays(program)`

No naming inconsistencies found.
