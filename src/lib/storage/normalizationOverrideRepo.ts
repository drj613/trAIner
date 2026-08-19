import { exerciseCatalog } from "@/lib/catalog/exercises";
import {
  dispatchExerciseIdentityChanged,
  type IdentityWriteOptions,
} from "@/lib/catalog/identityEvents";
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

export function normalizationOverrideKey(
  targetKind: NormalizationOverrideDocument["targetKind"],
  targetValue: string,
): string {
  return overrideKeyFor(targetKind, normalizeTargetValue(targetKind, targetValue));
}

export function validateNormalizationOverrideInput(
  input: NormalizationOverrideSaveInput,
  userExerciseIds: ReadonlySet<string> = new Set(),
): void {
  const targetValue = normalizeTargetValue(input.targetKind, input.targetValue);
  if (!targetValue) throw new Error("Normalization override target cannot be empty");
  if (
    input.targetKind === "exercise-id" &&
    !catalogExerciseIds.has(targetValue) &&
    !userExerciseIds.has(targetValue)
  ) {
    throw new Error(`Unknown exercise target: ${targetValue}`);
  }

  if (input.movementId === null) {
    if (input.movementModifierIds.length > 0) {
      throw new Error("A standalone override cannot have movement modifiers");
    }
    return;
  }

  const movement = movementsById.get(input.movementId);
  if (!movement) throw new Error(`Unknown movement: ${input.movementId}`);

  const modifiers = input.movementModifierIds.map((modifierId) => {
    const modifier = modifiersById.get(modifierId);
    if (!modifier) throw new Error(`Unknown modifier: ${modifierId}`);
    return modifier;
  });
  if (new Set(input.movementModifierIds).size !== input.movementModifierIds.length) {
    throw new Error("Duplicate movement modifier");
  }

  const canonicalOrder = [...input.movementModifierIds].sort((left, right) => {
    const leftOrder = modifiersById.get(left)!.sortOrder;
    const rightOrder = modifiersById.get(right)!.sortOrder;
    return leftOrder - rightOrder || left.localeCompare(right);
  });
  if (canonicalOrder.some((modifierId, index) => modifierId !== input.movementModifierIds[index])) {
    throw new Error("Modifier order is not canonical");
  }

  for (const modifier of modifiers) {
    if (!movement.allowedModifierIds.includes(modifier.id)) {
      throw new Error(`Modifier not allowed for movement: ${modifier.id}`);
    }
  }
  if (modifiers.length > movement.maxIdentityModifiers) {
    throw new Error(`Too many identity modifiers: ${movement.id}`);
  }

  const selectedIds = new Set(input.movementModifierIds);
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

function dispatchAfterWrite(options?: IdentityWriteOptions): void {
  if (options?.dispatch !== false) dispatchExerciseIdentityChanged();
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

    const targetValue = normalizeTargetValue(input.targetKind, input.targetValue);
    const document: NormalizationOverrideDocument = {
      ...input,
      id: overrideKeyFor(input.targetKind, targetValue),
      targetValue,
      movementModifierIds: [...input.movementModifierIds],
      updatedAt: new Date().toISOString(),
    };
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
