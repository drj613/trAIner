// Shared warning/resolution path builders for the import domain.
//
// Every exercise-level ImportWarning path and every resolution lookup key
// MUST be built through these functions. Hand-built template strings drift
// apart (e.g. array index vs. declared day number) and silently break the
// warning-path <-> resolution-path contract.

export function baseExercisePath(
  dayNumber: number,
  sectionIndex: number,
  groupIndex: number,
  exerciseIndex: number,
): string {
  return `days.${dayNumber}.sections.${sectionIndex}.groups.${groupIndex}.exercises.${exerciseIndex}`;
}

// Not yet wired end-to-end (override warning propagation + override
// resolution application land in Phase 9). Defined now so the base and
// override path shapes are declared side by side from the start.
export function overrideExercisePath(
  overrideIndex: number,
  dayNumber: number,
  sectionIndex: number,
  groupIndex: number,
  exerciseIndex: number,
): string {
  return `overrides.${overrideIndex}.days.${dayNumber}.sections.${sectionIndex}.groups.${groupIndex}.exercises.${exerciseIndex}`;
}
