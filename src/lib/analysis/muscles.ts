import { exerciseCatalog, type ExerciseCatalogItem } from "@/lib/catalog/exercises";
import type { ProgramExercise } from "@/lib/programs/types";
import type { MuscleGroup } from "./types";
import { DEFAULT_SETS } from "./thresholds";

const CATALOG_TO_CANONICAL: Record<string, MuscleGroup> = {
  "chest":                "chest",
  "upper chest":          "chest",
  "pectorals":            "chest",
  "lats":                 "lats",
  "middle back":          "upper_back",
  "mid back":             "upper_back",
  "upper back":           "upper_back",
  "traps":                "upper_back",
  "rhomboids":            "upper_back",
  "lower back":           "lower_back",
  "front delts":          "front_delts",
  "shoulders":            "side_delts",
  "side delts":           "side_delts",
  "rear delts":           "rear_delts",
  "biceps":               "biceps",
  "brachialis":           "biceps",
  "triceps":              "triceps",
  "forearms":             "forearms",
  "quadriceps":           "quads",
  "quads":                "quads",
  "hamstrings":           "hamstrings",
  "glutes":               "glutes",
  "glute medius":         "glutes",
  "hips":                 "glutes",
  "calves":               "calves",
  "soleus":               "calves",
  "abdominals":           "core",
  "abs":                  "core",
  "core":                 "core",
  "obliques":             "core",
  "hip flexors":          "core",
  "adductors":            "adductors",
  "abductors":            "abductors",
  "rotator cuff":         "rotator_cuff",
  "scapular stabilizers": "rotator_cuff",
  "serratus anterior":    "upper_back",
  "neck":                 "neck",
};

const catalogIndex = new Map<string, ExerciseCatalogItem>(
  exerciseCatalog.map((item) => [item.id, item]),
);

export function mapMuscle(label: string): MuscleGroup | undefined {
  return CATALOG_TO_CANONICAL[label.toLowerCase()];
}

const FULL_BODY_MUSCLES: MuscleGroup[] = ["quads", "glutes", "hamstrings", "lats", "upper_back", "core"];

export function mapMuscleFull(label: string): MuscleGroup[] {
  const lower = label.toLowerCase();
  if (lower === "full body") return FULL_BODY_MUSCLES;
  const single = CATALOG_TO_CANONICAL[lower];
  return single ? [single] : [];
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

const PUSH_PATTERNS = new Set(["horizontal press", "push", "shoulder flexion", "overhead"]);
const PULL_PATTERNS = new Set(["horizontal pull", "vertical pull", "pull"]);
const LEG_PATTERNS = new Set(["squat"]);
const HINGE_PATTERNS = new Set(["hinge", "hip hinge", "hip extension"]);

export function classifyMovement(catalogItem: ExerciseCatalogItem | undefined): MovementCategory {
  if (!catalogItem) return "other";
  const patterns = catalogItem.movementPatterns;
  if (patterns.some((p) => PUSH_PATTERNS.has(p))) return "push";
  if (patterns.some((p) => PULL_PATTERNS.has(p))) return "pull";
  if (patterns.some((p) => LEG_PATTERNS.has(p))) return "legs";
  if (patterns.some((p) => HINGE_PATTERNS.has(p))) return "legs";
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

  // H2: Fallback when no catalog item — use primary muscle keywords
  if (!catalogItem) {
    const primary = exercise.tags.primary.map((m) => m.toLowerCase());
    if (primary.some((m) => m.includes("chest") || m.includes("tricep"))) found.push("horizontal_push");
    if (primary.some((m) => m.includes("lat") || m.includes("back") || m.includes("bicep"))) found.push("horizontal_pull");
    if (primary.some((m) => m.includes("delt") || m.includes("shoulder"))) found.push("vertical_push");
    if (primary.some((m) => m.includes("hamstring") || m.includes("glute"))) found.push("hip_hinge");
    if (primary.some((m) => m.includes("quad"))) found.push("squat");
    return [...new Set(found)];
  }

  const patterns = catalogItem.movementPatterns;
  const tags = catalogItem.tags;
  const primaryMuscles = exercise.tags.primary.map((m) => m.toLowerCase());

  if (patterns.includes("horizontal press")) found.push("horizontal_push");
  if (patterns.includes("horizontal pull")) found.push("horizontal_pull");
  if (patterns.includes("vertical pull")) found.push("vertical_pull");
  if (patterns.includes("squat")) found.push("squat");
  if (patterns.some((p) => p === "hinge" || p === "hip extension" || p === "hip hinge")) found.push("hip_hinge");

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
