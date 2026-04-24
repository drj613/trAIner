import { exerciseCatalog } from "./exercises";
import { matchExercise } from "./match";

describe("exercise catalog", () => {
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
