import { parseProgramJson } from "@/lib/import/parser";
import { applyProgramEdit, previewProgramEdit } from "./edits";
import { getRenderableDays } from "./overrides";
import type { ProgramDocument } from "./types";

const makeRoutine = (): ProgramDocument => parseProgramJson(JSON.stringify({
  title: "Audit routine",
  weeks: 3,
  days: [{
    day: 1,
    title: "Workout",
    sections: [{ type: "strength", groups: [{ type: "single", exercises: [{ name: "Squat", sets: 4, reps: "8" }] }] }],
  }],
})).program;

const dayExercise = (program: ProgramDocument, dayIndex: number) =>
  getRenderableDays(program)[dayIndex].sections[0].groups[0].exercises[0];

describe("edit engine audit", () => {
  it("keeps replacement identity and bindings usable for a subsequent recurring edit", () => {
    const program = makeRoutine();
    const source = program.days[0];
    const renamed = previewProgramEdit(program, {
      kind: "exercise-fields", dayId: source.id, exerciseId: dayExercise(program, 0).id,
      fields: { name: "Barbell Row", canonicalExerciseId: "barbell-row" },
    }, { scope: "routine-day" }).proposedDocument;
    const renamedId = dayExercise(renamed, 0).id;
    const editedAgain = previewProgramEdit(renamed, {
      kind: "exercise-fields", dayId: source.id, exerciseId: renamedId, fields: { reps: "12" },
    }, { scope: "routine-day" }).proposedDocument;

    expect(dayExercise(editedAgain, 0).id).not.toBe(dayExercise(program, 0).id);
    expect(getRenderableDays(editedAgain).map((_, index) => dayExercise(editedAgain, index).reps)).toEqual(["12", "12", "12"]);
  });

  it("updates template group bindings when routine-day grouping changes", () => {
    const program = makeRoutine();
    const source = program.days[0];
    const initialGroup = source.sections[0].groups[0];
    const regrouped = previewProgramEdit(program, {
      kind: "grouping", dayId: source.id, sectionId: source.sections[0].id,
      groups: [{ id: "new-group", type: "circuit", exerciseIds: [initialGroup.exercises[0].id] }],
    }, { scope: "routine-day" }).proposedDocument;
    const templateGroup = regrouped.editing!.templateDays[0].sections[0].groups[0];

    expect(templateGroup.id).toBe("new-group");
    for (const day of getRenderableDays(regrouped)) {
      expect(regrouped.editing!.elementBindings).toContainEqual(expect.objectContaining({
        occurrenceDayId: day.id,
        occurrenceElementId: day.sections[0].groups[0].id,
        templateElementId: templateGroup.id,
        kind: "group",
      }));
    }
  });

  it("propagates an explicit AI prescription clear to matching recurring occurrences", () => {
    const program = makeRoutine();
    const source = getRenderableDays(program)[0];
    const replacement = structuredClone(source);
    delete replacement.sections[0].groups[0].exercises[0].reps;
    const preview = previewProgramEdit(program, {
      kind: "day-content", dayId: source.id, replacement,
    }, { scope: "routine-day" });

    expect(getRenderableDays(preview.proposedDocument).map(day => day.sections[0].groups[0].exercises[0].reps)).toEqual([undefined, undefined, undefined]);
  });

  it("preserves a deliberate structural substitution carried by a variant", () => {
    const program = parseProgramJson(JSON.stringify({
      title: "Variant routine", weeks: 2,
      days: [{ day: 1, title: "Workout", sections: [{ type: "strength", groups: [{ type: "single", exercises: [{
        name: "Squat", sets: 4, reps: "8", variants: [{ weeks: [2], name: "Front Squat", sets: 3 }],
      }] }] }] }],
    })).program;
    const source = program.days[0];
    const edit = previewProgramEdit(program, {
      kind: "exercise-fields", dayId: source.id, exerciseId: dayExercise(program, 0).id, fields: { reps: "10" },
    }, { scope: "routine-day" });

    expect(dayExercise(edit.proposedDocument, 0).reps).toBe("10");
    expect(dayExercise(edit.proposedDocument, 1).name).toBe("Front Squat");
    expect(dayExercise(edit.proposedDocument, 1).sets).toBe(3);
    expect(dayExercise(edit.proposedDocument, 1).reps).toBe("8");
    expect(edit.preservedExceptions.some(item => item.dayId === program.days[1].id)).toBe(true);
  });

  it("does not append another occurrence override when the same edit is previewed twice", () => {
    const program = makeRoutine();
    const edit = { kind: "exercise-fields" as const, dayId: program.days[0].id, exerciseId: dayExercise(program, 0).id, fields: { sets: 5 } };
    const firstPreview = previewProgramEdit(program, edit, { scope: "occurrence" });
    const first = applyProgramEdit(program, firstPreview);
    const secondPreview = previewProgramEdit(first, edit, { scope: "occurrence" });
    const second = applyProgramEdit(first, secondPreview);

    expect(second.overrides.filter(override => override.scope === "day" && override.dayId === program.days[0].id)).toHaveLength(1);
    expect(dayExercise(second, 0).sets).toBe(5);
  });

  it("clears an included field exception when AI day-content adopts its value", () => {
    const program = makeRoutine();
    const occurrence = getRenderableDays(program)[1];
    const exercise = occurrence.sections[0].groups[0].exercises[0];
    exercise.sets = 7;
    const templateId = program.editing!.elementBindings.find(binding =>
      binding.occurrenceDayId === occurrence.id && binding.occurrenceElementId === exercise.id
    )!.templateElementId;
    program.editing!.exceptions.push({
      kind: "field", dayId: occurrence.id, templateElementId: templateId, field: "sets", reason: "edited locally",
    });
    const replacement = structuredClone(getRenderableDays(program)[0]);
    replacement.sections[0].groups[0].exercises[0].sets = 5;

    const included = previewProgramEdit(program, {
      kind: "day-content", dayId: program.days[0].id, replacement,
    }, { scope: "routine-day", includeExceptionDayIds: [occurrence.id] }).proposedDocument;
    const repeated = previewProgramEdit(included, {
      kind: "exercise-fields", dayId: program.days[0].id,
      exerciseId: dayExercise(included, 0).id, fields: { sets: 6 },
    }, { scope: "routine-day" }).proposedDocument;

    expect(dayExercise(repeated, 1).sets).toBe(6);
    expect(repeated.editing!.exceptions).not.toContainEqual(expect.objectContaining({ dayId: occurrence.id, templateElementId: templateId, field: "sets" }));
  });

  it("updates the repeated day title and baseline for day-content edits", () => {
    const program = makeRoutine();
    const replacement = structuredClone(getRenderableDays(program)[0]);
    replacement.title = "Updated Workout";

    const preview = previewProgramEdit(program, {
      kind: "day-content", dayId: program.days[0].id, replacement,
    }, { scope: "routine-day" });

    const templateDayId = program.editing!.dayBindings.find(binding => binding.occurrenceDayId === program.days[0].id)!.templateDayId;
    const recurringDayIds = new Set(program.editing!.dayBindings.filter(binding => binding.templateDayId === templateDayId).map(binding => binding.occurrenceDayId));
    expect(getRenderableDays(preview.proposedDocument).filter(day => recurringDayIds.has(day.id)).map(day => day.title)).toEqual(
      Array.from(recurringDayIds, () => "Updated Workout")
    );
    expect(preview.proposedDocument.editing!.templateDays[0].title).toBe("Updated Workout");
  });

  it("clears an included structural exception when AI day-content adopts the grouping", () => {
    const program = makeRoutine();
    const occurrence = getRenderableDays(program)[1];
    const sectionId = occurrence.sections[0].id;
    const templateSectionId = program.editing!.elementBindings.find(binding =>
      binding.occurrenceDayId === occurrence.id && binding.occurrenceElementId === sectionId
    )!.templateElementId;
    program.editing!.exceptions.push({
      kind: "structural", dayId: occurrence.id, templateElementId: templateSectionId, reason: "regrouped locally",
    });
    const replacement = structuredClone(getRenderableDays(program)[0]);
    replacement.sections[0].groups[0].type = "circuit";

    const preview = previewProgramEdit(program, {
      kind: "day-content", dayId: program.days[0].id, replacement,
    }, { scope: "routine-day", includeExceptionDayIds: [occurrence.id] });

    expect(getRenderableDays(preview.proposedDocument)[1].sections[0].groups[0].type).toBe("circuit");
    expect(preview.proposedDocument.editing!.exceptions).not.toContainEqual(expect.objectContaining({
      kind: "structural", dayId: occurrence.id, templateElementId: templateSectionId,
    }));
  });

  it("gives renamed day-content exercises a new identity so existing log rows stay attached to the old one", () => {
    const program = makeRoutine();
    const oldIds = getRenderableDays(program).map(day => day.sections[0].groups[0].exercises[0].id);
    const replacement = structuredClone(getRenderableDays(program)[0]);
    replacement.sections[0].groups[0].exercises[0].name = "Front Squat";

    const preview = previewProgramEdit(program, {
      kind: "day-content", dayId: program.days[0].id, replacement,
    }, { scope: "routine-day" });
    const newIds = getRenderableDays(preview.proposedDocument).map(day => day.sections[0].groups[0].exercises[0].id);

    expect(newIds.every((id, index) => id !== oldIds[index])).toBe(true);
    expect(new Set(newIds).size).toBe(newIds.length);
  });

  it("isolates plain parsed week occurrences before previewing recurring edits", () => {
    const program = parseProgramJson(JSON.stringify({
      title: "Plain recurring routine", weeks: 2,
      days: [{ day: 1, title: "Workout", sections: [{ type: "strength", groups: [{ type: "single", exercises: [{ name: "Squat", sets: 4, reps: "8" }] }] }] }],
    })).program;
    const source = getRenderableDays(program)[0];
    const preview = previewProgramEdit(program, {
      kind: "exercise-fields", dayId: source.id,
      exerciseId: source.sections[0].groups[0].exercises[0].id,
      fields: { sets: 3 },
    }, { scope: "routine-day" });

    expect(preview.changes).toHaveLength(2);
    expect(getRenderableDays(preview.proposedDocument).map(day => day.sections[0].groups[0].exercises[0].sets)).toEqual([3, 3]);
  });

  it("preserves descendant structural exceptions during repeated day-content topology changes unless included", () => {
    const program = parseProgramJson(JSON.stringify({
      title: "Variant routine", weeks: 2,
      days: [{ day: 1, title: "Workout", sections: [{ type: "strength", groups: [{ type: "single", exercises: [{
        name: "Squat", sets: 4, reps: "8", variants: [{ weeks: [2], name: "Front Squat", sets: 3 }],
      }] }] }] }],
    })).program;
    const source = getRenderableDays(program)[0];
    const replacement = structuredClone(source);
    replacement.sections[0].groups[0].type = "circuit";
    const edit = { kind: "day-content" as const, dayId: source.id, replacement };
    const preserved = previewProgramEdit(program, edit, { scope: "routine-day" });

    expect(getRenderableDays(preserved.proposedDocument)[1].sections[0].groups[0].type).toBe("single");
    expect(getRenderableDays(preserved.proposedDocument)[1].sections[0].groups[0].exercises[0].name).toBe("Front Squat");
    const exception = preserved.preservedExceptions.find(item => item.dayId === program.days[1].id)!;
    expect(exception.selectionId).toBe(program.days[1].id);

    const included = previewProgramEdit(program, edit, {
      scope: "routine-day", includeExceptionDayIds: [exception.selectionId!],
    });
    expect(getRenderableDays(included.proposedDocument)[1].sections[0].groups[0].type).toBe("circuit");
  });
});
