import {
  buildHeatmapCells,
  computeHeatmapStats,
  type HeatmapCell,
} from "./trainingHeatmap";
import type { WorkoutLogDocument } from "@/lib/programs/types";

function makeLog(date: string): WorkoutLogDocument {
  return {
    id: date,
    programId: "p1",
    dayId: "d1",
    performedAt: `${date}T10:00:00Z`,
    entries: [
      {
        exerciseId: "ex1",
        sets: [
          { setNumber: 1, weight: 100, reps: 5 },
          { setNumber: 2, weight: 100, reps: 5 },
        ],
      },
    ],
  };
}

describe("buildHeatmapCells", () => {
  it("returns a 26×7 grid", () => {
    const cells = buildHeatmapCells([], "2026-04-29");
    expect(cells).toHaveLength(26);
    expect(cells[0]).toHaveLength(7);
  });

  it("marks cells after today as future", () => {
    const cells = buildHeatmapCells([], "2026-04-29");
    // 2026-04-29 is a Wednesday (day index 2 in Mon-based week)
    const lastWeek = cells[cells.length - 1];
    expect(lastWeek[3].future).toBe(true);  // Thu of last week is future
    expect(lastWeek[2].future).toBe(false); // Wed (today) is not future
  });

  it("cell on a log date has intensity > 0", () => {
    // 2026-04-28 is Tuesday of the last week
    const cells = buildHeatmapCells([makeLog("2026-04-28")], "2026-04-29");
    expect(cells[cells.length - 1][1].intensity).toBeGreaterThan(0);
  });

  it("cell with no log has intensity 0", () => {
    const cells = buildHeatmapCells([], "2026-04-29");
    expect(cells[0][0].intensity).toBe(0);
  });
});

describe("computeHeatmapStats", () => {
  it("streak is 0 with no sessions", () => {
    const cells = buildHeatmapCells([], "2026-04-29");
    expect(computeHeatmapStats(cells).streak).toBe(0);
  });

  it("completionRate is between 0 and 100", () => {
    const cells = buildHeatmapCells([makeLog("2026-04-28")], "2026-04-29");
    const { completionRate } = computeHeatmapStats(cells);
    expect(completionRate).toBeGreaterThanOrEqual(0);
    expect(completionRate).toBeLessThanOrEqual(100);
  });

  it("weeklyAvg reflects logged sessions", () => {
    const logs = [makeLog("2026-04-28"), makeLog("2026-04-27"), makeLog("2026-04-25")];
    const cells = buildHeatmapCells(logs, "2026-04-29");
    expect(computeHeatmapStats(cells).weeklyAvg).toBeGreaterThan(0);
  });
});
