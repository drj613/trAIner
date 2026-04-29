import { diffDays } from "./programDiff";
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
