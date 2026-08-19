import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  AliasClassification,
  Assignment,
  CatalogBuildReport,
  CatalogExercise,
  CompileOptions,
  CompilerCliResult,
  Merge,
  ModifierCategory,
  MovementDefinition,
  MovementModifierDefinition,
  VersionedArtifact,
  VariantCandidate,
  VariantReviewArtifact,
  VariantRule,
  NormalizedCatalogExercise,
  VariantCoverageCount,
} from "./types";
// The runtime's own normalizer, imported rather than reimplemented: a curated
// token is only reachable if it is byte-identical to what `prepareImportName`
// produces, so a second implementation here would rebuild the bug it guards.
import { normalizeExerciseName } from "../../../src/lib/catalog/normalize";
import {
  aliasCandidates,
  countUnclassifiedAliasCollisions,
  findNearDuplicateCandidates,
  validateNormalizedCatalogue,
} from "./normalize";
import {
  idForSignature,
  joinCandidateReviews,
  loadVariantCandidates,
  loadVariantReviews,
  materializeVariant,
  canonicalModifierIds,
  validateAliasOutcomes,
  validateVariantCandidates,
  validateVariantRule,
} from "./validate";

export type { CatalogBuildReport, CompileOptions, CompilerCliResult, VersionedArtifact } from "./types";

export const OUTPUT_FILES = [
  "exercises.generated.json",
  "movements.generated.json",
  "modifiers.generated.json",
  "legacyRedirects.generated.json",
  "importDisambiguations.generated.json",
] as const;
export const REPORT_FILE = "reports/catalog-normalization-report.json" as const;

const SNAPSHOT_FILE = "scripts/catalog-normalization/catalog-v1.snapshot.json";
const DIGEST_FILE = "scripts/catalog-normalization/catalog-v1.sha256";
const CURATION_MANIFESTS = [
  "scripts/catalog-normalization/movements.json",
  "scripts/catalog-normalization/modifiers.json",
  "scripts/catalog-normalization/merges.json",
  "scripts/catalog-normalization/assignments.json",
  "scripts/catalog-normalization/alias-classifications.json",
  "scripts/catalog-normalization/disambiguations.json",
  "scripts/catalog-normalization/variant-rules.json",
  "scripts/catalog-normalization/reviews/variant-candidates.json",
  "scripts/catalog-normalization/reviews/variant-adversarial-review.json",
] as const;

const EMPTY_ARTIFACT = `${JSON.stringify({ schemaVersion: 1, records: [] })}\n`;
const MODIFIER_CATEGORIES = new Set<ModifierCategory>([
  "implement",
  "grip",
  "position",
  "stance",
  "support",
  "range-of-motion",
  "laterality",
  "attachment",
  "execution",
]);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableRecord(value: Record<string, number | string>): Record<string, number | string> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

async function readVersionedArtifact(path: string): Promise<VersionedArtifact<unknown>> {
  const artifact = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!isPlainObject(artifact)) throw new Error(`invalid schema-v1 artifact: ${path}`);
  if (artifact.schemaVersion !== 1 || !Array.isArray(artifact.records)) {
    throw new Error(`invalid schema-v1 artifact: ${path}`);
  }
  return { schemaVersion: 1, records: artifact.records };
}

type ManifestRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is ManifestRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidManifestRecord(kind: string): never {
  throw new Error(`Invalid ${kind} manifest record`);
}

function assertOnlyKeys(record: ManifestRecord, keys: readonly string[], kind: string): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) invalidManifestRecord(kind);
}

function nonEmptyString(value: unknown, kind: string): string {
  if (typeof value !== "string" || !value.trim()) invalidManifestRecord(kind);
  return value;
}

function stringArray(value: unknown, kind: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    invalidManifestRecord(kind);
  }
  return [...value];
}

function nonEmptyStringArray(value: unknown, kind: string): string[] {
  const result = stringArray(value, kind);
  if (result.length === 0) invalidManifestRecord(kind);
  return result;
}

function integer(value: unknown, kind: string): number {
  if (!Number.isSafeInteger(value)) invalidManifestRecord(kind);
  return value as number;
}

function optionalStringArray(
  record: ManifestRecord,
  key: string,
  kind: string,
): string[] | undefined {
  return record[key] === undefined ? undefined : stringArray(record[key], kind);
}

function isModifierCategory(value: unknown): value is ModifierCategory {
  return typeof value === "string" && MODIFIER_CATEGORIES.has(value as ModifierCategory);
}

function manifestRecords(artifact: VersionedArtifact<unknown>, kind: string): ManifestRecord[] {
  return artifact.records.map((record) => {
    if (!isPlainObject(record)) invalidManifestRecord(kind);
    return record;
  });
}

function decodeMovements(artifact: VersionedArtifact<unknown>): MovementDefinition[] {
  return manifestRecords(artifact, "movement").map((record) => {
    assertOnlyKeys(record, [
      "id", "name", "aliases", "sortOrder", "allowedModifierCategories", "allowedModifierIds",
      "maxIdentityModifiers", "displayTemplate",
    ], "movement");
    const categories = stringArray(record.allowedModifierCategories, "movement");
    if (categories.some((category) => !isModifierCategory(category))) invalidManifestRecord("movement");
    return {
      id: nonEmptyString(record.id, "movement"),
      name: nonEmptyString(record.name, "movement"),
      aliases: stringArray(record.aliases, "movement"),
      sortOrder: integer(record.sortOrder, "movement"),
      allowedModifierCategories: categories as ModifierCategory[],
      allowedModifierIds: stringArray(record.allowedModifierIds, "movement"),
      maxIdentityModifiers: integer(record.maxIdentityModifiers, "movement"),
      displayTemplate: nonEmptyString(record.displayTemplate, "movement"),
    };
  });
}

function decodeModifiers(artifact: VersionedArtifact<unknown>): MovementModifierDefinition[] {
  return manifestRecords(artifact, "modifier").map((record) => {
    assertOnlyKeys(record, [
      "id", "name", "aliases", "category", "exclusiveGroup", "identity", "sortOrder", "implies", "excludes",
    ], "modifier");
    if (!isModifierCategory(record.category) || typeof record.identity !== "boolean") {
      invalidManifestRecord("modifier");
    }
    const exclusiveGroup = record.exclusiveGroup === undefined
      ? undefined
      : nonEmptyString(record.exclusiveGroup, "modifier");
    return {
      id: nonEmptyString(record.id, "modifier"),
      name: nonEmptyString(record.name, "modifier"),
      aliases: stringArray(record.aliases, "modifier"),
      category: record.category,
      ...(exclusiveGroup ? { exclusiveGroup } : {}),
      identity: record.identity,
      sortOrder: integer(record.sortOrder, "modifier"),
      ...(record.implies === undefined ? {} : { implies: optionalStringArray(record, "implies", "modifier")! }),
      ...(record.excludes === undefined ? {} : { excludes: optionalStringArray(record, "excludes", "modifier")! }),
    };
  });
}

function decodeMerges(artifact: VersionedArtifact<unknown>): Merge[] {
  return manifestRecords(artifact, "merge").map((record) => {
    assertOnlyKeys(record, ["fromExerciseId", "toExerciseId"], "merge");
    return {
      fromExerciseId: nonEmptyString(record.fromExerciseId, "merge"),
      toExerciseId: nonEmptyString(record.toExerciseId, "merge"),
    };
  });
}

function decodeAssignments(artifact: VersionedArtifact<unknown>): Assignment[] {
  return manifestRecords(artifact, "assignment").map((record) => {
    assertOnlyKeys(record, ["exerciseId", "movementId", "movementModifierIds", "metadataOverrides"], "assignment");
    if (record.movementId !== null && (typeof record.movementId !== "string" || !record.movementId.trim())) {
      invalidManifestRecord("assignment");
    }
    if (record.metadataOverrides !== undefined && !isPlainObject(record.metadataOverrides)) {
      invalidManifestRecord("assignment");
    }
    return {
      exerciseId: nonEmptyString(record.exerciseId, "assignment"),
      movementId: record.movementId,
      movementModifierIds: stringArray(record.movementModifierIds, "assignment"),
      ...(record.metadataOverrides === undefined ? {} : { metadataOverrides: record.metadataOverrides }),
    };
  });
}

function decodeAliasClassifications(artifact: VersionedArtifact<unknown>): AliasClassification[] {
  return manifestRecords(artifact, "alias classification").map((record) => {
    const normalizedToken = nonEmptyString(record.normalizedToken, "alias classification");
    if (record.outcome === "unique") {
      assertOnlyKeys(record, ["normalizedToken", "outcome", "exerciseId"], "alias classification");
      return { normalizedToken, outcome: "unique", exerciseId: nonEmptyString(record.exerciseId, "alias classification") };
    }
    if (record.outcome === "underspecified") {
      assertOnlyKeys(record, ["normalizedToken", "outcome", "movementId", "candidateIds"], "alias classification");
      const candidateIds = stringArray(record.candidateIds, "alias classification");
      if (candidateIds.length === 0) invalidManifestRecord("alias classification");
      return {
        normalizedToken,
        outcome: "underspecified",
        movementId: nonEmptyString(record.movementId, "alias classification"),
        candidateIds,
      };
    }
    if (record.outcome === "removed-noise") {
      assertOnlyKeys(record, ["normalizedToken", "outcome", "reason"], "alias classification");
      return { normalizedToken, outcome: "removed-noise", reason: nonEmptyString(record.reason, "alias classification") };
    }
    return invalidManifestRecord("alias classification");
  });
}

function decodeVariantRules(artifact: VersionedArtifact<unknown>): VariantRule[] {
  return manifestRecords(artifact, "variant rule").map((record) => {
    assertOnlyKeys(record, [
      "id",
      "movementId",
      "movementModifierIds",
      "metadataFromExerciseId",
      "metadataOverrides",
      "approvedAliases",
      "coverageTier",
      "status",
    ], "variant rule");
    if (record.status !== "approved") invalidManifestRecord("variant rule");
    const movementModifierIds = stringArray(record.movementModifierIds, "variant rule");
    if (movementModifierIds.length === 0) invalidManifestRecord("variant rule");
    let metadataOverrides: VariantRule["metadataOverrides"] | undefined;
    if (record.metadataOverrides !== undefined) {
      if (!isPlainObject(record.metadataOverrides) || Object.keys(record.metadataOverrides).length === 0) {
        invalidManifestRecord("variant rule");
      }
      assertOnlyKeys(record.metadataOverrides, ["equipment", "movementPatterns", "muscles", "tags"], "variant rule");
      metadataOverrides = {};
      for (const key of ["equipment", "movementPatterns", "tags"] as const) {
        const value = record.metadataOverrides[key];
        if (value !== undefined) metadataOverrides[key] = nonEmptyStringArray(value, "variant rule");
      }
      if (record.metadataOverrides.muscles !== undefined) {
        const muscles = record.metadataOverrides.muscles;
        if (!isPlainObject(muscles)) invalidManifestRecord("variant rule");
        assertOnlyKeys(muscles, ["primary", "secondary"], "variant rule");
        metadataOverrides.muscles = {
          primary: nonEmptyStringArray(muscles.primary, "variant rule"),
          secondary: nonEmptyStringArray(muscles.secondary, "variant rule"),
        };
      }
      if (Object.keys(metadataOverrides).length === 0) invalidManifestRecord("variant rule");
    }
    return {
      id: nonEmptyString(record.id, "variant rule"),
      movementId: nonEmptyString(record.movementId, "variant rule"),
      movementModifierIds,
      metadataFromExerciseId: nonEmptyString(record.metadataFromExerciseId, "variant rule"),
      ...(metadataOverrides === undefined ? {} : { metadataOverrides }),
      approvedAliases: stringArray(record.approvedAliases, "variant rule"),
      coverageTier: record.coverageTier === 1 || record.coverageTier === 2
        ? record.coverageTier
        : invalidManifestRecord("variant rule"),
      status: "approved" as const,
    };
  });
}

export type DisambiguationRecord =
  | {
      id: string;
      kind: "underspecified-name";
      normalizedName: string;
      movementId: string;
      candidateExerciseIds: string[];
      matchedModifierIds: string[];
    }
  | {
      id: string;
      kind: "non-identity-phrase";
      normalizedPhrase: string;
      annotation: string;
      behavior: "strip" | "paused-duration" | "reject-alternative";
    };

// A token that is not already normalized can never be matched: the runtime
// normalizes the imported name and then looks the token up by exact string, so
// an unnormalized rule ships in the artifact and silently does nothing. That is
// the whole-table BLOCKER's defect class at one-record granularity, so it is a
// build failure rather than a no-op.
function assertNormalizedToken(id: string, token: string): string {
  const normalized = normalizeExerciseName(token);
  if (normalized !== token) {
    throw new Error(
      `disambiguation rule ${id} token is not normalized: "${token}" (expected "${normalized}")`,
    );
  }
  return token;
}

function decodeDisambiguations(artifact: VersionedArtifact<unknown>): DisambiguationRecord[] {
  const seenIds = new Set<string>();
  const seenTokens = new Set<string>();
  return manifestRecords(artifact, "disambiguation").map((record) => {
    const id = nonEmptyString(record.id, "disambiguation");
    if (seenIds.has(id)) invalidManifestRecord("disambiguation");
    seenIds.add(id);
    if (record.kind === "underspecified-name") {
      assertOnlyKeys(record, [
        "id", "kind", "normalizedName", "movementId", "candidateExerciseIds", "matchedModifierIds",
      ], "disambiguation");
      const normalizedName = assertNormalizedToken(id, nonEmptyString(record.normalizedName, "disambiguation"));
      if (seenTokens.has(normalizedName)) invalidManifestRecord("disambiguation");
      seenTokens.add(normalizedName);
      // A token with exactly one outcome is not underspecified: it resolves,
      // and a one-option prompt would be worse than no rule at all.
      const candidateExerciseIds = nonEmptyStringArray(record.candidateExerciseIds, "disambiguation");
      if (candidateExerciseIds.length < 2) invalidManifestRecord("disambiguation");
      return {
        id,
        kind: "underspecified-name" as const,
        normalizedName,
        movementId: nonEmptyString(record.movementId, "disambiguation"),
        candidateExerciseIds,
        matchedModifierIds: stringArray(record.matchedModifierIds, "disambiguation"),
      };
    }
    if (record.kind === "non-identity-phrase") {
      assertOnlyKeys(record, ["id", "kind", "normalizedPhrase", "annotation", "behavior"], "disambiguation");
      const normalizedPhrase = assertNormalizedToken(id, nonEmptyString(record.normalizedPhrase, "disambiguation"));
      if (seenTokens.has(normalizedPhrase)) invalidManifestRecord("disambiguation");
      seenTokens.add(normalizedPhrase);
      const behavior = record.behavior;
      if (behavior !== "strip" && behavior !== "paused-duration" && behavior !== "reject-alternative") {
        invalidManifestRecord("disambiguation");
      }
      return {
        id,
        kind: "non-identity-phrase" as const,
        normalizedPhrase,
        annotation: nonEmptyString(record.annotation, "disambiguation"),
        behavior,
      };
    }
    return invalidManifestRecord("disambiguation");
  });
}

export async function assertSnapshotDigest(snapshotPath: string, digestPath: string): Promise<string> {
  const [snapshot, expected] = await Promise.all([
    readFile(snapshotPath),
    readFile(digestPath, "utf8"),
  ]);
  const actual = sha256(snapshot);
  if (expected.trim() !== actual) {
    throw new Error(`snapshot digest mismatch: expected ${expected.trim()}, received ${actual}`);
  }
  return actual;
}

type CurationArtifacts = {
  hashes: Record<string, string>;
  schemaVersions: Record<string, number>;
  movements: MovementDefinition[];
  modifiers: MovementModifierDefinition[];
  merges: Merge[];
  assignments: Assignment[];
  aliasClassifications: AliasClassification[];
  variantRules: VariantRule[];
  candidates: VariantCandidate[];
  reviews: VariantReviewArtifact;
  disambiguations: DisambiguationRecord[];
};

async function loadCurationManifests(rootDir: string): Promise<CurationArtifacts> {
  const hashes: Record<string, string> = {};
  const schemaVersions: Record<string, number> = {};
  const artifacts = new Map<string, VersionedArtifact<unknown>>();
  for (const relativePath of CURATION_MANIFESTS) {
    const absolutePath = join(rootDir, relativePath);
    const contents = await readFile(absolutePath, "utf8");
    const artifact = await readVersionedArtifact(absolutePath);
    artifacts.set(relativePath, artifact);
    hashes[relativePath] = sha256(contents);
    schemaVersions[relativePath] = artifact.schemaVersion;
  }
  const movements = artifacts.get("scripts/catalog-normalization/movements.json")!;
  const modifiers = artifacts.get("scripts/catalog-normalization/modifiers.json")!;
  const merges = artifacts.get("scripts/catalog-normalization/merges.json")!;
  const assignments = artifacts.get("scripts/catalog-normalization/assignments.json")!;
  const aliasClassifications = artifacts.get("scripts/catalog-normalization/alias-classifications.json")!;
  const variantRules = artifacts.get("scripts/catalog-normalization/variant-rules.json")!;
  const candidates = await loadVariantCandidates(
    join(rootDir, "scripts/catalog-normalization/reviews/variant-candidates.json"),
  );
  const reviews = await loadVariantReviews(
    join(rootDir, "scripts/catalog-normalization/reviews/variant-adversarial-review.json"),
  );
  return {
    hashes: stableRecord(hashes) as Record<string, string>,
    schemaVersions: stableRecord(schemaVersions) as Record<string, number>,
    movements: decodeMovements(movements),
    modifiers: decodeModifiers(modifiers),
    merges: decodeMerges(merges),
    assignments: decodeAssignments(assignments),
    aliasClassifications: decodeAliasClassifications(aliasClassifications),
    variantRules: decodeVariantRules(variantRules),
    candidates: candidates.records,
    reviews,
    disambiguations: decodeDisambiguations(
      artifacts.get("scripts/catalog-normalization/disambiguations.json")!,
    ),
  };
}

function versionedArtifact<T>(records: readonly T[]): string {
  return `${JSON.stringify({ schemaVersion: 1, records }, null, 2)}\n`;
}

function compareById<T extends { id: string }>(left: T, right: T): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "ez") return "EZ";
      if (lower === "rdl") return "RDL";
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function renderVariantName(
  movement: MovementDefinition,
  modifierIds: readonly string[],
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>,
): string {
  const hasHighOrLowBar = modifierIds.includes("high-bar") || modifierIds.includes("low-bar");
  const displayIds = modifierIds.filter((modifierId) => {
    if (hasHighOrLowBar && modifierId === "barbell") return false;
    if (hasHighOrLowBar && modifierId === "back-rack") return false;
    if (modifierId === "hinge" && modifierIds.includes("romanian")) return false;
    return true;
  });
  const displayLabels = displayIds.map((modifierId) => {
    const modifier = modifiersById.get(modifierId);
    if (!modifier) throw new Error(`Unknown modifier: ${modifierId}`);
    if (modifierId === "high-bar") return "High Bar Back";
    if (modifierId === "low-bar") return "Low Bar Back";
    if (modifierId === "back-rack") return "Back";
    if (modifierId === "front-rack") return "Front Rack";
    return modifier.name;
  });
  const displayOrder = new Map([
    ["paused", 1], ["deficit", 2], ["partial", 3], ["strict", 4], ["romanian", 5], ["fly", 6],
    ["high-bar", 10], ["low-bar", 10], ["front-rack", 11], ["back-rack", 12], ["incline", 13],
    ["decline", 13], ["seated", 14], ["overhead", 15], ["chest-supported", 16], ["bench-supported", 17],
    ["single-arm", 20], ["single-leg", 20], ["pronated-grip", 30], ["supinated-grip", 30],
    ["neutral-grip", 30], ["mixed-grip", 30], ["hook-grip", 30], ["rope", 40], ["straight-bar", 40],
    ["ez-bar", 40], ["barbell", 50], ["dumbbell", 50], ["kettlebell", 50], ["cable", 50],
    ["machine", 50], ["band", 50], ["bodyweight", 50], ["trap-bar", 50], ["landmine", 50],
  ]);
  const ordered = displayIds
    .map((modifierId, index) => ({ modifierId, index }))
    .sort((left, right) =>
      (displayOrder.get(left.modifierId) ?? 100) - (displayOrder.get(right.modifierId) ?? 100)
      || left.index - right.index,
    )
    .map(({ modifierId }) => displayLabels[displayIds.indexOf(modifierId)]);
  const rendered = movement.displayTemplate
    .replace("{modifiers}", ordered.join(" "))
    .replace("{movement}", movement.name)
    .replace(/\s+/g, " ")
    .trim();
  return titleCase(rendered);
}

type ReviewedVariantResult = {
  exercises: NormalizedCatalogExercise[];
  approvedRules: VariantRule[];
  coverage: Record<string, VariantCoverageCount>;
  generatedCount: number;
};

function emptyCoverage(): Record<string, VariantCoverageCount> {
  return Object.fromEntries(
    [
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
    ].map((movementId) => [movementId, {
      proposed: 0,
      approved: 0,
      rejected: 0,
      revised: 0,
      colliding: 0,
      unresolved: 0,
    }]),
  ) as Record<string, VariantCoverageCount>;
}

function reviewedVariants(
  normalized: ReturnType<typeof validateNormalizedCatalogue>,
  curation: CurationArtifacts,
  stage: CompileOptions["stage"],
): ReviewedVariantResult {
  const coverage = emptyCoverage();
  if (curation.candidates.length === 0) {
    if (curation.reviews.records.length > 0) {
      throw new Error("empty candidate artifact requires empty review artifact");
    }
    if (curation.variantRules.length > 0) {
      throw new Error("empty candidate artifact requires empty variant-rules manifest");
    }
    return { exercises: normalized.exercises.map((exercise) => ({
      ...exercise,
      aliases: [...exercise.aliases],
      equipment: [...exercise.equipment],
      movementPatterns: [...exercise.movementPatterns],
      muscles: { primary: [...exercise.muscles.primary], secondary: [...exercise.muscles.secondary] },
      tags: [...exercise.tags],
      movementModifierIds: [...exercise.movementModifierIds],
    })), approvedRules: [], coverage, generatedCount: 0 };
  }
  if (stage !== "complete") {
    return { exercises: normalized.exercises.map((exercise) => ({
      ...exercise,
      aliases: [...exercise.aliases],
      equipment: [...exercise.equipment],
      movementPatterns: [...exercise.movementPatterns],
      muscles: { primary: [...exercise.muscles.primary], secondary: [...exercise.muscles.secondary] },
      tags: [...exercise.tags],
      movementModifierIds: [...exercise.movementModifierIds],
    })), approvedRules: [], coverage, generatedCount: 0 };
  }

  const metadataById = new Map<string, CatalogExercise>(
    normalized.exercises.map((exercise) => [exercise.id, exercise]),
  );
  // Candidate validation deliberately remains the first gate: review decisions
  // cannot bless a malformed registry signature or an empty/incompatible base.
  validateVariantCandidates(curation.candidates, normalized.registries, metadataById);
  const joined = joinCandidateReviews(curation.candidates, curation.reviews.records);
  const approvedRules: VariantRule[] = [];
  const seenSignatures = new Set<string>();
  const existingSignatures = new Map<string, string>();
  for (const signature of normalized.registries.signatures) {
    const canonical = signatureForRegistry(signature, normalized.registries);
    if (signature.exerciseId) {
      existingSignatures.set(canonical, signature.exerciseId);
    }
  }

  for (const { candidate, review } of joined) {
    const family = coverage[candidate.movementId] ?? (coverage[candidate.movementId] = {
      proposed: 0, approved: 0, rejected: 0, revised: 0, colliding: 0, unresolved: 0,
    });
    family.proposed += 1;
    if (review.decision === "reject") {
      family.rejected += 1;
      continue;
    }
    if (
      review.decision === "revise"
      && (review.revisedRule?.id !== candidate.id || review.revisedRule.movementId !== candidate.movementId)
    ) {
      throw new Error(`Revised rule identity mismatch: ${candidate.id}`);
    }
    const rule: VariantRule = review.decision === "revise"
      ? { ...review.revisedRule!, status: "approved" }
      : (() => {
        const { rationale: _rationale, ...approvedCandidate } = candidate;
        return { ...approvedCandidate, status: "approved" };
      })();
    const canonicalModifierIds = validateVariantRule(rule, normalized.registries, metadataById);
    const signature = signatureForRegistry({ movementId: rule.movementId, modifierIds: canonicalModifierIds }, normalized.registries);
    if (seenSignatures.has(signature)) {
      family.colliding += 1;
      throw new Error(`Duplicate approved variant signature: ${signature}`);
    }
    seenSignatures.add(signature);
    family.approved += 1;
    if (review.decision === "revise") family.revised += 1;
    approvedRules.push({ ...rule, movementModifierIds: canonicalModifierIds });
  }

  const expectedRules = approvedRules
    .map((rule) => ({ ...rule, status: "approved" as const }))
    .sort(compareById);
  const manifestRules = [...curation.variantRules].sort(compareById);
  if (expectedRules.length > 0 && manifestRules.length === 0) {
    throw new Error("variant-rules.json is missing independently reviewed approvals");
  }
  if (JSON.stringify(manifestRules) !== JSON.stringify(expectedRules)) {
    throw new Error("variant-rules.json does not match independently reviewed approvals");
  }

  const byId = new Map(normalized.exercises.map((exercise) => [exercise.id, exercise]));
  const materialized = normalized.exercises.map((exercise) => ({
    ...exercise,
    aliases: [...exercise.aliases],
    equipment: [...exercise.equipment],
    movementPatterns: [...exercise.movementPatterns],
    muscles: { primary: [...exercise.muscles.primary], secondary: [...exercise.muscles.secondary] },
    tags: [...exercise.tags],
    movementModifierIds: [...exercise.movementModifierIds],
  }));
  const indexes = new Map(materialized.map((exercise, index) => [exercise.id, index]));
  for (const rule of approvedRules) {
    const base = byId.get(rule.metadataFromExerciseId);
    if (!base) throw new Error(`Variant metadata base missing: ${rule.metadataFromExerciseId}`);
    const variant = materializeVariant(base, rule);
    const canonicalSignature = signatureForRegistry({ movementId: rule.movementId, modifierIds: rule.movementModifierIds }, normalized.registries);
    const existingId = existingSignatures.get(canonicalSignature);
    if (existingId) {
      const index = indexes.get(existingId);
      if (index === undefined) throw new Error(`Existing signature target missing: ${existingId}`);
      const existing = materialized[index];
      materialized[index] = {
        ...existing,
        equipment: variant.equipment,
        movementPatterns: variant.movementPatterns,
        muscles: variant.muscles,
        tags: variant.tags,
        // Existing concrete IDs retain their curated aliases. Approved aliases
        // are emitted on genuinely new variant records so a review cannot
        // silently change legacy matching behavior.
        aliases: [...existing.aliases],
        movementId: rule.movementId,
        movementModifierIds: rule.movementModifierIds,
      };
      continue;
    }
    const generatedId = idForSignature(rule.movementId, rule.movementModifierIds);
    if (indexes.has(generatedId)) throw new Error(`Generated variant ID collision: ${generatedId}`);
    const movement = normalized.registries.movementsById.get(rule.movementId)!;
    const generated: NormalizedCatalogExercise = {
      ...variant,
      id: generatedId,
      name: renderVariantName(movement, rule.movementModifierIds, normalized.registries.modifiersById),
      movementModifierIds: [...rule.movementModifierIds],
    };
    indexes.set(generated.id, materialized.length);
    materialized.push(generated);
  }
  materialized.sort(compareById);
  return {
    exercises: materialized,
    approvedRules,
    coverage,
    generatedCount: approvedRules.filter((rule) => !existingSignatures.has(
      signatureForRegistry({ movementId: rule.movementId, modifierIds: rule.movementModifierIds }, normalized.registries),
    )).length,
  };
}

// Keeping these tiny adapters local avoids making the compiler's orchestration
// depend on test-only module paths while preserving one canonical signature
// implementation for validation and materialization.
function signatureForRegistry(
  signature: { movementId: string; modifierIds: string[] },
  registries: ReturnType<typeof validateNormalizedCatalogue>["registries"],
): string {
  const movement = registries.movementsById.get(signature.movementId);
  if (!movement) throw new Error(`Unknown movement: ${signature.movementId}`);
  return [signature.movementId, ...canonicalModifierIds(signature.movementId, signature.modifierIds, registries)].join("|");
}

export async function compileCatalog(options: CompileOptions): Promise<CatalogBuildReport> {
  const snapshotPath = join(options.rootDir, SNAPSHOT_FILE);
  const digestPath = join(options.rootDir, DIGEST_FILE);
  const snapshotSha256 = await assertSnapshotDigest(snapshotPath, digestPath);
  const snapshot = await readFile(snapshotPath, "utf8");
  const records = JSON.parse(snapshot) as unknown;
  if (!Array.isArray(records)) throw new Error(`snapshot must contain an array: ${snapshotPath}`);

  const inputHashes: Record<string, string> = { [SNAPSHOT_FILE]: snapshotSha256 };
  const inputSchemaVersions: Record<string, number> = {};
  const manifests = await loadCurationManifests(options.rootDir);
  Object.assign(inputHashes, manifests.hashes);
  Object.assign(inputSchemaVersions, manifests.schemaVersions);
  const normalized = validateNormalizedCatalogue(records as CatalogExercise[], manifests);
  const nearDuplicateCandidates = findNearDuplicateCandidates(normalized.exercises);
  const reviewed = reviewedVariants(normalized, manifests, options.stage);
  const finalAliasCandidates = aliasCandidates(reviewed.exercises);
  const unclassifiedAliasCollisionCount = countUnclassifiedAliasCollisions(
    finalAliasCandidates,
    normalized.aliasClassifications,
  );
  validateAliasOutcomes(finalAliasCandidates, normalized.aliasClassifications);
  const candidateBytes = await readFile(
    join(options.rootDir, "scripts/catalog-normalization/reviews/variant-candidates.json"),
  );
  const reviewBytes = await readFile(
    join(options.rootDir, "scripts/catalog-normalization/reviews/variant-adversarial-review.json"),
  );
  inputHashes.variantCandidates = sha256(candidateBytes);
  inputHashes.variantAdversarialReview = sha256(reviewBytes);
  inputSchemaVersions.variantCandidates = 1;
  inputSchemaVersions.variantAdversarialReview = 1;

  const isComplete = options.stage === "complete";
  // Empty fixture manifests intentionally exercise the compiler shell without
  // changing the frozen snapshot bytes. A real complete build always has the
  // reviewed candidate artifact and therefore emits normalized metadata.
  const completeExercises = manifests.candidates.length === 0
    ? (records as CatalogExercise[])
    : reviewed.exercises;
  const hasReviewedCandidates = manifests.candidates.length > 0;
  // A disambiguation rule pointing at a nonexistent target is worse than no
  // rule, so real complete builds refuse to ship dangling references.
  if (isComplete && hasReviewedCandidates) {
    const finalExerciseIds = new Set(completeExercises.map((exercise) => exercise.id));
    for (const rule of manifests.disambiguations) {
      if (rule.kind !== "underspecified-name") continue;
      if (!normalized.registries.movementsById.has(rule.movementId)) {
        throw new Error(`disambiguation rule ${rule.id} references unknown movement: ${rule.movementId}`);
      }
      for (const modifierId of rule.matchedModifierIds) {
        if (!normalized.registries.modifiersById.has(modifierId)) {
          throw new Error(`disambiguation rule ${rule.id} references unknown modifier: ${modifierId}`);
        }
      }
      for (const exerciseId of rule.candidateExerciseIds) {
        if (!finalExerciseIds.has(exerciseId)) {
          throw new Error(`disambiguation rule ${rule.id} references unknown exercise: ${exerciseId}`);
        }
      }
    }
  }
  const outputContents: Record<(typeof OUTPUT_FILES)[number], string> = isComplete && hasReviewedCandidates
    ? {
      "exercises.generated.json": `${JSON.stringify(completeExercises, null, 2)}\n`,
      "movements.generated.json": versionedArtifact(
        [...normalized.registries.movementsById.values()].sort((left, right) => left.sortOrder - right.sortOrder),
      ),
      "modifiers.generated.json": versionedArtifact(
        [...normalized.registries.modifiersById.values()].sort((left, right) => left.sortOrder - right.sortOrder),
      ),
      "legacyRedirects.generated.json": versionedArtifact(
        Object.entries(normalized.redirects)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([fromExerciseId, toExerciseId]) => ({ fromExerciseId, toExerciseId })),
      ),
      "importDisambiguations.generated.json": versionedArtifact(manifests.disambiguations),
    }
    : {
      "exercises.generated.json": snapshot,
      "movements.generated.json": EMPTY_ARTIFACT,
      "modifiers.generated.json": EMPTY_ARTIFACT,
      "legacyRedirects.generated.json": EMPTY_ARTIFACT,
      "importDisambiguations.generated.json": EMPTY_ARTIFACT,
    };
  const outputHashes = Object.fromEntries(
    OUTPUT_FILES.map((fileName) => [fileName, sha256(outputContents[fileName])]),
  ) as Record<string, string>;
  const report: CatalogBuildReport = {
    schemaVersion: 1,
    compilerVersion: 1,
    snapshotSha256,
    inputCount: records.length,
    survivingCount: normalized.exercises.length,
    generatedVariantCount: isComplete ? reviewed.generatedCount : 0,
    stageCounts: {
      existing: normalized.exercises.length,
      complete: isComplete ? completeExercises.length : 0,
      variantsProposed: isComplete ? manifests.candidates.length : 0,
      variantsApproved: isComplete ? reviewed.approvedRules.length : 0,
      variantsRejected: isComplete
        ? Object.values(reviewed.coverage).reduce((count, family) => count + family.rejected, 0)
        : 0,
    },
    inputSchemaVersions: stableRecord(inputSchemaVersions) as Record<string, number>,
    inputHashes: stableRecord(inputHashes) as Record<string, string>,
    outputHashes: stableRecord(outputHashes) as Record<string, string>,
    blockingErrors: [],
    unclassifiedAliasCollisionCount,
    redirectChainCount: 0,
    automaticFuzzyMergeCount: nearDuplicateCandidates.filter(
      (candidate) => candidate.disposition === "merged",
    ).length,
    nearDuplicateCandidates,
    variantCoverage: reviewed.coverage,
  };

  await mkdir(options.catalogOutputDir, { recursive: true });
  await Promise.all(
    OUTPUT_FILES.map((fileName) => writeFile(join(options.catalogOutputDir, fileName), outputContents[fileName])),
  );
  await mkdir(resolve(options.reportOutputPath, ".."), { recursive: true });
  await writeFile(options.reportOutputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

type ParsedCli = {
  stage: CompileOptions["stage"];
  mode: "write" | "check-only";
  catalogOutputDir?: string;
  reportOutputPath?: string;
};

function parseCompilerCli(argv: string[]): ParsedCli {
  let stage: CompileOptions["stage"] | undefined;
  let mode: ParsedCli["mode"] | undefined;
  let catalogOutputDir: string | undefined;
  let reportOutputPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--stage") {
      const value = argv[++index];
      if (value !== "existing" && value !== "complete") throw new Error("--stage must be existing or complete");
      stage = value;
    } else if (argument === "--write") {
      if (mode) throw new Error("choose exactly one of --write or --check-only");
      mode = "write";
    } else if (argument === "--check-only") {
      if (mode) throw new Error("choose exactly one of --write or --check-only");
      mode = "check-only";
    } else if (argument === "--catalog-output") {
      catalogOutputDir = argv[++index];
      if (!catalogOutputDir) throw new Error("--catalog-output requires a path");
    } else if (argument === "--report-output") {
      reportOutputPath = argv[++index];
      if (!reportOutputPath) throw new Error("--report-output requires a path");
    } else {
      throw new Error(`unknown compiler argument: ${argument}`);
    }
  }

  if (!stage) throw new Error("--stage is required");
  if (!mode) throw new Error("choose exactly one of --write or --check-only");
  if (mode === "write" && stage !== "complete") throw new Error("--write requires --stage complete");
  return { stage, mode, catalogOutputDir, reportOutputPath };
}

export async function runCompilerCli(argv: string[]): Promise<CompilerCliResult> {
  const parsed = parseCompilerCli(argv);
  const rootDir = process.cwd();
  const reportPath = resolve(rootDir, parsed.reportOutputPath ?? REPORT_FILE);
  if (parsed.mode === "check-only") {
    const catalogOutputDir = await mkdtemp(join(tmpdir(), "catalog-normalization-"));
    await compileCatalog({ rootDir, catalogOutputDir, reportOutputPath: reportPath, stage: parsed.stage });
    return { catalogFilesWritten: 0, reportPath };
  }

  const catalogOutputDir = resolve(rootDir, parsed.catalogOutputDir ?? "src/lib/catalog");
  await compileCatalog({ rootDir, catalogOutputDir, reportOutputPath: reportPath, stage: parsed.stage });
  return { catalogFilesWritten: OUTPUT_FILES.length, reportPath };
}
