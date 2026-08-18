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
} from "./types";
import { findNearDuplicateCandidates, validateNormalizedCatalogue } from "./normalize";

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

function validateUnmodeledManifestRecords(artifact: VersionedArtifact<unknown>, kind: string): void {
  manifestRecords(artifact, kind);
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
  validateUnmodeledManifestRecords(
    artifacts.get("scripts/catalog-normalization/disambiguations.json")!,
    "disambiguation",
  );
  validateUnmodeledManifestRecords(
    artifacts.get("scripts/catalog-normalization/variant-rules.json")!,
    "variant rule",
  );

  return {
    hashes: stableRecord(hashes) as Record<string, string>,
    schemaVersions: stableRecord(schemaVersions) as Record<string, number>,
    movements: decodeMovements(movements),
    modifiers: decodeModifiers(modifiers),
    merges: decodeMerges(merges),
    assignments: decodeAssignments(assignments),
    aliasClassifications: decodeAliasClassifications(aliasClassifications),
  };
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

  const outputContents: Record<(typeof OUTPUT_FILES)[number], string> = {
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
    generatedVariantCount: 0,
    stageCounts: { existing: records.length, complete: options.stage === "complete" ? records.length : 0 },
    inputSchemaVersions: stableRecord(inputSchemaVersions) as Record<string, number>,
    inputHashes: stableRecord(inputHashes) as Record<string, string>,
    outputHashes: stableRecord(outputHashes) as Record<string, string>,
    blockingErrors: [],
    unclassifiedAliasCollisionCount: 0,
    redirectChainCount: 0,
    automaticFuzzyMergeCount: nearDuplicateCandidates.filter(
      (candidate) => candidate.disposition === "merged",
    ).length,
    nearDuplicateCandidates,
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
