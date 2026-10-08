import { useEffect, useMemo, useRef, useState } from "react";
import { emptyTags, type ImportWarning, type ProgramDay, type ProgramDocument, type ProgramExercise, type ProgramGroup } from "@/lib/programs/types";
import { getRenderableDays } from "@/lib/programs/overrides";
import { applyProgramEdit, previewProgramEdit, type EditScope, type ProgramEdit, type ProgramEditContext, type ProgramEditPreview } from "@/lib/programs/edits";
import { ImportWarnings } from "./ImportWarnings";
import { EditScopeControl } from "@/components/workout/EditScopeControl";
import { EditImpactPreview } from "@/components/workout/EditImpactPreview";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import { toTitleCase } from "@/lib/catalog/normalize";
import { moveItem } from "@/lib/ui/reorder";

type Props = {
  program: ProgramDocument;
  warnings: ImportWarning[];
  corrections: ImportWarning[];
  onChange: (program: ProgramDocument) => void;
};

export function ImportReviewEditor({ program, warnings, corrections, onChange }: Props) {
  const days = useMemo(() => getRenderableDays(program), [program]);
  const [selectedDayId, setSelectedDayId] = useState(days[0]?.id ?? "");
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewWeek, setPreviewWeek] = useState(days[0]?.weekNumber ?? 1);
  const weeks = [...new Set(days.map((day) => day.weekNumber ?? 1))].sort((a, b) => a - b);
  const previewDays = days.filter((day) => (day.weekNumber ?? 1) === previewWeek);

  const [scope, setScope] = useState<EditScope>("routine-day");
  const [operationError, setOperationError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ edit: ProgramEdit; context: ProgramEditContext; preview: ProgramEditPreview } | null>(null);
  const editOrigin = useRef<HTMLElement | null>(null);
  const reviewPanel = useRef<HTMLDivElement | null>(null);
  const editorPanel = useRef<HTMLElement | null>(null);
  const reviewing = pending !== null;
  useEffect(() => {
    if (reviewing) reviewPanel.current?.focus();
  }, [reviewing]);
  const selectedDay = days.find((day) => day.id === selectedDayId) ?? days[0];
  const templateId = program.editing?.dayBindings.find((binding) => binding.occurrenceDayId === selectedDay?.id)?.templateDayId;
  const templateOrder = program.editing?.templateDays.map((day) => day.id) ?? [];
  const templateChoices = program.editing?.templateDays ?? [];
  const occurrenceChoices = days.filter((day) => program.editing?.dayBindings.some((binding) => binding.occurrenceDayId === day.id && binding.templateDayId === templateId));

  function previewEdit(edit: ProgramEdit, editScope = scope, includeExceptionDayIds: string[] = []) {
    if (!pending) {
      const active = document.activeElement;
      const targetId = edit.kind === "exercise-fields" || edit.kind === "exercise-replacement" ? edit.exerciseId : edit.kind === "grouping" ? edit.sectionId : undefined;
      editOrigin.current = active instanceof HTMLElement && active !== document.body ? active : targetId ? document.getElementById(`import-target-${targetId}`) : editorPanel.current;
    }
    setOperationError(null);
    const context: ProgramEditContext = { scope: editScope, atImport: true, includeExceptionDayIds };
    try {
      const preview = previewProgramEdit(program, edit, context);
      setPending({ edit, context, preview });
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Could not apply this edit.");
    }
  }

  function applyPending() {
    if (!pending) return;
    onChange(applyProgramEdit(program, pending.preview));
    setPending(null);
    requestAnimationFrame(returnFocus);
  }

  function returnFocus() {
    (editOrigin.current?.isConnected ? editOrigin.current : editorPanel.current)?.focus();
  }

  function toggleExceptions(next: string[]) {
    if (!pending) return;
    previewEdit(pending.edit, pending.context.scope, next);
  }

  function editExercise(exercise: ProgramExercise, fields: Record<string, unknown>) {
    if (!selectedDay) return;
    previewEdit({ kind: "exercise-fields", dayId: selectedDay.id, exerciseId: exercise.id, fields } as ProgramEdit);
  }

  function updateGrouping(sectionId: string, groups: ProgramGroup[]) {
    if (!selectedDay) return;
    previewEdit({
      kind: "grouping", dayId: selectedDay.id, sectionId,
      groups: groups.map((group) => ({ id: group.id, type: group.type, notes: group.notes, exerciseIds: group.exercises.map((exercise) => exercise.id) })),
    });
  }

  function updateDayContent(replacement: ProgramDay) {
    if (!selectedDay) return;
    previewEdit({ kind: "day-content", dayId: selectedDay.id, replacement });
  }

  function addExercise(sectionId: string, groupId: string) {
    if (!selectedDay) return;
    const replacement = structuredClone(selectedDay);
    const section = replacement.sections.find((item) => item.id === sectionId);
    const group = section?.groups.find((item) => item.id === groupId);
    if (!group) return;
    group.exercises.push({ id: crypto.randomUUID(), name: "New exercise", sets: 3, tags: emptyTags() });
    updateDayContent(replacement);
  }

  function removeExercise(exerciseId: string) {
    if (!selectedDay) return;
    const replacement = structuredClone(selectedDay);
    for (const section of replacement.sections) for (const group of section.groups) {
      group.exercises = group.exercises.filter((exercise) => exercise.id !== exerciseId);
    }
    updateDayContent(replacement);
  }

  function moveDay(direction: -1 | 1) {
    if (!templateId) return;
    const index = templateOrder.indexOf(templateId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= templateOrder.length) return;
    const reordered = moveItem(templateOrder, index, nextIndex);
    previewEdit({ kind: "day-order", templateDayIds: reordered }, "routine-day");
  }

  function focusTarget(targetId: string, affectedWeeks?: number[]) {
    const found = days.find((day) => (!affectedWeeks?.length || affectedWeeks.includes(day.weekNumber ?? 1)) && day.sections.some((section) => section.id === targetId
      || section.groups.some((group) => group.id === targetId || group.exercises.some((exercise) => exercise.id === targetId))));
    if (found) {
      setSelectedDayId(found.id);
      setPreviewWeek(found.weekNumber ?? 1);
      setEditorOpen(true);
    }
    requestAnimationFrame(() => {
      const target = document.getElementById(`import-target-${targetId}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  if (!selectedDay) return <p className="muted">No recoverable workout days to edit.</p>;

  return (
    <div className="stack min-w-0" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      {pending && <div ref={reviewPanel} tabIndex={-1}>
        <EditImpactPreview
          preview={pending.preview}
          includeExceptionDayIds={pending.context.includeExceptionDayIds ?? []}
          onIncludeExceptionDayIdsChange={toggleExceptions}
        />
        <div className="flex gap-2">
          <button type="button" className="button secondary" onClick={() => { setPending(null); requestAnimationFrame(returnFocus); }}>Cancel</button>
          <button type="button" className="button" disabled={pending.preview.changes.length === 0} onClick={applyPending}>Apply edit</button>
        </div>
      </div>}
      <ImportWarnings warnings={warnings} corrections={corrections} onSelectTarget={focusTarget} />
      {operationError && <p role="alert" className="text-sm" style={{ color: "var(--bad, red)" }}>{operationError}</p>}
      <section className="panel stack min-w-0" aria-label="Weekly preview">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="font-bold">Weekly preview</h2>
          <label className="flex items-center gap-2 text-sm">Preview week
            <select className="input min-w-0" value={previewWeek} onChange={(event) => setPreviewWeek(Number(event.target.value))}>
              {weeks.map((week) => <option key={week} value={week}>Week {week}</option>)}
            </select>
          </label>
        </div>
        <p className="text-sm muted">Review one week at a time. Open a workout to see its exercises or edit it.</p>
        {previewDays.map((day) => {
          const exercises = day.sections.flatMap((section) => section.groups.flatMap((group) => group.exercises));
          return <article key={day.id} className="rounded border p-3 min-w-0">
            <button type="button" aria-label={`Select ${dayLabel(day)}${day.weekNumber ? ` week ${day.weekNumber}` : ""}`} className="w-full text-left flex flex-wrap justify-between items-center gap-2" onClick={() => {
              setSelectedDayId(day.id);
              setEditorOpen(true);
              requestAnimationFrame(() => editorPanel.current?.focus());
            }}>
              <span className="text-sm font-semibold min-w-0" style={{ overflowWrap: "anywhere" }}>{dayLabel(day)}</span>
              <span className="text-xs muted">{exercises.length} {exercises.length === 1 ? "exercise" : "exercises"} · Edit workout →</span>
            </button>
            <details className="mt-2">
              <summary className="text-xs muted cursor-pointer">View exercises</summary>
              <ul className="stack mt-2" style={{ gap: 4 }}>
                {exercises.map((exercise) => <li key={exercise.id} className="flex flex-wrap justify-between gap-2 text-sm min-w-0">
                  <span style={{ overflowWrap: "anywhere" }}>{exercise.name}</span>
                  <span className="text-xs muted">{exercise.sets ?? 3} sets × {exercise.reps ?? "reps unspecified"}</span>
                </li>)}
              </ul>
            </details>
          </article>;
        })}
      </section>
      {editorOpen && <section ref={editorPanel} tabIndex={-1} className="panel stack min-w-0" aria-label="Workout editor">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="font-bold">Edit workout</h2>
          <button type="button" className="button secondary" disabled={pending !== null} onClick={() => setEditorOpen(false)}>Done editing</button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="stack text-sm min-w-0" style={{ gap: 4, maxWidth: "100%" }}>
            Template workout
            <select className="input min-w-0" value={templateId ?? ""} onChange={(event) => {
              const day = days.find((item) => program.editing?.dayBindings.some((binding) => binding.occurrenceDayId === item.id && binding.templateDayId === event.target.value && (item.weekNumber === 1 || item.weekNumber === undefined)));
              if (day) setSelectedDayId(day.id);
            }}>
              {templateChoices.map((day) => <option key={day.id} value={day.id}>{dayLabel(day)}</option>)}
            </select>
          </label>
          <label className="stack text-sm min-w-0" style={{ gap: 4, maxWidth: "100%" }}>
            Week
            <select className="input" value={selectedDay.id} onChange={(event) => setSelectedDayId(event.target.value)}>
              {occurrenceChoices.map((day) => <option key={day.id} value={day.id}>{day.weekNumber ? `Week ${day.weekNumber}` : "Single week"}</option>)}
            </select>
          </label>
          <EditScopeControl scope={scope} title={selectedDay.title} dayNumber={selectedDay.dayNumber} atImport onChange={(next) => { if (next) setScope(next); }} />
          <div className="ml-auto flex gap-2">
            <button type="button" className="button secondary" aria-label="Move workout earlier" disabled={!templateId || templateOrder.indexOf(templateId) <= 0} onClick={() => moveDay(-1)}>Move up</button>
            <button type="button" className="button secondary" aria-label="Move workout later" disabled={!templateId || templateOrder.indexOf(templateId) >= templateOrder.length - 1} onClick={() => moveDay(1)}>Move down</button>
          </div>
        </div>

        <h2 className="font-bold">{dayLabel(selectedDay)}{selectedDay.weekNumber ? ` · Week ${selectedDay.weekNumber}` : ""}</h2>
        {selectedDay.sections.map((section) => (
          <section id={`import-target-${section.id}`} tabIndex={-1} key={section.id} className="stack rounded border p-3">
            <h3 className="font-semibold">{section.name}</h3>
            {section.groups.map((group) => (
              <div id={`import-target-${group.id}`} tabIndex={-1} key={group.id} className="stack rounded border p-2">
                <label className="text-sm">Group type
                  <select className="input ml-2" value={group.type} onChange={(event) => updateGrouping(section.id, section.groups.map((item) => item.id === group.id ? { ...item, type: event.target.value as ProgramGroup["type"] } : item))}>
                    <option value="single">Single</option><option value="superset">Superset</option><option value="circuit">Circuit</option><option value="giant-set">Giant set</option>
                  </select>
                </label>
                {group.exercises.map((exercise) => (
                  <ExerciseEditor key={exercise.id} exercise={exercise} groups={section.groups} onFields={(fields) => editExercise(exercise, fields)} onRemove={() => removeExercise(exercise.id)} onGroupChange={(groupId) => {
                    updateGrouping(section.id, section.groups.map((item) => ({
                      ...item,
                      exercises: item.id === groupId ? [...item.exercises, exercise] : item.exercises.filter((member) => member.id !== exercise.id),
                    })));
                  }} />
                ))}
                <button type="button" className="button secondary self-start" onClick={() => addExercise(section.id, group.id)}>Add exercise</button>
                <button type="button" className="button secondary self-start" onClick={() => updateGrouping(section.id, [...section.groups, { id: `group-${Date.now()}`, type: "single", exercises: [] }])}>Add group</button>
              </div>
            ))}
          </section>
        ))}
      </section>}

    </div>
  );
}

function ExerciseEditor({ exercise, groups, onFields, onRemove, onGroupChange }: {
  exercise: ProgramExercise;
  groups: ProgramGroup[];
  onFields: (fields: Record<string, unknown>) => void;
  onRemove: () => void;
  onGroupChange: (groupId: string) => void;
}) {
  const [name, setName] = useState(exercise.name);
  const [sets, setSets] = useState(String(exercise.sets ?? 3));
  const [reps, setReps] = useState(exercise.reps ?? "");
  const [catalogQuery, setCatalogQuery] = useState("");
  const catalogMatches = exerciseCatalog.filter((item) => toTitleCase(item.name).toLowerCase().includes(catalogQuery.toLowerCase())).slice(0, 30); // Exact concrete metadata lookup; grouping is intentionally not performed here.
  const chosenExercise = exerciseCatalog.find((item) => item.id === exercise.canonicalExerciseId); // Exact concrete metadata lookup; grouping is intentionally not performed here.
  if (chosenExercise && !catalogMatches.some((item) => item.id === chosenExercise.id)) catalogMatches.unshift(chosenExercise);
  useEffect(() => {
    setName(exercise.name);
    setSets(String(exercise.sets ?? 3));
    setReps(exercise.reps ?? "");
  }, [exercise.id, exercise.name, exercise.sets, exercise.reps]);

  return (
    <div id={`import-target-${exercise.id}`} tabIndex={-1} className="grid min-w-0 gap-2 rounded border p-2 md:grid-cols-[minmax(12rem,2fr)_5rem_minmax(7rem,1fr)_minmax(8rem,1fr)_auto]">
      <label className="text-xs muted">Exercise name
        <input className="input mt-1 w-full" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== exercise.name) onFields({ name, canonicalExerciseId: null }); }} />
        <input aria-label="Search exercise catalog" className="input mt-1 w-full" value={catalogQuery} placeholder="Search catalog to match…" onChange={(event) => setCatalogQuery(event.target.value)} />
        <select aria-label="Choose catalog exercise" className="input mt-1 w-full" value={exercise.canonicalExerciseId ?? ""} onChange={(event) => {
          const item = exerciseCatalog.find((candidate) => candidate.id === event.target.value); // Exact concrete metadata lookup; grouping is intentionally not performed here.
          if (item) { setName(toTitleCase(item.name)); onFields({ name: item.name, canonicalExerciseId: item.id }); }
        }}>
          <option value="">Custom name / no catalog match</option>
          {catalogMatches.map((item) => <option key={item.id} value={item.id}>{toTitleCase(item.name)}</option>)}
        </select>
      </label>
      <label className="text-xs muted">Sets
        <input className="input mt-1 w-full" type="number" min={1} step={1} value={sets} onChange={(event) => setSets(event.target.value)} onBlur={() => { const value = sets === "" ? null : Number(sets); if (value !== (exercise.sets ?? 3)) onFields({ sets: value }); }} />
      </label>
      <label className="text-xs muted">Reps
        <input className="input mt-1 w-full" value={reps} placeholder="8-12, 30 sec, AMRAP" onChange={(event) => setReps(event.target.value)} onBlur={() => { if (reps !== (exercise.reps ?? "")) onFields({ reps: reps || null }); }} />
      </label>
      <label className="text-xs muted">Group membership
        <select className="input mt-1 w-full" value={groups.find((group) => group.exercises.some((member) => member.id === exercise.id))?.id} onChange={(event) => onGroupChange(event.target.value)}>
          {groups.map((group, index) => <option key={group.id} value={group.id}>Group {index + 1} ({group.type})</option>)}
        </select>
      </label>
      <button type="button" className="button secondary self-end" onClick={onRemove}>Remove</button>
    </div>
  );
}

function dayLabel(day: ProgramDay): string {
  return day.title.trim() || `Day ${day.dayNumber}`;
}
