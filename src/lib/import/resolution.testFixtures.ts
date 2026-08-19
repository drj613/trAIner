// Shared fixtures for the import grouping/fan-out tests.
//
// The runtime import-disambiguation artifact
// (`src/lib/catalog/importDisambiguations.generated.json`) currently ships
// ZERO records, so no name is underspecified in production yet — the reviewed
// curation content is a separate, review-gated deliverable. These fixtures
// therefore inject a small catalogue + disambiguation table through the
// parser's `matchContext` seam so the tri-state behaviour can be pinned end to
// end now. Nothing here is production data.
import type { MatchExerciseContext } from "@/lib/catalog/match";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";
import type { DisambiguationRule, MovementDefinition, MovementModifierDefinition } from "@/lib/catalog/registries";
import { normalizePayload, type ImportReview } from "@/lib/import/parser";
import type { ProgramDay, ProgramDocument, ProgramExercise } from "@/lib/programs/types";
import { getOverrideReplacementDays } from "@/lib/programs/overrides";
import type { Resolution, ResolutionGroup } from "@/lib/import/resolution";
import eightBackSquats from "@/lib/import/__fixtures__/eight-back-squats.json";

const squat: MovementDefinition = {
  id: "squat",
  name: "Squat",
  aliases: [],
  sortOrder: 1,
  allowedModifierCategories: ["implement", "position"],
  allowedModifierIds: ["barbell", "back-rack", "high-bar", "low-bar"],
  maxIdentityModifiers: 3,
  displayTemplate: "{modifiers} {movement}",
};

const barbell: MovementModifierDefinition = {
  id: "barbell",
  name: "Barbell",
  aliases: ["bar"],
  category: "implement",
  identity: true,
  sortOrder: 1,
};

const backRack: MovementModifierDefinition = {
  id: "back-rack",
  name: "Back Rack",
  aliases: [],
  category: "position",
  identity: true,
  sortOrder: 2,
};

const highBarModifier: MovementModifierDefinition = {
  id: "high-bar",
  name: "High Bar",
  aliases: [],
  category: "position",
  identity: true,
  sortOrder: 3,
};

const lowBarModifier: MovementModifierDefinition = {
  id: "low-bar",
  name: "Low Bar",
  aliases: [],
  category: "position",
  identity: true,
  sortOrder: 4,
};

function squatItem(
  id: string,
  name: string,
  movementModifierIds: string[],
  aliases: string[] = [],
): ExerciseCatalogItem {
  return {
    id,
    name,
    aliases,
    equipment: ["barbell"],
    movementPatterns: ["squat"],
    muscles: { primary: ["quads"], secondary: ["glutes"] },
    tags: ["strength"],
    movementId: "squat",
    movementModifierIds,
  };
}

// The generic concrete version: real `back-rack` identity, no bar position.
// Its presence is deliberate — an underspecified rule must still win over a
// concrete catalogue entry with the SAME name (spec: "emits a typed
// resolution item even if a generic concrete catalogue entry has the same
// name").
export const genericBackSquat = squatItem("barbell-back-squat", "Back Squat", ["barbell", "back-rack"]);
export const highBarBackSquat = squatItem(
  "barbell-high-bar-squat",
  "High Bar Back Squat",
  ["barbell", "back-rack", "high-bar"],
);
export const lowBarBackSquat = squatItem(
  "barbell-low-bar-squat",
  "Low Bar Back Squat",
  ["barbell", "back-rack", "low-bar"],
);
export const frontSquat = squatItem("barbell-front-squat", "Front Squat", ["barbell", "front-rack"]);

export const backSquatDisambiguation: DisambiguationRule = {
  id: "back-squat-choice",
  kind: "underspecified-name",
  normalizedName: "back squat",
  movementId: "squat",
  candidateExerciseIds: [genericBackSquat.id, highBarBackSquat.id, lowBarBackSquat.id],
  matchedModifierIds: ["barbell", "back-rack"],
};

/**
 * Import-side match context. `extraCatalog` / `extraRules` are additive so a
 * test can add exactly the one phrase rule it is about without inheriting
 * unrelated rules (a stray `or` rule, for instance, changes every name that
 * happens to contain the word).
 */
export function makeImportMatchContext(
  options: { extraCatalog?: ExerciseCatalogItem[]; extraRules?: DisambiguationRule[] } = {},
): MatchExerciseContext {
  const catalog = [
    genericBackSquat,
    highBarBackSquat,
    lowBarBackSquat,
    frontSquat,
    ...(options.extraCatalog ?? []),
  ];
  const rules: DisambiguationRule[] = [backSquatDisambiguation, ...(options.extraRules ?? [])];
  return {
    catalogById: new Map(catalog.map((item) => [item.id, item])),
    movementsById: new Map([[squat.id, squat]]),
    modifiersById: new Map([
      [barbell.id, barbell],
      [backRack.id, backRack],
      [highBarModifier.id, highBarModifier],
      [lowBarModifier.id, lowBarModifier],
    ]),
    redirects: new Map(),
    disambiguations: new Map(
      rules.map((rule) => [
        rule.kind === "underspecified-name" ? rule.normalizedName : rule.normalizedPhrase,
        rule,
      ]),
    ),
    normalizationOverrides: [],
  };
}

/**
 * The spec's worked example: eight `Back Squat` occurrences spread across
 * base days, supported exercise-level week variants, and override replacement
 * exercises. The fixture also carries a NINTH raw `Back Squat` nested inside
 * an override replacement variant, which is unsupported and must NOT be
 * counted or promised as a fan-out target — so a grouping bug that counts it
 * shows up as 9, not 8.
 *
 * `expectedEightPaths` is written out literally rather than derived from the
 * warnings under test, so the assertion cannot agree with a buggy grouper.
 */
export function makeEightBackSquatReview(
  options: { aliases?: Parameters<typeof normalizePayload>[2] } = {},
): { review: ImportReview; expectedEightPaths: string[] } {
  const review = normalizePayload(
    eightBackSquats as unknown as Record<string, unknown>,
    undefined,
    options.aliases ?? [],
    [],
    makeImportMatchContext(),
  );
  return {
    review,
    expectedEightPaths: [
      "days.1.sections.0.groups.0.exercises.0",
      "days.1.sections.0.groups.0.exercises.1.variants.0",
      "days.2.sections.0.groups.0.exercises.0",
      "days.2.sections.0.groups.0.exercises.1.variants.0",
      "days.3.sections.0.groups.0.exercises.0",
      "overrides.0.days.1.sections.0.groups.0.exercises.0",
      "overrides.0.days.1.sections.0.groups.0.exercises.1",
      "overrides.0.days.1.sections.0.groups.1.exercises.0",
    ],
  };
}

function daysWithOverrides(program: ProgramDocument): ProgramDay[] {
  return [
    ...program.days,
    ...program.overrides.flatMap((override) => getOverrideReplacementDays(override)),
  ];
}

/**
 * Every STORED exercise carrying `name`, base days and override replacement
 * days alike. Counts stored occurrences, not warning paths — a base day that
 * expanded into several weeks contributes one entry per week-clone.
 */
export function collectNamed(program: ProgramDocument, name: string): ProgramExercise[] {
  return daysWithOverrides(program).flatMap((day) =>
    day.sections.flatMap((section) =>
      section.groups.flatMap((group) => group.exercises.filter((exercise) => exercise.name === name)),
    ),
  );
}

/** One resolution per grouped occurrence path — the fan-out under test. */
export function resolutionsForGroup(group: ResolutionGroup, canonicalId: string): Resolution[] {
  return group.occurrences.map(({ path }) => ({ path, canonicalId }));
}
