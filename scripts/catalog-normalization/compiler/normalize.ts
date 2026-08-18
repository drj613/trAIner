import type {
  AliasClassification,
  Assignment,
  BuildRegistries,
  CatalogExercise,
  Merge,
  MovementDefinition,
  MovementModifierDefinition,
  NormalizedCatalogExercise,
  ValidatedNormalizedCatalogue,
} from "./types";
import {
  canonicalModifierIds,
  flattenMerges,
  validateAliasOutcomes,
  validateRegistries,
} from "./validate";

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

export function normalizeToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function assertUniqueDefinitions<T extends { id: string }>(
  definitions: readonly T[],
  kind: string,
): ReadonlyMap<string, T> {
  const byId = new Map<string, T>();
  for (const definition of definitions) {
    if (!definition.id || byId.has(definition.id)) throw new Error(`Duplicate ${kind} ID: ${definition.id}`);
    byId.set(definition.id, definition);
  }
  return byId;
}

export function buildRegistries(
  movements: readonly MovementDefinition[],
  modifiers: readonly MovementModifierDefinition[],
  signatures: BuildRegistries["signatures"] = [],
): BuildRegistries {
  return {
    movementsById: assertUniqueDefinitions(movements, "movement"),
    modifiersById: assertUniqueDefinitions(modifiers, "modifier"),
    signatures: [...signatures],
  };
}

export function canonicalizeModifiers(
  movementId: string,
  modifierIds: readonly string[],
  registries: BuildRegistries,
): string[] {
  return canonicalModifierIds(movementId, modifierIds, registries);
}

export { flattenMerges, signatureFor } from "./validate";

type CurationInputs = {
  movements: readonly MovementDefinition[];
  modifiers: readonly MovementModifierDefinition[];
  merges: readonly Merge[];
  assignments: readonly Assignment[];
  aliasClassifications: readonly AliasClassification[];
};

function assertCatalogExercise(exercise: CatalogExercise): void {
  if (!exercise.id || !exercise.name) throw new Error(`Invalid catalogue exercise: ${exercise.id}`);
  if (
    !Array.isArray(exercise.aliases) ||
    !Array.isArray(exercise.equipment) ||
    !Array.isArray(exercise.movementPatterns) ||
    !Array.isArray(exercise.muscles?.primary) ||
    !Array.isArray(exercise.muscles?.secondary) ||
    !Array.isArray(exercise.tags)
  ) {
    throw new Error(`Invalid catalogue exercise: ${exercise.id}`);
  }
}

function mergeRecordMap(merges: readonly Merge[], snapshotIds: ReadonlySet<string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const merge of merges) {
    const fromId = merge.fromExerciseId;
    const toId = merge.toExerciseId;
    if (!fromId || !toId) throw new Error("Invalid merge record");
    if (!snapshotIds.has(fromId)) throw new Error(`Merge source missing: ${fromId}`);
    if (!snapshotIds.has(toId)) throw new Error(`Merge target missing: ${toId}`);
    if (fromId === toId) throw new Error(`Merge cycle: ${fromId}`);
    if (map[fromId] !== undefined) throw new Error(`Merge conflict: ${fromId}`);
    map[fromId] = toId;
  }
  return map;
}

function mergedExercises(
  snapshot: readonly CatalogExercise[],
  redirects: Readonly<Record<string, string>>,
): CatalogExercise[] {
  const survivors = new Map<string, CatalogExercise>();
  for (const exercise of snapshot) {
    if (redirects[exercise.id] === undefined) survivors.set(exercise.id, { ...exercise, aliases: [...exercise.aliases] });
  }
  for (const source of [...snapshot].sort((a, b) => compareText(a.id, b.id))) {
    const targetId = redirects[source.id];
    if (!targetId) continue;
    const target = survivors.get(targetId);
    if (!target) throw new Error(`Merge target missing: ${targetId}`);
    survivors.set(targetId, {
      ...target,
      aliases: uniqueStrings([...target.aliases, source.name, ...source.aliases]),
      equipment: uniqueStrings([...target.equipment, ...source.equipment]),
      movementPatterns: uniqueStrings([...target.movementPatterns, ...source.movementPatterns]),
      muscles: {
        primary: uniqueStrings([...target.muscles.primary, ...source.muscles.primary]),
        secondary: uniqueStrings([...target.muscles.secondary, ...source.muscles.secondary]),
      },
      tags: uniqueStrings([...target.tags, ...source.tags]),
    });
  }
  return [...survivors.values()].sort((a, b) => compareText(a.id, b.id));
}

function assignmentMap(
  assignments: readonly Assignment[],
  survivingIds: ReadonlySet<string>,
): ReadonlyMap<string, Assignment> {
  const byExerciseId = new Map<string, Assignment>();
  for (const assignment of assignments) {
    if (!survivingIds.has(assignment.exerciseId)) {
      throw new Error(`Assignment exercise missing: ${assignment.exerciseId}`);
    }
    if (byExerciseId.has(assignment.exerciseId)) {
      throw new Error(`Duplicate assignment: ${assignment.exerciseId}`);
    }
    if (assignment.movementId === null && assignment.movementModifierIds.length > 0) {
      throw new Error(`Standalone assignment has modifiers: ${assignment.exerciseId}`);
    }
    byExerciseId.set(assignment.exerciseId, assignment);
  }
  return byExerciseId;
}

function classificationMap(
  classifications: readonly AliasClassification[],
): ReadonlyMap<string, AliasClassification> {
  const byToken = new Map<string, AliasClassification>();
  for (const classification of classifications) {
    const token = normalizeToken(classification.normalizedToken);
    if (!token || token !== classification.normalizedToken || byToken.has(token)) {
      throw new Error(`Duplicate alias classification: ${classification.normalizedToken}`);
    }
    byToken.set(token, classification);
  }
  return byToken;
}

function validateClassifications(
  classifications: ReadonlyMap<string, AliasClassification>,
  survivingIds: ReadonlySet<string>,
  registries: BuildRegistries,
): void {
  for (const classification of classifications.values()) {
    if (classification.outcome === "unique" && !survivingIds.has(classification.exerciseId)) {
      throw new Error(`Alias classification target missing: ${classification.normalizedToken}`);
    }
    if (classification.outcome === "underspecified") {
      if (!registries.movementsById.has(classification.movementId)) {
        throw new Error(`Unknown movement: ${classification.movementId}`);
      }
      for (const candidateId of classification.candidateIds) {
        if (!survivingIds.has(candidateId)) {
          throw new Error(`Alias classification target missing: ${classification.normalizedToken}`);
        }
      }
    }
  }
}

function aliasCandidates(exercises: readonly CatalogExercise[]): ReadonlyMap<string, string[]> {
  const candidates = new Map<string, Set<string>>();
  for (const exercise of exercises) {
    for (const label of [exercise.name, ...exercise.aliases]) {
      const token = normalizeToken(label);
      if (!token) continue;
      const ids = candidates.get(token) ?? new Set<string>();
      ids.add(exercise.id);
      candidates.set(token, ids);
    }
  }
  return new Map(
    [...candidates.entries()]
      .sort(([a], [b]) => compareText(a, b))
      .map(([token, ids]) => [token, uniqueStrings(ids)]),
  );
}

function completeAliasOutcomes(
  candidates: ReadonlyMap<string, string[]>,
  classifications: ReadonlyMap<string, AliasClassification>,
): ReadonlyMap<string, AliasClassification> {
  const outcomes = new Map<string, AliasClassification>();
  for (const [token, ids] of candidates) {
    if (ids.length === 1) {
      outcomes.set(token, { normalizedToken: token, outcome: "unique", exerciseId: ids[0] });
      continue;
    }
    const classification = classifications.get(token);
    if (!classification) throw new Error(`Unclassified alias collision: ${token}`);
    outcomes.set(token, classification);
  }
  return outcomes;
}

export function validateNormalizedCatalogue(
  snapshot: readonly CatalogExercise[],
  inputs: CurationInputs,
): ValidatedNormalizedCatalogue {
  const snapshotById = new Map<string, CatalogExercise>();
  for (const exercise of snapshot) {
    assertCatalogExercise(exercise);
    if (snapshotById.has(exercise.id)) throw new Error(`Duplicate exercise ID: ${exercise.id}`);
    snapshotById.set(exercise.id, exercise);
  }

  const rawMerges = mergeRecordMap(inputs.merges, new Set(snapshotById.keys()));
  const survivingIds = new Set([...snapshotById.keys()].filter((id) => rawMerges[id] === undefined));
  const redirects = flattenMerges(rawMerges, survivingIds);
  const exercises = mergedExercises(snapshot, redirects);
  const assignments = assignmentMap(inputs.assignments, new Set(exercises.map((exercise) => exercise.id)));
  const registries = buildRegistries(
    inputs.movements,
    inputs.modifiers,
    exercises.flatMap((exercise) => {
      const assignment = assignments.get(exercise.id);
      return assignment?.movementId
        ? [{ movementId: assignment.movementId, modifierIds: assignment.movementModifierIds, exerciseId: exercise.id }]
        : [];
    }),
  );
  validateRegistries(registries);

  const normalizedExercises: NormalizedCatalogExercise[] = exercises.map((exercise) => {
    const assignment = assignments.get(exercise.id);
    if (!assignment?.movementId) {
      return { ...exercise, movementId: null, movementModifierIds: [] };
    }
    return {
      ...exercise,
      ...(assignment.metadataOverrides ?? {}),
      movementId: assignment.movementId,
      movementModifierIds: canonicalizeModifiers(
        assignment.movementId,
        assignment.movementModifierIds,
        registries,
      ),
    } as NormalizedCatalogExercise;
  });
  for (const exercise of normalizedExercises) assertCatalogExercise(exercise);

  const classifications = classificationMap(inputs.aliasClassifications);
  validateClassifications(classifications, new Set(normalizedExercises.map((exercise) => exercise.id)), registries);
  const candidates = aliasCandidates(normalizedExercises);
  validateAliasOutcomes(candidates, classifications);

  return {
    exercises: normalizedExercises,
    registries,
    redirects,
    aliasOutcomes: completeAliasOutcomes(candidates, classifications),
    aliasCandidates: candidates,
  };
}
