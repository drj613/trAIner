import { exerciseCatalog } from "./exercises";
import { matchExercise } from "./match";
import { backRack, barbell, highBar, makeIdentityContext, squat } from "./identity.testFixtures";

describe("exercise catalog", () => {
  it("exposes generated catalogue records with runtime identity metadata", () => {
    expect(exerciseCatalog.length).toBeGreaterThan(800);
    expect(exerciseCatalog.find((item) => item.id === "barbell-high-bar-squat"))
      .toMatchObject({
        movementId: "squat",
        movementModifierIds: ["barbell", "back-rack", "high-bar"],
      });
  });

  it("bundles the free-exercise-db dataset with normalized metadata", () => {
    expect(exerciseCatalog.length).toBeGreaterThan(800);
    expect(exerciseCatalog.find((item) => item.id === "alternate-incline-dumbbell-curl")).toMatchObject({
      name: "Alternate Incline Dumbbell Curl",
      equipment: ["dumbbell"],
      muscles: {
        primary: expect.arrayContaining(["biceps"])
      },
      tags: expect.arrayContaining(["strength", "beginner", "isolation", "pull"])
    });
  });

  it("matches upstream names and common gym aliases", () => {
    expect(matchExercise("Alternate Incline Dumbbell Curl")).toMatchObject({
      kind: "matched",
      item: { id: "alternate-incline-dumbbell-curl" }
    });
    expect(matchExercise("DB Bench")).toMatchObject({
      kind: "matched",
      item: { id: "dumbbell-bench-press" }
    });
  });

  it("matches 'Machine Lateral Raise' to its catalog entry", () => {
    expect(matchExercise("Machine Lateral Raise")).toMatchObject({
      kind: "matched",
      item: { id: "lateral-raise-machine" },
    });
  });

  it("matches 'Medicine Ball Slam' to its catalog entry", () => {
    expect(matchExercise("Medicine Ball Slam")).toMatchObject({
      kind: "matched",
      item: { id: "slam-medicine-ball" },
    });
  });

  it("matches the handstand, glute, and biceps specialization exercise vocabulary", () => {
    const exerciseNames = [
      "Hip, Ankle and Thoracic CARs",
      "Banded Terminal Knee Extension",
      "Chest-to-Wall Handstand Hold",
      "Smith Machine Hip Thrust",
      "B-Stance Barbell Hip Thrust",
      "Paused Barbell Hip Thrust",
      "Safety-Bar Pin Squat to Comfortable Depth",
      "Tempo Safety-Bar Box Squat",
      "Safety-Bar Box Squat with Light Band at Knees",
      "Safety-Bar Side Lunge",
      "Dumbbell Lateral Lunge",
      "Safety-Bar Cossack Box Squat",
      "Cable-Supported Safety-Bar Side Lunge",
      "Reverse Nordic",
      "Assisted Reverse Nordic",
      "Spanish Squat",
      "Eccentric Reverse Nordic",
      "Front-Rack Kettlebell Carry",
      "Thoracic Extension and Scapular CARs",
      "Band Face Pull and External Rotation",
      "Paused Barbell Bench Press",
      "Close-Grip Paused Barbell Bench Press",
      "Spoto Press",
      "Deficit Romanian Deadlift",
      "Snatch-Grip Romanian Deadlift",
      "Neutral-Grip Pull-Up",
      "Ring Pull-Up",
      "Neutral-Grip Pull-Up with 2-Second Eccentric",
      "Bayesian Cable Curl",
      "Trap-Bar Carry",
      "Farmer Carry with 2-Second March Pauses",
      "Hip CARs, Adductor Rockbacks and Ankle Mobilization",
      "Banded Glute Bridge and Lateral Walk",
      "Wall Kick-Up to Controlled Hold",
      "Front-Foot-Elevated Bulgarian Split Squat",
      "Front-Foot-Elevated Bulgarian Split Squat with Forward Torso Lean",
      "Half-Kneeling Landmine Press",
      "Tall-Kneeling Landmine Press",
      "Incline Neutral-Grip Dumbbell Press",
      "Half-Kneeling Single-Arm Landmine Press",
      "Seal Row",
      "Single-Arm Cable Row",
      "Chest-Supported Wide-Elbow Row",
      "Cable Hip Abduction",
      "Seated Hip Abduction Machine",
      "Banded Standing Hip Abduction",
      "Cable Hip Abduction with Slight Hip Hinge",
      "Offset Front-Rack Carry",
      "Cat-Camel, Thoracic Rotation and Hip Hinge Drill",
      "Band Pull-Apart and Scapular Pull-Up",
      "High-Handle Trap-Bar Deadlift",
      "Block Pull",
      "High-Handle Trap-Bar Deadlift with 2-Second Pause Below Knee",
      "Conventional Deadlift from Blocks",
      "Neutral-Grip Incline Dumbbell Press",
      "Ring Push-Up",
      "Single-Arm Lat Pulldown",
      "Straight-Arm Cable Pulldown",
      "Kneeling Single-Arm Lat Pulldown",
      "Single-Arm Lat Pulldown with 2-Second Stretch",
      "Machine Preacher Curl",
      "Preacher Curl with 2-Second Eccentric",
      "Rope Hammer Curl",
      "Reverse EZ-Bar Curl",
      "Waiter Carry",
    ];

    expect(exerciseNames.filter((name) => matchExercise(name).kind === "unmatched")).toEqual([]);
  });
});

describe("user exercise matching", () => {
  const userExercises = [
    { id: "user-abc123", name: "Moon Plank", createdAt: "2026-05-06T00:00:00Z" },
  ];
  const userAliases = [
    {
      id: "alias-1",
      alias: "Moon Side Plank",
      normalizedAlias: "moon side plank",
      canonicalExerciseId: "user-abc123",
      createdAt: "2026-05-06T00:00:00Z",
    },
  ];

  it("resolves a user exercise via a saved alias", () => {
    const result = matchExercise("Moon Side Plank", userAliases, userExercises);
    expect(result).toMatchObject({
      kind: "matched",
      item: { id: "user-abc123", name: "Moon Plank" },
      via: "user-alias",
    });
  });

  it("resolves a user exercise by exact normalized name when no alias exists", () => {
    const result = matchExercise("Moon Plank", [], userExercises);
    expect(result).toMatchObject({
      kind: "matched",
      item: { id: "user-abc123", name: "Moon Plank" },
      via: "user-exercise",
    });
  });

  it("returns unmatched when user exercises are empty and no catalog match", () => {
    const result = matchExercise("Moon Side Plank", [], []);
    expect(result.kind).toBe("unmatched");
  });
});

describe("tri-state identity matching", () => {
  const genericBackSquat = { ...highBar, id: "barbell-back-squat", name: "Back Squat", aliases: [] };
  const pausedHighBar = {
    ...highBar,
    id: "paused-high-bar-squat",
    name: "Paused High Bar Back Squat",
    aliases: ["paused high bar back squat"],
    movementModifierIds: ["barbell", "back-rack", "high-bar", "paused"],
  };

  test("returns an underspecified result before a generic concrete name", () => {
    const context = makeIdentityContext({
      catalogById: new Map([
        [highBar.id, highBar],
        [genericBackSquat.id, genericBackSquat],
      ]),
      movementsById: new Map([[squat.id, squat]]),
      modifiersById: new Map([
        [barbell.id, barbell],
        [backRack.id, backRack],
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

    expect(matchExercise("Back Squat", [], [], context)).toMatchObject({
      kind: "underspecified",
      movementId: "squat",
      candidates: [{ exerciseId: highBar.id, name: highBar.name }],
      matchedModifierIds: ["barbell", "back-rack"],
      nonIdentityAnnotations: [],
    });
  });

  test("lets a saved alias intentionally resolve an underspecified name", () => {
    const context = makeIdentityContext({
      catalogById: new Map([[highBar.id, highBar]]),
      movementsById: new Map([[squat.id, squat]]),
      disambiguations: new Map([["back squat", {
        id: "back-squat-choice",
        kind: "underspecified-name" as const,
        normalizedName: "back squat",
        movementId: "squat",
        candidateExerciseIds: [highBar.id],
        matchedModifierIds: [],
      }]]),
    });
    const aliases = [{
      id: "a1",
      alias: "Back Squat",
      normalizedAlias: "back squat",
      canonicalExerciseId: highBar.id,
      provenance: "remembered" as const,
      createdAt: "2026-08-18T00:00:00.000Z",
    }];

    expect(matchExercise("Back Squat", aliases, [], context)).toMatchObject({
      kind: "matched",
      item: { id: highBar.id },
      via: "user-alias",
    });
  });

  test("reports a canonical-name match as normalized before considering a duplicate alias", () => {
    const item = { ...highBar, aliases: [highBar.name] };
    const context = makeIdentityContext({
      catalogById: new Map([[item.id, item]]),
      movementsById: new Map([[squat.id, squat]]),
    });

    expect(matchExercise(highBar.name, [], [], context)).toMatchObject({
      kind: "matched",
      item: { id: highBar.id },
      via: "normalized",
    });
  });

  test("canonicalizes a numeric pause while preserving its non-identity annotation", () => {
    const context = makeIdentityContext({
      catalogById: new Map([[pausedHighBar.id, pausedHighBar]]),
      movementsById: new Map([[squat.id, squat]]),
      disambiguations: new Map([["2 second paused", {
        id: "two-second-pause",
        kind: "non-identity-phrase" as const,
        normalizedPhrase: "2 second paused",
        annotation: "2-second pause",
        behavior: "paused-duration" as const,
      }]]),
    });

    expect(matchExercise("2-second paused High Bar Back Squat", [], [], context)).toMatchObject({
      kind: "matched",
      item: { id: pausedHighBar.id },
    });
  });

  test("does not silently match an alternative prescription containing or", () => {
    const context = makeIdentityContext({
      catalogById: new Map([[highBar.id, highBar]]),
      movementsById: new Map([[squat.id, squat]]),
      disambiguations: new Map([["or", {
        id: "alternatives",
        kind: "non-identity-phrase" as const,
        normalizedPhrase: "or",
        annotation: "alternative prescription",
        behavior: "reject-alternative" as const,
      }]]),
    });

    expect(matchExercise("High Bar or Back Squat", [], [], context)).toMatchObject({
      kind: "unmatched",
      nonIdentityAnnotations: ["alternative prescription"],
    });
  });

  test("keeps unrecognized names as standalone unmatched suggestions", () => {
    const context = makeIdentityContext({
      catalogById: new Map([[highBar.id, highBar]]),
      movementsById: new Map([[squat.id, squat]]),
    });

    expect(matchExercise("Uncharted Squat", [], [], context)).toMatchObject({
      kind: "unmatched",
      nonIdentityAnnotations: [],
    });
  });
});
