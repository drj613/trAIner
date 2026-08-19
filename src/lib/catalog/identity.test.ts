import { resolveExerciseIdentity } from "./identity";
import {
  backRack,
  barbell,
  highBar,
  highBarModifier,
  makeIdentityContext,
  squat,
} from "./identity.testFixtures";

const context = makeIdentityContext({
  catalogById: new Map([[highBar.id, highBar]]),
  movementsById: new Map([[squat.id, squat]]),
  modifiersById: new Map([
    [barbell.id, barbell],
    [backRack.id, backRack],
    [highBarModifier.id, highBarModifier],
  ]),
});

const genericBackSquat = { ...highBar, id: "barbell-back-squat", name: "Back Squat", aliases: [] };

const rememberedContext = makeIdentityContext({
  ...context,
  aliases: [{
    id: "a1",
    alias: "Back Squat",
    normalizedAlias: "back squat",
    canonicalExerciseId: highBar.id,
    provenance: "remembered",
    createdAt: "2026-08-18T00:00:00.000Z",
  }],
});

test("resolves raw hyphenated ids before name normalization", () => {
  expect(
    resolveExerciseIdentity(
      { kind: "catalog-reference", canonicalExerciseId: "barbell-high-bar-squat" },
      context,
    ),
  ).toMatchObject({
    concreteExerciseId: "barbell-high-bar-squat",
    movementId: "squat",
    specificity: "exact",
  });
});

test("never treats a slot id as canonical", () => {
  expect(
    resolveExerciseIdentity(
      {
        kind: "stored-exercise",
        slotId: "barbell-high-bar-squat",
        performedName: "Mystery lift",
      },
      context,
    ),
  ).toMatchObject({
    concreteExerciseId: undefined,
    groupKey: "slot:barbell-high-bar-squat",
  });
});

test("saved alias outranks underspecification", () => {
  expect(
    resolveExerciseIdentity({ kind: "import-name", name: "back squat" }, rememberedContext),
  ).toMatchObject({
    concreteExerciseId: "barbell-high-bar-squat",
    source: "saved-alias",
  });
});

test("follows a legacy redirect after exact catalogue lookup", () => {
  const redirected = makeIdentityContext({
    ...context,
    redirects: new Map([["old-high-bar-squat", highBar.id]]),
  });

  expect(
    resolveExerciseIdentity(
      { kind: "catalog-reference", canonicalExerciseId: "old-high-bar-squat" },
      redirected,
    ),
  ).toMatchObject({
    concreteExerciseId: highBar.id,
    source: "legacy-redirect",
    specificity: "exact",
  });
});

test("resolves a custom exercise by its explicit custom id", () => {
  const custom = { id: "user-1", name: "My Squat", createdAt: "2026-08-18T00:00:00.000Z" };
  const customContext = makeIdentityContext({ ...context, userExercises: [custom] });

  expect(
    resolveExerciseIdentity(
      { kind: "custom-exercise", exerciseId: custom.id, name: "Ignored label" },
      customContext,
    ),
  ).toMatchObject({
    concreteExerciseId: custom.id,
    displayLabel: "My Squat",
    source: "catalog-id",
    specificity: "exact",
  });
});

test("returns an underspecified identity before a generic canonical name", () => {
  const underspecifiedContext = makeIdentityContext({
    ...context,
    catalogById: new Map([
      [highBar.id, highBar],
      [genericBackSquat.id, genericBackSquat],
    ]),
    disambiguations: new Map([["back squat", {
      id: "back-squat-choice",
      kind: "underspecified-name" as const,
      normalizedName: "back squat",
      movementId: "squat",
      candidateExerciseIds: [highBar.id],
      matchedModifierIds: ["barbell", "back-rack"],
    }]]),
  });

  expect(
    resolveExerciseIdentity({ kind: "import-name", name: "Back Squat" }, underspecifiedContext),
  ).toMatchObject({
    concreteExerciseId: undefined,
    movementId: "squat",
    groupKey: "movement:squat",
    source: "standalone",
    specificity: "underspecified",
  });
});

test("applies a normalized-name override before an underspecified rule can select a generic name", () => {
  const coexistenceContext = makeIdentityContext({
    ...context,
    catalogById: new Map([
      [highBar.id, highBar],
      [genericBackSquat.id, genericBackSquat],
    ]),
    disambiguations: new Map([["back squat", {
      id: "back-squat-choice",
      kind: "underspecified-name" as const,
      normalizedName: "back squat",
      movementId: "squat",
      candidateExerciseIds: [highBar.id],
      matchedModifierIds: ["barbell", "back-rack"],
    }]]),
    normalizationOverrides: [{
      id: "override-back-squat",
      targetKind: "normalized-name",
      targetValue: "Back Squat",
      movementId: "squat",
      movementModifierIds: ["barbell"],
      updatedAt: "2026-08-18T00:00:00.000Z",
    }],
  });

  expect(resolveExerciseIdentity({ kind: "import-name", name: "Back Squat" }, coexistenceContext))
    .toMatchObject({
      concreteExerciseId: undefined,
      groupKey: "movement:squat",
      movementModifierIds: ["barbell"],
      source: "user-override",
      specificity: "overridden",
    });
});

test("resolves unique canonical names, catalogue aliases, and custom names in precedence order", () => {
  const aliasOnly = { ...highBar, id: "high-bar-variant", name: "High Bar Variant", aliases: ["athletic squat"] };
  const custom = { id: "user-2", name: "Moon Squat", createdAt: "2026-08-18T00:00:00.000Z" };
  const precedenceContext = makeIdentityContext({
    ...context,
    catalogById: new Map([
      [highBar.id, highBar],
      [aliasOnly.id, aliasOnly],
    ]),
    userExercises: [custom],
  });

  expect(resolveExerciseIdentity({ kind: "import-name", name: highBar.name }, precedenceContext))
    .toMatchObject({ concreteExerciseId: highBar.id, source: "legacy-name" });
  expect(resolveExerciseIdentity({ kind: "import-name", name: "Athletic Squat" }, precedenceContext))
    .toMatchObject({ concreteExerciseId: aliasOnly.id, source: "legacy-name" });
  expect(resolveExerciseIdentity({ kind: "import-name", name: custom.name }, precedenceContext))
    .toMatchObject({ concreteExerciseId: custom.id, source: "legacy-name" });
});

test("applies an exercise override after concrete identification and orders modifier labels", () => {
  const overrideContext = makeIdentityContext({
    ...context,
    normalizationOverrides: [{
      id: "override-1",
      targetKind: "exercise-id",
      targetValue: highBar.id,
      movementId: "squat",
      movementModifierIds: ["high-bar", "barbell", "back-rack"],
      updatedAt: "2026-08-18T00:00:00.000Z",
    }],
  });

  expect(
    resolveExerciseIdentity(
      { kind: "catalog-reference", canonicalExerciseId: highBar.id },
      overrideContext,
    ),
  ).toMatchObject({
    concreteExerciseId: highBar.id,
    movementModifierIds: ["barbell", "back-rack", "high-bar"],
    movementModifierNames: ["Barbell", "Back Rack", "High Bar"],
    source: "user-override",
    specificity: "overridden",
  });
});

test("uses a normalized-name override to classify an otherwise unmatched name", () => {
  const overrideContext = makeIdentityContext({
    ...context,
    normalizationOverrides: [{
      id: "override-2",
      targetKind: "normalized-name",
      targetValue: "Hatfield Squat",
      movementId: "squat",
      movementModifierIds: ["barbell"],
      updatedAt: "2026-08-18T00:00:00.000Z",
    }],
  });

  expect(resolveExerciseIdentity({ kind: "import-name", name: "hatfield squat" }, overrideContext))
    .toMatchObject({
      concreteExerciseId: undefined,
      groupKey: "movement:squat",
      movementModifierIds: ["barbell"],
      source: "user-override",
      specificity: "overridden",
    });
});

test("preserves the performed name separately from the current catalogue label", () => {
  expect(
    resolveExerciseIdentity({
      kind: "stored-exercise",
      canonicalExerciseId: highBar.id,
      slotId: "routine-slot-1",
      performedName: "My old high-bar squat label",
    }, context),
  ).toMatchObject({
    displayLabel: highBar.name,
    currentVersionLabel: highBar.name,
    performedName: "My old high-bar squat label",
    groupKey: "movement:squat",
  });
});
