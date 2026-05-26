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

  it("matches by canonicalExerciseId when entries carry one and the query supplies it", () => {
    const mixed: WorkoutLogDocument[] = [
      {
        id: "log-a", programId: "p1", dayId: "d1",
        performedAt: "2026-05-01T09:00:00.000Z",
        entries: [
          { exerciseId: "slot-old", canonicalExerciseId: "cat-bench", sets: [{ setNumber: 1, weight: 80, reps: 5 }] },
        ],
      },
      {
        id: "log-b", programId: "p1", dayId: "d1",
        performedAt: "2026-05-08T09:00:00.000Z",
        entries: [
          { exerciseId: "slot-new", canonicalExerciseId: "cat-bench", sets: [{ setNumber: 1, weight: 85, reps: 5 }] },
        ],
      },
    ];
    const rows = aggregateExerciseHistory(mixed, "slot-new", "cat-bench");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.date)).toEqual(["2026-05-08", "2026-05-01"]);
  });

  it("excludes entries whose canonicalExerciseId does not match the query canonical id", () => {
    const mixed: WorkoutLogDocument[] = [
      {
        id: "log-a", programId: "p1", dayId: "d1",
        performedAt: "2026-05-01T09:00:00.000Z",
        entries: [
          // Same slot id used by two different catalog exercises across the swap.
          { exerciseId: "slot-x", canonicalExerciseId: "cat-bench", sets: [{ setNumber: 1, weight: 80, reps: 5 }] },
        ],
      },
      {
        id: "log-b", programId: "p1", dayId: "d1",
        performedAt: "2026-05-08T09:00:00.000Z",
        entries: [
          { exerciseId: "slot-x", canonicalExerciseId: "cat-incline", sets: [{ setNumber: 1, weight: 60, reps: 8 }] },
        ],
      },
    ];
    const rows = aggregateExerciseHistory(mixed, "slot-x", "cat-incline");
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-05-08");
    expect(rows[0].sets).toEqual(["60x8"]);
  });

  it("falls back to exerciseId match when entries have no canonicalExerciseId (legacy logs)", () => {
    // No canonical id on the entries; query still works via slot id.
    const rows = aggregateExerciseHistory(logs, "bench-press", "cat-anything");
    expect(rows).toHaveLength(2);
    expect(rows[0].sets).toEqual(["65x10", "65x9"]);
  });

  it("falls back to exerciseId when no canonical id is supplied (back-compat)", () => {
    // Existing two-arg call still works unchanged.
    expect(aggregateExerciseHistory(logs, "bench-press")).toHaveLength(2);
  });
});
