import type { ProgramDay, ProgramDocument, ProgramExercise } from "./types";
import { getRenderableDays } from "./overrides";
import type {
  EditingElementBinding,
  EditingException,
  ProgramEditingMetadata,
} from "./editTypes";

const exerciseFields: (keyof ProgramExercise)[] = [
  "name", "canonicalExerciseId", "sets", "reps", "load", "unit", "rest", "tempo", "notes", "countsTowardVolume", "tags",
];

function stripVariantCarriers(day: ProgramDay): ProgramDay {
  const clean = <T extends object>(value: T): T => {
    const { __variants: _variants, ...fields } = value as T & { __variants?: unknown };
    return fields as T;
  };
  return {
    ...clean(day),
    sections: day.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        exercises: group.exercises.map((exercise) => clean(exercise)),
      })),
    })),
  };
}

function pairByIdentity<T extends { id: string }>(current: T[], base: T[], matches: (left: T, right: T) => boolean, allowPosition: boolean) {
  const used = new Set<T>();
  return current.flatMap((item, index) => {
    const exact = base.filter((candidate) => candidate.id === item.id && !used.has(candidate));
    const compatible = base.filter((candidate) => matches(item, candidate) && !used.has(candidate));
    const candidate = exact.length === 1 ? exact[0] : compatible.length === 1 ? compatible[0] : allowPosition && !used.has(base[index]) ? base[index] : undefined;
    if (!candidate) return [];
    used.add(candidate);
    return [{ item, candidate }];
  });
}

function bindElements(occurrence: ProgramDay, template: ProgramDay, allowPosition: boolean): EditingElementBinding[] {
  const bindings: EditingElementBinding[] = [];
  for (const { item: section, candidate: templateSection } of pairByIdentity(occurrence.sections, template.sections, (a, b) => a.type === b.type && a.name === b.name, allowPosition)) {
    if (section.type !== templateSection.type) continue;
    bindings.push({ occurrenceDayId: occurrence.id, occurrenceElementId: section.id, templateElementId: templateSection.id, kind: "section" });
    for (const { item: group, candidate: templateGroup } of pairByIdentity(section.groups, templateSection.groups, (a, b) => a.type === b.type, allowPosition)) {
      if (group.type !== templateGroup.type) continue;
      bindings.push({ occurrenceDayId: occurrence.id, occurrenceElementId: group.id, templateElementId: templateGroup.id, kind: "group" });
      for (const { item: exercise, candidate: templateExercise } of pairByIdentity(group.exercises, templateGroup.exercises, (a, b) => a.name === b.name && a.canonicalExerciseId === b.canonicalExerciseId, allowPosition)) {
        bindings.push({ occurrenceDayId: occurrence.id, occurrenceElementId: exercise.id, templateElementId: templateExercise.id, kind: "exercise" });
      }
    }
  }
  return bindings;
}

function exceptionsFor(occurrence: ProgramDay, template: ProgramDay, allowPosition: boolean): EditingException[] {
  const exceptions: EditingException[] = [];
  const weekNumber = occurrence.weekNumber;
  if (occurrence.title !== template.title) {
    exceptions.push({ kind: "field", dayId: occurrence.id, templateElementId: template.id, field: "title", reason: "Occurrence title differs from the template.", weekNumber });
  }
  const sectionPairs = pairByIdentity(occurrence.sections, template.sections, (a, b) => a.type === b.type && a.name === b.name, allowPosition);
  if (sectionPairs.length !== occurrence.sections.length || sectionPairs.length !== template.sections.length) exceptions.push({ kind: "structural", dayId: occurrence.id, templateElementId: template.id, reason: "Section structure differs from the template.", weekNumber });
  for (const { item: section, candidate: baseSection } of sectionPairs) {
    if (section.type !== baseSection.type || section.name !== baseSection.name) {
      exceptions.push({ kind: "field", dayId: occurrence.id, templateElementId: baseSection.id, field: section.type !== baseSection.type ? "sectionType" : "sectionName", reason: "Section differs from the template.", weekNumber });
    }
    const groupPairs = pairByIdentity(section.groups, baseSection.groups, (a, b) => a.type === b.type, allowPosition);
    if (groupPairs.length !== section.groups.length || groupPairs.length !== baseSection.groups.length) exceptions.push({ kind: "structural", dayId: occurrence.id, templateElementId: baseSection.id, reason: "Group structure differs from the template.", weekNumber });
    for (const { item: group, candidate: baseGroup } of groupPairs) {
      if (group.type !== baseGroup.type || group.notes !== baseGroup.notes) {
        exceptions.push({ kind: "field", dayId: occurrence.id, templateElementId: baseGroup.id, field: group.type !== baseGroup.type ? "groupType" : "groupNotes", reason: "Group differs from the template.", weekNumber });
      }
      const exercisePairs = pairByIdentity(group.exercises, baseGroup.exercises, (a, b) => a.name === b.name && a.canonicalExerciseId === b.canonicalExerciseId, allowPosition);
      if (exercisePairs.length !== group.exercises.length || exercisePairs.length !== baseGroup.exercises.length) exceptions.push({ kind: "structural", dayId: occurrence.id, templateElementId: baseGroup.id, reason: "Exercise structure differs from the template.", weekNumber });
      for (const { item: exercise, candidate: baseExercise } of exercisePairs) {
        if (exercise.name !== baseExercise.name || exercise.canonicalExerciseId !== baseExercise.canonicalExerciseId) {
          exceptions.push({ kind: "structural", dayId: occurrence.id, templateElementId: baseExercise.id, reason: "Exercise substitution differs from the template.", weekNumber });
          continue;
        }
        for (const field of exerciseFields) {
          if (JSON.stringify(exercise[field]) !== JSON.stringify(baseExercise[field])) exceptions.push({ kind: "field", dayId: occurrence.id, templateElementId: baseExercise.id, field, reason: `Occurrence ${field} differs from the template.`, weekNumber });
        }
      }
    }
  }
  return exceptions;
}

/** Imported expansion preserves known lineage; legacy occurrences require exact IDs. */
export function deriveEditingMetadata(program: ProgramDocument, suppliedBaseDays?: ProgramDay[]): ProgramEditingMetadata {
  const baseDays = suppliedBaseDays ?? program.days.filter((day) => day.weekNumber === undefined || day.weekNumber === 1);
  const hasParserLineage = suppliedBaseDays !== undefined;
  const templateDays = structuredClone(baseDays.map(stripVariantCarriers));
  const dayBindings: ProgramEditingMetadata["dayBindings"] = [];
  const elementBindings: EditingElementBinding[] = [];
  const exceptions: EditingException[] = [];
  const unmappedDayIds: string[] = [];
  const baseById = new Map(templateDays.map((day) => [day.id, day]));
  const parserTemplateByOccurrenceId = new Map<string, ProgramDay>();
  if (hasParserLineage && baseDays.length > 0) {
    const weeks = [...new Set(program.days.map((day) => day.weekNumber ?? 1))].sort((a, b) => a - b);
    for (const week of weeks) {
      const weekDays = program.days.filter((day) => (day.weekNumber ?? 1) === week);
      weekDays.forEach((day, index) => { if (baseDays[index]) parserTemplateByOccurrenceId.set(day.id, baseById.get(baseDays[index].id)!); });
    }
  }
  const overriddenDayIds = new Set(program.overrides.flatMap((override) => override.scope === "day"
    ? override.dayId ? [override.dayId] : []
    : program.days.filter((day) => (day.weekNumber ?? 1) === override.weekNumber).map((day) => day.id)));
  const occurrencePairs = getRenderableDays(program).map((occurrence) => ({
    occurrence,
    template: baseById.get(occurrence.id) ?? parserTemplateByOccurrenceId.get(occurrence.id),
  }));
  for (const { occurrence, template } of occurrencePairs) {
    if (!template) {
      if (!unmappedDayIds.includes(occurrence.id)) unmappedDayIds.push(occurrence.id);
      continue;
    }
    if (!dayBindings.some((binding) => binding.occurrenceDayId === occurrence.id)) dayBindings.push({ occurrenceDayId: occurrence.id, templateDayId: template.id });
    elementBindings.push(...bindElements(occurrence, template, hasParserLineage && !overriddenDayIds.has(occurrence.id)));
    const allowPosition = hasParserLineage && !overriddenDayIds.has(occurrence.id);
    if (overriddenDayIds.has(occurrence.id) || occurrence.id !== template.id) exceptions.push(...exceptionsFor(occurrence, template, allowPosition));
  }
  const uniqueExceptions = [...new Map(exceptions.map((exception) => [JSON.stringify(exception), exception])).values()];
  const uniqueBindings = [...new Map(elementBindings.map((binding) => [JSON.stringify(binding), binding])).values()];
  return { version: 1, templateDays, dayBindings, elementBindings: uniqueBindings, exceptions: uniqueExceptions, unmappedDayIds };
}

export function ensureEditingMetadata(program: ProgramDocument): ProgramDocument {
  if (program.editing) return program;
  return { ...program, editing: deriveEditingMetadata(program) };
}
