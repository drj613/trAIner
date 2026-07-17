// Shared warning/resolution path builders for the import domain.
//
// Every exercise-level ImportWarning path and every resolution lookup key
// MUST be built through these functions. Hand-built template strings drift
// apart (e.g. array index vs. declared day number) and silently break the
// warning-path <-> resolution-path contract.

// A day's TEMPLATE identity for path building. `templateWeek` is the
// EXPLICIT week the input declared for this day (`day.week`/`day.weekNumber`
// at parse time), NOT the week a day was expanded into. A day with no
// explicit week is a "base" template: expandDays clones it across every
// week of the routine, and every clone must resolve to the SAME path so one
// resolution patches all of its week-clones (mechanical-expansion sharing).
// A day that DOES carry an explicit input week is its own distinct
// template — two days that share a dayNumber but declare different
// explicit weeks (a flat week-tagged day list, no top-level `weeks`) must
// never collide on the same path. Keep this in sync with any base/override
// day segment format — hand-rolled variants drift and silently corrupt
// resolution application.
function dayPathSegment(dayNumber: number, templateWeek: number | undefined): string {
  return templateWeek !== undefined ? `${dayNumber}@w${templateWeek}` : `${dayNumber}`;
}

export function baseExercisePath(
  dayNumber: number,
  templateWeek: number | undefined,
  sectionIndex: number,
  groupIndex: number,
  exerciseIndex: number,
): string {
  return `days.${dayPathSegment(dayNumber, templateWeek)}.sections.${sectionIndex}.groups.${groupIndex}.exercises.${exerciseIndex}`;
}

// Variant resolution path: the base exercise path plus a `.variants.{v}`
// suffix, where `v` is the index into the exercise's RAW `variants` array
// (not a week number). Two variants on one exercise get distinct paths even
// when their weeks overlap. Variants inherit the base day's template identity
// via baseExercisePath, so one resolution patches every week-clone carrying
// the variant. Keep in lockstep with baseExercisePath.
export function variantExercisePath(
  dayNumber: number,
  templateWeek: number | undefined,
  sectionIndex: number,
  groupIndex: number,
  exerciseIndex: number,
  variantIndex: number,
): string {
  return `${baseExercisePath(dayNumber, templateWeek, sectionIndex, groupIndex, exerciseIndex)}.variants.${variantIndex}`;
}

// Not yet wired end-to-end (override warning propagation + override
// resolution application land in Phase 9). Defined now so the base and
// override path shapes are declared side by side from the start.
export function overrideExercisePath(
  overrideIndex: number,
  dayNumber: number,
  templateWeek: number | undefined,
  sectionIndex: number,
  groupIndex: number,
  exerciseIndex: number,
): string {
  return `overrides.${overrideIndex}.days.${dayPathSegment(dayNumber, templateWeek)}.sections.${sectionIndex}.groups.${groupIndex}.exercises.${exerciseIndex}`;
}
