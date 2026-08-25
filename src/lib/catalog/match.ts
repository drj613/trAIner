import { exerciseCatalog, type ExerciseCatalogItem } from "./exercises";
import { similarity } from "./normalize";
import {
  prepareImportName,
  resolveExerciseIdentity,
  type ExerciseIdentityContext,
  type IdentityAlias,
  type NormalizationOverrideDocument,
} from "./identity";
import {
  disambiguationsByNormalizedName,
  legacyExerciseIdRedirects,
  modifiersById,
  movementsById,
} from "./registries";
import type { AliasDocument, ExerciseSuggestion, UserExerciseDocument } from "@/lib/programs/types";

export type MatchVia = "canonical" | "alias" | "normalized" | "user-alias" | "user-exercise";

export type MatchResult =
  | { kind: "matched"; item: ExerciseCatalogItem; via: MatchVia }
  | {
      kind: "underspecified";
      movementId: string;
      candidates: ExerciseSuggestion[];
      matchedModifierIds: string[];
      nonIdentityAnnotations: string[];
    }
  | { kind: "unmatched"; suggestions: ExerciseSuggestion[]; nonIdentityAnnotations: string[] };

export type MatchExerciseContext = Pick<
  ExerciseIdentityContext,
  "catalogById" | "movementsById" | "modifiersById" | "redirects" | "disambiguations"
> & {
  normalizationOverrides?: readonly NormalizationOverrideDocument[];
};

const defaultMatchContext: MatchExerciseContext = {
  catalogById: new Map(exerciseCatalog.map((item) => [item.id, item])),
  movementsById,
  modifiersById,
  redirects: legacyExerciseIdRedirects,
  disambiguations: disambiguationsByNormalizedName,
};

function userExToItem(ex: UserExerciseDocument): ExerciseCatalogItem {
  return {
    id: ex.id,
    name: ex.name,
    aliases: [],
    equipment: [],
    movementPatterns: [],
    muscles: { primary: [], secondary: [] },
    tags: [],
    movementModifierIds: [],
  };
}

export function matchExercise(
  name: string,
  userAliases: readonly (AliasDocument | IdentityAlias)[] = [],
  userExercises: readonly UserExerciseDocument[] = [],
  matchContext: MatchExerciseContext = defaultMatchContext,
): MatchResult {
  const context: ExerciseIdentityContext = {
    ...matchContext,
    aliases: userAliases,
    userExercises,
    normalizationOverrides: matchContext.normalizationOverrides ?? [],
  };
  const prepared = prepareImportName(name, context.disambiguations);
  const directIdentity = resolveExerciseIdentity(
    { kind: "catalog-reference", canonicalExerciseId: name },
    context,
  );
  const identity = directIdentity.concreteExerciseId
    ? directIdentity
    : resolveExerciseIdentity({ kind: "import-name", name }, context);

  if (identity.specificity === "underspecified" && identity.movementId) {
    const rule = context.disambiguations.get(prepared.normalizedName);
    const candidates = rule?.kind === "underspecified-name"
      ? rule.candidateExerciseIds
        .map((exerciseId) => matchContext.catalogById.get(exerciseId))
        .filter((item): item is ExerciseCatalogItem => item !== undefined)
        .map((item) => ({ exerciseId: item.id, name: item.name, score: similarity(name, item.name) }))
      : [];
    return {
      kind: "underspecified",
      movementId: identity.movementId,
      candidates,
      matchedModifierIds: identity.movementModifierIds,
      nonIdentityAnnotations: prepared.nonIdentityAnnotations,
    };
  }

  if (identity.concreteExerciseId) {
    const catalogItem = matchContext.catalogById.get(identity.concreteExerciseId);
    const customExercise = userExercises.find((exercise) => exercise.id === identity.concreteExerciseId);
    const item = catalogItem ?? (customExercise ? userExToItem(customExercise) : undefined);
    if (item) {
      const via: MatchVia = identity.source === "saved-alias"
        ? "user-alias"
        : identity.source === "catalog-id" || identity.source === "legacy-redirect"
          ? "canonical"
          : customExercise
            ? "user-exercise"
            : prepareImportName(item.name, context.disambiguations).normalizedName === prepared.normalizedName
              ? "normalized"
              : "alias";
      return { kind: "matched", item, via };
    }
  }

  return {
    kind: "unmatched",
    suggestions: [...matchContext.catalogById.values()]
      .map((item) => ({ exerciseId: item.id, name: item.name, score: similarity(name, item.name) }))
      .filter((suggestion) => suggestion.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3),
    nonIdentityAnnotations: prepared.nonIdentityAnnotations,
  };
}
