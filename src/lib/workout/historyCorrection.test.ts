import { correctionTargetForRow, rowNeedsReview } from "./historyCorrection";
import type { ExerciseHistoryRow } from "./historyProjection";

function row(overrides: Partial<ExerciseHistoryRow> = {}): ExerciseHistoryRow {
  return {
    logId: "l1",
    entryIndex: 0,
    performedAt: "2026-04-20T14:00:00.000Z",
    performedDate: "2026-04-20",
    performedName: "Low Bar Squat",
    versionKey: "barbell-low-bar-squat",
    sets: ["225x5"],
    volumeLb: 1125,
    ...overrides,
  };
}

describe("correctionTargetForRow", () => {
  // The resolved branch has no caller today — `rowNeedsReview` gates the only
  // two surfaces that build a target, and it is false here. It is pinned
  // directly rather than deleted because the two exports are independent, and a
  // future surface that offers a correction on a resolved row (the Library's
  // catalogue detail does) would otherwise get a name-only target silently.
  it("corrects a resolved row as its concrete catalogue version", () => {
    expect(correctionTargetForRow(row({
      concreteExerciseId: "barbell-low-bar-squat",
      currentVersionLabel: "Low Bar Back Squat",
    }))).toEqual({
      kind: "catalog-exercise",
      exerciseId: "barbell-low-bar-squat",
      // The CURRENT name, because this target names a catalogue row, not a
      // stored token — the opposite of the name-only case below.
      name: "Low Bar Back Squat",
    });
  });

  it("falls back to the performed name when the catalogue offers no label", () => {
    expect(correctionTargetForRow(row({ concreteExerciseId: "x" })))
      .toMatchObject({ name: "Low Bar Squat" });
  });

  // A name target is keyed on the token the log actually holds. Using the
  // current label would write an override for a name the user never typed, so
  // the correction would not resolve the row it was made from.
  it("corrects an unresolved row on what was logged", () => {
    expect(correctionTargetForRow(row({ currentVersionLabel: "Squat" })))
      .toEqual({ kind: "normalized-name", value: "Low Bar Squat" });
  });

  // A corrupt log can hold a non-string here, and `CorrectionTarget` promises
  // strings — the sheet lowercases and normalizes whatever it is given.
  it("coerces a name it cannot read rather than handing on a non-string", () => {
    const target = correctionTargetForRow(row({ performedName: 7 as unknown as string }));
    expect(target).toEqual({ kind: "normalized-name", value: "7" });
  });
});

describe("rowNeedsReview", () => {
  it("is true only for a row with no concrete catalogue version", () => {
    expect(rowNeedsReview(row())).toBe(true);
    expect(rowNeedsReview(row({ concreteExerciseId: "barbell-low-bar-squat" }))).toBe(false);
  });
});
