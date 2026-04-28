import { buildWeekGrid } from "./programGrid";
import type { ProgramDay } from "@/lib/programs/types";

function makeDay(id: string, weekNumber: number, dayNumber: number, title: string): ProgramDay {
  return { id, weekNumber, dayNumber, title, sections: [] };
}

describe("buildWeekGrid", () => {
  const days: ProgramDay[] = [
    makeDay("d1", 1, 1, "Upper A"),
    makeDay("d2", 1, 2, "Lower A"),
    makeDay("d3", 2, 1, "Upper B"),
    makeDay("d4", 2, 2, "Lower B"),
  ];

  it("groups into correct week count", () => {
    const grid = buildWeekGrid(days);
    expect(grid).toHaveLength(2);
  });

  it("week 1 has correct days in order", () => {
    const grid = buildWeekGrid(days);
    expect(grid[0].weekNumber).toBe(1);
    expect(grid[0].days.map((d) => d.title)).toEqual(["Upper A", "Lower A"]);
  });

  it("week 2 has correct days in order", () => {
    const grid = buildWeekGrid(days);
    expect(grid[1].weekNumber).toBe(2);
    expect(grid[1].days.map((d) => d.title)).toEqual(["Upper B", "Lower B"]);
  });

  it("days without weekNumber fall into week 1", () => {
    const noWeekDays: ProgramDay[] = [makeDay("d1", undefined as unknown as number, 1, "Day A")];
    const grid = buildWeekGrid(noWeekDays);
    expect(grid).toHaveLength(1);
    expect(grid[0].weekNumber).toBe(1);
  });

  it("returns empty array for empty input", () => {
    expect(buildWeekGrid([])).toEqual([]);
  });

  it("sorts weeks numerically even if days are unordered", () => {
    const unordered: ProgramDay[] = [
      makeDay("d3", 2, 1, "Week 2"),
      makeDay("d1", 1, 1, "Week 1"),
    ];
    const grid = buildWeekGrid(unordered);
    expect(grid[0].weekNumber).toBe(1);
    expect(grid[1].weekNumber).toBe(2);
  });
});
