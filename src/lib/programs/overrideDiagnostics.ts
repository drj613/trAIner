// Warning-only diagnostics for ProgramOverride objects. These NEVER reject,
// delete, or mutate an override — they only explain what will happen when it
// is (or isn't) applied by getRenderableDays (see ./overrides.ts).
//
// Shared by two callers so the detection logic lives in exactly one place:
//  - import/parser.ts (import-time): diagnoses overrides as they're parsed,
//    against the EXPANDED day set (see effectiveWeeks note below).
//  - overrideDiagnostics.ts's own diagnoseProgramOverrides (runtime): re-runs
//    the same checks against an already-stored ProgramDocument, with no
//    migration and no mutation — a pure read of program.days/program.overrides.
import { effectiveWeekNumber, isRestDay } from "./domain";
import { getOverrideReplacementDays } from "./overrides";
import type { ImportWarning, ProgramDay, ProgramDocument, ProgramOverride } from "./types";

export type OverrideDiagnosticsContext = {
  // The routine's full day set AFTER weekly expansion. Effective weeks and
  // "does this day number exist in the base template" checks must be
  // computed from this set, never from the raw pre-expansion base template
  // or a scalar lengthWeeks — expansion is what actually determines which
  // weeks/days exist to be overridden.
  expandedDays: ProgramDay[];
  effectiveWeeks: Set<number>;
};

// Effective weeks MUST be derived from effectiveWeekNumber(day) applied to
// each EXPANDED day, not from a raw base day's own (often absent) weekNumber
// and not from day.weekNumber accessed directly.
export function buildEffectiveWeeks(expandedDays: ProgramDay[]): Set<number> {
  return new Set(expandedDays.map((day) => effectiveWeekNumber(day)));
}

// Diagnoses a single override, pushing zero or more warnings into `warnings`.
// Pure: never mutates `override`, `context.expandedDays`, or `warnings`
// beyond appending. `pathPrefix` lets callers key warnings consistently with
// their own conventions (import uses an override index; runtime diagnostics
// use the override's stored id).
export function diagnoseOverride(
  override: ProgramOverride,
  context: OverrideDiagnosticsContext,
  pathPrefix: string,
  warnings: ImportWarning[],
): void {
  const { expandedDays, effectiveWeeks } = context;

  if (override.scope === "day") {
    const hasUsableDayId = !!override.dayId && expandedDays.some((day) => day.id === override.dayId);
    if (!hasUsableDayId) {
      warnings.push({
        path: pathPrefix,
        message:
          "Imported day-scope overrides cannot be applied without a matching internal routine day. Use a week override with replacement day objects instead.",
      });
    }
    return;
  }

  // scope === "week"
  if (override.weekNumber === undefined) {
    warnings.push({
      path: pathPrefix,
      message: "A week override is missing `weekNumber` and cannot be applied.",
    });
    return;
  }

  const weekNumber = override.weekNumber;
  const replacementDays = getOverrideReplacementDays(override);

  if (replacementDays.length === 0) {
    warnings.push({
      path: pathPrefix,
      message: `Week ${weekNumber} override contains no replacement days. The base weekly template will be used unchanged.`,
    });
  }

  if (!effectiveWeeks.has(weekNumber)) {
    warnings.push({
      path: pathPrefix,
      message: `Week ${weekNumber} override does not match any week represented by this routine and will not be applied.`,
    });
  }

  const baseDayNumbers = new Set(expandedDays.map((day) => day.dayNumber));
  for (const replacementDay of replacementDays) {
    if (!baseDayNumbers.has(replacementDay.dayNumber)) {
      warnings.push({
        path: pathPrefix,
        message: `Week ${weekNumber} override references Day ${replacementDay.dayNumber}, which does not exist in the base weekly template. That replacement will not be applied.`,
      });
    } else if (isRestDay(replacementDay)) {
      // Neutral wording — a sections:[] replacement day may deliberately be
      // a deliberate rest/deload day. This is informational, not a rejection.
      warnings.push({
        path: pathPrefix,
        message: `Week ${weekNumber}, Day ${replacementDay.dayNumber} replaces the base workout with an empty or rest day. Confirm that this is intentional.`,
      });
    }
  }
}

// Import-time entry point: diagnoses every parsed override against the
// expanded day set, appending warnings into the shared import warnings
// collection (never a local, discarded array).
export function diagnoseImportOverrides(
  overrides: ProgramOverride[],
  expandedDays: ProgramDay[],
  warnings: ImportWarning[],
): void {
  const effectiveWeeks = buildEffectiveWeeks(expandedDays);
  overrides.forEach((override, index) => {
    diagnoseOverride(override, { expandedDays, effectiveWeeks }, `overrides.${index}`, warnings);
  });
}

// Runtime entry point (10.5): re-runs the SAME diagnostics against an
// already-stored ProgramDocument. Pure — no migration, no mutation, safe to
// call repeatedly (e.g. from rendering/analysis code) on previously-imported
// or hand-edited routines.
export function diagnoseProgramOverrides(program: ProgramDocument): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  const effectiveWeeks = buildEffectiveWeeks(program.days);
  for (const override of program.overrides) {
    diagnoseOverride(override, { expandedDays: program.days, effectiveWeeks }, `overrides.${override.id}`, warnings);
  }
  return warnings;
}
