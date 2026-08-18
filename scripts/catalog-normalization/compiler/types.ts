export type VersionedArtifact<T> = {
  schemaVersion: 1;
  records: T[];
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
