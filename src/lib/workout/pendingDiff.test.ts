import { clearPendingDiff, loadPendingDiff, resolvePendingDiffScope, storePendingDiff } from "./pendingDiff";
import type { ProgramDay } from "@/lib/programs/types";

const day: ProgramDay = { id: "lower-b-w2", dayNumber: 2, weekNumber: 2, title: "Lower B", sections: [] };

beforeEach(() => { sessionStorage.clear(); });

describe("pending diff compatibility", () => {
  it("requires the reviewer to choose scope for a legacy week diff", () => {
    sessionStorage.setItem("trainer-pending-diff", JSON.stringify({ programId: "p1", original: day, replacement: day, scope: "week", weekNumber: 2 }));
    const pending = loadPendingDiff()!;
    expect(resolvePendingDiffScope(pending)).toBeNull();
  });

  it("keeps legacy day scope local to one occurrence", () => {
    sessionStorage.setItem("trainer-pending-diff", JSON.stringify({ programId: "p1", original: day, replacement: day, scope: "day" }));
    expect(resolvePendingDiffScope(loadPendingDiff()!)).toBe("occurrence");
  });

  it("round-trips parsed diagnostics and the day-content edit", () => {
    const edit = { kind: "day-content" as const, dayId: day.id, replacement: { ...day, title: "Legs" } };
    const warnings = [{ path: "days.0", code: "sets-defaulted", message: "Set count was invalid." }];
    expect(storePendingDiff("p1", day, { ...day, title: "Legs" }, "occurrence", undefined, day.id, warnings, edit)).toBe(true);
    const pending = loadPendingDiff()!;
    expect(pending.warnings).toEqual(warnings);
    expect(pending.edit).toEqual(edit);
    expect(resolvePendingDiffScope(pending)).toBe("occurrence");
    clearPendingDiff();
    expect(loadPendingDiff()).toBeNull();
  });
});
