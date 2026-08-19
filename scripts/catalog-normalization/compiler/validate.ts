import { readFile } from "node:fs/promises";
import type {
  AliasClassification,
  BuildRegistries,
  CatalogExercise,
  MovementDefinition,
  MovementModifierDefinition,
  RegistrySignature,
  VariantCandidate,
  VariantReviewArtifact,
  VariantReviewDecision,
  VariantRule,
  NormalizedCatalogExercise,
} from "./types";

export type { VariantCandidate, VariantRule } from "./types";

export const TIER_1_MOVEMENT_IDS = [
  "squat",
  "bench-press",
  "deadlift-hinge",
  "row",
  "pull-up-pulldown",
  "overhead-landmine-press",
  "lunge-split-squat",
  "push-up",
  "curl",
  "triceps-extension-pushdown",
  "raise-fly",
  "loaded-carry",
] as const;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sortedUnique(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort(compareText);
}

type CandidateRecord = Record<string, unknown>;

function isPlainCandidateObject(value: unknown): value is CandidateRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidCandidateRecord(): never {
  throw new Error("Invalid variant candidate manifest record");
}

function assertCandidateKeys(record: CandidateRecord, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) invalidCandidateRecord();
}

function candidateString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) invalidCandidateRecord();
  return value;
}

function candidateStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    invalidCandidateRecord();
  }
  const result = [...value];
  if (new Set(result).size !== result.length) invalidCandidateRecord();
  return result;
}

function candidateNonEmptyStringArray(value: unknown): string[] {
  const result = candidateStringArray(value);
  if (result.length === 0) invalidCandidateRecord();
  return result;
}

function candidateEnum(value: unknown): 1 | 2 {
  if (value !== 1 && value !== 2) invalidCandidateRecord();
  return value;
}

function candidateMetadataOverrides(value: unknown): VariantCandidate["metadataOverrides"] {
  if (!isPlainCandidateObject(value)) invalidCandidateRecord();
  assertCandidateKeys(value, ["equipment", "movementPatterns", "muscles", "tags"]);
  if (Object.keys(value).length === 0) invalidCandidateRecord();

  const result: VariantCandidate["metadataOverrides"] = {};
  for (const key of ["equipment", "movementPatterns", "tags"] as const) {
    if (value[key] !== undefined) result[key] = candidateNonEmptyStringArray(value[key]);
  }
  if (value.muscles !== undefined) {
    if (!isPlainCandidateObject(value.muscles)) invalidCandidateRecord();
    assertCandidateKeys(value.muscles, ["primary", "secondary"]);
    if (value.muscles.primary === undefined || value.muscles.secondary === undefined) {
      invalidCandidateRecord();
    }
    result.muscles = {
      primary: candidateNonEmptyStringArray(value.muscles.primary),
      secondary: candidateNonEmptyStringArray(value.muscles.secondary),
    };
  }
  return result;
}

function decodeVariantCandidate(value: unknown): VariantCandidate {
  if (!isPlainCandidateObject(value)) invalidCandidateRecord();
  assertCandidateKeys(value, [
    "id",
    "movementId",
    "movementModifierIds",
    "metadataFromExerciseId",
    "metadataOverrides",
    "approvedAliases",
    "coverageTier",
    "status",
    "rationale",
  ]);
  if (value.status !== "candidate") invalidCandidateRecord();
  const rationale = candidateString(value.rationale);
  if (rationale.trim().length < 20) invalidCandidateRecord();
  const movementModifierIds = candidateStringArray(value.movementModifierIds);
  if (movementModifierIds.length === 0) invalidCandidateRecord();
  return {
    id: candidateString(value.id),
    movementId: candidateString(value.movementId),
    movementModifierIds,
    metadataFromExerciseId: candidateString(value.metadataFromExerciseId),
    ...(value.metadataOverrides === undefined
      ? {}
      : { metadataOverrides: candidateMetadataOverrides(value.metadataOverrides) }),
    approvedAliases: candidateStringArray(value.approvedAliases),
    coverageTier: candidateEnum(value.coverageTier),
    status: "candidate",
    rationale,
  };
}

function decodeVariantRule(value: unknown, allowCandidateStatus = true): VariantRule {
  if (!isPlainCandidateObject(value)) invalidCandidateRecord();
  assertCandidateKeys(value, [
    "id",
    "movementId",
    "movementModifierIds",
    "metadataFromExerciseId",
    "metadataOverrides",
    "approvedAliases",
    "coverageTier",
    "status",
  ]);
  const status = value.status;
  if (status !== "approved" && (allowCandidateStatus ? status !== "candidate" : true)) {
    invalidCandidateRecord();
  }
  const movementModifierIds = candidateStringArray(value.movementModifierIds);
  if (movementModifierIds.length === 0) invalidCandidateRecord();
  return {
    id: candidateString(value.id),
    movementId: candidateString(value.movementId),
    movementModifierIds,
    metadataFromExerciseId: candidateString(value.metadataFromExerciseId),
    ...(value.metadataOverrides === undefined
      ? {}
      : { metadataOverrides: candidateMetadataOverrides(value.metadataOverrides) }),
    approvedAliases: candidateStringArray(value.approvedAliases),
    coverageTier: candidateEnum(value.coverageTier),
    status,
  } as VariantRule;
}

export async function loadVariantCandidates(
  path = "scripts/catalog-normalization/reviews/variant-candidates.json",
): Promise<{ schemaVersion: 1; records: VariantCandidate[] }> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!isPlainCandidateObject(parsed)) throw new Error("Invalid variant candidate artifact");
  assertCandidateKeys(parsed, ["schemaVersion", "records"]);
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records)) {
    throw new Error("Invalid variant candidate artifact");
  }
  if (parsed.records.length > 300) throw new Error("Tier-1 candidate cap exceeded");
  const records = parsed.records.map(decodeVariantCandidate);
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`Duplicate variant candidate ID: ${record.id}`);
    ids.add(record.id);
  }
  return { schemaVersion: 1, records };
}

export async function loadVariantReviews(
  path = "scripts/catalog-normalization/reviews/variant-adversarial-review.json",
): Promise<VariantReviewArtifact> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!isPlainCandidateObject(parsed)) throw new Error("Invalid variant adversarial review artifact");
  assertCandidateKeys(parsed, ["schemaVersion", "records"]);
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records)) {
    throw new Error("Invalid variant adversarial review artifact");
  }
  if (parsed.records.length > 300) throw new Error("Variant review cap exceeded");

  const records: VariantReviewDecision[] = parsed.records.map((value) => {
    if (!isPlainCandidateObject(value)) invalidCandidateRecord();
    assertCandidateKeys(value, ["candidateId", "decision", "reason", "revisedRule"]);
    const candidateId = candidateString(value.candidateId);
    const reason = candidateString(value.reason);
    if (value.decision !== "approve" && value.decision !== "reject" && value.decision !== "revise") {
      invalidCandidateRecord();
    }
    if (value.decision === "revise") {
      if (value.revisedRule === undefined) invalidCandidateRecord();
      const revisedRule = decodeVariantRule(value.revisedRule, false);
      return { candidateId, decision: "revise", reason, revisedRule };
    }
    if (value.revisedRule !== undefined) invalidCandidateRecord();
    return { candidateId, decision: value.decision, reason };
  });

  return { schemaVersion: 1, records };
}

export function joinCandidateReviews(
  candidates: readonly VariantCandidate[],
  reviews: readonly VariantReviewDecision[],
): Array<{ candidate: VariantCandidate; review: VariantReviewDecision }> {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const byCandidateId = new Map<string, VariantReviewDecision>();
  for (const review of reviews) {
    if (!candidateIds.has(review.candidateId)) {
      throw new Error(`unknown review decision: ${review.candidateId}`);
    }
    if (byCandidateId.has(review.candidateId)) {
      throw new Error(`duplicate review decision: ${review.candidateId}`);
    }
    byCandidateId.set(review.candidateId, review);
  }

  return candidates.map((candidate) => {
    const review = byCandidateId.get(candidate.id);
    if (!review) throw new Error(`missing review decision: ${candidate.id}`);
    return { candidate, review };
  });
}

function closureForModifier(
  modifierId: string,
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>,
  visiting: Set<string>,
  resolved: Map<string, string[]>,
): string[] {
  const cached = resolved.get(modifierId);
  if (cached) return cached;
  if (visiting.has(modifierId)) throw new Error(`Modifier implication cycle: ${modifierId}`);

  const modifier = modifiersById.get(modifierId);
  if (!modifier) throw new Error(`Unknown modifier: ${modifierId}`);
  visiting.add(modifierId);
  const closure = new Set<string>([modifierId]);
  for (const impliedId of modifier.implies ?? []) {
    for (const id of closureForModifier(impliedId, modifiersById, visiting, resolved)) closure.add(id);
  }
  visiting.delete(modifierId);
  const result = sortedUnique(closure);
  resolved.set(modifierId, result);
  return result;
}

export function modifierClosure(
  modifierIds: readonly string[],
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>,
): string[] {
  const resolved = new Map<string, string[]>();
  const closure = new Set<string>();
  for (const modifierId of modifierIds) {
    for (const id of closureForModifier(modifierId, modifiersById, new Set(), resolved)) closure.add(id);
  }
  return sortedUnique(closure);
}

function modifierSort(
  modifierIds: readonly string[],
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>,
): string[] {
  return [...modifierIds].sort((a, b) => {
    const aModifier = modifiersById.get(a);
    const bModifier = modifiersById.get(b);
    if (!aModifier) throw new Error(`Unknown modifier: ${a}`);
    if (!bModifier) throw new Error(`Unknown modifier: ${b}`);
    return aModifier.sortOrder - bModifier.sortOrder || compareText(a, b);
  });
}

function validateModifierSelection(
  movement: MovementDefinition,
  modifierIds: readonly string[],
  registries: BuildRegistries,
): string[] {
  const ids = modifierSort(modifierClosure(modifierIds, registries.modifiersById), registries.modifiersById);
  const exclusiveGroups = new Set<string>();
  for (const modifierId of ids) {
    const modifier = registries.modifiersById.get(modifierId)!;
    if (!modifier.identity) throw new Error(`Non-identity modifier in signature: ${modifierId}`);
    if (!movement.allowedModifierCategories.includes(modifier.category)) {
      throw new Error(`Modifier category not allowed for movement: ${modifierId}`);
    }
    if (!movement.allowedModifierIds.includes(modifierId)) {
      throw new Error(`Modifier not allowed for movement: ${modifierId}`);
    }
    if (modifier.exclusiveGroup) {
      if (exclusiveGroups.has(modifier.exclusiveGroup)) {
        throw new Error(`Exclusive-group conflict: ${modifier.exclusiveGroup}`);
      }
      exclusiveGroups.add(modifier.exclusiveGroup);
    }
    const excluded = new Set(modifier.excludes ?? []);
    if (ids.some((candidate) => candidate !== modifierId && excluded.has(candidate))) {
      throw new Error(`Modifier closure conflict: ${modifierId}`);
    }
  }
  if (ids.length > movement.maxIdentityModifiers) {
    throw new Error(`Too many identity modifiers: ${movement.id}`);
  }
  return ids;
}

function validateModifierReferences(registries: BuildRegistries): void {
  for (const modifier of registries.modifiersById.values()) {
    for (const impliedId of modifier.implies ?? []) {
      if (!registries.modifiersById.has(impliedId)) throw new Error(`Unknown modifier: ${impliedId}`);
    }
    for (const excludedId of modifier.excludes ?? []) {
      const excluded = registries.modifiersById.get(excludedId);
      if (!excluded) throw new Error(`Unknown modifier: ${excludedId}`);
      if (!(excluded.excludes ?? []).includes(modifier.id)) {
        throw new Error(`Asymmetric exclusion: ${modifier.id}/${excludedId}`);
      }
    }
    if (!Number.isSafeInteger(modifier.sortOrder) || modifier.sortOrder < 0) {
      throw new Error(`Invalid modifier sort order: ${modifier.id}`);
    }
  }
}

function validateClosureConflicts(
  modifierIds: readonly string[],
  registries: BuildRegistries,
): void {
  for (let index = 0; index < modifierIds.length; index += 1) {
    const left = registries.modifiersById.get(modifierIds[index])!;
    for (let otherIndex = index + 1; otherIndex < modifierIds.length; otherIndex += 1) {
      const right = registries.modifiersById.get(modifierIds[otherIndex])!;
      if (
        (left.exclusiveGroup && left.exclusiveGroup === right.exclusiveGroup) ||
        (left.excludes ?? []).includes(right.id) ||
        (right.excludes ?? []).includes(left.id)
      ) {
        throw new Error(`Modifier closure conflict: ${left.id}/${right.id}`);
      }
    }
  }
}

function validateDistinctSortOrders(
  definitions: Iterable<{ id: string; sortOrder: number }>,
  kind: "movement" | "modifier",
): void {
  const idsBySortOrder = new Map<number, string>();
  for (const definition of definitions) {
    if (!Number.isSafeInteger(definition.sortOrder) || definition.sortOrder < 0) {
      throw new Error(`Invalid ${kind} sort order: ${definition.id}`);
    }
    if (idsBySortOrder.has(definition.sortOrder)) {
      throw new Error(`Duplicate ${kind} sort order: ${definition.sortOrder}`);
    }
    idsBySortOrder.set(definition.sortOrder, definition.id);
  }
}

function validateDefinitionNames(
  definitions: Iterable<{ id: string; name: string; aliases: string[] }>,
  kind: string,
): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const definition of definitions) {
    if (!definition.id || ids.has(definition.id)) throw new Error(`Duplicate ${kind} ID: ${definition.id}`);
    ids.add(definition.id);
    const name = definition.name.trim().toLowerCase();
    if (!name || names.has(name)) throw new Error(`Duplicate ${kind} name: ${definition.name}`);
    names.add(name);
  }
}

function validateSignatures(registries: BuildRegistries): void {
  const signatures = new Set<string>();
  const exerciseIds = new Set<string>();
  for (const signature of registries.signatures) {
    const movement = registries.movementsById.get(signature.movementId);
    if (!movement) throw new Error(`Unknown movement: ${signature.movementId}`);
    const ids = validateModifierSelection(movement, signature.modifierIds, registries);
    const key = signatureFor(signature.movementId, ids);
    if (signatures.has(key)) throw new Error(`Duplicate signature: ${key}`);
    signatures.add(key);
    if (signature.exerciseId) {
      if (exerciseIds.has(signature.exerciseId)) throw new Error(`Duplicate exercise ID: ${signature.exerciseId}`);
      exerciseIds.add(signature.exerciseId);
    }
  }
}

export function validateRegistries(registries: BuildRegistries): void {
  validateDefinitionNames(registries.movementsById.values(), "movement");
  validateDefinitionNames(registries.modifiersById.values(), "modifier");
  validateDistinctSortOrders(registries.movementsById.values(), "movement");
  validateDistinctSortOrders(registries.modifiersById.values(), "modifier");
  for (const movement of registries.movementsById.values()) {
    if (!Number.isSafeInteger(movement.maxIdentityModifiers) || movement.maxIdentityModifiers < 0) {
      throw new Error(`Invalid movement maximum: ${movement.id}`);
    }
    for (const modifierId of movement.allowedModifierIds) {
      if (!registries.modifiersById.has(modifierId)) {
        throw new Error(`Unknown modifier: ${modifierId}`);
      }
    }
  }
  validateModifierReferences(registries);
  modifierClosure([...registries.modifiersById.keys()], registries.modifiersById);
  for (const modifier of registries.modifiersById.values()) {
    const closure = modifierClosure([modifier.id], registries.modifiersById);
    validateClosureConflicts(closure, registries);
  }
  validateSignatures(registries);
}

export function canonicalModifierIds(
  movementId: string,
  modifierIds: readonly string[],
  registries: BuildRegistries,
): string[] {
  const movement = registries.movementsById.get(movementId);
  if (!movement) throw new Error(`Unknown movement: ${movementId}`);
  return validateModifierSelection(movement, modifierIds, registries);
}

export function signatureFor(movementId: string, modifierIds: readonly string[]): string {
  return [movementId, ...modifierIds].join("|");
}

export function idForSignature(movementId: string, modifierIds: readonly string[]): string {
  return [movementId, ...modifierIds].join("--");
}

export function flattenMerges(
  merges: Readonly<Record<string, string>>,
  survivingIds: ReadonlySet<string>,
): Record<string, string> {
  const flattened: Record<string, string> = {};
  for (const fromId of Object.keys(merges).sort(compareText)) {
    let current = fromId;
    const chain = new Set<string>();
    while (merges[current] !== undefined) {
      if (chain.has(current)) throw new Error(`Merge cycle: ${current}`);
      chain.add(current);
      const next = merges[current];
      if (!next) throw new Error(`Merge target missing: ${current}`);
      current = next;
    }
    if (!survivingIds.has(current)) throw new Error(`Merge target missing: ${current}`);
    if (current === fromId) throw new Error(`Merge cycle: ${fromId}`);
    flattened[fromId] = current;
  }
  return flattened;
}

export function validateAliasOutcomes(
  aliases: ReadonlyMap<string, readonly string[]>,
  classifications: ReadonlyMap<string, AliasClassification>,
): void {
  for (const [token, ids] of aliases) {
    const candidates = sortedUnique(ids);
    if (candidates.length < 2) continue;
    const classification = classifications.get(token);
    if (!classification) throw new Error(`Unclassified alias collision: ${token}`);
    if (classification.normalizedToken !== token) {
      throw new Error(`Alias classification token mismatch: ${token}`);
    }
    if (classification.outcome === "unique" && !candidates.includes(classification.exerciseId)) {
      throw new Error(`Alias classification target missing: ${token}`);
    }
    if (
      classification.outcome === "underspecified" &&
      !sameIds(sortedUnique(classification.candidateIds), candidates)
    ) {
      throw new Error(`Alias classification candidates mismatch: ${token}`);
    }
    if (classification.outcome === "removed-noise" && !classification.reason.trim()) {
      throw new Error(`Alias classification reason missing: ${token}`);
    }
  }
}

export function signatureFromRecord(signature: RegistrySignature, registries: BuildRegistries): string {
  return signatureFor(
    signature.movementId,
    canonicalModifierIds(signature.movementId, signature.modifierIds, registries),
  );
}

function normalizeCandidateText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function candidateMarkerPresent(alias: string, marker: string): boolean {
  const aliasTokens = new Set(normalizeCandidateText(alias).split(" ").filter(Boolean));
  const markerTokens = normalizeCandidateText(marker).split(" ").filter(Boolean);
  if (markerTokens.length === 0) return false;
  if (markerTokens.length === 1) return aliasTokens.has(markerTokens[0]);
  const aliasText = normalizeCandidateText(alias);
  return aliasText.includes(markerTokens.join(" "));
}

function assertCandidateAliasIdentity(
  candidate: VariantCandidate,
  movement: MovementDefinition,
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>,
  modifierIds: readonly string[],
): void {
  if (candidate.approvedAliases.length === 0) return;
  for (const alias of candidate.approvedAliases) {
    for (const modifierId of modifierIds) {
      const modifier = modifiersById.get(modifierId);
      if (!modifier) throw new Error(`Unknown modifier: ${modifierId}`);
      const markers = [modifier.name, ...(modifier.aliases ?? [])];
      if (!markers.some((marker) => candidateMarkerPresent(alias, marker))) {
        throw new Error(`Identity-erasing candidate alias: ${candidate.id}`);
      }
    }
    const genericMovementTokens = [movement.name, ...(movement.aliases ?? [])]
      .map(normalizeCandidateText)
      .filter(Boolean);
    if (genericMovementTokens.includes(normalizeCandidateText(alias))) {
      throw new Error(`Identity-erasing candidate alias: ${candidate.id}`);
    }
  }
}

const IMPLEMENT_METADATA_EQUIPMENT: ReadonlyMap<string, readonly string[]> = new Map([
  ["barbell", ["barbell"]],
  ["dumbbell", ["dumbbell"]],
  ["kettlebell", ["kettlebell", "kettlebells"]],
  ["cable", ["cable"]],
  ["machine", ["machine"]],
  ["band", ["band", "resistance band"]],
  ["bodyweight", ["bodyweight", "body weight"]],
  ["trap-bar", ["trap bar", "trap-bar"]],
  // A landmine press is anchored to the barbell that is fixed in the landmine.
  ["landmine", ["landmine", "barbell"]],
]);

function assertImplementEquipmentCompatibility(
  equipment: readonly string[],
  modifierIds: readonly string[],
  ruleId: string,
  context: "candidate" | "variant",
): void {
  const implementIds = modifierIds.filter((modifierId) => IMPLEMENT_METADATA_EQUIPMENT.has(modifierId));
  if (implementIds.length === 0) return;
  const expectedEquipment = new Set(
    implementIds.flatMap((modifierId) => IMPLEMENT_METADATA_EQUIPMENT.get(modifierId) ?? []),
  );
  const normalizedExpected = new Set([...expectedEquipment].map(normalizeCandidateText));
  const knownImplementEquipment = new Set(
    [...IMPLEMENT_METADATA_EQUIPMENT.values()].flatMap((values) => values.map(normalizeCandidateText)),
  );
  const actualEquipment = new Set(equipment.map(normalizeCandidateText));
  if (![...actualEquipment].some((value) => normalizedExpected.has(value))) {
    throw new Error(
      `${context === "candidate" ? "Candidate metadata base incompatible with implement" : "Variant metadata base incompatible with implement"}: ${ruleId}`,
    );
  }
  const conflicting = [...actualEquipment]
    .filter((value) => knownImplementEquipment.has(value) && !normalizedExpected.has(value));
  if (conflicting.length > 0) {
    throw new Error(
      `${context === "candidate" ? "Candidate metadata base has conflicting implement equipment" : "Variant metadata base has conflicting implement equipment"}: ${ruleId}`,
    );
  }
}

function candidateMetadata(
  candidate: VariantCandidate,
  metadataById: ReadonlyMap<string, CatalogExercise>,
): CatalogExercise {
  const base = metadataById.get(candidate.metadataFromExerciseId);
  if (!base) throw new Error(`Candidate metadata base missing: ${candidate.metadataFromExerciseId}`);
  const overrides = candidate.metadataOverrides;
  return {
    ...base,
    ...(overrides ?? {}),
    muscles: {
      primary: overrides?.muscles?.primary ?? base.muscles.primary,
      secondary: overrides?.muscles?.secondary ?? base.muscles.secondary,
    },
  };
}

function assertCandidateMetadata(
  candidate: VariantCandidate,
  metadataById: ReadonlyMap<string, CatalogExercise>,
  modifierIds: readonly string[],
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>,
): void {
  const metadata = candidateMetadata(candidate, metadataById);
  const emptyFields = [
    ["equipment", metadata.equipment],
    ["movementPatterns", metadata.movementPatterns],
    ["muscles.primary", metadata.muscles.primary],
    ["muscles.secondary", metadata.muscles.secondary],
    ["tags", metadata.tags],
  ]
    .filter(([, values]) => values.length === 0)
    .map(([field]) => field);
  if (emptyFields.length > 0) {
    throw new Error(
      `Candidate metadata base has empty required fields: ${candidate.metadataFromExerciseId}`,
    );
  }

  const implementIds = modifierIds.filter((modifierId) => modifiersById.get(modifierId)?.category === "implement");
  assertImplementEquipmentCompatibility(metadata.equipment, implementIds, candidate.id, "candidate");
}

export function validateVariantCandidates(
  candidates: readonly VariantCandidate[],
  registries: BuildRegistries,
  metadataById: ReadonlyMap<string, CatalogExercise>,
  requiredMovementIds: readonly string[] = TIER_1_MOVEMENT_IDS,
): void {
  if (candidates.length > 300) throw new Error("Tier-1 candidate cap exceeded");
  const required = new Set(requiredMovementIds);
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const seenMovements = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.status !== "candidate") throw new Error(`Invalid candidate status: ${candidate.id}`);
    if (!required.has(candidate.movementId)) {
      throw new Error(`Candidate movement is not Tier-1: ${candidate.movementId}`);
    }
    if (seenIds.has(candidate.id)) throw new Error(`Duplicate variant candidate ID: ${candidate.id}`);
    seenIds.add(candidate.id);
    if (!metadataById.has(candidate.metadataFromExerciseId)) {
      throw new Error(`Candidate metadata base missing: ${candidate.metadataFromExerciseId}`);
    }
    const movement = registries.movementsById.get(candidate.movementId);
    if (!movement) throw new Error(`Unknown candidate movement: ${candidate.movementId}`);
    const modifierIds = canonicalModifierIds(candidate.movementId, candidate.movementModifierIds, registries);
    assertCandidateMetadata(candidate, metadataById, modifierIds, registries.modifiersById);
    const signature = signatureFor(candidate.movementId, modifierIds);
    if (seenSignatures.has(signature)) throw new Error(`Duplicate candidate signature: ${signature}`);
    seenSignatures.add(signature);
    seenMovements.add(candidate.movementId);
    assertCandidateAliasIdentity(candidate, movement, registries.modifiersById, modifierIds);
  }
  for (const movementId of required) {
    if (!seenMovements.has(movementId)) throw new Error(`Missing Tier-1 candidate family: ${movementId}`);
  }
}

export function validateVariantRule(
  rule: VariantRule,
  registries: BuildRegistries,
  metadataById: ReadonlyMap<string, CatalogExercise>,
): string[] {
  if (rule.status !== "candidate" && rule.status !== "approved") {
    throw new Error(`Invalid variant rule status: ${rule.id}`);
  }
  if (!rule.id.trim()) throw new Error("Variant rule ID missing");
  if (!rule.metadataFromExerciseId.trim()) throw new Error(`Variant metadata base missing: ${rule.id}`);
  const movement = registries.movementsById.get(rule.movementId);
  if (!movement) throw new Error(`Unknown variant movement: ${rule.movementId}`);
  if (!metadataById.has(rule.metadataFromExerciseId)) {
    throw new Error(`Variant metadata base missing: ${rule.metadataFromExerciseId}`);
  }
  const modifierIds = canonicalModifierIds(rule.movementId, rule.movementModifierIds, registries);
  assertCandidateMetadata(rule as VariantCandidate, metadataById, modifierIds, registries.modifiersById);
  assertCandidateAliasIdentity(rule as VariantCandidate, movement, registries.modifiersById, modifierIds);
  return modifierIds;
}

function assertNonEmptyMetadata(exercise: CatalogExercise, ruleId: string): void {
  const emptyFields = [
    ["equipment", exercise.equipment],
    ["movementPatterns", exercise.movementPatterns],
    ["muscles.primary", exercise.muscles.primary],
    ["muscles.secondary", exercise.muscles.secondary],
    ["tags", exercise.tags],
  ]
    .filter(([, values]) => values.length === 0)
    .map(([field]) => field);
  if (emptyFields.length > 0) {
    throw new Error(`Variant metadata has empty required fields: ${ruleId}: ${emptyFields.join(",")}`);
  }
}

export function materializeVariant(
  base: CatalogExercise,
  rule: VariantRule,
): NormalizedCatalogExercise {
  if (base.id !== rule.metadataFromExerciseId) {
    throw new Error(`Variant metadata base mismatch: ${rule.metadataFromExerciseId}`);
  }
  const overrides = rule.metadataOverrides;
  const materialized: NormalizedCatalogExercise = {
    id: rule.id,
    name: base.name,
    // A generated variant may only expose aliases explicitly approved for its
    // identity. Generic source aliases (including prescription language) are
    // not safe to inherit across a narrower signature.
    aliases: [...new Set(rule.approvedAliases)],
    equipment: [...(overrides?.equipment ?? base.equipment)],
    movementPatterns: [...(overrides?.movementPatterns ?? base.movementPatterns)],
    muscles: {
      primary: [...(overrides?.muscles?.primary ?? base.muscles.primary)],
      secondary: [...(overrides?.muscles?.secondary ?? base.muscles.secondary)],
    },
    tags: [...(overrides?.tags ?? base.tags)],
    movementId: rule.movementId,
    movementModifierIds: [...rule.movementModifierIds],
  };
  assertImplementEquipmentCompatibility(materialized.equipment, rule.movementModifierIds, rule.id, "variant");
  assertNonEmptyMetadata(materialized, rule.id);
  return materialized;
}
