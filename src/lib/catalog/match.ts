import { exerciseCatalog, type ExerciseCatalogItem } from "./exercises";
import { normalizeExerciseName, similarity } from "./normalize";
import type { AliasDocument, ExerciseSuggestion } from "@/lib/programs/types";

export type MatchResult =
  | { kind: "matched"; item: ExerciseCatalogItem; via: "canonical" | "alias" | "normalized" | "user-alias" }
  | { kind: "unmatched"; suggestions: ExerciseSuggestion[] };

export function matchExercise(name: string, userAliases: AliasDocument[] = []): MatchResult {
  const normalized = normalizeExerciseName(name);

  const canonical = exerciseCatalog.find((item) => item.id === normalized);
  if (canonical) return { kind: "matched", item: canonical, via: "canonical" };

  const userAlias = userAliases.find((alias) => alias.normalizedAlias === normalized);
  if (userAlias) {
    const item = exerciseCatalog.find((exercise) => exercise.id === userAlias.canonicalExerciseId);
    if (item) return { kind: "matched", item, via: "user-alias" };
  }

  const exactAlias = exerciseCatalog.find((item) => item.aliases.some((alias) => normalizeExerciseName(alias) === normalized));
  if (exactAlias) return { kind: "matched", item: exactAlias, via: "alias" };

  const normalizedName = exerciseCatalog.find((item) => normalizeExerciseName(item.name) === normalized);
  if (normalizedName) return { kind: "matched", item: normalizedName, via: "normalized" };

  return {
    kind: "unmatched",
    suggestions: exerciseCatalog
      .map((item) => ({ exerciseId: item.id, name: item.name, score: similarity(name, item.name) }))
      .filter((suggestion) => suggestion.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  };
}
