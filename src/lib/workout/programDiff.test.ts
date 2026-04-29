import { diffDays, remapExerciseIds } from "./programDiff";
import type { ProgramDay } from "@/lib/programs/types";

const base: ProgramDay = {
  id: "d1", dayNumber: 1, title: "Upper A",
  sections: [{
    id: "s1", type: "strength", name: "Strength",
    groups: [{
      id: "g1", type: "single",
      exercises: [
        { id: "e1", name: "Bench Press", sets: 3, reps: "8-10", tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },
        { id: "e2", name: "Row", sets: 3, reps: "10", tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },
      ],
    }],
  }],
};

const modified: ProgramDay = {
  id: "d1", dayNumber: 1, title: "Upper A",
  sections: [{
    id: "s1", type: "strength", name: "Strength",
    groups: [{
      id: "g1", type: "single",
      exercises: [
        { id: "e1", name: "Bench Press", sets: 4, reps: "6-8", tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },
        { id: "e3", name: "Pull-up", sets: 3, reps: "AMRAP", tags: { primary: [], secondary: [], incidental: [], modifiers: [] } },
      ],
    }],
  }],
};

describe("diffDays", () => {
  it("detects modified exercise (sets changed)", () => {
    const result = diffDays(base, modified);
    const changed = result.find((r) => r.exerciseId === "e1");
    expect(changed?.type).toBe("modified");
    expect(changed?.before?.sets).toBe(3);
    expect(changed?.after?.sets).toBe(4);
  });

  it("detects removed exercise", () => {
    const result = diffDays(base, modified);
    expect(result.find((r) => r.exerciseId === "e2")?.type).toBe("removed");
  });

  it("detects added exercise", () => {
    const result = diffDays(base, modified);
    expect(result.find((r) => r.exerciseId === "e3")?.type).toBe("added");
  });

  it("returns empty array when days are identical", () => {
    expect(diffDays(base, base)).toHaveLength(0);
  });
});

// Helpers for remapExerciseIds tests
const makeDay = (exercises: { id: string; name: string }[]): ProgramDay => ({
  id: "d1", dayNumber: 1, title: "Day",
  sections: [{
    id: "s1", type: "strength", name: "Strength",
    groups: [{
      id: "g1", type: "single",
      exercises: exercises.map((e) => ({
        ...e, sets: 3, reps: "10",
        tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
      })),
    }],
  }],
});

describe("remapExerciseIds", () => {
  it("re-maps parser-generated IDs to original IDs by name", () => {
    const original = makeDay([{ id: "orig-e1", name: "Bench Press" }, { id: "orig-e2", name: "Row" }]);
    // Simulate parser output: same names but fresh UUIDs, sets changed for Bench
    const parsed = makeDay([{ id: "new-uuid-1", name: "Bench Press" }, { id: "new-uuid-2", name: "Row" }]);
    const remapped = remapExerciseIds(original, parsed);
    const exercises = remapped.sections[0].groups[0].exercises;
    expect(exercises[0].id).toBe("orig-e1");
    expect(exercises[1].id).toBe("orig-e2");
  });

  it("leaves added exercises with their fresh parser UUIDs", () => {
    const original = makeDay([{ id: "orig-e1", name: "Bench Press" }, { id: "orig-e2", name: "Row" }]);
    // AI replaces Row with Pull-up at same position
    const parsed = makeDay([{ id: "new-uuid-1", name: "Bench Press" }, { id: "new-uuid-pullup", name: "Pull-up" }]);
    const remapped = remapExerciseIds(original, parsed);
    const exercises = remapped.sections[0].groups[0].exercises;
    // Bench maps to original ID
    expect(exercises[0].id).toBe("orig-e1");
    // Pull-up is new — keeps parser UUID (not Row's id)
    expect(exercises[1].id).toBe("new-uuid-pullup");
    expect(exercises[1].id).not.toBe("orig-e2");
  });

  it("when diffed after remapping: Row is removed and Pull-up is added (not modified)", () => {
    const original = makeDay([{ id: "orig-e1", name: "Bench Press" }, { id: "orig-e2", name: "Row" }]);
    const parsed = makeDay([{ id: "new-uuid-1", name: "Bench Press" }, { id: "new-uuid-pullup", name: "Pull-up" }]);
    const remapped = remapExerciseIds(original, parsed);
    const diffs = diffDays(original, remapped);
    expect(diffs.find((d) => d.exerciseName === "Row")?.type).toBe("removed");
    expect(diffs.find((d) => d.exerciseName === "Pull-up")?.type).toBe("added");
    // Bench is unchanged
    expect(diffs.find((d) => d.exerciseName === "Bench Press")).toBeUndefined();
  });
});
