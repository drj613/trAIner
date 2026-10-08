import { deriveEditingMetadata } from "@/lib/programs/editMetadata";
import { getRenderableDays } from "@/lib/programs/overrides";
import type { ProgramDay, ProgramDocument, ProgramExercise } from "@/lib/programs/types";

const exerciseFields: (keyof ProgramExercise)[] = [
  "name", "sets", "reps", "load", "unit", "rest", "tempo", "notes", "countsTowardVolume", "tags",
];

export function serializeDraft(program: ProgramDocument): string {
  const metadata = program.editing ?? deriveEditingMetadata(program);
  const effectiveDays = getRenderableDays(program);
  const byTemplate = new Map<string, ProgramDay[]>();
  for (const occurrence of effectiveDays) {
    const templateId = metadata.dayBindings.find((binding) => binding.occurrenceDayId === occurrence.id)?.templateDayId;
    if (!templateId) continue;
    byTemplate.set(templateId, [...(byTemplate.get(templateId) ?? []), occurrence]);
  }
  const templateEntries = metadata.templateDays.map((template) => ({
    templateId: template.id,
    day: byTemplate.get(template.id)?.find((day) => day.id === template.id || day.weekNumber === 1) ?? template,
  }));

  const weekOverrides = new Set<number>();
  const variants = new Map<string, Map<string, Record<string, unknown>[]>>();
  for (const { templateId, day: template } of templateEntries) {
    const occurrences = byTemplate.get(templateId) ?? [];
    for (const occurrence of occurrences) {
      if (occurrence.id === template.id && occurrence.weekNumber === undefined) continue;
      if (occurrence.weekNumber === 1) continue;
      const weekNumber = occurrence.weekNumber;
      if (weekNumber === undefined) continue;
      if (!sameTopology(template, occurrence) || hasExplicitClear(template, occurrence)) {
        weekOverrides.add(weekNumber);
        continue;
      }
      for (let si = 0; si < template.sections.length; si++) {
        for (let gi = 0; gi < template.sections[si].groups.length; gi++) {
          for (let ei = 0; ei < template.sections[si].groups[gi].exercises.length; ei++) {
            const base = template.sections[si].groups[gi].exercises[ei];
            const current = occurrence.sections[si].groups[gi].exercises[ei];
            const fields: Record<string, unknown> = {};
            for (const field of exerciseFields) {
              if (JSON.stringify(base[field]) !== JSON.stringify(current[field])) fields[field] = current[field];
            }
            if (Object.keys(fields).length > 0) {
              const perExercise = variants.get(template.id) ?? new Map<string, Record<string, unknown>[]>();
              const list = perExercise.get(base.id) ?? [];
              const existing = list.find((variant) => Object.entries(fields).every(([key, value]) => JSON.stringify(variant[key]) === JSON.stringify(value))
                && Object.keys(variant).filter((key) => key !== "weeks").length === Object.keys(fields).length);
              if (existing) (existing.weeks as number[]).push(weekNumber);
              else list.push({ weeks: [weekNumber], ...fields });
              perExercise.set(base.id, list);
              variants.set(template.id, perExercise);
            }
          }
        }
      }
    }
  }

  // Occurrences without template bindings are still real imported data. A
  // week-level replacement is the only lossless representation for them.
  for (const occurrence of effectiveDays) {
    if (occurrence.weekNumber === undefined) continue;
    if (!metadata.dayBindings.some((binding) => binding.occurrenceDayId === occurrence.id)) {
      weekOverrides.add(occurrence.weekNumber);
    }
  }

  const days = templateEntries.map(({ day }) => serializeDay(day, variants.get(day.id)));
  const overrides = [...weekOverrides].sort((a, b) => a - b).map((weekNumber) => ({
    scope: "week",
    weekNumber,
    reason: "Imported exception",
    days: effectiveDays.filter((day) => day.weekNumber === weekNumber).map((day) => serializeDay(day)),
  }));
  const payload = {
    program_name: program.title,
    ...(program.description ? { description: program.description } : {}),
    ...(program.lengthWeeks ? { weeks: program.lengthWeeks } : {}),
    ...(program.progression ? { progression: program.progression } : {}),
    days,
    ...(overrides.length > 0 ? { overrides } : {}),
  };
  return JSON.stringify(payload);
}

function sameTopology(a: ProgramDay, b: ProgramDay): boolean {
  if (a.title !== b.title || a.sections.length !== b.sections.length) return false;
  return a.sections.every((section, si) => {
    const other = b.sections[si];
    return section.type === other.type && section.name === other.name && section.groups.length === other.groups.length
      && section.groups.every((group, gi) => {
        const next = other.groups[gi];
        return group.type === next.type && group.notes === next.notes && group.exercises.length === next.exercises.length;
      });
  });
}

function hasExplicitClear(template: ProgramDay, occurrence: ProgramDay): boolean {
  return template.sections.some((section, si) => section.groups.some((group, gi) => group.exercises.some((exercise, ei) => {
    const changed = occurrence.sections[si].groups[gi].exercises[ei];
    return exerciseFields.some((field) => exercise[field] !== undefined && changed[field] === undefined);
  })));
}

function serializeDay(day: ProgramDay, variantsByExercise?: Map<string, Record<string, unknown>[]>): Record<string, unknown> {
  return {
    day: day.dayNumber,
    ...(day.templateWeek !== undefined ? { week: day.templateWeek } : {}),
    title: day.title,
    sections: day.sections.map((section) => ({
      type: section.type,
      name: section.name,
      groups: section.groups.map((group) => ({
        type: group.type,
        ...(group.notes ? { notes: group.notes } : {}),
        exercises: group.exercises.map((exercise) => ({
          name: exercise.name,
          sets: exercise.sets,
          ...(exercise.reps !== undefined ? { reps: exercise.reps } : {}),
          ...(exercise.load !== undefined ? { load: exercise.load } : {}),
          ...(exercise.unit !== undefined ? { unit: exercise.unit } : {}),
          ...(exercise.rest !== undefined ? { rest: exercise.rest } : {}),
          ...(exercise.tempo !== undefined ? { tempo: exercise.tempo } : {}),
          ...(exercise.notes !== undefined ? { notes: exercise.notes } : {}),
          ...(exercise.countsTowardVolume !== undefined ? { countsTowardVolume: exercise.countsTowardVolume } : {}),
          ...(exercise.tags ? { tags: exercise.tags } : {}),
          ...(variantsByExercise?.has(exercise.id) ? { variants: variantsByExercise.get(exercise.id) } : {}),
        })),
      })),
    })),
  };
}
