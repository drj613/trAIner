import { aggregateExerciseHistory } from "./historyUtils";
import type { WorkoutLogDocument } from "@/lib/programs/types";

const logs: WorkoutLogDocument[] = [
  {
    id: "log-1", programId: "p1", dayId: "d1",
    performedAt: "2026-04-15T09:00:00.000Z",
    entries: [
      { exerciseId: "bench-press", sets: [
        { setNumber: 1, weight: 60, reps: 10 },
        { setNumber: 2, weight: 60, reps: 10 },
        { setNumber: 3, weight: 60, reps: 8 },
      ]},
    ],
  },
  {
    id: "log-2", programId: "p1", dayId: "d1",
    performedAt: "2026-04-22T09:00:00.000Z",
    entries: [
      { exerciseId: "bench-press", sets: [
        { setNumber: 1, weight: 65, reps: 10 },
        { setNumber: 2, weight: 65, reps: 9 },
      ]},
    ],
  },
];

describe("aggregateExerciseHistory", () => {
  it("returns sessions sorted newest first", () => {
    const rows = aggregateExerciseHistory(logs, "bench-press");
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe("2026-04-22");
    expect(rows[1].date).toBe("2026-04-15");
  });

  it("formats set strings correctly", () => {
    const rows = aggregateExerciseHistory(logs, "bench-press");
    expect(rows[0].sets).toEqual(["65x10", "65x9"]);
    expect(rows[1].sets).toEqual(["60x10", "60x10", "60x8"]);
  });

  it("computes total volume per session", () => {
    const rows = aggregateExerciseHistory(logs, "bench-press");
    expect(rows[0].volume).toBe(65 * 10 + 65 * 9); // 1235
    expect(rows[1].volume).toBe(60 * 10 + 60 * 10 + 60 * 8); // 1680
  });

  it("returns [] for unknown exerciseId", () => {
    expect(aggregateExerciseHistory(logs, "unknown-exercise")).toEqual([]);
  });

  it("limits to 8 sessions", () => {
    const manyLogs: WorkoutLogDocument[] = Array.from({ length: 12 }, (_, i) => ({
      id: `log-${i}`, programId: "p1", dayId: "d1",
      performedAt: new Date(2026, 0, i + 1).toISOString(),
      entries: [{ exerciseId: "bench-press", sets: [{ setNumber: 1, weight: 60, reps: 10 }] }],
    }));
    expect(aggregateExerciseHistory(manyLogs, "bench-press")).toHaveLength(8);
  });
});
