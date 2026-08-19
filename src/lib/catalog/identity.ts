import { normalizeExerciseName } from "./normalize";
import type { ExerciseCatalogItem } from "./exercises";
import type {
  DisambiguationRule,
  MovementDefinition,
  MovementModifierDefinition,
} from "./registries";
import type { AliasDocument, UserExerciseDocument } from "@/lib/programs/types";

export type ExerciseIdentityInput =
  | { kind: "catalog-reference"; canonicalExerciseId: string }
  | { kind: "stored-exercise"; canonicalExerciseId?: string; slotId: string; performedName?: string }
  | { kind: "custom-exercise"; exerciseId: string; name: string }
  | { kind: "import-name"; name: string };

export type ExerciseIdentityResult = {
  groupKey: string;
  concreteExerciseId?: string;
  movementId?: string;
  movementName?: string;
  movementModifierIds: string[];
  movementModifierNames: string[];
  displayLabel: string;
  performedName?: string;
  currentVersionLabel?: string;
  source: "catalog-id" | "legacy-redirect" | "user-override" | "saved-alias" | "legacy-name" | "standalone";
  specificity: "exact" | "underspecified" | "unmatched" | "overridden";
};

export type NormalizationOverrideDocument = {
  id: string;
  targetKind: "exercise-id" | "normalized-name";
  targetValue: string;
  movementId: string | null;
  movementModifierIds: string[];
  updatedAt: string;
};

export type IdentityAlias = AliasDocument & { provenance?: "legacy-auto" | "remembered" };

export type ExerciseIdentityContext = {
  catalogById: ReadonlyMap<string, ExerciseCatalogItem>;
  movementsById: ReadonlyMap<string, MovementDefinition>;
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>;
  redirects: ReadonlyMap<string, string>;
  disambiguations: ReadonlyMap<string, DisambiguationRule>;
  aliases: readonly IdentityAlias[];
  userExercises: readonly UserExerciseDocument[];
  normalizationOverrides: readonly NormalizationOverrideDocument[];
};

export type ExerciseIdentityResolver = (input: ExerciseIdentityInput) => ExerciseIdentityResult;

export type PreparedImportName = {
  normalizedName: string;
  nonIdentityAnnotations: string[];
  hasAlternative: boolean;
};

type ResolvedConcrete = {
  item: ExerciseCatalogItem;
  source: ExerciseIdentityResult["source"];
};

function customExerciseAsCatalogItem(exercise: UserExerciseDocument): ExerciseCatalogItem {
  return {
    id: exercise.id,
    name: exercise.name,
    aliases: [],
    equipment: [],
    movementPatterns: [],
    muscles: { primary: [], secondary: [] },
    tags: [],
    movementModifierIds: [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function prepareImportName(
  name: string,
  disambiguations: ReadonlyMap<string, DisambiguationRule>,
): PreparedImportName {
  let normalizedName = normalizeExerciseName(name);
  const nonIdentityAnnotations: string[] = [];
  let hasAlternative = false;
  const phraseRules = [...disambiguations.values()]
    .filter((rule): rule is Extract<DisambiguationRule, { kind: "non-identity-phrase" }> =>
      rule.kind === "non-identity-phrase",
    )
    .sort((left, right) => right.normalizedPhrase.length - left.normalizedPhrase.length);

  for (const rule of phraseRules) {
    const phrase = normalizeExerciseName(rule.normalizedPhrase);
    if (!phrase) continue;
    const expression = new RegExp(`(^| )${escapeRegExp(phrase)}(?= |$)`, "g");
    let matched = false;
    normalizedName = normalizedName.replace(expression, (match, prefix: string) => {
      matched = true;
      return rule.behavior === "paused-duration" ? `${prefix}paused` : prefix;
    });
    if (!matched) continue;
    nonIdentityAnnotations.push(rule.annotation);
    if (rule.behavior === "reject-alternative") hasAlternative = true;
  }

  return {
    normalizedName: normalizeExerciseName(normalizedName),
    nonIdentityAnnotations,
    hasAlternative,
  };
}

function findUnique<T>(records: readonly T[], predicate: (record: T) => boolean): T | undefined {
  const matches = records.filter(predicate);
  return matches.length === 1 ? matches[0] : undefined;
}

function orderedModifierIds(
  modifierIds: readonly string[],
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>,
): string[] {
  return [...modifierIds].sort((left, right) => {
    const leftOrder = modifiersById.get(left)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = modifiersById.get(right)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.localeCompare(right);
  });
}

function resultForConcrete(
  resolved: ResolvedConcrete,
  input: ExerciseIdentityInput,
  context: ExerciseIdentityContext,
): ExerciseIdentityResult {
  const override = context.normalizationOverrides.find(
    (candidate) => candidate.targetKind === "exercise-id" && candidate.targetValue === resolved.item.id,
  );
  const movementId = override ? override.movementId ?? undefined : resolved.item.movementId;
  const movementModifierIds = orderedModifierIds(
    override ? override.movementModifierIds : resolved.item.movementModifierIds,
    context.modifiersById,
  );
  const movement = movementId ? context.movementsById.get(movementId) : undefined;

  return {
    groupKey: movementId ? `movement:${movementId}` : `exercise:${resolved.item.id}`,
    concreteExerciseId: resolved.item.id,
    movementId,
    movementName: movement?.name,
    movementModifierIds,
    movementModifierNames: movementModifierIds.map((id) => context.modifiersById.get(id)?.name ?? id),
    displayLabel: resolved.item.name,
    ...(input.kind === "stored-exercise" && input.performedName
      ? { performedName: input.performedName }
      : {}),
    currentVersionLabel: resolved.item.name,
    source: override ? "user-override" : resolved.source,
    specificity: override ? "overridden" : "exact",
  };
}

function standaloneResult(
  input: ExerciseIdentityInput,
  normalizedName: string,
): ExerciseIdentityResult {
  const displayLabel = input.kind === "stored-exercise"
    ? input.performedName ?? input.canonicalExerciseId ?? input.slotId
    : input.kind === "import-name"
      ? input.name
      : input.kind === "custom-exercise"
        ? input.name
        : input.canonicalExerciseId;
  const groupKey = input.kind === "stored-exercise"
    ? `slot:${input.slotId}`
    : input.kind === "custom-exercise"
      ? `exercise:${input.exerciseId}`
      : input.kind === "catalog-reference"
        ? `catalog:${input.canonicalExerciseId}`
        : `name:${normalizedName}`;

  return {
    groupKey,
    concreteExerciseId: undefined,
    movementModifierIds: [],
    movementModifierNames: [],
    displayLabel,
    ...(input.kind === "stored-exercise" && input.performedName
      ? { performedName: input.performedName }
      : {}),
    source: "standalone",
    specificity: "unmatched",
  };
}

function resultForUnderspecified(
  input: ExerciseIdentityInput,
  rule: Extract<DisambiguationRule, { kind: "underspecified-name" }>,
  context: ExerciseIdentityContext,
): ExerciseIdentityResult {
  const movementModifierIds = orderedModifierIds(rule.matchedModifierIds, context.modifiersById);
  const movement = context.movementsById.get(rule.movementId);
  const displayLabel = input.kind === "stored-exercise"
    ? input.performedName ?? rule.normalizedName
    : input.kind === "import-name"
      ? input.name
      : rule.normalizedName;

  return {
    groupKey: `movement:${rule.movementId}`,
    concreteExerciseId: undefined,
    movementId: rule.movementId,
    movementName: movement?.name,
    movementModifierIds,
    movementModifierNames: movementModifierIds.map((id) => context.modifiersById.get(id)?.name ?? id),
    displayLabel,
    ...(input.kind === "stored-exercise" && input.performedName
      ? { performedName: input.performedName }
      : {}),
    source: "standalone",
    specificity: "underspecified",
  };
}

function resultForNormalizedNameOverride(
  input: Extract<ExerciseIdentityInput, { kind: "stored-exercise" | "import-name" }>,
  normalizedName: string,
  override: NormalizationOverrideDocument,
  context: ExerciseIdentityContext,
): ExerciseIdentityResult {
  const movementId = override.movementId ?? undefined;
  const movementModifierIds = orderedModifierIds(override.movementModifierIds, context.modifiersById);
  const movement = movementId ? context.movementsById.get(movementId) : undefined;
  const displayLabel = input.kind === "stored-exercise"
    ? input.performedName ?? normalizedName
    : input.name;

  return {
    groupKey: movementId ? `movement:${movementId}` : standaloneResult(input, normalizedName).groupKey,
    concreteExerciseId: undefined,
    movementId,
    movementName: movement?.name,
    movementModifierIds,
    movementModifierNames: movementModifierIds.map((id) => context.modifiersById.get(id)?.name ?? id),
    displayLabel,
    ...(input.kind === "stored-exercise" && input.performedName
      ? { performedName: input.performedName }
      : {}),
    source: "user-override",
    specificity: "overridden",
  };
}

function resolveCanonicalId(
  canonicalExerciseId: string,
  input: ExerciseIdentityInput,
  context: ExerciseIdentityContext,
): ExerciseIdentityResult | undefined {
  const catalogItem = context.catalogById.get(canonicalExerciseId);
  if (catalogItem) return resultForConcrete({ item: catalogItem, source: "catalog-id" }, input, context);

  // TODO(2026-09-30): remove legacy exercise ID redirects after the compatibility window.
  const redirectedExerciseId = context.redirects.get(canonicalExerciseId);
  const redirectedItem = redirectedExerciseId ? context.catalogById.get(redirectedExerciseId) : undefined;
  if (redirectedItem) {
    return resultForConcrete({ item: redirectedItem, source: "legacy-redirect" }, input, context);
  }

  return undefined;
}

function resolveName(
  input: Extract<ExerciseIdentityInput, { kind: "stored-exercise" | "import-name" }>,
  name: string,
  context: ExerciseIdentityContext,
): ExerciseIdentityResult {
  const prepared = prepareImportName(name, context.disambiguations);
  if (prepared.hasAlternative) return standaloneResult(input, prepared.normalizedName);

  const alias = findUnique(
    context.aliases,
    (candidate) => normalizeExerciseName(candidate.normalizedAlias || candidate.alias) === prepared.normalizedName,
  );
  if (alias) {
    const catalogItem = context.catalogById.get(alias.canonicalExerciseId);
    if (catalogItem) return resultForConcrete({ item: catalogItem, source: "saved-alias" }, input, context);
    const customExercise = context.userExercises.find((exercise) => exercise.id === alias.canonicalExerciseId);
    if (customExercise) {
      return resultForConcrete(
        { item: customExerciseAsCatalogItem(customExercise), source: "saved-alias" },
        input,
        context,
      );
    }
  }

  const normalizedNameOverride = context.normalizationOverrides.find(
    (override) =>
      override.targetKind === "normalized-name" &&
      normalizeExerciseName(override.targetValue) === prepared.normalizedName,
  );
  const disambiguation = context.disambiguations.get(prepared.normalizedName);
  if (disambiguation?.kind === "underspecified-name") {
    if (normalizedNameOverride) {
      return resultForNormalizedNameOverride(input, prepared.normalizedName, normalizedNameOverride, context);
    }
    return resultForUnderspecified(input, disambiguation, context);
  }

  const catalogueEntries = [...context.catalogById.values()];
  const canonicalMatch = findUnique(
    catalogueEntries,
    (item) => normalizeExerciseName(item.name) === prepared.normalizedName,
  );
  if (canonicalMatch) return resultForConcrete({ item: canonicalMatch, source: "legacy-name" }, input, context);

  const aliasMatch = findUnique(
    catalogueEntries,
    (item) => item.aliases.some((candidate) => normalizeExerciseName(candidate) === prepared.normalizedName),
  );
  if (aliasMatch) return resultForConcrete({ item: aliasMatch, source: "legacy-name" }, input, context);

  const customMatch = findUnique(
    context.userExercises,
    (exercise) => normalizeExerciseName(exercise.name) === prepared.normalizedName,
  );
  if (customMatch) {
    return resultForConcrete(
      { item: customExerciseAsCatalogItem(customMatch), source: "legacy-name" },
      input,
      context,
    );
  }

  if (normalizedNameOverride) {
    return resultForNormalizedNameOverride(input, prepared.normalizedName, normalizedNameOverride, context);
  }

  return standaloneResult(input, prepared.normalizedName);
}

export function resolveExerciseIdentity(
  input: ExerciseIdentityInput,
  context: ExerciseIdentityContext,
): ExerciseIdentityResult {
  if (input.kind === "catalog-reference") {
    return resolveCanonicalId(input.canonicalExerciseId, input, context)
      ?? standaloneResult(input, normalizeExerciseName(input.canonicalExerciseId));
  }

  if (input.kind === "custom-exercise") {
    const customExercise = context.userExercises.find((exercise) => exercise.id === input.exerciseId);
    return customExercise
      ? resultForConcrete({ item: customExerciseAsCatalogItem(customExercise), source: "catalog-id" }, input, context)
      : standaloneResult(input, normalizeExerciseName(input.name));
  }

  if (input.kind === "stored-exercise") {
    if (input.canonicalExerciseId) {
      const byCanonicalId = resolveCanonicalId(input.canonicalExerciseId, input, context);
      if (byCanonicalId) return byCanonicalId;
    }
    return input.performedName
      ? resolveName(input, input.performedName, context)
      : standaloneResult(input, "");
  }

  return resolveName(input, input.name, context);
}
