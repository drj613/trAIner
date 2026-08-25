import {
  deriveVolumeTrend,
  entryHasHistoryData,
  entrySetLabels,
  entryVolumeLb,
  formatSetLabel,
  setHasData,
  setVolume,
  setWeightInLb,
} from "./historyUtils";
import type { WorkoutLogEntry, WorkoutSetLog } from "@/lib/programs/types";

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
