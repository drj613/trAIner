import { parseProgramJson } from "./parser";
import { applyImportDraftEdit, createImportDraft } from "./draft";
import { serializeDraft } from "./serializeDraft";
import { getRenderableDays } from "@/lib/programs/overrides";

const source = JSON.stringify({
  title: "Three day",
  weeks: 3,
  days: [{ day: 1, title: "Lower A", sections: [{ type: "strength", groups: [{ exercises: [
    { name: "Barbell Squat", sets: "4", reps: "8-10", countsTowardVolume: false },
  ] }] }] }],
});

describe("import draft", () => {
  it("keeps corrections as history while edits regenerate current warnings", () => {
    const review = parseProgramJson(source);
    const draft = createImportDraft(review, source);
    const day = draft.program.days[0];
    const exercise = day.sections[0].groups[0].exercises[0];
    const edited = applyImportDraftEdit(draft, {
      kind: "exercise-fields", dayId: day.id, exerciseId: exercise.id, fields: { sets: 5 },
    }, { scope: "routine-day", atImport: true });
    expect(edited.correctionHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "sets-coerced", originalValue: "4" }),
    ]));
    expect(getRenderableDays(edited.program).map((d) => d.sections[0].groups[0].exercises[0].sets)).toEqual([5, 5, 5]);
    expect(edited.currentWarnings.some((warning) => warning.code === "sets-coerced")).toBe(false);
  });

  it("retains edit-time set corrections after normalization", () => {
    const review = parseProgramJson(source);
    const draft = createImportDraft(review, source);
    const day = draft.program.days[0];
    const exercise = day.sections[0].groups[0].exercises[0];
    const edited = applyImportDraftEdit(draft, {
      kind: "exercise-fields", dayId: day.id, exerciseId: exercise.id, fields: { sets: 0 },
    }, { scope: "routine-day", atImport: true });
    expect(getRenderableDays(edited.program)[0].sections[0].groups[0].exercises[0].sets).toBe(3);
    expect(edited.correctionHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "sets-defaulted", originalValue: 0, replacementValue: 3 }),
    ]));
  });

  it("serializes edits so re-import renders the same expanded prescriptions and volume roles", () => {
    const review = parseProgramJson(source);
    const draft = createImportDraft(review, source);
    const day = draft.program.days[0];
    const exercise = day.sections[0].groups[0].exercises[0];
    const edited = applyImportDraftEdit(draft, {
      kind: "exercise-fields", dayId: day.id, exerciseId: exercise.id,
      fields: { sets: 5, reps: "10-12", countsTowardVolume: true },
    }, { scope: "routine-day", atImport: true });
    const reparsed = parseProgramJson(serializeDraft(edited.program)).program;
    const prescriptions = (program: typeof edited.program) => getRenderableDays(program).map((d) =>
      d.sections[0].groups[0].exercises.map((e) => [e.sets, e.reps, e.countsTowardVolume]),
    );
    expect(prescriptions(reparsed)).toEqual(prescriptions(edited.program));
  });

  it("round trips an edit to one occurrence without changing the other weeks", () => {
    const review = parseProgramJson(source);
    const draft = createImportDraft(review, source);
    const day = draft.program.days.find((item) => item.weekNumber === 2)!;
    const exercise = day.sections[0].groups[0].exercises[0];
    const edited = applyImportDraftEdit(draft, {
      kind: "exercise-fields", dayId: day.id, exerciseId: exercise.id, fields: { sets: 6 },
    }, { scope: "occurrence", atImport: true });
    const serialized = serializeDraft(edited.program);
    const reparsed = parseProgramJson(serialized).program;
    const prescriptions = (program: typeof edited.program) => getRenderableDays(program).map((item) => item.sections[0].groups[0].exercises[0].sets);
    expect(prescriptions(edited.program)).toEqual([4, 6, 4]);
    expect(prescriptions(reparsed)).toEqual([4, 6, 4]);
  });

  it("uses full week overrides to preserve explicit clears that JSON variants cannot encode", () => {
    const review = parseProgramJson(source);
    const draft = createImportDraft(review, source);
    const day = draft.program.days.find((item) => item.weekNumber === 2)!;
    const exercise = day.sections[0].groups[0].exercises[0];
    const edited = applyImportDraftEdit(draft, {
      kind: "exercise-fields", dayId: day.id, exerciseId: exercise.id, fields: { reps: null },
    }, { scope: "occurrence", atImport: true });
    const serialized = serializeDraft(edited.program);
    expect(serialized).toContain('"scope":"week"');
    const reparsed = parseProgramJson(serialized).program;
    const reps = getRenderableDays(reparsed).map((item) => item.sections[0].groups[0].exercises[0].reps);
    expect(reps).toEqual(["8-10", undefined, "8-10"]);
  });
});
