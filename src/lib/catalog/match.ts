import { exerciseCatalog, type ExerciseCatalogItem } from "./exercises";
import { normalizeExerciseName, similarity } from "./normalize";
import type { AliasDocument, ExerciseSuggestion, UserExerciseDocument } from "@/lib/programs/types";

export type MatchResult =
  | { kind: "matched"; item: ExerciseCatalogItem; via: "canonical" | "alias" | "normalized" | "user-alias" | "user-exercise" }
  | { kind: "unmatched"; suggestions: ExerciseSuggestion[] };

function userExToItem(ex: UserExerciseDocument): ExerciseCatalogItem {
  return {
    id: ex.id,
    name: ex.name,
    aliases: [],
    equipment: [],
    movementPatterns: [],
    muscles: { primary: [], secondary: [] },
    tags: [],
  };
}

export function matchExercise(
  name: string,
  userAliases: AliasDocument[] = [],
  userExercises: UserExerciseDocument[] = [],
): MatchResult {
  const normalized = normalizeExerciseName(name);

  const canonical = exerciseCatalog.find((item) => item.id === normalized);
  if (canonical) return { kind: "matched", item: canonical, via: "canonical" };

  const userAlias = userAliases.find((alias) => alias.normalizedAlias === normalized);
  if (userAlias) {
    const catalogItem = exerciseCatalog.find((exercise) => exercise.id === userAlias.canonicalExerciseId);
    if (catalogItem) return { kind: "matched", item: catalogItem, via: "user-alias" };
    const userItem = userExercises.find((ex) => ex.id === userAlias.canonicalExerciseId);
    if (userItem) return { kind: "matched", item: userExToItem(userItem), via: "user-alias" };
  }

  const exactAlias = exerciseCatalog.find((item) =>
    item.aliases.some((alias) => normalizeExerciseName(alias) === normalized),
  );
  if (exactAlias) return { kind: "matched", item: exactAlias, via: "alias" };

  const normalizedName = exerciseCatalog.find((item) => normalizeExerciseName(item.name) === normalized);
  if (normalizedName) return { kind: "matched", item: normalizedName, via: "normalized" };

  const userExMatch = userExercises.find((ex) => normalizeExerciseName(ex.name) === normalized);
  if (userExMatch) return { kind: "matched", item: userExToItem(userExMatch), via: "user-exercise" };

  return {
    kind: "unmatched",
    suggestions: exerciseCatalog
      .map((item) => ({ exerciseId: item.id, name: item.name, score: similarity(name, item.name) }))
      .filter((suggestion) => suggestion.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
  };
}
