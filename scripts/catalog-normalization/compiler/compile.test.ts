import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertSnapshotDigest, compileCatalog, runCompilerCli } from "./core";
import { createCompilerFixtureRoot, runProcess } from "./testFixtures";
import { runIngestion } from "../ingest";

let fixtureRoot: string;
let fixtureReportPath: string;

beforeAll(async () => {
  fixtureRoot = await createCompilerFixtureRoot({ snapshotRecords: 3072 });
  fixtureReportPath = join(fixtureRoot, "cli-report.json");
});

test("accepts the frozen 3,072 records byte-for-byte reproducibly", async () => {
  await assertSnapshotDigest(
    "scripts/catalog-normalization/catalog-v1.snapshot.json",
    "scripts/catalog-normalization/catalog-v1.sha256",
  );
  const a = await mkdtemp(join(tmpdir(), "catalog-a-"));
  const b = await mkdtemp(join(tmpdir(), "catalog-b-"));
  const ra = await compileCatalog({
    rootDir: fixtureRoot,
    catalogOutputDir: a,
    reportOutputPath: join(a, "report.json"),
    stage: "existing",
  });
  const rb = await compileCatalog({
    rootDir: fixtureRoot,
    catalogOutputDir: b,
    reportOutputPath: join(b, "report.json"),
    stage: "existing",
  });

  expect(ra.inputCount).toBe(3072);
  expect(ra.outputHashes).toEqual(rb.outputHashes);
  expect(await readFile(join(a, "exercises.generated.json"), "utf8")).toBe(
    await readFile(join(b, "exercises.generated.json"), "utf8"),
  );
});

test("does not use fetch and protects production output", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("network forbidden");
  }) as unknown as typeof fetch;

  try {
    const out = await mkdtemp(join(tmpdir(), "offline-"));
    await compileCatalog({
      rootDir: fixtureRoot,
      catalogOutputDir: out,
      reportOutputPath: join(out, "report.json"),
      stage: "existing",
    });
    const beforeJson = await readFile("src/lib/catalog/exercises.generated.json", "utf8");
    const beforeWrapper = await readFile("src/lib/catalog/exercises.ts", "utf8");

    await expect(runIngestion(["--output", "src/lib/catalog/exercises.generated.json"]))
      .rejects.toThrow("ingestion output must be inside scripts/catalog-normalization/staging");

    expect(await readFile("src/lib/catalog/exercises.generated.json", "utf8")).toBe(beforeJson);
    expect(await readFile("src/lib/catalog/exercises.ts", "utf8")).toBe(beforeWrapper);
  } finally {
    globalThis.fetch = original;
  }
});

test("CLI grammar makes existing check-only report-only", async () => {
  await expect(runCompilerCli(["--stage", "existing", "--write"])).rejects.toThrow(
    "--write requires --stage complete",
  );

  const result = await runCompilerCli([
    "--stage",
    "existing",
    "--check-only",
    "--report-output",
    fixtureReportPath,
  ]);

  expect(result.catalogFilesWritten).toBe(0);
  expect(result.reportPath).toBe(fixtureReportPath);
});

test("package CLI entrypoints execute", async () => {
  expect(
    (
      await runProcess([
        "bun",
        "scripts/catalog-normalization/compiler/compile.ts",
        "--stage",
        "existing",
        "--check-only",
        "--report-output",
        fixtureReportPath,
      ])
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runProcess([
        "bun",
        "scripts/catalog-normalization/compiler/check.ts",
        "--fixture-root",
        fixtureRoot,
      ])
    ).exitCode,
  ).toBe(0);
});

test("checker accepts the checked-in catalogue output", async () => {
  expect((await runProcess(["bun", "scripts/catalog-normalization/compiler/check.ts"])).exitCode).toBe(0);
});

test("checker rejects a stale checked-in normalization report", async () => {
  const rootDir = await createCompilerFixtureRoot({ snapshotRecords: 1 });
  const reportPath = join(rootDir, "reports/catalog-normalization-report.json");
  await mkdir(join(rootDir, "reports"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ stale: true })}\n`);

  const result = await runProcess([
    "bun",
    "scripts/catalog-normalization/compiler/check.ts",
    "--fixture-root",
    rootDir,
  ]);
  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("catalog normalization report differs");
});

test("empty candidate artifacts require empty reviews and rules", async () => {
  const reviewRoot = await createCompilerFixtureRoot({ snapshotRecords: 1 });
  await writeFile(
    join(reviewRoot, "scripts/catalog-normalization/reviews/variant-adversarial-review.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      records: [{ candidateId: "orphan", decision: "reject", reason: "No candidate exists." }],
    })}\n`,
  );
  await expect(compileCatalog({
    rootDir: reviewRoot,
    catalogOutputDir: join(reviewRoot, "tmp-catalog"),
    reportOutputPath: join(reviewRoot, "tmp-report.json"),
    stage: "complete",
  })).rejects.toThrow("empty candidate artifact requires empty review artifact");

  const ruleRoot = await createCompilerFixtureRoot({ snapshotRecords: 1 });
  await writeFile(
    join(ruleRoot, "scripts/catalog-normalization/variant-rules.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      records: [{
        id: "orphan-rule",
        movementId: "squat",
        movementModifierIds: ["barbell"],
        metadataFromExerciseId: "fixture-0",
        approvedAliases: [],
        coverageTier: 1,
        status: "approved",
      }],
    })}\n`,
  );
  await expect(compileCatalog({
    rootDir: ruleRoot,
    catalogOutputDir: join(ruleRoot, "tmp-catalog"),
    reportOutputPath: join(ruleRoot, "tmp-report.json"),
    stage: "complete",
  })).rejects.toThrow("empty candidate artifact requires empty variant-rules manifest");
});

test("metadata bases do not promote narrower identities into generic variant IDs", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "catalog-exact-signatures-"));
  await compileCatalog({
    rootDir: process.cwd(),
    catalogOutputDir: outputDir,
    reportOutputPath: join(outputDir, "report.json"),
    stage: "complete",
  });
  const exercises = JSON.parse(
    await readFile(join(outputDir, "exercises.generated.json"), "utf8"),
  ) as Array<{ id: string; name: string; aliases: string[]; movementId: string | null; movementModifierIds: string[] }>;
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  expect(byId.get("pull-up-pulldown--machine")?.movementModifierIds).toEqual(["machine"]);
  expect(byId.get("overhead-landmine-press--dumbbell--neutral-grip")?.movementModifierIds).toEqual([
    "dumbbell",
    "neutral-grip",
  ]);
  expect(byId.get("row--band")?.movementModifierIds).toEqual(["band"]);
  expect(byId.get("triceps-extension-pushdown--band--overhead")?.movementModifierIds).toEqual([
    "band",
    "overhead",
  ]);
  expect(byId.get("reverse-grip-machine-lat-pulldown")?.movementId).toBeNull();
  expect(byId.get("dumbbell-seated-shoulder-press-parallel-grip")?.movementId).toBeNull();
  expect(byId.get("resistance-band-seated-straight-back-row")?.movementId).toBeNull();
  expect(byId.get("speed-band-overhead-triceps")?.movementId).toBeNull();
  expect(byId.get("deadlift-hinge--barbell--paused")?.aliases).toEqual(["paused barbell deadlift"]);
  expect(byId.get("loaded-carry--dumbbell--neutral-grip")).toBeUndefined();
  expect(byId.get("barbell-curl")?.movementId).toBe("curl");
  expect(byId.get("curl--barbell")).toBeUndefined();
  expect(byId.get("decline-barbell-bench-press")?.movementId).toBe("bench-press");
  expect(byId.get("bench-press--barbell--decline")).toBeUndefined();
  expect(byId.get("dumbbell-deadlift")?.movementId).toBe("deadlift-hinge");
  expect(byId.get("deadlift-hinge--dumbbell")).toBeUndefined();
  expect(byId.get("farmer-carry")?.aliases).toEqual([
    "farmers carry",
    "farmers walk",
    "farmer walk",
    "farmer's carry",
    "farmer's walk",
    "Farmer Carry with 2-Second March Pauses",
  ]);
  const report = JSON.parse(await readFile(join(outputDir, "report.json"), "utf8")) as {
    unclassifiedAliasCollisionCount: number;
  };
  expect(report.unclassifiedAliasCollisionCount).toBe(0);
});

test.each([
  {
    name: "an alias classification with an unknown outcome",
    fileName: "alias-classifications.json",
    records: [{ normalizedToken: "fixture", outcome: "auto", exerciseId: "fixture-0" }],
    expected: "Invalid alias classification manifest record",
  },
  {
    name: "an assignment without a movement decision",
    fileName: "assignments.json",
    records: [{ exerciseId: "fixture-0", movementModifierIds: [] }],
    expected: "Invalid assignment manifest record",
  },
  {
    name: "a movement with an unknown modifier category",
    fileName: "movements.json",
    records: [{
      id: "fixture-movement",
      name: "Fixture Movement",
      aliases: [],
      sortOrder: 1,
      allowedModifierCategories: ["unsupported-category"],
      allowedModifierIds: [],
      maxIdentityModifiers: 0,
      displayTemplate: "{movement}",
    }],
    expected: "Invalid movement manifest record",
  },
])("rejects $name", async ({ fileName, records, expected }) => {
  const rootDir = await createCompilerFixtureRoot({ snapshotRecords: 1 });
  const outputDir = await mkdtemp(join(tmpdir(), "catalog-invalid-manifest-"));
  await writeFile(
    join(rootDir, "scripts/catalog-normalization", fileName),
    `${JSON.stringify({ schemaVersion: 1, records })}\n`,
  );

  await expect(compileCatalog({
    rootDir,
    catalogOutputDir: outputDir,
    reportOutputPath: join(outputDir, "report.json"),
    stage: "existing",
  })).rejects.toThrow(expected);
});

test("reports near duplicates for review without automatically merging them", async () => {
  const rootDir = await createCompilerFixtureRoot({ snapshotRecords: 1 });
  const outputDir = await mkdtemp(join(tmpdir(), "catalog-near-duplicate-"));
  const snapshot = `${JSON.stringify([
    {
      id: "bench-pres",
      name: "Bench Pres",
      aliases: [],
      equipment: [],
      movementPatterns: [],
      muscles: { primary: [], secondary: [] },
      tags: [],
    },
    {
      id: "bench-press",
      name: "Bench Press",
      aliases: [],
      equipment: [],
      movementPatterns: [],
      muscles: { primary: [], secondary: [] },
      tags: [],
    },
  ], null, 2)}\n`;
  const catalogRoot = join(rootDir, "scripts/catalog-normalization");
  await writeFile(join(catalogRoot, "catalog-v1.snapshot.json"), snapshot);
  await writeFile(
    join(catalogRoot, "catalog-v1.sha256"),
    `${createHash("sha256").update(snapshot).digest("hex")}\n`,
  );

  const report = await compileCatalog({
    rootDir,
    catalogOutputDir: outputDir,
    reportOutputPath: join(outputDir, "report.json"),
    stage: "existing",
  });

  expect(report.automaticFuzzyMergeCount).toBe(0);
  expect(report.nearDuplicateCandidates).toEqual([
    expect.objectContaining({
      exerciseIdA: "bench-pres",
      exerciseIdB: "bench-press",
      similarity: 0.9091,
      disposition: "review-required",
    }),
  ]);
});

test("does not execute an imported entrypoint when its importer has the CLI filename", async () => {
  const runnerRoot = await mkdtemp(join(tmpdir(), "catalog-entrypoint-import-"));
  const sourceRoot = process.cwd();

  for (const entrypoint of ["compile", "check"] as const) {
    const runnerPath = join(runnerRoot, "scripts/catalog-normalization/compiler", `${entrypoint}.ts`);
    await mkdir(join(runnerPath, ".."), { recursive: true });
    await writeFile(
      runnerPath,
      [
        `process.chdir(${JSON.stringify(runnerRoot)});`,
        `await import(${JSON.stringify(resolve(sourceRoot, "scripts/catalog-normalization/compiler", `${entrypoint}.ts`))});`,
      ].join("\n"),
    );

    const result = await runProcess(["bun", runnerPath]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  }
});
