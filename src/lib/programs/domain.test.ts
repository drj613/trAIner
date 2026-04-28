import { effectiveWeekNumber, normalizeSectionType, isRestDay } from "./domain";
import type { ProgramDay } from "./types";

function makeDay(overrides: Partial<ProgramDay> = {}): ProgramDay {
  return {
    id: "d1",
    dayNumber: 1,
    title: "Day",
    sections: [],
    ...overrides,
  };
}

describe("effectiveWeekNumber", () => {
  it("returns the weekNumber when present", () => {
    expect(effectiveWeekNumber(makeDay({ weekNumber: 3 }))).toBe(3);
  });
  it("returns 1 when weekNumber is undefined", () => {
    expect(effectiveWeekNumber(makeDay({ weekNumber: undefined }))).toBe(1);
  });
  it("returns 1 when weekNumber is 0", () => {
    expect(effectiveWeekNumber(makeDay({ weekNumber: 0 }))).toBe(1);
  });
});

describe("normalizeSectionType", () => {
  it("returns known types unchanged", () => {
    expect(normalizeSectionType("warmup")).toBe("warmup");
    expect(normalizeSectionType("strength")).toBe("strength");
    expect(normalizeSectionType("metcon")).toBe("metcon");
  });
  it("maps unknown type to 'training'", () => {
    expect(normalizeSectionType("mysterious")).toBe("training");
  });
  it("lowercases before matching", () => {
    expect(normalizeSectionType("WARMUP")).toBe("warmup");
    expect(normalizeSectionType("Strength")).toBe("strength");
  });
  it("maps 'hypertrophy' → 'hypertrophy'", () => {
    expect(normalizeSectionType("hypertrophy")).toBe("hypertrophy");
  });
  it("maps 'accessory' → 'accessory'", () => {
    expect(normalizeSectionType("accessory")).toBe("accessory");
  });
});

describe("isRestDay", () => {
  it("returns true for day with no sections", () => {
    expect(isRestDay(makeDay({ sections: [] }))).toBe(true);
  });
  it("returns false for day with at least one section", () => {
    expect(isRestDay(makeDay({ sections: [{ id: "s1", type: "warmup", name: "Warmup", groups: [] }] }))).toBe(false);
  });
});
