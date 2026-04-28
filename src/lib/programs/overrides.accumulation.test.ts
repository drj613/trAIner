import { demoProgram } from "./sample";
import { getRenderableDays } from "./overrides";
import type { ProgramDocument, ProgramDay, ProgramOverride } from "./types";

function makeOverride(id: string, dayId: string, replacement: ProgramDay): ProgramOverride {
  return {
    id,
    scope: "day",
    programId: demoProgram.id,
    dayId,
    replacement,
    createdAt: new Date().toISOString(),
  };
}

describe("getRenderableDays — accumulation and edge cases", () => {
  it("returns base days unchanged when overrides array is empty", () => {
    const program: ProgramDocument = { ...demoProgram, overrides: [] };
    const days = getRenderableDays(program);
    expect(days).toHaveLength(demoProgram.days.length);
    expect(days[0].id).toBe(demoProgram.days[0].id);
  });

  it("applies the last override when two overrides target the same day", () => {
    const baseDay = demoProgram.days[0];
    const firstReplacement: ProgramDay = { ...baseDay, title: "First Replacement" };
    const secondReplacement: ProgramDay = { ...baseDay, title: "Second Replacement" };

    const program: ProgramDocument = {
      ...demoProgram,
      overrides: [
        makeOverride("override-a", baseDay.id, firstReplacement),
        makeOverride("override-b", baseDay.id, secondReplacement),
      ],
    };

    const days = getRenderableDays(program);
    expect(days.find((d) => d.id === baseDay.id)?.title).toBe("Second Replacement");
  });

  it("does not mutate the original program object", () => {
    const baseDay = demoProgram.days[0];
    const originalTitle = baseDay.title;
    const replacement: ProgramDay = { ...baseDay, title: "Mutant Title" };

    const program: ProgramDocument = {
      ...demoProgram,
      overrides: [makeOverride("override-1", baseDay.id, replacement)],
    };

    getRenderableDays(program);
    expect(demoProgram.days[0].title).toBe(originalTitle);
  });

  it("ignores an override targeting a day id that does not exist in program", () => {
    const phantom: ProgramDay = { id: "ghost-day", dayNumber: 99, weekNumber: 99, title: "Ghost", sections: [] };
    const program: ProgramDocument = {
      ...demoProgram,
      overrides: [makeOverride("override-ghost", "ghost-day", phantom)],
    };

    const days = getRenderableDays(program);
    expect(days).toHaveLength(demoProgram.days.length);
    expect(days.find((d) => d.id === "ghost-day")).toBeUndefined();
  });

  it("preserves day ordering after override application", () => {
    const baseDay = demoProgram.days[0];
    const replacement: ProgramDay = { ...baseDay, title: "Reordered?" };
    const program: ProgramDocument = {
      ...demoProgram,
      overrides: [makeOverride("override-order", baseDay.id, replacement)],
    };

    const days = getRenderableDays(program);
    expect(days[0].id).toBe(baseDay.id);
  });
});
