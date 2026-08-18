import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  CatalogBuildReport,
  CompileOptions,
  CompilerCliResult,
  VersionedArtifact,
} from "./types";

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
const COMPLETE_MANIFESTS = [
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

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableRecord(value: Record<string, number | string>): Record<string, number | string> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

async function readVersionedArtifact(path: string): Promise<VersionedArtifact<unknown>> {
  const artifact = JSON.parse(await readFile(path, "utf8")) as VersionedArtifact<unknown>;
  if (artifact.schemaVersion !== 1 || !Array.isArray(artifact.records)) {
    throw new Error(`invalid schema-v1 artifact: ${path}`);
  }
  return artifact;
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

async function loadCompleteManifests(rootDir: string): Promise<{
  hashes: Record<string, string>;
  schemaVersions: Record<string, number>;
}> {
  const hashes: Record<string, string> = {};
  const schemaVersions: Record<string, number> = {};
  for (const relativePath of COMPLETE_MANIFESTS) {
    const absolutePath = join(rootDir, relativePath);
    const contents = await readFile(absolutePath, "utf8");
    const artifact = await readVersionedArtifact(absolutePath);
    hashes[relativePath] = sha256(contents);
    schemaVersions[relativePath] = artifact.schemaVersion;
  }
  return {
    hashes: stableRecord(hashes) as Record<string, string>,
    schemaVersions: stableRecord(schemaVersions) as Record<string, number>,
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
  if (options.stage === "complete") {
    const manifests = await loadCompleteManifests(options.rootDir);
    Object.assign(inputHashes, manifests.hashes);
    Object.assign(inputSchemaVersions, manifests.schemaVersions);
  }

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
    survivingCount: records.length,
    generatedVariantCount: 0,
    stageCounts: { existing: records.length, complete: options.stage === "complete" ? records.length : 0 },
    inputSchemaVersions: stableRecord(inputSchemaVersions) as Record<string, number>,
    inputHashes: stableRecord(inputHashes) as Record<string, string>,
    outputHashes: stableRecord(outputHashes) as Record<string, string>,
    blockingErrors: [],
    unclassifiedAliasCollisionCount: 0,
    redirectChainCount: 0,
    automaticFuzzyMergeCount: 0,
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
