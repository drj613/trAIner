import { normalizePrescription, validateProgram } from "./validation";
import type { ProgramDocument } from "./types";

describe("normalizePrescription", () => {
  it("converts numeric string sets and numeric reps with visible diagnostics", () => {
    const result = normalizePrescription({ sets: "4", reps: 8 }, "days.1.exercise.1");
    expect(result.sets).toBe(4);
    expect(result.reps).toBe("8");
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      "sets-coerced",
      "reps-coerced",
    ]);
    expect(result.diagnostics[0]).toMatchObject({ originalValue: "4", replacementValue: 4 });
  });

  it.each([undefined, null, "bad", 2.5, 0, -1, Infinity])("defaults invalid set count %p to three", (sets) => {
    const result = normalizePrescription({ sets }, "days.1.exercise.1");
    expect(result.sets).toBe(3);
    expect(result.diagnostics[0]).toMatchObject({ code: "sets-defaulted", replacementValue: 3 });
  });

  it.each(["8-12", "30 sec", "AMRAP"]) ("preserves valid rep prescription %s", (reps) => {
    expect(normalizePrescription({ sets: 3, reps }, "p").reps).toBe(reps);
  });
});

const exercise = (id: string, sets: number) => ({
  id, name: id, sets, reps: "8", tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
});
const program = (days: ProgramDocument["days"], overrides: ProgramDocument["overrides"] = []): ProgramDocument => ({
  id: "p", title: "P", source: "import", active: true, days, overrides,
  createdAt: "", updatedAt: "",
});
const day = (id: string, weekNumber: number, counts: [number, number]): ProgramDocument["days"][number] => ({
  id, dayNumber: 1, weekNumber, title: "A", sections: [{
    id: `${id}-s`, type: "strength", name: "Strength", groups: [{
      id: `${id}-g`, type: "superset", exercises: [exercise(`${id}-a`, counts[0]), exercise(`${id}-b`, counts[1])],
    }],
  }],
});

describe("validateProgram", () => {
  it("warns when an effective expanded week has a superset mismatch", () => {
    const warnings = validateProgram(program([day("base", 1, [4, 4]), day("week-two", 2, [3, 4])]));
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "superset-set-mismatch", affectedWeeks: [2] }),
    ]));
  });

  it("uses rendered override days so an override can repair a mismatch", () => {
    const base = day("base", 1, [3, 4]);
    const replaced = day("fixed", 1, [4, 4]);
    const warnings = validateProgram(program([base], [{
      id: "o", scope: "week", programId: "p", weekNumber: 1, replacement: replaced, createdAt: "",
    }]));
    expect(warnings.filter((warning) => warning.code === "superset-set-mismatch")).toHaveLength(0);
  });
});
