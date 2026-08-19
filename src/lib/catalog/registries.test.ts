import {
  assertGeneratedArtifact,
  disambiguationRules,
  legacyExerciseIdRedirects,
  loadDisambiguationRules,
  modifiersById,
  movementDefinitions,
  movementsById,
} from "./registries";

test("exposes the generated movement, modifier, redirect, and disambiguation registries", () => {
  expect(movementDefinitions.length).toBeGreaterThan(0);
  expect(movementsById.get("squat")).toMatchObject({ name: "Squat" });
  expect(modifiersById.get("barbell")).toMatchObject({ name: "Barbell", identity: true });
  expect(legacyExerciseIdRedirects).toBeInstanceOf(Map);
  expect(disambiguationRules).toEqual(expect.any(Array));
});

test("rejects generated artifacts with an unsupported schema version", () => {
  expect(() => assertGeneratedArtifact({ schemaVersion: 2, records: [] }, "fixture"))
    .toThrow("Unsupported fixture schema version: 2");
});

test("loads and validates a fetched import-disambiguation artifact", async () => {
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      schemaVersion: 1,
      records: [{
        id: "back-squat-choice",
        kind: "underspecified-name",
        normalizedName: "back squat",
        movementId: "squat",
        candidateExerciseIds: ["barbell-high-bar-squat"],
        matchedModifierIds: ["barbell"],
      }],
    }),
  }) });

  try {
    await expect(loadDisambiguationRules("/fixture.json")).resolves.toMatchObject({
      schemaVersion: 1,
      records: [{ id: "back-squat-choice", kind: "underspecified-name" }],
    });
  } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor);
    else Reflect.deleteProperty(globalThis, "fetch");
  }
});
