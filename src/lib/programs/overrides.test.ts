import { demoProgram } from "./sample";
import { getRenderableDays } from "./overrides";
import type { ProgramDocument, ProgramDay } from "./types";

describe("program overrides", () => {
  it("layers a day override without mutating the base day", () => {
    const baseTitle = demoProgram.days[0].title;
    const program = {
      ...demoProgram,
      overrides: [
        {
          id: "override-1",
          scope: "day" as const,
          programId: demoProgram.id,
          dayId: demoProgram.days[0].id,
          replacement: { ...demoProgram.days[0], title: "Replacement Day" },
          createdAt: new Date().toISOString()
        }
      ]
    };

    expect(getRenderableDays(program)[0].title).toBe("Replacement Day");
    expect(demoProgram.days[0].title).toBe(baseTitle);
  });

  it("M4: day override preserves the original day id", () => {
    const baseDay = demoProgram.days[0];
    const replacement: ProgramDay = { ...baseDay, id: "llm-generated-uuid", title: "LLM Override" };
    const program: ProgramDocument = {
      ...demoProgram,
      overrides: [
        {
          id: "override-m4",
          scope: "day",
          programId: demoProgram.id,
          dayId: baseDay.id,
          replacement,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const days = getRenderableDays(program);
    const overriddenDay = days[0];
    expect(overriddenDay.title).toBe("LLM Override");
    expect(overriddenDay.id).toBe(baseDay.id); // original id preserved, not llm-generated-uuid
  });

  it("M5: day-scope overrides win over week-scope overrides targeting the same day", () => {
    const baseDay = demoProgram.days[0];
    const weekReplacement: ProgramDay = {
      ...baseDay,
      title: "Week Override Title",
      dayNumber: baseDay.dayNumber,
      weekNumber: baseDay.weekNumber,
    };
    const dayReplacement: ProgramDay = {
      ...baseDay,
      title: "Day Override Title",
    };
    const program: ProgramDocument = {
      ...demoProgram,
      overrides: [
        // day-scope listed first — should still win after M5 sort
        {
          id: "override-day",
          scope: "day",
          programId: demoProgram.id,
          dayId: baseDay.id,
          replacement: dayReplacement,
          createdAt: new Date().toISOString(),
        },
        {
          id: "override-week",
          scope: "week",
          programId: demoProgram.id,
          weekNumber: baseDay.weekNumber,
          replacement: [weekReplacement],
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const days = getRenderableDays(program);
    // Day-scope should win regardless of insertion order
    expect(days[0].title).toBe("Day Override Title");
  });
});
