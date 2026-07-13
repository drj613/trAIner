import { demoProgram } from "./sample";
import { getRenderableDays, dedupOverrides, getOverrideReplacementDays } from "./overrides";
import type { ProgramDocument, ProgramDay, ProgramOverride } from "./types";

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

  it("preserves the slot's weekNumber when a week-scope replacement omits it", () => {
    const baseDay = demoProgram.days[0];
    const expandedWeek4: ProgramDay = { ...baseDay, id: "wk4-day1", weekNumber: 4, dayNumber: 1 };
    const replacementMissingWeek: ProgramDay = {
      ...baseDay,
      id: "replacement-id",
      title: "Deload Day",
      weekNumber: undefined,
      dayNumber: 1,
    };
    const program: ProgramDocument = {
      ...demoProgram,
      days: [expandedWeek4],
      overrides: [
        {
          id: "override-wk4",
          scope: "week",
          programId: demoProgram.id,
          weekNumber: 4,
          replacement: [replacementMissingWeek],
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const days = getRenderableDays(program);
    expect(days[0].title).toBe("Deload Day");
    expect(days[0].weekNumber).toBe(4);
    expect(days[0].dayNumber).toBe(1);
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

describe("getOverrideReplacementDays", () => {
  it("wraps a single-day replacement in an array for traversal", () => {
    const baseDay = demoProgram.days[0];
    const override: ProgramOverride = {
      id: "ov-single",
      scope: "day",
      programId: demoProgram.id,
      dayId: baseDay.id,
      replacement: baseDay,
      createdAt: new Date().toISOString(),
    };
    const result = getOverrideReplacementDays(override);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(baseDay);
  });

  it("returns an array replacement as-is (same reference)", () => {
    const baseDay = demoProgram.days[0];
    const override: ProgramOverride = {
      id: "ov-array",
      scope: "week",
      programId: demoProgram.id,
      weekNumber: 2,
      replacement: [baseDay],
      createdAt: new Date().toISOString(),
    };
    const result = getOverrideReplacementDays(override);
    expect(result).toBe(override.replacement);
  });

  it("does NOT rewrite the stored single replacement shape on the override itself", () => {
    const baseDay = demoProgram.days[0];
    const override: ProgramOverride = {
      id: "ov-single-2",
      scope: "day",
      programId: demoProgram.id,
      dayId: baseDay.id,
      replacement: baseDay,
      createdAt: new Date().toISOString(),
    };
    getOverrideReplacementDays(override);
    expect(Array.isArray(override.replacement)).toBe(false);
  });
});

describe("override deduplication at save time", () => {
  it("applying a day-scope override twice results in a single override for that day", () => {
    const baseDay = demoProgram.days[0];
    const ov1: ProgramOverride = {
      id: "ov-1", scope: "day", programId: demoProgram.id,
      dayId: baseDay.id, replacement: { ...baseDay, title: "First Pass" },
      createdAt: new Date().toISOString(),
    };
    const ov2: ProgramOverride = {
      id: "ov-2", scope: "day", programId: demoProgram.id,
      dayId: baseDay.id, replacement: { ...baseDay, title: "Second Pass" },
      createdAt: new Date().toISOString(),
    };
    const afterFirst = [...dedupOverrides([], ov1), ov1];
    const after = [...dedupOverrides(afterFirst, ov2), ov2];
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("ov-2");
  });

  it("applying a week-scope override twice results in a single override for that week", () => {
    const ov1: ProgramOverride = {
      id: "wk-1", scope: "week", programId: demoProgram.id,
      weekNumber: 2, replacement: demoProgram.days[0],
      createdAt: new Date().toISOString(),
    };
    const ov2: ProgramOverride = {
      id: "wk-2", scope: "week", programId: demoProgram.id,
      weekNumber: 2, replacement: { ...demoProgram.days[0], title: "Deload" },
      createdAt: new Date().toISOString(),
    };
    const after = [...dedupOverrides([ov1], ov2), ov2];
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("wk-2");
  });

  it("overrides for different days are both kept", () => {
    const d0 = demoProgram.days[0];
    const d1 = demoProgram.days[1] ?? { ...d0, id: "day-alt" };
    const ov1: ProgramOverride = { id: "a", scope: "day", programId: demoProgram.id, dayId: d0.id, replacement: d0, createdAt: new Date().toISOString() };
    const ov2: ProgramOverride = { id: "b", scope: "day", programId: demoProgram.id, dayId: d1.id, replacement: d1, createdAt: new Date().toISOString() };
    const after = [...dedupOverrides([ov1], ov2), ov2];
    expect(after).toHaveLength(2);
  });
});
