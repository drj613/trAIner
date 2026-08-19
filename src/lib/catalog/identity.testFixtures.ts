import type { ExerciseCatalogItem } from "./exercises";
import type { ExerciseIdentityContext } from "./identity";
import type { MovementDefinition, MovementModifierDefinition } from "./registries";

export const squat: MovementDefinition = {
  id: "squat",
  name: "Squat",
  aliases: [],
  sortOrder: 1,
  allowedModifierCategories: ["implement", "position"],
  allowedModifierIds: ["barbell", "back-rack", "high-bar"],
  maxIdentityModifiers: 3,
  displayTemplate: "{modifiers} {movement}",
};

export const highBar: ExerciseCatalogItem = {
  id: "barbell-high-bar-squat",
  name: "High Bar Back Squat",
  aliases: ["high bar squat"],
  equipment: ["barbell"],
  movementPatterns: ["squat"],
  muscles: { primary: ["quads"], secondary: [] },
  tags: ["strength"],
  movementId: "squat",
  movementModifierIds: ["barbell", "back-rack", "high-bar"],
};

export const barbell: MovementModifierDefinition = {
  id: "barbell",
  name: "Barbell",
  aliases: ["bar"],
  category: "implement",
  identity: true,
  sortOrder: 1,
};

export const backRack: MovementModifierDefinition = {
  id: "back-rack",
  name: "Back Rack",
  aliases: [],
  category: "position",
  identity: true,
  sortOrder: 2,
};

export const highBarModifier: MovementModifierDefinition = {
  id: "high-bar",
  name: "High Bar",
  aliases: [],
  category: "position",
  identity: true,
  sortOrder: 3,
};

export function makeIdentityContext(
  overrides: Partial<ExerciseIdentityContext> = {},
): ExerciseIdentityContext {
  return {
    catalogById: new Map(),
    movementsById: new Map(),
    modifiersById: new Map(),
    redirects: new Map(),
    disambiguations: new Map(),
    aliases: [],
    userExercises: [],
    normalizationOverrides: [],
    ...overrides,
  };
}
