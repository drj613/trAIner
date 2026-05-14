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
