import { swapExercise, addExercise } from "./exerciseSwap";
import type { ProgramDay } from "@/lib/programs/types";
import type { ExerciseCatalogItem } from "@/lib/catalog/exercises";

const mockDay: ProgramDay = {
  id: "day-1",
  dayNumber: 1,
  title: "Day 1",
  sections: [
    {
      id: "sec-1",
      type: "strength",
      name: "Main",
      groups: [
        {
          id: "grp-1",
          type: "single",
          exercises: [
            {
              id: "ex-1",
              name: "Squat",
              sets: 4,
              reps: "5",
              load: "100kg",
              rest: "3m",
              tags: { primary: ["quads"], secondary: ["glutes"], incidental: [], modifiers: [] },
            },
            {
              id: "ex-2",
              name: "Bench Press",
              sets: 3,
              reps: "8",
              tags: { primary: ["chest"], secondary: ["triceps"], incidental: [], modifiers: [] },
            },
          ],
        },
      ],
    },
  ],
};

const catalogItem: ExerciseCatalogItem = {
  id: "cat-leg-press",
  name: "Leg Press",
  aliases: [],
  equipment: ["machine"],
  movementPatterns: ["push"],
  muscles: { primary: ["quads"], secondary: ["glutes"] },
  tags: [],
};

describe("swapExercise", () => {
  it("replaces the target exercise name and canonicalExerciseId", () => {
    const result = swapExercise(mockDay, "ex-1", catalogItem);
    const ex = result.sections[0].groups[0].exercises[0];
    expect(ex.name).toBe("Leg Press");
    expect(ex.canonicalExerciseId).toBe("cat-leg-press");
  });

  it("keeps the same exercise id so the diff shows 'modified' not removed+added", () => {
    const result = swapExercise(mockDay, "ex-1", catalogItem);
    expect(result.sections[0].groups[0].exercises[0].id).toBe("ex-1");
  });

  it("preserves original sets, reps, load, rest from the original", () => {
    const result = swapExercise(mockDay, "ex-1", catalogItem);
    const ex = result.sections[0].groups[0].exercises[0];
    expect(ex.sets).toBe(4);
    expect(ex.reps).toBe("5");
    expect(ex.load).toBe("100kg");
    expect(ex.rest).toBe("3m");
  });

  it("populates tags from the catalog item muscles", () => {
    const result = swapExercise(mockDay, "ex-1", catalogItem);
    const tags = result.sections[0].groups[0].exercises[0].tags;
    expect(tags.primary).toEqual(["quads"]);
    expect(tags.secondary).toEqual(["glutes"]);
    expect(tags.incidental).toEqual([]);
    expect(tags.modifiers).toEqual([]);
  });

  it("leaves other exercises untouched", () => {
    const result = swapExercise(mockDay, "ex-1", catalogItem);
    const bench = result.sections[0].groups[0].exercises[1];
    expect(bench.name).toBe("Bench Press");
    expect(bench.id).toBe("ex-2");
  });

  it("returns the original day reference when targetId is not found", () => {
    const result = swapExercise(mockDay, "ex-999", catalogItem);
    expect(result).toBe(mockDay); // same reference, not just equal
  });
});

describe("addExercise", () => {
  it("appends a new single group to the target section", () => {
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const groups = result.sections[0].groups;
    expect(groups).toHaveLength(2);
    expect(groups[1].type).toBe("single");
  });

  it("new exercise has name and canonicalExerciseId from catalog item", () => {
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const ex = result.sections[0].groups[1].exercises[0];
    expect(ex.name).toBe("Leg Press");
    expect(ex.canonicalExerciseId).toBe("cat-leg-press");
  });

  it("new exercise gets default sets:3 reps:'8-10'", () => {
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const ex = result.sections[0].groups[1].exercises[0];
    expect(ex.sets).toBe(3);
    expect(ex.reps).toBe("8-10");
  });

  it("new exercise and group have unique string ids", () => {
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const newGroup = result.sections[0].groups[1];
    expect(typeof newGroup.id).toBe("string");
    expect(newGroup.id).not.toBe("grp-1");
    expect(typeof newGroup.exercises[0].id).toBe("string");
  });

  it("new exercise tags come from catalog item muscles", () => {
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const tags = result.sections[0].groups[1].exercises[0].tags;
    expect(tags.primary).toEqual(["quads"]);
    expect(tags.secondary).toEqual(["glutes"]);
    expect(tags.incidental).toEqual([]);
    expect(tags.modifiers).toEqual([]);
  });

  it("swapExercise reuses the original exercise id, not the catalog item id", () => {
    const original = mockDay.sections[0].groups[0].exercises[0];
    const result = swapExercise(mockDay, original.id, catalogItem);
    const swapped = result.sections[0].groups[0].exercises[0];
    expect(swapped.id).toBe(original.id);
    expect(swapped.id).not.toBe(catalogItem.id);
  });

  it("addExercise new exercise id is not any pre-existing exercise id in the day", () => {
    const existingIds = mockDay.sections.flatMap((s) =>
      s.groups.flatMap((g) => g.exercises.map((e) => e.id))
    );
    const result = addExercise(mockDay, "sec-1", catalogItem);
    const newId = result.sections[0].groups[1].exercises[0].id;
    expect(existingIds).not.toContain(newId);
  });

  it("returns original day reference when sectionId is not found", () => {
    const result = addExercise(mockDay, "sec-999", catalogItem);
    expect(result).toBe(mockDay);
  });

  it("leaves other sections untouched", () => {
    const day2: ProgramDay = {
      ...mockDay,
      sections: [
        mockDay.sections[0],
        { id: "sec-2", type: "warmup", name: "Warm-up", groups: [] },
      ],
    };
    const result = addExercise(day2, "sec-1", catalogItem);
    expect(result.sections[1].groups).toHaveLength(0);
  });
});
