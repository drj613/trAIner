import { parseCellToSet, serialiseSets, hydrateFromLog } from "./sessionState";
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
  it("returns null for empty string", () => {
    expect(parseCellToSet("", 1)).toBeNull();
  });
  it("returns null for skip", () => {
    expect(parseCellToSet("skip", 1)).toBeNull();
  });
  it("returns null for pain", () => {
    expect(parseCellToSet("pain", 1)).toBeNull();
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
    expect(serialiseSets(["", "", ""])).toEqual([]);
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
});
