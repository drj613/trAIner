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
