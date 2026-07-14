import type { ProgramDay, ProgramDocument, ProgramOverride } from "./types";
import { effectiveWeekNumber } from "./domain";

export function dedupOverrides(
  overrides: ProgramOverride[],
  incoming: ProgramOverride,
): ProgramOverride[] {
  return overrides.filter((o) => {
    if (o.scope !== incoming.scope) return true;
    if (incoming.scope === "day") return o.dayId !== incoming.dayId;
    return o.weekNumber !== incoming.weekNumber;
  });
}

// Normalizes an override's replacement for TRAVERSAL only — a single-day
// replacement is wrapped in a one-element array so callers can iterate
// uniformly. This never rewrites the stored shape: a single replacement
// stays single, an array replacement stays an array, on the override object
// itself.
export function getOverrideReplacementDays(override: ProgramOverride): ProgramDay[] {
  return Array.isArray(override.replacement) ? override.replacement : [override.replacement];
}

export function getRenderableDays(program: ProgramDocument): ProgramDay[] {
  // M5: apply week-scope overrides first, then day-scope so day-level wins
  const sorted = [...program.overrides].sort((a, b) => {
    const rank = (scope: string) => (scope === "day" ? 1 : 0);
    return rank(a.scope) - rank(b.scope);
  });
  return sorted.reduce((days, override) => applyOverride(days, override), program.days);
}

function applyOverride(days: ProgramDay[], override: ProgramOverride): ProgramDay[] {
  const replacements = getOverrideReplacementDays(override);

  if (override.scope === "week" && override.weekNumber !== undefined) {
    return days.map((day) => {
      // Match on the EFFECTIVE week (a day with no explicit weekNumber is week 1),
      // consistent with overrideDiagnostics — otherwise a valid week-1 override on a
      // single-week import (base day carries no weekNumber) is diagnosed applicable
      // but silently never rendered.
      if (effectiveWeekNumber(day) !== override.weekNumber) return day;
      const match = replacements.find((replacement) => replacement.dayNumber === day.dayNumber);
      // Preserve the slot's structural identity (id + week/day placement); the override only supplies content.
      return match ? { ...match, id: day.id, weekNumber: day.weekNumber, dayNumber: day.dayNumber } : day;
    });
  }

  if (override.scope === "day" && override.dayId) {
    return days.map((day) =>
      day.id === override.dayId
        ? { ...replacements[0], id: day.id, weekNumber: day.weekNumber, dayNumber: day.dayNumber }
        : day
    );
  }

  return days;
}
