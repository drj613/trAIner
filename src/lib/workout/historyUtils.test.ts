import { aggregateExerciseHistory, formatSetLabel, setVolume, setWeightInLb } from "./historyUtils";
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

describe("unit normalization", () => {
  it("converts kg sets to lb for volume so mixed units aggregate coherently", () => {
    expect(setWeightInLb({ setNumber: 1, weight: 100, reps: 10 })).toBe(100);
    expect(setWeightInLb({ setNumber: 1, weight: 100, unit: "kg", reps: 10 })).toBeCloseTo(220.46, 2);
    expect(setVolume({ setNumber: 1, weight: 10, unit: "kg", reps: 10 })).toBeCloseTo(220.46, 2);
  });

  it("labels kg sets with their unit", () => {
    expect(formatSetLabel({ setNumber: 1, weight: 10, unit: "kg", reps: 10 })).toBe("10kgx10");
    expect(formatSetLabel({ setNumber: 1, weight: 65, reps: 10 })).toBe("65x10");
  });
});

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

  it("includes raw-text and duration sets stored in rawCell", () => {
    const rawLogs: WorkoutLogDocument[] = [{
      id: "log-raw", programId: "p1", dayId: "d1",
      performedAt: "2026-05-01T09:00:00.000Z",
      entries: [{ exerciseId: "handstand", sets: [
        { setNumber: 1, rawCell: "40s hold" },
        { setNumber: 2, rawCell: "2.5kg x10" },
      ]}],
    }];
    const rows = aggregateExerciseHistory(rawLogs, "handstand");
    expect(rows[0].sets).toEqual(["40s hold", "2.5kg x10"]);
  });

  it("carries the per-exercise session note", () => {
    const noted: WorkoutLogDocument[] = [{
      id: "log-note", programId: "p1", dayId: "d1",
      performedAt: "2026-05-01T09:00:00.000Z",
      entries: [{ exerciseId: "bench-press", notes: "go up next week",
        sets: [{ setNumber: 1, weight: 60, reps: 10 }] }],
    }];
    const rows = aggregateExerciseHistory(noted, "bench-press");
    expect(rows[0].note).toBe("go up next week");
  });

  it("omits note when the entry has none", () => {
    const rows = aggregateExerciseHistory(logs, "bench-press");
    expect(rows[0].note).toBeUndefined();
  });

  it("dates a session by its local day, not the UTC date of performedAt", () => {
    // 2026-05-02T02:00Z is still 2026-05-01 in America/New_York (jest TZ pin).
    const lateNight: WorkoutLogDocument[] = [{
      id: "log-late", programId: "p1", dayId: "d1",
      performedAt: "2026-05-02T02:00:00.000Z",
      entries: [{ exerciseId: "bench-press", sets: [{ setNumber: 1, weight: 60, reps: 10 }] }],
    }];
    const rows = aggregateExerciseHistory(lateNight, "bench-press");
    expect(rows[0].date).toBe("2026-05-01");
  });

  it("prefers explicit performedDate over performedAt for dating", () => {
    const withDate: WorkoutLogDocument[] = [{
      id: "log-pd", programId: "p1", dayId: "d1",
      performedAt: "2026-05-02T02:00:00.000Z", performedDate: "2026-05-01",
      entries: [{ exerciseId: "bench-press", sets: [{ setNumber: 1, weight: 60, reps: 10 }] }],
    }];
    expect(aggregateExerciseHistory(withDate, "bench-press")[0].date).toBe("2026-05-01");
  });
});

describe("formatSetLabel", () => {
  it("returns rawCell verbatim when present", () => {
    expect(formatSetLabel({ setNumber: 1, rawCell: "2.5kg x10" })).toBe("2.5kg x10");
    expect(formatSetLabel({ setNumber: 1, rawCell: "40s hold" })).toBe("40s hold");
    expect(formatSetLabel({ setNumber: 1, rawCell: "skip" })).toBe("skip");
  });

  it("formats numeric sets with the default 'x' separator", () => {
    expect(formatSetLabel({ setNumber: 1, weight: 65, reps: 10 })).toBe("65x10");
  });

  it("uses the supplied separator", () => {
    expect(formatSetLabel({ setNumber: 1, weight: 65, reps: 10 }, "×")).toBe("65×10");
  });

  it("uses BW prefix when weight is absent", () => {
    expect(formatSetLabel({ setNumber: 1, reps: 8 })).toBe("BWx8");
    expect(formatSetLabel({ setNumber: 1, reps: 8 }, "×")).toBe("BW×8");
  });

  it("returns weight only when reps absent, and '' when both absent", () => {
    expect(formatSetLabel({ setNumber: 1, weight: 60 })).toBe("60");
    expect(formatSetLabel({ setNumber: 1 })).toBe("");
  });

  it("ignores a blank rawCell and falls through to numeric formatting", () => {
    expect(formatSetLabel({ setNumber: 1, weight: 60, reps: 10, rawCell: "" })).toBe("60x10");
  });
});
