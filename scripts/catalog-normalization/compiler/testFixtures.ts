import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUTPUT_FILES } from "./core";
import { buildRegistries } from "./normalize";
import {
  canonicalModifierIds,
  idForSignature,
  joinCandidateReviews,
  materializeVariant,
} from "./validate";
import type {
  CatalogExercise,
  MovementDefinition,
  MovementModifierDefinition,
  VariantCandidate,
  VariantReviewDecision,
  VariantRule,
} from "./types";
import movementsArtifact from "../movements.json";
import modifiersArtifact from "../modifiers.json";

const COMPLETE_MANIFESTS = [
  "movements.json",
  "modifiers.json",
  "merges.json",
  "assignments.json",
  "alias-classifications.json",
  "disambiguations.json",
  "variant-rules.json",
  "reviews/variant-candidates.json",
  "reviews/variant-adversarial-review.json",
];

const EMPTY_ARTIFACT = `${JSON.stringify({ schemaVersion: 1, records: [] })}\n`;

export type CompilerFixtureInput = {
  candidates?: VariantCandidate[];
  reviews?: VariantReviewDecision[];
  approvedRule?: VariantRule;
};

export type ExerciseCatalogItem = CatalogExercise & {
  movementId?: string;
  movementModifierIds: string[];
};

export type CompiledFixture = {
  exercises: ExerciseCatalogItem[];
  bySignature: Map<string, ExerciseCatalogItem>;
};

const fixtureRuleBase = {
  metadataFromExerciseId: "barbell-high-bar-squat",
  metadataOverrides: undefined,
  approvedAliases: [],
  coverageTier: 1 as const,
};

export const twoSecondPause: VariantCandidate = {
  ...fixtureRuleBase,
  id: "two-second-pause",
  movementId: "squat",
  movementModifierIds: ["paused", "two-second"],
  status: "candidate",
  rationale: "Reject numeric pause duration as prescription detail.",
};

export const highBarSquatRule: VariantRule = {
  ...fixtureRuleBase,
  id: "existing-high-bar",
  movementId: "squat",
  movementModifierIds: ["barbell", "back-rack", "high-bar"],
  status: "approved",
};

export const newPausedHighBarRule: VariantRule = {
  ...fixtureRuleBase,
  id: "new-paused-high-bar",
  movementId: "squat",
  movementModifierIds: ["barbell", "back-rack", "high-bar", "paused"],
  status: "approved",
};

export const highBarCandidate: VariantCandidate = {
  ...highBarSquatRule,
  status: "candidate",
  rationale: "Existing reviewed high-bar squat identity.",
};

export const approveHighBar: VariantReviewDecision = {
  candidateId: highBarCandidate.id,
  decision: "approve",
  reason: "Mechanically distinct and already represented.",
};

export const rejectHighBar: VariantReviewDecision = {
  candidateId: highBarCandidate.id,
  decision: "reject",
  reason: "Duplicate decision used to exercise validator.",
};

export const approvedCableRowRule: VariantRule = {
  ...fixtureRuleBase,
  id: "cable-row-upper-back",
  movementId: "row",
  movementModifierIds: ["cable"],
  metadataFromExerciseId: "cable-row",
  status: "approved",
};

export function exercise(input: {
  id: string;
  equipment: string[];
  movementPatterns: string[];
  primaryMuscles: string[];
  tags: string[];
}): ExerciseCatalogItem {
  return {
    id: input.id,
    name: input.id,
    aliases: [],
    equipment: input.equipment,
    movementPatterns: input.movementPatterns,
    muscles: { primary: input.primaryMuscles, secondary: [] },
    tags: input.tags,
    movementId: "row",
    movementModifierIds: ["cable"],
  };
}

function fixtureBase(rule: VariantRule): CatalogExercise {
  return {
    id: rule.metadataFromExerciseId,
    name: rule.metadataFromExerciseId === "barbell-high-bar-squat"
      ? "High Bar Back Squat"
      : rule.metadataFromExerciseId,
    aliases: [],
    equipment: rule.movementId === "row" ? ["cable"] : ["barbell"],
    movementPatterns: ["strength"],
    muscles: { primary: ["back"], secondary: ["biceps"] },
    tags: ["strength"],
  };
}

function fixtureName(rule: VariantRule, modifierIds: readonly string[]): string {
  const signature = [rule.movementId, ...modifierIds].join("|");
  if (signature === "squat|barbell|back-rack|high-bar") return "High Bar Back Squat";
  if (signature === "squat|barbell|back-rack|high-bar|paused") return "Paused High Bar Back Squat";
  return [
    ...modifierIds.map((modifierId) => modifierId.replace(/-/g, " ")),
    rule.movementId.replace(/-/g, " "),
  ].map((part) => part.replace(/\b\w/g, (character) => character.toUpperCase())).join(" ");
}

export async function compileFixture(input: CompilerFixtureInput): Promise<CompiledFixture> {
  const candidates = [...(input.candidates ?? [])];
  const reviews = [...(input.reviews ?? [])];
  if (input.approvedRule) {
    candidates.push({
      ...input.approvedRule,
      status: "candidate",
      rationale: "Fixture candidate for review-gated compilation.",
    });
    reviews.push({ candidateId: input.approvedRule.id, decision: "approve", reason: "Fixture approval." });
  }
  const byCandidate = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const joined = joinCandidateReviews(candidates, reviews);
  const registries = buildRegistries(
    movementsArtifact.records as MovementDefinition[],
    modifiersArtifact.records as MovementModifierDefinition[],
    [],
  );
  const exercises: ExerciseCatalogItem[] = [];
  const bySignature = new Map<string, ExerciseCatalogItem>();
  for (const { candidate, review } of joined) {
    if (review.decision === "reject") continue;
    const source = review.decision === "revise" ? review.revisedRule! : byCandidate.get(candidate.id)!;
    const rule = { ...source, status: "approved" as const };
    const modifierIds = canonicalModifierIds(rule.movementId, rule.movementModifierIds, registries);
    const signature = [rule.movementId, ...modifierIds].join("|");
    const existingId = signature === "squat|barbell|back-rack|high-bar"
      ? "barbell-high-bar-squat"
      : idForSignature(rule.movementId, modifierIds);
    const materialized = materializeVariant(fixtureBase(rule), {
      ...rule,
      id: existingId,
      movementModifierIds: modifierIds,
    });
    const exercise: ExerciseCatalogItem = {
      ...materialized,
      id: existingId,
      movementId: rule.movementId,
      name: signature === "squat|barbell|back-rack|high-bar"
        ? "High Bar Back Squat"
        : fixtureName(rule, modifierIds),
      movementModifierIds: modifierIds,
    };
    bySignature.set(signature, exercise);
    exercises.push(exercise);
  }
  return { exercises, bySignature };
}

export async function createCompilerFixtureRoot(options: { snapshotRecords: number }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "catalog-fixture-"));
  const catalogRoot = join(root, "scripts/catalog-normalization");
  const snapshot = `${JSON.stringify(
    Array.from({ length: options.snapshotRecords }, (_, index) => ({
      id: `fixture-${index}`,
      name: `Fixture ${index}`,
      aliases: [],
      equipment: [],
      movementPatterns: [],
      muscles: { primary: [], secondary: [] },
      tags: [],
    })),
    null,
    2,
  )}\n`;
  await mkdir(join(catalogRoot, "reviews"), { recursive: true });
  await writeFile(join(catalogRoot, "catalog-v1.snapshot.json"), snapshot);
  await writeFile(
    join(catalogRoot, "catalog-v1.sha256"),
    `${createHash("sha256").update(snapshot).digest("hex")}\n`,
  );
  await Promise.all(
    COMPLETE_MANIFESTS.map((fileName) => writeFile(join(catalogRoot, fileName), EMPTY_ARTIFACT)),
  );

  const outputDir = join(root, "src/lib/catalog");
  await mkdir(outputDir, { recursive: true });
  await Promise.all(
    OUTPUT_FILES.map((fileName) =>
      writeFile(join(outputDir, fileName), fileName === "exercises.generated.json" ? snapshot : EMPTY_ARTIFACT),
    ),
  );
  return root;
}

export async function runProcess(argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(argv[0], argv.slice(1));
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (exitCode) => resolveProcess({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}
