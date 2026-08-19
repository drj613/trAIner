import type { ExerciseCatalogItem } from "./exercises";
import {
  resolveExerciseIdentity,
  type ExerciseIdentityContext,
  type ExerciseIdentityResolver,
} from "./identity";
import {
  disambiguationsByNormalizedName,
  legacyExerciseIdRedirects,
  modifiersById,
  movementsById,
} from "./registries";
import type { SelectableExercise } from "./groupCatalog";
import type { UserExerciseDocument } from "@/lib/programs/types";

/**
 * A hand-built catalogue rather than the shipped one. Ordering claims have to
 * be provable, and the shipped catalogue's 3,175 entries make "did the sort run
 * at all?" indistinguishable from "did it run correctly?". Every id, name and
 * modifier list below is copied verbatim from `exercises.generated.json`, so
 * the fixture stays honest about real data while staying small enough to reason
 * about.
 */
function catalogItem(
  id: string,
  name: string,
  movementId: string | undefined,
  movementModifierIds: string[],
  primaryMuscle: string,
  equipment: string[] = [],
  aliases: string[] = [],
): ExerciseCatalogItem {
  return {
    id,
    name,
    aliases,
    equipment,
    movementPatterns: [],
    muscles: { primary: [primaryMuscle], secondary: [] },
    tags: [],
    movementId,
    movementModifierIds,
  };
}

export const squatCatalogItems: ExerciseCatalogItem[] = [
  catalogItem("barbell-squat", "Barbell Squat", "squat", ["barbell", "back-rack"], "quads", ["barbell"]),
  catalogItem(
    "barbell-high-bar-squat",
    "High Bar Back Squat",
    "squat",
    ["barbell", "back-rack", "high-bar"],
    "quads",
    ["barbell"],
    ["high bar squat"],
  ),
  catalogItem(
    "barbell-low-bar-squat",
    "Low Bar Back Squat",
    "squat",
    ["barbell", "back-rack", "low-bar"],
    "glutes",
    ["barbell"],
  ),
  catalogItem("squat--kettlebell", "Kettlebell Squat", "squat", ["kettlebell"], "glutes", ["kettlebell"]),
  catalogItem("barbell-bench-press", "Barbell Bench Press", "bench-press", ["barbell"], "chest", ["barbell"]),
  // Its family is "Pull-up and Pulldown" but its own name, aliases and muscle
  // contain no "pull-up", so a query for the family name can only reach it
  // through the family row.
  catalogItem("cable-pulldown", "cable pulldown", "pull-up-pulldown", ["cable"], "lats", ["cable"]),
  // The known catalogue defect, carried to final review: `movementId: null`,
  // no modifiers, named almost identically to the generic `barbell-squat`. It
  // must stand alone, not pretend to be a child of the Squat family.
  catalogItem("barbell-back-squat", "Barbell Back Squat", undefined, [], "quads", ["barbell"]),
  catalogItem("ab-wheel-rollout", "Ab Wheel Rollout", undefined, [], "abdominals", ["wheel"]),
];

export const squatUserExercise: UserExerciseDocument = {
  id: "user-zercher",
  name: "Zercher hold squat",
  createdAt: "2026-08-01T00:00:00.000Z",
};

export function makeIdentityContext(
  overrides: Partial<ExerciseIdentityContext> = {},
): ExerciseIdentityContext {
  return {
    catalogById: new Map(squatCatalogItems.map((item) => [item.id, item])),
    movementsById,
    modifiersById,
    redirects: legacyExerciseIdRedirects,
    disambiguations: disambiguationsByNormalizedName,
    aliases: [],
    userExercises: [squatUserExercise],
    normalizationOverrides: [],
    ...overrides,
  };
}

export type SquatCatalogFixture = {
  squatItems: SelectableExercise[];
  resolve: ExerciseIdentityResolver;
  context: ExerciseIdentityContext;
};

/**
 * Items are handed over in an order that is neither the expected output order
 * nor alphabetical, so a grouping that forwarded its input untouched — or that
 * sorted by name instead of by canonical modifier order — could not pass.
 */
export function makeSquatCatalogFixture(
  contextOverrides: Partial<ExerciseIdentityContext> = {},
): SquatCatalogFixture {
  const context = makeIdentityContext(contextOverrides);
  const resolve: ExerciseIdentityResolver = (input) => resolveExerciseIdentity(input, context);

  const byId = new Map(squatCatalogItems.map((item) => [item.id, item]));
  const bundled = (id: string): SelectableExercise => {
    const catalogItemForId = byId.get(id);
    if (!catalogItemForId) throw new Error(`fixture has no catalogue item ${id}`);
    return { id, name: catalogItemForId.name, source: "bundled", catalogItem: catalogItemForId };
  };

  const squatItems: SelectableExercise[] = [
    bundled("squat--kettlebell"),
    bundled("ab-wheel-rollout"),
    bundled("barbell-low-bar-squat"),
    bundled("barbell-bench-press"),
    bundled("cable-pulldown"),
    { id: squatUserExercise.id, name: squatUserExercise.name, source: "user", userExercise: squatUserExercise },
    bundled("barbell-high-bar-squat"),
    bundled("barbell-back-squat"),
    bundled("barbell-squat"),
  ];

  return { squatItems, resolve, context };
}
