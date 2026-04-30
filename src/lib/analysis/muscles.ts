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
