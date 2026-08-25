import {
  buildRegistries,
  canonicalizeModifiers,
  findNearDuplicateCandidates,
  signatureFor,
} from "./normalize";
import {
  flattenMerges,
  idForSignature,
  joinCandidateReviews,
  loadVariantCandidates,
  loadVariantReviews,
  materializeVariant,
  validateAliasOutcomes,
  validateRegistries,
  validateVariantCandidates,
} from "./validate";
import type {
  BuildRegistries,
  CatalogExercise,
  ModifierCategory,
  MovementDefinition,
  MovementModifierDefinition,
  VariantCandidate,
  VariantReviewDecision,
  VariantRule,
} from "./types";
import movementsArtifact from "../movements.json";
import modifiersArtifact from "../modifiers.json";
import snapshotArtifact from "../catalog-v1.snapshot.json";
import {
  approveHighBar,
  approvedCableRowRule,
  compileFixture,
  exercise,
  highBarCandidate,
  newPausedHighBarRule,
  rejectHighBar,
  twoSecondPause,
} from "./testFixtures";

export const TIER_1_MOVEMENT_IDS = [
  "squat",
  "bench-press",
  "deadlift-hinge",
  "row",
  "pull-up-pulldown",
  "overhead-landmine-press",
  "lunge-split-squat",
  "push-up",
  "curl",
  "triceps-extension-pushdown",
  "raise-fly",
  "loaded-carry",
] as const;

test("candidate artifact covers Tier-1 and respects the cap", async () => {
  const artifact = await loadVariantCandidates();
  expect(new Set(artifact.records.map((r) => r.movementId))).toEqual(new Set(TIER_1_MOVEMENT_IDS));
  expect(artifact.records.length).toBeLessThanOrEqual(300);
  expect(artifact.records.every((r) => r.status === "candidate" && r.rationale.length >= 20)).toBe(true);

  const registries = buildRegistries(
    movementsArtifact.records as MovementDefinition[],
    modifiersArtifact.records as MovementModifierDefinition[],
  );
  const snapshot = snapshotArtifact as CatalogExercise[];
  validateVariantCandidates(
    artifact.records,
    registries,
    new Map(snapshot.map((exercise) => [exercise.id, exercise])),
  );
});

test("alias collision validation accepts an explicit unique target", () => {
  const finalAliases = new Map([["barbell curl", ["barbell-curl", "curl--barbell"]]]);
  const explicitUnique = new Map([
    ["barbell curl", {
      normalizedToken: "barbell curl",
      outcome: "unique" as const,
      exerciseId: "barbell-curl",
    }],
  ]);

  expect(() => validateAliasOutcomes(finalAliases, explicitUnique)).not.toThrow();
});

test("alias collision validation rejects a unique target outside the candidates", () => {
  const finalAliases = new Map([["barbell curl", ["barbell-curl", "curl--barbell"]]]);
  const explicitUnique = new Map([
    ["barbell curl", {
      normalizedToken: "barbell curl",
      outcome: "unique" as const,
      exerciseId: "unrelated-exercise",
    }],
  ]);

  expect(() => validateAliasOutcomes(finalAliases, explicitUnique)).toThrow(
    "Alias classification target missing: barbell curl",
  );
});

test("candidate validation rejects empty required metadata from a full snapshot", async () => {
  const artifact = await loadVariantCandidates();
  const registries = buildRegistries(
    movementsArtifact.records as MovementDefinition[],
    modifiersArtifact.records as MovementModifierDefinition[],
  );
  const snapshot = snapshotArtifact as CatalogExercise[];
  const metadataById = new Map(snapshot.map((exercise) => [exercise.id, exercise]));
  const malformed = artifact.records.map((candidate, index) =>
    index === 0 ? { ...candidate, metadataFromExerciseId: "suitcase-carry" } : candidate,
  );

  expect(() =>
    validateVariantCandidates(
      malformed,
      registries,
      metadataById,
    ),
  ).toThrow("Candidate metadata base has empty required fields: suitcase-carry");

  const incompatible = artifact.records.map((candidate) =>
    candidate.id === "squat--dumbbell"
      ? { ...candidate, metadataFromExerciseId: "barbell-squat" }
      : candidate,
  );
  expect(() => validateVariantCandidates(incompatible, registries, metadataById)).toThrow(
    "Candidate metadata base incompatible with implement: squat--dumbbell",
  );
});

test("candidate bases preserve support, laterality, and position identity", async () => {
  const artifact = await loadVariantCandidates();
  const candidate = (id: string) => artifact.records.find((record) => record.id === id);

  expect(candidate("squat--dumbbell")?.metadataFromExerciseId).toBe("dumbbell-squat");
  expect(candidate("loaded-carry--barbell")?.metadataFromExerciseId).toBe("farmer-carry");
  expect(candidate("loaded-carry--barbell--single-arm")?.metadataFromExerciseId).toBe("farmer-carry");
  expect(candidate("loaded-carry--kettlebell--single-arm")?.metadataFromExerciseId).toBe("farmer-carry");
  expect(candidate("loaded-carry--dumbbell--single-arm")?.metadataFromExerciseId).toBe("farmer-carry");
  expect(candidate("row--dumbbell--bench-supported")?.metadataFromExerciseId).toBe("bent-over-dumbbell-rows");
  expect(candidate("row--dumbbell--bench-supported")?.metadataOverrides?.muscles?.secondary).toEqual([
    "biceps",
    "forearms",
  ]);
  expect(candidate("row--dumbbell--single-arm")?.metadataFromExerciseId).toBe("one-arm-dumbbell-row");
  expect(candidate("triceps-extension-pushdown--band--overhead")?.metadataFromExerciseId).toBe(
    "speed-band-overhead-triceps",
  );
  expect(candidate("triceps-extension-pushdown--band--overhead")?.metadataOverrides?.muscles?.secondary).toEqual([
    "shoulders",
  ]);
  expect(candidate("raise-fly--band--fly")?.metadataFromExerciseId).toBe("back-flyes-with-bands");
});

test("Romanian deadlift canonicalization includes its hinge identity", () => {
  const registries = buildRegistries(
    movementsArtifact.records as MovementDefinition[],
    modifiersArtifact.records as MovementModifierDefinition[],
  );

  expect(canonicalizeModifiers("deadlift-hinge", ["barbell", "romanian"], registries)).toEqual([
    "barbell",
    "hinge",
    "romanian",
  ]);
});

test("combined families include canonical hinge and fly identities", async () => {
  const artifact = await loadVariantCandidates();
  const modifierIds = new Set((modifiersArtifact.records as MovementModifierDefinition[]).map((modifier) => modifier.id));

  expect(modifierIds.has("romanian")).toBe(true);
  expect(modifierIds.has("hinge")).toBe(true);
  expect(modifierIds.has("fly")).toBe(true);
  expect(artifact.records.some((candidate) =>
    candidate.movementId === "deadlift-hinge" && candidate.movementModifierIds.includes("romanian"),
  )).toBe(true);
  expect(artifact.records.some((candidate) =>
    candidate.movementId === "deadlift-hinge" && candidate.movementModifierIds.includes("hinge"),
  )).toBe(true);
  expect(artifact.records.some((candidate) =>
    candidate.movementId === "raise-fly" && candidate.movementModifierIds.includes("fly"),
  )).toBe(true);
});

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
      name: "transitive closure conflict",
      registries: withRegistries(base, {
        modifiersById: modifiers({
          a: { implies: ["b", "c"] },
          b: { excludes: ["c"] },
          c: { excludes: ["b"] },
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

test("final alias collision validation rejects an unclassified collision", () => {
  expect(() =>
    validateAliasOutcomes(new Map([["row", ["barbell-row", "cable-row"]]]), new Map()),
  ).toThrow("Unclassified alias collision: row");
});

test.each(invalidRegistryFixtures())("rejects $name", ({ registries, expected }) => {
  expect(() => validateRegistries(registries)).toThrow(expected);
});

test("rejects duplicate movement and modifier registry orders", () => {
  const duplicateModifierOrder = makeModifierRegistryFixture({
    movementId: "squat",
    allowedModifierIds: ["a", "b"],
    modifiers: [{ id: "a", sortOrder: 1 }, { id: "b", sortOrder: 1 }],
  });
  expect(() => validateRegistries(duplicateModifierOrder)).toThrow("Duplicate modifier sort order");

  const uniqueModifierOrder = makeModifierRegistryFixture({
    movementId: "squat",
    allowedModifierIds: ["a", "b"],
    modifiers: [{ id: "a", sortOrder: 1 }, { id: "b", sortOrder: 2 }],
  });
  const duplicateMovementOrder = withRegistries(uniqueModifierOrder, {
    movementsById: new Map([
      ...uniqueModifierOrder.movementsById,
      [
        "lunge",
        {
          ...uniqueModifierOrder.movementsById.get("squat")!,
          id: "lunge",
          name: "lunge",
        },
      ],
    ]),
  });
  expect(() => validateRegistries(duplicateMovementOrder)).toThrow("Duplicate movement sort order");
});

test("rejects front rack with an implied back rack", () => {
  const registries = buildRegistries(
    movementsArtifact.records as MovementDefinition[],
    modifiersArtifact.records as MovementModifierDefinition[],
  );

  expect(() => canonicalizeModifiers("squat", ["front-rack", "high-bar"], registries)).toThrow(
    "Modifier closure conflict",
  );
});

test("reports close canonical names for review without merging them", () => {
  const exercises: CatalogExercise[] = [
    {
      id: "bench-press",
      name: "Bench Press",
      aliases: [],
      equipment: [],
      movementPatterns: [],
      muscles: { primary: [], secondary: [] },
      tags: [],
    },
    {
      id: "bench-pres",
      name: "Bench Pres",
      aliases: [],
      equipment: [],
      movementPatterns: [],
      muscles: { primary: [], secondary: [] },
      tags: [],
    },
  ];

  expect(findNearDuplicateCandidates(exercises)).toEqual([
    {
      exerciseIdA: "bench-pres",
      exerciseIdB: "bench-press",
      normalizedNameA: "bench pres",
      normalizedNameB: "bench press",
      similarity: 0.9091,
      disposition: "review-required",
    },
  ]);
});

test("review decisions emit only independently approved candidates", () => {
  const candidate = {
    id: "two-second-pause",
    movementId: "squat",
    movementModifierIds: ["paused"],
    metadataFromExerciseId: "barbell-squat",
    approvedAliases: ["paused barbell squat"],
    coverageTier: 1,
    status: "candidate",
    rationale: "A coarse paused identity deliberately excludes duration prescriptions.",
  } satisfies VariantCandidate;
  const review: VariantReviewDecision = {
    candidateId: candidate.id,
    decision: "reject",
    reason: "Numeric pause duration is a prescription, not a stable identity.",
  };

  expect(joinCandidateReviews([candidate], [review])).toEqual([{ candidate, review }]);
  expect(joinCandidateReviews([candidate], [review])[0].review.decision).toBe("reject");
});

test("emits only independently approved rules", async () => {
  const result = await compileFixture({
    candidates: [twoSecondPause],
    reviews: [{
      candidateId: twoSecondPause.id,
      decision: "reject",
      reason: "duration is prescription",
    }],
  });
  expect(result.exercises.some((candidate) => candidate.id === twoSecondPause.id)).toBe(false);
});

test("existing signatures retain existing IDs in a compiler fixture", async () => {
  const result = await compileFixture({ approvedRule: {
    ...highBarCandidate,
    status: "approved",
  } });
  expect(result.bySignature.get("squat|barbell|back-rack|high-bar")?.id).toBe(
    "barbell-high-bar-squat",
  );
});

test("new fixture IDs and labels derive from the canonical signature", async () => {
  const result = await compileFixture({ approvedRule: newPausedHighBarRule });
  expect(result.bySignature.get("squat|barbell|back-rack|high-bar|paused")).toMatchObject({
    id: "squat--barbell--back-rack--high-bar--paused",
    name: "Paused High Bar Back Squat",
  });
});

test("fixture helpers expose one-decision validation and reviewed overrides", () => {
  expect(() => joinCandidateReviews([highBarCandidate], [])).toThrow(
    "missing review decision: existing-high-bar",
  );
  expect(() => joinCandidateReviews([highBarCandidate], [approveHighBar, rejectHighBar])).toThrow(
    "duplicate review decision: existing-high-bar",
  );
  const baseExercise = exercise({
    id: "cable-row",
    equipment: ["cable"],
    movementPatterns: ["horizontal-pull"],
    primaryMuscles: ["back"],
    tags: ["strength"],
  });
  expect(materializeVariant(baseExercise, {
    ...approvedCableRowRule,
    metadataOverrides: { muscles: { primary: ["upper-back"], secondary: ["biceps"] } },
  })).toMatchObject({
    equipment: ["cable"],
    movementPatterns: ["horizontal-pull"],
    muscles: { primary: ["upper-back"], secondary: ["biceps"] },
    tags: ["strength"],
  });
});

test("requires exactly one independent decision per candidate", () => {
  const candidate = {
    id: "existing-high-bar",
    movementId: "squat",
    movementModifierIds: ["barbell", "back-rack", "high-bar"],
    metadataFromExerciseId: "barbell-high-bar-squat",
    approvedAliases: [],
    coverageTier: 1,
    status: "candidate",
    rationale: "Existing reviewed high-bar squat identity remains mechanically distinct.",
  } satisfies VariantCandidate;
  const approve: VariantReviewDecision = {
    candidateId: candidate.id,
    decision: "approve",
    reason: "Mechanically distinct and already represented.",
  };
  const reject: VariantReviewDecision = {
    candidateId: candidate.id,
    decision: "reject",
    reason: "Duplicate decision used to exercise the validator.",
  };

  expect(() => joinCandidateReviews([candidate], [])).toThrow(
    "missing review decision: existing-high-bar",
  );
  expect(() => joinCandidateReviews([candidate], [approve, reject])).toThrow(
    "duplicate review decision: existing-high-bar",
  );
});

test("existing signatures retain existing IDs and new IDs derive from canonical signatures", () => {
  expect(idForSignature("squat", ["barbell", "back-rack", "high-bar"])).toBe(
    "squat--barbell--back-rack--high-bar",
  );
  expect(idForSignature("squat", ["barbell", "back-rack", "high-bar", "paused"])).toBe(
    "squat--barbell--back-rack--high-bar--paused",
  );
});

test("materializes only reviewed metadata overrides from a populated base", () => {
  const baseExercise: CatalogExercise = {
    id: "cable-row",
    name: "Cable Row",
    aliases: [],
    equipment: ["cable"],
    movementPatterns: ["horizontal-pull"],
    muscles: { primary: ["back"], secondary: [] },
    tags: ["strength"],
  };
  const rule: VariantRule = {
    id: "cable-row-upper-back",
    movementId: "row",
    movementModifierIds: ["cable"],
    metadataFromExerciseId: baseExercise.id,
    metadataOverrides: { muscles: { primary: ["upper-back"], secondary: ["biceps"] } },
    approvedAliases: ["cable upper back row"],
    coverageTier: 1,
    status: "approved",
  };

  expect(materializeVariant(baseExercise, rule)).toMatchObject({
    id: "cable-row-upper-back",
    name: "Cable Row",
    equipment: ["cable"],
    movementPatterns: ["horizontal-pull"],
    muscles: { primary: ["upper-back"], secondary: ["biceps"] },
    tags: ["strength"],
  });
});

test("materialized variants do not inherit generic or prescription aliases", () => {
  const baseExercise: CatalogExercise = {
    id: "barbell-deadlift",
    name: "Barbell Deadlift",
    aliases: ["BB Deadlift", "Farmer Carry with 2-Second March Pauses"],
    equipment: ["barbell"],
    movementPatterns: ["strength"],
    muscles: { primary: ["glutes"], secondary: ["hamstrings"] },
    tags: ["strength"],
  };
  const rule: VariantRule = {
    id: "deadlift-hinge--barbell--paused",
    movementId: "deadlift-hinge",
    movementModifierIds: ["barbell", "paused"],
    metadataFromExerciseId: baseExercise.id,
    approvedAliases: ["paused barbell deadlift"],
    coverageTier: 1,
    status: "approved",
  };

  expect(materializeVariant(baseExercise, rule).aliases).toEqual(["paused barbell deadlift"]);
});

test("materialization rejects undeclared extra implement equipment", () => {
  const baseExercise: CatalogExercise = {
    id: "farmer-carry",
    name: "Farmer Carry",
    aliases: [],
    equipment: ["kettlebell", "dumbbell"],
    movementPatterns: ["loaded carry"],
    muscles: { primary: ["traps"], secondary: ["forearms"] },
    tags: ["loaded-carry"],
  };
  const rule: VariantRule = {
    id: "loaded-carry--dumbbell--neutral-grip",
    movementId: "loaded-carry",
    movementModifierIds: ["dumbbell", "neutral-grip"],
    metadataFromExerciseId: baseExercise.id,
    approvedAliases: ["neutral grip dumbbell carry"],
    coverageTier: 1,
    status: "approved",
  };

  expect(() => materializeVariant(baseExercise, rule)).toThrow(
    "Variant metadata base has conflicting implement equipment: loaded-carry--dumbbell--neutral-grip",
  );
});

test("review artifact loader rejects field-level schema violations", async () => {
  const artifact = await loadVariantReviews();
  expect(artifact.schemaVersion).toBe(1);
  expect(artifact.records.length).toBeGreaterThan(0);
  expect(artifact.records.every((record) => record.reason.trim().length > 0)).toBe(true);
});
