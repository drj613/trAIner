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
});
