# Exercise Catalogue Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize the exercise catalogue into concrete versions nested beneath movement families, resolve underspecified imports once per repeated name, preserve per-version metrics, and show combined family history with immutable performed labels.

**Architecture:** An offline deterministic compiler turns the frozen v1 catalogue and reviewed curation manifests into exercises, movement/modifier registries, redirects, and import disambiguations. One pure resolver layers those outputs with aliases, custom exercises, and global overrides; import, catalogue, analysis, and history use it through a versioned provider. IndexedDB v10 and backup v2 persist user-owned identity data, while one lossless history projection groups presentation by movement without rewriting logs.

**Tech Stack:** TypeScript 5, React 19, Vite 6, IndexedDB through `idb`, Jest/Testing Library, Bun scripts/tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-exercise-catalog-normalization-design.md`

## Global Constraints

- Create the implementation worktree with `superpowers:using-git-worktrees` from `plan/exercise-normalization`.
- Ordinary builds compile only the frozen 3,072-entry snapshot, without network access; ingestion writes only to `scripts/catalog-normalization/staging/`.
- Add at most 300 approved Tier-1 variants across the 12 specified families; never use a Cartesian product.
- Keep concrete IDs and performance summaries separate for mechanically distinct versions.
- `paused` is one coarse identity; duration, tempo, load, RPE/RIR, pain-free depth, distance, and alternatives are prescriptions, not identities.
- Do not change prompt builder output, the routine JSON schema, or prompt behavior.
- A routine `slotId`/`exerciseId` never enters catalogue-ID or redirect lookup.
- Import choices are local unless `Remember this interpretation` is explicitly enabled.
- Corrections change current grouping but never rewrite performed names, sets, notes, or dates.
- Runtime redirects and v1 backup support expire after September 30, 2026; permanent merge provenance remains.
- Put this exact comment beside runtime redirect use: `// TODO(2026-09-30): remove legacy exercise ID redirects after the compatibility window.`
- Every identity-affecting write dispatches `trainer-exercise-identity-changed` once after commit; bulk writes dispatch once total.
- Use TDD and make a focused commit after each task.

---

### Task 1: Freeze the catalogue and create the offline compiler shell

**Files:**
- Create: `scripts/catalog-normalization/catalog-v1.snapshot.json`
- Create: `scripts/catalog-normalization/catalog-v1.sha256`
- Create: `scripts/catalog-normalization/compiler/types.ts`
- Create: `scripts/catalog-normalization/compiler/compile.ts`
- Create: `scripts/catalog-normalization/compiler/compile.test.ts`
- Create: `scripts/catalog-normalization/compiler/testFixtures.ts`
- Create: `scripts/catalog-normalization/compiler/check.ts`
- Create: `scripts/catalog-normalization/ingest.ts`
- Create: `scripts/catalog-normalization/staging/.gitkeep`
- Modify: `scripts/build-exercise-catalog.mjs`
- Modify: `package.json`
- Modify: `jest.config.js`
- Modify: `tsconfig.test.json`

**Interfaces:**
- Consumes: the current `src/lib/catalog/exercises.generated.json` once.
- Produces: `compileCatalog(options: CompileOptions): Promise<CatalogBuildReport>`, guarded compiler/ingestion CLIs, and a Jest-based script test suite.

- [ ] **Step 1: Freeze the input and write failing reproducibility tests**

```bash
mkdir -p scripts/catalog-normalization/compiler scripts/catalog-normalization/staging
cp src/lib/catalog/exercises.generated.json scripts/catalog-normalization/catalog-v1.snapshot.json
shasum -a 256 scripts/catalog-normalization/catalog-v1.snapshot.json | awk '{print $1}' > scripts/catalog-normalization/catalog-v1.sha256
```

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileCatalog, assertSnapshotDigest } from "./compile";
import { createCompilerFixtureRoot } from "./testFixtures";
import { runIngestion } from "../ingest";
import { runCompilerCli } from "./compile";

let fixtureRoot: string;
let fixtureReportPath: string;
beforeAll(async () => {
  fixtureRoot = await createCompilerFixtureRoot({ snapshotRecords: 3072 });
  fixtureReportPath = join(fixtureRoot, "cli-report.json");
});

test("accepts the frozen 3,072 records byte-for-byte reproducibly", async () => {
  await assertSnapshotDigest("scripts/catalog-normalization/catalog-v1.snapshot.json", "scripts/catalog-normalization/catalog-v1.sha256");
  const a = await mkdtemp(join(tmpdir(), "catalog-a-"));
  const b = await mkdtemp(join(tmpdir(), "catalog-b-"));
  const ra = await compileCatalog({ rootDir: fixtureRoot, catalogOutputDir: a, reportOutputPath: join(a, "report.json"), stage: "existing" });
  const rb = await compileCatalog({ rootDir: fixtureRoot, catalogOutputDir: b, reportOutputPath: join(b, "report.json"), stage: "existing" });
  expect(ra.inputCount).toBe(3072);
  expect(ra.outputHashes).toEqual(rb.outputHashes);
  expect(await readFile(join(a, "exercises.generated.json"), "utf8"))
    .toBe(await readFile(join(b, "exercises.generated.json"), "utf8"));
});

test("does not use fetch and protects production output", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("network forbidden"); }) as typeof fetch;
  try {
    const out = await mkdtemp(join(tmpdir(), "offline-"));
    await compileCatalog({ rootDir: fixtureRoot, catalogOutputDir: out, reportOutputPath: join(out, "report.json"), stage: "existing" });
    const beforeJson = await readFile("src/lib/catalog/exercises.generated.json", "utf8");
    const beforeWrapper = await readFile("src/lib/catalog/exercises.ts", "utf8");
    await expect(runIngestion(["--output", "src/lib/catalog/exercises.generated.json"]))
      .rejects.toThrow("ingestion output must be inside scripts/catalog-normalization/staging");
    expect(await readFile("src/lib/catalog/exercises.generated.json", "utf8")).toBe(beforeJson);
    expect(await readFile("src/lib/catalog/exercises.ts", "utf8")).toBe(beforeWrapper);
  }
  finally { globalThis.fetch = original; }
});
test("CLI grammar makes existing check-only report-only", async () => {
  await expect(runCompilerCli(["--stage", "existing", "--write"])).rejects.toThrow("--write requires --stage complete");
  const result = await runCompilerCli(["--stage", "existing", "--check-only", "--report-output", fixtureReportPath]);
  expect(result.catalogFilesWritten).toBe(0);
  expect(result.reportPath).toBe(fixtureReportPath);
});
test("package CLI entrypoints execute", async () => {
  expect((await runProcess(["bun", "scripts/catalog-normalization/compiler/compile.ts", "--stage", "existing", "--check-only", "--report-output", fixtureReportPath])).exitCode).toBe(0);
  expect((await runProcess(["bun", "scripts/catalog-normalization/compiler/check.ts", "--fixture-root", fixtureRoot])).exitCode).toBe(0);
});
```

- [ ] **Step 2: Verify the missing compiler failure**

Run: `bun run test -- --runInBand scripts/catalog-normalization/compiler/compile.test.ts`

Expected: FAIL because `./compile` is missing.

- [ ] **Step 3: Implement versioned types, hashing, and stable output**

```ts
export type VersionedArtifact<T> = { schemaVersion: 1; records: T[] };
export type CatalogBuildReport = {
  schemaVersion: 1; compilerVersion: 1; snapshotSha256: string;
  inputCount: number; survivingCount: number; generatedVariantCount: number;
  stageCounts: Record<string, number>; inputSchemaVersions: Record<string, number>;
  inputHashes: Record<string, string>;
  outputHashes: Record<string, string>; blockingErrors: string[];
  unclassifiedAliasCollisionCount: number; redirectChainCount: number;
  automaticFuzzyMergeCount: number;
};
export type CompileOptions = {
  rootDir: string; catalogOutputDir: string; reportOutputPath: string;
  stage: "existing" | "complete";
};
export type CompilerCliResult = { catalogFilesWritten: number; reportPath: string };
export async function runCompilerCli(argv: string[]): Promise<CompilerCliResult>;
export const OUTPUT_FILES = ["exercises.generated.json", "movements.generated.json", "modifiers.generated.json", "legacyRedirects.generated.json", "importDisambiguations.generated.json"] as const;
export const REPORT_FILE = "reports/catalog-normalization-report.json" as const;
```

`fixtureRoot` is created in the test with the snapshot/digest and empty schema-v1 manifests, so Task 1 does not depend on Task 2. Sort every set/map. CLI grammar is `--stage existing|complete` plus exactly one of `--write|--check-only`; optional `--catalog-output` and `--report-output` override defaults. `--write` is complete-only and defaults to `src/lib/catalog` plus `reports/catalog-normalization-report.json`. `--check-only` writes no catalogue files, validates the requested stage, and writes its report to `--report-output` or the same default report path. `check.ts` compiles complete inputs to temporary catalogue/report paths and compares all bytes/hashes.

Both executable modules end with guarded entrypoints:

```ts
if (import.meta.main) await runCompilerCli(process.argv.slice(2));
// check.ts uses the same guard around runCatalogCheck(process.argv.slice(2)).
```

```ts
export async function createCompilerFixtureRoot(options: { snapshotRecords: number }): Promise<string>;
export async function runProcess(argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }>;
export async function runIngestion(argv: string[]): Promise<{ jsonPath: string; wrapperPath: string }>;
```

- [ ] **Step 4: Retarget package scripts and run the compiler**

```json
"catalog:build": "bun scripts/catalog-normalization/compiler/compile.ts --stage complete --write",
"catalog:check": "bun scripts/catalog-normalization/compiler/check.ts",
"catalog:test": "jest --runInBand scripts/catalog-normalization/compiler",
"catalog:ingest-sources": "bun scripts/build-exercise-catalog.mjs --output scripts/catalog-normalization/staging/catalog-candidate.json"
```

Move ingestion orchestration into `ingest.ts`; the `.mjs` entry imports and calls it. Resolve `--output` against the repository root and reject unless it is under staging. Derive both JSON and wrapper candidate paths from that validated staging destination; remove both unconditional production destinations. Add `scripts/**/*.ts` to `tsconfig.test.json`; Jest remains the only test runner.

Run: `bun run catalog:test && bun run typecheck`

Expected: PASS; production output remains unchanged. Full complete-stage build/check is deferred to Task 4.

- [ ] **Step 5: Commit**

```bash
git add package.json jest.config.js tsconfig.test.json scripts/build-exercise-catalog.mjs scripts/catalog-normalization
git commit -m "build: freeze exercise catalogue input"
```

### Task 2: Define movement/modifier curation and deterministic deduplication

**Files:**
- Create: `scripts/catalog-normalization/movements.json`
- Create: `scripts/catalog-normalization/modifiers.json`
- Create: `scripts/catalog-normalization/merges.json`
- Create: `scripts/catalog-normalization/assignments.json`
- Create: `scripts/catalog-normalization/alias-classifications.json`
- Create: `scripts/catalog-normalization/disambiguations.json`
- Create: `scripts/catalog-normalization/variant-rules.json`
- Create: `scripts/catalog-normalization/compiler/normalize.ts`
- Create: `scripts/catalog-normalization/compiler/validate.ts`
- Create: `scripts/catalog-normalization/compiler/normalize.test.ts`
- Modify: `scripts/catalog-normalization/compiler/compile.ts`

**Interfaces:**
- Consumes: frozen snapshot and versioned manifests.
- Produces: `canonicalizeModifiers`, `signatureFor`, `flattenMerges`, and a validated normalized catalogue.
- Test helper: `makeModifierRegistryFixture(input: { movementId: string; allowedModifierIds: string[]; modifiers: Array<{ id: string; sortOrder: number; implies?: string[] }> }): BuildRegistries` fills remaining required definition fields with valid defaults.

- [ ] **Step 1: Write failing closure, merge, and collision tests**

```ts
const registries = makeModifierRegistryFixture({
  movementId: "squat", allowedModifierIds: ["barbell", "back-rack", "high-bar"],
  modifiers: [
    { id: "barbell", sortOrder: 1 },
    { id: "back-rack", sortOrder: 2 },
    { id: "high-bar", sortOrder: 3, implies: ["back-rack"] },
  ],
});
test("expands implications in registry order", () => {
  const ids = canonicalizeModifiers("squat", ["high-bar", "barbell"], registries);
  expect(ids).toEqual(["barbell", "back-rack", "high-bar"]);
  expect(signatureFor("squat", ids)).toBe("squat|barbell|back-rack|high-bar");
});
test("flattens redirects", () => {
  expect(flattenMerges({ old: "middle", middle: "current" }, new Set(["current"])))
    .toEqual({ old: "current", middle: "current" });
});
test("rejects unclassified alias collisions", () => {
  expect(() => validateAliasOutcomes(new Map([["row", ["barbell-row", "cable-row"]]]), new Map()))
    .toThrow("Unclassified alias collision: row");
});
test.each(invalidRegistryFixtures())("rejects $name", ({ registries, expected }) => {
  expect(() => validateRegistries(registries)).toThrow(expected);
});
```

`invalidRegistryFixtures()` returns seven complete fixtures: implication cycle → `Modifier implication cycle`; asymmetric exclusion → `Asymmetric exclusion`; closure conflict → `Modifier closure conflict`; shared exclusive group → `Exclusive-group conflict`; exact-ID family allowlist miss → `Modifier not allowed for movement`; `identity: false` signature member → `Non-identity modifier in signature`; family maximum overflow → `Too many identity modifiers`.

- [ ] **Step 2: Run the test and verify missing exports**

Run: `bun run test -- --runInBand scripts/catalog-normalization/compiler/normalize.test.ts`

Expected: FAIL on missing normalization/validation modules.

- [ ] **Step 3: Implement manifest types and fail-fast invariants**

```ts
export type ModifierCategory = "implement" | "grip" | "position" | "stance" | "support" | "range-of-motion" | "laterality" | "attachment" | "execution";
export type MovementDefinition = {
  id: string; name: string; aliases: string[]; sortOrder: number;
  allowedModifierCategories: ModifierCategory[]; allowedModifierIds: string[];
  maxIdentityModifiers: number; displayTemplate: string;
};
export type MovementModifierDefinition = {
  id: string; name: string; aliases: string[]; category: ModifierCategory;
  exclusiveGroup?: string; identity: boolean; sortOrder: number;
  implies?: string[]; excludes?: string[];
};
export type Assignment = { exerciseId: string; movementId: string | null; movementModifierIds: string[]; metadataOverrides?: Record<string, unknown> };
export type AliasClassification =
  | { normalizedToken: string; outcome: "unique"; exerciseId: string }
  | { normalizedToken: string; outcome: "underspecified"; movementId: string; candidateIds: string[] }
  | { normalizedToken: string; outcome: "removed-noise"; reason: string };
```

Reject duplicate IDs/signatures/names, merge conflicts/cycles/missing targets/chains, unknown definitions, bad modifier order/closure/exclusions/exclusive groups/allowlists/maxima, non-identity signatures, and unclassified name/alias collisions. Fuzzy similarity only reports candidates.

- [ ] **Step 4: Curate every blocking compiler finding**

Run `bun scripts/catalog-normalization/compiler/compile.ts --stage existing --check-only`; this stage ignores candidate/review artifacts. For every blocking row add one explicit merge, assignment, or alias-classification decision. Keep composite movements standalone unless exact-ID assigned. Finish only when:

```ts
expect(report.blockingErrors).toEqual([]);
expect(report.unclassifiedAliasCollisionCount).toBe(0);
expect(report.redirectChainCount).toBe(0);
expect(report.automaticFuzzyMergeCount).toBe(0);
```

Run: `bun run test -- --runInBand scripts/catalog-normalization/compiler/normalize.test.ts && bun scripts/catalog-normalization/compiler/compile.ts --stage existing --check-only`

Expected: PASS; unresolved near-duplicates are nonblocking report rows.

- [ ] **Step 5: Commit**

```bash
git add scripts/catalog-normalization reports/catalog-normalization-report.json
git commit -m "feat: curate movement families and catalogue deduplication"
```

### Task 3: Generate Tier-1 candidates with the requested Luna-max subagent

**Files:**
- Create: `scripts/catalog-normalization/reviews/variant-candidates.json`
- Create: `scripts/catalog-normalization/reviews/variant-candidates.schema.json`
- Modify: `scripts/catalog-normalization/compiler/validate.ts`
- Test: `scripts/catalog-normalization/compiler/normalize.test.ts`

**Interfaces:**
- Consumes: snapshot, import fixtures, match tests, movement/modifier registries, assignments.
- Produces: at most 300 schema-valid candidate records across all 12 families.

- [ ] **Step 1: Add the failing artifact test**

```ts
export const TIER_1_MOVEMENT_IDS = ["squat", "bench-press", "deadlift-hinge", "row", "pull-up-pulldown", "overhead-landmine-press", "lunge-split-squat", "push-up", "curl", "triceps-extension-pushdown", "raise-fly", "loaded-carry"] as const;
export type VariantRule = {
  id: string; movementId: string; movementModifierIds: string[];
  metadataFromExerciseId: string;
  metadataOverrides?: Partial<Pick<ExerciseCatalogItem, "equipment" | "movementPatterns" | "muscles" | "tags">>;
  approvedAliases: string[]; coverageTier: 1 | 2;
  status: "candidate" | "approved" | "rejected";
};
export type VariantCandidate = VariantRule & { status: "candidate"; rationale: string };
export async function loadVariantCandidates(path = "scripts/catalog-normalization/reviews/variant-candidates.json"): Promise<VersionedArtifact<VariantCandidate>>;

test("candidate artifact covers Tier-1 and respects the cap", async () => {
  const artifact = await loadVariantCandidates();
  expect(new Set(artifact.records.map((r) => r.movementId))).toEqual(new Set(TIER_1_MOVEMENT_IDS));
  expect(artifact.records.length).toBeLessThanOrEqual(300);
  expect(artifact.records.every((r) => r.status === "candidate" && r.rationale.length >= 20)).toBe(true);
});
```

- [ ] **Step 2: Verify the artifact is missing**

Run: `bun run test -- --runInBand scripts/catalog-normalization/compiler/normalize.test.ts -t "candidate artifact"`

Expected: FAIL because the review artifact is absent.

- [ ] **Step 3: Dispatch a fresh subagent with `model: gpt-5.6-luna`, `reasoning_effort: max`**

```text
Inspect the frozen snapshot, movements, modifiers, assignments, import fixtures,
and match tests. Propose a comprehensive non-Cartesian Tier-1 set of no more
than 300 concrete variants across all required families. Preserve existing
signatures; use paused only coarsely; reject prescription-only distinctions;
select a compatible metadataFromExerciseId; keep aliases identity-preserving;
and provide a concrete rationale. Return schema-valid candidate records and do
not edit variant-rules.json.
```

- [ ] **Step 4: Save the result and validate it mechanically**

Run: `bun run test -- --runInBand scripts/catalog-normalization/compiler/normalize.test.ts -t "candidate artifact"`

Expected: PASS with all families represented, unique signatures, valid metadata bases, and no more than 300 records.

- [ ] **Step 5: Commit**

```bash
git add scripts/catalog-normalization/reviews scripts/catalog-normalization/compiler
git commit -m "data: propose Tier-1 exercise variants"
```

### Task 4: Adversarially review variants and generate runtime artifacts

**Files:**
- Create: `scripts/catalog-normalization/reviews/variant-adversarial-review.json`
- Create: `scripts/catalog-normalization/reviews/variant-adversarial-review.schema.json`
- Modify: `scripts/catalog-normalization/variant-rules.json`
- Modify: `scripts/catalog-normalization/compiler/compile.ts`
- Modify: `scripts/catalog-normalization/compiler/validate.ts`
- Modify: `scripts/catalog-normalization/compiler/normalize.test.ts`
- Generate: `src/lib/catalog/exercises.generated.json`
- Generate: `src/lib/catalog/movements.generated.json`
- Generate: `src/lib/catalog/modifiers.generated.json`
- Generate: `src/lib/catalog/legacyRedirects.generated.json`
- Generate: `src/lib/catalog/importDisambiguations.generated.json`
- Generate: `reports/catalog-normalization-report.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: candidates and all compiler inputs.
- Produces: reviewed approved rules, deterministic runtime artifacts, and family coverage counts.

- [ ] **Step 1: Add failing review-gating tests**

```ts
// compiler/testFixtures.ts
export type CompilerFixtureInput = { candidates?: VariantCandidate[]; reviews?: VariantReviewDecision[]; approvedRule?: VariantRule };
export type CompiledFixture = { exercises: ExerciseCatalogItem[]; bySignature: Map<string, ExerciseCatalogItem> };
export async function compileFixture(input: CompilerFixtureInput): Promise<CompiledFixture>;
const base = { metadataFromExerciseId: "barbell-high-bar-squat", metadataOverrides: undefined, approvedAliases: [], coverageTier: 1 as const };
export const twoSecondPause: VariantCandidate = { ...base, id: "two-second-pause", movementId: "squat", movementModifierIds: ["paused", "two-second"], status: "candidate", rationale: "Reject numeric pause duration as prescription detail." };
export const highBarSquatRule: VariantRule = { ...base, id: "existing-high-bar", movementId: "squat", movementModifierIds: ["barbell", "back-rack", "high-bar"], status: "approved" };
export const newPausedHighBarRule: VariantRule = { ...base, id: "new-paused-high-bar", movementId: "squat", movementModifierIds: ["barbell", "back-rack", "high-bar", "paused"], status: "approved" };
export const highBarCandidate: VariantCandidate = { ...highBarSquatRule, status: "candidate", rationale: "Existing reviewed high-bar squat identity." };
export const approveHighBar: VariantReviewDecision = { candidateId: highBarCandidate.id, decision: "approve", reason: "Mechanically distinct and already represented." };
export const rejectHighBar: VariantReviewDecision = { candidateId: highBarCandidate.id, decision: "reject", reason: "Duplicate decision used to exercise validator." };
export const approvedCableRowRule: VariantRule = { ...base, id: "cable-row-upper-back", movementId: "row", movementModifierIds: ["cable"], metadataFromExerciseId: "cable-row", status: "approved" };
export function exercise(input: { id: string; equipment: string[]; movementPatterns: string[]; primaryMuscles: string[]; tags: string[] }): ExerciseCatalogItem {
  return { id: input.id, name: input.id, aliases: [], equipment: input.equipment, movementPatterns: input.movementPatterns, muscles: { primary: input.primaryMuscles, secondary: [] }, tags: input.tags, movementId: "row", movementModifierIds: ["cable"] };
}

test("emits only independently approved rules", async () => {
  const result = await compileFixture({ candidates: [twoSecondPause], reviews: [{ candidateId: twoSecondPause.id, decision: "reject", reason: "duration is prescription" }] });
  expect(result.exercises.some((e) => e.id === twoSecondPause.id)).toBe(false);
});
test("existing signatures retain existing ids", async () => {
  const result = await compileFixture({ approvedRule: highBarSquatRule });
  expect(result.bySignature.get("squat|barbell|back-rack|high-bar")?.id).toBe("barbell-high-bar-squat");
});
test("new ids and labels derive from signature and movement template", async () => {
  const result = await compileFixture({ approvedRule: newPausedHighBarRule });
  expect(result.bySignature.get("squat|barbell|back-rack|high-bar|paused"))
    .toMatchObject({ id: "squat--barbell--back-rack--high-bar--paused", name: "Paused High Bar Back Squat" });
});
test("requires exactly one independent decision per candidate", () => {
  expect(() => joinCandidateReviews([highBarCandidate], [])).toThrow("missing review decision: existing-high-bar");
  expect(() => joinCandidateReviews([highBarCandidate], [approveHighBar, rejectHighBar])).toThrow("duplicate review decision: existing-high-bar");
});
test("copies base metadata and applies reviewed overrides", () => {
  const baseExercise = exercise({ id: "cable-row", equipment: ["cable"], movementPatterns: ["horizontal-pull"], primaryMuscles: ["back"], tags: ["strength"] });
  const materialized = materializeVariant(baseExercise, { ...approvedCableRowRule, metadataOverrides: { muscles: { primary: ["upper-back"], secondary: ["biceps"] } } });
  expect(materialized).toMatchObject({ equipment: ["cable"], movementPatterns: ["horizontal-pull"], muscles: { primary: ["upper-back"], secondary: ["biceps"] }, tags: ["strength"] });
});
```

- [ ] **Step 2: Verify rules are not yet review-gated**

Run: `bun run test -- --runInBand scripts/catalog-normalization/compiler/normalize.test.ts -t "approved rules|existing signatures|new ids|exactly one"`

Expected: FAIL.

- [ ] **Step 3: Dispatch a different `gpt-5.6-luna` subagent at `max`**

```text
Adversarially review every candidate against the frozen catalogue, constraints,
fixtures, and analysis metadata consumers. Mark each approve, reject, or revise.
Reject nonsense, redundancy, prescription-only identity, identity-erasing aliases,
misleading names, incompatible bases, and unjustified metadata overrides. Verify
representative coverage across all 12 families and provide a specific reason for
every decision. Return the complete versioned review artifact.
```

- [ ] **Step 4: Resolve all decisions and compile approved rules only**

Translate approvals/revisions into `variant-rules.json`; keep rejections in the review artifact. Reject candidate/rejected output, over-300 output, bad metadata bases, unreviewed overrides, identity-erasing aliases, collisions, and unstable output.

```ts
export type VariantReviewDecision = {
  candidateId: string; decision: "approve" | "reject" | "revise";
  reason: string; revisedRule?: VariantRule;
};
export type VariantReviewArtifact = VersionedArtifact<VariantReviewDecision>;
export async function loadVariantReviews(path = "scripts/catalog-normalization/reviews/variant-adversarial-review.json"): Promise<VariantReviewArtifact>;
export function joinCandidateReviews(candidates: VariantCandidate[], reviews: VariantReviewDecision[]): Array<{ candidate: VariantCandidate; review: VariantReviewDecision }>;
export function materializeVariant(base: ExerciseCatalogItem, rule: VariantRule): ExerciseCatalogItem;
export function idForSignature(movementId: string, modifierIds: string[]): string {
  return [movementId, ...modifierIds].join("--");
}
```

The review schema requires top-level `schemaVersion: 1` and records with candidateId/decision/reason plus revisedRule only for revise. Treat candidate `id` as an audit label: existing signatures retain existing IDs; new IDs equal `idForSignature`, and display names equal the movement template renderer. `materializeVariant` copies equipment, movementPatterns, muscles, and tags from `metadataFromExerciseId`, then replaces only fields present in reviewed `metadataOverrides`; it rejects missing/empty/incompatible bases before output. Validate one decision per candidate, revised-rule completeness, alias identity, base compatibility, collisions, and rejected/unreviewed exclusion. Hash the candidate and review artifact bytes into `CatalogBuildReport.inputHashes` under `variantCandidates` and `variantAdversarialReview`. Add `bun run catalog:check` to CI after install and to deploy before build.

Run: `bun run catalog:test && bun run catalog:build && bun run catalog:check`

Expected: PASS; all emitted rules are approved and every family has proposed/approved/rejected counts.

- [ ] **Step 5: Commit**

```bash
git add scripts/catalog-normalization src/lib/catalog/*.generated.json reports/catalog-normalization-report.json .github/workflows/ci.yml .github/workflows/deploy.yml
git commit -m "feat: generate reviewed normalized exercise catalogue"
```

### Task 5: Add the single runtime identity resolver

**Files:**
- Modify: `src/lib/catalog/exercises.ts`
- Create/Test: `src/lib/catalog/registries.ts`, `src/lib/catalog/registries.test.ts`
- Create: `src/lib/catalog/identity.ts`
- Create: `src/lib/catalog/identity.test.ts`
- Create: `src/lib/catalog/identity.testFixtures.ts`
- Modify: `src/lib/catalog/match.ts`
- Modify: `src/lib/catalog/match.test.ts`

**Interfaces:**
- Consumes: generated outputs plus aliases, user exercises, and overrides.
- Produces: `resolveExerciseIdentity(input, context): ExerciseIdentityResult` and tri-state `matchExercise`.

- [ ] **Step 1: Write failing precedence and slot-safety tests**

```ts
// identity.testFixtures.ts
export function makeIdentityContext(overrides: Partial<ExerciseIdentityContext> = {}): ExerciseIdentityContext {
  return { catalogById: new Map(), movementsById: new Map(), modifiersById: new Map(), redirects: new Map(), disambiguations: new Map(), aliases: [], userExercises: [], normalizationOverrides: [], ...overrides };
}
const context = makeIdentityContext({ catalogById: new Map([[highBar.id, highBar]]), movementsById: new Map([[squat.id, squat]]) });
const rememberedContext = makeIdentityContext({ ...context, aliases: [{ id: "a1", alias: "Back Squat", normalizedAlias: "back squat", canonicalExerciseId: highBar.id, provenance: "remembered", createdAt: "2026-08-18T00:00:00.000Z" }] });

test("resolves raw hyphenated ids before name normalization", () => {
  expect(resolveExerciseIdentity({ kind: "catalog-reference", canonicalExerciseId: "barbell-high-bar-squat" }, context))
    .toMatchObject({ concreteExerciseId: "barbell-high-bar-squat", movementId: "squat", specificity: "exact" });
});
test("never treats a slot id as canonical", () => {
  expect(resolveExerciseIdentity({ kind: "stored-exercise", slotId: "barbell-high-bar-squat", performedName: "Mystery lift" }, context))
    .toMatchObject({ concreteExerciseId: undefined, groupKey: "slot:barbell-high-bar-squat" });
});
test("saved alias outranks underspecification", () => {
  expect(resolveExerciseIdentity({ kind: "import-name", name: "back squat" }, rememberedContext))
    .toMatchObject({ concreteExerciseId: "barbell-high-bar-squat", source: "saved-alias" });
});
```

- [ ] **Step 2: Verify the resolver is missing**

Run: `bun run test -- --runInBand src/lib/catalog/identity.test.ts src/lib/catalog/match.test.ts`

Expected: FAIL on missing `identity.ts`.

- [ ] **Step 3: Implement the discriminated contract and precedence**

```ts
export type ExerciseCatalogItem = {
  id: string; name: string; aliases: string[]; equipment: string[];
  movementPatterns: string[]; muscles: { primary: string[]; secondary: string[] };
  tags: string[]; movementId?: string; movementModifierIds: string[];
};
export type ExerciseIdentityInput =
  | { kind: "catalog-reference"; canonicalExerciseId: string }
  | { kind: "stored-exercise"; canonicalExerciseId?: string; slotId: string; performedName?: string }
  | { kind: "custom-exercise"; exerciseId: string; name: string }
  | { kind: "import-name"; name: string };
export type ExerciseIdentityResult = {
  groupKey: string; concreteExerciseId?: string; movementId?: string; movementName?: string;
  movementModifierIds: string[]; movementModifierNames: string[]; displayLabel: string;
  performedName?: string; currentVersionLabel?: string;
  source: "catalog-id" | "legacy-redirect" | "user-override" | "saved-alias" | "legacy-name" | "standalone";
  specificity: "exact" | "underspecified" | "unmatched" | "overridden";
};
export type DisambiguationRule =
  | { id: string; kind: "underspecified-name"; normalizedName: string; movementId: string; candidateExerciseIds: string[]; matchedModifierIds: string[] }
  | { id: string; kind: "non-identity-phrase"; normalizedPhrase: string; annotation: string; behavior: "strip" | "paused-duration" | "reject-alternative" };
export type GeneratedArtifact<T> = { schemaVersion: 1; records: T[] };
export type ModifierCategory = "implement" | "grip" | "position" | "stance" | "support" | "range-of-motion" | "laterality" | "attachment" | "execution";
export type MovementDefinition = { id: string; name: string; aliases: string[]; sortOrder: number; allowedModifierCategories: ModifierCategory[]; allowedModifierIds: string[]; maxIdentityModifiers: number; displayTemplate: string };
export type MovementModifierDefinition = { id: string; name: string; aliases: string[]; category: ModifierCategory; exclusiveGroup?: string; identity: boolean; sortOrder: number; implies?: string[]; excludes?: string[] };
export type ImportDisambiguation = Extract<DisambiguationRule, { kind: "underspecified-name" }>;
export async function loadDisambiguationRules(path = "src/lib/catalog/importDisambiguations.generated.json"): Promise<GeneratedArtifact<DisambiguationRule>>;
export type NormalizationOverrideDocument = {
  id: string; targetKind: "exercise-id" | "normalized-name"; targetValue: string;
  movementId: string | null; movementModifierIds: string[]; updatedAt: string;
};
export type IdentityAlias = AliasDocument & { provenance?: "legacy-auto" | "remembered" };
export type ExerciseIdentityContext = {
  catalogById: ReadonlyMap<string, ExerciseCatalogItem>;
  movementsById: ReadonlyMap<string, MovementDefinition>;
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>;
  redirects: ReadonlyMap<string, string>;
  disambiguations: ReadonlyMap<string, DisambiguationRule>;
  aliases: readonly IdentityAlias[];
  userExercises: readonly UserExerciseDocument[];
  normalizationOverrides: readonly NormalizationOverrideDocument[];
};
export type ExerciseIdentityResolver = (input: ExerciseIdentityInput) => ExerciseIdentityResult;
export function resolveExerciseIdentity(input: ExerciseIdentityInput, context: ExerciseIdentityContext): ExerciseIdentityResult;
export const movementDefinitions: readonly MovementDefinition[];
export const movementModifierDefinitions: readonly MovementModifierDefinition[];
export const movementsById: ReadonlyMap<string, MovementDefinition>;
export const modifiersById: ReadonlyMap<string, MovementModifierDefinition>;
```

`registries.ts` imports movement, modifier, and import-disambiguation generated JSON, asserts schema version at module load, exports typed arrays/maps/rules, and is used by the resolver/provider context factory. `exercises.ts` continues exporting concrete entries but re-exports registry types.

Use the spec precedence. Put the exact dated comment from Global Constraints immediately above redirect lookup. A normalized-name override can classify without a concrete ID.

- [ ] **Step 4: Update the matcher and run focused tests**

```ts
export type MatchVia = "canonical" | "alias" | "normalized" | "user-alias" | "user-exercise";
export type MatchResult =
  | { kind: "matched"; item: ExerciseCatalogItem; via: MatchVia }
  | { kind: "underspecified"; movementId: string; candidates: ExerciseSuggestion[]; matchedModifierIds: string[]; nonIdentityAnnotations: string[] }
  | { kind: "unmatched"; suggestions: ExerciseSuggestion[]; nonIdentityAnnotations: string[] };
```

Run: `bun run test -- --runInBand src/lib/catalog/registries.test.ts src/lib/catalog/identity.test.ts src/lib/catalog/match.test.ts`

Expected: PASS for direct IDs, redirects, alias precedence, numeric pause canonicalization, unresolved `or`, and standalone fallback.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog
git commit -m "feat: centralize exercise identity resolution"
```

### Task 6: Persist overrides, provenance, and the IndexedDB v10 migration

**Files:**
- Modify: `src/lib/programs/types.ts`
- Modify/Test: `src/lib/storage/appDb.ts`, `src/lib/storage/appDb.test.ts`
- Create: `src/lib/storage/appDb.testFixtures.ts`
- Modify/Test: `src/lib/storage/aliasRepo.ts`, `src/lib/storage/aliasRepo.test.ts`
- Modify: `src/lib/storage/userExerciseRepo.ts`
- Create/Test: `src/lib/storage/normalizationOverrideRepo.ts`, `src/lib/storage/normalizationOverrideRepo.test.ts`
- Create: `src/lib/catalog/identityEvents.ts`
- Modify/Test: `src/lib/backup/backup.ts`, `src/lib/backup/backup.test.ts`
- Delete: `src/lib/storage/metricsRepo.ts`, `src/lib/storage/metricsRepo.test.ts`

**Interfaces:**
- Consumes: Task 5 redirect canonicalizer and registry validators.
- Produces: DB v10, `NormalizationOverrideDocument`, alias provenance, bulk-safe repository APIs, and `dispatchExerciseIdentityChanged()`.

- [ ] **Step 1: Write failing migration/repository tests**

```ts
// appDb.testFixtures.ts
export type SeededV9 = { slotId: string; sets: WorkoutSetLog[] };
export async function seedVersion9Database(fixture: V9Fixture): Promise<SeededV9>;
export async function openCurrentDatabase(): Promise<void> { await getDb(); }
export const v9Fixture: V9Fixture = makeV9Fixture({
  programCanonicalId: "removed-squat-id", logCanonicalId: "removed-squat-id",
  weekVariantCanonicalId: "removed-squat-id", overrideReplacementCanonicalId: "removed-squat-id",
  warningSuggestionIds: ["removed-squat-id", "unknown-catalog-id"],
  unknownCanonicalId: "unknown-catalog-id",
  uniqueNameOnly: "High Bar Back Squat", ambiguousNameOnly: "Back Squat", unknownNameOnly: "Mystery lift",
  aliases: [
    { alias: "RDL", canonicalExerciseId: "romanian-deadlift" },
    { alias: "Back Squat", canonicalExerciseId: "barbell-back-squat" },
    { alias: "3x8 @ RPE 7", canonicalExerciseId: "barbell-back-squat" },
    { alias: "My high bar", canonicalExerciseId: "barbell-high-bar-squat", provenance: "remembered" },
  ],
});

test("v10 rewrites canonical references, preserves slot ids, and deletes metrics", async () => {
  const before = await seedVersion9Database(v9Fixture);
  await openCurrentDatabase();
  expect((await programRepo.get("p1"))!.days[0].sections[0].groups[0].exercises[0])
    .toMatchObject({ id: before.slotId, canonicalExerciseId: "surviving-squat-id" });
  expect((await logRepo.get("l1"))!.entries[0])
    .toMatchObject({ exerciseId: before.slotId, canonicalExerciseId: "surviving-squat-id", sets: before.sets });
  expect((await getDb()).objectStoreNames.contains("metrics")).toBe(false);
  expect(await readCanonicalReferences("p1")).toEqual({
    base: "surviving-squat-id", weekVariant: "surviving-squat-id",
    overrideReplacement: "surviving-squat-id", log: "surviving-squat-id",
    warningSuggestionIds: ["surviving-squat-id", "unknown-catalog-id"],
    unknown: "unknown-catalog-id",
  });
});
test("backfills only unique name matches", async () => {
  await seedVersion9Database(v9Fixture); await openCurrentDatabase();
  expect(await readCanonicalIdForName("High Bar Back Squat")).toBe("barbell-high-bar-squat");
  expect(await readCanonicalIdForName("Back Squat")).toBeUndefined();
  expect(await readCanonicalIdForName("Mystery lift")).toBeUndefined();
});
test("normalizes deterministic override keys", async () => {
  const saved = await normalizationOverrideRepo.save({ targetKind: "normalized-name", targetValue: " Hatfield Squat ", movementId: "squat", movementModifierIds: ["barbell"] });
  expect(saved.id).toBe("normalized-name:hatfield squat");
});
test("dispatches once after a multi-alias transaction commits", async () => {
  const listener = jest.fn(); window.addEventListener("trainer-exercise-identity-changed", listener);
  await aliasRepo.saveMany([
    { alias: "Back Squat", canonicalExerciseId: "barbell-high-bar-squat", provenance: "remembered" },
    { alias: "RDL", canonicalExerciseId: "romanian-deadlift", provenance: "remembered" },
  ]);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(await aliasRepo.find("RDL")).toBeDefined();
});
test("classifies legacy aliases without deleting remembered aliases", async () => {
  await seedVersion9Database(v9Fixture); await openCurrentDatabase();
  expect(await aliasRepo.find("RDL")).toMatchObject({ provenance: "legacy-auto" });
  expect(await aliasRepo.find("Back Squat")).toBeUndefined();
  expect(await aliasRepo.find("3x8 @ RPE 7")).toBeUndefined();
  expect(await aliasRepo.find("My high bar")).toMatchObject({ provenance: "remembered" });
});
test.each(invalidOverrideInputs())("rejects override: $name", async ({ input, expected }) => {
  await expect(normalizationOverrideRepo.save(input)).rejects.toThrow(expected);
});
test("a second migration pass is a byte-for-byte no-op", async () => {
  await seedVersion9Database(v9Fixture); await openCurrentDatabase();
  const once = await snapshotNormalizedStores();
  resetDbConnection(); await openCurrentDatabase();
  expect(await snapshotNormalizedStores()).toEqual(once);
});
```

`invalidOverrideInputs()` covers unknown movement, unknown modifier, noncanonical order, missing implication, exclusion conflict, exclusive-group conflict, exact allowlist miss, family maximum, and null movement with nonempty modifiers.

`readCanonicalReferences(programId)` reads the base exercise, supported week variant, override replacement, log entry, existing `ImportWarning.suggestions[].exerciseId`, and unknown-ID fixture. `snapshotNormalizedStores()` returns stable JSON for programs/logs/aliases/overrides. The fixture stores nontrivial sets, notes, performed dates, and slot IDs, and the test compares those fields to the pre-upgrade values as well as the canonical-reference object.

- [ ] **Step 2: Verify schema failures**

Run: `bun run test -- --runInBand src/lib/storage/appDb.test.ts src/lib/storage/aliasRepo.test.ts src/lib/storage/normalizationOverrideRepo.test.ts`

Expected: FAIL because v10 and the override store do not exist.

- [ ] **Step 3: Add types, validation, repositories, and the event**

```ts
export type AliasDocument = { id: ID; alias: string; normalizedAlias: string; canonicalExerciseId: ID; provenance: "legacy-auto" | "remembered"; createdAt: ISODate };
export const DB_VERSION = 10;
export interface TrainerDb extends DBSchema {
  normalizationOverrides: { key: string; value: NormalizationOverrideDocument };
}
export function normalizationOverrideKey(targetKind: NormalizationOverrideDocument["targetKind"], targetValue: string): string {
  const normalized = targetKind === "normalized-name" ? normalizeExerciseName(targetValue) : targetValue.trim();
  return `${targetKind}:${normalized}`;
}
export function dispatchExerciseIdentityChanged(): void {
  window.dispatchEvent(new CustomEvent("trainer-exercise-identity-changed"));
}
export type IdentityWriteOptions = { dispatch?: boolean };
export type RememberedAliasInput = { alias: string; canonicalExerciseId: string; provenance: "remembered" };
export type LegacyAliasInput = Omit<AliasDocument, "provenance"> & { provenance?: "legacy-auto" };
export type NormalizationOverrideSaveInput = Omit<NormalizationOverrideDocument, "id" | "updatedAt">;
export type AliasRepository = {
  list(): Promise<AliasDocument[]>;
  find(alias: string): Promise<AliasDocument | undefined>;
  save(input: RememberedAliasInput, options?: IdentityWriteOptions): Promise<void>;
  saveMany(inputs: RememberedAliasInput[], options?: IdentityWriteOptions): Promise<void>;
  putRaw(input: AliasDocument | LegacyAliasInput, options?: IdentityWriteOptions): Promise<void>;
  replaceRemembered(input: RememberedAliasInput, options?: IdentityWriteOptions): Promise<void>;
  removeMany(ids: string[], options?: IdentityWriteOptions): Promise<void>;
};
export type UserExerciseRepository = {
  list(): Promise<UserExerciseDocument[]>;
  get(id: string): Promise<UserExerciseDocument | undefined>;
  save(name: string, options?: IdentityWriteOptions): Promise<UserExerciseDocument>;
  remove(id: string, options?: IdentityWriteOptions): Promise<void>;
};
export type NormalizationOverrideRepository = {
  list(): Promise<NormalizationOverrideDocument[]>;
  get(id: string): Promise<NormalizationOverrideDocument | undefined>;
  save(input: NormalizationOverrideSaveInput, options?: IdentityWriteOptions): Promise<NormalizationOverrideDocument>;
  remove(id: string, options?: IdentityWriteOptions): Promise<void>;
};
```

In `upgrade`, `if (oldVersion < 10)` creates `normalizationOverrides` with `{ keyPath: "id" }`, performs the backfill in the same upgrade transaction, then calls `db.deleteObjectStore("metrics")` only when present. `TrainerDb` removes the `metrics` member. Override save uses `normalizationOverrideKey` for both `id` and uniqueness.

Override save validates target existence, exact allowed IDs, order, implication closure, exclusions, exclusive groups, and family maximum; null requires an empty modifier list. Alias save requires provenance and rejects a different existing target rather than overwriting it. Migration/restore use `putRaw` to preserve IDs and assign `legacy-auto`. The correction surface alone may call `replaceRemembered`, which deliberately deletes the occupied normalized token and inserts the new remembered target in one transaction. `saveMany`/`removeMany`/`replaceRemembered` dispatch once after `tx.done`; single-item methods delegate to bulk paths. User-exercise save/remove dispatch after commit.

- [ ] **Step 4: Implement and verify the idempotent v10 transaction**

Traverse base days, supported week variants, override replacement days, logs, aliases, and existing warning suggestion exercise IDs. Redirect supplied canonical IDs. For name-only program/log entries, call the resolver and populate only a unique exact concrete result; leave underspecified/unknown names visible and unset. Preserve slot IDs/performance fields; purge ambiguous/noisy legacy aliases; mark retained aliases `legacy-auto`; delete `metrics`; dispatch once after completion. In the same task remove `metrics` from the restore transaction/store-clearing list in `backup.ts` so the committed migration remains restore-safe before backup v2 lands; `resetWorkspace` itself continues deleting the whole database.

Run: `bun run test -- --runInBand src/lib/storage src/lib/backup/backup.test.ts`

Expected: PASS, including a second open with no changes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/programs/types.ts src/lib/storage src/lib/catalog/identityEvents.ts src/lib/backup/backup.ts src/lib/backup/backup.test.ts
git commit -m "feat: migrate persisted exercise identities"
```

### Task 7: Add backup v2 and temporary v1 restoration

**Files:**
- Modify: `src/lib/programs/types.ts`
- Modify/Test: `src/lib/backup/backup.ts`, `src/lib/backup/backup.test.ts`

**Interfaces:**
- Consumes: v10 stores, redirect canonicalizer, alias provenance, override validation.
- Produces: `BackupDocumentV2`, v2 export/atomic restore, and v1 compatibility during the window.

- [ ] **Step 1: Write failing round-trip/rejection tests**

```ts
const validOverride: NormalizationOverrideDocument = {
  id: "normalized-name:hatfield squat", targetKind: "normalized-name", targetValue: "hatfield squat",
  movementId: "squat", movementModifierIds: ["barbell"], updatedAt: "2026-08-18T00:00:00.000Z",
};
const originalPrograms: ProgramDocument[] = [makeMinimalProgram("original")];
const v2Backup: BackupDocumentV2 = makeBackupV2({ programs: originalPrograms, normalizationOverrides: [validOverride] });
const legacyAlias = (alias: string, canonicalExerciseId: string): LegacyAliasDocument => ({ id: `legacy:${alias}`, alias, normalizedAlias: normalizeExerciseName(alias), canonicalExerciseId, createdAt: "2026-08-18T00:00:00.000Z" });
export function makeBackupV1(overrides: Partial<BackupDocumentV1>): BackupDocumentV1;
export function makeBackupV2(overrides: Partial<BackupDocumentV2>): BackupDocumentV2;

test("round-trips overrides and provenance in v2", async () => {
  const exported = await exportBackup();
  expect(exported).toMatchObject({ version: 2, normalizationOverrides: [validOverride] });
  await resetWorkspace(); await restoreBackup(exported);
  expect(await normalizationOverrideRepo.list()).toEqual([validOverride]);
});
test("rejects duplicate override targets before clearing stores", async () => {
  await expect(restoreBackup({ ...v2Backup, normalizationOverrides: [validOverride, { ...validOverride, movementModifierIds: [] }] }))
    .rejects.toThrow("duplicate normalization override target");
  expect(await programRepo.list()).toEqual(originalPrograms);
});
test("v1 restore retains unique legacy aliases and purges ambiguous/noisy ones", async () => {
  const v1 = makeBackupV1({ aliases: [legacyAlias("RDL", "romanian-deadlift"), legacyAlias("Back Squat", "barbell-back-squat"), legacyAlias("3x8 @ RPE 7", "barbell-back-squat")] });
  await restoreBackup(v1);
  expect(await aliasRepo.find("RDL")).toMatchObject({ provenance: "legacy-auto" });
  expect(await aliasRepo.find("Back Squat")).toBeUndefined();
  expect(await aliasRepo.find("3x8 @ RPE 7")).toBeUndefined();
});
```

- [ ] **Step 2: Verify exports are still v1**

Run: `bun run test -- --runInBand src/lib/backup/backup.test.ts`

Expected: FAIL on version and missing override data.

- [ ] **Step 3: Implement the versioned union and atomic v2 path**

```ts
export type LegacyAliasDocument = Omit<AliasDocument, "provenance">;
export type BackupDocumentV1 = {
  version: 1; exportedAt: ISODate; profile?: ProfileDocument;
  programs: ProgramDocument[]; logs: WorkoutLogDocument[]; aliases: LegacyAliasDocument[];
  userExercises?: UserExerciseDocument[]; bodyweight?: BodyweightEntry[]; promptPresets?: PromptPresetDocument[];
};
export type BackupDocumentV2 = Omit<BackupDocumentV1, "version" | "aliases"> & {
  version: 2; aliases: AliasDocument[]; normalizationOverrides: NormalizationOverrideDocument[];
};
export type BackupDocument = BackupDocumentV1 | BackupDocumentV2;
```

Export all user stores in one readonly transaction whose store list includes `normalizationOverrides`. The restore readwrite transaction includes the same store and clears/puts it with the other user stores. Validate override uniqueness/shape/compatibility and alias provenance before that transaction. Restore atomically and dispatch one identity event after commit.

- [ ] **Step 4: Implement temporary v1 restore and verify**

For v1, rewrite known IDs through the same redirect function, classify/purge aliases as `legacy-auto`, and default overrides to `[]`. Reject future versions rather than discarding fields.

Run: `bun run test -- --runInBand src/lib/backup/backup.test.ts src/lib/storage/appDb.test.ts`

Expected: PASS for v1 migration, v2 round-trip, future rejection, duplicates, and already-normalized IDs.

- [ ] **Step 5: Commit**

```bash
git add src/lib/programs/types.ts src/lib/backup
git commit -m "feat: include exercise normalization in backups"
```

### Task 8: Group underspecified and unmatched import occurrences

**Files:**
- Modify: `src/lib/programs/types.ts`
- Modify/Test: `src/lib/import/parser.ts`, `src/lib/import/parser.test.ts`
- Modify/Test: `src/lib/import/resolution.ts`, `src/lib/import/resolution.test.ts`
- Create: `src/lib/import/resolution.testFixtures.ts`
- Modify: `src/lib/import/paths.ts`
- Create: `src/lib/import/__fixtures__/eight-back-squats.json`

**Interfaces:**
- Consumes: tri-state matcher and existing authoritative path/name guards.
- Produces: typed warning metadata, `ResolutionOccurrence`, `ResolutionGroup`, `groupResolutionOccurrences`, and fan-out resolutions.

- [ ] **Step 1: Write failing grouping/fan-out tests**

```ts
// resolution.testFixtures.ts
export function makeEightBackSquatReview(): { review: ImportReview; expectedEightPaths: string[] };
export function collectNamed(program: ProgramDocument, name: string): ProgramExercise[];
export function resolutionsForGroup(group: ResolutionGroup, canonicalId: string): Resolution[] {
  return group.occurrences.map(({ path }) => ({ path, canonicalId }));
}
const { review, expectedEightPaths } = makeEightBackSquatReview();
const program = review.program;
const group = groupResolutionOccurrences(review.warnings)[0];

test("groups eight repeated back squats", () => {
  const groups = groupResolutionOccurrences(review.warnings);
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ normalizedRawName: "back squat", kind: "underspecified", occurrenceCount: 8, remember: false });
  expect(groups[0].occurrences.map((o) => o.path)).toEqual(expectedEightPaths);
});
test("fans one choice out without crossing name guards", () => {
  const result = applyResolutions(program, resolutionsForGroup(group, "barbell-high-bar-squat"));
  expect(collectNamed(result, "Back Squat").map((e) => e.canonicalExerciseId)).toEqual(Array(8).fill("barbell-high-bar-squat"));
  expect(collectNamed(result, "Front Squat").every((e) => e.canonicalExerciseId !== "barbell-high-bar-squat")).toBe(true);
});
```

- [ ] **Step 2: Verify warnings remain occurrence-local**

Run: `bun run test -- --runInBand src/lib/import/parser.test.ts src/lib/import/resolution.test.ts`

Expected: FAIL because `ResolutionGroup` is absent.

- [ ] **Step 3: Extend warning/group contracts and implement grouping**

```ts
export type ImportWarning = {
  path: string; rawName?: string; message: string; suggestions?: ExerciseSuggestion[]; sectionType?: string;
  resolutionKind?: "underspecified" | "unmatched"; candidateExerciseIds?: string[];
  matchedModifierIds?: string[]; nonIdentityAnnotations?: string[];
};
export type ResolutionOccurrence = {
  path: string; rawName: string; kind: "underspecified" | "unmatched";
  candidates: ExerciseSuggestion[];
};
export type ResolutionGroup = {
  groupKey: string; normalizedRawName: string; kind: "underspecified" | "unmatched";
  occurrences: ResolutionOccurrence[]; occurrenceCount: number; remember: boolean;
};
```

Group by `${kind}:${normalizeExerciseName(rawName)}`. Preserve all paths. Exclude unsupported nested override variants and preserve their structural warning. Duplicate-day/path ambiguity blocks finalization.

- [ ] **Step 4: Remove fuzzy auto-selection and verify phrase rules**

Do not auto-select underspecified/fuzzy candidates from the old `0.65` threshold. Strip reviewed prescription phrases only for matching; preserve stored names. Canonicalize numeric pauses to `paused`; keep `or` alternatives unresolved.

Run: `bun run test -- --runInBand src/lib/import`

Expected: PASS for exact bypass, eight-way fan-out, separate resolution, name guards, paused canonicalization, and alternatives.

- [ ] **Step 5: Commit**

```bash
git add src/lib/programs/types.ts src/lib/import
git commit -m "feat: group ambiguous exercise imports"
```

### Task 9: Make import choices local by default

**Files:**
- Modify/Test: `src/components/import/ImportClient.tsx`, `src/components/import/ImportClient.test.tsx`
- Modify: `src/components/import/ResolutionStep.tsx`
- Create: `src/components/import/ResolutionStep.test.tsx`
- Modify: `src/lib/import/resolution.ts`, `src/lib/storage/aliasRepo.ts`
- Test: `e2e/program-import.spec.ts`

**Interfaces:**
- Consumes: grouped occurrences and conflict-safe alias storage.
- Produces: grouped choice UI, occurrence escape hatch, `rememberedAliasInputs(groups, resolutions): RememberedAliasInput[]`, and one `aliasRepo.saveMany` call.

- [ ] **Step 1: Write failing interactions**

```tsx
import fixture from "@/lib/import/__fixtures__/eight-back-squats.json";

it("shows one eight-use choice and does not remember by default", async () => {
  const user = userEvent.setup(); render(<ImportClient />);
  await user.type(screen.getByRole("textbox"), JSON.stringify(fixture));
  await user.click(screen.getByRole("button", { name: "Validate →" }));
  expect(screen.getByText(/Back Squat.*used 8 times/i)).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Choose version for Back Squat"), "barbell-high-bar-squat");
  await user.click(screen.getByRole("button", { name: /save routine/i }));
  expect(aliasRepo.saveMany).not.toHaveBeenCalled();
});
it("persists only an explicit Remember choice", async () => {
  const user = userEvent.setup(); render(<ImportClient />);
  await user.type(screen.getByRole("textbox"), JSON.stringify(fixture));
  await user.click(screen.getByRole("button", { name: "Validate →" }));
  await user.selectOptions(screen.getByLabelText("Choose version for Back Squat"), "barbell-low-bar-squat");
  await user.click(screen.getByRole("checkbox", { name: "Remember this interpretation" }));
  await user.click(screen.getByRole("button", { name: /save routine/i }));
  expect(aliasRepo.saveMany).toHaveBeenCalledWith([{ alias: "Back Squat", canonicalExerciseId: "barbell-low-bar-squat", provenance: "remembered" }]);
});
```

- [ ] **Step 2: Expose current automatic persistence**

Run: `bun run test -- --runInBand src/components/import/ImportClient.test.tsx src/components/import/ResolutionStep.test.tsx`

Expected: FAIL because every non-custom resolution is saved.

- [ ] **Step 3: Implement grouped controls**

Render one selector/count, default Remember false, and expand `Resolve occurrences separately` into authoritative path selectors. Disable Remember when one normalized name maps to multiple IDs.

- [ ] **Step 4: Save remembered conflict-free aliases only**

```ts
export function rememberedAliasInputs(groups: ResolutionGroup[], resolutions: Record<string, string>): RememberedAliasInput[];
const aliasesToSave = rememberedAliasInputs(groups, resolutions);
if (aliasesToSave.length > 0) await aliasRepo.saveMany(aliasesToSave);
```

Reject an occupied token targeting a different ID with correction guidance. Run: `bun run test -- --runInBand src/components/import src/lib/import && bun run test:e2e -- program-import.spec.ts`

Expected: PASS for local default, Remember, later alias precedence, conflict rejection, and separate occurrences.

- [ ] **Step 5: Commit**

```bash
git add src/components/import src/lib/import src/lib/storage/aliasRepo.ts e2e/program-import.spec.ts
git commit -m "feat: resolve repeated exercise names during import"
```

### Task 10: Add the provider and global correction surface

**Files:**
- Create/Test: `src/components/app/ExerciseNormalizationProvider.tsx`, `src/components/app/ExerciseNormalizationProvider.test.tsx`
- Modify: `src/main.tsx`
- Create/Test: `src/components/catalog/ExerciseCorrectionSheet.tsx`, `src/components/catalog/ExerciseCorrectionSheet.test.tsx`
- Modify: `src/components/catalog/LibraryClient.tsx`
- Create: `src/components/catalog/LibraryClient.test.tsx`

**Interfaces:**
- Consumes: registries, aliases, user exercises, overrides, identity event.
- Produces: `useExerciseNormalization()` and one reusable correction sheet.

- [ ] **Step 1: Write failing refresh/correction tests**

```tsx
export type CorrectionTarget =
  | { kind: "catalog-exercise"; exerciseId: string; name: string }
  | { kind: "user-exercise"; exerciseId: string; name: string }
  | { kind: "normalized-name"; value: string };

function Probe() {
  const { version, resolve } = useExerciseNormalization();
  const identity = resolve({ kind: "import-name", name: "Hatfield Squat" });
  return <><span data-testid="version">{version}</span><span data-testid="movement">{identity.movementName ?? "Standalone"}</span></>;
}
const nameOnlyTarget: CorrectionTarget = { kind: "normalized-name", value: "Hatfield Squat" };
const validSquatOverride = { targetKind: "normalized-name" as const, targetValue: "Hatfield Squat", movementId: "squat", movementModifierIds: ["barbell"] };

it("atomically reloads after a committed event", async () => {
  render(<ExerciseNormalizationProvider><Probe /></ExerciseNormalizationProvider>);
  expect(screen.getByTestId("version")).toHaveTextContent("1");
  await normalizationOverrideRepo.save(validSquatOverride);
  await waitFor(() => expect(screen.getByTestId("version")).toHaveTextContent("2"));
  expect(screen.getByTestId("movement")).toHaveTextContent("Squat");
});
it("assigns and clears name-only targets", async () => {
  const user = userEvent.setup();
  render(<ExerciseCorrectionSheet target={nameOnlyTarget} onClose={jest.fn()} />);
  await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
  await user.click(screen.getByRole("checkbox", { name: "Barbell" }));
  await user.click(screen.getByRole("checkbox", { name: "Paused" }));
  await user.click(screen.getByRole("button", { name: "Save correction" }));
  expect(normalizationOverrideRepo.save).toHaveBeenCalledWith(expect.objectContaining({ movementId: "squat" }));
  await user.click(screen.getByRole("button", { name: "Return to standalone" }));
  expect(normalizationOverrideRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ movementId: null, movementModifierIds: [] }));
});
it.each<CorrectionTarget>([
  { kind: "catalog-exercise", exerciseId: "barbell-high-bar-squat", name: "High Bar Back Squat" },
  { kind: "user-exercise", exerciseId: "user-1", name: "My squat" },
])("assigns bundled movement metadata to $kind", async (target) => {
  const user = userEvent.setup(); render(<ExerciseCorrectionSheet target={target} onClose={jest.fn()} />);
  await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
  await user.click(screen.getByRole("checkbox", { name: "Barbell" }));
  await user.click(screen.getByRole("button", { name: "Save correction" }));
  expect(normalizationOverrideRepo.save).toHaveBeenCalledWith(expect.objectContaining({ targetKind: "exercise-id", targetValue: target.exerciseId, movementId: "squat" }));
});
it("maps an unknown name to a concrete version with a remembered alias", async () => {
  const user = userEvent.setup(); render(<ExerciseCorrectionSheet target={nameOnlyTarget} onClose={jest.fn()} />);
  await user.click(screen.getByRole("radio", { name: "Map to an existing exercise" }));
  await user.selectOptions(screen.getByLabelText("Concrete version"), "barbell-high-bar-squat");
  await user.click(screen.getByRole("button", { name: "Save correction" }));
  expect(aliasRepo.save).toHaveBeenCalledWith({ alias: "Hatfield Squat", canonicalExerciseId: "barbell-high-bar-squat", provenance: "remembered" });
});
it("rejects an invalid target before writing", async () => {
  render(<ExerciseCorrectionSheet target={{ kind: "user-exercise", exerciseId: "missing", name: "Missing" }} onClose={jest.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Unknown exercise target: missing");
  expect(normalizationOverrideRepo.save).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify modules are absent**

Run: `bun run test -- --runInBand src/components/app/ExerciseNormalizationProvider.test.tsx src/components/catalog/ExerciseCorrectionSheet.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement atomic provider reload**

Load aliases, user exercises, and overrides with one `Promise.all`; replace context and increment version in one state update. Subscribe once and never reload logs/page.

```ts
setState((previous) => ({ context: nextContext, version: previous.version + 1 }));
```

- [ ] **Step 4: Implement three correction actions and Needs review**

Support remembered alias-to-concrete mapping, movement+modifier assignment, and standalone clearing for bundled/custom/name-only targets. Derive Needs review from unresolved programs/logs/user exercises. Link Library detail to the shared sheet.

Run: `bun run test -- --runInBand src/components/app/ExerciseNormalizationProvider.test.tsx src/components/catalog`

Expected: PASS for all target kinds, invalid combinations, clearing, and live regrouping.

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/components/app src/components/catalog
git commit -m "feat: add global exercise normalization corrections"
```

### Task 11: Nest versions in the library and exercise pickers

**Files:**
- Create/Test: `src/lib/catalog/groupCatalog.ts`, `src/lib/catalog/groupCatalog.test.ts`
- Create: `src/lib/catalog/groupCatalog.testFixtures.ts`
- Modify: `src/components/catalog/LibraryClient.tsx`
- Modify: `src/components/workout/ExercisePickerSheet.tsx`
- Create: `src/components/workout/ExercisePickerSheet.test.tsx`
- Modify: `src/components/workout/ExerciseReplaceSheet.tsx`
- Create: `src/components/workout/ExerciseReplaceSheet.test.tsx`
- Modify: `src/components/workout/ExerciseEditSheet.tsx`

**Interfaces:**
- Consumes: provider identities and user exercises.
- Produces: `groupCatalogItems(items, resolve): CatalogGroup[]` and `searchCatalogGroups(groups, query): CatalogGroup[]`.

- [ ] **Step 1: Write failing grouping/search tests**

```ts
const { squatItems, resolve } = makeSquatCatalogFixture();
const groups = groupCatalogItems(squatItems, resolve);

test("groups concrete squat versions", () => {
  expect(groupCatalogItems(squatItems, resolve)[0]).toMatchObject({
    id: "movement:squat", name: "Squat",
    versions: [
      { id: "barbell-back-squat", name: "Back Squat" },
      { id: "barbell-high-bar-squat", name: "High Bar Back Squat" },
      { id: "barbell-low-bar-squat", name: "Low Bar Back Squat" },
    ],
  });
});
test.each(["squat", "high bar"])("searches both levels: %s", (query) => {
  const result = searchCatalogGroups(groups, query);
  expect(result[0].id).toBe("movement:squat");
  expect(result[0].versions.some((v) => v.id === "barbell-high-bar-squat")).toBe(true);
});
```

- [ ] **Step 2: Verify flat-list behavior fails**

Run: `bun run test -- --runInBand src/lib/catalog/groupCatalog.test.ts src/components/workout/ExercisePickerSheet.test.tsx src/components/workout/ExerciseReplaceSheet.test.tsx`

Expected: FAIL because catalogue surfaces are flat.

- [ ] **Step 3: Implement stable family/standalone groups**

```ts
export type SelectableExercise = {
  id: string; name: string; source: "bundled" | "user" | "unresolved";
  catalogItem?: ExerciseCatalogItem; userExercise?: UserExerciseDocument;
};
export type CatalogGroup = { id: string; movementId?: string; name: string; versions: SelectableExercise[]; standalone: boolean };
export function makeSquatCatalogFixture(): { squatItems: SelectableExercise[]; resolve: ExerciseIdentityResolver };
```

Order families by movement sort order, versions by canonical modifier order then name, and standalone/user exercises by name. Family rows are not selectable; generic concrete versions are selectable.

- [ ] **Step 4: Convert Library/add/replace and link edit to corrections**

Use shared grouping/search; reveal/highlight children for modifier queries; include custom and unresolved standalone entries. Add `Change primary movement/modifiers` to detail/edit.

Run: `bun run test -- --runInBand src/lib/catalog src/components/catalog src/components/workout/ExercisePickerSheet.test.tsx src/components/workout/ExerciseReplaceSheet.test.tsx`

Expected: PASS; only concrete children can add/replace.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog src/components/catalog src/components/workout/ExercisePickerSheet* src/components/workout/ExerciseReplaceSheet* src/components/workout/ExerciseEditSheet.tsx
git commit -m "feat: nest exercise versions under movements"
```

### Task 12: Build one lossless family-aware history projection

**Files:**
- Modify/Test: `src/lib/workout/historyUtils.ts`, `src/lib/workout/historyUtils.test.ts`
- Create/Test: `src/lib/workout/historyProjection.ts`, `src/lib/workout/historyProjection.test.ts`
- Create: `src/lib/workout/historyProjection.testFixtures.ts`
- Modify: `src/components/workout/HistoryClient.aggregateLogs.test.ts`

**Interfaces:**
- Consumes: logs and resolver context.
- Produces: `projectExerciseHistory`, `rowsForIdentity`, family summaries, concrete-version summaries.

- [ ] **Step 1: Write failing losslessness/separation tests**

```ts
const { context, squatIdentity, logWithHighAndLowBar, logsWithDuplicateHighBarEntries, totalVolumeAcrossBothEntries } = makeHistoryProjectionFixture();

test("keeps two same-family entries from one log", () => {
  const rows = rowsForIdentity(projectExerciseHistory([logWithHighAndLowBar], context), squatIdentity);
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.performedName)).toEqual(expect.arrayContaining(["Low Bar Back Squat", "High Bar Back Squat"]));
});
test("counts distinct logs and keeps concrete metrics separate", () => {
  const projection = projectExerciseHistory(logsWithDuplicateHighBarEntries, context);
  expect(projection.versionSummaries.get("barbell-high-bar-squat")).toMatchObject({ sessionCount: 1, sessionVolumesLb: [totalVolumeAcrossBothEntries] });
  expect(projection.familySummaries.get("squat")).not.toHaveProperty("best");
});
```

- [ ] **Step 2: Expose the current `.find` loss**

Run: `bun run test -- --runInBand src/lib/workout/historyUtils.test.ts src/lib/workout/historyProjection.test.ts`

Expected: FAIL because only one entry is retained.

- [ ] **Step 3: Implement the exact shared row**

```ts
export type ExerciseHistoryRow = {
  logId: string; entryIndex: number; performedAt: string; performedDate: string;
  performedName: string; concreteExerciseId?: string; movementId?: string;
  currentVersionLabel?: string; sets: string[]; note?: string; volumeLb: number;
};
export function makeHistoryProjectionFixture(): {
  context: ExerciseIdentityContext; squatIdentity: ExerciseIdentityResult;
  logWithHighAndLowBar: WorkoutLogDocument;
  logsWithDuplicateHighBarEntries: WorkoutLogDocument[];
  totalVolumeAcrossBothEntries: number;
};
```

Iterate all entries. Include set-bearing or note-bearing entries from complete/in-progress workouts; skip data-free skipped logs. Sort by performedAt descending, then logId, then entryIndex. Preserve units and normalize volume to pounds.

- [ ] **Step 4: Derive family and concrete summaries**

Family summaries expose only distinct log count/latest date. Concrete summaries combine same-version entries within each log before count/best/last/trend. Standalone keys come from the resolver.

Run: `bun run test -- --runInBand src/lib/workout/historyUtils.test.ts src/lib/workout/historyProjection.test.ts src/components/workout/HistoryClient.aggregateLogs.test.ts`

Expected: PASS for duplicates, deterministic ordering, notes, unknown IDs, immutable labels, and separated metrics.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workout src/components/workout/HistoryClient.aggregateLogs.test.ts
git commit -m "feat: project movement-family exercise history"
```

### Task 13: Render combined all-time and Today history

**Files:**
- Modify: `src/components/workout/HistoryClient.tsx`
- Create: `src/components/workout/HistoryClient.test.tsx`
- Modify/Test: `src/components/workout/HistoryDrawer.tsx`, `src/components/workout/HistoryDrawer.test.tsx`
- Modify/Test: `src/components/workout/WorkoutDayClient.tsx`, `src/components/workout/WorkoutDayClient.test.tsx`
- Modify: `e2e/exercise-history.spec.ts`, `e2e/history-rawcell.spec.ts`

**Interfaces:**
- Consumes: shared projection, provider, correction sheet.
- Produces: family all-time detail, per-version panels, family-wide drawer with active emphasis/filter.
- Test helper: `makeHistoryDrawerRows(inputs: Array<Pick<ExerciseHistoryRow, "performedName" | "concreteExerciseId">>): ExerciseHistoryRow[]` fills deterministic log/date/set fields.
- Test helper: `makeHistoryClientFixture(): { logs: WorkoutLogDocument[]; install(): void }` installs `logRepo.list` before render and restores it in `afterEach`.

- [ ] **Step 1: Write failing presentation tests**

```tsx
const squatRows = makeHistoryDrawerRows([
  { performedName: "High Bar Back Squat", concreteExerciseId: "barbell-high-bar-squat" },
  { performedName: "Low Bar Back Squat", concreteExerciseId: "barbell-low-bar-squat" },
  { performedName: "Back Squat", concreteExerciseId: "barbell-back-squat" },
]);
const historyClientFixture = makeHistoryClientFixture();

it("opens one Squat history with labeled versions", async () => {
  const user = userEvent.setup();
  historyClientFixture.install();
  render(<HistoryClient />);
  await user.click(await screen.findByRole("button", { name: /Squat.*2 workouts/i }));
  expect(screen.getByText("High Bar Back Squat")).toBeInTheDocument();
  expect(screen.getByText("Low Bar Back Squat")).toBeInTheDocument();
  expect(screen.queryByText(/family best/i)).not.toBeInTheDocument();
});
it("defaults Today to family history and filters versions", async () => {
  const user = userEvent.setup();
  render(<HistoryDrawer exerciseName="High Bar Back Squat" activeConcreteExerciseId="barbell-high-bar-squat" rows={squatRows} onClose={jest.fn()} />);
  expect(screen.getAllByTestId("history-row")).toHaveLength(3);
  expect(screen.getByTestId("history-row-barbell-high-bar-squat")).toHaveAttribute("data-active-version", "true");
  await user.selectOptions(screen.getByLabelText("Filter by version"), "barbell-low-bar-squat");
  expect(screen.getByText("Low Bar Back Squat")).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify current concrete-only behavior**

Run: `bun run test -- --runInBand src/components/workout/HistoryClient.test.tsx src/components/workout/HistoryDrawer.test.tsx src/components/workout/WorkoutDayClient.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement all-time family index/detail**

Render family/standalone index rows; combined chronological rows use performed name plus current badge. Render metrics per concrete version only. Link correction sheet from unresolved/classified rows.

- [ ] **Step 4: Implement family-wide Today history**

Resolve via optional canonical ID, never slot ID; default filter to `All versions`; emphasize active version; keep performed label/current badge/raw-cell units.

Run: `bun run test -- --runInBand src/components/workout/HistoryClient.test.tsx src/components/workout/HistoryDrawer.test.tsx src/components/workout/WorkoutDayClient.test.tsx && bun run test:e2e -- exercise-history.spec.ts history-rawcell.spec.ts`

Expected: PASS for family default/filter, duplicates, standalone correction, and raw cells.

- [ ] **Step 5: Commit**

```bash
git add src/components/workout/HistoryClient* src/components/workout/HistoryDrawer* src/components/workout/WorkoutDayClient* e2e/exercise-history.spec.ts e2e/history-rawcell.spec.ts
git commit -m "feat: show combined movement-family history"
```

### Task 14: Migrate analysis/lookups and verify live invalidation

**Files:**
- Modify/Test: `src/lib/analysis/muscles.ts`, `src/lib/analysis/muscles.test.ts`
- Modify: `src/components/app/LocalDataProvider.test.tsx`
- Create: `src/components/app/ExerciseIdentityIntegration.test.tsx`
- Create: `src/components/app/ExerciseIdentityIntegration.testFixtures.tsx`
- Verify unchanged: `src/lib/prompts/builder.ts`, `src/lib/prompts/builder.test.ts`

**Interfaces:**
- Consumes: resolver/provider and completed UI/data boundaries.
- Produces: no identity-sensitive bypasses and one-refresh evidence across consumers.

- [ ] **Step 1: Add the failing live-update test**

```tsx
const { logs, validSquatOverride, renderHarness } = makeIdentityIntegrationFixture();

it("one override updates all consumers without reloading logs", async () => {
  renderHarness();
  await normalizationOverrideRepo.save(validSquatOverride);
  await waitFor(() => {
    expect(screen.getByTestId("analysis-movement")).toHaveTextContent("Squat");
    expect(screen.getByTestId("library-family")).toHaveTextContent("Squat");
    expect(screen.getByTestId("all-time-family")).toHaveTextContent("Squat");
    expect(screen.getByTestId("today-family")).toHaveTextContent("Squat");
  });
  expect(logRepo.list).toHaveBeenCalledTimes(1);
});
```

`makeIdentityIntegrationFixture(): { logs: WorkoutLogDocument[]; validSquatOverride: NormalizationOverrideSaveInput; renderHarness(): RenderResult }` seeds repo mocks once and renders the real analysis lookup consumer, `LibraryClient`, `HistoryClient`, and a `WorkoutDayClient`/drawer under one `ExerciseNormalizationProvider`; it returns the shared `logRepo.list` mock so the test can assert one read.

- [ ] **Step 2: Run and locate remaining bypasses**

Run: `bun run test -- --runInBand src/components/app/ExerciseIdentityIntegration.test.tsx src/lib/analysis/muscles.test.ts`

Expected: FAIL where analysis/UI bypasses context.

- [ ] **Step 3: Replace identity-sensitive direct lookups**

```bash
rg -n 'exerciseCatalog\.(find|filter|flatMap)|catalogIndex\.get|canonicalExerciseId \?\? .*exerciseId|entries\.find|\.canonicalExerciseId\)' src --glob '!**/*.test.*'
```

Route grouping through the resolver. Exact metadata lookup may remain only with same-line comment `// Exact concrete metadata lookup; grouping is intentionally not performed here.` No history/analysis direct grouping remains.

Record this exact audit table in the integration test and require every row to assert resolver use or the exact-only comment:

```ts
const IDENTITY_CONSUMERS = [
  "src/lib/catalog/match.ts", "src/lib/import/parser.ts", "src/lib/import/resolution.ts",
  "src/lib/storage/aliasRepo.ts", "src/lib/analysis/muscles.ts",
  "src/components/catalog/LibraryClient.tsx", "src/components/workout/ExercisePickerSheet.tsx",
  "src/components/workout/ExerciseReplaceSheet.tsx", "src/lib/workout/historyProjection.ts",
  "src/components/workout/HistoryClient.tsx", "src/components/workout/WorkoutDayClient.tsx",
  "src/lib/storage/appDb.ts", "src/lib/backup/backup.ts",
] as const;
```

- [ ] **Step 4: Verify every write source and all quality gates**

Assert alias/user-exercise/override save+remove, migration, and restore each dispatch once after commit. Run:

```bash
bun run catalog:check
bun run test -- --runInBand
bun run typecheck
bun run lint
bun run build
bun run test:e2e -- program-import.spec.ts exercise-history.spec.ts history-rawcell.spec.ts
git diff --exit-code origin/master -- src/lib/prompts
```

Expected: all exit 0; the prompts directory has no diff; build is offline.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis src/components/app
git commit -m "test: verify exercise normalization end to end"
```

### Task 15: Review, publish, and hand off

**Files:**
- Review: all Task 1–14 changes.
- Create issues only for work outside the approved spec.

**Interfaces:**
- Consumes: complete implementation and quality-gate evidence.
- Produces: reviewed, pushed branch and dated compatibility handoff.

- [ ] **Step 1: Audit the final diff against the spec**

```bash
git diff --check
git diff --stat origin/master...HEAD
rg -n 'TODO\(2026-09-30\): remove legacy exercise ID redirects after the compatibility window\.' src
rg -n 'canonicalExerciseId \?\? .*exerciseId|entries\.find' src/lib/workout src/components/workout --glob '!**/*.test.*'
```

Expected: no whitespace errors; exactly one dated comment; no direct history grouping/find patterns.

- [ ] **Step 2: Re-run clean release gates**

```bash
bun run catalog:check
bun run test -- --runInBand
bun run typecheck
bun run lint
bun run build
bun run test:e2e -- program-import.spec.ts exercise-history.spec.ts history-rawcell.spec.ts
```

Expected: all exit 0.

- [ ] **Step 3: Request final code review**

Use `superpowers:requesting-code-review` on `origin/master...HEAD`. Fix every P0/P1 with a failing test and focused commit; file lower-priority issues only when outside this spec.

- [ ] **Step 4: Sync and push**

```bash
git pull --rebase
bd sync --flush-only
git push -u origin HEAD
git status --short --branch
```

Expected: branch up to date with origin. If Beads is uninitialized, do not initialize it; record that in the handoff and continue pushing.

- [ ] **Step 5: Hand off the dated removal**

Report September 30, 2026 and the exact source comment, catalogue counts, approved/rejected variants by family, quality-gate results, and nonblocking near-duplicate report rows.

## Execution Handoff

After this plan is approved, choose one execution mode:

1. **Subagent-Driven (recommended):** use `superpowers:subagent-driven-development`, dispatch a fresh implementation subagent per task, and perform spec-compliance then code-quality review between tasks.
2. **Inline Execution:** use `superpowers:executing-plans`, execute in reviewable batches, and stop at the skill's checkpoints.
