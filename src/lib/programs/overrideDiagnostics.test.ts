import { diagnoseProgramOverrides } from "./overrideDiagnostics";
import type { ProgramDay, ProgramDocument, ProgramOverride } from "./types";

function makeDay(overrides: Partial<ProgramDay> = {}): ProgramDay {
  return {
    id: "day-1",
    dayNumber: 1,
    weekNumber: 1,
    title: "Day 1",
    sections: [{ id: "s1", type: "strength", name: "Strength", groups: [] }],
    ...overrides,
  };
}

function makeProgram(days: ProgramDay[], overrides: ProgramOverride[]): ProgramDocument {
  return {
    id: "p1",
    title: "Test Program",
    source: "manual",
    active: true,
    days,
    overrides,
    createdAt: "2026-07-13T00:00:00Z",
    updatedAt: "2026-07-13T00:00:00Z",
  };
}

const NOW = "2026-07-13T00:00:00Z";

describe("diagnoseProgramOverrides (runtime, pure, no migration required)", () => {
  it("warns when a week override has no replacement days", () => {
    const program = makeProgram(
      [makeDay({ id: "d1", dayNumber: 1, weekNumber: 1 })],
      [{ id: "ov-1", scope: "week", programId: "p1", weekNumber: 5, replacement: [], createdAt: NOW }],
    );
    const warnings = diagnoseProgramOverrides(program);
    expect(warnings.some((w) => w.message === "Week 5 override contains no replacement days. The base weekly template will be used unchanged.")).toBe(true);
  });

  it("warns when a week override is missing weekNumber", () => {
    const program = makeProgram(
      [makeDay()],
      [{ id: "ov-2", scope: "week", programId: "p1", replacement: [makeDay({ id: "r1" })], createdAt: NOW }],
    );
    const warnings = diagnoseProgramOverrides(program);
    expect(warnings.some((w) => w.message === "A week override is missing `weekNumber` and cannot be applied.")).toBe(true);
  });

  it("warns when a week override's weekNumber is absent from the routine's effective weeks", () => {
    const program = makeProgram(
      [makeDay({ id: "d1", weekNumber: 1 }), makeDay({ id: "d2", weekNumber: 2 })],
      [{ id: "ov-3", scope: "week", programId: "p1", weekNumber: 9, replacement: [makeDay({ id: "r1" })], createdAt: NOW }],
    );
    const warnings = diagnoseProgramOverrides(program);
    expect(warnings.some((w) => w.message === "Week 9 override does not match any week represented by this routine and will not be applied.")).toBe(true);
  });

  it("warns when a replacement day's dayNumber doesn't exist in the base weekly template", () => {
    const program = makeProgram(
      [makeDay({ id: "d1", dayNumber: 1, weekNumber: 1 }), makeDay({ id: "d2", dayNumber: 1, weekNumber: 2 })],
      [{
        id: "ov-4", scope: "week", programId: "p1", weekNumber: 6,
        replacement: [makeDay({ id: "r1", dayNumber: 5 })],
        createdAt: NOW,
      }],
    );
    const warnings = diagnoseProgramOverrides(program);
    expect(warnings.some((w) => w.message === "Week 6 override references Day 5, which does not exist in the base weekly template. That replacement will not be applied.")).toBe(true);
  });

  it("warns with NEUTRAL wording when a replacement day is empty/rest (sections: [])", () => {
    const program = makeProgram(
      [makeDay({ id: "d1", dayNumber: 2, weekNumber: 1 })],
      [{
        id: "ov-5", scope: "week", programId: "p1", weekNumber: 4,
        replacement: [makeDay({ id: "r1", dayNumber: 2, sections: [] })],
        createdAt: NOW,
      }],
    );
    const warnings = diagnoseProgramOverrides(program);
    expect(warnings.some((w) => w.message === "Week 4, Day 2 replaces the base workout with an empty or rest day. Confirm that this is intentional.")).toBe(true);
  });

  it("warns when a day-scope override has no matching internal dayId (imported, inert)", () => {
    const program = makeProgram(
      [makeDay({ id: "d1" })],
      [{ id: "ov-6", scope: "day", programId: "p1", dayId: "unknown-day", replacement: makeDay({ id: "r1" }), createdAt: NOW }],
    );
    const warnings = diagnoseProgramOverrides(program);
    expect(warnings.some((w) => w.message === "Imported day-scope overrides cannot be applied without a matching internal routine day. Use a week override with replacement day objects instead.")).toBe(true);
  });

  it("does NOT warn on an internal edit-generated day-scope override with a valid dayId", () => {
    const program = makeProgram(
      [makeDay({ id: "d1" })],
      [{ id: "ov-7", scope: "day", programId: "p1", dayId: "d1", replacement: makeDay({ id: "r1" }), createdAt: NOW }],
    );
    const warnings = diagnoseProgramOverrides(program);
    expect(warnings).toHaveLength(0);
  });

  it("is warning-only: never mutates, rejects, or deletes the diagnosed override", () => {
    const program = makeProgram(
      [makeDay({ id: "d1", dayNumber: 1, weekNumber: 1 })],
      [{ id: "ov-8", scope: "week", programId: "p1", weekNumber: 9, replacement: [], createdAt: NOW }],
    );
    const before = JSON.parse(JSON.stringify(program));
    diagnoseProgramOverrides(program);
    expect(program).toEqual(before);
    expect(program.overrides).toHaveLength(1);
  });

  it("diagnoses a plain stored ProgramDocument directly, with no migration step", () => {
    const program = makeProgram(
      [makeDay({ id: "d1", dayNumber: 1, weekNumber: 1 })],
      [{ id: "ov-9", scope: "week", programId: "p1", replacement: [makeDay({ id: "r1" })], createdAt: NOW }],
    );
    expect(() => diagnoseProgramOverrides(program)).not.toThrow();
  });
});
