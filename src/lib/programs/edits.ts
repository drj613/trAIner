import type {
  ProgramDay,
  ProgramDocument,
  ProgramExercise,
  ProgramGroup,
  WorkoutLogDocument,
} from './types';
import type { ProgramEditingMetadata } from './editTypes';
import { ensureEditingMetadata } from './editMetadata';
import { getRenderableDays } from './overrides';
import { normalizePrescription, validateProgram } from './validation';

export type EditScope = 'occurrence' | 'routine-day';
export type ExerciseFields = {
  [K in keyof Omit<ProgramExercise, 'id'>]?: ProgramExercise[K] | null;
};
export type ProgramEdit =
  | {
      kind: 'exercise-fields';
      dayId: string;
      exerciseId: string;
      fields: ExerciseFields;
    }
  | {
      kind: 'exercise-replacement';
      dayId: string;
      exerciseId: string;
      exercise: ProgramExercise;
    }
  | {
      kind: 'grouping';
      dayId: string;
      sectionId: string;
      groups: {
        id: string;
        type: ProgramGroup['type'];
        notes?: string;
        exerciseIds: string[];
      }[];
    }
  | { kind: 'day-order'; templateDayIds: string[] }
  | { kind: 'day-content'; dayId: string; replacement: ProgramDay };
export type ProgramEditContext = {
  scope: EditScope;
  logs?: WorkoutLogDocument[];
  includeExceptionDayIds?: string[];
  atImport?: boolean;
};
export type OccurrenceChange = {
  dayId: string;
  weekNumber?: number;
  elementId: string;
  field: string;
  before: unknown;
  after: unknown;
};
export type SkippedEdit = {
  selectionId?: string; dayId: string; elementId?: string; reason: string };
export type ProgramEditPreview = {
  proposedDocument: ProgramDocument;
  changes: OccurrenceChange[];
  preservedExceptions: SkippedEdit[];
  unmappedTargets: SkippedEdit[];
  validationResults: ReturnType<typeof validateProgram>;
  sourceRevision: string;
  completionRevision: string;
  edit: ProgramEdit;
  context: ProgramEditContext;
};
export const programRevision = (program: ProgramDocument) =>
  JSON.stringify(program);
export const completionRevision = (logs: WorkoutLogDocument[] = []) =>
  JSON.stringify(
    logs
      .filter(l => l.completedAt || l.skippedAt)
      .map(l => [l.id, l.dayId, l.completedAt, l.skippedAt])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  );
const exercises = (d: ProgramDay) =>
  d.sections.flatMap(s => s.groups.flatMap(g => g.exercises));
const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

export function previewProgramEdit(
  input: ProgramDocument,
  edit: ProgramEdit,
  context: ProgramEditContext
): ProgramEditPreview {
  edit = clone(edit);
  const corrections: ReturnType<typeof validateProgram> = [];
  if (edit.kind === 'exercise-fields' && Object.hasOwn(edit.fields, 'sets')) {
    const normalized = normalizePrescription(
      { sets: edit.fields.sets },
      `edit.${edit.exerciseId}`,
      edit.exerciseId
    );
    edit.fields.sets = normalized.sets;
    corrections.push(...normalized.diagnostics);
  }
  const program = clone(ensureEditingMetadata(input));
  if (program.import && corrections.length) program.import.warnings.push(...corrections);
  const metadata = program.editing!;
  // Some parser paths reuse the same nested objects for repeated weeks. Each
  // occurrence must be independently mutable so edits and exception handling
  // cannot leak from one week into another before overrides are persisted.
  const days = getRenderableDays(program).map(day => clone(day));
  const initialDays = clone(days);
  const initialBindings = clone(metadata.elementBindings);
  const changes: OccurrenceChange[] = [];
  const preservedExceptions: SkippedEdit[] = [];
  const unmappedTargets: SkippedEdit[] = [];
  const changedDays = new Set<string>();
  const included = new Set(context.includeExceptionDayIds ?? []);
  const selectionId = (dayId: string, elementId?: string, field?: string) => JSON.stringify([dayId, elementId, field]);
  const isIncluded = (dayId: string, elementId?: string, field?: string) => included.has(dayId) || included.has(selectionId(dayId, elementId, field));
  const binding = (dayId: string, elementId: string) =>
    metadata.elementBindings.find(
      b => b.occurrenceDayId === dayId && b.occurrenceElementId === elementId
    );
  const targetId = (dayId: string, templateElementId: string) =>
    metadata.elementBindings.find(
      b =>
        b.occurrenceDayId === dayId && b.templateElementId === templateElementId
    )?.occurrenceElementId;
  const hasException = (dayId: string, elementId: string, field?: string) =>
    metadata.exceptions.some(
      e =>
        e.dayId === dayId &&
        (e.templateElementId === elementId || !e.templateElementId) &&
        (e.kind === 'structural' || ('field' in e && e.field === field))
    );
  const record = (
    day: ProgramDay,
    elementId: string,
    field: string,
    before: unknown,
    after: unknown
  ) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    changes.push({
      dayId: day.id,
      weekNumber: day.weekNumber,
      elementId,
      field,
      before: clone(before),
      after: clone(after),
    });
    changedDays.add(day.id);
  };
  if (edit.kind === 'day-order') {
    const ids = metadata.templateDays.map(d => d.id);
    if (
      edit.templateDayIds.length !== ids.length ||
      new Set(edit.templateDayIds).size !== ids.length ||
      ids.some(id => !edit.templateDayIds.includes(id))
    )
      throw new Error('Order must include every workout and rest slot once');
    const oldOrdinal = new Map(program.days.map(d => [d.id, d.dayNumber]));
    const rank = (id: string) =>
      edit.templateDayIds.indexOf(
        metadata.dayBindings.find(b => b.occurrenceDayId === id)
          ?.templateDayId ?? ''
      );
    if (program.days.some(d => rank(d.id) < 0))
      throw new Error('Cannot reorder unbound workout slots');
    program.days.sort(
      (a, b) =>
        (a.weekNumber ?? 1) - (b.weekNumber ?? 1) || rank(a.id) - rank(b.id)
    );
    for (const day of program.days) {
      const n = rank(day.id) + 1;
      record(day, day.id, 'dayNumber', day.dayNumber, n);
      day.dayNumber = n;
    }
    for (const override of program.overrides) {
      const rs = Array.isArray(override.replacement)
        ? override.replacement
        : [override.replacement];
      for (const d of rs) {
        const slot = program.days.find(x =>
          override.scope === 'day'
            ? x.id === override.dayId
            : (x.weekNumber ?? 1) === override.weekNumber &&
              oldOrdinal.get(x.id) === d.dayNumber
        );
        if (slot) d.dayNumber = slot.dayNumber;
      }
    }
    metadata.templateDays = edit.templateDayIds.map((id, i) => ({
      ...metadata.templateDays.find(d => d.id === id)!,
      dayNumber: i + 1,
    }));
  } else {
    const source = clone(days.find(d => d.id === edit.dayId));
    if (!source) throw new Error('Workout occurrence not found');
    const recurring = metadata.dayBindings.find(
      b => b.occurrenceDayId === source.id
    )?.templateDayId;
    const counts = new Map(days.map(d => [d.id, 0]));
    for (const log of context.logs ?? []) {
      if (log.completedAt || log.skippedAt)
        counts.set(log.dayId, (counts.get(log.dayId) ?? 0) + 1);
    }
    const pass = Math.min(...days.map(d => counts.get(d.id) ?? 0));
    const sourceIndex = days.findIndex(d => d.id === source.id);
    const targets =
      context.scope === 'occurrence'
        ? [days.find(d => d.id === source.id)!]
        : days.filter(
            d =>
              d.id === source.id ||
              (recurring &&
                metadata.dayBindings.some(
                  b =>
                    b.occurrenceDayId === d.id && b.templateDayId === recurring
                ))
          );
    const sourceElement =
      edit.kind === 'grouping'
        ? edit.sectionId
        : edit.kind === 'day-content'
          ? source.id
          : edit.exerciseId;
    const lineage =
      edit.kind === 'day-content'
        ? recurring
        : binding(source.id, sourceElement)?.templateElementId;
    for (const day of targets) {
      if (
        !context.atImport &&
        (days.indexOf(day) < sourceIndex || (counts.get(day.id) ?? 0) > pass)
      ) {
        preservedExceptions.push({
          dayId: day.id,
          reason: 'Completed, skipped or earlier in the current pass',
        });
        continue;
      }
      const direct = day.id === source.id;
      const id = direct
        ? sourceElement
        : lineage
          ? targetId(day.id, lineage)
          : undefined;
      if (!direct && (!lineage || (edit.kind !== 'day-content' && !id))) {
        unmappedTargets.push({
          dayId: day.id,
          reason: 'No unambiguous routine lineage',
        });
        continue;
      }
      const allow = (field?: string) =>
        direct ||
        isIncluded(day.id, id, field) ||
        !hasException(day.id, lineage!, field);
      if (
        edit.kind === 'exercise-fields' ||
        edit.kind === 'exercise-replacement'
      ) {
        const exercise = exercises(day).find(e => e.id === id);
        if (!exercise) {
          unmappedTargets.push({
            dayId: day.id,
            elementId: id,
            reason: 'Exercise was substituted or removed',
          });
          continue;
        }
        const fields =
          edit.kind === 'exercise-fields'
            ? edit.fields
            : (Object.fromEntries(
                Object.entries(edit.exercise).filter(([key]) => key !== 'id')
              ) as ExerciseFields);
        const previousIdentity = [exercise.name, exercise.canonicalExerciseId];
        for (const [field, value] of Object.entries(fields)) {
          if (!allow(field)) {
            preservedExceptions.push({
              dayId: day.id,
              elementId: id,
              selectionId: selectionId(day.id, id, field),
              reason: `Preserved ${field} exception`,
            });
            continue;
          }
          const before = exercise[field as keyof ProgramExercise];
          const after = value === null ? undefined : value;
          record(day, exercise.id, field, before, after);
          if (value === null)
            delete (exercise as unknown as Record<string, unknown>)[field];
          else
            (exercise as unknown as Record<string, unknown>)[field] =
              clone(value);
          updateException(
            metadata,
            day.id,
            lineage!,
            field,
            context.scope,
            direct || isIncluded(day.id, id, field)
          );
        }
        if (
          previousIdentity[0] !== exercise.name ||
          previousIdentity[1] !== exercise.canonicalExerciseId
        ) {
          const oldId = exercise.id;
          exercise.id = crypto.randomUUID();
          const existingBinding = metadata.elementBindings.find(
            b => b.occurrenceDayId === day.id && b.occurrenceElementId === oldId
          );
          if (existingBinding)
            existingBinding.occurrenceElementId = exercise.id;
          if (context.scope === 'occurrence')
            metadata.exceptions.push({
              kind: 'structural',
              dayId: day.id,
              templateElementId: lineage,
              reason: 'Exercise replaced in this occurrence',
            });
        }
      } else if (edit.kind === 'grouping') {
        if (!allow()) {
          preservedExceptions.push({
            dayId: day.id,
            selectionId: selectionId(day.id, id),
            reason: 'Preserved structural exception',
          });
          continue;
        }
        const section = day.sections.find(s => s.id === id);
        if (!section) {
          unmappedTargets.push({ dayId: day.id, reason: 'Section not bound' });
          continue;
        }
        const members = section.groups.flatMap(g => g.exercises);
        const mapped = edit.groups.map(g => ({
          ...g,
          exercises: g.exerciseIds.map(eid => {
            const tid = binding(source.id, eid)?.templateElementId;
            return members.find(
              e =>
                e.id ===
                (direct ? eid : tid ? targetId(day.id, tid) : undefined)
            );
          }),
        }));
        const all = mapped.flatMap(g => g.exercises);
        if (
          all.some(e => !e) ||
          all.length !== members.length ||
          new Set(all.map(e => e?.id)).size !== members.length
        )
          throw new Error('Grouping must preserve every member exactly once');
        const next = mapped.map(g => ({
          id: direct
            ? g.id
            : ((binding(source.id, g.id)?.templateElementId
                ? targetId(day.id, binding(source.id, g.id)!.templateElementId)
                : undefined) ?? `${g.id}:${day.id}`),
          type: g.type,
          notes: g.notes,
          exercises: g.exercises as ProgramExercise[],
        }));
        record(day, section.id, 'groups', section.groups, next);
        section.groups = next;
        next.forEach((group,index) => {
          const templateElementId = binding(source.id, edit.groups[index].id)?.templateElementId ?? edit.groups[index].id;
          metadata.elementBindings = metadata.elementBindings.filter(b => !(b.occurrenceDayId === day.id && b.kind === 'group' && b.templateElementId === templateElementId));
          metadata.elementBindings.push({occurrenceDayId:day.id,occurrenceElementId:group.id,templateElementId,kind:'group'});
        });
        updateException(
          metadata,
          day.id,
          lineage!,
          'groups',
          context.scope,
          included.has(day.id)
        );
        if (context.scope === 'routine-day' && isIncluded(day.id, id))
          clearDayStructuralException(metadata, day.id, lineage);
      } else {
        const replacement = clone(edit.replacement);
        if (!direct) {
          const sourceExercises = exercises(source),
            nextExercises = exercises(replacement);
          const topology = (d: ProgramDay) =>
            JSON.stringify(
              d.sections.map(s => ({
                type: s.type,
                name: s.name,
                groups: s.groups.map(g => ({
                  type: g.type,
                  notes: g.notes,
                  ids: g.exercises.map(e => e.id),
                })),
              }))
            );
          if (topology(source) !== topology(replacement)) {
            const hasStructuralException = metadata.exceptions.some(
              exception =>
                exception.kind === 'structural' && exception.dayId === day.id
            );
            if (hasStructuralException && !isIncluded(day.id)) {
              preservedExceptions.push({
                dayId: day.id,
                selectionId: day.id,
                reason: 'Preserved structural exception',
              });
              continue;
            }
            if (!allow()) {
              preservedExceptions.push({
                dayId: day.id,
                selectionId: day.id,
                reason: 'Preserved structural exception',
              });
              continue;
            }
            // Structural replacements need complete, unique lineage for every retained exercise.
            let unbound = false;
            replacement.sections.forEach(s => {
              s.id =
                targetId(
                  day.id,
                  binding(source.id, s.id)?.templateElementId ?? ''
                ) ?? `${s.id}:${day.id}`;
              s.groups.forEach(g => {
                g.id =
                  targetId(
                    day.id,
                    binding(source.id, g.id)?.templateElementId ?? ''
                  ) ?? `${g.id}:${day.id}`;
                g.exercises = g.exercises.map(e => {
                  const original = sourceExercises.find(o => o.id === e.id);
                  if (!original) return { ...e, id: `${e.id}:${day.id}` };
                  const tid = binding(source.id, e.id)?.templateElementId;
                  const current = exercises(day).find(
                    x => x.id === (tid ? targetId(day.id, tid) : undefined)
                  );
                  if (!current) {
                    unbound = true;
                    return e;
                  }
                  const merged = { ...current };
                  for (const key of Array.from(new Set([...Object.keys(original), ...Object.keys(e)])) as (keyof ProgramExercise)[]) {
                    if (key === 'id') continue;
                    if (
                      JSON.stringify(original[key]) !==
                        JSON.stringify(e[key]) &&
                      (isIncluded(day.id, current.id, key) || !hasException(day.id, tid!, key))
                    )
                      (merged as unknown as Record<string, unknown>)[key] =
                        clone(e[key]);
                  }
                  return merged;
                });
              });
            });
            if (unbound) {
              unmappedTargets.push({
                dayId: day.id,
                reason: 'Structural replacement includes unbound members',
              });
              continue;
            }
            record(day, day.id, 'sections', day.sections, replacement.sections);
            day.sections = replacement.sections;
            clearDayStructuralException(metadata, day.id);
          } else {
            for (const next of nextExercises) {
              const original = sourceExercises.find(e => e.id === next.id)!;
              const tid = binding(source.id, next.id)?.templateElementId;
              const current = exercises(day).find(
                e => e.id === (tid ? targetId(day.id, tid) : undefined)
              );
              if (!current) {
                unmappedTargets.push({
                  dayId: day.id,
                  reason: 'Exercise not bound',
                });
                continue;
              }
              for (const field of Array.from(new Set([...Object.keys(original), ...Object.keys(next)])) as (keyof ProgramExercise)[]) {
                if (
                  field === 'id' ||
                  JSON.stringify(original[field]) ===
                    JSON.stringify(next[field])
                )
                  continue;
                if (
                  !isIncluded(day.id, current.id, field) &&
                  hasException(day.id, tid!, field)
                ) {
                  preservedExceptions.push({
                    dayId: day.id,
                    elementId: current.id,
                    selectionId: selectionId(day.id, current.id, field),
                    reason: `Preserved ${field} exception`,
                  });
                  continue;
                }
                record(day, current.id, field, current[field], next[field]);
                (current as unknown as Record<string, unknown>)[field] = clone(
                  next[field]
                );
                updateException(
                  metadata,
                  day.id,
                  tid!,
                  field,
                  context.scope,
                  isIncluded(day.id, current.id, field)
                );
              }
            }
          }
        } else {
          record(day, day.id, 'sections', day.sections, replacement.sections);
          day.sections = replacement.sections;
          record(day, day.id, 'title', day.title, replacement.title);
          day.title = replacement.title;
        }
        if (source.title !== edit.replacement.title) {
          const titleException = hasException(day.id, recurring!, 'title');
          if (direct || isIncluded(day.id, day.id, 'title') || !titleException) {
            if (!direct) {
              record(day, day.id, 'title', day.title, edit.replacement.title);
              day.title = edit.replacement.title;
              updateException(
                metadata,
                day.id,
                recurring!,
                'title',
                context.scope,
                isIncluded(day.id, day.id, 'title')
              );
            }
          } else {
            preservedExceptions.push({
              dayId: day.id,
              selectionId: selectionId(day.id, day.id, 'title'),
              reason: 'Preserved title exception',
            });
          }
        }
      }
    }
    if (edit.kind === 'day-content') {
      const beforeExercises = exercises(source);
      const afterExercises = exercises(edit.replacement);
      const baseline = metadata.templateDays.find(d => d.id === recurring);
      for (const before of beforeExercises) {
        const after = afterExercises.find(e => e.id === before.id);
        const templateElementId = binding(
          source.id,
          before.id
        )?.templateElementId;
        if (!templateElementId) continue;
        if (!after) {
          if (context.scope === 'occurrence')
            metadata.exceptions.push({
              kind: 'structural',
              dayId: source.id,
              templateElementId,
              reason: 'Exercise removed in this occurrence',
            });
          continue;
        }
        for (const field of new Set([
          ...Object.keys(before),
          ...Object.keys(after),
        ]) as Set<keyof ProgramExercise>) {
          if (
            field === 'id' ||
            JSON.stringify(before[field]) === JSON.stringify(after[field])
          )
            continue;
          if (context.scope === 'occurrence')
            updateException(
              metadata,
              source.id,
              templateElementId,
              field,
              context.scope,
              false
            );
          else {
            updateException(
              metadata,
              source.id,
              templateElementId,
              field,
              context.scope,
              true
            );
          }
          if (context.scope === 'routine-day' && baseline) {
            const baseExercise = exercises(baseline).find(
              e => e.id === templateElementId
            );
            if (baseExercise) {
              if (after[field] === undefined)
                delete (baseExercise as unknown as Record<string, unknown>)[
                  field
                ];
              else
                (baseExercise as unknown as Record<string, unknown>)[field] =
                  clone(after[field]);
            }
          }
        }
      }
      const topology = (d: ProgramDay) =>
        JSON.stringify(
          d.sections.map(s => ({
            id: s.id,
            type: s.type,
            name: s.name,
            groups: s.groups.map(g => ({
              id: g.id,
              type: g.type,
              notes: g.notes,
              ids: g.exercises.map(e => e.id),
            })),
          }))
        );
      if (topology(source) !== topology(edit.replacement)) {
        if (context.scope === 'occurrence')
          metadata.exceptions.push({
            kind: 'structural',
            dayId: source.id,
            reason: 'Sections or grouping edited in this occurrence',
          });
        else if (baseline) {
          const oldBaseline = clone(baseline);
          baseline.sections = edit.replacement.sections.map(section => ({
            ...section,
            id: binding(source.id, section.id)?.templateElementId ?? section.id,
            groups: section.groups.map(group => ({
              ...group,
              id: binding(source.id, group.id)?.templateElementId ?? group.id,
              exercises: group.exercises.map(e => {
                const tid = binding(source.id, e.id)?.templateElementId ?? e.id;
                return {
                  ...(exercises(oldBaseline).find(x => x.id === tid) ?? e),
                  id: tid,
                };
              }),
            })),
          }));
          clearDayStructuralException(metadata, source.id);
        }
      }
      if (context.scope === 'routine-day' && source.title !== edit.replacement.title) {
        updateException(metadata, source.id, recurring!, 'title', context.scope, true);
      }
    }
    if (edit.kind === 'day-content' && context.scope === 'routine-day') {
      const sourceBindings = [...metadata.elementBindings];
      const templateFor = (id: string) => sourceBindings.find(b => b.occurrenceDayId === source.id && b.occurrenceElementId === id)?.templateElementId ?? id;
      for (const target of days.filter(d => changedDays.has(d.id))) {
        const bindGenerated = (sourceId: string, kind: 'section' | 'group' | 'exercise', actualIds: string[]) => {
          const templateElementId = templateFor(sourceId);
          const mapped = sourceBindings.find(b => b.occurrenceDayId === target.id && b.templateElementId === templateElementId)?.occurrenceElementId;
          const actualId = [mapped, target.id === source.id ? sourceId : `${sourceId}:${target.id}`].find(id => id && actualIds.includes(id));
          if (!actualId) return;
          metadata.elementBindings = metadata.elementBindings.filter(b => !(b.occurrenceDayId === target.id && b.kind === kind && b.templateElementId === templateElementId));
          metadata.elementBindings.push({occurrenceDayId:target.id,occurrenceElementId:actualId,templateElementId,kind});
        };
        for (const section of edit.replacement.sections) {
          bindGenerated(section.id, 'section', target.sections.map(s => s.id));
          for (const group of section.groups) {
            bindGenerated(group.id, 'group', target.sections.flatMap(s => s.groups.map(g => g.id)));
            for (const exercise of group.exercises) bindGenerated(exercise.id, 'exercise', exercises(target).map(e => e.id));
          }
        }
      }
    }
    if (edit.kind === 'day-content') {
      for (const day of days.filter(d => changedDays.has(d.id))) {
        const originalDay = initialDays.find(d => d.id === day.id);
        if (!originalDay) continue;
        for (const original of exercises(originalDay)) {
          const templateElementId = initialBindings.find(
            b => b.occurrenceDayId === day.id && b.occurrenceElementId === original.id && b.kind === 'exercise'
          )?.templateElementId;
          if (!templateElementId) continue;
          const currentBinding = metadata.elementBindings.find(
            b => b.occurrenceDayId === day.id && b.templateElementId === templateElementId && b.kind === 'exercise'
          );
          const current = currentBinding && exercises(day).find(e => e.id === currentBinding.occurrenceElementId);
          if (
            !current ||
            (original.name === current.name && original.canonicalExerciseId === current.canonicalExerciseId)
          ) continue;
          current.id = crypto.randomUUID();
          currentBinding.occurrenceElementId = current.id;
        }
      }
    }
    for (const day of days.filter(d => changedDays.has(d.id))) {
      const old = program.overrides.find(
        o => o.scope === 'day' && o.dayId === day.id
      );
      program.overrides = program.overrides.filter(
        o => o.scope !== 'day' || o.dayId !== day.id
      );
      program.overrides.push({
        id: old?.id ?? crypto.randomUUID(),
        scope: 'day',
        dayId: day.id,
        programId: program.id,
        replacement: day,
        createdAt: old?.createdAt ?? new Date().toISOString(),
        reason: 'Reviewed routine edit',
      });
    }
    if (context.scope === 'routine-day' && recurring) {
      const baseline = metadata.templateDays.find(d => d.id === recurring);
      if (baseline) {
        if (edit.kind === 'day-content' && source.title !== edit.replacement.title)
          baseline.title = edit.replacement.title;
        if (
          edit.kind === 'exercise-fields' ||
          edit.kind === 'exercise-replacement'
        ) {
          const e = exercises(baseline).find(e => e.id === lineage);
          if (e) {
            const fields =
              edit.kind === 'exercise-fields' ? edit.fields : edit.exercise;
            for (const [key, value] of Object.entries(fields)) {
              if (key === 'id') continue;
              if (value === null)
                delete (e as unknown as Record<string, unknown>)[key];
              else
                (e as unknown as Record<string, unknown>)[key] = clone(value);
            }
          }
        } else if (edit.kind === 'grouping') {
          const section = baseline.sections.find(s => s.id === lineage);
          if (section) {
            const members = exercises(baseline);
            section.groups = edit.groups.map(g => ({
              id: binding(source.id, g.id)?.templateElementId ?? g.id,
              type: g.type,
              notes: g.notes,
              exercises: g.exerciseIds.map(id =>
                members.find(
                  e => e.id === binding(source.id, id)?.templateElementId
                )!
              ),
            }));
          }
        }
      }
    }
  }
  return {
    proposedDocument: program,
    changes,
    preservedExceptions,
    unmappedTargets,
    validationResults: [...corrections, ...validateProgram(program)],
    sourceRevision: programRevision(input),
    completionRevision: completionRevision(context.logs),
    edit,
    context,
  };
}
function updateException(
  metadata: ProgramEditingMetadata,
  dayId: string,
  templateElementId: string,
  field: string,
  scope: EditScope,
  included: boolean
) {
  if (scope === 'routine-day') {
    if (included)
      metadata.exceptions = metadata.exceptions.filter(
        e =>
          !(
            e.dayId === dayId &&
            e.templateElementId === templateElementId &&
            e.kind === 'field' &&
            e.field === field
          )
      );
    return;
  }
  if (field === 'groups') {
    metadata.exceptions.push({
      kind: 'structural',
      dayId,
      templateElementId,
      reason: 'Grouping edited in this occurrence',
    });
    return;
  }
  if (
    !metadata.exceptions.some(
      e =>
        e.dayId === dayId &&
        e.templateElementId === templateElementId &&
        e.kind === 'field' &&
        e.field === field
    )
  )
    metadata.exceptions.push({
      kind: 'field',
      dayId,
      templateElementId,
      field: field as import('./editTypes').EditingFieldException['field'],
      reason: 'Edited this occurrence',
    });
}
function clearDayStructuralException(
  metadata: ProgramEditingMetadata,
  dayId: string,
  templateElementId?: string
) {
  metadata.exceptions = metadata.exceptions.filter(
    exception =>
      !(
        exception.kind === 'structural' &&
        exception.dayId === dayId &&
        (!exception.templateElementId ||
          !templateElementId ||
          exception.templateElementId === templateElementId)
      )
  );
}
export function applyProgramEdit(
  program: ProgramDocument,
  preview: ProgramEditPreview
): ProgramDocument {
  if (programRevision(program) !== preview.sourceRevision)
    throw new Error('Program changed since preview');
  return clone(preview.proposedDocument);
}
