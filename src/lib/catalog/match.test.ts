import { exerciseCatalog } from "./exercises";
import { matchExercise } from "./match";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

describe("exercise catalog", () => {
  it("keeps generated catalog data in JSON with a small typed wrapper", () => {
    const generatedPath = path.join(process.cwd(), "src", "lib", "catalog", "exercises.generated.json");
    const wrapperPath = path.join(process.cwd(), "src", "lib", "catalog", "exercises.ts");

    expect(existsSync(generatedPath)).toBe(true);

    const generatedCatalog = JSON.parse(readFileSync(generatedPath, "utf8")) as unknown[];
    const wrapperSource = readFileSync(wrapperPath, "utf8");

    expect(generatedCatalog.length).toBeGreaterThan(800);
    expect(wrapperSource).toContain("./exercises.generated.json");
    expect(wrapperSource.length).toBeLessThan(1_000);
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
