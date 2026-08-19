import {
  aggregateExerciseHistory,
  deriveVolumeTrend,
  entryHasHistoryData,
  entrySetLabels,
  entryVolumeLb,
  formatSetLabel,
  setHasData,
  setVolume,
  setWeightInLb,
} from "./historyUtils";
import type { WorkoutLogDocument, WorkoutLogEntry, WorkoutSetLog } from "@/lib/programs/types";

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

  it("keeps every matching entry when one workout logs the exercise twice", () => {
    const twice: WorkoutLogDocument[] = [{
      id: "log-twice", programId: "p1", dayId: "d1",
      performedAt: "2026-05-06T09:00:00.000Z", performedDate: "2026-05-06",
      entries: [
        { exerciseId: "slot-a", canonicalExerciseId: "cat-bench", sets: [{ setNumber: 1, weight: 100, reps: 3 }] },
        { exerciseId: "slot-b", canonicalExerciseId: "cat-bench", sets: [{ setNumber: 1, weight: 80, reps: 8 }] },
      ],
    }];
    const rows = aggregateExerciseHistory(twice, "slot-a", "cat-bench");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sets)).toEqual([["100x3"], ["80x8"]]);
  });

  it("keeps a bodyweight entry that contributes zero volume", () => {
    const bodyweight: WorkoutLogDocument[] = [{
      id: "log-bw", programId: "p1", dayId: "d1",
      performedAt: "2026-05-07T09:00:00.000Z", performedDate: "2026-05-07",
      entries: [
        { exerciseId: "slot-a", canonicalExerciseId: "cat-pullup", sets: [{ setNumber: 1, reps: 10 }] },
        { exerciseId: "slot-b", canonicalExerciseId: "cat-pullup", sets: [{ setNumber: 1, weight: 25, reps: 5 }] },
      ],
    }];
    const rows = aggregateExerciseHistory(bodyweight, "slot-a", "cat-pullup");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.volume)).toEqual([0, 125]);
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

describe("entry helpers", () => {
  it("treats a set as recorded when it has a raw cell, a weight, or reps", () => {
    expect(setHasData({ setNumber: 1, weight: 60 })).toBe(true);
    expect(setHasData({ setNumber: 1, reps: 10 })).toBe(true);
    expect(setHasData({ setNumber: 1, rawCell: "40s hold" })).toBe(true);
    expect(setHasData({ setNumber: 1, rpe: 8 })).toBe(true);
    expect(setHasData({ setNumber: 1, notes: "belt on" })).toBe(true);
    expect(setHasData({ setNumber: 1 })).toBe(false);
    expect(setHasData({ setNumber: 1, rawCell: "   " })).toBe(false);
  });

  it("keeps an entry whose only readable set data is an rpe", () => {
    const entry = { exerciseId: "a", sets: [{ setNumber: 1, rpe: 9 }] };
    expect(entryHasHistoryData(entry)).toBe(true);
    // No printable label, but the entry survives as a correctable row.
    expect(entrySetLabels(entry)).toEqual([]);
  });

  it("counts an entry as history when it has a recorded set or a note", () => {
    expect(entryHasHistoryData({ exerciseId: "a", sets: [{ setNumber: 1, reps: 5 }] })).toBe(true);
    expect(entryHasHistoryData({ exerciseId: "a", sets: [], notes: "tweaked knee" })).toBe(true);
    expect(entryHasHistoryData({ exerciseId: "a", sets: [{ setNumber: 1 }] })).toBe(false);
    expect(entryHasHistoryData({ exerciseId: "a", sets: [], notes: "  " })).toBe(false);
    expect(entryHasHistoryData({ exerciseId: "a", sets: [] })).toBe(false);
  });

  it("labels an entry's sets and drops empty labels", () => {
    const entry = {
      exerciseId: "a",
      sets: [{ setNumber: 1, weight: 60, reps: 10 }, { setNumber: 2 }, { setNumber: 3, reps: 8 }],
    };
    expect(entrySetLabels(entry)).toEqual(["60x10", "BWx8"]);
    expect(entrySetLabels(entry, "\u00d7")).toEqual(["60\u00d710", "BW\u00d78"]);
  });

  it("sums an entry's volume in pounds across mixed units", () => {
    expect(entryVolumeLb({
      exerciseId: "a",
      sets: [{ setNumber: 1, weight: 100, reps: 5 }, { setNumber: 2, weight: 10, unit: "kg", reps: 10 }],
    })).toBeCloseTo(500 + 220.46, 2);
    expect(entryVolumeLb({ exerciseId: "a", sets: [{ setNumber: 1, reps: 10 }] })).toBe(0);
  });

  it("derives a volume trend only from six-plus sessions of movement", () => {
    expect(deriveVolumeTrend([100, 200])).toBe("flat");
    expect(deriveVolumeTrend([100, 200, 300])).toBe("flat"); // no prior window
    expect(deriveVolumeTrend([100, 100, 100, 200, 200, 200])).toBe("up");
    expect(deriveVolumeTrend([200, 200, 200, 100, 100, 100])).toBe("down");
    expect(deriveVolumeTrend([100, 100, 100, 101, 101, 101])).toBe("flat"); // inside the dead band
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

// ─── Unreadable values inside one set record ─────────────────────────────────

describe("unreadable set fields", () => {
  // `src/lib/storage/appDb.ts:186-195` never inspects the fields of a set
  // record, so whatever a hand-edited or foreign backup put there is preserved
  // verbatim and reaches this module. The absent-vs-unreadable line is the
  // settled one (`unreadableValue`,
  // `src/lib/storage/migrations/v10Identity.ts:158`): absent means nothing was
  // recorded, anything else that is not the type we expected is unreadable and
  // must never remove readable data from view.
  const shapes: [string, unknown][] = [["a number", 7], ["an object", {}], ["an array", [1]]];

  it.each(shapes)("counts a set whose rawCell is %s as recorded work", (_label, rawCell) => {
    expect(setHasData({ setNumber: 1, rawCell } as unknown as WorkoutSetLog)).toBe(true);
  });

  it.each(shapes)("counts a set whose notes is %s as recorded work", (_label, notes) => {
    expect(setHasData({ setNumber: 1, notes } as unknown as WorkoutSetLog)).toBe(true);
  });

  it.each(shapes)("gives an unreadable rawCell (%s) no verbatim label", (_label, rawCell) => {
    expect(formatSetLabel({ setNumber: 1, rawCell } as unknown as WorkoutSetLog)).toBe("");
  });

  it.each(shapes)(
    "still labels the readable weight and reps beside an unreadable rawCell (%s)",
    (_label, rawCell) => {
      expect(
        formatSetLabel({ setNumber: 1, rawCell, weight: 200, reps: 5 } as unknown as WorkoutSetLog),
      ).toBe("200x5");
    },
  );

  // Absent is not unreadable: a set with nothing in it stays not-recorded.
  it("leaves an absent rawCell or notes as nothing recorded", () => {
    expect(setHasData({ setNumber: 1, rawCell: undefined, notes: undefined })).toBe(false);
    expect(setHasData({ setNumber: 1, rawCell: null, notes: null } as unknown as WorkoutSetLog))
      .toBe(false);
  });

  it("keeps an unreadable weight or reps from turning a readable volume into NaN", () => {
    expect(setWeightInLb({ setNumber: 1, weight: {} } as unknown as WorkoutSetLog)).toBe(0);
    expect(setVolume({ setNumber: 1, weight: {}, reps: 5 } as unknown as WorkoutSetLog)).toBe(0);
    expect(setVolume({ setNumber: 1, weight: 100, reps: {} } as unknown as WorkoutSetLog)).toBe(0);
    // The readable set's volume must survive the corrupt one beside it.
    expect(entryVolumeLb({
      exerciseId: "a",
      sets: [
        { setNumber: 1, weight: {}, reps: 5 },
        { setNumber: 2, weight: 100, reps: 5 },
      ],
    } as unknown as WorkoutLogEntry)).toBe(500);
  });

  // A numeric string is what a coercing writer leaves behind and `weight * 1`
  // has always read it as a number; the guard must not silently zero it.
  it("still reads a numeric string weight the way multiplication always did", () => {
    expect(setWeightInLb({ setNumber: 1, weight: "60" } as unknown as WorkoutSetLog)).toBe(60);
    expect(setVolume({ setNumber: 1, weight: "60", reps: "10" } as unknown as WorkoutSetLog))
      .toBe(600);
  });
});

describe("an unreadable performedDate must not take the Today drawer down", () => {
  // `src/lib/storage/appDb.ts:186-195` preserves a log whose fields it cannot
  // read, so a non-string `performedDate` reaches this module despite the type.
  // The absent-vs-unreadable line is the settled one (`unreadableValue`,
  // `src/lib/storage/migrations/v10Identity.ts:158`): absent means the date was
  // never stamped and `performedAt` answers instead; a present non-string is
  // unreadable and must not remove every other workout's history from view.
  //
  // THREE logs, not two: with two elements V8 calls the comparator exactly once
  // and `String.prototype.localeCompare` coerces its *argument*, so a two-log
  // fixture passes whether or not the value is guarded. The same one-sided
  // coercion trap this round already documented for `logId`.
  const shapes: [string, unknown][] = [
    ["a number", 7],
    ["an object", {}],
    ["a boolean", true],
    ["an array", []],
    ["an array holding null", [null]],
  ];

  function corpus(badDate: unknown): WorkoutLogDocument[] {
    return [
      {
        id: "log-a", programId: "p1", dayId: "d1",
        performedAt: "2026-04-15T09:00:00.000Z", performedDate: "2026-04-15",
        entries: [{ exerciseId: "bench", sets: [{ setNumber: 1, weight: 100, reps: 5 }] }],
      },
      {
        id: "log-bad", programId: "p1", dayId: "d1",
        performedAt: "2026-04-16T09:00:00.000Z", performedDate: badDate,
        entries: [{ exerciseId: "bench", sets: [{ setNumber: 1, weight: 110, reps: 5 }] }],
      },
      {
        id: "log-c", programId: "p1", dayId: "d1",
        performedAt: "2026-04-17T09:00:00.000Z", performedDate: "2026-04-17",
        entries: [{ exerciseId: "bench", sets: [{ setNumber: 1, weight: 120, reps: 5 }] }],
      },
    ] as unknown as WorkoutLogDocument[];
  }

  it.each(shapes)(
    "still lists every readable workout when one log's performedDate is %s",
    (_label, badDate) => {
      const rows = aggregateExerciseHistory(corpus(badDate), "bench");
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.sets[0])).toEqual(
        expect.arrayContaining(["100x5", "110x5", "120x5"]),
      );
    },
  );

  it.each(shapes)(
    "gives every row a string date so the drawer can format it (%s)",
    (_label, badDate) => {
      for (const row of aggregateExerciseHistory(corpus(badDate), "bench")) {
        expect(typeof row.date).toBe("string");
      }
    },
  );

  // The unreadable date falls back to `performedAt`, which is readable, so the
  // row keeps its place in the ordering instead of being flung to one end.
  it("orders the rows newest first, the unreadable date included", () => {
    expect(aggregateExerciseHistory(corpus(7), "bench").map((r) => r.date)).toEqual([
      "2026-04-17", "2026-04-16", "2026-04-15",
    ]);
  });

  // Every input permutation, because a comparator throw depends on which side
  // the unreadable value lands.
  it("survives every ordering of the same three logs", () => {
    const [a, b, c] = corpus({});
    for (const order of [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]]) {
      expect(aggregateExerciseHistory(order, "bench")).toHaveLength(3);
    }
  });
});
