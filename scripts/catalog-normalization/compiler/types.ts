export type VersionedArtifact<T> = {
  schemaVersion: 1;
  records: T[];
};

export type ModifierCategory =
  | "implement"
  | "grip"
  | "position"
  | "stance"
  | "support"
  | "range-of-motion"
  | "laterality"
  | "attachment"
  | "execution";

export type MovementDefinition = {
  id: string;
  name: string;
  aliases: string[];
  sortOrder: number;
  allowedModifierCategories: ModifierCategory[];
  allowedModifierIds: string[];
  maxIdentityModifiers: number;
  displayTemplate: string;
};

export type MovementModifierDefinition = {
  id: string;
  name: string;
  aliases: string[];
  category: ModifierCategory;
  exclusiveGroup?: string;
  identity: boolean;
  sortOrder: number;
  implies?: string[];
  excludes?: string[];
};

export type Assignment = {
  exerciseId: string;
  movementId: string | null;
  movementModifierIds: string[];
  metadataOverrides?: Record<string, unknown>;
};

export type AliasClassification =
  | { normalizedToken: string; outcome: "unique"; exerciseId: string }
  | { normalizedToken: string; outcome: "underspecified"; movementId: string; candidateIds: string[] }
  | { normalizedToken: string; outcome: "removed-noise"; reason: string };

export type Merge = {
  fromExerciseId: string;
  toExerciseId: string;
};

export type RegistrySignature = {
  movementId: string;
  modifierIds: string[];
  exerciseId?: string;
};

export type BuildRegistries = {
  movementsById: ReadonlyMap<string, MovementDefinition>;
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>;
  signatures: readonly RegistrySignature[];
};

export type CatalogExercise = {
  id: string;
  name: string;
  aliases: string[];
  equipment: string[];
  movementPatterns: string[];
  muscles: { primary: string[]; secondary: string[] };
  tags: string[];
};

export type NormalizedCatalogExercise = CatalogExercise & {
  movementId: string | null;
  movementModifierIds: string[];
};

export type ValidatedNormalizedCatalogue = {
  exercises: NormalizedCatalogExercise[];
  registries: BuildRegistries;
  redirects: Record<string, string>;
  aliasOutcomes: ReadonlyMap<string, AliasClassification>;
  aliasCandidates: ReadonlyMap<string, string[]>;
};

export type NearDuplicateCandidate = {
  exerciseIdA: string;
  exerciseIdB: string;
  normalizedNameA: string;
  normalizedNameB: string;
  similarity: number;
  disposition: "review-required" | "merged";
};

export type VariantRule = {
  id: string;
  movementId: string;
  movementModifierIds: string[];
  metadataFromExerciseId: string;
  metadataOverrides?: Partial<Pick<CatalogExercise, "equipment" | "movementPatterns" | "muscles" | "tags">>;
  approvedAliases: string[];
  coverageTier: 1 | 2;
  status: "candidate" | "approved" | "rejected";
};

export type VariantCandidate = VariantRule & {
  status: "candidate";
  rationale: string;
};

export type VariantReviewDecision = {
  candidateId: string;
  decision: "approve" | "reject" | "revise";
  reason: string;
  revisedRule?: VariantRule;
};

export type VariantReviewArtifact = VersionedArtifact<VariantReviewDecision>;

export type VariantCoverageCount = {
  proposed: number;
  approved: number;
  rejected: number;
  revised: number;
  colliding: number;
  unresolved: number;
};

export type CatalogBuildReport = {
  schemaVersion: 1;
  compilerVersion: 1;
  snapshotSha256: string;
  inputCount: number;
  survivingCount: number;
  generatedVariantCount: number;
  stageCounts: Record<string, number>;
  inputSchemaVersions: Record<string, number>;
  inputHashes: Record<string, string>;
  outputHashes: Record<string, string>;
  blockingErrors: string[];
  unclassifiedAliasCollisionCount: number;
  redirectChainCount: number;
  automaticFuzzyMergeCount: number;
  nearDuplicateCandidates: NearDuplicateCandidate[];
  variantCoverage: Record<string, VariantCoverageCount>;
};

export type CompileOptions = {
  rootDir: string;
  catalogOutputDir: string;
  reportOutputPath: string;
  stage: "existing" | "complete";
};

export type CompilerCliResult = {
  catalogFilesWritten: number;
  reportPath: string;
};
