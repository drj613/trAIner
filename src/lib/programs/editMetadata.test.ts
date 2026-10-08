import { describe, expect, it } from "@jest/globals";
import { deriveEditingMetadata, ensureEditingMetadata } from "./editMetadata";
import type { ProgramDay, ProgramDocument } from "./types";

const exercise = (id: string, name: string) => ({
  id, name, sets: 3, reps: "8", tags: { primary: [], secondary: [], incidental: [], modifiers: [] },
});

const day = (id: string, title: string, exerciseIds: string[], weekNumber: number): ProgramDay => ({
  id, title, dayNumber: 1, weekNumber, sections: [{ id: `${id}-s`, type: "strength", name: "Main", groups: [{
    id: `${id}-g`, type: "single", exercises: exerciseIds.map((exerciseId) => exercise(exerciseId, "Squat")),
  }] }],
});

const program = (days: ProgramDay[]): ProgramDocument => ({
  id: "program", title: "Routine", source: "import", active: false, days, overrides: [], createdAt: "now", updatedAt: "now",
});

describe("editing metadata", () => {
  it("keeps same-title recurring days distinct and scopes repeated exercise IDs by occurrence", () => {
    const base = [day("template-a", "Workout", ["same-1", "same-2"], 1), day("template-b", "Workout", ["same-3"], 1)];
    const occurrences = [day("a-w2", "Workout", ["same-1", "same-2"], 2), day("b-w2", "Workout", ["same-3"], 2)];
    const metadata = deriveEditingMetadata(program(occurrences), base);

    expect(metadata.templateDays.map((item) => item.id)).toEqual(["template-a", "template-b"]);
    expect(metadata.dayBindings).toEqual([
      { occurrenceDayId: "a-w2", templateDayId: "template-a" },
      { occurrenceDayId: "b-w2", templateDayId: "template-b" },
    ]);
    expect(metadata.elementBindings.filter((binding) => binding.kind === "exercise" && binding.occurrenceDayId === "a-w2")).toHaveLength(2);
  });

  it("leaves ambiguous legacy day matches unbound", () => {
    const metadata = deriveEditingMetadata(program([
      day("base-a", "Workout", ["x"], 1), day("base-b", "Workout", ["x"], 1), day("legacy", "Workout", ["x"], 2),
    ]));

    expect(metadata.dayBindings).not.toContainEqual({ occurrenceDayId: "legacy", templateDayId: "base-a" });
    expect(metadata.unmappedDayIds).toContain("legacy");
  });

  it("does not infer parser ordering for a legacy routine with repeated identical slots", () => {
    const days = [
      day("a-w1", "Workout", ["shared"], 1), day("b-w1", "Workout", ["shared"], 1),
      day("a-w2", "Workout", ["shared"], 2), day("b-w2", "Workout", ["shared"], 2),
    ];
    const metadata = deriveEditingMetadata(program(days));

    expect(metadata.dayBindings).not.toContainEqual({ occurrenceDayId: "a-w2", templateDayId: "a-w1" });
    expect(metadata.unmappedDayIds).toEqual(expect.arrayContaining(["a-w2", "b-w2"]));
  });

  it("preserves substitution and progression differences as intentional exceptions", () => {
    const base = day("base", "Workout", ["original"], 1);
    const substituted = day("week-two", "Workout", ["replacement"], 2);
    substituted.sections[0].groups[0].exercises[0].sets = 5;
    const metadata = deriveEditingMetadata(program([substituted]), [base]);

    expect(metadata.dayBindings).toEqual([{ occurrenceDayId: "week-two", templateDayId: "base" }]);
    expect(metadata.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "field", templateElementId: "original", field: "sets" }),
    ]));
    expect(metadata.exceptions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "structural", reason: expect.stringContaining("substitution") }),
    ]));
  });

  it("strips parser-only variant carriers from stored template exercises", () => {
    const base = day("base", "Workout", ["original"], 1);
    const exerciseWithVariant = base.sections[0].groups[0].exercises[0] as typeof base.sections[0]["groups"][0]["exercises"][number] & { __variants?: unknown[] };
    exerciseWithVariant.__variants = [{ week: 2, sets: 5 }];
    const metadata = deriveEditingMetadata(program([base]), [base]);

    expect("__variants" in metadata.templateDays[0].sections[0].groups[0].exercises[0]).toBe(false);
  });

  it("records differences in full week override replacements", () => {
    const base = day("base", "Workout", ["same"], 1);
    const replacement = day("week-two", "Workout", ["replacement-id"], 2);
    replacement.sections[0].groups[0].exercises[0].sets = 4;
    const routine = program([base, day("week-two", "Workout", ["same"], 2)]);
    routine.overrides = [{
      id: "override", scope: "week", programId: routine.id, weekNumber: 2,
      replacement, createdAt: "now",
    }];
    const metadata = deriveEditingMetadata(routine, [base]);

    expect(metadata.dayBindings).toContainEqual({ occurrenceDayId: "base", templateDayId: "base" });
    expect(metadata.elementBindings).toContainEqual({
      occurrenceDayId: "week-two", occurrenceElementId: "replacement-id", templateElementId: "same", kind: "exercise",
    });
    expect(metadata.exceptions).toContainEqual(expect.objectContaining({
      kind: "field", dayId: "week-two", templateElementId: "same", field: "sets", weekNumber: 2,
    }));
  });

  it("keeps group lineage when the occurrence reorders groups", () => {
    const base = day("base", "Workout", ["one"], 1);
    base.sections[0].groups.push({ id: "base-g2", type: "single", exercises: [exercise("two", "Press")] });
    const occurrence = structuredClone(base);
    occurrence.id = "week-two";
    occurrence.weekNumber = 2;
    occurrence.sections[0].groups.reverse();
    const metadata = deriveEditingMetadata(program([occurrence]), [base]);

    expect(metadata.elementBindings).toContainEqual({
      occurrenceDayId: "week-two", occurrenceElementId: "base-g2", templateElementId: "base-g2", kind: "group",
    });
    expect(metadata.elementBindings).toContainEqual({
      occurrenceDayId: "week-two", occurrenceElementId: "base-g", templateElementId: "base-g", kind: "group",
    });
  });

  it("initializes metadata lazily without changing the program's rendering days", () => {
    const original = program([day("base", "Workout", ["x"], 1)]);
    const ensured = ensureEditingMetadata(original);

    expect(ensured.editing).toBeDefined();
    expect(ensured.days).toEqual(original.days);
    expect(original.editing).toBeUndefined();
  });
});
