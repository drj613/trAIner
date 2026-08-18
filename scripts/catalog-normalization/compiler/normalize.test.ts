import { canonicalizeModifiers, signatureFor } from "./normalize";
import { flattenMerges, validateAliasOutcomes, validateRegistries } from "./validate";
import type {
  BuildRegistries,
  ModifierCategory,
  MovementDefinition,
  MovementModifierDefinition,
} from "./types";

function makeModifierRegistryFixture(input: {
  movementId: string;
  allowedModifierIds: string[];
  modifiers: Array<{ id: string; sortOrder: number; implies?: string[] }>;
}): BuildRegistries {
  const category: ModifierCategory = "implement";
  const movement: MovementDefinition = {
    id: input.movementId,
    name: input.movementId,
    aliases: [],
    sortOrder: 1,
    allowedModifierCategories: [category],
    allowedModifierIds: input.allowedModifierIds,
    maxIdentityModifiers: 3,
    displayTemplate: "{movement}",
  };
  const modifiers = input.modifiers.map<MovementModifierDefinition>((modifier) => ({
    id: modifier.id,
    name: modifier.id,
    aliases: [],
    category,
    identity: true,
    sortOrder: modifier.sortOrder,
    ...(modifier.implies ? { implies: modifier.implies } : {}),
  }));

  return {
    movementsById: new Map([[movement.id, movement]]),
    modifiersById: new Map(modifiers.map((modifier) => [modifier.id, modifier])),
    signatures: [],
  };
}

function withRegistries(
  registries: BuildRegistries,
  changes: Partial<Pick<BuildRegistries, "movementsById" | "modifiersById" | "signatures">>,
): BuildRegistries {
  return { ...registries, ...changes };
}

function invalidRegistryFixtures(): Array<{ name: string; registries: BuildRegistries; expected: string }> {
  const base = makeModifierRegistryFixture({
    movementId: "squat",
    allowedModifierIds: ["a", "b", "c", "non-identity"],
    modifiers: [
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
      { id: "c", sortOrder: 3 },
      { id: "non-identity", sortOrder: 4 },
    ],
  });
  const modifiers = (updates: Record<string, Partial<MovementModifierDefinition>>) =>
    new Map(
      [...base.modifiersById].map(([id, modifier]) => [id, { ...modifier, ...updates[id] }]),
    );

  return [
    {
      name: "implication cycle",
      registries: withRegistries(base, {
        modifiersById: modifiers({ a: { implies: ["b"] }, b: { implies: ["a"] } }),
      }),
      expected: "Modifier implication cycle",
    },
    {
      name: "asymmetric exclusion",
      registries: withRegistries(base, {
        modifiersById: modifiers({ a: { excludes: ["b"] } }),
      }),
      expected: "Asymmetric exclusion",
    },
    {
      name: "closure conflict",
      registries: withRegistries(base, {
        modifiersById: modifiers({
          a: { implies: ["b"], excludes: ["b"] },
          b: { excludes: ["a"] },
        }),
      }),
      expected: "Modifier closure conflict",
    },
    {
      name: "shared exclusive group",
      registries: withRegistries(base, {
        modifiersById: modifiers({
          a: { exclusiveGroup: "bar-position" },
          b: { exclusiveGroup: "bar-position" },
        }),
        signatures: [{ movementId: "squat", modifierIds: ["a", "b"] }],
      }),
      expected: "Exclusive-group conflict",
    },
    {
      name: "exact-ID family allowlist miss",
      registries: withRegistries(base, {
        movementsById: new Map([
          [
            "squat",
            {
              ...base.movementsById.get("squat")!,
              allowedModifierIds: ["a"],
            },
          ],
        ]),
        signatures: [{ movementId: "squat", modifierIds: ["b"] }],
      }),
      expected: "Modifier not allowed for movement",
    },
    {
      name: "identity false signature member",
      registries: withRegistries(base, {
        modifiersById: modifiers({ "non-identity": { identity: false } }),
        signatures: [{ movementId: "squat", modifierIds: ["non-identity"] }],
      }),
      expected: "Non-identity modifier in signature",
    },
    {
      name: "family maximum overflow",
      registries: withRegistries(base, {
        movementsById: new Map([
          [
            "squat",
            {
              ...base.movementsById.get("squat")!,
              maxIdentityModifiers: 1,
            },
          ],
        ]),
        signatures: [{ movementId: "squat", modifierIds: ["a", "b"] }],
      }),
      expected: "Too many identity modifiers",
    },
  ];
}

const registries = makeModifierRegistryFixture({
  movementId: "squat",
  allowedModifierIds: ["barbell", "back-rack", "high-bar"],
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
  expect(flattenMerges({ old: "middle", middle: "current" }, new Set(["current"]))).toEqual({
    old: "current",
    middle: "current",
  });
});

test("rejects unclassified alias collisions", () => {
  expect(() =>
    validateAliasOutcomes(new Map([["row", ["barbell-row", "cable-row"]]]), new Map()),
  ).toThrow("Unclassified alias collision: row");
});

test.each(invalidRegistryFixtures())("rejects $name", ({ registries, expected }) => {
  expect(() => validateRegistries(registries)).toThrow(expected);
});
