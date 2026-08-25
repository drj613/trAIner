import { parseCellToSet, serialiseSets, hydrateFromLog, extractEntryNotes, applyEntryNotes } from "./sessionState";
import type { WorkoutSetLog, WorkoutLogEntry } from "@/lib/programs/types";

describe("parseCellToSet", () => {
  it("parses weight×reps string", () => {
    expect(parseCellToSet("65x10", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 65, reps: 10,
    });
  });
  it("parses BW×reps (bodyweight)", () => {
    expect(parseCellToSet("BWx8", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: undefined, reps: 8,
    });
  });
  it("parses decimal weight", () => {
    expect(parseCellToSet("52.5x6", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 52.5, reps: 6,
    });
  });
  it("returns rawCell for empty string", () => {
    expect(parseCellToSet("", 1)).toEqual<WorkoutSetLog>({ setNumber: 1, rawCell: "" });
  });
  it("returns rawCell for skip (lowercase)", () => {
    expect(parseCellToSet("skip", 1)).toEqual<WorkoutSetLog>({ setNumber: 1, rawCell: "skip" });
  });
  it("returns rawCell for pain (lowercase)", () => {
    expect(parseCellToSet("pain", 1)).toEqual<WorkoutSetLog>({ setNumber: 1, rawCell: "pain" });
  });
  it("returns rawCell for Skip (case-insensitive)", () => {
    expect(parseCellToSet("Skip", 1)).toEqual<WorkoutSetLog>({ setNumber: 1, rawCell: "Skip" });
  });
  it("returns rawCell for PAIN (case-insensitive)", () => {
    expect(parseCellToSet("PAIN", 1)).toEqual<WorkoutSetLog>({ setNumber: 1, rawCell: "PAIN" });
  });
  it("returns rawCell for unrecognized string INVALID", () => {
    expect(parseCellToSet("INVALID", 1)).toEqual<WorkoutSetLog>({ setNumber: 1, rawCell: "INVALID" });
  });
  it("strips PR marker from +70x9", () => {
    expect(parseCellToSet("+70x9", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 70, reps: 9,
    });
  });
  it("parses explicit kg unit with space (10kg x10)", () => {
    expect(parseCellToSet("10kg x10", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 10, unit: "kg", reps: 10,
    });
  });
  it("parses explicit kg unit without space (60kgx8)", () => {
    expect(parseCellToSet("60kgx8", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 60, unit: "kg", reps: 8,
    });
  });
  it("explicit lb suffix stays unit-less (lb is the default)", () => {
    expect(parseCellToSet("65lb x10", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 65, reps: 10,
    });
  });
  it("applies the exercise default unit when the cell has none", () => {
    expect(parseCellToSet("60x8", 1, "kg")).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 60, unit: "kg", reps: 8,
    });
  });
  it("explicit cell unit wins over the exercise default", () => {
    expect(parseCellToSet("65lb x10", 1, "kg")).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 65, reps: 10,
    });
  });
  it("strips PR marker from kg cells (+70kg x9)", () => {
    expect(parseCellToSet("+70kg x9", 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 70, unit: "kg", reps: 9,
    });
  });
});

describe("kg round-trip", () => {
  it("hydrates a kg set with its unit suffix so it re-parses identically", () => {
    const entry: WorkoutLogEntry = {
      exerciseId: "ex1",
      sets: [{ setNumber: 1, weight: 10, unit: "kg", reps: 10 }],
    };
    const cells = hydrateFromLog(entry);
    expect(cells).toEqual(["10kgx10"]);
    expect(parseCellToSet(cells[0], 1)).toEqual<WorkoutSetLog>({
      setNumber: 1, weight: 10, unit: "kg", reps: 10,
    });
  });
});

describe("serialiseSets", () => {
  it("converts cell strings to WorkoutSetLog[], skipping empties", () => {
    const result = serialiseSets(["65x10", "", "60x8"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ setNumber: 1, weight: 65, reps: 10 });
    expect(result[1]).toEqual({ setNumber: 3, weight: 60, reps: 8 });
  });
  it("returns empty array for all-empty cells", () => {
    // Empty strings are skipped entirely (not stored with rawCell)
    expect(serialiseSets(["", "", ""])).toEqual([]);
  });
  it("includes rawCell for unrecognized non-empty strings", () => {
    const result = serialiseSets(["65x10", "INVALID", ""]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ setNumber: 1, weight: 65, reps: 10 });
    expect(result[1]).toEqual({ setNumber: 2, rawCell: "INVALID" });
  });
});

describe("hydrateFromLog", () => {
  it("converts log entry sets back to cell strings", () => {
    const entry: WorkoutLogEntry = {
      exerciseId: "ex-1",
      sets: [
        { setNumber: 1, weight: 65, reps: 10 },
        { setNumber: 2, weight: 60, reps: 8 },
      ],
    };
    expect(hydrateFromLog(entry)).toEqual(["65x10", "60x8"]);
  });
  it("renders bodyweight sets without weight prefix", () => {
    const entry: WorkoutLogEntry = {
      exerciseId: "ex-1",
      sets: [{ setNumber: 1, weight: undefined, reps: 12 }],
    };
    expect(hydrateFromLog(entry)).toEqual(["BWx12"]);
  });
  it("returns array of empty strings when sets is empty", () => {
    const entry: WorkoutLogEntry = { exerciseId: "ex-1", sets: [] };
    expect(hydrateFromLog(entry)).toEqual([""]);
  });
  it("pads to prescribedSets when log has fewer sets", () => {
    const entry: WorkoutLogEntry = {
      exerciseId: "ex-1",
      sets: [{ setNumber: 1, weight: 65, reps: 10 }],
    };
    expect(hydrateFromLog(entry, 3)).toEqual(["65x10", "", ""]);
  });
  it("preserves rawCell values on hydration", () => {
    const entry: WorkoutLogEntry = {
      exerciseId: "ex-1",
      sets: [{ setNumber: 1, rawCell: "Skip" }],
    };
    expect(hydrateFromLog(entry)).toEqual(["Skip"]);
  });
});

describe("round-trip: serialiseSets → hydrateFromLog", () => {
  it("preserves sparse set positions", () => {
    const cells = ["65x10", "", "60x8"];
    const log: WorkoutLogEntry = {
      exerciseId: "ex-1",
      sets: serialiseSets(cells),
    };
    expect(hydrateFromLog(log)).toEqual(["65x10", "", "60x8"]);
  });
});

describe("extractEntryNotes / applyEntryNotes", () => {
  it("extractEntryNotes returns the notes string from a log entry", () => {
    const entry = { exerciseId: "e1", sets: [], notes: "felt strong today" };
    expect(extractEntryNotes(entry)).toBe("felt strong today");
  });

  it("extractEntryNotes returns empty string when entry has no notes", () => {
    expect(extractEntryNotes({})).toBe("");
  });

  it("applyEntryNotes writes notes onto an entry", () => {
    const entry = { exerciseId: "e1", sets: [] };
    expect(applyEntryNotes(entry, "ouch right shoulder")).toEqual({
      exerciseId: "e1", sets: [], notes: "ouch right shoulder",
    });
  });

  it("applyEntryNotes drops the field for empty strings", () => {
    const entry = { exerciseId: "e1", sets: [], notes: "stale" };
    expect(applyEntryNotes(entry, "")).toEqual({ exerciseId: "e1", sets: [] });
  });
});

describe("hydrateFromLog on a log we cannot fully read", () => {
  // `src/lib/storage/appDb.ts:186-195` never inspects the fields of an entry or
  // a set, so a hand-edited or foreign backup reaches this function verbatim,
  // and the plan's v7 ruling keeps such a log on purpose. Throwing here left
  // `sessionMode` at "loading", which disabled autosave for the whole day while
  // the grid still rendered editable — the user logged a session into a
  // live-looking screen and it was never written. Absent is not unreadable
  // (`unreadableValue`, `src/lib/storage/migrations/v10Identity.ts:158`): an
  // entry with no sets is the ordinary shape of a day nobody has logged yet.
  const unreadableSets: [string, unknown][] = [
    ["a number", 7],
    ["an object", {}],
    ["a string", "corrupt"],
    ["a boolean", true],
    ["an array holding null", [null]],
    ["an array holding a number", [7]],
  ];

  it.each(unreadableSets)("returns a grid of empty cells when sets is %s", (_label, sets) => {
    expect(hydrateFromLog({ exerciseId: "e1", sets } as unknown as WorkoutLogEntry, 3))
      .toEqual(["", "", ""]);
  });

  const unreadableSetNumbers: [string, unknown][] = [
    ["an object", {}],
    ["a string", "corrupt"],
    ["undefined", undefined],
    ["zero", 0],
    ["a fraction", 1.5],
    ["absurdly large", 1e9],
  ];

  it.each(unreadableSetNumbers)(
    "keeps the readable set beside one whose setNumber is %s",
    (_label, setNumber) => {
      const entry = {
        exerciseId: "e1",
        sets: [{ setNumber, weight: 200, reps: 5 }, { setNumber: 2, weight: 100, reps: 5 }],
      } as unknown as WorkoutLogEntry;
      const cells = hydrateFromLog(entry);
      expect(cells).toContain("100x5");
      // Every cell is a string the grid can render and re-serialise.
      for (const c of cells) expect(typeof c).toBe("string");
      // No runaway allocation from a stored set number nobody can honour.
      expect(cells.length).toBeLessThanOrEqual(500);
    },
  );

  it("renders an unreadable rawCell as text rather than handing the grid a non-string", () => {
    const entry = {
      exerciseId: "e1",
      sets: [{ setNumber: 1, rawCell: {} }, { setNumber: 2, rawCell: null }],
    } as unknown as WorkoutLogEntry;
    for (const c of hydrateFromLog(entry)) expect(typeof c).toBe("string");
  });

  // Absent stays absent: the healthy empty-entry shape is unchanged.
  it("still returns one empty cell for an entry with no sets", () => {
    expect(hydrateFromLog({ exerciseId: "e1" } as WorkoutLogEntry)).toEqual([""]);
    expect(hydrateFromLog({ exerciseId: "e1", sets: [] } as unknown as WorkoutLogEntry)).toEqual([""]);
  });
});
