import { programStatus, programDaysPerWeek, programLengthWeeks } from "./routineMeta";
import type { ProgramDocument } from "./types";

const base: ProgramDocument = {
  id: "p1",
  title: "Test",
  source: "manual",
  active: false,
  days: [],
  overrides: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("programStatus", () => {
  it("returns status field when present", () => {
    expect(programStatus({ ...base, status: "archived" })).toBe("archived");
  });

  it("returns 'draft' when status is absent even if active is true", () => {
    const prog = { ...base, active: true, status: undefined };
    expect(programStatus(prog)).toBe("draft");
  });

  it("returns draft when active:false and no status field", () => {
    expect(programStatus(base)).toBe("draft");
  });
});

describe("programDaysPerWeek", () => {
  it("returns daysPerWeek when set", () => {
    expect(programDaysPerWeek({ ...base, daysPerWeek: 5 })).toBe(5);
  });

  it("counts non-rest days from days array", () => {
    const days: ProgramDocument["days"] = [
      { id: "d1", dayNumber: 1, title: "Upper", sections: [] },
      { id: "d2", dayNumber: 2, title: "Rest", sections: [] },
      { id: "d3", dayNumber: 3, title: "Lower", sections: [] },
    ];
    expect(programDaysPerWeek({ ...base, days })).toBe(2);
  });

  it("returns 0 when days is empty", () => {
    expect(programDaysPerWeek(base)).toBe(0);
  });

  it("counts training days per week, not total across all weeks", () => {
    // 2 weeks × 3 training days = 6 days total, but daysPerWeek should be 3
    const days: ProgramDocument["days"] = [
      { id: "d1", dayNumber: 1, weekNumber: 1, title: "Day 1", sections: [] },
      { id: "d2", dayNumber: 2, weekNumber: 1, title: "Day 2", sections: [] },
      { id: "d3", dayNumber: 3, weekNumber: 1, title: "Day 3", sections: [] },
      { id: "d4", dayNumber: 4, weekNumber: 2, title: "Day 4", sections: [] },
      { id: "d5", dayNumber: 5, weekNumber: 2, title: "Day 5", sections: [] },
      { id: "d6", dayNumber: 6, weekNumber: 2, title: "Day 6", sections: [] },
    ];
    expect(programDaysPerWeek({ ...base, days })).toBe(3);
  });
});

describe("programLengthWeeks", () => {
  it("returns lengthWeeks when set", () => {
    expect(programLengthWeeks({ ...base, lengthWeeks: 8 })).toBe(8);
  });

  it("derives from weekNumber of days", () => {
    const days: ProgramDocument["days"] = [
      { id: "d1", dayNumber: 1, weekNumber: 1, title: "Day 1", sections: [] },
      { id: "d2", dayNumber: 2, weekNumber: 3, title: "Day 2", sections: [] },
    ];
    expect(programLengthWeeks({ ...base, days })).toBe(3);
  });

  it("returns 1 when days have no weekNumber", () => {
    const days: ProgramDocument["days"] = [
      { id: "d1", dayNumber: 1, title: "Day 1", sections: [] },
    ];
    expect(programLengthWeeks({ ...base, days })).toBe(1);
  });
});
