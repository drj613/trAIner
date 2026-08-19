import { exerciseCatalog } from "@/lib/catalog/exercises";
import { dispatchAfterWrite, type IdentityWriteOptions } from "@/lib/catalog/identityEvents";
import type { NormalizationOverrideDocument } from "@/lib/catalog/identity";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import { modifiersById, movementsById } from "@/lib/catalog/registries";
import { getDb } from "./appDb";

export type NormalizationOverrideSaveInput = Omit<
  NormalizationOverrideDocument,
  "id" | "updatedAt"
>;

export type NormalizationOverrideRepository = {
  list(): Promise<NormalizationOverrideDocument[]>;
  get(id: string): Promise<NormalizationOverrideDocument | undefined>;
  save(
    input: NormalizationOverrideSaveInput,
    options?: IdentityWriteOptions,
  ): Promise<NormalizationOverrideDocument>;
  remove(id: string, options?: IdentityWriteOptions): Promise<void>;
};

const catalogExerciseIds = new Set(exerciseCatalog.map((exercise) => exercise.id));

// The only place a target value is normalized, and the only place an unknown
// target kind is rejected. Two paths used to do this and disagreed: one threw
// on an unknown kind, the other silently trimmed it.
function normalizeTargetValue(
  targetKind: NormalizationOverrideDocument["targetKind"],
  targetValue: string,
): string {
  if (targetKind === "normalized-name") return normalizeExerciseName(targetValue);
  if (targetKind === "exercise-id") return targetValue.trim();
  throw new Error(`Unknown normalization target kind: ${String(targetKind)}`);
}

// Takes an already-normalized value so callers normalize exactly once.
function overrideKeyFor(
  targetKind: NormalizationOverrideDocument["targetKind"],
  normalizedTargetValue: string,
): string {
  return `${targetKind}:${normalizedTargetValue}`;
}

/**
 * The single place a stored override document's key fields are derived, so the
 * repository and a restored backup cannot disagree about what a target means.
 * The caller's `id` and `targetValue` are replaced, never trusted.
 */
export function canonicalNormalizationOverride<T extends NormalizationOverrideSaveInput>(
  input: T,
): T & { id: string; targetValue: string; movementModifierIds: string[] } {
  const targetValue = normalizeTargetValue(input.targetKind, input.targetValue);
  return {
    ...input,
    id: overrideKeyFor(input.targetKind, targetValue),
    targetValue,
    movementModifierIds: [...input.movementModifierIds],
  };
}

export function normalizationOverrideKey(
  targetKind: NormalizationOverrideDocument["targetKind"],
  targetValue: string,
): string {
  return overrideKeyFor(targetKind, normalizeTargetValue(targetKind, targetValue));
}

type MovementDefinition = NonNullable<ReturnType<typeof movementsById.get>>;
type ModifierDefinition = NonNullable<ReturnType<typeof modifiersById.get>>;

// Split by *kind* of rule rather than by line count: what the override points
// at, whether each modifier exists, whether the list is in canonical order, and
// whether the set is compatible with the movement. The order the four run in is
// the order the errors were specified in, and the tests pin one message per
// rule, so keep them in this sequence when adding a fifth.

function validateOverrideTarget(
  input: NormalizationOverrideSaveInput,
  normalizedTargetValue: string,
  userExerciseIds: ReadonlySet<string>,
): void {
  if (!normalizedTargetValue) throw new Error("Normalization override target cannot be empty");
  if (input.targetKind !== "exercise-id") return;
  if (catalogExerciseIds.has(normalizedTargetValue)) return; // Exact concrete metadata lookup; grouping is intentionally not performed here.
  if (userExerciseIds.has(normalizedTargetValue)) return;
  throw new Error(`Unknown exercise target: ${normalizedTargetValue}`);
}

// Resolves once and hands the definitions on, so no later rule has to reach
// back into the registry with a non-null assertion.
function resolveModifiers(movementModifierIds: readonly string[]): ModifierDefinition[] {
  const modifiers = movementModifierIds.map((modifierId) => {
    const modifier = modifiersById.get(modifierId);
    if (!modifier) throw new Error(`Unknown modifier: ${modifierId}`);
    return modifier;
  });
  if (new Set(movementModifierIds).size !== movementModifierIds.length) {
    throw new Error("Duplicate movement modifier");
  }
  return modifiers;
}

function validateModifierOrder(modifiers: readonly ModifierDefinition[]): void {
  const canonicalOrder = [...modifiers].sort((left, right) =>
    left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  if (canonicalOrder.some((modifier, index) => modifier.id !== modifiers[index].id)) {
    throw new Error("Modifier order is not canonical");
  }
}

function validateModifierCompatibility(
  movement: MovementDefinition,
  modifiers: readonly ModifierDefinition[],
): void {
  for (const modifier of modifiers) {
    if (!movement.allowedModifierIds.includes(modifier.id)) {
      throw new Error(`Modifier not allowed for movement: ${modifier.id}`);
    }
  }
  if (modifiers.length > movement.maxIdentityModifiers) {
    throw new Error(`Too many identity modifiers: ${movement.id}`);
  }

  const selectedIds = new Set(modifiers.map((modifier) => modifier.id));
  for (const modifier of modifiers) {
    for (const impliedId of modifier.implies ?? []) {
      if (!selectedIds.has(impliedId)) {
        throw new Error(`Missing implied modifier: ${modifier.id} requires ${impliedId}`);
      }
    }
  }

  const exclusiveGroups = new Set<string>();
  for (const modifier of modifiers) {
    if (!modifier.exclusiveGroup) continue;
    if (exclusiveGroups.has(modifier.exclusiveGroup)) {
      throw new Error(`Exclusive-group conflict: ${modifier.exclusiveGroup}`);
    }
    exclusiveGroups.add(modifier.exclusiveGroup);
  }

  for (const modifier of modifiers) {
    const excludedId = (modifier.excludes ?? []).find((candidate) => selectedIds.has(candidate));
    if (excludedId) {
      throw new Error(`Modifier exclusion conflict: ${modifier.id}/${excludedId}`);
    }
  }
}

export function validateNormalizationOverrideInput(
  input: NormalizationOverrideSaveInput,
  userExerciseIds: ReadonlySet<string> = new Set(),
): void {
  validateOverrideTarget(
    input,
    normalizeTargetValue(input.targetKind, input.targetValue),
    userExerciseIds,
  );

  if (input.movementId === null) {
    if (input.movementModifierIds.length > 0) {
      throw new Error("A standalone override cannot have movement modifiers");
    }
    return;
  }

  const movement = movementsById.get(input.movementId);
  if (!movement) throw new Error(`Unknown movement: ${input.movementId}`);

  const modifiers = resolveModifiers(input.movementModifierIds);
  validateModifierOrder(modifiers);
  validateModifierCompatibility(movement, modifiers);
}

export const normalizationOverrideRepo: NormalizationOverrideRepository = {
  async list() {
    return (await getDb()).getAll("normalizationOverrides");
  },

  async get(id) {
    return (await getDb()).get("normalizationOverrides", id);
  },

  async save(input, options) {
    const db = await getDb();
    // Validated before the write transaction opens: rejecting inside one leaves
    // a readwrite transaction dangling until it auto-commits, and this
    // custom-exercise lookup only ever needed to read.
    const userExerciseKeys = await db.getAllKeys("userExercises");
    const userExerciseIds = new Set(userExerciseKeys.filter((key): key is string => typeof key === "string"));
    validateNormalizationOverrideInput(input, userExerciseIds);

    const document: NormalizationOverrideDocument = canonicalNormalizationOverride({
      ...input,
      updatedAt: new Date().toISOString(),
    });
    const tx = db.transaction("normalizationOverrides", "readwrite");
    await tx.objectStore("normalizationOverrides").put(document);
    await tx.done;
    dispatchAfterWrite(options);
    return document;
  },

  async remove(id, options) {
    const db = await getDb();
    const tx = db.transaction("normalizationOverrides", "readwrite");
    await tx.objectStore("normalizationOverrides").delete(id);
    await tx.done;
    dispatchAfterWrite(options);
  },
};
