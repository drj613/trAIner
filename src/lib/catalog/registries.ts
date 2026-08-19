import importDisambiguationsArtifact from "./importDisambiguations.generated.json";
import legacyRedirectsArtifact from "./legacyRedirects.generated.json";
import modifiersArtifact from "./modifiers.generated.json";
import movementsArtifact from "./movements.generated.json";

export type GeneratedArtifact<T> = {
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

export type DisambiguationRule =
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

export type ImportDisambiguation = Extract<DisambiguationRule, { kind: "underspecified-name" }>;

type LegacyExerciseIdRedirect = {
  fromExerciseId: string;
  toExerciseId: string;
};

export function assertGeneratedArtifact<T>(
  artifact: unknown,
  artifactName: string,
): asserts artifact is GeneratedArtifact<T> {
  if (typeof artifact !== "object" || artifact === null || !("schemaVersion" in artifact)) {
    throw new Error(`Missing ${artifactName} schema version`);
  }

  const { schemaVersion, records } = artifact as { schemaVersion?: unknown; records?: unknown };
  if (schemaVersion !== 1) {
    throw new Error(`Unsupported ${artifactName} schema version: ${String(schemaVersion)}`);
  }
  if (!Array.isArray(records)) {
    throw new Error(`Invalid ${artifactName} records`);
  }
}

const generatedMovements: unknown = movementsArtifact;
const generatedModifiers: unknown = modifiersArtifact;
const generatedLegacyRedirects: unknown = legacyRedirectsArtifact;
const generatedImportDisambiguations: unknown = importDisambiguationsArtifact;

assertGeneratedArtifact<MovementDefinition>(generatedMovements, "movement registry");
assertGeneratedArtifact<MovementModifierDefinition>(generatedModifiers, "modifier registry");
assertGeneratedArtifact<LegacyExerciseIdRedirect>(generatedLegacyRedirects, "legacy redirect registry");
assertGeneratedArtifact<DisambiguationRule>(generatedImportDisambiguations, "import disambiguation registry");

export const movementDefinitions: readonly MovementDefinition[] = generatedMovements.records;
export const movementModifierDefinitions: readonly MovementModifierDefinition[] = generatedModifiers.records;
export const disambiguationRules: readonly DisambiguationRule[] = generatedImportDisambiguations.records;
export const importDisambiguations: readonly ImportDisambiguation[] = disambiguationRules.filter(
  (rule): rule is ImportDisambiguation => rule.kind === "underspecified-name",
);
export const nonIdentityPhraseRules: readonly Extract<DisambiguationRule, { kind: "non-identity-phrase" }>[] =
  disambiguationRules.filter(
    (rule): rule is Extract<DisambiguationRule, { kind: "non-identity-phrase" }> =>
      rule.kind === "non-identity-phrase",
  );

export const movementsById: ReadonlyMap<string, MovementDefinition> = new Map(
  movementDefinitions.map((movement) => [movement.id, movement]),
);
export const modifiersById: ReadonlyMap<string, MovementModifierDefinition> = new Map(
  movementModifierDefinitions.map((modifier) => [modifier.id, modifier]),
);
export const disambiguationsByNormalizedName: ReadonlyMap<string, DisambiguationRule> = new Map(
  disambiguationRules.map((rule) => [
    rule.kind === "underspecified-name" ? rule.normalizedName : rule.normalizedPhrase,
    rule,
  ]),
);
export const legacyExerciseIdRedirects: ReadonlyMap<string, string> = new Map(
  generatedLegacyRedirects.records.map((redirect) => [redirect.fromExerciseId, redirect.toExerciseId]),
);

export async function loadDisambiguationRules(
  path = "src/lib/catalog/importDisambiguations.generated.json",
): Promise<GeneratedArtifact<DisambiguationRule>> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load import disambiguations: ${response.status}`);
  const artifact: unknown = await response.json();
  assertGeneratedArtifact<DisambiguationRule>(artifact, "import disambiguation registry");
  return artifact;
}
